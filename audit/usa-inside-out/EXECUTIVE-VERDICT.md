# EXECUTIVE VERDICT

**USA is a well-built audit engine with an untrustworthy headline number and an unsound
scanner boundary. It is not yet safe to point at code you do not trust, and its 100/100
self-audit is 92/100 once its own waivers are set aside.**

## The verdict, in ten lines

1. **What it is** — a linear, deterministic, data-driven checklist engine: 315 rules in 32
   packs over 236 detectors, 21 567 lines, one dependency, no daemon, no plugin host.
2. **Maturity** — genuinely mature as _software_: strict TypeScript, 1 627 tests, 205
   per-rule fixtures, 12+ CI gates, branch protection, trusted publishing, 46 ADRs.
   Immature as _assurance_: no measured precision on any rule, no held-out corpus, no
   calibration of the score.
3. **Can its results be trusted?** The verdicts are reproducible and the arithmetic is
   correct. The _summary_ is not trustworthy: it reports "100" where it means "100 of the
   66% we could answer", and it rises when findings are waived.
4. **Worst weakness** — the scanner runner executes the audited repository's own binaries
   (`node_modules/.bin/<scanner>`) and then attributes the output to the real tool version.
5. **Worst conceptual weakness** — maturity dampening changes every severity label, the
   gate's exit code, and not the score by a single point.
6. **Best decisions worth preserving** — the Severity/Status split; fail-closed predicates;
   data-driven applicability; the per-rule fixture gate; verify-only provenance; no signer.
7. **Must stop until fixed** — new stack packs, new scanner adapters, and any expansion of
   the evolution pipeline. All three multiply an unmeasured surface.
8. **Must be fixed next** — scanner executable resolution, the score's suppression
   arithmetic, the coverage-blind headline, and the maturity/score contradiction.
9. **Should be added** — a warnings channel in every format; a held-out benchmark corpus;
   per-rule precision from real adjudications.
10. **Should never be built** — a plugin host, a second analysis engine, a CVE database, a
    signer, a compliance certificate.

## Answers to the ten required questions

1. **What is USA actually today?** A strong deterministic checklist engine with an
   unusually honest evidence model and an unusually dishonest headline.
2. **How mature?** Production-grade engineering, pre-production assurance science.
3. **Can results be trusted?** Findings: yes, reproducible to the byte. Scores: not as
   presented.
4. **Worst weaknesses?** Scanner RCE + false isolation claim; score inflation by waiver;
   coverage-blind headline; dampening that does not reach the score.
5. **Strongest decisions?** `types.ts`; fail-closed predicates; data-driven packs; the
   fixture gate; refusing to mint signatures.
6. **What must stop development?** Nothing must stop — but rule growth, adapter growth and
   evolution expansion should freeze until the four NOW items land.
7. **What must be fixed next?** USA-R01 (scanner), USA-R03 (score), USA-R04 (maturity).
8. **What should be added?** Warnings everywhere; held-out benchmarks; measured precision.
9. **What should be removed?** `ENV_DENY` as a control; the "network denied" claim; the
   `oracle`/`invariant` kinds if they stay unused (or exercise them).
10. **What should never be built?** Plugin host, second analysis engine, CVE database,
    signer, certification.

## The one-sentence position

**Sell "we tell you what we verified and what we could not" — and make the number say that
too.** The product already has every ingredient: an evidence model, an automatability
taxonomy, a judgement queue, a coverage percentage. What it lacks is a headline that refuses
to round up.
