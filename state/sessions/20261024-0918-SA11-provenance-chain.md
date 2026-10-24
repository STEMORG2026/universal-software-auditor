**Agent:** SA11 (Sathi / WorkBuddy)
**Harness:** WorkBuddy
**History:** not exported — the transcript lives in the harness, not the repo
**Branch:** fix/release-pr-born-red, docs/resync-token-correction, and 16 others, all merged
**Started:** 2026-10-24T09:18+05:45
**Status:** CLOSED
**Closed:** 2026-10-24T17:57+05:45 by owner
**Base commit:** f1a0ebe (master, after #246)

# Session SA11 — the provenance chain, closed end to end

## Objective

Make `publish.yml`'s provenance step work, file a bundle for every published
release, and make the scheduled read-back actually run. The step had failed six
times across six different causes before this session began.

## What was found before anything was changed

`[FACT]` The step was **two defects deep, not one.** #246's export fix was correct
and not sufficient: it moved the failure one line down and revealed that nothing
installed cosign. Fixing that revealed a third — cosign v3 cannot be installed by
`cosign-installer` at all, because v3 publishes `.sigstore.json` and no
`cosign-linux-amd64.sig`, which is the asset the installer verifies against.

`[FACT]` The scheduled read-back had never executed. Only its `run:` block had been
run locally, extracted from the YAML. Dispatched for the first time it failed every
bundle with `unknown flag: --digest`: the job inherited the installer's default
cosign **v2.5.2** while `publish.yml` pins **v2.6.5**.

`[FACT]` Every Version Packages PR was red at creation, and the job that repairs
that was invisible. `resync` regenerated the stale sample and pushed it — with
`GITHUB_TOKEN`, whose pushes produce a run in `action_required`. The repair commit
was never validated, so the PR kept showing the failure it had just fixed.

`[FACT]` ADR 0026 and `docs/ci-integration.md` both stated that the re-triggered
run "validates it green". It did not. **That sentence is why nobody looked.**

## What this session changed

Eighteen PRs merged, #245 through #266. The ones that mattered:

- **#250, #251** — install cosign; then pin it to a v2.x, because v3 is
  uninstallable by that action.
- **#254** — the VSA named `npm pack`'s filename while the attestation named the
  release tarball. Caught by the invariant added in #247, on the first bundle it
  was pointed at.
- **#256** — 2.28.3 recovered from a branch cut at its tag, carrying one file. The
  tarball is byte-identical because `files[]` at that tag excludes `.github/`.
- **#259** — the read-back pinned to the same cosign version as `publish.yml`; a
  test asserts the two agree, because a one-sided bump is the failure mode.
- **#264** — the real fix for release PRs: `version-packages` regenerates the
  generated docs after `changeset version`, `release.yml` builds before versioning,
  and `resync` pushes with the PAT. Proven by the release that followed: the bot's
  rebuild contained the regenerated sample and #260 went green with **no approval
  and no empty commit**.
- **#266** — the two documents that claimed a property the code did not have.

## Not claimed

`[ASSUMPTION]` The Monday 06:30 UTC cron has not fired on its own yet. The
workflow has been dispatched, which exercises the same code path, but the schedule
itself is unproven until it runs.

`[ASSUMPTION]` The 35 judgement checks the audit reports still need a dated human
review. They are not defects — the engine excludes them from the score rather than
counting them as passes — but they are the owner's call, not the agent's.

## Outcome — COMPLETED, awaiting the owner's seal

- master `0bb0144`, **0 open PRs**, `master` the only local branch, tree clean
- **2.28.7 published**, provenance filed (#265) and merged
- `provenance/` covers every published release; read-back green on 2.28.3–2.28.7:
  **15 PASS, 0 FAIL**
- self-audit **100/100**, 93 passed, 0 open findings
- gates: `format:check` clean, `docs:all` 5/5, `check-sessions` 15 sealed 0
  findings, `check-protocol` all passed

## Close

- **Closed by:** owner (Sajan Gurung) — instruction: "close the session."
- **Closed at:** 2026-10-24T17:57+05:45
- **Status at close:** COMPLETED
- **Outcome:** the provenance chain is closed end to end. Every published release has a filed bundle, the read-back runs green in CI, and a Version Packages PR is now green when it is created instead of needing a human to repair it every release. 18 PRs merged, 0 open.
- **Passkey:** none issued — reopening needs an explicit owner instruction that names one, recorded under `## Reopen`
