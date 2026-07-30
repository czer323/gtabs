# Architecture

This document describes how gTabs is structured internally. Understanding these patterns is necessary before making significant changes.

## Table of Contents

- [Module Boundaries](#module-boundaries)
- [Message Passing](#message-passing)
- [Storage Layer](#storage-layer)
- [Weighted Affinity Learning](#weighted-affinity-learning)
- [LLM Provider Abstraction](#llm-provider-abstraction)
- [Service Worker Lifecycle](#service-worker-lifecycle)
- [Design Decisions](#design-decisions)

---

## Module Boundaries

The project is organized as a flat set of modules with a one-way dependency chain:

```
popup.ts ─────────────┐
options.ts ───────────┤
                      v
                 background.ts
                      │
          ┌───────────┼───────────┐
          v           v           v
      grouper.ts   storage.ts   llm.ts
          │           │
          └───────────┘
                │
                v
            types.ts   (no dependencies — pure type definitions)
```

| Module          | Role                                                                        | Depends On               |
| --------------- | --------------------------------------------------------------------------- | ------------------------ |
| `types.ts`      | All interfaces, type unions, and constants                                  | Nothing                  |
| `storage.ts`    | Chrome storage read/write, data migration, affinity math                    | `types.ts`               |
| `llm.ts`        | Provider-agnostic API client, token counting                                | `types.ts`               |
| `grouper.ts`    | Prompt construction, response parsing, domain rule matching, title matching | `llm.ts`, `types.ts`     |
| `background.ts` | Service worker — message routing, feature orchestration, event listeners    | All of the above         |
| `popup.ts`      | Action popup UI — organize, pin, correct, reject, search                    | `storage.ts`, `types.ts` |
| `options.ts`    | Settings page — providers, learning toggles, schedules, pinned groups       | `storage.ts`, `types.ts` |

`background.ts` is the hub. It imports every other module and wires them together through the message handler. `popup.ts` and `options.ts` are the only modules that never import `background.ts` — they communicate exclusively through `chrome.runtime.sendMessage`.

---

## Message Passing

All UI-to-background communication uses a **typed discriminated union** pattern. The `MessageType` type in `types.ts` defines every possible message:

```typescript
type MessageType =
  | { type: 'organize' }
  | { type: 'apply'; suggestions: GroupSuggestion[] }
  | { type: 'undo' }
  | { type: 'status'; status: string; ... }
  // ~30 message variants total
```

### Conventions

- Every request message has a corresponding `status` response variant in the same union.
- Handlers return `true` from `onMessage` for async responses (using `sendResponse`), and `false` for synchronous responses.
- Every handler is wrapped in try/catch and returns `{ type: 'status', status: 'error', error: string }` on failure.
- Adding a new feature that crosses the UI↔background boundary requires adding to the `MessageType` union and registering a new handler in `background.ts`'s `onMessage` listener.

---

## Storage Layer

### Two Storage Areas

| Area                                  | Contents                                                                                                    | Reason                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `chrome.storage.sync`                 | Settings, domain rules                                                                                      | Roam across signed-in Chrome devices                |
| `chrome.storage.local`                | Weighted affinity, corrections, rejections, history, costs, stats, workspaces, snoozed tabs, undo snapshots | Large or privacy-sensitive data that shouldn't sync |
| `chrome.storage.local` (explicit key) | API keys                                                                                                    | **Never** synced — security requirement             |

### Access Pattern

Every storage operation goes through a function in `storage.ts`. No other module calls `chrome.storage` directly. The pattern is:

```typescript
// Read (with defaults/migration)
export async function getSettings(): Promise<Settings> { ... }

// Write (with sanitization)
export async function saveSettings(settings: Settings): Promise<void> { ... }
```

### Migration

`storage.ts` includes a `migrateAffinity()` function that converts the legacy flat `AffinityMap` to the current `WeightedAffinityMap` format. Migration runs on first access if the old format is detected.

---

## Weighted Affinity Learning

This is the core learning system that powers smart routing and LLM hints.

### Data Model

```typescript
interface WeightedAffinityEntry {
  groups: Record<string, WeightedAffinityGroup>;
}

interface WeightedAffinityGroup {
  count: number; // number of times this domain was placed in this group
  lastUsed: number; // epoch ms of most recent placement
}
```

### Decay

```typescript
const DECAY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Effective weight:
function computeDecayedWeight(count: number, lastUsed: number, now: number): number {
  const elapsed = now - lastUsed;
  return count * Math.pow(0.5, elapsed / DECAY_HALF_LIFE_MS);
}
```

Older placements decay exponentially. A domain placed in the same group 50 times a year ago may have less weight than 3 placements last hour.

### Correction Tracking (3x Weight)

When a user renames a group or moves a tab before applying, those edits are recorded as corrections. Corrections update weighted affinity with a multiplier of 3:

```typescript
await updateWeightedAffinity(correctedSuggestions, 3);
```

### Rejection Memory (30-day avoidance)

When a user removes a suggested group entirely, each domain in that group is recorded as a rejection:

```typescript
interface RejectionEntry {
  timestamp: number;
  domain: string;
  rejectedGroup: string;
}
const REJECTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
```

Rejections are passed to the LLM as explicit `AVOID` hints. They also block `inferTargetGroup` from routing a new tab into the avoided group.

### Path-Level Affinity

For multi-tenant sites (e.g., `github.com/myorg` vs `github.com/trending`), the `extractPathKey` function captures the first path segment as part of the key. Multi-tenant hosts are listed in `MULTI_TENANT_HOSTS` in `storage.ts`.

### Co-occurrence Mining

The system tracks which domains frequently appear together in the same group, storing co-occurrence pairs with counts. This is surfaced to the LLM as additional hints about which domains naturally belong together.

---

## LLM Provider Abstraction

### Supported Providers

- OpenAI (and any OpenAI-compatible endpoint)
- Anthropic
- Groq
- xAI (Grok)
- OpenRouter
- Ollama (local)
- Chrome AI (Gemini Nano, built-in)

### Interface

```typescript
interface CompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

// Router — dispatches to the right provider implementation
export async function completeWithUsage(
  config: LLMConfig,
  messages: Message[],
): Promise<CompletionResult>;
```

### Provider Detection

The router uses two strategies:

1. **Chrome AI** — detected by checking `globalThis.LanguageModel` availability. No API key needed. Identified by `config.model === 'gemini-nano'` and empty `config.baseUrl`.
2. **Anthropic** — detected by checking if `config.baseUrl` contains `anthropic.com`. Uses a different API format (Anthropic's `/messages` endpoint instead of OpenAI's `/chat/completions`).
3. **Everything else** — treated as OpenAI-compatible. Ollama, Groq, xAI, OpenRouter, and custom endpoints all use the same `/chat/completions` format.

### No External SDKs

Each provider is called via raw `fetch`. There are no npm packages for OpenAI, Anthropic, or any provider. This is intentional — zero runtime dependencies means no security surface, no bundle bloat, and no breaking SDK updates.

---

## Service Worker Lifecycle

### Startup

On install or service worker wake:

1. `chrome.runtime.onInstalled` fires → creates the periodic alarm (every 2 minutes) and the reorg alarm, then rebuilds context menus.
2. Event listeners are registered for `tabs.onCreated`, `tabs.onRemoved`, `tabs.onActivated`, `tabs.onUpdated`, `tabGroups.onCreated/Removed/Updated`, `alarms.onAlarm`, `storage.onChanged`, `contextMenus.onClicked`, `commands.onCommand`.

### Periodic Checks

The 2-minute alarm (`gtabs-check`) triggers `triggerAutoCheck()` which calls `checkAutoTrigger()`. If auto-organize is enabled and ungrouped tab count exceeds the threshold, it runs `organize()` followed by `applyGroups()`.

### Context Menu Rebuild

Context menus are rebuilt on:

- Extension install/wake (`onInstalled`)
- Tab group creation, removal, or update
- Rebuilds are serialized via a promise chain (`contextMenuRebuildQueue`) to prevent race conditions from overlapping tab group events.

### In-Memory State

The service worker keeps two in-memory maps that are NOT persisted:

| Map                  | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `openerMap`          | Tracks which tab opened which (for opener-aware routing) |
| `tabActivationTimes` | Tracks when each tab was last activated                  |

Both are bounded at `MAX_TRACKED_TAB_RELATIONS` (5000 entries) with oldest-entry eviction.

---

## Design Decisions

### Why Zero Runtime Dependencies?

Every npm dependency is a supply-chain risk, a bundle-size cost, and a maintenance burden. For a Chrome extension that handles user tabs and sends data to LLM providers, minimizing the attack surface is a security decision. The project proves this is feasible — the entire extension is ~8 KB of compiled JavaScript.

### Why No UI Framework?

The extension has exactly two UI surfaces (popup + settings), both relatively simple. A framework would add build complexity, increase bundle size, and create a dependency. Vanilla DOM with typed helpers keeps the extension lean and auditable.

### Why Chrome-Only MV3?

MV3 is Chrome's current extension platform. Firefox supports it as well, but the `tabGroups` API and certain MV3 behaviors differ. Supporting cross-browser would require abstraction layers that the current codebase doesn't have. This is an explicit non-goal until someone needs it and contributes it.

### Why jsdom for Tests Instead of a Real Browser?

jsdom is fast (full suite in <5 seconds) and sufficient for testing pure logic (storage, grouper, llm) and integration through the message dispatch layer. UI rendering in popup and options pages has light test coverage because jsdom doesn't fully replicate the Chrome extension DOM environment, and headless Chrome testing would add significant complexity.
