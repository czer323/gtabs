# Swarm Playbook

How gTabs work flows through the swarm. Companion to `.jcode/swarm-prompt.md`
(the machine-loaded config); this document is the human reference. Read it
before running or joining a gTabs swarm.

## What this is

gTabs ships work through a three-person pipeline, adapted from the pit roles in
`.omp/agents/` (pit-orchestrator, pit-implementer, pit-reviewer). One
coordinator shapes and verifies, implementers build one card each, reviewers
adversarially validate before merge. A docs track runs beside it so
documentation stops being an afterthought.

## Members

| Member          | Count        | Job                                                                                                                       | Model                                                                           |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Coordinator     | 1, always    | Shapes cards, dispatches, routes reviews, verifies merges, board hygiene. Never codes, never merges on its own authority. | `opencode-go/deepseek-v4-pro` (your session model)                              |
| Implementer     | up to 3      | TDD per card, branch + PR, never merges.                                                                                  | `umans/umans-deepseek-v4-flash-0731` (fallback `opencode-go/deepseek-v4-flash`) |
| Reviewer        | 1-2 pool     | Five-axis review, findings on PR, merges on approval + green CI.                                                          | `oc/deepseek-v4-flash-free`                                                     |
| Docs scout      | 1, as needed | Finds doc gaps, pitches candidates. No edits.                                                                             | `gemini/gemma-4-31b-it`                                                         |
| Docs specialist | 1            | Executes approved docs cards; receives routed doc-update work.                                                            | `oc/deepseek-v4-flash-free`                                                     |
| Scout           | 1, as needed | Read-only triage and research.                                                                                            | `oc/deepseek-v4-flash-free`                                                     |

Rules of the road: free tier only, OmniRoute gateway only. No `auto/*` pools,
no `pu/*` or `af/*` proxies. The implementer never merges; the reviewer merges;
the coordinator never touches code. Anything large or external-scope discovered
mid-card gets surfaced to the lead for approval, never auto-accepted.

## Starting a swarm session

1. Open a session rooted at this repo.
2. Switch your session model to `opencode-go/deepseek-v4-pro` (the coordinator
   tier). Everything else loads automatically: `.jcode/swarm-prompt.md` is the
   swarm config.
3. Say what you want, e.g. "run the card pipeline for #88" or "resume the gTabs
   swarm". The coordinator shapes, dispatches, and reports.

## Card lifecycle

1. **Shape** — coordinator posts the card contract on the issue: target files,
   non-goals, Gherkin acceptance criteria, acceptance-to-test mapping (each
   scenario maps to a failing test), verification rigor.
2. **Dispatch** — implementer gets the complete card, works TDD
   (RED -> GREEN -> REFACTOR) on its own branch, pushes a PR whose body maps
   acceptance criteria to tests, runs `npm run check`.
3. **Review** — reviewer reads acceptance criteria and the diff, checks scope
   and docs, posts findings. Verdicts: correct (merge), incorrect (fix and
   re-review), deferred (dependency card first, no merge).
4. **Verify + hygiene** — coordinator confirms the merge on `origin/main`,
   checks the diff is scope-only, closes the issue with the merge hash, purges
   branches.

## Board conventions

- Cards are GitHub issues with Gherkin acceptance criteria
  (`.github/ISSUE_TEMPLATE/story.yml`).
- Commits reference cards: `feat|fix|chore(card #N): ...`.
- Gate: `npm run check`; CI adds e2e.
- Definition of Done: `.agents/references/definition-of-done.md`.

## Backlog triage (2026-08-10)

| Status                          | Issues                                 |
| ------------------------------- | -------------------------------------- |
| Ready (has acceptance criteria) | #88, #89, #90, #91, #11                |
| Needs shaping                   | #5, #6, #7, #8, #9, #10, #12, #13, #15 |
| Reference / revisit later       | #78, #83                               |

Pilot queue: #88 (lint suppressions) then #12 (stats labels), then #90
(duplicate-free groups) as the first hard card.

## Docs flow

1. Docs scout audits README, CONTRIBUTING, `docs/`, CHANGELOG and pitches gap
   candidates with rationale. No edits from a pitch.
2. Lead judges value; coordinator drafts the docs card.
3. Docs specialist executes through the normal review gate.
4. Cards whose work touches documentation route the doc-update portion to the
   docs specialist.
5. Leads can talk to any member directly to refine scope.
