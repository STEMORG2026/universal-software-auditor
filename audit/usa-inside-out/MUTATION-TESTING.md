# MUTATION TESTING

Two layers, and the distinction matters:

- **Rule-level mutation already exists.** `tests/integration/auditor-mutation.test.ts`
  (195 lines) blinds and saturates each rule's check and asserts the rule's own fixtures
  flip. That is a real harness and it does its job: a fixture that stays green when its rule
  is blinded is decoration, and this test catches that. Credit where it is due.
- **Source-level mutation did not exist.** Nothing planted a defect in `src/` to see whether
  the suite notices. That is what this section adds.

No dependency was installed and no project file was modified: the harness runs in a throwaway
copy (`/tmp/usa-mut`, `node_modules` symlinked), restores the original bytes after every
mutation, and verifies the file is byte-identical afterwards (SHA-256 before/after).

## Method

20 hand-written mutants across the four trust-critical modules plus the loader, the signature
verifier and the server. Each mutant is a single semantic change, not a cosmetic one. Each was
run twice: first against the test file(s) that _should_ own it, then — for the ones that
survived — against the **full suite** (1 627 tests).

```bash
rsync -a --exclude node_modules --exclude .git ./ /tmp/usa-mut/
ln -s <repo>/node_modules /tmp/usa-mut/node_modules
node /tmp/usa-probe/mutate.js        # apply → targeted tests → restore → verify hash
node /tmp/usa-probe/mutate-full.js   # survivors → full suite
```

## Results

| #   | Mutant                                          | File                  | Targeted suite | Full suite |
| --- | ----------------------------------------------- | --------------------- | -------------- | ---------- |
| M01 | WRONG credit 0.15 → 0.00                        | `score.ts`            | KILLED         | —          |
| M02 | EXPERIMENTAL credit 0.50 → 0.40                 | `score.ts`            | survived       | **KILLED** |
| M03 | suppressed findings counted                     | `score.ts`            | KILLED         | —          |
| M04 | UNKNOWN enters the denominator                  | `score.ts`            | KILLED         | —          |
| M05 | `overall` loses its zero-denominator guard      | `score.ts`            | KILLED         | —          |
| M06 | gate threshold off by one (`>=` → `>`)          | `gate.ts`             | KILLED         | —          |
| M07 | suppressed findings block the gate              | `gate.ts`             | KILLED         | —          |
| M08 | CRITICAL becomes dampenable                     | `maturity.ts`         | survived       | **KILLED** |
| M09 | malformed predicate fails **open**              | `evaluate.ts`         | KILLED         | —          |
| M10 | unknown predicate operator fails **open**       | `evaluate.ts`         | KILLED         | —          |
| M11 | default ignore list disabled                    | `project.ts`          | KILLED         | —          |
| M12 | grep output bound 500 → 5000                    | `project.ts`          | survived       | **KILLED** |
| M13 | binary sniff removed                            | `project.ts`          | survived       | **KILLED** |
| M14 | artifact path containment removed               | `scanner/run.ts`      | KILLED         | —          |
| M15 | SIGTERM-killed scanner reported as a normal run | `scanner/run.ts`      | survived       | **KILLED** |
| M16 | maturity dampening never applied                | `evaluate-packs.ts`   | survived       | **KILLED** |
| M17 | CRITICAL weight 10 → 1                          | `loader.ts`           | KILLED         | —          |
| M18 | payload hash mismatch no longer rejects         | `report/signature.ts` | KILLED         | —          |
| M19 | bearer token check always passes                | `serve/server.ts`     | KILLED         | —          |
| M20 | a suppressed site removes the whole finding     | `evaluate.ts`         | KILLED         | —          |

**20 / 20 killed by the full suite (100%). 14 / 20 killed by the test file that should own
the behaviour (70%).** Every mutation was restored byte-identically — verified per run.

## The correction this section had to make

My first pass ran only the targeted files and reported six survivors, which I was about to
write up as "defects the suite cannot see, three of them on documented guarantees". The
full-suite re-run **refuted that**: all six are caught somewhere. The claim would have been
false, and it was the kind of false claim this audit exists to criticise — a measurement taken
on a sample, generalised to the whole.

What the numbers actually support is narrower and still useful.

## What 14/20 vs 20/20 means

The suite is **sound**: every planted defect is caught by _some_ test. That is a better result
than most projects of this size can show, and it is worth saying plainly.

The gap is **locality**, not coverage. Six behaviours are guarded by a test in a different file
from the module that owns them:

| Mutant                      | Owned by                          | Actually caught by            |
| --------------------------- | --------------------------------- | ----------------------------- |
| M08 CRITICAL dampenable     | `gate.test.ts` / `engine.test.ts` | another suite in the full run |
| M16 dampening never applied | `engine.test.ts`                  | another suite                 |
| M15 SIGTERM → normal run    | `scanner-runner.test.ts`          | another suite                 |
| M13 binary sniff            | `project.test.ts`                 | another suite                 |
| M12 grep hit cap            | `project.test.ts`                 | another suite                 |
| M02 EXPERIMENTAL credit     | `score.test.ts`                   | another suite                 |

Consequence, stated without inflation: **CI is safe; fast feedback is not.** A developer who
edits `maturity.ts` and runs `vitest run tests/unit/gate.test.ts` gets a green signal on a
broken documented invariant, and only finds out on the full run. On a 3.5-minute suite that is
an annoyance; on a larger suite it becomes the reason people stop running tests locally.

The fix is six assertions moved or added, not a new test strategy.

## Why this matters beyond the six

M08 and M16 together explain USA-AUD-003. The maturity feature _is_ tested — somewhere — but no
test asserts the relationship between dampening and the score, which is why the two drifted
apart without anyone noticing. A mutant that removes dampening entirely is caught; a mutant
that leaves dampening intact but disconnected from the score is the actual bug, and no mutant
here can express it because it is a _relationship between two modules_, not a line.

That is the shape of the remaining risk, and it is why the property tests listed below matter
more than the kill rate.

## Property tests this exercise justifies

Each is five lines and none exists today:

1. Same tree, two maturity profiles → the score relationship is the documented one (not
   "identical", unless the ADR says so).
2. Suppress a FAIL → the score does not rise (USA-AUD-005).
3. Kill a scanner with SIGTERM → status is `timeout`, never `ok`.
4. A rule that does not apply still appears in the report (USA-AUD-024).

## Honest limits

- 20 mutants is a sample, not a score. 100% here is **not** a mutation score for 21 567 lines;
  it is a probe of four modules and three smaller ones. A real run would be thousands of
  mutants with operator-based generation (Stryker), and the survivors would be far more
  interesting than these.
- Mutants were hand-written by someone who had just read the code, which biases them toward
  defects I expected the tests to catch. That makes 100% _less_ impressive than it looks.
- The full-suite re-run is what makes the result trustworthy; the targeted run alone was
  misleading. That is worth remembering the next time a subset of tests is used as evidence.
