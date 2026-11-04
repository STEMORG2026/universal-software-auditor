# END-TO-END CHAINS

Thirteen workflows traced from entry point to output. The point is not to re-describe each
component — it is to find defects that only appear when correct components are composed.
Each chain ends with **where it actually breaks**.

## Chain 1 — audit

`path → Project.walk → detect (fixed point) → pack selection → ruleApplies → runCheck →
dampen → suppress → score → render`

| Step     | Contract                                        | Failure mode observed                                             |
| -------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| index    | sorted, bounded, symlink-skipping               | ignored files vanish uncounted (USA-AUD-007)                      |
| detect   | monotone fact accumulation, ≤ 237 passes        | converges provably; no non-convergence path                       |
| select   | `skip_when` + `applies_when` + depth + disabled | **skipped rules are not recorded at all** (USA-AUD-024)           |
| evaluate | 14 kinds, fail-closed on malformed input        | invalid **regex** fails _open_ (USA-AUD-025)                      |
| dampen   | CRITICAL immune                                 | applied to `finding.severity`, not to the score (USA-AUD-003)     |
| suppress | site-level partial waivers correct              | full suppression removes the finding from the score (USA-AUD-005) |
| score    | weight × credit                                 | 166 of the 315 rules never reach it (USA-AUD-024)                 |
| render   | one `AuditReport` → five formats                | warnings are not part of the report (USA-AUD-010)                 |

**Breaks at:** select → score (invisibility), evaluate (regex fail-open), suppress → score
(waiver lever).

## Chain 2 — malformed pack → warning → visible limitation

`rules/index.yaml → loader → validation → warnings[] → CLI stderr`

Observed: unknown operator warns and the rule never applies (A02); duplicate id warns and the
later rule is dropped (A04); malformed `.usa.yaml` refuses with exit 2 (A01). **This chain
works**, and it is the model the rest of the product should follow. The defect is that the
warnings stop at stderr: they never enter the report, so a JSON consumer cannot see them.

**Breaks at:** warnings → report (USA-AUD-010).

## Chain 3 — user-injected fact → applicability → findings

`--fact / .usa.yaml facts: → facts.flags → applies_when → rule set → score`

A user fact such as `lang:python` activates the Python pack. Nothing checks it against
detection, so a JavaScript project can be told it is Python and the Python rules will run —
and the JavaScript rules will not. The fact is not recorded as _asserted_ rather than
_observed_, so the report cannot distinguish the two.

**Breaks at:** fact provenance. No warning, no provenance field. (Recorded as B04 in
`ADVERSARIAL-MATRIX.md`.)

## Chain 4 — suppression → accepted risk → score and action consistency

`suppressions[] → buildSuppressionIndex → applySuppressions → finding.suppressedReason →
score / gate / report`

Site-level logic is correct: a waiver that matches only some locations leaves the finding
active with the rest (verified by reading `applySuppressionToFinding` and by mutation M20,
which the suite kills). Rule-wide waivers remove the finding from the score entirely.

**Breaks at:** score (USA-AUD-005). Report and gate agree; the score does not.

## Chain 5 — unavailable scanner → blind spot → manifest → confidence

`adapter.probe → runGates → status:'unavailable' → manifest → evidence report`

Observed (A13): `⚠️ codeql unavailable … 0 evidence · 0 findings`, exit 0. The blind spot is
named in the scan report — good. But `usa scan` is a separate artefact: the _audit_ report
never learns that a scanner was unavailable, because nothing consumes the manifest.

**Breaks at:** manifest → audit. There is no path.

## Chain 6 — successful scanner → evidence → finding → CWE → report

`spawn → stdout → parse → Evidence[] → findingsOf(adapter) → ScannerFinding[] → ???`

`findingsOf` returns `[]` for all six adapters because none implements `findings()`.

**Breaks at:** evidence → finding (USA-AUD-023). The chain has no consumer, so a successful
scan changes no finding, no score and no gate.

## Chain 7 — foundation → declaration → facts → audit

`foundation.yaml → loader → intents/assertions → facts → applies_when → FND rules → report`

Works, with the distinction the docs promise: a declared intent becomes a fact, and FND rules
check the _setup_, not the capability. Invalid file falls back to defaults.

**Breaks at:** nothing structural. The gap is that a declared intent is indistinguishable
from a detected fact in the report's detection table.

## Chain 8 — OTM import → threat matching → evidence correlation

`model.json → intent/otm → threats[] → CWE → evidence match → OBSERVED/NOT_OBSERVED/UNKNOWN`

The matcher links CWE identifiers to findings. It cannot establish that a mitigation exists:
absence of a finding yields `NOT_OBSERVED`, which reads as "not mitigated" when it means
"no evidence either way".

**Breaks at:** semantics of `NOT_OBSERVED` vs `UNKNOWN`. This is a documentation/claim issue,
not a code defect.

## Chain 9 — report → trailer → verification → comparison

`renderMarkdown → trailer() → sidecar → verifyDetectorSignature → diff`

- Signature binds `trailer(report)` only, so finding text and locations are tamperable
  (USA-AUD-013).
- `usa diff` on a report **with no trailer** renders a complete, confident "No net movement"
  and exits 0 (A10, USA-AUD-026). `--baseline` refuses the same input with exit 2.

**Breaks at:** diff's missing-trailer path — and it breaks _inconsistently_ with the sibling
code path that does it correctly.

## Chain 10 — report → learn → candidate → benchmark → release

`findings → learn/candidate YAML → evolution/benchmark → releaseGate → registry`

`learn` emits REVIEW-REQUIRED candidates. The gate requires precision 1, recall 1, no
regressions, over `examples/evolution/bench` — three cases.

**Breaks at:** quality claim (USA-AUD-016). The mechanism works; the evidence is circular.

## Chain 11 — unsupported technology → bootstrap → review → registration

`detect → uncovered lang → bootstrapPacks → --out → human edits index.yaml → active`

Registration is manual, which is the real gate. `REVIEW-REQUIRED` is a comment nothing reads.

**Breaks at:** nothing unsafe; the marker is advisory (USA-AUD-017).

## Chain 12 — CLI → server → auth → target → audit → storage → report

`POST /api/audits → checkAuth → resolveTarget(realpath) → submit → setImmediate → runAudit →
persistJob → GET /api/audits/:id`

Verified: 401/403/400/200 as designed (A12); hex ids; realpath containment; single-flight 409.

**Breaks at:** `runAudit` returns `{report, warnings, profile}` and the server keeps two of
the three (USA-AUD-010); the synchronous engine blocks the loop the polling endpoint needs
(USA-AUD-011).

## Chain 13 — LLM proposal → validation → human review → engine result

`agent/providers → narrative text → report/narrative → rendered prose`

The model cannot write a finding, a status, a severity or a score — verified by reading every
write path; `runAudit` is the only producer. So the doctrine holds. What is missing is the
_human review_ step the chain implies: narrative prose is rendered into the report with no
provenance marker saying a model wrote it, and no validation of the content against the
findings it describes.

**Breaks at:** the boundary between "the model wrote this sentence" and "the report asserts
this sentence". A reader cannot tell which paragraphs are engine-derived and which are
generated.

## What the chains show

Five of thirteen chains break at a **serialization or composition boundary** rather than
inside a component: warnings → report, manifest → audit, evidence → finding, diff's missing
trailer, server dropping warnings. Each component is individually correct and individually
tested. This is the same lesson as `TEST-AND-VERIFICATION.md`: the suite tests units, and the
defects live between them.
