---
'@xenos1996/usa': minor
---

Four verdict-correctness fixes, found by auditing the auditor.

- **Invariants no longer fire on a rule that does not apply.** `INV-SEC-003`
  reported a HIGH finding on any project with input validation but no HTML
  output surface (this CLI included), because a `NOT_APPLICABLE` assertion was
  treated as a failure. An invariant is a claim about a _combination_; when one
  half of the combination does not exist there is nothing to assert.
- **`SUP-024` matches `*.sigstore.json`.** cosign's default bundle name is
  `<artifact>.sigstore.json`; the glob `*.sigstore` never matched it, so every
  cosign-signed project was told it had no signature bundle.
- **`CQ-004` stops reading prose.** `:\s*any\b` matched doc-comment sentences
  ("Degraded-never-empty: any fetch failure") and reported a type escape that
  did not exist. The type-escape branch now requires a type position; the
  `@ts-ignore` branch still reads comments, because that is where directives
  live.
- **`TAS-009` accepts an explicit zero retry budget**, and `TAS-007` recognises
  Stryker's post-v6 `stryker.config.*` plus a committed mutation harness. Both
  rules previously scored the stricter, more honest answer as absent.

Also: `src/engine/audit.ts` (840 lines) is split into a coordinator plus five
modules (`audit-config`, `pack-selection`, `evaluate-packs`, `audit-warnings`,
`report-build`), the layer boundaries between them are enforced by
`no-restricted-imports`, and the test suite declares `retry: 0` with a 15s
ceiling for the e2e cases that spawn the CLI.

Self-audit after the batch: 100/100, no open findings.
