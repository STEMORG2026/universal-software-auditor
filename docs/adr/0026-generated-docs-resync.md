# 26. Generated docs resync themselves on PRs

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

Two committed files are byte-compared against the engine on every PR:
`docs/reference/cli.md` (from `--help` + `usa rules`) and
`examples/sample-report.md` (a real audit of the demo app). Any CLI, rule, or
report change — or a bare version bump — turns the next PR red until a human
runs the generators. That is exactly what happened to the 2.1.0 release PR:
five force-pushes of identical bytes re-ran the identical failure, because the
loop was "same content, same red check" and nobody's hands ran the generator.

Generated files that require human hands on every change are not automation;
they are a toil machine with a CI alarm attached.

## Decision

**A `resync` job in `ci.yml` runs the generators and pushes the result back
to the PR branch; the hygiene `--check` gates stay the enforcers.**

On same-repo PRs, after build, CI runs both generators in write mode and, if
either output moved, commits (`docs: resync generated docs`, which passes the
`commits` job's commitlint) and pushes to the PR branch. The re-triggered run
validates green. Boundaries:

- **PR-only.** Master is protected; red hygiene there means a human looks.
- **Same-repo only.** Fork branches are someone else's remote — resolved via
  `gh`, never pushed.
- **Loop-proof.** A second consecutive push is refused (still-dirty after a
  regen means a nondeterministic generator — fail loudly, don't push-spam).
- **No payload text in shell** (SUP-008): refs travel as action inputs, the PR
  number is numeric, the push is `git push origin HEAD`.
- **The push uses a token that triggers workflows.** `GITHUB_TOKEN` is not one:
  a push by it produces a run in `action_required`, so "the re-triggered run
  validates green" was not true — measured on the 2.28.7 release PR, where the
  resync commit fixed the staleness and the PR still showed the failure it had
  just repaired. `resync` now checks out with `CHANGESET_TOKEN`, the same reason
  `release.yml` uses it.
- **Marker sync stays manual** (`sync-docs` encodes author intent).

## Rationale

1. **The check stays honest.** Write-then-check in the same job would make the
   gate vacuous; separate job + re-triggered validation keeps a real assertion.
2. **Least privilege.** The job alone gets `contents: write`; the workflow
   default stays read.
3. **Two-run convergence.** First run heals, second run proves — expect a
   red-then-green cycle on engine/CLI PRs, with no human action.

## Consequences

**Good:** release PRs (pure version bumps) self-heal; no more force-push
loops; generator authors get immediate signal when output isn't deterministic.

**Bad:** one extra CI run per affected PR (a push always re-triggers); a
`docs:` commit appears in PR histories (squash-merged away, and invisible to
release-please since `docs` doesn't bump).

**Neutral:** `sync-docs` marker drift still fails without auto-fix — that gap
is deliberate, and the scheduled docs-review (ADR-0020) covers the residue.
