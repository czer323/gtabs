# gTabs

gTabs is a Chrome extension for AI-powered tab organization.

## Dependencies / Technologies

- npm - package manager
- typescript - types
- esbuild - build tool
- vitest - tests
- oxlint - linting
- oxfmt - formatting

## Commands

`npm install` - install dependencies
`npm install --save-dev <name>` - add new dev dependency
`npm run check` - full verification: test, format check, lint, typecheck. Does not modify files.
`npm run fix` - auto-fix formatting and lint issues, then run full verification
`npm test` - run unit tests once
`npm run build` - build extension
`npm run lint` - lint with token-saving output - Does not auto-fix
`npm run format` - format files in place
`npm run dev` - watch mode rebuild

## Contributing & Conventions

- **Types**: Keep shared types in `src/types.ts` where they are reused across bundles.
- **UI**: Vanilla TypeScript with plain HTML pages (popup, options). No framework.
- **Storage**: All persistence via `chrome.storage` — see `src/storage.ts`.
- **Tests**: Named `*.test.ts` or `*.test.mjs`, co-located with the code they test — the `.test.` infix in the filename distinguishes them. Run against jsdom with `chrome.*` APIs mocked via `test/setup.ts`.

### Repo Hygiene

- Run `npm run check` before submitting changes.

<!--Karpathy Rules-->

## Karpathy Guidelines Rules

1. **Think before coding.** State assumptions out loud. Surface tradeoffs. Push back when a simpler approach exists. No silent guesses.
2. **Simplicity first.** Minimum code that solves the stated problem. No speculative features. No abstractions for single-use code.
3. **Surgical changes.** Touch only what the task requires. Don't "improve" adjacent code, comments, or formatting. Match existing style.
4. **Goal-driven execution.** Define success criteria up front, then loop until verified. Prefer stating the goal over dictating steps.
5. **Don't make the model do non-language work.** Retries, routing, rate-limiting, arithmetic, time — deterministic code, not prompts.
6. **Hard token budget.** Every loop gets a ceiling. If the same input has been re-chewed for 90 minutes, stop.
7. **Surface conflicts, don't average them.** Two codebase patterns disagreeing → pick one visibly and say why.
8. **Read before you write.** Understand adjacent code before adding new code.
9. **Tests are gated by correctness, not "pass."** Assertions must be tied to behavior, not shape.
10. **Long-running operations need checkpoints.** Commit between steps.
11. **Convention beats novelty.** Use the codebase's established pattern.
12. **Fail visibly, not silently.** Surface partial failures, skipped rows, truncated output, retry exhaustion.
13. **Use Test Driven Development.** Write a failing test before writing code that makes it pass. This MUST be done prior to implementing code.

<!--END Karpathy Rules-->

<!-- Git Workflow -->

#### Stop-and-surface on failure

When CI fails, a test breaks, or a hook blocks:

1. STOP. Do not immediately attempt a fix.
2. Read the actual error output. Quote it.
3. Identify the root cause by examining evidence (CI logs, lockfile, config).
4. If the root cause is in code you wrote: fix it, verify locally, push.
5. If the root cause is in code you did NOT write, or in tooling/config, or if you are unsure: surface it to the user with your diagnosis. Do NOT make changes to working commits without explicit approval.

NEVER treat a symptom (e.g., "add a package to package.json") as a root cause fix.
NEVER make changes to commits that have already been reviewed and approved without explicit user approval.

#### PR troubleshooting

If a PR's status check is not associating or CI is not triggering:

1. Check if the branch is behind main. If so, rebase onto main.
2. Check if the required status checks are configured in GitHub branch protection.
3. If both are correct, wait 60 seconds and refresh — GitHub status association can lag.

NEVER create empty commits to "trigger CI."
NEVER close and reopen a PR to "refresh" status checks.
NEVER delete and re-push a branch as a troubleshooting step.

<!--END Git Workflow -->

<!--CAVEMAN SPEC START-->

# Spec Writing Convention: Caveman Micro

Specs and technical writing in this repo are contracts. Reduce ambiguity. Write specs and contracts in caveman style.

## Rules

- Drop articles (a, an, the), filler (just, really, basically, actually).
- Drop pleasantries (sure, certainly, happy to).
- No hedging. Fragments fine. Short synonyms.
- Technical terms stay exact. Code blocks unchanged.
- Pattern: [thing] [action] [reason]. [next step].

## Where

Applies to spec documents in `docs/specs/`. Does not apply to code comments, commit messages, or casual conversation.

<!--CAVEMAN SPEC END-->

<!--DEPENDENCY PROTOCOL START-->

# Dependency Protocol

Rules for managing dependencies. Reduces lockfile churn and CI surprises.

## Rules

- Add packages via `npm install <name>` or `npm install --save-dev <name>`. Never edit `package.json` or `package-lock.json` by hand.
- After ANY rebase: run `npm install` before pushing. No exceptions.
- CI fails with module-not-found? Run `npm install` locally first. Lockfile likely out of sync. Do NOT add the missing package to `package.json` — the lockfile needs regeneration, not a new dependency.
- If a peer dependency is missing: use `npm install <name>`, not a manual `package.json` edit.
- Verify claims about CI behavior by reading `.github/workflows/ci.yml`. Never assume what CI does — read the config.
- Commit `package-lock.json` alongside any dependency change.

## Why

Hand-editing package.json produces lockfile inconsistencies that pass local checks but fail CI. `npm install` keeps both files consistent.

<!--END DEPENDENCY PROTOCOL-->

<!-- TEST Protocol -->

### Extension API Mocking

NEVER import real `chrome.*` API bindings directly in test files — the extension's background/context APIs are not available in jsdom.

Mock `chrome` entirely via `test/setup.ts`:

```ts
// test/setup.ts already provides chrome mocks — extend there, not per-file
globalThis.chrome = { storage: { local: { get: vi.fn(), set: vi.fn() } } /* ... */ };
```

Use `resetAllMocks()` from `test/setup.ts` between tests — provides a clean mock state so tests don't leak storage or API state into each other.
<!--END TEST Protocol-->
