# CLAIMS VERIFICATION

Every claim in the supplied report, checked against commit `3767c7df`. The repository is
authoritative; the report is an inventory of claims.

Status values: **CONFIRMED** (matches the tree), **WRONG** (the tree contradicts it),
**OUTDATED** (was true, no longer), **INCOMPLETE** (true but materially partial),
**UNVERIFIED** (could not be established).

## Summary

Of 27 checked claims: **19 confirmed, 4 wrong, 1 outdated, 3 incomplete.**

The single largest error in the supplied report is the rule count: it asserts a **685-rule** catalogue;
the tree ships **315**. The README badge (`315+`) is correct and the report is not. Every
downstream statement that depends on 685 — rule-count comparisons, "double the catalogue of
v2.25", coverage arithmetic — is unsupported.

## Counts

| Claim                               | Source | Actual (measured)                                                                                                           | Verification                                | Status                                               |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Version 2.28.8                      | report | `package.json` 2.28.8; tag `@xenos1996/usa@2.28.8` exists                                                                   | `node -e require('./package.json').version` | CONFIRMED                                            |
| Runtime Node >= 20                  | report | `engines.node: ">=20.0.0"`                                                                                                  | `package.json`                              | CONFIRMED                                            |
| ESM + TypeScript                    | report | `"type": "module"`, `tsc` strict, 100 `.ts` files / 21 567 lines                                                            | `find src -name '*.ts'`                     | CONFIRMED                                            |
| **685-rule claim**                  | report | **315** (`index.yaml` → 32 packs, 315 rules, 0 duplicate ids)                                                               | inventory script over `rules/`              | **WRONG**                                            |
| 32 rule packs                       | report | 32 listed in `rules/index.yaml`; 39 YAML files under `rules/` (7 are data, not packs)                                       | same script                                 | CONFIRMED                                            |
| 236 detector primitives             | report | 236 entries in `rules/detectors.yaml`                                                                                       | `detectors.length`                          | CONFIRMED                                            |
| 16 kinds of check                   | report | **18** declared in `src/types.ts`; **14** used by shipped rules (`file_absent`, `tracked_present`, `oracle`, `info` unused) | `types.ts:127-199` + kind census            | **WRONG**                                            |
| Six scanner adapters                | report | 6: trivy, semgrep, codeql, dependency-cruiser, scorecard, ort                                                               | `ls src/scanner/adapters`                   | CONFIRMED                                            |
| Five maturity stages                | report | prototype, mvp, beta, production, legacy                                                                                    | `types.ts:48`                               | CONFIRMED                                            |
| Eight foundation intents            | report | `rules/core/foundation.yaml` = 14 of the 315 rules (FND-001–014)                                                            | pack census                                 | UNVERIFIED — "intents" is a different axis; see note |
| Ten assurance categories            | report | 10 in `rules/categories.yaml`; **5 have zero rules** (networking, communication, ux, vision, protocol)                      | `usa categories`                            | INCOMPLETE                                           |
| Four report formats                 | report | **5**: `md`, `json`, `sarif`, `narrative`, `html`                                                                           | `cli-audit.ts:32`                           | **WRONG**                                            |
| 19 CLI commands                     | report | **22** top-level commands                                                                                                   | `usa --help`                                | **WRONG**                                            |
| Local-only server                   | report | binds `127.0.0.1` hard-coded, no flag to change it                                                                          | `server.ts:158`                             | CONFIRMED                                            |
| No runtime deps other than YAML     | report | `dependencies: { yaml: ^2.6.1 }`; 16 devDeps                                                                                | `package.json`                              | CONFIRMED                                            |
| No plugins                          | report | true at runtime: no loader, no plugin API. But new check kinds and adapters require TypeScript edits                        | see Architecture                            | INCOMPLETE                                           |
| No daemon                           | report | true; `usa serve` is a foreground process, no background service                                                            | —                                           | CONFIRMED                                            |
| No auto-fixing                      | report | no code path writes to the audited tree; `init`/`bootstrap`/`learn` write only on explicit `--out`                          | grep for writes                             | CONFIRMED                                            |
| CRITICAL never dampened             | report | `dampen()` returns early on CRITICAL                                                                                        | `maturity.ts:161`                           | CONFIRMED                                            |
| Fail-closed predicate handling      | report | unknown operator → `false`; malformed predicate → `false`; invalid regex → `false`                                          | `evaluate.ts:33-102`                        | CONFIRMED                                            |
| UNKNOWN and N/A excluded from score | report | both return before credit accrual                                                                                           | `score.ts:130,154-157`                      | CONFIRMED                                            |
| Scanner failure is a blind spot     | report | `unavailable`/`timeout`/`error` statuses, never a PASS                                                                      | `run.ts:381-418,462-485`                    | CONFIRMED                                            |
| Content-addressed evidence          | report | `identity.ts` hashes evidence fields; provenance stamped centrally                                                          | `run.ts:488-490`                            | CONFIRMED                                            |
| LLM proposes, engine verifies       | report | LLM layer cannot write findings, statuses or scores; `runAudit` is the only writer                                          | `agent/`, `report/narrative.ts`             | CONFIRMED                                            |
| Controlled capability evolution     | report | candidate → benchmark → release gate, registry untouched                                                                    | `evolution/release.ts`                      | INCOMPLETE (see USA-AUD-016)                         |
| REVIEW-REQUIRED bootstrap/learn     | report | emitted as a header; not read by the loader                                                                                 | `bootstrap/index.ts:14-22`                  | INCOMPLETE (see USA-AUD-017)                         |
| Offline deterministic core          | report | core makes no network calls; scanners are opt-in and gated                                                                  | see SECURITY-ASSESSMENT §Network            | CONFIRMED                                            |
| Same tree → same report             | report | two runs byte-identical **except** the timestamp (2 occurrences)                                                            | `diff /tmp/usa-a1.md /tmp/usa-a2.md`        | CONFIRMED with caveat                                |
| Self-audit passes                   | report | 100/100, exit 0, 0 CRITICAL/HIGH                                                                                            | `usa audit .`                               | CONFIRMED — and see USA-AUD-005/006                  |

## Note on "eight foundation intents"

The foundation model has _intents_ (declared promises, authored per project) and a
_rule pack_ (`core/foundation`, 14 of the 315 rules). The report's "eight" matches neither count. I
could not find a list of exactly eight intents in the tree; `src/foundation/types.ts`
defines the shape, and `.usa/foundation.yaml` (if present) supplies the instances. This
repository has no `.usa/foundation.yaml`, so the claim is unverifiable here rather than
wrong. It is recorded as UNVERIFIED, not as a defect.

## Claims the report makes that the repository does not support

1. **"685-rule" claim** — the headline number is 2.2× the truth. If the report was generated from
   a different branch or a future plan, that must be stated; as written it is simply wrong.
2. **"16 kinds of check"** — 18 declared, 14 exercised. Both numbers matter and they differ;
   the report gives neither.
3. **"Four report formats"** — five ship, including an HTML renderer that the project's own
   roadmap lists as deliberately _not_ planned (USA-AUD-021).
4. **"19 CLI commands"** — 22.
5. **"315+ badge vs 685 actual"** — the premise is inverted. The badge is right.

## What the report got right, and that deserves saying

The architectural description is accurate in every structural respect I checked: one-pass
indexing, data-driven packs, 236 detectors, six adapters, a deterministic engine with an
LLM layer that cannot write verdicts, fail-closed predicates, CRITICAL immunity, and
UNKNOWN exclusion. The report's _model_ of the system is sound. Its _numbers_ are not.
