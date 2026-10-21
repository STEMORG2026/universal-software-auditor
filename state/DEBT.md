# DEBT.md — Technical Debt Tracker

**Last updated:** 2026-10-01T20:14:40+05:45

---

## Open Debt

### D1 — AGENTS.md "four gates" stale wording

| Field       | Value                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Severity    | Low                                                                                                                  |
| Description | AGENTS.md §6 and §7 say "four doc gates" but `docs:all` now runs **six** (adrs, check, cli, sample, asvs, manifest). |
| Evidence    | AGENTS.md lines 140, 232-233                                                                                         |
| Status      | **Pending — blocked on owner consent** (AGENTS.md is a protected agent file)                                         |
| Fix         | Two-word edit: "four" → "six"                                                                                        |
| Source      | DOCS_AUDIT_REPORT.md G3                                                                                              |

---

### D2 — All branches merged (CLOSED)

| Field       | Value                                                                              |
| ----------- | ---------------------------------------------------------------------------------- |
| Severity    | Low                                                                                |
| Description | All 8 feature/fix branches merged into docs/0042-continuous-ingestion and deleted. |
| Status      | **CLOSED** — 2026-10-01                                                            |

---

### D3 — Pre-commit autosync silently skips without dist/

| Field       | Value                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Severity    | Low                                                                                                                                                                                  |
| Description | `scripts/docs-autosync.mjs` catches missing `dist/` and exits 0 with a warning. By design (CI is the backstop), but means a contributor with no build gets no local fact sync error. |
| Status      | **Accepted** — by design; CI is the backstop                                                                                                                                         |
| Source      | DOCS_AUDIT_REPORT.md G5                                                                                                                                                              |

---

## Closed Debt

| ID  | Description                                        | Closed by                                               |
| --- | -------------------------------------------------- | ------------------------------------------------------- |
| G1  | ASVS coverage `--check` gate absent from CI        | E1: `docs:asvs` added to CI hygiene + resync            |
| G2  | No pre-push doc gate; Layer 1 skips doc governance | E2: `.husky/pre-push` → `build && docs:all`             |
| G4  | No per-repo-file classification registry           | E4: `docs/manifest.yaml` + `scripts/check-manifest.mjs` |

### Closed 2026-10-21 (SA01 — verdict correctness)

| Item                                        | Was                                    | Closed by                                                             |
| ------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `INV-SEC-003` HIGH on every non-web project | N/A assertion read as failure          | `evaluateInvariant` treats a non-applicable assertion as inapplicable |
| `SUP-024` missed cosign bundles             | glob `*.sigstore` vs `*.sigstore.json` | rule matches the name cosign writes                                   |
| `CQ-004` matched doc-comment prose          | `:\s*any\b` unanchored                 | type-position lookahead; `@ts-ignore` still caught                    |
| `CQ-010` fired on rule fixtures             | fixtures are deliberate bad code       | `**/fixtures/**` excluded in the rule                                 |
| `TAS-009` rejected `retry: 0`               | required a non-zero budget             | any declared budget counts                                            |
| `TAS-007` ignored the in-repo harness       | tool-name-only globs                   | recognises `stryker.config.*` and a committed harness                 |
| `ARCH-003` god file (840 lines)             | `src/engine/audit.ts`                  | split into coordinator + 5 modules                                    |
| `ARCH-006` no boundary enforcement          | described in docs only                 | `no-restricted-imports` per layer, verified by breaking it            |

### Open

| ID  | Item                                                                            | Status                                                                                                                                        |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| D4  | `retry: 0` makes any CPU-contention timeout a hard red; the e2e ceiling is 15 s | **Accepted** — contention was measured (1.5–2.4 s alone, >5 s under load); raising the ceiling is the fix, a rerun is not                     |
| D5  | Stryker 10 + vitest 5 reports "0.00 tests per mutant" (all mutants survive)     | **External, watching** — no working third-party mutation gate exists for vitest 5 as of 2026-10-21; the in-repo probe harness is the evidence |

---

## Accepted Risk (in .usa.yaml)

| Rule     | Reason                                                          |
| -------- | --------------------------------------------------------------- |
| CICD-006 | No infrastructure to define (CLI, not a service)                |
| REPO-002 | `.npmrc` carries only scope-to-registry address, no credentials |
| COMP-010 | Single MIT license covers entire repo                           |
| REL-004  | No staged-rollout surface exists                                |
| AI-007   | No retrieval/vector store/tenants                               |
| TAS-006  | No jest in this repo (vitest)                                   |
| FND-013  | npm scripts are the task runner                                 |
| TAS-005  | No hosted coverage service by choice                            |
| FND-011  | No containers needed                                            |
| FND-004  | Branch protection verified via API, not snapshot                |
