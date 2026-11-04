# ACCEPTED RISKS AUDIT

Fourteen suppressions in `.usa.yaml`, all fourteen re-verified against the current tree rather
than against their own reason text. The question for each: **is the stated reason still true,
and is it true for the right scope?**

## Per-waiver verification

| #   | Rule                | Waived because                                                | Verified against                                                                                              | Verdict                             |
| --- | ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | CICD-006            | No infrastructure to define                                   | `ls Dockerfile* docker-compose*`, `find -name '*.tf'` → nothing                                               | **VALID**                           |
| 2   | REPO-002 (`.npmrc`) | Scope-to-registry address only, no credentials                | Read `.npmrc`: one `@xenos1996:registry=` line + three pnpm booleans; no `_authToken`, no `_auth`             | **VALID, correctly site-scoped**    |
| 3   | COMP-010            | Root MIT LICENSE covers the repo; no per-file SPDX convention | `LICENSE` present, MIT, 2026                                                                                  | **VALID** (a convention, not a gap) |
| 4   | REL-004             | No staged-rollout surface exists                              | No server, no deploy target, CLI published via npm                                                            | **VALID**                           |
| 5   | AI-007              | No retrieval/vector/tenant machinery                          | `grep -rliE 'embedding\|vectorstore\|pgvector\|chroma\|pinecone\|weaviate\|tenant' src/` → no files           | **VALID**                           |
| 6   | TAS-006             | No jest; thresholds live in vitest                            | No jest dependency; `vitest.config.ts` has `thresholds: {lines:85, functions:90, branches:75, statements:84}` | **VALID**                           |
| 7   | FND-013             | package.json scripts are the task runner                      | 32 scripts incl. `build`, `lint`, `test`, `docs:all`, `release`                                               | **VALID**                           |
| 8   | TAS-005             | Coverage measured in CI, no hosted service                    | `test:cov` in CI; thresholds ratcheted in `vitest.config.ts`                                                  | **VALID**                           |
| 9   | FND-011             | Environment reproducible from checked-in files                | `.nvmrc` + `pnpm-lock.yaml` + scripts; `min: 2` cannot be met without a Dockerfile                            | **VALID**                           |
| 10  | FND-004             | Protection verified via API, not a snapshot file              | `gh api …/branches/master/protection` — see below                                                             | **INCOMPLETE**                      |
| 11  | PY-001              | No Python manifest; one stdlib-only adapter                   | `find -name '*.py'` → exactly one file                                                                        | **VALID**                           |
| 12  | PY-003              | Nothing to pin                                                | `hermes_plugin.py` imports `json, os, subprocess, pathlib, typing` only                                       | **VALID**                           |
| 13  | PY-002              | No Python version to declare                                  | same single stdlib file                                                                                       | **VALID**                           |
| 14  | PY-010              | No Python linter needed for one stdlib file                   | same                                                                                                          | **VALID**                           |

**13 of 14 are sound.** One is materially incomplete.

## The one that is not: FND-004

The waiver says:

> "Protection verified via API, not via a snapshot file: six required checks, no force pushes,
> no deletions, CODEOWNERS review required, stale reviews dismissed."

What the API actually returns:

| Claim                      | Reality                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| six required checks        | **seven** — Lint & format, Test, Build, Validate rule packs, Docs & ADR hygiene, USA audit, Changeset present |
| no force pushes            | ✓ `allow_force_pushes: false`                                                                                 |
| no deletions               | ✓ `allow_deletions: false`                                                                                    |
| CODEOWNERS review required | ⚠ `require_code_owner_reviews: true` **but** `required_approving_review_count: 0`                             |
| stale reviews dismissed    | ✓ `dismiss_stale_reviews: true`                                                                               |
| _(not mentioned)_          | **`enforce_admins: false`**                                                                                   |

Two omissions change the meaning:

1. **`enforce_admins: false`** — the protection does not bind the repository owner. A direct
   push to `master` succeeds for an admin. The waiver's whole argument is "the protection is
   real, it just isn't in a file"; the protection is real for contributors and optional for the
   person who runs the project.
2. **`required_approving_review_count: 0`** — with zero approvals required, the CODEOWNERS
   requirement has nothing to attach to. The claim "CODEOWNERS review required" is nominal.

This matters beyond the waiver. Your own standing rule is that a constraint should be
structurally impossible to break, and your reference implementation of that is
`STEMORG2026/scholarhub` with `enforce_admins: true`. This repository does not have it. So
"never push to main" here is a discipline, not a gate — which is exactly the failure mode you
identified when you wrote the rule down.

**Remediation** (one command, no code): set `enforce_admins: true` on `master`. Keep
`required_approving_review_count: 0` — a single-account repo cannot self-approve, so raising it
would freeze every PR — but then correct the waiver's text to say the CODEOWNERS requirement is
advisory, and state the seven checks.

## Systemic findings about the waivers themselves

**W1 — None of the fourteen has an expiry date.** `.usa.yaml` supports `until:` and the engine
surfaces stale reviews; the repository uses it for zero of its own waivers. Every one is
permanent by default, and "revisit the day X happens" is prose that nothing checks. A waiver
with an expiry is a decision with a review date; a waiver without one is a decision nobody
revisits.

**W2 — Thirteen of fourteen are rule-wide.** Only REPO-002 carries a `file:` scope. A rule-wide
waiver excuses every location for that rule forever, including locations that did not exist
when the reason was written. For the eight rules whose premise is "this project has no X"
(CICD-006, REL-004, AI-007, FND-011, FND-013, PY-*), rule-wide is arguably right — there is no
site to name. For TAS-005/TAS-006/FND-004/COMP-010 a site scope would be tighter and would fail
the moment the project gains the thing.

**W3 — All fourteen matched a finding.** No dead waivers, no waivers suppressing something that
no longer fires. That is a genuinely good result and it is what `appendUnusedSuppressionWarnings`
exists to protect. Credit it.

**W4 — The waivers are the difference between 92 and 100.** Measured in USA-AUD-005. The
reasons are good; the arithmetic is still a lever. Fixing the score arithmetic (USA-R03) makes
these fourteen honest without changing a word of them.

## What to change

| Action                                                                                                                                    | Effort        | Effect                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `enforce_admins: true` on `master`                                                                                                        | one API call  | makes "never push to main" structural in this repo, as it already is in scholarhub |
| Correct the FND-004 text: seven checks, CODEOWNERS advisory, `enforce_admins` now true                                                    | one paragraph | the waiver stops asserting something untrue                                        |
| Add `until:` to the eight premise-based waivers (e.g. the day a Dockerfile lands, the day a second `.py` with a third-party import lands) | 8 lines       | each waiver becomes a decision with a review date                                  |
| Site-scope COMP-010 to `src/**` if the convention is meant to apply there only                                                            | 1 line        | narrower blast radius                                                              |

The first two are the ones that matter. The rest is hygiene.
