# Chrome Tab & Tab Group API: Agent Learning Reference (gTabs)

**Scope:** how an agent learns the boundaries of Chrome's `tabs`/`tabGroups` API — which repos to clone, which files to read, how to verify claims, and how to read those files token-efficiently. This doc codifies the learning process; it is not extension-runtime guidance.

Authority model: schema JSON in the chromium clone = PRIMARY truth (the developer.chrome.com site renders these files verbatim); C++ implementation = shipped behavior; developer.chrome.com = secondary validation (milestone availability "Chrome X+", MV2/MV3 notes, examples). Token-efficient reading uses TOON (§1a). Verified 2026-08-09 against chromium main @ `bfa42e3d5683193f40b35211587b597728166613`; docs stamps: tabGroups 2025-08-11, tabs 2026-03-03.

## 0. Repos to clone (do this first)

- **chromium** (canonical implementation): canonical remote https://chromium.googlesource.com/chromium/src — clone the mirror: `git clone --depth 1 https://github.com/chromium/chromium.git $HOME/git/chromium`. Repo root = src root; all paths below are relative to `$HOME/git/chromium`.
- **w3c/webextensions** (feature intent / spec gaps): `git clone https://github.com/w3c/webextensions.git $HOME/git/webextensions`. Issue threads live on the website, not in the clone: https://github.com/w3c/webextensions/issues/715 (saved/pinned groups gap), https://github.com/w3c/webextensions/issues/749 (shared state).
- **gTabs** (this repo): already checked out; `src/background.ts` etc. are relative to its root.
- **toon-format/toon** (reading tool, NOT a source of truth): `git clone https://github.com/toon-format/toon.git $HOME/git/toon`. TS SDK `@toon-format/toon`, CLI `npx @toon-format/cli`, spec https://toonformat.dev and https://github.com/toon-format/spec.

## 1. Source map: clone-relative path → what it teaches → docs page

Layout warning: chromium relocates code between milestones. The saved-tab-groups work spans TWO trees — `components/saved_tab_groups/` (shared service/model) and `chrome/browser/ui/tabs/saved_tab_groups/` (desktop UI layer; both confirmed at `bfa42e3d`). Before citing any path, verify it exists at YOUR pinned commit: `git ls-tree -r <commit> <path>`.

| Relative path in `$HOME/git/chromium`                                       | What it teaches                                                                      | Docs page                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `chrome/common/extensions/api/tab_groups.json`                              | Authoritative tabGroups surface; absence of a function/field = not supported         | https://developer.chrome.com/docs/extensions/reference/api/tabGroups        |
| `chrome/common/extensions/api/tabs.json`                                    | `tabs.group`/`ungroup`/`query` entries                                               | https://developer.chrome.com/docs/extensions/reference/api/tabs             |
| `chrome/common/extensions/api/_api_features.json`                           | Permission gating (`tabGroups` → `permission:tabGroups`)                             | https://developer.chrome.com/docs/extensions/reference/manifest/permissions |
| `chrome/browser/extensions/api/tab_groups/tab_groups_api.cc`                | Query scope/pattern matching; move window-type check                                 | tabGroups reference                                                         |
| `chrome/browser/extensions/api/tabs/tabs_api.cc`                            | TabsGroupFunction (cross-window move), TabsUngroupFunction                           | tabs reference                                                              |
| `chrome/browser/ui/tabs/tab_strip_model.cc`                                 | Empty-group deletion; pinned-tab rule; AddToNewGroup                                 | tabs reference                                                              |
| `chrome/browser/ui/tabs/tab_group_model.cc`                                 | TabGroupModel::RemoveTabGroup (groups live only while they contain tabs)             | none                                                                        |
| `chrome/browser/ui/tabs/saved_tab_groups/saved_tab_group_model_listener.cc` | Auto-mirror of every local group into the saved store; window-close handling         | none — saved tab groups have NO extension API                               |
| `chrome/browser/ui/tabs/saved_tab_groups/local_tab_group_listener.cc`       | Last-tab-removed → mirror removed                                                    | none                                                                        |
| `components/saved_tab_groups/internal/saved_tab_group_model.cc`             | Last-tab → `RemovedLocally`; window close keeps copy (`OnGroupClosedInTabStrip`)     | none                                                                        |
| `components/saved_tab_groups/internal/tab_group_sync_service_impl.cc`       | RemoveLocalTabGroupMapping; saved list exposure filter; shared-group NTP placeholder | none                                                                        |
| `chrome/browser/tab_group_sync/feature_utils.cc`                            | `IsTabGroupSyncEnabled()` returns `true` on desktop                                  | none                                                                        |

## 1a. Codified reading step: schema JSON → TOON (token efficiency)

These schema files are JSON5 (leading `// Copyright` header), so strip comment lines before encoding. Measured with the official `@toon-format/cli` v4.1.1 on the pinned-commit files:

| File              | JSON tokens | TOON tokens | Token Δ | Bytes JSON→TOON |
| ----------------- | ----------- | ----------- | ------- | --------------- |
| `tab_groups.json` | ~1555       | ~1297       | −16.6%  | 8432 → 5938     |
| `tabs.json`       | ~12148      | ~10431      | −14.1%  | 63735 → 48866   |

Codified rule: whenever an agent reads a schema JSON for learning, convert on demand and read the TOON render: strip `//`-header lines (e.g. `python3` filter), then `npx @toon-format/cli <file>.clean.json -o - ` (or `--stats` to see token delta). Keep the canonical JSON as the identity/truth artifact; never commit a derived `.toon` copy (it drifts). The CLI tokenizer is an estimate; real savings vary by model. The same tooling also applies to runtime data payloads (e.g. group-query results, measured ≈ −62%), but that is extension behavior, outside this learning scope.

## 2. Quick answers (learned outcomes)

- **Saved groups are NOT reachable from any extension API.** Schema `$HOME/git/chromium/chrome/common/extensions/api/tab_groups.json` contains only `get/query/update/move` + 4 events; gap confirmed at https://github.com/w3c/webextensions/issues/715. Mechanism behind the user's duplicate backlog: local groups are auto-mirrored into the saved store on desktop (`saved_tab_group_model_listener.cc` `OnTabGroupAdded`) and survive window close (`OnGroupClosedInTabStrip`).
- **tabGroups.query scoping:** browser-wide (profile-scoped) by default; per-window with `windowId`; `title` is a glob pattern, not exact. Source: `tab_groups_api.cc` (`TabGroupsQueryFunction`).

## 3. Worked examples

**(a) List every group + members.** `chrome.tabGroups.query({})` then `chrome.tabs.query({})` filtered by `tab.groupId`. Verdict: **Partial** — only groups on open windows; closed/saved-only groups are invisible to every API. Needs `tabGroups` permission; `tabs` permission for `url`/`title`. Requires ≥1 open window (`kNoCurrentWindowError` otherwise).

**(b) Collapse every group.** `for (const g of await chrome.tabGroups.query({})) await chrome.tabGroups.update(g.id, {collapsed:true})`. Verdict: **Yes** for groups on open windows. Shared groups (Chrome 137+) may reject mutation (WECG #749); exact error text Unverified — live test: update a shared group, read the error.

**(c) Consolidate all tabs into one group.** `tabs.group({tabIds, createProperties:{windowId}})` — tabIds may span windows; the API moves them into the target window itself (`tabs_api.cc` `TabsGroupFunction`), no prior `tabs.move` needed. Verdict: **Partial** — pinned tabs cannot be grouped (unpin via `tabs.update(t.id,{pinned:false})`; exact error when passing one is Unverified, live test it); emptied old groups and their saved mirrors are deleted in-session (`saved_tab_group_model.cc` `RemoveTabFromGroupLocally`); prior-session saved copies unreachable.

**(Empty-group lifecycle)** Last tab leaves (ungroup / group-move / drag) → live group deletes immediately (`tabGroups.onRemoved`; `tab_group_model.cc` `RemoveTabGroup`) AND saved mirror deleted (`local_tab_group_listener.cc` `kGroupDeleted`; `saved_tab_group_model.cc` `RemoveTabFromGroupLocally`). Exception: window close keeps the saved copy (`OnGroupClosedInTabStrip`); shared groups get an NTP placeholder (`OnLastTabClosed`).

**(Cross-window grouping)** `tabs.group` moves tabs from other windows into the target window automatically; one call, no `chrome.tabs.move` required (`tabs_api.cc`).

**(`query({title})` matching)** Exact when the string has no `*`/`?`; case-sensitive; `title:""` matches untitled groups (`tab_groups_api.cc` `base::MatchPattern`).

## 4. How to use for the next agent

1. **Clone first** — chromium to `$HOME/git/chromium`, webextensions to `$HOME/git/webextensions`, toon tooling to `$HOME/git/toon` (commands in §0).
2. **Docs page — secondary validation only** — open https://developer.chrome.com/docs/extensions/reference/api/tabGroups (and /tabs) to cross-check milestone availability, MV2/MV3 notes, examples; note the "Last updated" stamp; distrust stale pages. The surface text is a render of the schema JSON, so don't quote the site as the primary source.
3. **Schema + implementation in the clone** — verify layout at your pinned commit: `git ls-tree -r <commit> components/saved_tab_groups chrome/browser/ui/tabs/saved_tab_groups`. Read schemas token-efficiently: strip `//`-header, encode to TOON (§1a). Then read `_api_features.json` (permissions) and `tab_groups_api.cc` + `tabs_api.cc` + `tab_strip_model.cc` (semantics).
4. **Live browser** — this repo's Playwright harness (`playwright.config.ts` channel `chromium`, `--load-extension=dist`, persistent context; `e2e/fixtures.ts`); run `npm run test:e2e`. Headed (`channel:"chrome"` + `xvfb-run`) for saved-groups UI checks; inspect `<profile>/Default/Preferences` for locally-closed group GUIDs.
