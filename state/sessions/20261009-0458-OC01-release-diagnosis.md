**Agent:** OC01 (opencode)
**Model:** opencode/longcat-2.5-preview-free
**Branch:** fix/release-oidc-and-git-cli
**Started:** 2026-10-09T04:58:12+05:45
**Status:** IN-PROGRESS
**Base commit:** 7f25fbf

# Session OC01 — Release Pipeline Diagnosis

## Objective

Continue the work on USA. Dashboard next steps were (1) release pending
changesets and (2) review dependabot PRs #176–#180. Discovered the release
itself is broken — diagnose before touching (AGENTS.md step 0).

## Findings (all verified)

1. **v2.26.1 never published.** npmjs latest = 2.26.0 (verified via
   `npm view --@xenos1996:registry`). Version commit `a4e5e7c` is on master
   (consumed 3 changesets) but the publish leg failed.
2. **release.yml failing since 2026-10-01** (last success 2026-09-27).
   Two independent failure modes:
   - **Version path** (Oct 1, Oct 8 03:32): `Resource not accessible by
personal access token - .../git/refs#delete-a-reference`. The
     CHANGESET_TOKEN PAT cannot delete the `changeset-release/master` ref.
     The version commit `6754d93` (2.26.1) WAS pushed to the branch and
     PR #174's body updated — the run then failed at cleanup.
   - **Publish path** (Oct 8 04:21+): `ENEEDAUTH` — `NODE_AUTH_TOKEN: ''`
     is explicitly empty in release.yml:121 (added in e91538e, Sep 17).
     The job has `id-token: write` but no step mints the OIDC token.
3. **PR #174 stale** — head `02dc0a44` not in master; its content (2.26.1
   bump) is already in master via `a4e5e7c`. mergeable=UNKNOWN (conflict).
4. **PR #180 stuck in approval quarantine** — 5 workflows at
   `action_required` (Automerge, Protocol enforcement, Self audit, CodeQL,
   CI). Per AGENTS.md this is the bot-push quarantine, not a failure;
   maintainer re-runs by ID.
5. **Dependabot #176–#179 green** — codeql-action patch bumps (×3),
   pnpm/action-setup 6.0.10→6.1.0. Awaiting review/merge.
6. **Local gates green** — typecheck ✅, 1323 tests pass ✅, master clean,
   local == origin/master.

## Root causes (proven, AGENTS.md step 0)

- **Publish:** `NODE_AUTH_TOKEN: ''` poisons the setup-node `.npmrc`
  `${NODE_AUTH_TOKEN}` substitution and blocks npm's OIDC auto-fetch
  (npm ≥ 11.15 with `id-token: write` + `registry-url` — the official
  "no token needed" trusted-publishing flow). Fix: remove the empty env var.
- **Version:** changesets/action v2 defaults `push-with-git-cli` to false,
  so `pushChanges` uses `@changesets/ghcommit` `commitChangesSinceBase`
  (force), whose `finally` block calls `octokit.rest.git.deleteRef` on a
  temp branch. The PAT cannot delete refs. Fix: `push-with-git-cli: true`
  (uses `git push --force` with the checkout PAT, which can push).

## Fix applied

Branch `fix/release-oidc-and-git-cli`:

- release.yml: removed `NODE_AUTH_TOKEN: ''`; added `push-with-git-cli: true`.
- Unblocked CI (red on master since Oct 1): classified docs/macp.md in
  manifest.yaml + docs/README.md index, added `usa:allow-claim` to the
  macp.md section-count claim in AGENTS.md, regenerated examples/sample-report.md.

## Open questions

- Is the npmjs Trusted Publisher config still valid? docs/release.md says
  "done" but it is owner-side and cannot be verified from here.
- The PAT ref-delete failure may be a fine-grained PAT permission gap —
  needs owner decision on PAT scopes if `push-with-git-cli: true` is not
  sufficient.

## Next

Open PR, then housekeeping: close #174, re-run #180's stuck workflows,
review dependabot #176–#179.

### 02:17 — Commit

`e42286a` docs: unblock CI — classify macp.md, sync sample report, allow-claim sections count

### 02:37 — Commit

`4dbf9e2` fix(security): override shell-quote and source-map-js to patched versions

### 03:17 — Commit

`cd18647` fix(release): point package.json repo URLs at STEMORG2026
