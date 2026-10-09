# Plan: OC01 — Release Pipeline Repair

**Agent:** OC01 · **Created:** 2026-10-09T04:58+05:45 · **Status:** PROPOSED

## Objective

Repair `release.yml` so the publish path mints an OIDC token (fixing
ENEEDAUTH) and the version path stops failing on ref deletion, then ship
v2.26.1 which is on master but unpublished.

## Scope

- `.github/workflows/release.yml` — mint OIDC token, remove empty
  `NODE_AUTH_TOKEN: ''`, address PAT ref-delete failure.
- Close stale PR #174 (content already in master via a4e5e7c).
- Re-run PR #180's 5 stuck workflows (approval quarantine, per AGENTS.md).
- Review/merge dependabot #176–#179 (green, low-risk).

## Approach

1. **Prove the OIDC mechanism before patching** (AGENTS.md step 0): the
   workflow has `id-token: write`; npmjs Trusted Publisher is configured
   per docs/release.md. The mint pattern is `core.getIDToken()` via
   actions/github-script, exported as NODE_AUTH_TOKEN. Verify against
   current npm/GitHub docs before writing the patch.
2. Patch release.yml on a branch (`fix/release-oidc-mint`), open PR.
3. After merge, trigger release (workflow_dispatch) and **verify the
   effect**: npmjs shows 2.26.1, publish.yml ran, tag exists, provenance
   PR opened. Never trust the status icon.
4. Separately: close #174, re-run #180 workflows, review dependabot.

## Risks

- npmjs Trusted Publisher config may have expired (owner-side, unverifiable
  from here) — if minting fails, the owner must re-check npmjs settings.
- PAT ref-delete failure may be a fine-grained PAT permission gap — needs
  owner decision on PAT scopes.
- Release machinery is load-bearing; a bad patch blocks all releases.

## Rollback

- Workflow changes are a normal PR — revert the PR if red.
- Do not hand-push tags or versions.

## Success criteria

- release.yml green on a test run.
- npmjs `@xenos1996/usa` = 2.26.1.
- publish.yml ran (GPR mirror, SBOM, attestation, provenance PR).
- PR #174 closed, #180 checks green, dependabot reviewed.
