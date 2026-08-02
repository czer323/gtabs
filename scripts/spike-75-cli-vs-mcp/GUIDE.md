# GUIDE — troubleshooting a live gTabs session with playwright-cli

**Tool:** `@playwright/cli` (pinned `0.1.17`) · **Job:** interactive troubleshooting of a live Chrome session running the gTabs extension · **Source:** card #75 spike (scripts/spike-75-cli-vs-mcp/), everything below was executed and verified on 2026-08-02 against Chrome for Testing 151 + Playwright 1.62.1 on the TrueNAS Linux host (no display).

This is the human+agent guide: every command is a plain terminal command a human can type, and the same commands are what an agent runs (via its shell/skill tooling). `playwright-cli` is a distinct package from `@playwright/test` — installing it does not touch the regression runner.

---

## 0. Setup

```bash
# pin the CLI (repo devDep once adopted)
npm i -D --save-exact @playwright/cli@0.1.17

# build the extension so dist/ exists (absolute path needed for --load-extension)
npm run build

# start ONE live Chrome session with gTabs loaded + remote debugging enabled
# (validated recipe from spikes #67/#73; scripts/spike-75-cli-vs-mcp/launch-chrome.mjs)
node scripts/spike-75-cli-vs-mcp/launch-chrome.mjs --port 9222
```

The launcher uses the validated recipe: persistent context, `headless:true`, `channel:'chromium'` (headless-shell can't load extensions), `--disable-extensions-except=<abs dist>`, `--load-extension=<abs dist>`, `--no-sandbox` (host requirement), `--remote-debugging-port=9222`. It seeds a couple of real tabs.

## 1. Attach to the live session

```bash
npx playwright-cli attach --cdp=http://127.0.0.1:9222
# → Session `default` created, attached to http://127.0.0.1:9222
#   ### Open tabs (0: [Example Domain](https://example.com/) …)

npx playwright-cli tab-list     # list tabs at any time
npx playwright-cli detach       # leave the browser running, drop the connection
```

The CLI runs a daemon that connects over CDP; the browser keeps running, cookies/state preserved. Session is `default`; use `-s=name` for separate sessions.

## 2. Reach the extension service worker

The SW is **not** in `tab-list` (page targets only). Use the documented `run-code` escape hatch with the standard Playwright API — `page.context().serviceWorkers()` works because the daemon is CDP-attached to the live browser:

```bash
npx playwright-cli run-code "async page => {
  const sw = page.context().serviceWorkers()[0];
  return await sw.evaluate(() => chrome.tabs.query({}).then(ts => ts.map(t => t.url)));
}"
# → ["about:blank","https://example.com/","https://httpbin.org/html", ...]
```

Any `chrome.*` API works inside `sw.evaluate(...)` (this is the MV3 extension context). The worker is re-fetched on every call, so a suspended SW (MV3 idle-suspend after ~30s) is a non-event: re-run the command and it just works — no recovery dance.

## 3. Open / inspect / click the popup

The popup is an extension page; open it as a normal tab (this works with `tab-new`, unlike Axi's `open` which Chromium blocked):

```bash
# extension id from the SW URL: new URL(sw.url()).host  (deterministic per abs dist path)
npx playwright-cli tab-new "chrome-extension://ncgmjeempkfjoeepjhicnljkgeocjkmf/popup.html"

npx playwright-cli snapshot      # YAML a11y tree with element refs, e.g. button "Organize all tabs" [ref=e7]
npx playwright-cli click e7      # click by ref
npx playwright-cli snapshot      # re-snapshot; state changes visible (e.g. "service is not running")
```

Snapshots are written to `.playwright-cli/*.yml`; stdout prints a summary + the file link, so the agent reads only what it needs. Refs (`e7`) are per-snapshot — after any DOM change, take a fresh snapshot before clicking.

## 4. Drive tabs

```bash
npx playwright-cli tab-list                    # indexed list
npx playwright-cli tab-new "https://example.org"
npx playwright-cli tab-select 0                # switch by index
npx playwright-cli tab-close 4                 # close by index
```

**Grouping** has no native command — use the SW route (chrome.tabs is extension-only):

```bash
npx playwright-cli run-code "async page => {
  const sw = page.context().serviceWorkers()[0];
  return await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const ids = tabs.filter(t => t.url && t.url.startsWith('http')).map(t => t.id);
    const gid = await chrome.tabs.group({ tabIds: ids });
    return JSON.stringify({ gid, groups: (await chrome.tabGroups.query()).map(g => g.id) });
  });
}"
```

**Query** chrome.tabs from the popup page (extension pages expose chrome.tabs) with plain `eval`:

```bash
npx playwright-cli eval "async () => { const tabs = await chrome.tabs.query({}); return JSON.stringify(tabs.length); }"
```

## 5. Console + network

```bash
# page console
npx playwright-cli console                 # all since load; console 1 for >=warn

# page network — list then detail
npx playwright-cli requests --static       # note: --static to include document requests
npx playwright-cli request 1               # headers/status/duration of request #1

# SW console (on-demand capture): attach a worker console listener inside run-code
npx playwright-cli run-code "async page => {
  const sw = page.context().serviceWorkers()[0];
  const msgs = [];
  sw.on('console', m => msgs.push('[' + m.type() + '] ' + m.text()));
  await sw.evaluate(() => console.log('probe from SW'));
  await page.waitForTimeout(500);
  return JSON.stringify(msgs);
}"
# → ["[log] probe from SW"]
```

Caveat (verified): SW *network* request events do not fire through CDP attach — you can make a fetch from the SW and get its status, but you won't see the request event stream. Page console/network are fully covered.

## 6. Recover from failures

```bash
# missed selector / stale ref
npx playwright-cli click e99
# → Error: Ref e99 not found in the current page snapshot. Try capturing new snapshot.
npx playwright-cli snapshot   # fresh refs → retry. Session intact.

# suspended SW: nothing to do — the next run-code re-fetches the worker.
# detach/re-attach anytime: detach leaves the browser running.
```

## Human-loop notes

- Everything above is typed in a terminal by a human — no MCP client, no config file. `npx playwright-cli --help` is complete and grouped (Core / Navigation / Keyboard / Tabs / Storage / Network / DevTools / Sessions); `npx playwright-cli <cmd> --help` gives per-command details.
- Agents: `playwright-cli install --skills` installs the bundled skill (SKILL.md + references) for Claude Code-style agents; or just point the agent at `playwright-cli --help` and let it discover.
- Session management: `playwright-cli list`, `close-all`, `kill-all`, `delete-data`; `PLAYWRIGHT_CLI_SESSION=name` to pick a session.

## Non-standard things in this guide, and why

- `run-code` for SW access: documented as the escape hatch for "advanced scenarios not covered by CLI commands" (it takes a Playwright code function). Using `page.context().serviceWorkers()` is the standard Playwright API; nothing custom in the server or protocol.
- `--remote-debugging-port` in the launcher: required for external CDP attach (standard for CDP tooling).
- Extension-id string in commands: deterministic per absolute dist path — extract at runtime from the SW URL (`new URL(sw.url()).host`) rather than hardcoding.
