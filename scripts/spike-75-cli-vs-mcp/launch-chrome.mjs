#!/usr/bin/env node
/**
 * Card #75 spike probe — launcher.
 *
 * Starts a LIVE Chrome session running the unpacked gTabs extension (dist/) on
 * a remote-debugging port so playwright-cli and chrome-devtools-mcp can attach
 * to it (--cdp / --browserUrl). Keeps running until killed (Ctrl-C).
 *
 * Usage:
 *   node scripts/spike-75-cli-vs-mcp/launch-chrome.mjs [--port 9222]
 *
 * This is a throwaway probe artifact. No merge, no main changes.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', '..', 'dist');
const portArg = process.argv.indexOf('--port');
const DEBUG_PORT = portArg >= 0 ? Number(process.argv[portArg + 1]) : 9222;

const ctx = await chromium.launchPersistentContext('', {
  headless: true,
  channel: 'chromium', // required: headless-shell cannot load extensions
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-sandbox',
    `--remote-debugging-port=${DEBUG_PORT}`,
  ],
});

console.log('[launch] persistent context up, debugging port', DEBUG_PORT);
console.log('[launch] dist path', DIST);

// Seed a couple of real tabs.
for (const url of ['https://example.com', 'https://httpbin.org/html']) {
  await ctx.newPage();
  await ctx.pages().at(-1).goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
}

// Give the extension SW an instant to register.
await new Promise((r) => setTimeout(r, 1500));
const sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
console.log('[launch] extension SW:', sw ? sw.url() : '(none yet)');
console.log('[launch] open tabs:', ctx.pages().map((p) => p.url()).join(' | '));

// Keep alive for the probe session. Ctrl-C to exit.
await new Promise(() => {}).catch(() => {});
process.on('SIGINT', async () => { await ctx.close(); process.exit(0); });
process.on('SIGTERM', async () => { await ctx.close(); process.exit(0); });