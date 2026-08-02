#!/usr/bin/env node
/**
 * Card #75 spike probe — minimal MCP client.
 *
 * Talks MCP (JSON-RPC 2.0 over stdio) to a spawned chrome-devtools-mcp server
 * and executes a sequence of tool calls, printing each result. This is the
 * STANDARD MCP client role (initialize -> tools/list -> tools/call), written
 * by hand only because the harness MCP gateway (bifrost) is out of scope for
 * this card. Nothing custom about the protocol: it is the documented MCP
 * client handshake.
 *
 * Usage:
 *   node mcp-client.mjs <server-bin> [--browserUrl http://127.0.0.1:9222] [--categoryExtensions=true] \
 *     -- tool_name '{"param": ...}' [tool_name '{"param": ...}']...
 *
 * Each arg pair is one tools/call. Output is JSON lines: {"tool":..., "out":...}
 * with the raw result text so token cost is measurable (wc -c on stdout).
 */
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const args = process.argv.slice(2);
const serverBin = args[0];
const serverArgs = [];
let toolArgs = [];
let i = 1;
let sawDoubleDash = false;
for (; i < args.length; i++) {
  if (args[i] === '--') { sawDoubleDash = true; i++; break; }
  serverArgs.push(args[i]);
}
if (sawDoubleDash) toolArgs = args.slice(i);

const child = spawn(process.execPath, [serverBin, ...serverArgs], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, CI: '1', CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' },
});

const rl = readline.createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 0;

function send(method, params) {
  const id = ++nextId;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

function textOf(content) {
  if (!Array.isArray(content)) return String(content ?? '');
  return content.map((c) => c.text ?? JSON.stringify(c)).join('\n');
}

async function main() {
  const init = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'spike-75-client', version: '0.1.0' },
  });
  await notify('notifications/initialized', {});
  console.error(`[client] initialized, server: ${init.serverInfo?.name} ${init.serverInfo?.version}`);
  const toolsRes = await send('tools/list', {});
  const tools = toolsRes.tools.map((t) => t.name);
  console.error(`[client] ${tools.length} tools available`);
  console.error('[client] extension tools:', tools.filter((t) => t.includes('extension') || t.includes('service_worker')).join(', '));

  for (let k = 0; k + 1 < toolArgs.length; k += 2) {
    const name = toolArgs[k];
    const params = toolArgs[k + 1] ? JSON.parse(toolArgs[k + 1]) : {};
    const res = await send('tools/call', { name, arguments: params });
    const out = textOf(res.content ?? []);
    console.log(JSON.stringify({ tool: name, out }));
    console.error(`[client] ---- ${name} done ----`);
  }
  child.kill('SIGTERM');
  process.exit(0);
}

main().catch((e) => { console.error('[client] FATAL', e.message); child.kill('SIGKILL'); process.exit(1); });
