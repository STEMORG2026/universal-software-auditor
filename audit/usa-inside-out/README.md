# USA — inside-out audit, 2026-10-31

An independent forensic audit of `@xenos1996/usa` 2.28.8 at commit `3767c7df`, conducted
against the repository itself rather than against its documentation.

**Read in this order:**

| #   | Document                                                             | What it answers                                                                                    |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | [`EXECUTIVE-VERDICT.md`](EXECUTIVE-VERDICT.md)                       | Is this trustworthy today, and what has to change first                                            |
| 2   | [`FINDINGS.md`](FINDINGS.md)                                         | All 44 findings (2 CRITICAL, 9 HIGH, 24 MEDIUM, 9 LOW) with evidence, reproduction and remediation |
| 3   | [`SECURITY-ASSESSMENT.md`](SECURITY-ASSESSMENT.md)                   | Threat model, the two critical defects, what is well built                                         |
| 4   | [`CLAIMS-VERIFICATION.md`](CLAIMS-VERIFICATION.md)                   | Every claim in the supplied report, checked against the tree                                       |
| 5   | [`COMPONENT-AUDIT.md`](COMPONENT-AUDIT.md)                           | Health scorecard and honest coverage accounting                                                    |
| 6   | [`ARCHITECTURE.md`](ARCHITECTURE.md)                                 | Layers, boundaries, trust boundaries, drift                                                        |
| 7   | [`TEST-AND-VERIFICATION.md`](TEST-AND-VERIFICATION.md)               | Every command run, and what the suite cannot see                                                   |
| 8   | [`MISSING-CAPABILITIES.md`](MISSING-CAPABILITIES.md)                 | Essential / strategic / optional / out of scope                                                    |
| 9   | [`ARCHITECTURE-RECOMMENDATIONS.md`](ARCHITECTURE-RECOMMENDATIONS.md) | Four changes, with trade-offs and acceptance                                                       |
| 10  | [`ROADMAP-ASSESSMENT.md`](ROADMAP-ASSESSMENT.md)                     | State of the existing roadmap, item by item                                                        |
| 11  | [`TRACEABILITY-MATRIX.md`](TRACEABILITY-MATRIX.md)                   | Finding → component → fix → test → initiative                                                      |
| 12  | [`ADVERSARIAL-MATRIX.md`](ADVERSARIAL-MATRIX.md)                     | 52 scenarios: executed, read, or explicitly not examined                                           |
| 13  | [`END-TO-END-CHAINS.md`](END-TO-END-CHAINS.md)                       | 13 workflows traced, and where each one breaks                                                     |
| 14  | [`RULE-SEMANTIC-AUDIT.md`](RULE-SEMANTIC-AUDIT.md)                   | The CRITICAL tier, read rule by rule                                                               |
| 15  | [`RULES-FULL-AUDIT.md`](RULES-FULL-AUDIT.md)                         | All 315: 142 judged, verdict distribution, and 5 more verified pattern defects                     |
| 16  | [`ACCEPTED-RISKS-AUDIT.md`](ACCEPTED-RISKS-AUDIT.md)                 | All 14 waivers re-verified against the tree and the GitHub API                                     |
| 17  | [`CI-SUPPLY-CHAIN-AUDIT.md`](CI-SUPPLY-CHAIN-AUDIT.md)               | All 11 workflows: pinning, injection, permissions, the release path                                |
| 18  | [`ADAPTER-EXECUTION-AUDIT.md`](ADAPTER-EXECUTION-AUDIT.md)           | Semgrep, dependency-cruiser and cosign executed for the first time                                 |
| 19  | [`MUTATION-TESTING.md`](MUTATION-TESTING.md)                         | 20 source mutants: all killed by the full suite, 14 by the owning file                             |
| 20  | [`STRATEGIC-QUESTIONS.md`](STRATEGIC-QUESTIONS.md)                   | All 27 strategic questions, answered                                                               |
| 21  | [`SEEDED-SUSPICIONS.md`](SEEDED-SUSPICIONS.md)                       | All 22 seeded suspicions, classified with evidence                                                 |
| 22  | [`RESIDUAL-RISKS.md`](RESIDUAL-RISKS.md)                             | What this audit could not prove, and a red-team of its own conclusions                             |
| —   | [`REPOSITORY-BASELINE.md`](REPOSITORY-BASELINE.md)                   | Git state, counts, gates, open PRs, unmerged branches                                              |

Machine-readable inventories in [`inventories/`](inventories/): `rules.csv` (all 315),
`detectors.csv` (all 236), `components.csv` (all 100 files with examination status),
`scanner-adapters.csv`, `cli-commands.csv`, `coverage.json`, `rule-stats.json`.

The revised roadmap is `ROADMAP.md` at the repository root — the existing canonical file,
updated in place rather than replaced.

## How this audit was scoped, and what it did not do

Read-only against the product. No production file, test, rule pack, config, workflow or ADR
was modified. Three files changed, all documentation: `ROADMAP.md` (revised),
`docs/manifest.yaml` (its review date), and this directory.

Eleven production modules were read in full (2 662 of 21 567 lines); 32 more were read
selectively; 57 were not opened. All 315 rules were inventoried mechanically and all 23
CRITICAL rules were read and judged; **zero rules are semantically verified in the full
sense**, and that number is stated rather than rounded up. A partial audit presented as
complete would be the same failure this audit is about.

Twenty source-level mutants were planted: **all 20 are killed by the full 1 627-test suite**,
but only 14 by the test file that owns the behaviour. The suite is sound; its locality is not.
Fifty-two adversarial scenarios were attempted: 24 passed, 18 failed, 5 partially passed,
5 were not examined. Everything above was produced by a command; where it was not, the
document says so.

## Is the audit complete?

**No — and it cannot be, in the sense the word usually means.** What is complete is stated
precisely, so the boundary is visible rather than implied.

**Complete:**

- Every one of the 100 production files has an examination status.
- Every one of the 315 rules has a verdict, and the file says which verdicts are readings
  (142) and which are class defaults (173).
- Every one of the 236 detectors is inventoried.
- All 6 scanner adapters are documented; 3 executed (trivy, semgrep, dependency-cruiser).
- All 11 CI workflows are audited for pinning, injection, permissions and the release path.
- All 22 CLI commands and all 4 server routes are accounted for.
- All 22 seeded suspicions are classified; all 27 strategic questions answered.
- All 14 accepted risks are re-verified against the tree and the GitHub API.
- 52 adversarial scenarios attempted, 13 chains traced, 20 mutants planted.
- Every claim above is reproducible from a command in the documents.

**Not complete, and not completable by reading:**

1. **Field precision.** No rule has a measured false-positive rate. That needs a corpus of real
   repositories with adjudicated findings — weeks of work, not a session.
2. **292 of the 315 rules were not read.** 142 were; the rest carry class defaults. Six of the 23 CRITICAL
   rules I read had real false positives, so the unread tail is not clean.
3. **3 of 6 scanner adapters were not executed** — `scorecard`, `codeql` and `ort` have no
   binary here. CodeQL's create-then-analyse pipeline is the most likely place for an adapter
   bug and remains untested.
4. **Cross-platform behaviour** is Linux-only here.
5. **Interrupted writes, hard links, and a large monorepo** were not tested.

A document claiming completeness beyond this list would be the failure this audit is about.
The honest summary: **the engine and the reporting are now understood; the catalogue's
behaviour in the field is not.**
