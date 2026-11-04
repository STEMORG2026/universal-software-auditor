# RESIDUAL RISKS AND BLIND SPOTS

## What this audit could not prove

| #   | Gap                                                                                                                                                                              | Why                                                                                                                             | Consequence                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **315 rules were inventoried, not verified.**                                                                                                                                    | Semantic verification of every regex, applicability predicate and remediation text needs a fixture per rule and hours per pack. | A rule may be wrong while every gate is green. The engine is verified; the _content_ is not. This is the largest gap in the audit.                                                                     |
| 2   | 57 production files were not opened.                                                                                                                                             | 21 567 lines; the audit prioritised the trust-critical 8%.                                                                      | Defects may exist in `docs-*`, `live/`, `intent/`, `learn/`, `foundation/`, `store/`, `snapshot/`. Those are peripheral to the deterministic core, but "peripheral" is a judgement, not a measurement. |
| 3   | 3 of 6 scanner adapters were executed; `scorecard`, `codeql` and `ort` were not.                                                                                                 | No binary here; CodeQL needs a database build, ORT a full dependency resolution.                                                | CodeQL's create-then-analyse path and ORT's non-zero-exit semantics remain unverified — the two most likely places for an adapter bug.                                                                 |
| 4   | Section-weight sensitivity was not measured.                                                                                                                                     | Would require re-running the catalogue under perturbed weights across several projects.                                         | S17 is "no documented rationale", not "these weights are wrong".                                                                                                                                       |
| 5   | Cross-platform behaviour is unverified.                                                                                                                                          | Linux only.                                                                                                                     | Windows path separators, case-insensitive filesystems and CRLF handling are covered by code reading and CI, not by this audit.                                                                         |
| 6   | Mutation testing covered 20 hand-written mutants in 7 modules, not the codebase.                                                                                                 | A real run needs operator-based generation (Stryker) and thousands of mutants.                                                  | The 100% kill rate is a probe, not a score. The untested modules have unknown sensitivity.                                                                                                             |
| 7   | Rule overlap (S16) was not quantified rule-by-rule.                                                                                                                              | Needs pairwise semantic comparison of 315 rules.                                                                                | Double counting may exist between `testing`/`testing-assurance` and `foundation`/`repo`/`cicd`; the direction is stated, the magnitude is not.                                                         |
| 8   | The `oracle` and `invariant` check kinds are unexercised by shipped rules.                                                                                                       | No rule uses them.                                                                                                              | Their code paths are tested by unit tests only; production behaviour under a real pack is unknown.                                                                                                     |
| 9   | **Only 23 of 315 rules were read and judged.** The other 292 were inventoried mechanically (shape, applicability, fixture presence) and never examined for semantic correctness. | Reading 315 patterns against their titles is a session of its own.                                                              | The six CRITICAL false positives found in the 23 I read suggest the rate in the remaining 292 is not zero. This is the largest single gap in the audit and it is _not_ closed by the extended pass.    |
| 10  | Interrupted report write was not tested.                                                                                                                                         | Would need to kill the process mid-`--out`; no atomic-write pattern was observed (`writeFileSync` truncates in place).          | A crash can leave a partial report, and `usa diff` would then read it as "no change" (USA-AUD-026).                                                                                                    |
| 11  | Hard-linked files were not tested; a monorepo corpus was not used.                                                                                                               | No fixture; hard links are indistinguishable from regular files by design.                                                      | Content outside the tree reached via a hard link is read as if it were inside it.                                                                                                                      |

## Red-team of this audit — where it is most likely wrong

**The five conclusions most likely to be wrong:**

0. **USA-AUD-024 (166 of the 315 rules invisible).** The count is exact (315 − 149) and the mechanism is a
   single `continue`, but I inferred "considered and skipped" from the code rather than from a
   spec. It is possible the maintainer intends applicability-skipped rules to be invisible —
   in which case this is a design choice to be documented, not a defect. The _measurement_
   stands either way.

1. **USA-AUD-005 (suppression raises the score).** The arithmetic is right and reproducible,
   but I reconstructed the counterfactual (92.0) rather than running it, because `.usa.yaml`
   cannot be pointed elsewhere. If the section weights I read from `loadSections` differ from
   the ones the audit used internally, the number moves. The _direction_ is certain from the
   code; the exact 92.0 is a calculation, not an execution.
2. **USA-AUD-003 (dampening never moves the score).** Verified twice, but only on
   `examples/demo-app`. A rule with an explicit `weight:` field would behave the same
   (`ruleWeight` reads `rule.weight` first), so I am confident — but I did not construct a
   fixture with explicit weights to confirm the interaction.
3. **USA-AUD-001's severity.** The precondition (a real scanner on the auditor's PATH) is
   normal in CI but absent on a clean developer machine. If the maintainer's threat model is
   "the user runs this on their own code", CRITICAL is arguably HIGH. I kept CRITICAL because
   the composite action and the docs both install scanners, and because the forged manifest
   makes the harm worse than code execution alone.
4. **S16 (pack overlap).** Based on rule titles and section membership, not on reading all
   23 testing rules. The claim may overstate the duplication.
5. **"The score cannot be trusted."** A defensible counter-argument: the report _does_ print
   coverage, confidence per section and the judgement queue, so a careful reader is not
   misled. My claim is about the headline and about readers who stop there — which is most of
   them, but it is a claim about use, not about the artefact.

**The five least-covered components:** `engine/docs-invariants.ts` (722 lines),
`engine/docs-audit.ts` (586), `util/project.ts` git paths (480–736), `scanner/adapters/*`
(five of six), `live/` + `agent/` (955 combined).

**Assumptions that shaped the recommendations:**

- That the score is the product's primary output. If adopters mainly read the section
  findings and the judgement queue, USA-R03 is less urgent than I have ranked it.
- That `usa scan` is intended for untrusted repositories. If it is documented as "run this
  only on code you already trust", USA-R01 drops from P0 to P1 — but then the manifest's
  isolation claim must go regardless, because it is false either way.
- That rule growth is currently a net negative. This follows from unmeasured precision, not
  from evidence that the existing rules are bad.

**Where the investigation was shallow:** the 46 ADRs were not read (6 cited); `docs/` was
sampled; the `.github/` workflows were read for gates, not for logic; `tests/` was read for
architecture, not case by case.

**Confirmation bias from the supplied report:** the report's _model_ of the system was
accurate, which made it easy to accept its numbers. The 685-rule claim survived several
turns of my own reading before I counted. That is a caution about the rest of this audit:
every number here came from a command, and the ones that did not are labelled.

**A defect possibly overlooked because tests pass:** the three score defects are exactly
this category — `score.ts` has tests that pin the formula, and the formula is implemented
correctly. What was never tested is whether the formula means what the product says it means.
I expect at least one more of this shape in the modules I did not open.

## Risks that remain after the revised roadmap

Even if every NOW and NEXT item lands:

1. **A scanner vulnerability is still the auditor's compromise.** Without OS isolation,
   parsing hostile SARIF/JSON in-process is a memory-safety bet on third-party binaries.
2. **Rule correctness remains unmeasured.** Fixtures prove a rule fires and does not
   over-fire _on the fixture_. They do not estimate field precision.
3. **The self-audit remains self-referential.** Fixing the waiver arithmetic makes it honest,
   not independent. Only an external corpus makes it evidence.
4. **Maturity detection remains gameable.** The 7.5-point heuristic rewards cheap signals
   (a CHANGELOG, a tag, a SECURITY.md). A repository can reach "production" without being one.
5. **`grep` remains a substring test.** No amount of engine hardening makes
   `grep_present 'csrf'` a security check.
6. **The documentation universe remains a second engine** until it is extracted, and two
   engines drift.

## Files changed by this audit

```
audit/usa-inside-out/**            new (24 documents + 10 inventories) — untracked
ROADMAP.md                         revised — phases, IDs, acceptance criteria, HTML correction
docs/manifest.yaml                 ROADMAP review date bumped to 2026-10-31
```

Nothing under `src/`, `tests/`, `rules/`, `templates/`, `action.yml`, `package.json`,
`pnpm-lock.yaml`, `.github/` or `docs/adr/` was modified. Verified with:

```bash
git status --porcelain
git diff --stat -- src tests rules templates action.yml package.json pnpm-lock.yaml .github docs/adr
```

Observed: `M ROADMAP.md`, `M docs/manifest.yaml`, `?? audit/` — and the second command prints
nothing.

`pnpm run docs:all` passes after the change (ADR hygiene 46 records, docs governance 153
docs, CLI reference in sync, sample report in sync, manifest 155 tracked docs).

**One step required before committing the audit directory.** `docs/manifest.yaml`
classifies docs from `git ls-files`, so an untracked document is invisible to the gate and a
manifest entry for one is reported as a _stale pointer_. While this directory is untracked,
its entries must therefore **not** be in the manifest — adding them early fails
`docs:manifest` (observed: 16 problems). Add them in the **same commit** that tracks the
directory:

All 24 entries are generated and validated in
[`inventories/manifest-entries.yaml`](inventories/manifest-entries.yaml) — copy that file's
`standalone:` block into `docs/manifest.yaml` in the same commit. It parses as YAML, every
entry points at an existing file, and the count matches the directory exactly.

A second trap the gate caught while this was being written: the roadmap originally mentioned
the literal marker token in prose, which made `check-manifest` auto-classify `ROADMAP.md` as
`fact-markered` and reject its `standalone` entry. The wording was changed rather than the
gate. Both failures are good evidence that the documentation gates work on content, not just
formatting — see S18 in `SEEDED-SUSPICIONS.md`.
