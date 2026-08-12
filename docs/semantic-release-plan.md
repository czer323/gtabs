# gTabs Release Contract

How gTabs stays releasable and keeps its releases healthy. This is a standing
maintenance contract, not an implementation plan; implementation lives in the
GitHub cards. The repo owner owns releases. This doc defines the decoupled
release process used by gTabs and how maintainers keep it honest.

## What this is

semantic-release derives the next version and the changelog from commit
messages (Conventional Commits) and publishes a tagged GitHub Release. It runs
in CI on `main`, only when a release is actually warranted. Two consequences
follow, and every rule below exists to keep them true:

- **The repo owner never hand-edits versions.** `package.json` and
  `manifest.json` are versioned together at release time, not by hand.
- **Version bumps and release notes flow from commits, not from memory.** If a
  change is not described in a conventional commit, it does not exist for
  release purposes.

The release contract is one genre of repo hygiene, like CONTRIBUTING. Read it
alongside [CONTRIBUTING](../CONTRIBUTING.md) (which references it under
Release Cycle) and the GitHub story cards under `docs/`.

## Why a contract and not a script

A release pipeline's health depends on human discipline as much as on config.
Most failures are not code bugs; they are commit hygiene lapses and owner
process gaps. This document makes the discipline explicit so failures are
troubleshootable instead of mysterious. The GitHub cards specify the concrete
tooling; this contract specifies the standing behavior around it.

## Version truth

gTabs carries the version in two places that must stay identical:

- `package.json` — the semantic-release source of truth.
- `manifest.json` — copied verbatim into `dist/` at build time; this is the
  version Chrome displays on `chrome://extensions`.

Because the two must agree, **no one bumps either file by hand** once release
automation is live. Both are updated together by the release process. A manual
edit that leaves them out of sync is a release defect and a contract violation,
not a nitpick.

The versioning scheme is SemVer. Meaning is derived from commit prefixes:

| Commit prefix | Release impact |
| ------------- | -------------- |
| `feat`        | minor bump     |
| `fix`         | patch bump     |
| `perf`        | patch bump     |
| anything else | no release     |

A breaking change forces a major bump. Two ways to mark it, per the
[Conventional Commits spec](https://www.conventionalcommits.org/):

- A `!` before the colon after the type or scope: `feat!:` or `feat(api)!:`.
- A `BREAKING CHANGE:` footer on any commit type.

This mapping is governed by the analyzer configuration in release automation
and is cited from [semantic-release's versioning docs](https://semantic-release.org/).

## Standing process

### Per change (each commit, each PR)

- Write Conventional Commit messages. `feat:` for user-visible features,
  `fix:` for corrections, `perf:` for performance, `chore:`/`docs:`/`refactor:`
  for everything else.
- Reference the card in the commit where relevant (per the card conventions
  in `AGENTS.md`).
- Do not bump versions and do not hand-edit the changelog on a feature branch
  or PR. Those happen once, at release time, from commits.
- Keep PRs one change per PR so each merged commit describes exactly one thing.

### Per release (repo owner)

Releases are triggered by pushing to `main`. The workflow:

1. Verify CI is green on `main` — the release job only runs after verification
   succeeds.
2. The release job runs semantically-release. If the merge since the last
   release contains no `feat`/`fix`/`perf`, it is a no-op release: no version
   bump, no tag, no GitHub Release. That is correct and expected.
3. If a release is warranted, the job:
   - bumps `package.json` (and `manifest.json`, kept in lockstep),
   - updates `CHANGELOG.md`,
   - commits the version/changelog changes back to `main`
     (a `[skip ci]` release commit),
   - tags the new version,
   - publishes a GitHub Release carrying the built extension zip.
4. Record nothing by hand. The changelog and tag are the records; the GitHub
   Release is the announcement.

Official process reference: [semantic-release — "Trigger a release"](https://semantic-release.org/).

### Packaging

The distributable is the zip built from `dist/`, produced by the release
pipeline (see the `package` script in `package.json`). The zip is a build
artifact: it is never committed and lives only on the GitHub Release. Local
`npm run package` remains available for manual inspection.

## Validation

Before relying on any release, confirm:

- [ ] `package.json` and `manifest.json` show the same version.
- [ ] `CHANGELOG.md` top entry matches the tagged version.
- [ ] A git tag `vX.Y.Z` exists on `main` for the released version.
- [ ] The GitHub Release exists with the extension zip attached.
- [ ] The release commit on `main` carries `[skip ci]` and did not loop CI.
- [ ] Expected changes are absent from the changelog only because the commit
      itself was a no-op (no `feat`/`fix`/`perf`) — never because a real change
      was forgotten in its commit message.

## Troubleshooting

The release pipeline fails into visibility: a failed run surfaces as an issue
or a failed workflow, not a silent no-op. When something looks wrong, check in
order:

1. **Wrong version or missing release** — did the merge actually contain a
   `feat`/`fix`/`perf` commit? No such commit means no release by design. A real
   change with a non-conventional message usually means the message, not the
   pipeline, is at fault.
2. **`package.json` and `manifest.json` disagree** — a hand edit happened
   despite the contract. Re-sync them at the next release; do not accumulate
   drift.
3. **Changelog missing an entry** — the change's commit lacked a conventional
   prefix, or was never released because no version-inducing commit followed.
4. **CI loop after release** — the release commit's `[skip ci]` guard is not
   being honored. Check the release commit message and the workflow triggers.
5. **Authentication or merge-push failures** — the release job needs write
   permissions to `main` and a token that can push the `[skip ci]` release
   commit under branch protection. See the release workflow config in the cards.

If a fix targets the pipeline config, it happens through the normal
card/PR/review process — never by hand-editing the workflow on `main`.

## Sources

- [semantic-release docs](https://semantic-release.org/)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
- [semantic-release versioning / commit analysis](https://semantic-release.org/learn/usage/commit-analysis)
- [semantic-release GitHub Actions recipe](https://semantic-release.org/recipes/ci-configurations/github-actions/)

<!-- Keep this contract in sync with CONTRIBUTING.md "Release Cycle". -->
