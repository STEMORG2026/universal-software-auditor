# Integration plan — scanner adapters into USA

```text
CURRENT ARCHITECTURE
   usa audit → rule engine (315 rules, 32 packs, YAML) → score → markdown/json/sarif
   oracle evidence already exists (committed artifact + numeric bound, ADR-0011)
                ↓
PROPOSED INTEGRATION BOUNDARY
   A parallel subsystem `src/scanner/**` that produces Evidence + a run manifest.
   It never writes verdicts into AUDIT.md and is never imported by src/engine/**.
   The bridge that DOES exist is the oracle check reading scanner artifacts.
                ↓
NEW MODULES
   src/scanner/{types,registry,run,normalize,report}.ts, src/scanner/adapters/*.ts
   src/cli-scan.ts + `usa scan` command
   rules/scanners.yaml (threshold rules over committed artifacts)
                ↓
DATA MODEL CHANGES
   None to existing types. New: Evidence, ScannerAdapter, ScannerFinding,
   RunManifest. Scanner verdict vocabulary gains UNAVAILABLE, mapped to
   UNKNOWN + coverage event when it reaches a rule.
                ↓
TIER 1 INTEGRATIONS      (this change)
   1. trivy              — available on this machine, verified-run (v0.75.0)
   2. dependency-cruiser — documented CLI; JSON exits 0 even with violations
   3. semgrep            — documented CLI; JSON shape [UNVERIFIED] pending capture
   4. codeql             — opt-in, heavyweight; command construction + SARIF parse
                ↓
TESTS
   Per adapter: argv construction (no tool), parse of a captured fixture, empty /
   malformed / truncated input, probe-reported UNAVAILABLE. Runner: timeout and
   output bound. End-to-end where the tool is installed, loud skip where it is not.
                ↓
MIGRATION RISKS
   R1 `usa audit` semantics change accidentally → guarded by the unchanged 1325-
      test suite plus a golden-report diff.
   R2 Executing project code via a build command → `allowBuildCommands` is false
      by default and the flag is asserted in a test.
   R3 New dev-dependencies for the adapters → none: only the `yaml` runtime dep
      and a subprocess runner, so DEP-004 (redundant deps) is unaffected.
   R4 docs gates (manifest, taxonomy) failing on new docs → handled in this change.
```

## Sequenced work

| Step | Deliverable                                                                    | Status      |
| ---- | ------------------------------------------------------------------------------ | ----------- |
| 1    | `docs/research/**` (10 tool documents + capability matrix)                     | **done**    |
| 2    | `docs/architecture/**` (evidence, finding, adapter, integration)               | **done**    |
| 3    | Adapter contract + runner + registry + CLI (`src/scanner/**`, `usa scan`)      | this change |
| 4    | Tier-1 adapters with fixtures and unit tests                                   | this change |
| 5    | End-to-end: `usa scan` on `fixtures/insecure-app`, evidence → finding → report | this change |
| 6    | Trend (two-run diff) and requirement/control consumption of evidence           | next change |
| 7    | Tier 2 adapters (Scorecard, ORT)                                               | next change |

## What "done" means for step 3–5

- `usa scan <path>` runs all enabled adapters, writes a run manifest and evidence
  artifacts, and prints which adapters ran, which were `UNAVAILABLE`, and why.
- `pnpm test` covers every adapter's command construction and parsing with
  captured fixtures, without needing a scanner installed.
- `usa audit` output is byte-identical to before (modulo the report's own
  timestamp), proving the existing system is untouched.
- A deliberately vulnerable fixture yields at least one evidence item with a
  stable id, a location, and a `raw_reference`.

## What is explicitly not in this change

Requirement/control/threat consumption, the trend engine, SARIF _output_ of
evidence (the existing SARIF renderer covers rule findings), any LLM integration,
and any second adapter for a tool already covered.
