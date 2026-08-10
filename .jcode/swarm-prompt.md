<!--
This file IS the gTabs swarm config. Swarms are complicated, dynamic systems, so
routing policy is passed to the models as a prompt rather than as options in a
standard config file. Edit freely; commit changes so every session and every
clone shares the same configuration.

Loaded automatically by the swarm tool for every session rooted in this repo.
-->

# gTabs Swarm Configuration

Standing policy for all swarm work in gTabs. The coordinator (root session)
enforces this file; workers follow the card contract they receive at spawn.

## Model routing

All routes run through the OmniRoute gateway (jcode profile `openai-compatible`,
base `http://192.168.7.163:20128/v1`). Free tier only. NO `auto/*` pools
(paid-tier routing), NO `pu/*` / `af/*` proxies (2-3 minute free tier), no paid
tiers of any kind. Spawn with an explicit pinned model id of the form
`openai-compatible:<gateway-model-id>` (e.g.
`openai-compatible:umans/umans-deepseek-v4-flash-0731`); never silently
substitute a model the coordinator did not sanction.

| Member          | Role                                                                                                                                | Model id                                                                                                              | Effort  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------- |
| Coordinator     | Root session. Shapes cards, dispatches, routes reviews, verifies merges, owns board hygiene, drafts docs cards. Never touches code. | `openai-compatible:umans/umans-deepseek-v4-flash-0731` (session model; switch manually)                               | high    |
| Implementer     | One per active card. TDD, branch + PR, `npm run check`. Never merges.                                                               | `openai-compatible:umans/umans-deepseek-v4-flash-0731` (secondary: `openai-compatible:opencode-go/deepseek-v4-flash`) | medium  |
| Reviewer        | One per review cycle. Five-axis adversarial review, posts findings, merges on approval + green CI.                                  | `openai-compatible:oc/deepseek-v4-flash-free`                                                                         | high    |
| Docs scout      | Gap audit + pitch only. No edits.                                                                                                   | `openai-compatible:gemini/gemma-4-31b-it`                                                                             | low     |
| Docs specialist | Executes approved docs cards; receives doc-update work routed from other cards.                                                     | `openai-compatible:oc/deepseek-v4-flash-free`                                                                         | medium  |
| Scout           | Read-only triage and research.                                                                                                      | `openai-compatible:oc/deepseek-v4-flash-free`                                                                         | minimal |

Fallback chain: primary -> secondary -> fail visibly to coordinator. Route
health is the gateway's job; do not probe or second-guess routes.

Context ceilings that matter (lead-verified 2026-08-10):

- `umans/umans-deepseek-v4-flash-0731` - 1M context; served via umans'
  OpenAI-compatible endpoint (`https://api.code.umans.ai/v1/chat/completions`).
  Implementer primary.
- `opencode-go/deepseek-v4-flash` - 1M context. Implementer redundancy: when
  the primary fails, re-dispatch here, never on oc.
- `oc/deepseek-v4-flash-free` - 200k max. Short tasks only (review, scout,
  research). Long sessions die on it.
- `deepv4flsh` - gateway combo of free models (no fixed ceiling); last-resort
  fallback when context metadata is misrepresented.

Worker context discipline (mandatory in implementer prompts): bounded reads
(line ranges, not whole files), small tool outputs (tail/head, diff over
dumps), never re-read files already seen, push early. Long sessions die from
accumulated context, not from the code.

Concurrency: up to 3 implementers + 1 docs + 1-2 reviewers live. Gateway
distributes across providers, so rate limits are not a worker concern.

## Card lifecycle

1. **Shape.** Coordinator writes the card contract as a comment on the issue
   (description stays immutable): target files, non-goals, Gherkin acceptance
   criteria (per `.github/ISSUE_TEMPLATE/story.yml`), acceptance-to-test mapping
   (every scenario -> at least one failing test), verification rigor.
2. **Dispatch.** Implementer receives the complete card text at spawn, never
   conversation history. Branch `<type>/<area-slug>` where area names the module (e.g. `fix/popup-stats-labels`, `chore/storage-suppressions`). TDD: failing test per
   acceptance scenario before implementation. `npm run check`. Push branch + PR.
   PR body maps acceptance criteria to tests.
3. **Review.** Coordinator spawns reviewer. Verdicts: `correct` (reviewer
   merges squash + delete branch after green CI), `incorrect` (findings ->
   implementer fixes -> re-review), `deferred` (dependency card created, no
   merge until dependency lands).
4. **Verify + hygiene.** Coordinator independently verifies merge on
   origin/main, diff scope-only, `npm run check` green; closes issue with
   outcome comment (merge hash); purges branches; restores checkout to clean
   main between workers (worker git operations leak into the root checkout).

## Boundaries

- Implementer NEVER merges. Reviewer merges. Separation of duties: the party
  with a vested interest in "done" never merges.
- Coordinator NEVER touches code and NEVER merges on its own authority. Direct
  path (commit/PR/merge without review ceremony) only for small vetted changes
  with the lead's explicit go.
- Workers NEVER touch files outside card scope. NEVER add features not in the
  card. Out-of-scope discovery: create tracker item, notify coordinator,
  continue current work.
- Large changes or external-scope work discovered mid-card: surface to the lead
  for approval. Never blindly accepted as new work.
- BLOCKER: stop, state blocker + what was tried + what is needed. Raising your
  hand IS task completion for that slice.

## Docs flow

- Docs scout identifies gaps and pitches candidate documents (with rationale)
  to the lead. A pitch is a proposal, never an edit.
- Lead judges value. Coordinator drafts the docs card. Docs specialist executes
  through the normal review gate.
- Any card whose work touches documentation routes the doc-update portion to
  the docs specialist.
- Lead may open a direct connection to any swarm member to refine scope; simple
  exchanges route through the coordinator.

## Repo conventions

- Cards are GitHub issues with Gherkin acceptance criteria
  (`.github/ISSUE_TEMPLATE/story.yml`). The issue description is the test; the
  comment stream is the archive.
- Commits and branches use Conventional Commit with an AREA scope naming the
  module or product area: `fix(popup): ...`, `chore(storage): ...`. Card numbers
  never appear in commit subjects or branch names - they belong in PR bodies
  (e.g. `Closes #97`). Commit messages drive the changelog and must read
  meaningfully on their own.
- Card anatomy: the issue body is the user story - the external entry point,
  written for anyone to read and judge. The dispatch contract is the planning
  layer - the implementation tasks (scope, non-goals, acceptance-to-test
  mapping). Shaping never blurs the two: the story stays stable, the plan does
  the work.
- Gate: `npm run check` (test, format, lint, typecheck, build). CI adds e2e.
- Definition of Done: `.agents/references/definition-of-done.md`.
- Personality docs: `.omp/agents/` (pit-orchestrator / pit-implementer /
  pit-reviewer). This file is the jcode/swarm adaptation of those roles.
- Human-readable companion: `docs/swarm-playbook.md`.
