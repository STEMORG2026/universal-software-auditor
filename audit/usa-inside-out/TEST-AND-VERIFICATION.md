# TEST AND VERIFICATION

## Commands executed by this audit

| #   | Command                                                   |  Exit | Result                                                                                 |
| --- | --------------------------------------------------------- | ----: | -------------------------------------------------------------------------------------- |
| 1   | `pnpm run typecheck`                                      |     0 | `tsc --noEmit`, strict, clean                                                          |
| 2   | `pnpm run lint`                                           |     0 | `eslint .`, no warnings                                                                |
| 3   | `pnpm run docs:all`                                       |     0 | 6 gates; `doc manifest: OK (155 tracked docs · 84 standalone · 180-day review window)` |
| 4   | `pnpm test`                                               |     0 | 87 files · **1 627 passed, 1 skipped**                                                 |
| 5   | `node dist/cli.js audit .`                                |     0 | 100/100, 0 CRITICAL/HIGH, 36 UNKNOWN, 14 suppressed                                    |
| 6   | `node dist/cli.js audit . --out a1.md` ×2                 |     0 | byte-identical except 2 timestamps                                                     |
| 7   | `node dist/cli.js audit . --format sarif`                 |     0 | 2.1.0, 1 run, 50 results, 14 suppressions                                              |
| 8   | `node dist/cli.js standards` / `categories`               |     0 | 13 catalogues + 102 uncatalogued; 5 empty categories                                   |
| 9   | `node dist/cli.js --help`                                 |     0 | 22 commands; per-command help absent                                                   |
| 10  | `node dist/cli.js scan /tmp/hijack-probe`                 |     0 | **project binary executed** (USA-AUD-001)                                              |
| 11  | `Project.grep('(a+)+$')` on a 41-byte line                |     — | **95 314 ms** (USA-AUD-004)                                                            |
| 12  | `new Project()` on a nested-gitignore fixture             |     — | `sub/secret.env` indexed (USA-AUD-007)                                                 |
| 13  | `matchesGlob` over 13 adversarial cases                   |     — | 13/13 correct                                                                          |
| 14  | audit `examples/demo-app` at two profiles                 |     0 | identical score 37.3, different severities                                             |
| 15  | audit `/tmp/demo-probe` at two profiles, `--fail-on high` | 1 / 0 | **gate bypass** (USA-AUD-003)                                                          |
| 16  | audit an empty git repo                                   |     0 | **45.3/100** (USA-AUD-006)                                                             |

Not executed, with reasons: `format:check` (no information beyond lint+docs here),
`build`, `test:cov` (rewrites tracked output), `protocol:*` (unrelated to the engine),
`usa evolve` (state-mutating, excluded by the brief), and the five scanner adapters other
than Trivy (each needs a binary that is not installed except semgrep/depcruise/cosign —
running them would require network or heavy setup, which the brief forbids without
authorisation).

## Test architecture as found

| Kind            | Present                 | Assessment                                                   |
| --------------- | ----------------------- | ------------------------------------------------------------ |
| Unit            | Yes, ~60 files          | Good: pure functions tested directly                         |
| Integration     | Yes                     | `rule-fixtures.test.ts` alone is 416 cases                   |
| End-to-end      | Yes (`tests/e2e`)       | CLI-level                                                    |
| Contract        | Yes (`tests/contracts`) | Scanner/adapter contracts                                    |
| Golden/snapshot | Yes                     | Sample report + CLI docs regenerated with `--check`          |
| Property-based  | **No**                  | Absent                                                       |
| Fuzz            | **No**                  | Absent                                                       |
| Mutation        | **No**                  | Absent                                                       |
| Performance     | **No**                  | Absent — which is why 95 s of backtracking was never noticed |
| Security        | Partial                 | No adversarial fixture for the scanner runner                |
| Cross-platform  | CI matrix only          | No Windows-specific path tests found                         |

## The strongest thing in the repository

`tests/integration/rule-fixtures.test.ts` plus `tests/fixtures/rules/` is a real
per-rule expected-finding harness on the CodeQL-test model: 205 fixtures for the 205
non-manual, non-invariant rules, with a CI gate that fails when an automatable rule has no
fixture. This is better than most commercial scanners ship, and it is the reason rule rot is
a manageable risk here rather than a fatal one.

Its three gaps (USA-AUD-015): 6 negative-only fixtures prove nothing fires, 7 positive-only
prove nothing does not over-fire, and the 3 `invariant` rules are excluded from the gate by
construction.

## Assertion quality

Sampled tests assert behaviour, not existence: `rule-fixtures` asserts status **and**
message **and** location; the MACP tests assert refusals by exit code and by message; the
score tests assert numbers. I found no cluster of `toBeDefined()`-only tests in the areas I
read. This is a genuine strength and it is why the three score defects are surprising —
the suite tests the formula, not the _meaning_ of the formula.

## Properties with no test (the matrix the brief asked for)

| Property                             | Tested? | Evidence                                               |
| ------------------------------------ | ------- | ------------------------------------------------------ |
| All-UNKNOWN scoring                  | No      | `overall` falls to 0 by code, no test pins it          |
| Zero-resolved sections               | Yes     | section `score: null` → "not verified"                 |
| Suppression does not raise the score | **No**  | it does raise it (USA-AUD-005)                         |
| Same score across maturity profiles  | **No**  | it is the same — nobody decided that                   |
| CRITICAL immunity                    | Yes     | unit test present                                      |
| ReDoS bound                          | **No**  | —                                                      |
| Huge file / oversize skip            | Yes     | counted and warned                                     |
| Malformed regex                      | Yes     | fails closed                                           |
| Nested `.gitignore`                  | **No**  | not implemented                                        |
| Fixed-point non-convergence          | Yes     | warning path tested                                    |
| Scanner env leakage                  | Partial | allow-list tested; PATH hijack not                     |
| Scanner timeout kills tree           | **No**  | not implemented                                        |
| Evidence identity stability          | Yes     | good coverage                                          |
| Server concurrency                   | Yes     | 409 path tested                                        |
| Server path traversal                | Yes     | `realpath` containment tested                          |
| Diff version skew                    | Yes     | trailer schema versioning tested                       |
| Corrupt trailer                      | Yes     | fail-closed parse tested                               |
| Bootstrap review enforcement         | **No**  | nothing to test — advisory only                        |
| Vacuous benchmark                    | **No**  | 3-case corpus                                          |
| LLM prompt injection                 | **No**  | no test, and no mitigation found in the narrative path |
| Signature over finding text          | **No**  | trailer-only by design                                 |

## The verification architecture, honestly

Local gates (typecheck, lint, format, docs×6, test, self-audit) and remote CI (12+ checks
including USA self-audit, Scorecard, CodeQL, rule-pack validation, changeset presence,
docs resync) are unusually complete for a project this size. Branch protection is real.

But a passing suite proved insufficient for the three defects that matter most:
`score.ts` passes every test while its suppression arithmetic is inverted relative to its
stated intent; `scanner/run.ts` passes every test while executing project code; and
`maturity.ts` passes every test while its output is discarded by the scorer. **The suite
tests the units; nothing tests the composition.** That is the single most important
observation in this section, and it is why the roadmap's verification workstream (USA-R11)
is about _property_ tests across stages, not more unit tests.
