# COMPONENT AUDIT

Two artefacts, deliberately separate:

- `inventories/components.csv` — **all 100 production files**, with line count, layer,
  examination status and the findings attached to each.
- This document — the health scorecard at the level a reader can act on.

## Coverage accounting (read this before trusting anything below)

| Category                | Identified |                      Fully examined |                                             Partially examined | Not examined |
| ----------------------- | ---------: | ----------------------------------: | -------------------------------------------------------------: | -----------: |
| Production source files |        100 |                                  11 |                                                             32 |           57 |
| Production lines        |     21 567 |                         2 662 (12%) |                                                    8 940 (41%) |  9 965 (46%) |
| Rule packs              |         32 |  32 (registry + applicability read) |                                                              — |            — |
| Individual rules        |        315 |             0 semantically verified |                                   315 inventoried mechanically |            — |
| Detector primitives     |        236 |                                   0 |                                                236 inventoried |            — |
| Check kinds             |         18 |                      14 (used ones) | 4 (unused: `file_absent`, `tracked_present`, `oracle`, `info`) |            — |
| Scanner adapters        |          6 |          1 (trivy, read + executed) |                                   5 (registry + contract read) |            — |
| CLI commands            |         22 |                         6 exercised |                                                  16 enumerated |            — |
| Server routes           |          4 |                                   4 |                                                              — |            — |
| Report formats          |          5 | 4 exercised (md, json, sarif, html) |                                       1 (narrative, read only) |            — |
| ADRs                    |         47 |                                   0 |                           6 cited where they bear on a finding |           41 |
| Docs (manifest)         |        155 |                                   9 |                                                              — |          146 |

**This audit did not semantically verify 315 rules.** It inventoried all 315 mechanically
(id, pack, section, kind, severity, class, applicability, automatability, fixture presence)
and verified the _engine_ that evaluates them. A rule's pattern can be wrong while every
gate stays green; nothing in this audit establishes otherwise for the 315. That limitation
is the largest single gap in the work and is recorded again in `RESIDUAL-RISKS.md`.

## Scorecard

Rating rubric as specified in the brief (0–2 broken, 3–4 significant weakness, 5–6 functional
but limited, 7–8 good with manageable weakness, 9 strong, 10 exceptional). A rating is not a
substitute for a finding, and no average of these numbers means anything.

| Component                                                     | Responsibility                  | Health             | Rating | Confidence | Security                                              | Tests                                 | Weaknesses                                                         | Disposition                              |
| ------------------------------------------------------------- | ------------------------------- | ------------------ | -----: | ---------- | ----------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| `util/project.ts`                                             | one-pass index, grep, git facts | NEEDS IMPROVEMENT  |      6 | High       | **Weak** — ReDoS, gitignore asymmetry                 | Indirect (globs tested)               | 736 lines; 4 responsibilities; no regex bound                      | **Keep, harden** (USA-AUD-004/007/019)   |
| `util/glob.ts`                                                | glob→regex                      | HEALTHY            |      8 | High       | Good                                                  | 13/13 adversarial cases passed        | Brace/`**`/anchoring all correct                                   | **Keep**                                 |
| `util/env.ts`                                                 | `.env` loader                   | WEAK               |      4 | High       | **Weak** — reads cwd of the audited repo              | None found                            | Mutates `process.env` globally                                     | **Restrict scope** (USA-AUD-008)         |
| `util/yaml.ts`                                                | coercers                        | HEALTHY            |      7 | Medium     | Good (no eval, no anchors)                            | Covered via loader                    | Thin, single-purpose                                               | **Keep**                                 |
| `engine/loader.ts`                                            | pack load + validate            | HEALTHY            |      8 | Medium     | Good — fails closed                                   | Strong                                | 724 lines; validation and defaults interleaved                     | **Keep**                                 |
| `engine/evaluate.ts`                                          | 14 of the 18 check kinds        | NEEDS IMPROVEMENT  |      7 | High       | Good except `command` (opt-in shell)                  | Fixtures per rule                     | Kind dispatch is a long if-chain; `sh -c` inherits full env        | **Keep, split**                          |
| `engine/evaluate-packs.ts`                                    | two-pass orchestration          | NEEDS IMPROVEMENT  |      6 | High       | Good                                                  | Indirect                              | Hosts the doc-universe breach                                      | **Keep, extract docs**                   |
| `engine/score.ts`                                             | the number                      | **DEFECTIVE**      |      5 | High       | n/a                                                   | Weak (no suppression-arithmetic test) | Suppression raises score; dampening ignored; `overall`=0 on empty  | **Redesign** (USA-AUD-005/006/020)       |
| `engine/maturity.ts`                                          | dampening                       | HEALTHY            |      8 | High       | Good (integer guard, CRITICAL immune)                 | Good                                  | Its output is ignored by the score                                 | **Keep** (fix consumer)                  |
| `engine/gate.ts`                                              | `--fail-on`, `--baseline`       | NEEDS IMPROVEMENT  |      7 | High       | Good                                                  | Good                                  | Consumes dampened severity, so a profile is a bypass               | **Keep, decide semantics** (USA-AUD-003) |
| `engine/suppression.ts`                                       | waivers                         | NEEDS IMPROVEMENT  |      6 | Medium     | Governance risk                                       | Good                                  | No cap on breadth; no expiry enforcement at gate time              | **Keep, harden**                         |
| `engine/diff.ts`                                              | report comparison               | HEALTHY            |      7 | Medium     | Good                                                  | Good                                  | Cannot distinguish rule-catalogue change from project change       | **Keep**                                 |
| `engine/audit.ts`                                             | orchestration                   | HEALTHY            |      8 | Medium     | Good                                                  | Strong                                | 163 lines, readable, correct order                                 | **Keep**                                 |
| `engine/docs-*` (4 modules)                                   | documentation universe          | WEAK               |      5 | Low        | Unknown                                               | Its own suite                         | 1 300 lines inside the scoring loop; second engine                 | **Extract to its own command**           |
| `scanner/run.ts`                                              | process execution               | **DEFECTIVE**      |      3 | High       | **Critical** — RCE, false isolation claim             | Timeout/parse tested; hijack not      | The only executing module and the least defended                   | **Redesign** (USA-AUD-001/002/009/012)   |
| `scanner/{registry,identity,normalize,sarif,config,types}.ts` | adapter contract + evidence     | HEALTHY            |      7 | Medium     | Good                                                  | Good                                  | Evidence identity is sound; `unknown→LOW` mapping worth revisiting | **Keep**                                 |
| `scanner/adapters/*` (6)                                      | tool integration                | PARTIALLY VERIFIED |      6 | Low        | Inherits runner's weakness                            | Adapter-level tests                   | Only trivy was executed here                                       | **Keep**                                 |
| `report/markdown.ts`                                          | primary renderer                | HEALTHY            |      8 | High       | Good — trailer keys escaped, fence handling careful   | Good                                  | Trailer omits finding text (see USA-AUD-013)                       | **Keep**                                 |
| `report/sarif.ts`                                             | SARIF 2.1.0                     | HEALTHY            |      7 | Medium     | Good                                                  | Structural                            | Emits locations correctly (verified on demo-app); no `artifacts[]` | **Keep**                                 |
| `report/json.ts`                                              | machine format                  | NEEDS IMPROVEMENT  |      6 | High       | Good                                                  | Good                                  | No warnings channel                                                | **Keep, extend** (USA-AUD-010)           |
| `report/html.ts`                                              | HTML renderer                   | PARTIALLY VERIFIED |      6 | Low        | Not reviewed for injection                            | Light                                 | Exists despite roadmap exclusion                                   | **Keep, review escaping**                |
| `report/narrative.ts`                                         | prose renderer                  | PARTIALLY VERIFIED |      6 | Low        | n/a                                                   | Light                                 | 511 lines of presentation logic                                    | **Keep**                                 |
| `report/signature.ts`                                         | verify-only cosign              | HEALTHY            |      8 | High       | Good — no signer, fail-closed                         | Good                                  | Binds trailer only                                                 | **Keep, widen payload** (USA-AUD-013)    |
| `serve/server.ts`                                             | HTTP layer                      | HEALTHY            |      7 | High       | Good — loopback, timing-safe token, no CORS, body cap | Good                                  | No Host check; drops warnings                                      | **Keep** (USA-AUD-010)                   |
| `serve/jobs.ts`                                               | job manager                     | NEEDS IMPROVEMENT  |      6 | High       | Good — realpath containment, hex ids                  | Good                                  | Blocks the event loop                                              | **Keep** (USA-AUD-011)                   |
| `serve/ui.ts`                                                 | single page                     | PARTIALLY VERIFIED |      5 | Low        | Not reviewed                                          | None found                            | Polls an endpoint that cannot answer mid-run                       | **Keep**                                 |
| `evolution/*` (9 modules)                                     | self-extension                  | NEEDS IMPROVEMENT  |      5 | Medium     | Good — registry untouched                             | Good                                  | 3-case benchmark; quality claim unsupported                        | **Keep, re-scope** (USA-AUD-016)         |
| `foundation/*` (4)                                            | declared intent                 | PARTIALLY VERIFIED |      6 | Low        | Good — invalid file fails safe                        | Good                                  | Assertions vs facts distinction is real but thin                   | **Keep**                                 |
| `intent/*` (3)                                                | OTM matching                    | PARTIALLY VERIFIED |      5 | Low        | Good                                                  | Light                                 | CWE linking ≠ threat-model assurance                               | **Keep, be honest in docs**              |
| `live/*` (3)                                                  | conversational session          | PARTIALLY VERIFIED |      6 | Low        | Good — deterministic fallback                         | Good                                  | Adds a second state model beside the report                        | **Keep**                                 |
| `agent/*` (3)                                                 | LLM providers                   | HEALTHY            |      7 | Medium     | Good — cannot write verdicts                          | Good                                  | `.env` injection path reaches it                                   | **Keep** (USA-AUD-008)                   |
| `bootstrap/*` (2)                                             | pack generation                 | HEALTHY            |      7 | High       | Good — never registers                                | Good                                  | `REVIEW-REQUIRED` is advisory                                      | **Keep** (USA-AUD-017)                   |
| `learn/`                                                      | rules from reports              | PARTIALLY VERIFIED |      5 | Low        | Good — writes only on `--out`                         | Light                                 | Same review gap as bootstrap                                       | **Keep**                                 |
| `detect/index.ts`                                             | facts + maturity                | HEALTHY            |      7 | High       | Good                                                  | Good                                  | Maturity score is heuristics a repo can satisfy cheaply            | **Keep**                                 |
| `cli*.ts` (11 files)                                          | drivers                         | HEALTHY            |      7 | High       | Good                                                  | Good                                  | No per-command help                                                | **Keep** (USA-AUD-018)                   |
| `types.ts`                                                    | domain model                    | HEALTHY            |      9 | High       | n/a                                                   | n/a                                   | The best-designed file in the repo                                 | **Keep**                                 |
| `config.ts`                                                   | `.usa.yaml`                     | HEALTHY            |      7 | Medium     | Good                                                  | Good                                  | Suppression breadth uncapped                                       | **Keep**                                 |

## The four components that decide whether this product is trustworthy

1. **`engine/score.ts`** — it produces the number. It is 197 lines and it currently has
   three independent calibration defects (USA-AUD-005, 006, 020). Fixing this file changes
   what the product _means_ more than any other work available.
2. **`scanner/run.ts`** — the only module that executes foreign code. It is also the only
   module whose security posture is asserted rather than implemented.
3. **`util/project.ts`** — everything reads through it, and it has both the availability
   defect and the blind-spot asymmetry.
4. **`engine/gate.ts`** — the CI contract. It inherits whatever the maturity layer says.

Those four are ~1 700 lines of 21 567. The audit's recommendation is disproportionate
attention on 8% of the code.
