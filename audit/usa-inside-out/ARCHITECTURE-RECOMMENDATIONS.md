# ARCHITECTURE RECOMMENDATIONS

The question is not "what would be cleaner" but "what is the minimum change that makes the
product trustworthy". Four changes clear the bar; everything else is optional.

## Preserve, without reservation

1. **The one-pass index and the linear pipeline.** `index → detect → select → evaluate →
dampen → suppress → score → gate → render` is correct, testable, and has no state that a
   later stage can reach back into. Do not introduce a plugin host, an event bus, or a
   service split. The linearity is the product.
2. **`types.ts`.** The Severity/Status split is the best idea in the repository: impact and
   outcome are orthogonal, and every downstream confusion in this audit traces to a place
   that forgot it (scoring uses impact where it means outcome).
3. **Data-driven applicability.** 236 detectors, `skip_when`/`applies_when`, fail-closed
   predicates. Adding a stack requires no TypeScript. This is the mechanism that makes
   "universal" more than a slogan.
4. **The per-rule fixture gate.** 205/205 coverage on deterministic rules with a CI gate.
5. **Verify-only provenance.** No signer, `cosign` verification, no minting. Rare restraint.
6. **The `command`/`oracle` split.** Deterministic → assist → manual is an honest taxonomy.

## Change 1 — Make the score mean one thing (P1)

**Current.** `score.ts` weights by `ruleWeight(rule)` (base severity), excludes UNKNOWN and
NOT_APPLICABLE from the denominator, and excludes suppressed findings entirely. Dampening
moves `finding.severity` but not the weight.

**Limitation, demonstrated.** 100 → 92 by removing waivers; identical 37.3 across profiles;
45.3 for an empty repo; 100 at 66% coverage.

**Proposed.** One decision, written as an ADR: the score is **absolute** (stage-independent,
waiver-independent) and is always printed with its coverage. Concretely:

- denominator includes suppressed zero-credit findings (they stop being a lever);
- `overall` is `null`, not `0`, when nothing resolved;
- the headline is `score / coverage`, never score alone;
- maturity keeps affecting _labels, ordering and the gate_ — and the gate's use of dampened
  severity becomes an explicit, documented policy decision rather than an accident.

**Trade-off.** Scores drop for projects that had waivers (this repo: 100 → 92). That is the
point. **Complexity** S. **Risk** low; the arithmetic is 20 lines. **Acceptance** the three
property tests named in USA-AUD-005/006/020 pass, and the self-audit prints `92 / 100 · 66%
verified · 13 accepted risks`.

## Change 2 — Make the scanner boundary real (P0)

**Current.** `spawnSync(argv[0])` with `PATH = target/node_modules/.bin : …`; allow-listed
env; scratch copy; `network: 'denied'` in the manifest.

**Limitation.** Project code executes (USA-AUD-001); the manifest asserts isolation that does
not exist (USA-AUD-002); timeout kills one PID (USA-AUD-009).

**Proposed, in order of cost:**

1. Spawn `probe.executable` (absolute, resolved by the auditor). One line. Removes the RCE.
2. Delete `network: 'denied'`; emit `enforced: false` until something enforces.
3. `detached: true` + kill the process group on timeout.
4. Optional OS isolation behind `--isolate` (`bwrap`/`sandbox-exec`/container), recorded in
   the manifest only when it actually ran.

**Trade-off.** A project-local scanner no longer works without an explicit
`--scanner-from-project` flag (which should record the absolute path and a hash).
**Complexity** S–M. **Risk** low. **Acceptance** the hijack fixture cannot execute.

## Change 3 — Separate the documentation universe from scoring (P2)

**Current.** `evaluate-packs.ts` runs `docs-audit` inside the main evaluation and injects
synthetic `Rule` objects into the scored set.

**Limitation.** 1 300 lines of a second engine inside the first one's scoring loop; the
score accepts rules no pack authored; `score.ts` must tolerate a synthetic shape.

**Proposed.** `usa docs audit` already exists as a command. Have the main audit _consume_
its result as a sub-report with its own score and coverage, rather than merging its findings
into the global denominator. One section (S12) can still summarise it.

**Trade-off.** The global score no longer includes documentation findings — arguably correct,
since documentation completeness is a different question from assurance. **Complexity** M.
**Risk** medium (score changes). **Acceptance** S12 renders from the sub-report; no
synthetic `Rule` is constructed.

## Change 4 — One warnings channel, in the report (P2)

**Current.** `runAudit` returns warnings beside the report; markdown prints them; JSON and
SARIF do not; `serve` discards them.

**Proposed.** `warnings` becomes part of `AuditReport`, serialized in every format
(SARIF: `invocations[].toolExecutionNotifications`). Add the missing counter for
gitignored files so the channel is complete.

**Complexity** S. **Risk** low. **Acceptance** a truncated audit carries the warning in all
four formats and in a served job.

## Explicitly NOT recommended

| Proposal                              | Why not                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Plugin system / dynamic check kinds   | The registry-as-code boundary is why the engine is auditable. A plugin host imports every problem in USA-AUD-001 into the core. |
| A second analysis engine (AST, taint) | CodeQL and Semgrep exist and are already integrated. Map their results into verdicts; do not rebuild them.                      |
| Splitting into services               | The product's value is one process, one pass, one file.                                                                         |
| Rewriting the reporters               | They are correct. Extend the warnings channel; leave the rest.                                                                  |
| Rewriting the rule language           | `grep` limitations are real but the fix is evidence ingestion (`oracle`), not a new DSL.                                        |

## Target architecture, in one paragraph

Keep the linear engine. Shrink `score.ts` to a function whose semantics are stated in one
ADR and tested by three properties. Replace the scanner's PATH trick with an absolute
executable and an honest manifest. Move the documentation universe out of the scoring loop
and behind its own command. Put warnings in the report instead of beside it. That is four
changes, roughly 400 lines, and it converts the product's central claim — _you can trust
what this says it verified_ — from an aspiration into a property.
