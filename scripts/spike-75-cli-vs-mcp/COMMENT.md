## Spike #75 — playwright-cli vs chrome-devtools-mcp for the interactive-driver job

**Verdict: playwright-cli (`@playwright/cli@0.1.17`, attach via `--cdp`) wins this card.**

One live gTabs session (persistent ctx, `headless:true`, `channel:'chromium'`, `--load-extension=<abs dist>`, `--no-sandbox`, `--remote-debugging-port=9222`, Chrome 151.0.7922.34), both tools attached to it, same shared yardstick as #73. Extension id `ncgmjeempkfjoeepjhicnljkgeocjkmf`. Artifacts: `scripts/spike-75-cli-vs-mcp/` on branch `spike-75-cli-vs-mcp` (FINDINGS.md, GUIDE.md, launch-chrome.mjs, mcp-client.mjs, example snapshot).

### Per-tool per-target verdicts (same session)

| Target | playwright-cli (0.1.17, `attach --cdp`) | chrome-devtools-mcp (1.6.0, `--browserUrl` + `--categoryExtensions`) |
|---|---|---|
| (a) Reach extension SW / evaluate in SW | **YES** — `run-code` + standard `page.context().serviceWorkers()[0].evaluate(() => chrome.tabs.query({}))` returned the tab list. Worker re-fetched per call → suspended-SW is a non-event | **YES but hidden + fragile** — `evaluate_script` accepts `serviceWorkerId` (param only exists with `--categoryExtensions`; not visible from the tool list, found in server source). First eval after SW suspend fails (`Target closed`) until a `list_pages` re-poke |
| (b) Open popup / read DOM / click through | **YES** — `tab-new chrome-extension://…/popup.html` opens the real popup (no `ERR_BLOCKED_BY_CLIENT`, unlike Axi's `open`); `snapshot` → refs (`click e7`), click through verified (state → "service is not running") | **YES** — `trigger_extension_action` opens the real popup, but it appears in `list_pages` only on the SECOND call and its pageId shifts between calls; `take_snapshot` + `click {uid}` works |
| (c) Drive tabs (open/close/group/query) | **YES** — `tab-list/tab-new/tab-select/tab-close`; grouping has no native command but works via SW `chrome.tabs.group` through `run-code`; `chrome.tabs.query` via `eval` on the popup page | **YES** — `new_page/select_page/close_page`; grouping via `evaluate_script` on the popup page (extension context has chrome.tabs); dynamic pageIds must be re-discovered each call |
| (d) Console + network (page + SW) | Page: **YES** (`console`, `requests --static`, `request <n>`). SW console: **YES on-demand** (worker `console` event inside `run-code`). SW network: **NO** (worker request events don't fire via CDP attach) | Page: **YES** (`list_console_messages`, `list_network_requests`, `get_network_request`). SW console: **NO — broken in attach mode** (`list_console_messages {serviceWorkerId}` returned nothing across 4 attempts incl. controlled poke→log→read; server's collector subscribes at init and the worker ref goes stale). SW network: **NO** (no SW filter) |
| (e) Failure recovery | **YES** — `click e99` → clean error + "Try capturing new snapshot", re-snapshot recovers; suspended SW (35s idle) re-evaluates fine | **YES with extra step** — missing uid → clean error; re-snapshot recovers; suspended SW needs a `list_pages` poke before SW eval works again |

### Ergonomics

- **Agent loop — CLI:** attach once, then flat shell commands (1–3 steps/target); snapshots go to `.playwright-cli/*.yml` with only a link in stdout — the model reads what it needs; every command echoes the Playwright code it ran (self-documenting). SW/extension work via documented `run-code` escape hatch with standard Playwright API.
- **Agent loop — MCP:** more steps per target (popup = trigger → list_pages → list_pages → select_page → take_snapshot → click → take_snapshot; dynamic ids; hidden `serviceWorkerId` param; SW console dead end).
- **Human loop — CLI: YES.** Same commands typed in a terminal; `--help` complete and grouped; `install --skills` for agents. Every probe command was typed/read by hand.
- **Human loop — MCP: NO for the SW surface.** Server needs an MCP client (harness gateway excluded per card). The package's own `chrome-devtools` CLI is human-drivable for pages/popup/tabs but its `evaluate_script` omits `serviceWorkerId` → the extension SW (the card's core target) is unreachable from a terminal.
- **Dual-use:** CLI = one tool, human + agent. MCP = agent-only for the extension surface. The criterion that motivated Axi carries forward — CLI earns the credit, MCP does not.

### Token-cost observation vs docs' claims

Docs claim CLI = lower, MCP = higher. **Verified** (stdout bytes, same session): snapshot of the same httpbin page — CLI 944 B (summary + link; YAML ~680 B on disk) vs MCP 3723 B (full a11y tree inline) = **~4x**. SW query 376 B vs ~450 B; console/network lists comparable. The CLI's snapshot-to-disk design is the material win for a snapshot-heavy troubleshooting loop.

### Placement + pinned versions

**Recommended: `@playwright/cli@0.1.17` pinned exact, repo devDependency** (project tooling, not bifrost), invoked `npx playwright-cli`, attach `--cdp=http://127.0.0.1:9222` to the same validated launcher. Distinct package from `@playwright/test` — regression runner untouched (`e2e/`, `playwright.config.ts`, npm scripts unchanged). chrome-devtools-mcp@1.6.0 stays a proven fallback (SW/popup listing) but loses on the human loop + SW console + token cost.

Per the decision ladder: the CLI worked out, so **no Playwright MCP evaluation is needed** — this card decides.

### What's custom / non-standard and why

- `--remote-debugging-port` in launcher: required for external CDP attach (standard).
- `--categoryExtensions=true`: documented flag (help text's "pipe only" note is stale — works with `--browserUrl` on Chrome 151, confirmed).
- MCP `serviceWorkerId` on `evaluate_script`: code-generated but not advertised in the tool list; found in server source, used as-is.
- `mcp-client.mjs`: minimal standard MCP JSON-RPC client because the harness gateway is excluded; throwaway probe artifact.
- `--no-sandbox` + `channel:'chromium'`: host/extension requirements from #67.
- Tab grouping via `chrome.tabs.group` (SW / extension-page evaluate): no native group command in either tool; the extension API is the standard route.

### Recommendation

**playwright-cli wins this card.** Only candidate that (1) reaches every shared target incl. the SW, (2) keeps context cost low (~4x smaller on the hot path), (3) is dual-use — same command surface for human and agent. MCP matches raw capability (plus one suspend-recovery step) but fails the human-loop criterion on the extension surface and its attach-mode SW console is broken. Implementation child for the lead: add `@playwright/cli@0.1.17` pinned devDep + repo skill/doc entry (GUIDE.md captures the attach→SW→popup→tabs→console→recovery loop). Nothing merges from this branch.

**My preference (lead-requested data point):** CLI — and it agrees with the objective recommendation. Same surface for me and a human; terse output; `run-code` gave the full Playwright API whenever flat commands ran out (SW eval, grouping, SW console); no dynamic ids, no poke dances, no hidden params. The MCP route cost a client, a hidden-param hunt, a popup double-list, and a dead SW-console filter before reaching the same evidence.

**GUIDE:** `scripts/spike-75-cli-vs-mcp/GUIDE.md` on `spike-75-cli-vs-mcp` — practical how-to for playwright-cli covering exactly the tested flow: attach to the live session, reach the extension SW, open/inspect/click the popup, drive tabs (incl. grouping), read console + network, recover from failures, plus human-loop notes. Captured on the branch so the research survives even if the branch is trimmed later.
