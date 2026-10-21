# Integration architecture

## The direction is one-way

```text
Repository
   ↓
Scanner adapters        (tool-specific; refuse to know what a finding is)
   ↓
Evidence normalization  (tool-agnostic; knows nothing about tools)
   ↓
Finding engine          (policy; reads evidence, applies rules)
   ↓
Requirement / Architecture / Policy engines
   ↓
Trend engine            (pure function of two runs)
   ↓
Reporting               (markdown / json / sarif — never a score by itself)
   ↓
LLM                     (explanation only; may cite evidence, may not create it)
```

The arrows are compile-time constraints, not conventions: `src/scanner/**` cannot
import from `src/engine/**`, and the rule packs cannot name a scanner. If a
scanner ever needs to know about a rule, the design has failed.

## Why the existing engine is untouched

The audit already has a rule engine, a rule pack format, a maturity model, a
score, a suppression ledger, a review ledger, a diff and a SARIF renderer. The
scanner layer is added _beside_ it, not under it:

- `usa audit` continues to work exactly as before. No rule semantics change.
- Scanner results enter through the **evidence** path, and where a rule should
  judge them, the existing `oracle` check kind already proves the shape
  (ADR-0011): read a committed artifact, assert a bound, verdict.
- The only new module the core gains is `src/scanner/**`, plus a new CLI command
  (`usa scan`) that writes artifacts, not verdicts into `AUDIT.md`.

This is the cheapest possible integration boundary and it is testable by a
definition: the full existing suite (1325 tests) must pass unchanged.

## Module layout

```text
src/scanner/
├── types.ts          Evidence, ScannerAdapter, ScannerFinding, RunManifest
├── registry.ts       the adapter list; adding an adapter touches nothing else
├── run.ts            the one runner: spawn, timeout, bound, sandbox, manifest
├── normalize.ts      tool output → Evidence (pure; only adapters import it)
├── report.ts         run manifest + evidence → markdown / json artifacts
└── adapters/
    ├── trivy.ts          [done — verified-run against v0.75.0]
    ├── dependency-cruiser.ts
    ├── semgrep.ts
    └── codeql.ts

src/rules/scanners.yaml  (rule pack for threshold-style rules over evidence)
tests/fixtures/scanners/ captured real tool output
```

## Data model changes

None to existing types, with two deliberate additions:

- `Run` / `Evidence` / `ScannerFinding` in `src/scanner/types.ts` — new types, no
  field added to `Finding`.
- A new check kind is **not** required: `oracle` already ingests a commit-artifact
  and asserts a bound; scanner artifacts are committed artifacts.

The scanner _verdict_ vocabulary (`UNAVAILABLE`) differs from the rule
`Status` vocabulary on purpose — the scanner layer runs before policy, and its
`UNAVAILABLE` maps to `UNKNOWN` + a coverage event when it reaches a rule. See
`finding-model.md`.

## Execution boundary in the CLI

```text
usa audit .            # unchanged; rules over the checkout
usa scan .             # NEW; run adapters, write .usa/evidence/<execution-id>/
                       #      + reports/scanner-evidence.md, then (opt-in) diff
                       #      against the previous run to produce a trend
```

`usa scan` is safe to run on any checkout because it never writes inside the
target and never executes project code (`allowBuildCommands` defaults to false).

## Security boundaries (restated as enforcement)

| Threat                                | Enforcement                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Executing project code                | nothing the engine starts is project-authored; build commands are opt-in, recorded, and sandboxed to a scratch copy |
| Credential leakage into tool children | `HOME`, `*_TOKEN` env vars stripped except an explicit allow-list                                                   |
| Exfiltration by a scanner             | network denied by default; declared-needs-network adapters print in the manifest                                    |
| Resource exhaustion                   | timeout per adapter, output bound, working set in a scratch dir                                                     |
| Untrusted tool output                 | parsed defensively; malformed → `UNKNOWN`, never a crash, never a PASS                                              |
