# FINDINGS — Card #67: Load unpacked gTabs extension in Chromium on this host

**Date:** 2026-08-02 · **Host:** TrueNAS Linux (no physical display), x86_64
**Repo:** czer323/gtabs · **Spike verdict relevant to:** Card #68 (E2E tooling)

---

## Verdict: **GO** for #68

Chromium on **this host can load the unpacked gTabs extension (`dist/`), register its MV3 service worker, open `popup.html`, and query `chrome.tabs` from inside the SW — headless (new-headless mode) with no display needed.** No xvfb required.

- **Recommended mode:** Playwright `channel: 'chromium'` + `headless: true` (the *new* headless, full-build chromium). It works out of the box, no display, no xvfb-run wrapper.
- xvfb-headed also works as a fallback and as a visual-debug tool, but is NOT required for CI smoke tests.

---

## 1. GO or NO-GO for #68, and why

**GO.** Every plumbing check the card's acceptance criteria demands passed on this host:

- [x] `npm run build` → `dist/` contains `manifest.json`, `background.js`, `popup.html` (verified).
- [x] Unpacked extension loads via `--load-extension`.
- [x] MV3 service worker registers (`context.serviceWorkers()` yields the worker).
- [x] `chrome-extension://<id>/popup.html` opens.
- [x] `worker.evaluate(() => chrome.tabs.query({}))` returns real tab state from inside the SW.

E2E tooling (card #68) has a working substrate here. No blockers found.

## 2. Headless works / fails

- **Headless-shell (Playwright's `headless:true` default, `HEADED`-style Chrome Headless Shell build 151.0.7922.34 / v1234): FAILS.**
  - Observed: context launches, but `context.serviceWorkers()` returns 0 workers; no `chrome-extension://` worker ever appears.
  - Error captured (probe's own assertion): `no extension service worker appeared (chrome-extension://)`.
  - Root cause: the `chrome-headless-shell` build does not support loading extensions (no extension host exposed in headless-shell). This is an environment/build distinction, not our code.
- **Headless | `channel:'chromium'` + `headless:true` (the *new* headless mode, full Chrome-for-Testing build 151.0.7922.34): PASS.**
  - SW registers, popup opens, `chrome.tabs.query` works.

**So the headless question is nuanced: headless-shell fails, new-headless succeeds.** The fix is a one-line channel choice, not an xvfb requirement.

## 3. Exact launch recipe that works

Verified working recipe (headless, the recommended one):

```js
import { chromium } from '@playwright/test';
import path from 'node:path';

const DIST = path.resolve(process.cwd(), 'dist'); // MUST be absolute
const ctx = await chromium.launchPersistentContext('', {
  headless: true,
  channel: 'chromium',          // <-- new headless (full build), NOT headless-shell
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-sandbox',
  ],
});
const sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
// await new Promise(r => setTimeout(r, 1500)); // only if SW registers lazily
const extId = new URL(sw.url()).host;
const tabs = await sw.evaluate(() => chrome.tabs.query({})); // works
```

Key facts that make this deterministic:

- **Extension id resolution:** Stable and deterministic per absolute dist path. On this host the extension id is `kpbnoiacbihocibpmbljlnjafobpojog` (identical across all three probe runs and both chromium builds). You can extract it at runtime from the worker URL (`new URL(sw.url()).host`) so nothing needs hardcoding; the determinism just means it's safe to rely on in before-extension navigations.
- **Profile:** a persistent context (`launchPersistentContext('')` → temp profile). MV3 extensions are not available in ephemeral browser contexts / incognito; persistent context is required. Pass an absolute `dist/` path (not relative) to both `--disable-extensions-except` and `--load-extension`.
- **SW access:** `ctx.serviceWorkers()` returns live `Worker` objects; `worker.evaluate(...)` runs in the SW's extension (engine) context. Requests/commands are issued against the extension's own `chrome.*` APIs.
- **`--no-sandbox`:** needed because containers/chroot often lack a usable `chrome-sandbox` setuid helper; include it on this host.

> The probe prints the real extension id (from the worker URL) at runtime — use that rather than hardcoding.
> **Playwright version:** 1.62.1 · **Chrome for Testing:** 151.0.7922.34 (headless-shell v1234 + full chromium v1234).

## 4. Playwright config sketch (future smoke test)

```js
// playwright.config.ts (committed under card #68, NOT part of this spike)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,            // single context; don't parallelize extension tests
  use: {
    headless: true,
    channel: 'chromium', // new-headless, full build
    launchOptions: {
      args: [
        `--disable-extensions-except=${process.env.GTABS_DIST ?? require.resolve('./dist')}`,
        `--load-extension=${process.env.GTABS_DIST ?? require.resolve('./dist')}`,
        '--no-sandbox',
      ],
    },
  },
});
```

```bash
# CI / local commands (card #68 will formalize)
npx playwright install chromium   # dl's chrome-headless-shell + full chrome-for-testing
npm run build                     # -> dist/
GTABS_DIST="$(pwd)/dist" npx playwright test
```

## 5. Surprising MV3 SW behavior in the probe

- **Timing:** the SW was already registered by the time `launchPersistentContext` returned; `serviceWorkers()` is populated synchronously (no retry needed for this extension). Keep a small probe retry as a guard anyway.
- **`chrome.tabs.query({})` from SW** works and returns real tabs (2 tabs present in the probe context: new tab + popup). The SW has `tabs` permission, so full tab objects come back.
- **`chrome.runtime.getURL` fetch from inside the SW** returns a stringified object when boxed through Playwright `evaluate` — avoid `fetch(manifest)` in SW `evaluate`; read the manifest from disk on the Node side instead. (Minor tooling quirk, not an extension bug.)
- **Popup title** renders empty when opened as a bare page — it's driven by JS/React after mount; not a failure of load.
- Lifecycle/suspension not exercised (probe is short-lived); flags for card #68: MV3 SWs can suspend after ~30s idle, so the smoke test must re-`page`/re-fetch if it waits long between asserts (or poke `chrome.runtime.getContexts` / `chrome.tabs.onUpdated` event listener to keep it alive).

---

## Implementer friction notes (host-specific)

- **Overlayfs / git:** `.git/logs/refs/heads` rejects new branch log files (EINVAL "Invalid input") because the shared refs dir is fuse-overlayfs. Workaround that worked: `git -c core.logAllRefUpdates=false checkout -b <branch>` (disables reflog, so no log file write). Flat branch name (`spike-67-chromium-probe`) also avoided the nested-dir creation that fails. Add `git config core.logAllRefUpdates false` in worktrees to avoid repeating.
- **Playwright download (~128 MB headless-shell + ~170 MB full chromium):** succeeded cleanly on this host to `~/.cache/ms-playwright/`; no proxy/DNS issue. ~25s for the shell; full chromium came down fine too.
- **`npx playwright --version`** → Playwright **1.62.1**; **Chrome for Testing 151.0.7922.34** (both headless-shell and full `chrome`).
- **Chromium needs `--no-sandbox`** in overlayfs/container — non-fatal warning/crash otherwise; include it.
- New-headless vs headless-shell confusion is the #1 gotcha — default `headless:true` uses **headless-shell** (no extensions); you MUST pass **`channel:'chromium'`** to get the extension-capable full build.