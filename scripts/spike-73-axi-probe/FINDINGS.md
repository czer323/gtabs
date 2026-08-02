# Card #73 probe — chrome-devtools-axi for live-session troubleshooting

**Spike branch:** `spike-73-axi-probe` · **Date:** 2026-08-02 · **Status:** REPORT BACK (throwaway probe — NOT a merge candidate)

## Bottom line

**NO-GO.** chrome-devtools-axi@0.1.28 cannot serve as the agent troubleshooting tool for a live gTabs session. The interactive targets that make Axi ergonomic (page snapshot/click loop, console+network, tab driving, stale-ref recovery) work — but **the entire extension/service-worker surface the card's troubleshooting depends on is unreachable through Axi's CLI**. The wrapped core (chrome-devtools-mcp@1.6.0) *does* support the extension targets in attach mode on Chrome 151, but Axi's bridge never exposes them.

## Environment / recipe (validated)

- TrueNAS Linux, no display. Chrome for Testing 151 at `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`.
- Launch (spike-67 recipe, plus `--remote-debugging-port` for Axi attach): persistent context, `headless:true`, `channel:'chromium'`, `--disable-extensions-except=<abs dist>`, `--load-extension=<abs dist>`, `--no-sandbox`, `--remote-debugging-port=9222`.
- Extension id (deterministic per abs dist path): `onahoidednddmeddegcknohhoohngbpl`. SW visible as a `service_worker` CDP target: `chrome-extension://…/background.js`.
- Axi attach: `CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9222` (live-session attach; no browser launched by Axi).
- **Pinning pin:** Axi's bridge spawns mcp via `npx -y chrome-devtools-mcp@latest` **unless** `CHROME_DEVTOOLS_AXI_MCP_PATH` is set (or a global mcp is auto-detected). To honor "no @latest drift" we set:
  `CHROME_DEVTOOLS_AXI_MCP_PATH=<repo>/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js`
  with `chrome-devtools-axi@0.1.28` + `chrome-devtools-mcp@1.6.0` both pinned exactly.
  Also set `CI=1` + `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1` to silence mcp telemetry/update checks.

## Evidence per exploration target

### (a) Reach the extension service-worker target (evaluate in SW context) — **NO via Axi; yes via raw core**
- Axi `pages` lists only page-type targets (sees the extension *popup/options pages*, but **not** the SW).
- Axi exposes **no** SW/target/worker command and no way to raise the mcp `--categoryExtensions` flag (the bridge hard-codes transport args; the CLI surface has no category passthrough).
- The raw mcp core **1.6.0**, run as `mcp --browserUrl=http://127.0.0.1:9222 --categoryExtensions=true`, DOES list the worker:
  ```
  ## Extension Service Workers
  sw-1: chrome-extension://onahoidednddmeddegcknohhoohngbpl/background.js
  ```
  and `list_extensions` returns the gTabs entry; `trigger_extension_action` opens the real popup (see (b)). So the underlying wrapper (1.6.0, attach mode, Chrome 151) CAN reach the SW.
- Getting the agent to *evaluate inside* the SW through Axi is therefore impossible; through the raw core you would attach to the worker target and evaluate (validated at the raw CDP layer — see suspend test below).

### (b) Inspect popup DOM (open popup, read state, click through) — **NO via Axi; yes via core**
- Direct CDP navigation to `chrome-extension://…/popup.html` or `options.html` → `ERR_BLOCKED_BY_CLIENT` (Chromium refuses script-navigating to extension pages; it is **not** an Axi glue defect).
- Axi's `open chrome-extension://…` yields a Chromium *blocked* page (no usable DOM).
- The raw core `trigger_extension_action#<before>` openthe real popup: after trigger, `list_pages` shows a new row `4: chrome-extension://…/popup.html`. So the popup is achievable at the core level; Axiomutes no route to it.
- Clicking through then requires the moment a page ref; doable at the core level.

### (c) Drive tabs (open/close/group/query) — **PARTIAL via Axi**
- `newpage <url>`: ✓ opens a real tab.
- `pages`: ✓ lists tabs.
- `selectpage <id>`: ✓ switches context.
- `closepage <id>`: ✓ closes a tab (verified).
- `eval` in a page: ✓ (page-context JS).
- Tab **grouping/query via chrome.tabs**: NO via Axi — no `chrome.tabs` access from an Axi-driven *web page* context (extension-only API; the extension pages are blocked as above), and Axi has no tabGroup tool. Grouping would need SW/extension context, which Axi can't reach.

### (d) Read console + network from page and SW — **PAGE yes via Axi; SW no**
- Page console ✓: `console` lists log/issue/error after activity.
- Page network ✓: `network` lists requests (GET /get → net::ERR_FAILED captured).
- SW console/network: Axi's console/network are page-scoped; the core's `--categoryExtensions` exposes the SW console via a `serviceWorkerId` filter, but Axi does not surface that. So SW activity is not readable through Axi.

### (e) Failure recovery (missed selector, suspended SW) — **✓ stale-ref recovery via Axi; SW n/a via Axi**
- Stale ref: `click @g2:2_3` → `code: STALE_REF` with guidance ("re-snapshot to get fresh refs"). Re-snapshot recovers; session preserved. Clean and agent-natural.
- Suspended SW assist: exercised at the raw CDP layer (Axi has no route): SW reachable → wait 32s idle → re-poked → still evaluating (`chrome` present, worker lazy-wakes). So the recovery job works; it's just not driveable through Axi's CLI.

## Ergonomics notes
- Axi's interaction loop for *web pages* is genuinely agent-ergonomic: `open` → snapshot with `uid=` refs + `help[...]` suggestions → `click @uid` / `eval` → fresh snapshot. Low token output (TOON-ish), self-hinting.
- **Fatal ergonomics gap for this use case**: every troubleshooting target that involves the extension (SW evaluate, popup DOM, tab-group ops, SW console) has *no Axiom route*. The agent either has to (a) drop to a raw CDP/target client externally (defeating the "one tool" purpose) or (b) step outside Axi's CLI. That's the NO-GO.

## Placement decision
- **Pinned versioned exercised: `chrome-devtools-axi@0.1.28`** (running the `chrome-devtools-mcp@1.6.0` core via `CHROME_DEVTOOLS_AXI_MCP_PATH`).
- Placement: **NO-GO, so no adoption** — do not add Axiom. IF this route were ever revisited, it must be the raw `chrome-devtools-mcp@1.6.0` (which does reach the SW/popup with `--categoryExtensions=true` in attach mode on Chrome 149+), pinned in repo devDeps and run with the flag forced — NOT through Axi's CLI, which hides the category. Documented here; no dependency added to `main`.

## What's custom / non-standard and why
- `CHROME_DEVTOOLS_AXI_MCP_PATH` override: required to pin the mcp core to 1.6.0 (else Axi falls back to `@mcp@latest` — the exact "no @latest drift" the card forbids).
- `--remote-debugging-port` in the Playwright launch: required for any external CDP attach (standard for CDP tooling).
- All probe scripts are throwaway branch-local evidence; nothing to main, `e2e/`, `playwright.config.ts`, or the npm scripts was touched.

## Recommendation
- **NO-GO** on adopting chrome-devtools-axi. The interactive-driver half of the two-job split needs extension/SW access; Axiomutes it.
- If a go-to MTP core path is needed later, `chrome-devtools-mcp@1.6.0` (pinned, attach to the same persistent Chrome, `--categoryExtensions=true`, `CHROME_DEVTOOLS_AXI`-style no; a harness MCP proxy remains discouraged per #66/#73). This is a separate spike / implementation child; not executed here.