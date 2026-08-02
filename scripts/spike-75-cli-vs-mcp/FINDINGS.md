# Card #75 probe — playwright-cli vs chrome-devtools-mcp (interactive-driver job)

**Spike branch:** `spike-75-cli-vs-mcp` · **Date:** 2026-08-02 · **Status:** REPORT BACK (throwaway probe — NOT a merge candidate)

## Bottom line

**playwright-cli (`@playwright/cli@0.1.17`, attach via `--cdp`) wins this card.** On the shared yardstick it reaches every target on the same live gTabs session — including the extension service worker, which is the one surface the interactive-driver job depends on — with a smaller token footprint and a genuinely human-drivable terminal loop. chrome-devtools-mcp (`chrome-devtools-mcp@1.6.0`, attach via `--browserUrl` + `--categoryExtensions`) reaches the same targets but with more steps (dynamic page ids, popup appears only on a second `list_pages`), a broken SW-console filter in attach mode, and no SW-eval route from its companion terminal CLI — a human needs an MCP client to reach the SW.

## Environment / recipe (validated)

- TrueNAS Linux, no display. Chrome for Testing 151.0.7922.34 (chromium-1234). Node 26.5.1.
- ONE live session for both tools (the card's "same live gTabs session"): persistent context, `headless:true`, `channel:'chromium'`, `--disable-extensions-except=<abs dist>`, `--load-extension=<abs dist>`, `--no-sandbox`, `--remote-debugging-port=9222` (scripts/spike-75-cli-vs-mcp/launch-chrome.mjs). Seed tabs: example.com, httpbin.org/html, about:blank; more opened during probes.
- Extension id (deterministic per abs dist path): `ncgmjeempkfjoeepjhicnljkgeocjkmf`. SW target: `chrome-extension://…/background.js`.
- **CLI attach:** `playwright-cli attach --cdp=http://127.0.0.1:9222` (standard documented attach; daemon connects over CDP, `detach` leaves the browser running).
- **MCP attach:** `chrome-devtools-mcp --browserUrl=http://127.0.0.1:9222 --categoryExtensions=true`, driven by a minimal hand-written MCP client (scripts/spike-75-cli-vs-mcp/mcp-client.mjs) — standard MCP JSON-RPC over stdio (initialize → tools/list → tools/call); the harness MCP gateway (bifrost) is out of scope per the card, so the client is part of the probe. Also tested the server's own companion terminal CLI `chrome-devtools` (ships in the same package).
- Both pinned exact: `@playwright/cli@0.1.17`, `chrome-devtools-mcp@1.6.0`. Installed `--save-exact --no-save`; nothing added to main's package.json.

## Evidence per shared target

Legend: CLI = `playwright-cli` · MCP = `chrome-devtools-mcp` (via mcp-client) · cdt = `chrome-devtools` companion CLI (same MCP server, terminal surface)

### (a) Reach the extension SW / evaluate in SW context

| | CLI | MCP | cdt CLI |
|---|---|---|---|
| SW listed | not in `tab-list` (page list only) | `list_pages` → `## Extension Service Workers / sw-1: chrome-extension://…/background.js` | same as MCP |
| Evaluate in SW | **YES** — `playwright-cli run-code "async page => { const sw = page.context().serviceWorkers()[0]; … await sw.evaluate(() => chrome.tabs.query({})) }"` returned the 6-tab list. Standard Playwright API via the documented `run-code` escape hatch | **YES (undocumented param)** — `evaluate_script` accepts `serviceWorkerId` (only present when `--categoryExtensions` is set; not discoverable from the tool list alone, found in server source). `chrome.tabs.query` returned 6 tabs. BUT first call after SW suspend fails (`Target closed` / `Execution context is not available in detached frame or worker`) until a `list_pages` re-poke; the CLI re-fetches the worker every call and never hit this | **NO** — `chrome-devtools evaluate_script … --serviceWorkerId sw-1` → `Error: Unknown argument: serviceWorkerId`. The CLI wrapper omits the SW eval param; SW surface unreachable from the terminal |

- CLI SW eval evidence: `run-code` → `"[{id:906714816,url:about:blank},…]"` (chrome.tabs.query from SW context).
- MCP SW eval evidence: `evaluate_script {serviceWorkerId:"sw-1"}` → `{"count":6,"hasChrome":true}`.
- CLI suspend test: SW eval → wait 35s (MV3 idle-suspend window) → SW eval again → `{"hasChrome":true,"tabs":"available"}` — session intact, no special recovery needed.

### (b) Inspect popup DOM (open popup, read state, click through)

| | CLI | MCP | cdt CLI |
|---|---|---|---|
| Open | **YES** — `tab-new chrome-extension://…/popup.html` (new tab; no `ERR_BLOCKED_BY_CLIENT` — unlike Axi's `open`, which script-navigated an existing tab) | **YES** — `trigger_extension_action` opens the real popup; appears in `list_pages` only on the SECOND call (`## Extension Pages / 5: chrome-extension://…/popup.html`) | **YES** — `trigger_extension_action <id>` works; popup visible in `list_pages` |
| Read DOM | `snapshot` → YAML with refs (`button "Organize all tabs" [ref=e7]`) | `take_snapshot` → a11y tree with uids (`uid=1_4 button "Organize all tabs"`) | `take_snapshot` → same a11y tree |
| Click through | `click e7` → state changed to "Unable to create a text session because the service is not running" (click reached extension logic) | snapshot → `click {uid:"1_4"}` → same state change | click via uid works (same server) |
| Notes | refs are stable per snapshot; click needs a fresh snapshot | uid click needs a fresh `take_snapshot` in the SAME MCP session (`No snapshot found for page 5`) | — |

### (c) Drive tabs (open/close/group/query)

| | CLI | MCP | cdt CLI |
|---|---|---|---|
| List | `tab-list` (indexed) | `list_pages` (pageId, **dynamic** — ids shift as tabs open/close; popup id must be re-discovered each time) | `list_pages` |
| Open | `tab-new <url>` ✓ | `new_page {url}` ✓ | `new_page` ✓ |
| Select | `tab-select <index>` ✓ | `select_page {pageId}` ✓ | `select_page` ✓ |
| Close | `tab-close <index>` ✓ | `close_page {pageId}` ✓ | `close_page` ✓ |
| Group | no native command; **works via SW** `run-code` → `chrome.tabs.group({tabIds})` (grouped 3 tabs, verified via `chrome.tabGroups.query`) | no native tool; **works via extension page** `evaluate_script` on the popup → `chrome.tabs.group` | SW eval unavailable → grouping not reachable from terminal |
| Query chrome.tabs | `eval` on the popup tab (extension page has chrome.tabs): returned 6 | `evaluate_script` on popup page: returned 6 | not reachable (no SW/popup eval in CLI wrapper — popup DOM read only) |

### (d) Console + network from page and SW

| | CLI | MCP | cdt CLI |
|---|---|---|---|
| Page console | `console` ✓ (captured `[LOG] CLI-PROBE page console msg`) | `list_console_messages` ✓ (msgid=1 `[log] SPIKE75-PAGE-LOG`) | `list_console_messages` ✓ |
| Page network | `requests --static` + `request <n>` ✓ (full headers/status; 200s captured) | `list_network_requests` + `get_network_request {reqid}` ✓ (headers/status) | ✓ same server |
| SW console | **YES (on-demand)** — `run-code`: attach `sw.on('console')`, trigger, read (`[SW:log] CLI-PROBE SW console msg`) | **NO (broken in attach mode)** — `list_console_messages {serviceWorkerId:"sw-1"}` returned `<no console messages found>` across 4 attempts, including a controlled poke→log→read with the SW active. Root cause in server source: `ServiceWorkerConsoleCollector` subscribes at server init to workers existing then; when the SW was suspended at attach time the worker ref goes stale and console events never flow | same as MCP (no SW console via CLI wrapper) |
| SW network | **NO** — worker `request` events don't fire through CDP attach (fetch from SW executed, status 200, but no events surfaced) | **NO** — no SW filter on `list_network_requests` | **NO** |

### (e) Failure recovery (missed selector, suspended SW)

| | CLI | MCP |
|---|---|---|
| Missed selector | `click e99` → `Error: Ref e99 not found in the current page snapshot. Try capturing new snapshot.` Re-snapshot recovers, session intact ✓ | `click {uid:"1_77"}` → `Error: Element uid "1_77" not found on page 2.`; no snapshot → `No snapshot found for page 5. Use take_snapshot to capture one.` Re-snapshot recovers ✓ |
| Suspended SW | re-eval just works (worker re-fetched per call) ✓ | first eval after suspend fails; `list_pages` re-poke fixes it; session otherwise intact ✓ (extra step) |

## Ergonomics

### Agent loop
- **CLI:** attach once (`playwright-cli attach --cdp=…`), then flat shell commands; snapshot → `click e7` → snapshot. Output is terse; snapshots are written to `.playwright-cli/*.yml` and only a link is printed, so the model reads what it needs. Every command echoes the Playwright code it ran — self-documenting. SW/popup-extension work goes through `run-code` (documented "advanced scenarios" escape hatch) with the standard Playwright API. Steps per target: 1–3.
- **MCP:** structured tool params, but more steps per target: popup = trigger → list_pages → list_pages (popup appears only on the 2nd) → select_page (dynamic id) → take_snapshot → click → take_snapshot. SW eval = list_pages poke → evaluate_script with the hidden `serviceWorkerId`. SW console = dead end. Full a11y trees come back inline (higher token cost, see below).

### Human loop (can a human drive it from a terminal?)
- **CLI: YES.** `playwright-cli attach --cdp=http://127.0.0.1:9222` then plain commands (`snapshot`, `click e7`, `tab-list`, `console`, `requests`, `run-code "…"`). `--help` is complete and grouped by category; the CLI also ships an installable skill (`playwright-cli install --skills`). Every probe command above was typed and read by hand — this is a human tool.
- **MCP: NO for the SW surface.** The server needs an MCP client; the card's harness gateway is excluded. The package's own `chrome-devtools` CLI is human-drivable for pages/popup/tabs/console/network, but its `evaluate_script` omits `serviceWorkerId`, so the extension SW (the card's core target) is unreachable from a terminal. A human would have to write (or configure) an MCP client — that's what mcp-client.mjs is.
- **Dual-use verdict:** CLI = one tool, both human and agent; MCP = agent-only for the extension surface even with its companion CLI. This was the criterion that motivated Axi and carries forward — the CLI earns the dual-use credit, the MCP does not.

## Token-cost observation vs docs' claims

Docs claim: CLI = lower token cost (concise output, snapshots to disk); MCP = higher (structured trees inline). **Verified** on the same session, comparable operations (stdout bytes):

| Operation | CLI | MCP |
|---|---|---|
| Snapshot, same httpbin page | 944 B (stdout is a summary + link; full YAML ~680 B on disk) | 3723 B (full a11y tree inline) — **~4x** |
| SW tab query | 376 B (run-code result) | ~450 B (evaluate_script result, JSON-wrapped) |
| Page console list | ~93 B | ~47 B (comparable) |
| Page network list | ~82 B | ~110 B (comparable) |

The big spread is snapshots: CLI writes the accessibility tree to a file the model reads selectively; MCP streams it inline every call. For a troubleshooting loop that snapshots often, the CLI's context footprint is materially smaller.

## Placement + pinned versions (recommendation)

- **Recommended tool: `@playwright/cli@0.1.17`** (pinned exact), placed as a repo devDependency (`npm i -D --save-exact @playwright/cli@0.1.17`), invoked as `npx playwright-cli` from the project root — project tooling, not the infra gateway, satisfying the card's placement constraint. Attach to the live session with `attach --cdp=http://127.0.0.1:9222`; the launch recipe stays the spike-67/73 validated one (no changes to `e2e/`, `playwright.config.ts`, or npm scripts).
- `@playwright/cli` is a distinct package from `@playwright/test` (its own `playwright-core` 1.62.0-alpha dep) — the regression runner stays untouched; the two coexist.
- chrome-devtools-mcp@1.6.0 remains a proven fallback for SW console/popup-target listing if a raw MCP route is ever wanted, but its attach-mode SW console is broken and its human loop can't reach the SW — not the winner on this card.
- Per the lead's decision ladder: the CLI worked out, so **no Playwright MCP evaluation is needed** — this card's head-to-head decides.

## What's custom / non-standard and why

- `--remote-debugging-port=9222` in the launcher: required for external CDP attach (standard for CDP tooling).
- `--categoryExtensions=true` on chrome-devtools-mcp: required to expose extension tools/SW (documented flag; note the CLI help still says "only supported with a pipe connection" — stale, it works with `--browserUrl` on Chrome 151, confirmed here).
- `serviceWorkerId` param on MCP `evaluate_script`: documented in the code-generated schema but not advertised in the server's tool list; found in server source. Used as-is, flagged for the lead.
- mcp-client.mjs (minimal MCP JSON-RPC client): the card excludes the harness MCP gateway, so the probe supplies its own standard-protocol client. Not a product artifact; throwaway evidence.
- `--no-sandbox` + `channel:'chromium'`: host/extension requirements from spike #67, unchanged.
- Tab grouping via `chrome.tabs.group` in SW/extension-page evaluate: neither tool has a native group command; the extension API is the standard route and works through both (CLI: run-code; MCP: popup-page evaluate).

## Recommendation

**playwright-cli wins this card.** It is the only candidate that (1) reaches every shared target including the extension SW, (2) keeps the loop cheap (snapshots to disk, ~4x smaller context on the hot path), and (3) is dual-use — a human drives the exact same command surface from a terminal. chrome-devtools-mcp matches on raw capability (with an extra recovery step for suspended SW) but fails the human-loop criterion on the extension surface and has a broken SW-console filter in attach mode. Implementation child (to be created by the lead on decision): add `@playwright/cli@0.1.17` as a pinned devDep + a `.claude/skills` or repo-doc entry capturing the attach→SW→popup→tabs→console loop in GUIDE.md; nothing merges from this branch.

**My preference (lead-requested data point):** CLI, and this time preference agrees with the objective recommendation. Reasons: it was the same command surface for me and for a human; output was terse enough to read raw; `run-code` gave me the full Playwright API whenever the flat commands ran out (SW eval, tab grouping, SW console); I never had to re-discover dynamic page ids or poke a suspended worker. The MCP route cost me a client, a hidden-param hunt, a popup double-list, and a dead SW-console filter before reaching the same evidence.
