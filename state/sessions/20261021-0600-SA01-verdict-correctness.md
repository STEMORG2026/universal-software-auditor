**Agent:** SA01 (Sathi / WorkBuddy)
**Branch:** fix/verdict-correctness
**Started:** 2026-10-21T05:58+05:45
**Status:** COMPLETED
**Base commit:** d1289a4 (master)

# Session SA01 — Verdict correctness and production readiness

## Objective

Owner instruction: "Complete Universal_Software_Auditor completely, make it
production ready." Interpreted as: every gate green _and_ every open finding
either fixed or shown to be a defect in the auditor itself — not suppressed,
not silenced.

## Starting state (measured, not assumed)

| Gate        | Result                                                           |
| ----------- | ---------------------------------------------------------------- |
| `typecheck` | pass                                                             |
| `lint`      | pass, 0 warnings                                                 |
| `test`      | 1323 passed, 1 skipped                                           |
| `docs:all`  | pass (6 gates)                                                   |
| self-audit  | **94.2/100 (beta)** — open: HIGH 1 · MEDIUM 1 · LOW 1 · FUTURE 5 |

The HIGH was `INV-SEC-003`, and it was wrong.

## Findings — four of the six open findings were auditor defects

1. **`INV-SEC-003` (HIGH, false positive).** `SEC-008` (input validated) passed,
   so the invariant demanded `SEC-009` (HTML output encoding) be PASS. `SEC-009`
   is `NOT_APPLICABLE` to a CLI that renders no HTML, and the assertion path read
   N/A as failure. `src/engine/invariants.ts` now treats a non-applicable
   assertion as inapplicable — matching the module's own "fail closed toward
   silence" contract.
2. **`SUP-024` (MISSING, false positive).** Rule globbed `**/*.sigstore`;
   cosign writes `<artifact>.sigstore.json`. Every cosign-signed repo failed.
   `provenance/v2.26.2.sigstore.json` was sitting in the tree the whole time.
3. **`CQ-004` (FAIL, false positive).** `:\s*any\b` matched the prose
   "Degraded-never-empty: any fetch/HTTP/parse failure". Fixed with a
   type-position lookahead. **Rejected:** masking comments in the engine —
   `@ts-ignore` lives in a comment, and the CQ-004 fixture proves it must still
   be caught. A generic `ignore_comments` engine flag was built, tested, then
   removed: its only consumer could not use it.
4. **`CQ-010` (WRONG, false positive).** Fired on `tests/fixtures/rules/
CQ-010.yaml` — a file whose _purpose_ is to contain a TODO. Excluded
   `**/fixtures/**` in the rule (not in `.usa.yaml`: a global ignore also hid
   the fixtures from `TAS-011`, which then failed).
5. **`ARCH-003` (LOW, real).** `src/engine/audit.ts` was 840 lines. Split into
   `audit.ts` (163) + `audit-types`, `audit-config`, `pack-selection`,
   `evaluate-packs`, `audit-warnings`, `report-build`. Public API unchanged
   (`runAudit`, `AuditOptions`, `AuditOutcome`).
6. **`TAS-009` (MISSING, rule defect).** Required `retries: [1-9]`, so an
   explicit `retry: 0` scored as absent. Zero is the stricter policy.
7. **`TAS-007` (MISSING, rule defect).** Knew only pre-v6 Stryker filenames and
   third-party tool names. This repo's `tests/integration/auditor-mutation.test.ts`
   mutates every rule check and asserts its fixture flips — ~100 probes per CI
   run — and scored as no evidence. Rule now recognises `stryker.config.*` and a
   committed harness.
8. **`ARCH-006` (FUTURE).** Now enforced: `no-restricted-imports` forbids
   util→engine/report/cli/serve and engine/report→cli/serve. **Verified by
   breaking it** — adding `import { runAudit } from '../engine/audit.js'` to
   `src/util/glob.ts` produced the expected lint error; file restored.

## Dead end, recorded so it is not repeated

Attempted to satisfy TAS-007 with Stryker 10 (`core` + `vitest-runner`,
peer range `vitest >=2.0.0`). Installed cleanly, config loaded, 74 mutants
instrumented — then **every mutant survived and the run reported "Ran 0.00
tests per mutant"** under both `coverageAnalysis: perTest` and `all`, against
vitest 5. A 0% score is not a working gate, so the config was removed rather
than committed. A config file proves someone installed a tool; the harness
proves the question was asked.

Side effect worth knowing: a failed Stryker run leaves `.stryker-tmp/sandbox-*`
directories whose `node_modules` is a symlink, which makes the self-audit emit
symlink-skipped warnings and fails `tests/e2e` "audits itself without warnings".

## Also changed

- `src/foundation/interview.ts`: the `config as unknown as Record<string, unknown>`
  double cast replaced with a narrowing `objectView()` that throws a named error
  on a non-object path segment.
- `vitest.config.ts`: `retry: 0` (declared, not defaulted) and `testTimeout: 15_000`.
  Four e2e cases passed alone at 1.5–2.4 s and timed out at the old 5 s ceiling
  under a full parallel run — contention, not logic. With `retry: 0` that had to
  be fixed at the ceiling, not papered over with a rerun.
- `examples/sample-report.md` regenerated (ruleset fingerprint + rule text).

## Verification

| Gate           | Result                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| `typecheck`    | pass                                                                   |
| `lint`         | pass, 0 warnings                                                       |
| `test`         | **1325 passed**, 1 skipped                                             |
| `docs:all`     | pass (6 gates)                                                         |
| `format:check` | pass                                                                   |
| self-audit     | **100/100 — no open findings**, 34 judgement-queue items unchanged     |
| CLI smoke      | fresh repo: 46.8/100 prototype, correct warnings; 315 rules / 32 packs |

## Open

- PR awaiting owner review. The agent does not merge.
- 34 judgement-queue items stay `UNKNOWN` by design (ADR-0023): a review is
  provenance, not a verdict. Two of them (`REPO-003`, `DEP-002`) resolve with
  `--allow-commands`.

### 01:36 — Commit

`6db35e9` chore(state): reconcile after #188 merged, record the merge order

### 01:57 — Commit

`c5492ea` chore(deps-dev): bump the dev-dependencies group

### 09:57 — Commit

`b5d32a9` feat(scanner): evidence-first adapter layer with Tier-1 scanners

### 10:44 — Commit

`903541f` feat(scanner): evidence-first adapter layer with Tier-1 scanners

### 12:02 — Commit

`287af5d` feat(scanner): tier 2 adapters for Scorecard and ORT
