# TRACEABILITY MATRIX

Finding → component → root cause → corrective change → regression test → roadmap initiative.
Every CRITICAL and HIGH finding maps to an initiative. No accepted-risk exception was needed.

## Findings

| Finding     | Sev      | Component                                   | Root cause                                                            | Corrective change                                                           | Regression test                                         | Initiative |
| ----------- | -------- | ------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- | ---------- |
| USA-AUD-001 | CRITICAL | `scanner/run.ts:442`                        | PATH prepend applied to binary lookup, not just dependency resolution | spawn `probe.executable` (absolute)                                         | hijack fixture: `node_modules/.bin/trivy` must not run  | USA-R01    |
| USA-AUD-002 | CRITICAL | `scanner/run.ts:115-119`                    | policy input serialized as enforcement outcome                        | emit `isolation: none` / real mechanism; never `network: denied` unenforced | manifest schema test                                    | USA-R01    |
| USA-AUD-003 | HIGH     | `score.ts:168` + `evaluate-packs.ts:179`    | severity stored twice; score reads the rule, gate reads the finding   | ADR + make the two agree                                                    | same tree, two profiles → pinned difference             | USA-R04    |
| USA-AUD-004 | HIGH     | `util/project.ts:401-433`                   | "rules are data" → unbounded backtracking                             | per-grep deadline → UNKNOWN + warning                                       | 64 KB single-line + nested quantifier completes bounded | USA-R02    |
| USA-AUD-005 | HIGH     | `score.ts:144-147`                          | suppression removed from the whole calculation                        | suppressed zero-credit stays in denominator                                 | suppress-a-FAIL must not raise score                    | USA-R03    |
| USA-AUD-006 | HIGH     | `score.ts:80-88`, markdown summary          | UNKNOWN exclusion correct for a ratio, wrong for a grade              | score always printed with coverage                                          | renderer test; empty-repo calibration                   | USA-R03    |
| USA-AUD-007 | MEDIUM   | `util/project.ts:256,286-303`               | only root `.gitignore` read; exclusion uncounted                      | nested ignores + ignored-file counter                                       | `sub/secret.env` not indexed; count warned              | USA-R05    |
| USA-AUD-008 | MEDIUM   | `cli.ts:64`, `util/env.ts`                  | dev convenience reused for target dir                                 | load from install dir or `--env-file`                                       | `.env` cannot change provider endpoint                  | USA-R06    |
| USA-AUD-009 | MEDIUM   | `scanner/run.ts:436-447`                    | `spawnSync` signals one PID                                           | detached + group kill                                                       | no descendant survives timeout                          | USA-R01    |
| USA-AUD-010 | MEDIUM   | `serve/server.ts:126-135`, `report/json.ts` | warnings live beside the report, not in it                            | warnings in `AuditReport` + all renderers                                   | truncated audit warns in md/json/sarif/serve            | USA-R07    |
| USA-AUD-011 | MEDIUM   | `serve/jobs.ts:107-128`                     | sync engine on the event loop                                         | worker/child or streamed progress                                           | `GET /api/audits/:id` answers `running`                 | USA-R08    |
| USA-AUD-012 | MEDIUM   | `scanner/run.ts:32-64`                      | deny list unreachable under allow list                                | apply deny to inherited env, or delete it                                   | widened allow list still drops `GITHUB_TOKEN`           | USA-R01    |
| USA-AUD-013 | MEDIUM   | `report/signature.ts:34-36`                 | payload = trailer (what `diff` parses)                                | body + trailer hashes                                                       | edited finding message fails verification               | USA-R09    |
| USA-AUD-014 | MEDIUM   | `rules/catalogues.yaml`                     | 102 of the 315 rules authored without a reference                     | print proportion; tag house rules                                           | `standards` output states uncatalogued count            | USA-R10    |
| USA-AUD-015 | MEDIUM   | `tests/fixtures/rules/`                     | gate accepts one direction                                            | require positive && negative; invariant fixtures                            | the 13 one-sided fixtures fail first                    | USA-R11    |
| USA-AUD-016 | MEDIUM   | `evolution/release.ts:18-26`                | quality gate over self-authored corpus                                | split mechanism vs quality gate                                             | candidate fitted to one case rejected by held-out       | USA-R12    |
| USA-AUD-017 | MEDIUM   | `bootstrap/index.ts:14-22`                  | marker is a comment                                                   | loader refuses/warns on the marker                                          | marked pack in index is refused                         | USA-R12    |
| USA-AUD-018 | LOW      | `cli-help.ts`                               | single global help table                                              | per-command synopsis                                                        | `usa audit --help` lists `--fail-on`                    | USA-R13    |
| USA-AUD-019 | LOW      | `util/project.ts:543-548`                   | flags narrowed to `i`                                                 | validate + honour `m`                                                       | `flags: m` fixture                                      | USA-R14    |
| USA-AUD-020 | LOW      | `score.ts:81`                               | overall has no "nothing resolved" state                               | `null`, matching sections                                                   | manual-only ruleset → null                              | USA-R03    |
| USA-AUD-021 | LOW      | `ROADMAP.md:130`                            | record not updated when HTML shipped                                  | moved to Shipped with ADR                                                   | docs check: renderer appears in Shipped or Planned      | USA-R13    |
| USA-AUD-022 | LOW      | `README.md`, `docs/`                        | counts hand-written                                                   | `usa:fact` markers for kinds/commands/formats                               | `docs:check` fails on drift                             | USA-R13    |
| USA-AUD-023 | MEDIUM   | `scanner/types.ts:105,241,266`              | mapper declared, never implemented                                    | implement one mapper or delete the contract                                 | fixture adapter's finding appears in the audit set      | USA-R15    |

## Capability gaps

| Gap                                          | Class     | Initiative          | Note                                                  |
| -------------------------------------------- | --------- | ------------------- | ----------------------------------------------------- |
| A score that means something                 | ESSENTIAL | USA-R03             | arithmetic present, semantics absent                  |
| Real scanner isolation                       | ESSENTIAL | USA-R01             | integrate an OS sandbox, do not build one             |
| Blind spots in every format                  | ESSENTIAL | USA-R07 + R05       | the differentiator, half-implemented                  |
| Held-out benchmark corpus                    | ESSENTIAL | USA-R12             | gate exists, evidence does not                        |
| Per-rule measured precision                  | STRATEGIC | USA-R12 (extension) | needs real adjudications first                        |
| Semantic analysis for security rules         | STRATEGIC | — (deferred)        | extend `oracle` to named rules; do not rebuild CodeQL |
| Monorepo per-package scoring                 | STRATEGIC | — (deferred)        | detection already says `monorepo`                     |
| Baseline as the default adoption path        | STRATEGIC | — (docs)            | code exists, framing does not                         |
| SBOM / VEX / IDE / dashboards / pack signing | OPTIONAL  | —                   | delegated or premature                                |

## Architecture recommendations

| Recommendation                                                                             | Findings                              | Initiative                              |
| ------------------------------------------------------------------------------------------ | ------------------------------------- | --------------------------------------- |
| Make the score mean one thing                                                              | 003, 005, 006, 020                    | USA-R03, R04                            |
| Make the scanner boundary real                                                             | 001, 002, 009, 012                    | USA-R01                                 |
| Extract the documentation universe from scoring                                            | 006 (denominator), architecture drift | (NEXT, unnumbered — needs an ADR first) |
| One warnings channel in the report                                                         | 007, 010                              | USA-R05, R07                            |
| Preserve: linear engine, types.ts, data-driven packs, fixture gate, verify-only provenance | —                                     | —                                       |

## Standards and lenses → findings

| Lens                                | Findings                                       |
| ----------------------------------- | ---------------------------------------------- |
| A — scoring and mathematical trust  | 003, 005, 006, 020                             |
| B — USA as an attack target         | 001, 002, 004, 008, 009, 012                   |
| C — determinism and reproducibility | none (determinism verified; timestamp only)    |
| D — actual assurance accuracy       | 006, 014, 015, 016                             |
| E — real-world adopter              | 006, 010, 011, 018                             |
| F — maintainer / ecosystem          | 014, 015, 016, 017                             |
| G — standards credibility           | 014                                            |
| H — market and ecosystem            | 001 (table stakes: sandboxing), 006            |
| I — AI/LLM trust boundaries         | 008                                            |
| J — extensibility                   | 004 (`--rules-dir` is the attack surface), 017 |
| K — documentation and UX            | 018, 021, 022                                  |
| L — legal, privacy, governance      | 008, 013                                       |

## Addendum — findings from the extended pass (matrix, chains, rules, mutation)

| Finding     | Sev    | Component                                           | Root cause                                                                                                   | Corrective change                                                 | Regression test                          | Initiative |
| ----------- | ------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------- | ---------- |
| USA-AUD-024 | HIGH   | `evaluate-packs.ts:35`                              | `continue` discards the rule instead of recording it                                                         | emit `{applicable:false, reason}` per rule in an unscored section | `findings + skipped === catalogue`       | USA-R16    |
| USA-AUD-025 | HIGH   | `project.ts:543`, `evaluate.ts:288`                 | `grep` returns `[]` for both "no hits" and "cannot compile"                                                  | distinguish the two; UNKNOWN + load-time warning                  | fixture with `(unclosed` must not PASS   | USA-R19    |
| USA-AUD-026 | HIGH   | `cli-reports.ts:65`                                 | diff and baseline have opposite postures on a null trailer                                                   | `diff` exits 2 on a missing trailer                               | both readers refuse the same input       | USA-R17    |
| USA-AUD-027 | MEDIUM | 4 CRITICAL rules                                    | manual/`command` checks cannot fail                                                                          | deterministic proxy or accepted-judgement register                | every CRITICAL automatable or registered | USA-R18    |
| USA-AUD-028 | MEDIUM | SEC-011, WEB-007, PY-006, GO-007, IAC-001, REPO-002 | patterns broader than their titles                                                                           | six negative fixtures (listed in RULE-SEMANTIC-AUDIT.md)          | each legitimate input must PASS          | USA-R11    |
| USA-AUD-029 | LOW    | suite                                               | owning test files do not cover their module's behaviour (20/20 killed by the full suite, 14/20 by the owner) | move/add six assertions                                           | targeted column reads 20/20              | USA-R11    |
| USA-AUD-030 | MEDIUM | adapter `probe`                                     | version recorded, never compared                                                                             | `minVersion` in the adapter contract                              | old-version fixture → `unavailable`      | USA-R18    |

### Seeded suspicions re-graded after the extended pass

| #   | Was       | Now                       | Why                                                                                                                        |
| --- | --------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| S4  | CONFIRMED | **CONFIRMED, worse**      | 166 of the 315 rules are not merely excluded from the score — they are absent from the report (USA-AUD-024)                |
| S9  | CONFIRMED | CONFIRMED                 | unchanged (95 s probe)                                                                                                     |
| S10 | REFUTED   | REFUTED                   | convergence is provable; the residual risk is invisibility, now USA-AUD-024                                                |
| S21 | PARTIALLY | **PARTIALLY, quantified** | 20/20 mutants killed by the full suite, 14/20 by the owning file — the suite is sound, its locality is loose (USA-AUD-029) |

## Addendum 2 — rule-catalogue and accepted-risk pass

| Finding     | Sev    | Component                                   | Root cause                                                                        | Corrective change                                                              | Regression test                               | Initiative |
| ----------- | ------ | ------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- | ---------- |
| USA-AUD-031 | HIGH   | REPO-003, ARCH-005, DEP-002, DEP-005        | `! (cmd \| grep -q …)` cannot distinguish "no match" from "no output"             | adopt the existing `command -v \|\| fail-closed` idiom (3 of 7 already use it) | tool-absent fixture → UNKNOWN, never PASS     | USA-R20    |
| USA-AUD-032 | MEDIUM | ARCH-005, DEP-005                           | `npx --yes <tool>@latest` fetches and executes at audit time                      | pin and vendor, or delete and use `oracle`                                     | no shipped `command` contains `@latest`       | USA-R20    |
| USA-AUD-033 | MEDIUM | 57 `grep_present` rules                     | one PASS/one credit cannot express "signal, not proof"                            | `proxy` automatability tier, credit ≤0.5, separate rendering                   | proxy PASS renders with its tier              | USA-R21    |
| USA-AUD-034 | MEDIUM | SUP-003, SUP-008, CTNR-001, RS-003, SEC-002 | patterns narrower/wider than their titles                                         | 5 fixture pairs + 3 pattern edits                                              | the five probes in RULES-FULL-AUDIT.md        | USA-R11    |
| USA-AUD-035 | MEDIUM | `.usa.yaml`, branch protection              | waivers have no expiry; FND-004 asserts a protection that does not bind the owner | `enforce_admins: true`; correct FND-004 text; `until:` on 8 waivers            | `gh api` shows `enforce_admins.enabled: true` | USA-R22    |

### Accepted-risk outcomes

| Waiver   | Outcome                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| 13 of 14 | VALID — reason verified against the tree                                                                   |
| FND-004  | INCOMPLETE — seven checks not six; CODEOWNERS advisory at 0 approvals; `enforce_admins: false` unmentioned |
| All 14   | matched a finding (no dead waivers)                                                                        |
| 0 of 14  | carry an expiry date                                                                                       |

## Addendum 3 — CI/supply chain and adapter execution

| Finding     | Sev    | Component                              | Root cause                                                        | Corrective change                                            | Regression test                             | Initiative |
| ----------- | ------ | -------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- | ---------- |
| USA-AUD-036 | HIGH   | `scanner/normalize.ts:12`              | one global severity word list; Semgrep's ERROR/WARNING are absent | per-adapter severity table; unknown → UNKNOWN, raw word kept | ERROR-severity fixture → HIGH               | USA-R24    |
| USA-AUD-037 | MEDIUM | `cli-args.ts:40`                       | `args[body] = next` overwrites on repeat                          | push into an array                                           | two manifest rows for two `--scanner` flags | USA-R25    |
| USA-AUD-038 | MEDIUM | `ci.yml:443`                           | curl + install with no digest                                     | `sha256sum -c` before `tar`                                  | tampered tarball fails before extraction    | USA-R23    |
| USA-AUD-039 | MEDIUM | `ci.yml:246`                           | `package.json` in the shipped-path regex                          | inspect the diff for shipped fields                          | devDependency PR passes; runtime bump fails | USA-R23    |
| USA-AUD-040 | MEDIUM | `release.yml` + protection             | release force-pushes via a PAT; admins deliberately unenforced    | ruleset with bypass actor + App token, then `enforce_admins` | human push rejected, release push allowed   | USA-R22    |
| USA-AUD-041 | LOW    | `provenance-check.yml:70`              | "nothing to read" exits 0                                         | neutral, or fail once a release exists                       | green only when evidence exists             | USA-R23    |
| USA-AUD-042 | LOW    | `release.yml`, `publish.yml`, `ci.yml` | floating `npm@^11.15.0`, `pnpm dlx`                               | exact pins                                                   | no `^` in a credentialed job                | USA-R23    |
| USA-AUD-043 | LOW    | `dependency-cruiser` default config    | `args: ['src']`                                                   | `args: ['.']`                                                | fixture scan parses instead of UNKNOWN      | USA-R24    |

### Correction recorded against USA-AUD-035

My first recommendation — set `enforce_admins: true` on `master` — was wrong, and USA-AUD-040
is the reason: the release workflow force-pushes the version commit to `master` through the
owner's PAT, so enforcing admins would break publishing. The finding is retained; the remedy is
replaced with a ruleset bypass actor plus an App token. Recorded here because an audit that
silently rewrites its own advice is worse than one that shows the correction.

| USA-AUD-044 | MEDIUM | rule metadata | fixtures assert status, never severity | assert severity (CRITICAL tier at minimum) | changing a CRITICAL rule's severity fails the suite | USA-R11 |
