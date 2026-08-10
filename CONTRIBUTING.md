# Contributing to gTabs

Thanks for considering a contribution. This document covers how to set up the project, what we expect from changes, and how to get them merged.

## Table of Contents

- [Quick Start](#quick-start)
- [Development Scripts](#development-scripts)
- [Project Structure](#project-structure)
- [Pull Request Workflow](#pull-request-workflow)
- [Coding Standards](#coding-standards)
- [Pre-Submit Checklist](#pre-submit-checklist)
- [Release Cycle](#release-cycle)

---

## Quick Start

### Prerequisites

- Node.js 20 or later
- npm
- Chrome (or any Chromium-based browser for testing)

### Setup

```bash
git clone https://github.com/vaddisrinivas/gtabs.git
cd gtabs
npm install
npm test              # run all tests
npm run build         # build extension into dist/
```

### Load in Chrome

1. Build the extension: `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode** (toggle top-right)
4. Click **Load unpacked** and select the `dist/` folder
5. Pin gTabs to your toolbar to access the popup

### Watch Mode

```bash
npm run dev           # rebuilds dist/ automatically on source changes
```

---

## Development Scripts

| Command              | Description                               |
| -------------------- | ----------------------------------------- |
| `npm test`           | Run all tests (Vitest)                    |
| `npm run test:watch` | Run tests in watch mode                   |
| `npm run build`      | Build extension into `dist/`              |
| `npm run dev`        | Watch mode — rebuilds on file change      |
| `npm run package`    | Create `gtabs-extension.zip` from `dist/` |

---

## Project Structure

```
src/
  types.ts           All interfaces and types used across the project
  storage.ts         Chrome storage wrapper — reads, writes, migration, decay
  grouper.ts         Prompt builder, LLM response parser, domain rules
  llm.ts             Provider-agnostic LLM client
  background.ts      Service worker — orchestrates all features
  popup.ts / .html   Action popup UI
  options.ts / .html Full settings page
  *.test.ts          Co-located tests (one per source module, plus integration)
scripts/
  build.ts           esbuild configuration and bundling
  check.ts           Quality gate runner (test, format, lint, typecheck)
vitest.setup.ts      Chrome API mocks and storage fakes
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a deeper breakdown of how the modules fit together.

---

## Pull Request Workflow

### For small changes (typos, docs, one-line fixes)

Open a pull request directly. No issue needed.

### For new features or non-trivial changes

1. **Open an issue first** to discuss the idea before writing code. This avoids wasted effort if the change doesn't fit the project's scope.
2. **Keep PRs focused** — one change per PR. A PR mixing a bug fix, a refactor, and a feature takes much longer to review.
3. **Use Conventional Commit prefixes** — the changelog and next version are
   derived from commit messages at release time, so describe what each merged
   change does via its commit prefix.
4. **Run the full test suite** before opening the PR.
5. **Write a clear description** — explain what the change does and why.

### What happens after submission

A maintainer reviews within a few days. Expect questions and requests for changes — this is normal. Once approved, the PR is squash-merged into `main`.

---

## Coding Standards

### Language & Runtime

- TypeScript with `strict: true` in `tsconfig.json`. Code must compile under strict mode.
- Target ES2022 — modern JavaScript features are fine.
- Chrome MV3 extension APIs only. No Firefox or Safari support currently planned.

### Dependencies

**Zero runtime dependencies.** Only `devDependencies` are allowed in `package.json`. Before adding an npm package, check whether a browser API or a short utility function already covers the need. The project already includes helpers for deep cloning, HTML escaping, and array chunking.

### Naming

| Convention                          | Examples                                    |
| ----------------------------------- | ------------------------------------------- |
| Files: `kebab-case.ts`              | `background.ts`, `grouper.ts`               |
| Types/interfaces: PascalCase        | `GroupSuggestion`, `WeightedAffinityMap`    |
| Functions: camelCase, verb-first    | `applyGroups`, `getSettings`, `buildPrompt` |
| Constants: UPPER_SNAKE_CASE         | `MAX_HISTORY`, `DECAY_HALF_LIFE_MS`         |
| File-level mutable state: camelCase | `openerMap`, `tabActivationTimes`           |

### Error Handling

- Chrome API calls that can fail because a tab was closed between async operations use try/catch with empty catch blocks — this pattern is intentional and used throughout.
- Message handlers catch all errors and return `{ type: 'status', status: 'error', error: string }`.
- User-facing validation returns `{ error: string }` rather than throwing.

### Testing

- **Framework:** Vitest with jsdom environment. Chrome APIs are mocked globally in `vitest.setup.ts`.
- **New functions** with non-trivial logic must have unit tests.
- **New message handlers** should have an integration test that exercises the full dispatch path (see `integration.test.ts` for the pattern).
- **No network calls in tests** — mock `fetch` and Chrome APIs. Full suite should complete in under 5 seconds.

---

## Pre-Submit Checklist

- [ ] `npm test` passes
- [ ] `npm run build` completes without errors
- [ ] Code compiles under TypeScript strict mode (`npx tsc --noEmit`)
- [ ] No new runtime dependencies added
- [ ] New features have test coverage
- [ ] New message types added to the `MessageType` union in `types.ts`
- [ ] Commits follow the Conventional Commits prefixes (see Release Cycle)
- [ ] No hand-edits to version or `CHANGELOG.md` — those are generated at release

---

## Release Cycle

Releases are versioned and published from `main` by release automation
(semantic-release). The repo owner drives releases; the process, versioning
rules, validation, and troubleshooting are defined in the
[Release Contract](docs/semantic-release-plan.md). Read it before releasing.

In short:

- Versions and the changelog are derived from Conventional Commit messages — do
  **not** hand-edit `version` in `package.json`/`manifest.json` or hand-edit
  `CHANGELOG.md`. Release automation keeps them in lockstep.
- Triggers happen on push to `main`. Only commits with `feat`/`fix`/`perf`
  produce a release; everything else is a no-op by design.
- The release commit carries `[skip ci]` so it does not loop CI.
