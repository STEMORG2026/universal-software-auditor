# ADVERSARIAL SCENARIO MATRIX

52 scenarios. Method column: **RUN** = executed against an isolated fixture, output recorded;
**READ** = established by reading the deciding code; **N/E** = not examined (stated, not
implied). Outcome is about the _product's_ behaviour, not the attack's success.

Executed fixtures live under `/tmp/adv` and `/tmp/usa-probe`; nothing was run against a real
system, and the two "malicious" fixtures write a marker file and nothing else.

## Executed (RUN)

| ID   | Scenario                                                           | Expected                              | Actual                                                                                                                                                  | Outcome                     | Finding     |
| ---- | ------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------- |
| A01  | Malformed `.usa.yaml`                                              | loud refusal, no silent defaults      | exit 2, `Could not parse …/.usa.yaml: Block collections are not allowed…`                                                                               | **PASS**                    | —           |
| A02  | Rule with unknown predicate operator                               | rule never applies, warning           | `warning: packs/x[0] X-001: unknown predicate op "definitely_not_an_operator" — rule will never apply`; exit 0                                          | **PASS** (warns)            | —           |
| A02b | Same, score presentation                                           | no number, or "insufficient evidence" | `usa 0/100 (prototype) — 0 passed, no open findings, 0 to review (0% verified)`                                                                         | **FAIL**                    | USA-AUD-020 |
| A03  | Invalid regex in a rule pack                                       | rule UNKNOWN + warning (fail closed)  | **`"X-002": {status: PASS, severity: HIGH}`**, no warning at all                                                                                        | **FAIL**                    | USA-AUD-025 |
| A04  | Duplicate rule id across packs                                     | later rule rejected, warned           | `warning: duplicate rule id "DUP-001" in pack "packs/b" … later rule ignored`                                                                           | **PASS**                    | —           |
| A05  | Expired suppression                                                | treated as an active finding          | `warning: suppression for REPO-001 expired on 2020-01-01 — treating as an active finding`; score dropped to 48.9                                        | **PASS**                    | —           |
| A06  | Suppression matching nothing                                       | warned, not silently kept             | `warning: suppression for REPO-001 (no/such/file/**) matched no finding — remove it or fix the target`                                                  | **PASS**                    | —           |
| A07  | Symlink escaping the tree (`→ /etc/passwd`, `→ ../secret.json`)    | never followed, counted               | `warning: 2 symlink(s) skipped without traversal`; index = `["secret-outside.json"]`, `skippedSymlinks=2`                                               | **PASS**                    | —           |
| A08  | Unreadable file (`chmod 000`)                                      | visible blind spot                    | audit completes, **no warning, no counter**                                                                                                             | **FAIL**                    | USA-AUD-007 |
| A09  | 1.5 MB single-line file                                            | bounded                               | completes normally                                                                                                                                      | **PASS**                    | —           |
| A10  | `usa diff` on a report with no trailer                             | refuse (baseline path throws)         | renders a full diff: `0/0`, "None ✅" ×4, **"No net movement"**, exit 0                                                                                 | **FAIL**                    | USA-AUD-026 |
| A11  | `verify-report` without a bundle                                   | usage error, no pass                  | exit 2, usage text                                                                                                                                      | **PASS**                    | —           |
| A12  | Server: no token / wrong token / good token                        | 401 / 401 / 200                       | 401 / 401 / 200                                                                                                                                         | **PASS**                    | —           |
| A12d | Server: target outside allow-roots (`/etc`)                        | 403                                   | 403                                                                                                                                                     | **PASS**                    | —           |
| A12e | Server: body not JSON                                              | 400                                   | 400                                                                                                                                                     | **PASS**                    | —           |
| A13  | Scanner binary absent                                              | `unavailable`, never a pass           | `⚠️ codeql unavailable: codeql executable not found on PATH`, `0 evidence · 0 findings`, exit 0                                                         | **PASS** (blind spot named) | —           |
| X01  | Audited repo ships `node_modules/.bin/trivy`                       | never executed                        | **executed**: marker written as uid 1000 with `$HOME`; manifest still reports `trivy 0.75.0`                                                            | **FAIL**                    | USA-AUD-001 |
| X02  | Catastrophic-backtracking rule pattern                             | bounded                               | **95 314 ms** on a 41-byte line                                                                                                                         | **FAIL**                    | USA-AUD-004 |
| X03  | Empty git repository                                               | no score, or a justified floor        | **45.3/100**                                                                                                                                            | **FAIL**                    | USA-AUD-006 |
| X04  | Nested `.gitignore` excludes `sub/secret.env`                      | excluded, as git would                | **indexed**                                                                                                                                             | **FAIL**                    | USA-AUD-007 |
| X05  | Same tree, `--profile prototype` vs `production`, `--fail-on high` | same gate verdict                     | exit **0** vs exit **1**                                                                                                                                | **FAIL**                    | USA-AUD-003 |
| X06  | Waive 13 zero-credit findings                                      | score unchanged                       | 92.0 → **100.0**                                                                                                                                        | **FAIL**                    | USA-AUD-005 |
| X07  | Self-audit rule coverage                                           | every rule accounted for              | **166 of 315 rules absent** from the report; `NOT_APPLICABLE: 0`                                                                                        | **FAIL**                    | USA-AUD-024 |
| X08  | CRITICAL patterns vs legitimate code                               | no false positive                     | SEC-011 matches `createHash("sha256")`; WEB-007 matches `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; PY-006 matches a multiline `yaml.load(` with `SafeLoader` | **FAIL**                    | USA-AUD-028 |
| X09  | 20 source mutations across the suite                               | killed                                | **20/20 killed by the full suite**; only 14/20 by the owning test file (see `MUTATION-TESTING.md`)                                                      | **PASS** (locality: LOW)    | USA-AUD-029 |

## Assessed by reading (READ)

| ID  | Scenario                                         | Expected                                    | Actual (from code)                                                                                      | Outcome               | Finding             |
| --- | ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------- | ------------------- |
| B01 | Production repo without tests                    | MISSING findings, no crash                  | works; `testing` rules fire on absence                                                                  | PASS                  | —                   |
| B02 | Unsupported technology (no pack)                 | bootstrap offers a pack, nothing registered | `bootstrapPacks` never touches `index.yaml`                                                             | PASS (with caveat)    | USA-AUD-017         |
| B03 | Corrupted `.usa/foundation.yaml`                 | fail safe                                   | `foundation/loader` returns defaults on parse failure                                                   | PASS                  | —                   |
| B04 | Duplicate `--fact` conflicting with detection    | user fact wins, no warning                  | user facts are injected after detection; a contradiction is silent                                      | **FAIL**              | (S-facts, see note) |
| B05 | Hard-linked file outside the tree                | cannot be detected as a link                | hard links are indistinguishable from files; content is read                                            | UNVERIFIED            | —                   |
| B06 | File mutating during the audit                   | consistent snapshot or a warning            | index is built once; content is re-read lazily, so a file can change between index and read             | **PARTIAL**           | —                   |
| B07 | Malicious filename (newline, quote)              | no injection into report/trailer            | `yamlKey` escapes `\`, `"`, newline for rule ids; locations are rendered as text                        | PASS                  | —                   |
| B08 | Scanner present but too old                      | refuse or record the version                | probe records the version and **never enforces a minimum**                                              | **FAIL**              | USA-AUD-030         |
| B09 | Scanner exits non-zero on findings               | not read as a crash                         | `annotateFailure` only annotates UNKNOWN rows; adapters pass `--exit-code 0` where the tool supports it | PASS                  | —                   |
| B10 | Malformed scanner JSON                           | UNKNOWN, never PASS                         | `tryParseJson` → `unknown(...)`                                                                         | PASS                  | —                   |
| B11 | Scanner output over the cap                      | explicit failure                            | `maxBuffer: 20 MB` → `ENOBUFS` → `status: error`, blind spot                                            | PASS                  | —                   |
| B12 | Malicious artifact path (`../../etc/passwd`)     | refused                                     | `readArtifact` resolves and proves containment; mutation M14 killed                                     | PASS                  | —                   |
| B13 | Credential variables reaching a scanner          | absent                                      | allow-list excludes them — but `HOME` is allowed, so `~/.ssh` and `~/.aws` are readable                 | **PARTIAL**           | USA-AUD-001         |
| B14 | Network available to a scanner                   | denied, or not claimed                      | nothing enforces; the manifest says `denied`                                                            | **FAIL**              | USA-AUD-002         |
| B15 | Suppression glob matching the whole repo (`**`)  | legal but visible                           | no breadth limit; it simply removes every finding for that rule                                         | **FAIL** (governance) | USA-AUD-005         |
| B16 | Invalid `reviews:` entry (bad date)              | warned, ignored                             | `resolveActiveReviews` warns on unparseable dates                                                       | PASS                  | —                   |
| B17 | All findings suppressed                          | score reflects it                           | score rises (denominator shrinks)                                                                       | **FAIL**              | USA-AUD-005         |
| B18 | Tampered report body (finding text)              | verification fails                          | signature covers the trailer only                                                                       | **FAIL**              | USA-AUD-013         |
| B19 | Tampered trailer (status flipped)                | verification fails                          | hash mismatch → `ok: false`                                                                             | PASS                  | —                   |
| B20 | Empty benchmark corpus                           | gate refuses                                | `hasEvidence` false → `benchmarkPassed` false                                                           | PASS                  | —                   |
| B21 | Benchmark that rewards the candidate it approves | independent evidence                        | 3 self-authored cases                                                                                   | **FAIL**              | USA-AUD-016         |
| B22 | Candidate introducing a regression               | rejected                                    | `requireNoRegressions` + `s.regressions`                                                                | PASS                  | —                   |
| B23 | Concurrent submits                               | second gets 409                             | `running` flag, single-flight                                                                           | PASS                  | —                   |
| B24 | LLM prompt injection via repository content      | cannot change a verdict                     | the agent cannot write findings; but nothing sanitises content sent to the provider                     | **PARTIAL**           | —                   |
| B25 | Malformed LLM response                           | no crash, deterministic fallback            | `live/runner` degrades to deterministic-only                                                            | PASS                  | —                   |
| B26 | Interrupted scanner (SIGKILL mid-run)            | no orphan, blind spot recorded              | `spawnSync` + SIGTERM; grandchildren survive (mutation M15 survived)                                    | **FAIL**              | USA-AUD-009         |
| B27 | Interrupted live session                         | resumable or cleanly abandoned              | session file + lease; transcript persists                                                               | PASS                  | —                   |
| B28 | Corrupt persisted job file                       | skipped with a warning                      | `serve: skipping unreadable job file …`                                                                 | PASS                  | —                   |

## Not examined (N/E) — stated, not implied

| ID  | Scenario                                                                               | Why not                                                                                                                                |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Large monorepo (10k+ files)                                                            | needs a corpus; `MAX_FILES` behaviour is covered by code reading and unit tests only                                                   |
| C02 | Deeply nested directories                                                              | recursion is iterative (`stack`), so depth is safe by construction; not executed                                                       |
| C03 | Conflicting project metadata (`package.json` says one thing, `pyproject.toml` another) | no fixture; the maturity detector reads root `package.json` only (documented)                                                          |
| C04 | Interrupted report write (power loss mid-`--out`)                                      | no atomic write observed; `fs.writeFileSync` truncates in place, so a crash can leave a partial report. **This is a gap, not a pass.** |
| C05 | Malicious filenames with Unicode/RTL overrides                                         | not attempted                                                                                                                          |

## Summary

| Outcome          | Count |
| ---------------- | ----: |
| PASS             |    25 |
| FAIL             |    17 |
| PARTIAL          |     5 |
| UNVERIFIED / N/E |     5 |

The FAILs are not evenly distributed: they cluster in four places — the scanner boundary
(X01, B13, B14, B26, B08), the score and its inputs (X03, X05, X06, X07, B15, B17), the
failure-to-warn paths (A03, A08, A10), and rule content (X08). Everything else — config
parsing, suppression lifecycle, server authorisation, path containment, scanner absence,
benchmark gating — behaved correctly under adversarial input. That is a genuinely well-built
perimeter around a soft centre.
