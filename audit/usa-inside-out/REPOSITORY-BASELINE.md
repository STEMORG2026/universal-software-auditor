# REPOSITORY BASELINE

Recorded 2026-10-31 before any file was written by this audit.

## Git state at start

```
branch      master
HEAD        3767c7df5638253431c489f2750fe1c1e7a25321
subject     feat(macp): take the standalone runtime as the source of truth, and fix the
            two defects the port exposed (#275)
date        2026-10-26 20:04:33 +0545
status      clean (0 modified, 0 untracked)
tags        59 local / 59 remote
```

## Git state at end

Working-tree changes introduced by this audit only (no commits, no pushes):

```
audit/usa-inside-out/**          new — this audit's artefacts
ROADMAP.md                       modified — revised roadmap (deliverable L)
docs/manifest.yaml               modified — review date for ROADMAP.md
```

No file under `src/`, `tests/`, `rules/`, `templates/`, `action.yml`, `package.json`,
`pnpm-lock.yaml`, `.github/` or `docs/adr/` was touched. Verified with
`git status --porcelain` at the end; see `RESIDUAL-RISKS.md` for the exact command.

## Tag-shape anomaly (pre-existing, not introduced here)

Tags are `v2.x.y` up to `v2.25.1`, then switch to `@xenos1996/usa@2.x.y`. This is the
subject of the case study in `AGENTS.md` ("the tag shape") and is consistent with
`docs/release.md`: `PnpmTool.isMonorepoRoot` decides the tag prefix, and the prefix flipped
when the repo became a pnpm workspace. Not a defect; recorded because a consumer resolving
`v2.28.8` will not find it.

## Package

| Field           | Value             |
| --------------- | ----------------- |
| name            | `@xenos1996/usa`  |
| version         | 2.28.8            |
| type            | module (ESM)      |
| engines.node    | >=20.0.0          |
| dependencies    | `yaml@^2.6.1` (1) |
| devDependencies | 16                |
| scripts         | 32                |

## Size

| Artefact                     | Count                    |
| ---------------------------- | ------------------------ |
| Production TypeScript files  | 100                      |
| Production lines             | 21 567                   |
| Test files (`tests/**/*.ts`) | 92                       |
| Files under `tests/`         | 305                      |
| Test cases (vitest)          | 1 627 passing, 1 skipped |
| Rule packs registered        | 32                       |
| Rules                        | 315                      |
| Rule fixtures                | 205                      |
| Detector primitives          | 236                      |
| ADRs                         | 47                       |
| Docs (manifest-tracked)      | 155                      |
| Scanner adapters             | 6                        |
| CLI commands                 | 22                       |

Largest production modules: `util/project.ts` 736, `engine/loader.ts` 724,
`engine/docs-invariants.ts` 722, `engine/evaluate.ts` 697, `engine/docs-audit.ts` 586,
`scanner/run.ts` 536.

## Branches and unmerged work

`master` is the trunk and is clean. Six local branches carry unmerged commits; all of them
are MACP (the repository's own session protocol) work, none touch the audit engine.

| Branch                     | Ahead / behind `master` | State                                         |
| -------------------------- | ----------------------- | --------------------------------------------- |
| `feat/submit-not-terminal` | 53 / 2                  | largest; MACP submit/close semantics          |
| `feat/macp-runtime-v2`     | 23 / 6                  | MACP runtime port                             |
| `audit/macp-enforcement`   | 16 / 5                  | MACP enforcement audit                        |
| `feat/plan-item-scope`     | 5 / 3                   | `start --plan` scope                          |
| `docs/plan-and-scope`      | 2 / 4                   | docs only; same commit as `pre-protocol/sa17` |
| `pre-protocol/sa17`        | 2 / 4                   | superseded by `docs/plan-and-scope`           |
| `chore/close-sessions`     | 0 / 0                   | already merged                                |

These branches are the only in-flight product work in the repository, and none of it is in
the deterministic engine, the rules, the scanners or the reporters. The audit engine on
`master` is therefore not awaiting an in-flight change.

## Open pull requests

| PR   | Title                                      | State                                                                 |
| ---- | ------------------------------------------ | --------------------------------------------------------------------- |
| #277 | `chore(master): release`                   | all checks green, mergeable — the changesets Version Packages PR      |
| #276 | `chore(deps-dev): bump vite 8.3.4 → 8.3.5` | **2 failing checks**: `Changeset present` and `Resync generated docs` |

PR #276 has been red since 2026-10-26. It is a dev-dependency bump, which does not touch a
shipped path, so `Changeset present` failing is the workflow's rule being applied to a PR
type it does not exempt — and `Resync generated docs` failing means the generated docs
disagree with the branch. Neither is caused by the audit; both are recorded because they
are the only red signal in the repository and a reader will ask.

## Gates actually run by this audit

| Gate           | Command                    | Result                                                                                 |
| -------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| Typecheck      | `pnpm run typecheck`       | exit 0                                                                                 |
| Lint           | `pnpm run lint`            | exit 0, no warnings                                                                    |
| Docs (6 gates) | `pnpm run docs:all`        | exit 0 (`doc manifest: OK — 155 tracked docs · 84 standalone · 180-day review window`) |
| Tests          | `pnpm test`                | exit 0 — 87 files, 1 627 passed, 1 skipped                                             |
| Self-audit     | `node dist/cli.js audit .` | exit 0 — 100/100, 0 CRITICAL, 0 HIGH, 36 UNKNOWN, 14 suppressed                        |

Not run, with reasons: `pnpm run format:check` (read-only formatting gate, low information
value once lint and docs pass — **not verified**); `pnpm run build` (dist/ was already
present and current enough to execute; a rebuild would rewrite tracked-adjacent output —
**not verified**); `pnpm run test:cov` (would rewrite `coverage/` — **not verified**);
`pnpm run protocol:*` (session-protocol gates unrelated to the audit engine);
`usa evolve` (state-mutating by design, excluded by the brief).
