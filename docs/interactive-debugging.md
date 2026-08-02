# Interactive troubleshooting with playwright-cli

**Tool:** `@playwright/cli` (pinned `0.1.17`) · **Job:** interactive troubleshooting of a live Chrome session running the gTabs extension · **Adopted:** card #76, on top of spike #75 (which chose playwright-cli over chrome-devtools-mcp for this job).

This is the human+agent guide: every command is a plain terminal command a human can type, and the same commands are what an agent runs. `@playwright/cli` is a distinct package from `@playwright/test` — it coexists with the regression runner without touching `e2e/`, `playwright.config.ts`, or the existing npm scripts.

## What this is

The CLI **hosts the browser itself** from a committed config file (`.playwright/cli.config.json`) — no external launcher, no `attach --cdp`. `npm run cli -- open` starts a persistent Chrome session that has the gTabs extension loaded, and every subsequent `npm run cli --` command drives that same session. The workflow below was executed and verified on 2026-08-02 against Chrome 151 (Playwright cache) on the TrueNAS Linux host (no display).

## 0. Setup

```bash
# build the unpacked extension so dist/ exists (required; the config loads it)
npm run build

# (fresh clone only) the CLI bundles its own playwright-core, which wants its own
# chromium revision. Reuse the browser already installed by @playwright/test, or:
npm run cli -- install-browser chromium
```

**Why `npm run cli`?** `npm run cli` invokes the pinned `@playwright/cli@0.1.17` from `node_modules` via the `cli` npm script. Don't use `npx playwright-cli`: with `node_modules` installed it resolves the same local bin, but when it is missing, npx silently fetches the **latest** `@playwright/cli` from the registry — unpinned, and possibly incompatible with the committed `.playwright/cli.config.json` schema.

The committed `.playwright/cli.config.json` lets the CLI launch **its own** browser (no external launcher) with gTabs loaded:

```json
{
  "browser": {
    "browserName": "chromium",
    "isolated": false,
    "launchOptions": {
      "channel": "chromium",
      "headless": true,
      "args": ["--disable-extensions-except=dist", "--load-extension=dist", "--no-sandbox"]
    }
  }
}
```

Key fields, each chosen for the validated recipe (spike #67/#73):

- `isolated: false` — **required.** The CLI's default browser launch is isolated (in-memory), and MV3 extensions only load in a **persistent** context. `isolated: false` sends it down the persistent-context host path (which also strips Chromium's `--disable-extensions` default) so `--load-extension` actually loads gTabs.
- `channel: "chromium"` — the full Chrome for Testing browser; the headless shell cannot load extensions.
- `headless: true` — host has no display.
- `--no-sandbox` — host requirement.
- Args use the **relative** `dist` path, which Chromium resolves against the process working directory. This is what makes the committed config **portable**: any clone works identically **as long as `npm run cli` runs from the repo root** (the normal npm-script invocation) and `dist/` has been built. `--config` or a relative `--load-extension` from a different cwd will **not** find the extension.

Run the CLI from the repo root:

```bash
# starts the persistent, gTabs-loaded browser, e.g. seeded to a page
npm run cli -- open "https://example.com"
```

(The config auto-loads from `.playwright/cli.config.json` relative to cwd — another reason to run from the repo root.)

## 1. Reach the extension service worker

The SW is **not** in `tab-list` (page targets only). Use the documented `run-code` escape hatch with the standard Playwright API — `page.context().serviceWorkers()`:

```bash
npm run cli -- run-code "async page => {
  const sw = page.context().serviceWorkers()[0];
  return await sw.evaluate(() => chrome.tabs.query({}).then(ts => ts.map(t => t.url)));
}"
# → ["about:blank","https://example.com/","chrome-extension://<id>/popup.html", ...]
```

Any `chrome.*` API works inside `sw.evaluate(...)` (the MV3 extension context). The worker is re-fetched on every call, so a suspended SW (MV3 idle-suspend after ~30s) is a non-event: re-run and it just works.

## 2. Open / inspect / click the popup

The popup is an extension page; open it as a normal tab with `tab-new`:

```bash
# extension id comes from the SW URL: new URL(sw.url()).host
# (deterministic per resolved dist path; never hardcode it — derive at runtime)
npm run cli -- tab-new "chrome-extension://<id>/popup.html"

npm run cli -- snapshot      # YAML a11y tree with element refs, e.g. button "Organize All" [ref=e7]
npm run cli -- click e7      # click by ref
npm run cli -- snapshot      # re-snapshot; state changes visible
```

Snapshots are written to `.playwright-cli/*.yml` (gitignored); stdout prints a summary + the file link, so the agent reads only what it needs. Refs (`e7`) are **per-snapshot** — after any DOM change, take a fresh snapshot before clicking.

## 3. Drive tabs

```bash
npm run cli -- tab-list                    # indexed list
npm run cli -- tab-new "https://example.org"
npm run cli -- tab-select 0                # switch by index
npm run cli -- tab-close 4                 # close by index
```

**Grouping** has no native command — use the SW route (chrome.tabs is extension-only):

```bash
npm run cli -- run-code "async page => {
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
npm run cli -- eval "async () => { const tabs = await chrome.tabs.query({}); return JSON.stringify(tabs.length); }"
```

## 4. Console + network

```bash
npm run cli -- console                  # page console, all since load; `console 1` for >=warn
npm run cli -- requests --static       # note: --static to include document requests
npm run cli -- request 1               # headers/status/duration of request #1

# SW console (on-demand capture): attach a worker console listener inside run-code
npm run cli -- run-code "async page => {
  const sw = page.context().serviceWorkers()[0];
  const msgs = [];
  sw.on('console', m => msgs.push('[' + m.type() + '] ' + m.text()));
  await sw.evaluate(() => console.log('probe from SW'));
  await page.waitForTimeout(500);
  return JSON.stringify(msgs);
}"
```

Caveat (verified): SW **network** request events do not fire through the CLI — a fetch from the SW returns its status, but no request event stream. Page console/network are fully covered.

## 5. Recover from failures

```bash
# missed selector / stale ref
npm run cli -- click e99
# → Error: Ref e99 not found in the current page snapshot. Try capturing a new snapshot.
npm run cli -- snapshot   # fresh refs → retry. Session intact.

# suspended SW: nothing to do — the next run-code re-fetches the worker.
# session control: npm run cli -- close-all / kill-all / detach; PLAYWRIGHT_CLI_SESSION=name to pick one.
```

## Human-loop notes

- Everything above is typed in a terminal by a human — no MCP client, no external launcher. `npm run cli -- --help` is grouped and complete; `npm run cli -- <cmd> --help` gives per-command details.
- Agents: `npm run cli -- install --skills` installs the bundled skill, or just point the agent at `npm run cli -- --help` and let it discover.
- Session management: `npm run cli -- list` / `close-all` / `kill-all`.

## Non-standard things in this guide, and why

- `browser.isolated: false` in the config: the CLI's default is the isolated (in-memory) launch, but MV3 extensions only load in a persistent context. This is the verified switch that makes config-host load gTabs — the docs don't call this out.
- **Relative** `--load-extension=dist`: Chromium resolves it against the process cwd, so a committed relative path survives clones from the repo root. The e2e fixture absolutizes because Playwright Test's cwd/launch rules differ; the CLI run from the repo root accepts the relative form.
- `--no-sandbox` + `channel: 'chromium'`: host + extension requirements from spike #67 (#headless-shell can't load extensions).
- Extension-id in commands: deterministic per resolved dist path — always derive at runtime from the SW URL (`new URL(sw.url()).host`), never hardcode.
- `run-code` for SW access: the documented escape hatch for "advanced scenarios not covered by CLI commands" (it takes a Playwright code function). Using `page.context().serviceWorkers()` is the standard Playwright API.
