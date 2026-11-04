# FINDINGS — Universal Software Auditor 2.28.8

Audit date: 2026-10-31. Baseline commit `3767c7df` on `master`, clean tree at start.
Every finding below was established against that tree. Evidence tags follow the audit
brief: `VERIFIED-STATIC` (read the deciding code), `VERIFIED-RUN` (executed, command and
output recorded), `REPORT-DERIVED` (only in the supplied report), `HYPOTHESIS`.

Severity uses USA's own scale. Priority is delivery order, not severity.

| ID          | Severity | Priority | Type                | Title                                                                                                                                                                           |
| ----------- | -------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| USA-AUD-001 | CRITICAL | P0       | SECURITY            | Audited repo's `node_modules/.bin` is prepended to scanner PATH — arbitrary code execution                                                                                      |
| USA-AUD-002 | CRITICAL | P0       | OVERCLAIM           | Evidence manifest records `network: denied` and a sandbox that no mechanism provides                                                                                            |
| USA-AUD-003 | HIGH     | P1       | CONSISTENCY         | Maturity dampening never moves the score, but does move the CI gate                                                                                                             |
| USA-AUD-004 | HIGH     | P1       | SECURITY            | Regex checks have no timeout or safety validation — 95 s on a 41-byte line                                                                                                      |
| USA-AUD-005 | HIGH     | P1       | DESIGN-FLAW         | Suppression removes findings from the score denominator, so waiving a failure raises the score                                                                                  |
| USA-AUD-006 | HIGH     | P1       | DESIGN-FLAW         | The headline score reports "100 of what we could verify" as "100"                                                                                                               |
| USA-AUD-007 | MEDIUM   | P2       | RELIABILITY         | Nested `.gitignore` is ignored; ignored files are invisible with no accounting                                                                                                  |
| USA-AUD-008 | MEDIUM   | P2       | SECURITY            | `.env` from the working directory mutates the auditor's own environment                                                                                                         |
| USA-AUD-009 | MEDIUM   | P2       | RELIABILITY         | Scanner timeout signals one PID, not the process group                                                                                                                          |
| USA-AUD-010 | MEDIUM   | P2       | CONSISTENCY         | `usa serve` discards every audit warning; no format except Markdown carries them                                                                                                |
| USA-AUD-011 | MEDIUM   | P2       | RELIABILITY         | The server runs the synchronous engine on the event loop it must serve from                                                                                                     |
| USA-AUD-012 | MEDIUM   | P3       | DEBT                | `ENV_DENY` is unreachable under `ENV_ALLOW` — dead defensive code                                                                                                               |
| USA-AUD-013 | MEDIUM   | P2       | GOVERNANCE          | Report signature binds the trailer only; finding prose and locations are tamperable                                                                                             |
| USA-AUD-014 | MEDIUM   | P3       | GOVERNANCE          | 102 of 315 rules (32%) map to no standards catalogue                                                                                                                            |
| USA-AUD-015 | MEDIUM   | P3       | TEST-GAP            | 13 automatable rules have one-sided fixtures; 3 invariants are outside the fixture gate                                                                                         |
| USA-AUD-016 | MEDIUM   | P3       | GOVERNANCE          | The evolution release gate is decided over three author-written cases                                                                                                           |
| USA-AUD-017 | MEDIUM   | P3       | GOVERNANCE          | `REVIEW-REQUIRED` is a text header; only manual registration keeps a generated pack inert                                                                                       |
| USA-AUD-018 | LOW      | P3       | DEBT                | No per-command `--help`; `usa audit --help` prints the global command list                                                                                                      |
| USA-AUD-019 | LOW      | P3       | CONSISTENCY         | `grep` flags honour `i` only; `m` and `g` are silently dropped                                                                                                                  |
| USA-AUD-020 | LOW      | P3       | CONSISTENCY         | `overall` collapses to `0` when nothing resolves, conflating "unknown" with "failed"                                                                                            |
| USA-AUD-021 | LOW      | P4       | DOCUMENTATION-DRIFT | ROADMAP lists the HTML renderer as "deliberately not planned" while it ships                                                                                                    |
| USA-AUD-022 | LOW      | P4       | DOCUMENTATION-DRIFT | Shipped-count drift in prose: formats, check kinds, CLI commands                                                                                                                |
| USA-AUD-023 | MEDIUM   | P3       | DEBT                | The scanner→finding bridge is declared but no adapter implements it, so scanner evidence never reaches the audit                                                                |
| USA-AUD-024 | HIGH     | P1       | DESIGN-FLAW         | 166 of 315 rules are absent from the report; `NOT_APPLICABLE` is unreachable on the main path                                                                                   |
| USA-AUD-025 | HIGH     | P1       | SECURITY            | An invalid regex makes a rule PASS, with no warning                                                                                                                             |
| USA-AUD-026 | HIGH     | P2       | CONSISTENCY         | `usa diff` renders "no net movement" and exits 0 for a report with no trailer                                                                                                   |
| USA-AUD-027 | MEDIUM   | P2       | DESIGN-FLAW         | Four CRITICAL rules (3 manual, 1 command) can never fail a build                                                                                                                |
| USA-AUD-028 | MEDIUM   | P2       | TEST-GAP            | Six CRITICAL rules fire on legitimate code (three probed directly)                                                                                                              |
| USA-AUD-029 | LOW      | P3       | MAINTAINABILITY     | Six of 20 mutants are caught only by the full suite, not by the test file that owns the behaviour                                                                               |
| USA-AUD-030 | MEDIUM   | P3       | RELIABILITY         | No minimum scanner version is enforced                                                                                                                                          |
| USA-AUD-031 | HIGH     | P1       | DESIGN-FLAW         | Four of seven `command` rules report PASS when the tool they run fails                                                                                                          |
| USA-AUD-032 | MEDIUM   | P2       | SUPPLY-CHAIN        | Two shipped rules download and execute an unpinned npm package at audit time                                                                                                    |
| USA-AUD-033 | MEDIUM   | P1       | DESIGN-FLAW         | 57 of the 315 rules are presence proxies; a proxy PASS scores identically to a verified one                                                                                     |
| USA-AUD-034 | MEDIUM   | P2       | TEST-GAP            | Verified rule defects beyond CRITICAL: SUP-003 cannot see `^1.2.3`, SUP-008 flags the safe pattern, CTNR-001 passes a privileged container, RS-003 penalises justified `unsafe` |
| USA-AUD-035 | MEDIUM   | P2       | GOVERNANCE          | All 14 waivers are permanent; 13/14 rule-wide; FND-004 asserts a protection that does not bind the owner                                                                        |
| USA-AUD-036 | HIGH     | P1       | CONSISTENCY         | Every semgrep finding is recorded as LOW — `ERROR` and `WARNING` are both unknown to the normaliser                                                                             |
| USA-AUD-037 | MEDIUM   | P2       | BUG                 | Repeated flags keep only the last value: `--scanner a --scanner b` silently runs one                                                                                            |
| USA-AUD-038 | MEDIUM   | P2       | SUPPLY-CHAIN        | The gitleaks binary is downloaded and installed in CI with no checksum                                                                                                          |
| USA-AUD-039 | MEDIUM   | P2       | BUG                 | The `Changeset present` required check fails every Dependabot PR — `package.json` is a shipped path                                                                             |
| USA-AUD-040 | MEDIUM   | P2       | GOVERNANCE          | The release force-pushes to master with a long-lived PAT; protection is not enforced for admins to permit it                                                                    |
| USA-AUD-041 | LOW      | P3       | CONSISTENCY         | `provenance-check` exits 0 with no bundles — "nothing to read yet" is a green check                                                                                             |
| USA-AUD-042 | LOW      | P3       | SUPPLY-CHAIN        | Floating tool installs in the jobs that hold publish credentials                                                                                                                |
| USA-AUD-043 | LOW      | P3       | BUG                 | The dependency-cruiser adapter is hardcoded to `src/`                                                                                                                           |
| USA-AUD-044 | MEDIUM   | P2       | TEST-GAP            | Rule severity is untested — `CRITICAL → LOW` leaves the suite green while the weight drops 10 → 1.5                                                                             |

---

## USA-AUD-001 — Audited repository can execute its own scanner binary

**Severity** CRITICAL · **Priority** P0 · **Type** SECURITY · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** Scanner runner (`ScannerRunner.runAdapter` → `spawnScanner`)
**Location** `src/scanner/run.ts:436-447` (env construction at line 442)

**Observation.** The scanner child process is spawned with
`PATH = <audited target>/node_modules/.bin : <inherited PATH>`. The adapter's `probe()`
resolves the binary through the _auditor's_ `process.env.PATH`, but the spawn resolves
`argv[0]` through the _augmented_ PATH. When both a real scanner and a project-supplied
`node_modules/.bin/<scanner>` exist, the probe reports the real one and the project's
binary is what actually runs.

**Expected.** A scanner is either the auditor's own resolved absolute path
(`probe.executable`) or is not run. A repository under audit must never contribute an
executable to the audit process.

**Root cause.** The PATH prepend exists to let a project's devDependency scanner resolve
its own dependencies (the comment cites a measured depcruise difference). It was applied
to the _binary lookup_ as well as to dependency resolution, and the probe's result
(`probe.executable`) is recorded but not used to spawn.

**Evidence (reproduction).**

```bash
mkdir -p /tmp/hijack-probe/node_modules/.bin
printf '{"name":"p","version":"1.0.0","lockfileVersion":3,"packages":{}}' > /tmp/hijack-probe/package-lock.json
cat > /tmp/hijack-probe/node_modules/.bin/trivy <<'EOF'
#!/bin/sh
echo "HIJACKED-BY-AUDITED-REPO uid=$(id -u) home=$HOME" > /tmp/hijack-proof.txt
echo '{"SchemaVersion":2,"Results":[]}'
EOF
chmod +x /tmp/hijack-probe/node_modules/.bin/trivy
node dist/cli.js scan /tmp/hijack-probe --scanner trivy --out /tmp/hijack-evidence.md
cat /tmp/hijack-proof.txt
```

Observed:

```
HIJACKED-BY-AUDITED-REPO uid=1000 home=/home/sajan
```

and the evidence report said:

```
| trivy | 0.75.0 | ok | 0 | 7ms | stdout |
```

The manifest attributes the run to the real Trivy 0.75.0 while a project-supplied shell
script produced the output. Precondition, stated precisely: a real `trivy` must be on the
auditor's PATH for `probe()` to pass. That is the normal CI case (the composite action and
the docs install scanners), so the precondition is the expected deployment, not an exotic one.

**Impact.** A repository under audit executes arbitrary code as the auditing user, with
`HOME` reachable (`ENV_ALLOW` includes it), and the resulting evidence is attributed to a
trusted tool and version. Two distinct harms in one path: code execution, and forged
provenance that the report presents as machine evidence.

**Remediation (smallest credible).** Spawn `probe.executable` (already resolved, absolute)
instead of `argv[0]`; keep the PATH prepend for _dependency_ resolution only. If a
project-local binary is genuinely wanted, resolve it once, record its absolute path and a
hash in the manifest, and treat it as project-controlled evidence rather than as the tool.

**Verification.** Regression test: build a fixture whose `node_modules/.bin/trivy` writes a
marker, run `scan`, assert the marker does not exist and that the manifest's `command[0]`
is an absolute path outside the target. This test must be observed failing against the
current code before the fix is accepted.

**Roadmap mapping** USA-R01 (workstream A).

---

## USA-AUD-002 — The scan manifest claims an isolation it does not have

**Severity** CRITICAL · **Priority** P0 · **Type** OVERCLAIM · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC + VERIFIED-RUN

**Component** Scanner runner manifest; `usa scan` report renderer
**Location** `src/scanner/run.ts:115-119` (`environment.sandbox`, `environment.network`)

**Observation.** Every run records:

```
environment: { sandbox: 'subprocess-scratch-copy', network: options.network ? 'allowed' : 'denied' }
```

and the rendered evidence report prints `sandbox: subprocess-scratch-copy · network denied`.
Nothing denies network access. The value is derived from a boolean the caller passes, and
that boolean is only consulted in `runGates` to _skip adapters that declare_ `network: true`
(`run.ts:402`). A scanner that does not declare it, or any binary the scanner invokes, has
unrestricted network access. Likewise `subprocess-scratch-copy` describes a working
directory, not containment: the child inherits `HOME`, can read the whole filesystem, and
in USA-AUD-001's reproduction ran from the project's own tree.

**Expected.** An evidence field named `network` states what was enforced, or states that
enforcement is unavailable. "Denied" is a security claim and must be true when printed.

**Root cause.** The manifest conflates _policy input_ (`options.network`, an operator
preference that gates adapter selection) with _enforcement outcome_ (what the OS actually
prevented). No enforcement layer exists to consult.

**Impact.** This is the most corrosive kind of defect for this product: the machine-readable
evidence record asserts a security property that is false, and it is exactly the field a
reviewer would cite to justify trusting a scan. It also interacts with USA-AUD-001 — a
hijacked binary runs under a manifest that says the network was denied.

**Remediation.** Rename the field to what it is (`network: 'adapter-policy-only'` /
`enforced: false`), and add an explicit `isolation: 'none'` unless a real mechanism
(container, namespace, sandbox profile) was used and verified. Do not print "denied"
anywhere until something denies it.

**Verification.** Unit test asserting the manifest cannot emit `network: 'denied'` without
a corresponding enforcement flag; a snapshot of the rendered evidence header.

**Roadmap mapping** USA-R01.

---

## USA-AUD-003 — Maturity dampening changes the gate but never the score

**Severity** HIGH · **Priority** P1 · **Type** CONSISTENCY · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** Scoring (`score.ts`) vs dampening (`evaluate-packs.ts`, `maturity.ts`) vs gate
**Location** `src/engine/score.ts:168` (`ruleWeight(rule)`), `src/engine/evaluate-packs.ts:179-181`,
`src/engine/gate.ts:23`

**Observation.** `scoreFinding` writes the dampened severity into `finding.severity` but
leaves `rule.severity` untouched; `score.ts` computes weight from `ruleWeight(rule)`, i.e.
the **base** severity. So dampening moves severity labels, severity counts and the gate
threshold, and moves the score by exactly zero.

Measured on `examples/demo-app`, identical tree, only `--profile` changed:

| Profile    |  Overall | CRITICAL | HIGH | MEDIUM | LOW | FUTURE |
| ---------- | -------: | -------: | ---: | -----: | --: | -----: |
| production | **37.3** |        2 |   11 |     23 |  18 |      1 |
| prototype  | **37.3** |        2 |    0 |      7 |  17 |     29 |

And the gate:

```
$ usa audit /tmp/demo-probe --profile production --fail-on high   → exit 1
$ usa audit /tmp/demo-probe --profile prototype  --fail-on high   → exit 0
```

(same directory, two CRITICAL rules suppressed in both runs so the criticals could not mask
the effect).

**Expected.** One of two coherent designs. Either maturity is part of the assessment (then
the score must move with it), or maturity is a presentation/gating convenience (then the
docs must not say the report is graded to the stage).

**Root cause.** Severity is stored twice — `baseSeverity` and `severity` — and the scoring
path reads the rule object rather than the finding. The split was introduced for honest
reporting ("downgraded HIGH→LOW") without deciding which one the score means.

**Impact.** (a) A prototype and a production system with identical defects get identical
scores, which contradicts `docs/maturity-profiles.md` ("the same repository deserves a
different report at age three days and age three years"). (b) `--profile` and the
`maturity:` fact are a one-word CI bypass: nothing in the repository has to change for a
red gate to go green. That is a governance defect, not a cosmetic one.

**Remediation.** Decide, and write it down as an ADR: either weight by `finding.severity`
(score becomes stage-relative and must then never be compared across stages), or keep the
score absolute and remove dampening's influence on the gate. If the gate is meant to be
stage-aware, the profile must come from a verified source, not a flag.

**Verification.** A test that pins the intended relationship: same tree, two profiles →
score differs by a documented amount **and** the gate outcome is documented. Today a test
asserting `score(prototype) === score(production)` would pass, which is the bug.

**Roadmap mapping** USA-R04.

---

## USA-AUD-004 — Regex checks are unbounded; catastrophic backtracking hangs the audit

**Severity** HIGH · **Priority** P1 · **Type** SECURITY · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** `Project.grep` / `compileGrepPattern`
**Location** `src/util/project.ts:401-433`, `543-548`

**Observation.** Rule patterns are compiled with `new RegExp(pattern)` and executed per line
with no timeout, no complexity check and no RE2-style engine. A single 41-byte line matched
against `(a+)+$` took **95 314 ms**:

```
$ node -e "… new Project('/tmp/usa-probe/redos').grep('(a+)+\$', ['**/*.txt'])"
hits 0 elapsed_ms 95314
```

`MAX_FILE_BYTES` is 2 MB, and grep splits on newlines — a minified bundle is one 2 MB line.
The shipped catalogue is currently clean: I scanned all 137 regex-bearing rules for nested
quantifiers (`(…[+*])[+*]`, alternation under a quantifier) and found **0** matches. The
exposure is therefore not the bundled packs; it is `--rules-dir` (documented as a supported
extension point), `usa bootstrap` output (patterns generated from a catalogue) and any
third-party pack.

**Expected.** Either a regex engine with linear-time guarantees, or a per-rule time budget
that fails the rule as UNKNOWN rather than hanging the process.

**Root cause.** "Rules are data" was taken to mean "rules are safe". Data that is executed
by a backtracking engine is code for availability purposes.

**Impact.** Denial of service against the auditor — including in CI, where a hanging job is
a failed pipeline. It is also a silent quality trap: a pack author writing a natural but
ambiguous pattern degrades the tool unpredictably rather than erroring.

**Remediation.** Add a per-`grep` deadline (the audit already has a 60 s budget concept for
`command` checks) and validate patterns at load time with a bounded-backtracking heuristic;
on breach, mark the rule UNKNOWN with a warning instead of evaluating it.

**Verification.** A fixture with a 64 KB single-line file and a nested-quantifier pattern
must complete in bounded time and emit a warning naming the rule.

**Roadmap mapping** USA-R02.

---

## USA-AUD-005 — Suppression is a score lever

**Severity** HIGH · **Priority** P1 · **Type** DESIGN-FLAW · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN (arithmetic over the real report) + VERIFIED-STATIC

**Component** Scoring under suppression
**Location** `src/engine/score.ts:144-147`

**Observation.** A suppressed finding increments `applicable` and then returns before
`applyRuleCredit`, so it contributes to neither numerator nor denominator. For a
zero-credit status (FAIL, MISSING) that is arithmetically identical to deleting a
zero-value term from a fraction's denominator: the ratio rises.

Measured on this repository's own audit:

|                                       |   Overall | Resolved weight | Credit |
| ------------------------------------- | --------: | --------------: | -----: |
| As published (13 zero-credit waivers) | **100.0** |          439.15 | 439.15 |
| Waivers not applied (same tree)       |  **92.0** |          477.20 | 439.15 |

The 13 suppressed rules are `REPO-002` (FAIL) and twelve MISSING rules
(`PY-001/002/003/010`, `FND-004/011/013`, `TAS-005/006`, `CICD-006`, `REL-004`, `COMP-010`).
Every one of them carries a written reason and a revisit condition — this is not an
accusation of bad faith. The arithmetic is the point: the published 100 depends on them.

**Expected.** Accepting a risk should not improve the score. The two honest options are
(a) keep the finding in the denominator at its 0 credit (score falls, accepted risk is
visible in the number) or (b) report two numbers — score and coverage — and never let
acceptance change either.

**Root cause.** Suppression was implemented as "exclude from scoring" for a good reason
(a suppressed CRITICAL used to print "HIGH: 1" beside "No CRITICAL or HIGH findings"), and
the fix removed the finding from the _whole_ calculation rather than from the _open_ count.

**Impact.** Every adopter can raise its score by waiving its worst findings, with a reason
string as the only cost. The documented guard ("always with a reason") is a social control,
not a mathematical one. This is the single most gameable property of the score.

**Remediation.** Count suppressed zero-credit findings in the denominator (weight stays,
credit stays 0), and surface `score_without_waivers` in the trailer so a reader can see the
gap. Confidence already drops when a finding is suppressed — the score should too.

**Verification.** A test: one PASS rule + one FAIL rule → suppress the FAIL → score must not
increase. Today it does.

**Roadmap mapping** USA-R03.

---

## USA-AUD-006 — The headline score hides what was not verified

**Severity** HIGH · **Priority** P1 · **Type** DESIGN-FLAW · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** Score presentation and calibration
**Location** `src/engine/score.ts:80-88`, `src/report/markdown.ts` executive summary

**Observation.** This repository audits itself at **100/100** while the same report states
`66.4%` automation coverage and `36 checks need a human`. Two further measurements:

- An **empty git repository** scores **45.3/100** (16 PASS, 39 MISSING, 9 UNKNOWN). The
  negative rules ("no `.env` committed", "no secrets in history", "no build artifacts
  tracked") all pass on nothing, so the scale's floor is not 0.
- Two thirds of the scale is therefore compressed into 45–100, and the top of it is reached
  by resolving only the deterministic subset.

**Expected.** The number people quote should mean "assurance established", not "assurance
established among the questions we could answer". A 100 with a third of checks unresolved
is a claim the evidence does not support.

**Root cause.** UNKNOWN exclusion is correct statistics for a _ratio over resolved items_
and wrong presentation for a _headline grade_. The report discloses coverage in a footnote
and a dagger (†) on low-confidence sections; the headline has no such marker.

**Impact.** False assurance by arithmetic. A reader (or a procurement reviewer, or a badge)
takes `100/100` and stops. The product's own differentiator — "trustworthy assurance, not a
score" — is contradicted by its own front page.

**Remediation.** Never print a bare score. Print `100 / 100 · 66% verified` as one token,
or publish an interval, or gate the headline on a minimum coverage (below it, print
`insufficient evidence` instead of a number). The empty-repo floor should also be fixed or
documented, because it makes cross-project comparison meaningless.

**Verification.** A test asserting the headline cannot render a score without its coverage
figure, and a calibration test: empty repo, minimal repo, mature repo → scores must be
monotone and the floor must be justified.

**Roadmap mapping** USA-R03.

---

## USA-AUD-007 — Nested `.gitignore` is ignored; ignored files vanish without a counter

**Severity** MEDIUM · **Priority** P2 · **Type** RELIABILITY · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN + VERIFIED-STATIC

**Component** Project index
**Location** `src/util/project.ts:256` (`readGitignore` called once, for the root),
`640-649`, `286-303`

**Observation.** Only `<root>/.gitignore` is read, and only as a flat pattern list. A
subdirectory's own ignore file has no effect:

```
$ printf 'secret.env\n' > sub/.gitignore
$ node -e "new Project('/tmp/gi-probe').files"
indexed: .gitignore, sub/.gitignore, sub/keep.txt, sub/secret.env
secret.env indexed? true
```

Separately, files excluded by the root `.gitignore` or `DEFAULT_IGNORES` are dropped with no
counter and no warning, while every other kind of invisibility _is_ counted and surfaced:
`truncated` (MAX_FILES), `skippedLarge` (MAX_FILE_BYTES), `skippedSymlinks`.

**Expected.** Either git's ignore semantics (nested files, negation, directory anchoring) or
a documented statement that only the root file is honoured. And, given the project's own
standard of honesty about blind spots, a count of what was excluded.

**Root cause.** A flat list is enough for the common single-package repo and was cheaper
than implementing gitignore precedence; the asymmetry with the other counters was not
noticed because the exclusion happens in the walk rather than in `read()`.

**Impact.** Two directions. False positives: build output or generated code ignored by a
nested file is scanned and reported (monorepos and polyglot trees hit this first).
False assurance: a root `.gitignore` can hide a directory from every content check, and
nothing in the report says so — `tracked_*` rules survive because they use `git ls-files`,
but every `grep_*` rule silently sees less.

**Remediation.** Implement nested ignore files (read per directory during the walk, nearest
wins), or at minimum count and warn on ignored-file exclusion the way `skippedLarge` is
counted. The warning belongs in the audit-warnings channel that already exists.

**Verification.** Fixture with `sub/.gitignore` ignoring `sub/secret.env` → assert it is not
indexed; fixture with 100 root-ignored files → assert a warning states the count.

**Roadmap mapping** USA-R05.

---

## USA-AUD-008 — `.env` from the working directory rewrites the auditor's environment

**Severity** MEDIUM · **Priority** P2 · **Type** SECURITY · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** CLI bootstrap; env loader
**Location** `src/cli.ts:64` (`loadEnvFile(process.cwd())`), `src/util/env.ts:18-38`

**Observation.** At startup the CLI reads `<cwd>/.env` and writes every unset `KEY=VALUE`
into `process.env`. In the documented workflow the cwd _is_ the project being audited
(`cd target && usa audit .`). A repository therefore chooses environment values for the
auditor: provider API keys, provider base URLs, and anything else read from the
environment later. The real environment wins where a key is already set, which limits the
blast radius but does not remove it — the case that matters is the user who relies on a
default endpoint.

**Expected.** Configuration that governs the auditor is not sourced from the artefact under
audit, or it is sourced with an explicit, visible opt-in naming the file.

**Root cause.** A convenience loader for local development (`.env` next to the CLI) reused
the same cwd resolution when the CLI runs inside a target.

**Impact.** A hostile or careless repository can point `usa live` at an attacker-controlled
endpoint and receive the repository contents plus prompts; it can also pre-set values that
change scanner behaviour. It does not affect the deterministic audit path (scanners get an
allow-listed env), which is why this is MEDIUM and not higher.

**Remediation.** Load `.env` from the _installation_ directory or an explicit
`--env-file`, never from the audited target; and log the names loaded (the loader already
returns names, never values) at `--verbose`.

**Verification.** Fixture repo with `.env` containing a provider base URL → assert the
auditor's resolved endpoint is unchanged.

**Roadmap mapping** USA-R06.

---

## USA-AUD-009 — Scanner timeout kills one process, not the tree

**Severity** MEDIUM · **Priority** P2 · **Type** RELIABILITY · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** `spawnScanner`
**Location** `src/scanner/run.ts:436-447` (`spawnSync`, `killSignal: 'SIGTERM'`)

**Observation.** `spawnSync` with `timeout` signals the direct child only. Scanners that
fork — CodeQL's JVM workers, Trivy's downloader, ORT's Gradle/Maven daemons — leave
grandchildren running after the adapter is recorded as `timeout`. There is also no SIGKILL
escalation, so a child that traps SIGTERM is never reaped.

**Expected.** A timed-out scan leaves no processes behind; the manifest's `timeout` status
is true of the whole adapter.

**Impact.** CI runners accumulate orphans; on a shared machine a timed-out scan can keep
consuming CPU and disk (CodeQL databases) after USA has moved on and reported a blind spot.

**Remediation.** `spawn` with `detached: true` and kill the negative PID on timeout
(`process.kill(-pid, 'SIGKILL')` after a grace period), or use a process-group wrapper.

**Verification.** A fixture adapter that spawns `sleep 300` in a subshell; after the
timeout, assert no descendant of the scan PID remains.

**Roadmap mapping** USA-R01.

---

## USA-AUD-010 — `usa serve` throws away every audit warning

**Severity** MEDIUM · **Priority** P2 · **Type** CONSISTENCY · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** Server job runner; report serializers
**Location** `src/serve/server.ts:126-135`; `src/report/json.ts` (no warnings field)

**Observation.** `runAudit` returns `{ report, warnings, profile }`. The server destructures
`{ report, profile }` and drops `warnings` on the floor. Independently, `renderJson` and
`renderSarif` have no warnings channel at all, so the only place a warning survives is the
Markdown body.

**Expected.** Honesty warnings ("tree truncated at 60 000 files", "pack failed to load",
"suppression matched nothing", "N files over the size cap") are part of the assessment and
travel with it in every format.

**Impact.** A server user — the mode built for repeated, unattended audits — can never see
that an audit was partial. A JSON consumer (the action, a dashboard) sees a clean report for
a truncated tree. This is the exact failure the `truncated`/`skippedLarge` counters were
added to prevent, reintroduced at the serialization boundary.

**Remediation.** Add `warnings: string[]` to the report schema (and to JSON/SARIF
`invocations[].toolExecutionNotifications`), and stop discarding the field in the server.

**Verification.** Audit a tree over `--max-files`, assert the JSON report contains a
truncation warning and that a served job's payload does too.

**Roadmap mapping** USA-R07.

---

## USA-AUD-011 — The server audits on its own event loop

**Severity** MEDIUM · **Priority** P2 · **Type** RELIABILITY · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** Job manager
**Location** `src/serve/jobs.ts:107-128`

**Observation.** `submit` defers with `setImmediate`, then calls the runner synchronously.
The comment is honest about it ("the sync engine still blocks the loop while it runs,
documented localhost limitation"). The consequence is not stated: the UI's progress polling
(`GET /api/audits/:id`) cannot be served until the audit finishes, so the "running" state is
observable only as a hang.

**Expected.** Either a live status channel, or a UI that does not pretend to poll.

**Impact.** The single-flight design (409 on a second submit) is sound; the presentation is
not. On a large tree the operator sees a spinner with no evidence the process is alive, and
no way to distinguish "working" from "wedged" — which matters because USA-AUD-004 can wedge it.

**Remediation.** Run the audit in a worker thread or child process, or (cheaply) stream
progress events from the engine. At minimum, have the UI state that the request will not
return until the audit completes.

**Verification.** Submit an audit against a fixture with an artificial delay; assert
`GET /api/audits/:id` responds with `running` before completion.

**Roadmap mapping** USA-R08.

---

## USA-AUD-012 — `ENV_DENY` cannot fire

**Severity** MEDIUM · **Priority** P3 · **Type** DEBT · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** `childEnv`
**Location** `src/scanner/run.ts:32-64`

**Observation.** `ENV_ALLOW` is `['HOME','PATH','LANG','LC_ALL','TMPDIR','https_proxy','http_proxy']`.
`childEnv` iterates the allow list and skips a key if it is in `ENV_DENY`. No key in
`ENV_ALLOW` appears in `ENV_DENY`, so the deny list can never remove anything. It is
exported and could in principle be called with a wider allow list, but no caller does.

**Expected.** A deny list that reads like a control should be one, or should be labelled as
documentation.

**Impact.** A reviewer reading `ENV_DENY` concludes credential variables are actively
stripped. They are not present to begin with — the outcome is the same, but the mechanism
is illusory, and the next person to widen `ENV_ALLOW` (e.g. to pass a proxy credential) will
believe the deny list still protects them.

**Remediation.** Either drop `ENV_DENY` and document the allow-list as the control, or apply
it as a filter over the _inherited_ env before allow-listing (defence in depth that can
actually fire).

**Verification.** A test that widens the allow list to include `GITHUB_TOKEN` and asserts it
is still absent from the child env. That test fails today.

**Roadmap mapping** USA-R01.

---

## USA-AUD-013 — The signature binds the trailer, not the report

**Severity** MEDIUM · **Priority** P2 · **Type** GOVERNANCE · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** `canonicalReportBytes`
**Location** `src/report/signature.ts:34-36`; `src/report/markdown.ts:670-692`

**Observation.** The signed payload is `trailer(report)`: schema, `generated_at`,
`usa_version`, `ruleset`, `overall`, per-section `{score, open, review}`, severity totals and
per-rule `{status, severity, section}`. It does **not** include finding titles, messages,
locations, remediation or references.

**Expected.** A signature over a report should bind what a reader acts on, or the report
should say precisely what is bound.

**Impact.** An attacker (or a careless editor) can rewrite a finding's message, its file and
line, and its remediation without invalidating the signature. Verdicts and scores are
protected; the evidence a human uses to act is not. For a tool whose thesis is provenance,
that gap should be a stated limitation rather than an emergent property of "we hash the
trailer because `usa diff` already parses it".

**Remediation.** Sign `sha256(body) + sha256(trailer)` and record both in the sidecar, or
state in `SECURITY.md` and the sidecar schema that only machine state is bound.

**Verification.** Test: sign a report, edit a finding's `message`, assert verification fails.
Today it passes.

**Roadmap mapping** USA-R09.

---

## USA-AUD-014 — A third of the catalogue maps to no standard

**Severity** MEDIUM · **Priority** P3 · **Type** GOVERNANCE · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** Rule references / catalogues
**Location** `rules/catalogues.yaml`, `usa standards`

**Observation.** `usa standards` reports 213 catalogued rules across 13 catalogues and
**102 of the 315 rules in `(uncatalogued)`** — 32%. Distribution: CWE 56, Scorecard 37,
SSDF 25, OWASP Top 10 19, SLSA 15, ASVS 13, WCAG 9, DORA 8, CII 7, ISO 5055 7, CIS 6,
SWC 6, GDPR 5.

**Expected.** Either the rule is traceable to a requirement, or the report says the rule is
house opinion rather than standard-derived.

**Impact.** The standards table is the evidence a compliance-minded reader uses. A third of
the catalogue silently has no external anchor, so "mapped to ASVS/SSDF/SLSA" describes
two thirds of the product. That is a defensible position — house rules are legitimate — but
it must be stated, because the table's shape implies total coverage.

**Remediation.** Print the uncatalogued count in the `standards` summary line, and tag those
rules in the pack (`provenance: house`) so the distinction is machine-readable.

**Verification.** `usa standards` output must state the uncatalogued proportion; a test pins
the number so it cannot drift silently.

**Roadmap mapping** USA-R10.

---

## USA-AUD-015 — One-sided fixtures and an ungated invariant set

**Severity** MEDIUM · **Priority** P3 · **Type** TEST-GAP · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** Rule fixtures
**Location** `tests/fixtures/rules/`, `tests/rule-fixture-helpers.ts:56-60`

**Observation.** Coverage is genuinely strong: 205 fixtures for the 205 non-manual,
non-invariant rules — the CI gate (`every automatable rule has a fixture`) holds. But:

- **6 fixtures are negative-only** — `REPO-002`, `REPO-007`, `REPO-008`, `ARCH-003`,
  `TEST-003`, `ML-009`. They prove the rule passes on a clean tree and never prove it fires.
  A regex that matches nothing satisfies them.
- **7 are positive-only** — `REPO-003`, `SUP-018`, `SUP-019`, `SUP-020`, `ARCH-005`,
  `DEP-002`, `DEP-005`. They prove it fires and never prove it does not over-fire.
- **3 `invariant` rules are excluded** from the gate by construction
  (`kind !== 'manual' && kind !== 'invariant'`), so the composition logic has no per-rule
  fixture.

**Expected.** Both directions for every deterministic rule, or a recorded justification for
the one-sided case.

**Impact.** Rule rot is the stated enemy and the fixture gate is the defence. A negative-only
fixture is the specific shape of rot the gate cannot see.

**Remediation.** Add the missing direction to the 13 one-sided fixtures; add an invariant
fixture kind that supplies a finding set instead of a file tree.

**Verification.** Tighten the gate to require `positive && negative` and watch the 13 fail.

**Roadmap mapping** USA-R11.

---

## USA-AUD-016 — The evolution gate is decided over three cases

**Severity** MEDIUM · **Priority** P3 · **Type** GOVERNANCE · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** `releaseGate`
**Location** `src/evolution/release.ts:18-26`; corpus at `examples/evolution/bench/`

**Observation.** The gate requires `precision >= 1`, `recall >= 1`, `regressions === 0`, and
`hasEvidence`. The shipped benchmark corpus is three JSON cases —
`1-lua-positive`, `2-lua-negative`, `3-lua-regression` — all authored by the project.

**Expected.** The gate's claim is about capability quality; its evidence is about
implementation plumbing.

**Impact.** Perfect scores on a three-case, self-authored corpus cannot distinguish a good
capability from a fitted one. The mechanism is real and useful (it does prevent an
obviously broken candidate from shipping); the _quality_ claim is unsupported. This is the
"author-written fixtures reward the candidate they were designed to approve" risk, confirmed
in structure rather than in intent.

**Remediation.** Separate the two gates explicitly: `mechanism` (does the candidate run,
parse, and not regress the suite) and `quality` (precision/recall over a corpus the candidate
author did not write). Only the first can be decided by self-authored cases.

**Verification.** A test that a candidate matching exactly one hand-written case but failing
an independent held-out case is rejected. No such case exists today.

**Roadmap mapping** USA-R12.

---

## USA-AUD-017 — `REVIEW-REQUIRED` is a comment, not a control

**Severity** MEDIUM · **Priority** P3 · **Type** GOVERNANCE · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** Bootstrap
**Location** `src/bootstrap/index.ts:14-22`, `218-230`

**Observation.** `bootstrapPacks` never touches `rules/index.yaml`, and writes only on an
explicit `--out`. That is a real, effective gate: an emitted pack is inert until a human
registers it. The `REVIEW-REQUIRED` string is a header comment; nothing in the loader reads
it, and once a pack is listed in the index it loads with no review state at all.

**Expected.** Be precise about which mechanism does the work. The registry is the control;
the header is documentation.

**Impact.** Low direct risk — the design is sound — but the docs read as though the marker
enforces something. An operator who copies a generated pack into `rules/` and adds one line
to the index has an unreviewed capability in the active set, and the engine cannot tell.

**Remediation.** Either read the marker at load time and refuse (or downgrade to
NOT_APPLICABLE with a warning), or rename it to `REVIEW-REQUIRED (advisory)` and document
the registry as the gate.

**Verification.** A pack carrying the marker and listed in the index must be refused or
warned. Today it loads silently.

**Roadmap mapping** USA-R12.

---

## USA-AUD-018 — No per-command help

**Severity** LOW · **Priority** P3 · **Type** DEBT · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** CLI help
**Location** `src/cli-help.ts`

**Observation.** `usa audit --help` prints the global command list, not audit's flags. The
flags exist (`--depth`, `--profile`, `--format`, `--fail-on`, `--baseline`, `--out`,
`--allow-commands`, `--rules-dir`) but are documented only in `docs/reference/cli.md`.

**Expected.** `usa audit --help` answers "what can I pass to audit?".

**Impact.** Discoverability; the generated CLI reference is good, but the terminal is where
the question is asked.

**Remediation.** Route `--help` per subcommand to a per-command synopsis derived from the
same table that generates `docs/reference/cli.md`.

**Verification.** `usa audit --help` output contains `--fail-on`.

**Roadmap mapping** USA-R13.

---

## USA-AUD-019 — `grep` flags honour `i` only

**Severity** LOW · **Priority** P3 · **Type** CONSISTENCY · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** `compileGrepPattern`, `grepFile`
**Location** `src/util/project.ts:543-548`, `431`

**Observation.** `new RegExp(pattern, flags.includes('i') ? 'i' : '')` — every other flag is
dropped. `grepFile` then resets `lastIndex` when `m` is absent, which has no effect because
the regex is never global. A pack author writing `flags: 'm'` or `flags: 'g'` gets neither.

**Expected.** Either honour the declared flags or reject unknown ones at load time.

**Impact.** Silent behavioural drift between what a rule declares and what it does. No
shipped rule uses `m`/`g` today (checked), so the impact is future-facing.

**Remediation.** Validate `flags` against `[im]` at load; pass `m` through.

**Verification.** A fixture rule with `flags: 'm'` and a `^`-anchored multi-line pattern.

**Roadmap mapping** USA-R14.

---

## USA-AUD-020 — `overall` collapses to 0 when nothing resolves

**Severity** LOW · **Priority** P3 · **Type** CONSISTENCY · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** `score`
**Location** `src/engine/score.ts:81`

**Observation.** `overall: acc.totalW > 0 ? … : 0`. A section with no resolved rules
correctly yields `score: null` (line 184) and renders as "— not verified"; the overall score
has no such state and reports `0`. A report in which nothing resolved is therefore
indistinguishable, at the top level, from a report in which everything failed.

**Expected.** `overall: null` (or "insufficient evidence") when `totalW === 0`, matching the
section-level behaviour that already exists three lines below.

**Impact.** Low today because a real tree always resolves something (an empty repo resolved
25 of the 315 rules and scored 45.3). It becomes real the moment a ruleset is loaded that is entirely
manual, which is exactly what `bootstrap` produces for an unknown language.

**Remediation.** Mirror the section logic: `totalW > 0 ? round1(...) : null`, and teach the
renderers to print "not verified".

**Verification.** A ruleset of one `manual` rule → overall must be null, not 0.

**Roadmap mapping** USA-R03.

---

## USA-AUD-021 — The roadmap says HTML is not planned; HTML ships

**Severity** LOW · **Priority** P4 · **Type** DOCUMENTATION-DRIFT · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** ROADMAP.md vs `src/report/html.ts` vs `cli-audit.ts`
**Location** `ROADMAP.md:130-131`; `src/cli-audit.ts:30-32`

**Observation.** ROADMAP lists "HTML / JUnit renderers" under "Deliberately not planned
(yet)", with the reason that JSON and SARIF feed standards-based consumers. The CLI accepts
`--format html`, `src/report/html.ts` exists, and `usa serve` renders HTML by default for
its `html` format. ADR-0018 is cited as the authority for the exclusion.

**Expected.** A roadmap that lists what is actually excluded. A capability that shipped
should move to "Shipped" with its ADR, and the exclusion list should name only JUnit.

**Impact.** A reader planning integrations cannot tell what exists. This is the exact class
of drift the docs gates are supposed to catch — they check formatting, generated files and
manifests, not whether a "not planned" item exists in `src/`.

**Remediation.** Move HTML to Shipped with the ADR that authorised it; keep JUnit excluded.

**Verification.** A docs check that every `src/report/*.ts` renderer appears in either the
Shipped or a Planned section.

**Roadmap mapping** USA-R13.

---

## USA-AUD-022 — Shipped-count drift

**Severity** LOW · **Priority** P4 · **Type** DOCUMENTATION-DRIFT · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** README / docs prose vs code
**Location** `README.md`, `docs/`

**Observation.** Measured against the tree: **18** check kinds (not 16), **22** CLI commands
(not 19), **5** report formats `md|json|sarif|narrative|html` (not 4). Rules (315) and
detectors (236) are correct in the README — the 685 figure in the supplied report is the
error, not the repository. See `CLAIMS-VERIFICATION.md`.

**Expected.** Counts in prose match the artefact, or are generated.

**Impact.** Low individually; collectively they erode the credibility of every other number
in the documentation, which is the product's currency.

**Remediation.** Extend the existing `usa:fact` marker mechanism (already used for
`rules-floor` and `detectors-approx`) to check kinds, commands and formats.

**Verification.** `pnpm docs:check` fails when a count drifts.

**Roadmap mapping** USA-R13.

---

## USA-AUD-023 — Scanner findings never reach the audit

**Severity** MEDIUM · **Priority** P3 · **Type** DEBT · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC + VERIFIED-RUN

**Component** Scanner adapter contract
**Location** `src/scanner/types.ts:105,241,266`; `src/cli-scan.ts:94`; all six adapters

**Observation.** `ScannerAdapter.findings?` is an optional mapper from evidence to
`ScannerFinding`, and `ScannerRunner` collects `findingsOf(adapter, evidence)`. No shipped
adapter implements it — measured over the registry, all six report `hasFindingsMapper =
false` — so `ScanResult.findings` is always `[]` and `cli-scan.ts:94` prints a count that is
structurally zero.

**Expected.** Either the bridge exists (scanner results become findings with severity,
location and rule attribution), or the contract does not exist and `usa scan` is documented
as an evidence-only side channel.

**Impact.** Two consequences worth separating. _Product_: running Trivy or Semgrep does not
change the audit's findings, score, or gate at all — scanner evidence is a separate report
that nothing consumes. A user who installs scanners expecting their score to reflect them
will be surprised, and the `oracle` check kind is the only path from evidence into a verdict
(and no bundled rule uses it). _Maintainability_: `ScannerFinding`, the mapper contract and
the collection path are dead code that reads as a shipped capability.

**Remediation.** Decide which it is. If findings are intended, implement the mapper for at
least one adapter and prove the evidence→finding→score path end to end. If not, delete
`ScannerFinding` and say plainly in `docs/scanners.md` that `usa scan` is evidence-only.

**Verification.** An integration test: run a fixture adapter whose mapper emits one finding,
assert it appears in the audit's finding set with a rule attribution. Today no such test can
exist.

**Roadmap mapping** USA-R15.

---

## USA-AUD-024 — 166 of 315 rules are absent from the report

**Severity** HIGH · **Priority** P1 · **Type** DESIGN-FLAW · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** Applicability gate / report assembly
**Location** `src/engine/evaluate-packs.ts:35` (`if (!ruleApplies(...)) continue;`)

**Observation.** `ruleApplies` returning false `continue`s — the rule never enters
`evaluated`, so no `Finding` exists. Measured on this repository's own audit: **149 unique
rules in the report, 166 absent, `NOT_APPLICABLE: 0`.** The canonical status that is supposed
to mean "considered and skipped" is effectively unreachable for the main path.

Three different situations produce the same output (nothing):

1. the rule genuinely does not apply to this project,
2. the rule is gated on a fact nothing produces (`has:crypto`, `has:file-upload`, `has:pii`,
   `has:payments` — 8 of the 315 rules),
3. the rule was disabled by configuration.

**Expected.** A rule that was considered and skipped is recorded with the reason. The product's
thesis is that it says what it could not verify; a rule that vanishes is the one thing it
cannot say.

**Root cause.** The gate was written as a filter for speed and signal (do not emit 166 rows of
NOT_APPLICABLE noise), which is right for the _score_ and wrong for the _record_.

**Impact.** Three consequences. (a) The coverage denominator (149) is presented as if it were
the catalogue, so "66.4% of applicable checks" hides that 53% of the catalogue was never
considered. (b) A pack with a typo'd fact is indistinguishable from a pack that does not apply —
a silent failure mode for contributors. (c) The audit cannot answer "which requirements did you
consider?", which is the first question a compliance reviewer asks.

**Remediation.** Emit a disposition record per rule — `{ruleId, applicable: false, reason:
'predicate' | 'depth' | 'disabled' | 'unknown-fact:<fact>'}` — into a separate section that is
not scored and not counted in the finding table. The score denominator stays 149; the record
becomes 315.

**Verification.** A test asserting `findings + skipped === catalogue size`, and that a rule
gated on an unproducible fact is reported with `unknown-fact`.

**Roadmap mapping** USA-R16.

---

## USA-AUD-025 — An invalid regex makes a rule PASS, silently

**Severity** HIGH · **Priority** P1 · **Type** SECURITY · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** `compileGrepPattern` → `Project.grep` → `checkGrepAbsent`
**Location** `src/util/project.ts:543-548`, `401-411`; `src/engine/evaluate.ts:288-299`

**Observation.** `compileGrepPattern` returns `null` on an invalid pattern; `grep` returns
`[]`; `checkGrepAbsent` reads `[]` as "no matches" and returns **PASS**. Reproduction: a pack
with `check: { kind: grep_absent, pattern: '(unclosed', include: ['**/*.ts'] }` produces

```
"X-002": {status: PASS, severity: HIGH, section: S1}
```

with **no warning of any kind** — the only stderr line is the unrelated git-repository notice.

**Expected.** A rule whose pattern cannot compile is not a rule that passed. The predicate path
already does this correctly: an unknown operator warns and the rule never applies (verified).
The check path must match it — UNKNOWN, plus a load-time warning.

**Root cause.** `grep` treats a compile failure as "no hits" because its signature has no way
to express "could not evaluate". Every caller then interprets empty as a verdict.

**Impact.** A typo in any contributed pack silently converts a check into a pass. For
`grep_absent`/`grep_wrong`/`grep_deprecated` the failure direction is **false assurance** — the
worst direction for an audit tool. `grep_present` fails the other way (MISSING), which at least
looks wrong. `--rules-dir` is a documented extension point, so this is reachable by anyone who
writes a pack.

**Remediation.** Make `grep` return `{hits, compiled: boolean}` (or throw a typed error the
check turns into UNKNOWN), and validate every `pattern` at load time with `new RegExp` in a
try/catch that emits a warning naming the rule.

**Verification.** Fixture pack with `(unclosed` → assert status UNKNOWN and a warning naming
`X-002`. Today it asserts PASS.

**Roadmap mapping** USA-R19.

---

## USA-AUD-026 — `usa diff` fails open on a report with no trailer

**Severity** HIGH · **Priority** P2 · **Type** CONSISTENCY · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** `usa diff`
**Location** `src/cli-reports.ts:65-67` (the guard exists but is not on this path)

**Observation.** Two files containing no trailer compare successfully:

```
$ usa diff noreport.md noreport.md
| **Overall score** | 0 | 0 | 0 |
## ✅ Fixed (0)   None. ✅
## 🔺 Regressed (0)  None. ✅
**No net movement.** Either nothing changed, or fixes were offset by newly applicable rules.
exit=0
```

**Expected.** Refuse. The sibling path already does: `parseBaselineTrailer` throws with
`--baseline has no report trailer and no YAML content`, and the CLI exits 2.

**Root cause.** Two readers of the same input with opposite postures — the baseline gate fails
closed, the diff view fails open. `parseTrailer` returns `null` and the diff renders an empty
comparison rather than treating `null` as an error.

**Impact.** A truncated, hand-edited or wrong-file report reads as "no change", with a green
exit code. Any CI that uses `usa diff` as a regression signal passes on garbage. This is the
same class as the scanner blind spot the product is careful about elsewhere.

**Remediation.** Make `diff` throw (exit 2) when either side has no trailer, reusing the
baseline's error text. One branch.

**Verification.** `usa diff` on a trailerless file → exit 2 with a named reason; a test pinning
both readers to the same posture.

**Roadmap mapping** USA-R17.

---

## USA-AUD-027 — Four CRITICAL rules can never fail a build

**Severity** MEDIUM · **Priority** P2 · **Type** DESIGN-FLAW · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** CRITICAL tier of the catalogue
**Location** `rules/stacks/solidity.yaml` (SOLID-001, SOLID-003), `rules/stacks/ai-era.yaml`
(AI-001), `rules/core/repo.yaml` (REPO-003)

**Observation.** Three CRITICAL rules are `check: { kind: manual }` — always UNKNOWN, excluded
from the score, never blocking (`gate.ts` filters UNKNOWN out). One more, REPO-003, is a
`command` check: `assist` automatability, UNKNOWN unless `--allow-commands`, so it does not
gate by default either.

**Expected.** Severity and mechanism agree. A CRITICAL that cannot fail is a claim the tool
cannot keep; either it gets a deterministic proxy or its severity is honest about being
judgement-only.

**Impact.** One in six CRITICAL rules is decorative. A reader who filters the report on
CRITICAL — the intended triage path — gets a list where four entries can never produce a red
line, and a CI gate on `--fail-on critical` can never fire for them.

**Remediation.** For SOLID-001/003 and AI-001: either pair the manual judgement with a
deterministic proxy (e.g. presence of a reentrancy guard modifier, presence of an
`onlyOwner`-style modifier) at a lower severity, or move the judgement rule to MEDIUM and let
the proxy carry CRITICAL. For REPO-003: document that it requires `--allow-commands`, and say
so in the report rather than emitting a bare UNKNOWN.

**Verification.** A test asserting that every CRITICAL rule has `automatability !== 'manual'`,
or is explicitly listed in an `accepted-judgement` register.

**Roadmap mapping** USA-R18.

---

## USA-AUD-028 — Six CRITICAL rules fire on legitimate code

**Severity** MEDIUM · **Priority** P2 · **Type** TEST-GAP · **Confidence** Confirmed for three,
High for three · **Evidence** VERIFIED-RUN (regex probes) + VERIFIED-STATIC

**Component** CRITICAL rule patterns
**Location** SEC-011, WEB-007, PY-006, GO-007, IAC-001, REPO-002

**Observation.** Probed directly with hand-written legitimate inputs:

| Rule    | Legitimate input                                                | Result                                                                                            |
| ------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| SEC-011 | `crypto.createHash("sha256").update(buf)` (a file checksum)     | **MATCHES** — the rule is titled "passwords use a modern adaptive hash" but bans SHA-256 anywhere |
| WEB-007 | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51H`                | **MATCHES** — a publishable key is designed to be public                                          |
| PY-006  | `yaml.load(` with `Loader=yaml.SafeLoader` on the **next** line | **MATCHES** — the negative lookahead cannot cross a newline                                       |

Assessed by reading: GO-007's `Exec\(\s*.*\+` fires on any `Exec(` with a `+` later on the
line; IAC-001's `0.0.0.0/0` fires on any internet-facing security group; REPO-002 bans `.npmrc`
categorically, which is why this repository waives it for itself.

**Expected.** A CRITICAL rule fires on the violation its title names and not on the legitimate
near-miss.

**Impact.** Every one of these is a CRITICAL, so a false positive blocks a release or forces a
waiver — and a waiver lowers the score's honesty (USA-AUD-005). Six CRITICAL false-positive
risks in a 23-rule tier is a quarter of the tier.

**Remediation.** Add the six negative fixtures named in `RULE-SEMANTIC-AUDIT.md`. Two lines of
YAML each; the harness already exists.

**Verification.** Those six fixtures must pass on the legitimate input and fail on the
violation.

**Roadmap mapping** USA-R11 (extended).

---

## USA-AUD-029 — Six behaviours are guarded by a test in a different file

**Severity** LOW · **Priority** P3 · **Type** MAINTAINABILITY · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** Test suite
**Location** see `MUTATION-TESTING.md`

**Observation.** 20 source-level mutants, **20 killed by the full suite** (100%). Only **14**
are killed by the test file that should own the behaviour. Six are caught elsewhere: M02
(EXPERIMENTAL credit), M08 (CRITICAL dampenable), M12 (grep hit cap), M13 (binary sniff), M15
(SIGTERM → normal run), M16 (dampening never applied).

**Expected.** A test that owns a module's behaviour lives with it, so a developer editing that
module gets a red signal from the file they are already running.

**Impact.** CI is safe — nothing escapes. Fast feedback is not: `vitest run
tests/unit/gate.test.ts` stays green when `maturity.ts` loses its CRITICAL immunity. That is an
annoyance today and a reason people stop running subsets tomorrow.

**Note on the claim this replaced.** My first pass ran only the targeted files and reported six
survivors as "defects the suite cannot see". The full-suite re-run refuted that, and the
stronger claim was withdrawn. It is recorded here because a finding that shrank under
re-measurement is more informative than one that never did.

**Remediation.** Move or add six assertions into the owning files. No new strategy needed.

**Verification.** Re-run the harness; the targeted column should read 20/20.

**Roadmap mapping** USA-R11 (extended).

---

## USA-AUD-030 — No minimum scanner version is enforced

**Severity** MEDIUM · **Priority** P3 · **Type** RELIABILITY · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** Adapter probe
**Location** `src/scanner/adapters/*.ts` (`probe` records `versionOf(executable)`, never compares)

**Observation.** Every adapter records the discovered version and none compares it to a
minimum. A Trivy from 2021 whose JSON shape differs is accepted as available, its output is
parsed by a parser written for the current shape, and a parse failure becomes UNKNOWN — which
is honest, but the operator is never told the real cause.

**Expected.** A version floor per adapter, or an explicit statement that any version is
accepted and mismatches surface only as parse failures.

**Impact.** Slow, confusing degradation instead of a clear "your Trivy is too old". The
manifest already carries the version, so the diagnosis is available and unused.

**Remediation.** Add `minVersion` to the adapter contract, compare in `probe`, return
`unavailable` with `reason: 'trivy 0.18.0 is below the supported 0.40.0'`.

**Verification.** A fake binary reporting an old version → `unavailable` with a version reason.

**Roadmap mapping** USA-R18.

---

## USA-AUD-031 — A failed tool reports PASS in four of seven `command` rules

**Severity** HIGH · **Priority** P1 · **Type** DESIGN-FLAW · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC (command text read; failure semantics follow from the shell)

**Component** `command` check kind as used by shipped rules
**Location** REPO-003, ARCH-005, DEP-002, DEP-005 (`rules/core/repo.yaml`,
`rules/core/architecture.yaml`, `rules/core/dependencies.yaml`)

**Observation.** The fail-closed idiom exists in this codebase — three rules use it:

```
command -v cosign >/dev/null 2>&1 || { echo "FAIL-CLOSED SUP-018: …"; exit 1; }
```

Four others invert the exit status of a pipeline that produces nothing when the tool fails:

| Rule     | Command                                                     | If the tool fails                        |
| -------- | ----------------------------------------------------------- | ---------------------------------------- |
| REPO-003 | `! git log … \| grep … \| grep -q …`                        | `grep` exits 1 → `!` → 0 → **PASS**      |
| ARCH-005 | `! (npx … dpdm … \| grep -qi circular)`                     | no output → **PASS**                     |
| DEP-002  | `! (npm audit … 2>/dev/null \| grep -qiE "critical\|high")` | `2>/dev/null` hides the error → **PASS** |
| DEP-005  | `! (npx … depcheck … \| grep -q …)`                         | no output → **PASS**                     |

**Expected.** No evidence is not a clean result. The three cosign rules already demonstrate the
correct pattern; the other four should match.

**Impact.** With `--allow-commands` and no network — an air-gapped CI runner, a locked-down
laptop, a registry outage — `DEP-002` reports "no known HIGH/CRITICAL vulnerabilities" without
having run `npm audit`. That is the single most consequential false clean in the catalogue: it
is a HIGH supply-chain rule, and it says PASS exactly when it knows nothing.

**Root cause.** The shell idiom `! (cmd | grep -q …)` treats "no match" and "no output" as the
same thing, because the exit status of a pipeline is the last command's.

**Remediation.** Wrap each in the existing idiom: check `command -v <tool>` first, and
distinguish the tool's exit status from grep's. The cosign rules are the template.

**Verification.** A fixture with the tool absent → UNKNOWN (or FAIL with a named reason), never
PASS.

**Roadmap mapping** USA-R20.

---

## USA-AUD-032 — Two rules fetch and run an unpinned package mid-audit

**Severity** MEDIUM · **Priority** P2 · **Type** SUPPLY-CHAIN · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** ARCH-005, DEP-005
**Location** `rules/core/architecture.yaml`, `rules/core/dependencies.yaml`

**Observation.**

```
ARCH-005: ! (command -v npx >/dev/null && npx --yes dpdm@latest --exit-code circular:1 "src/**/*.ts" …)
DEP-005:  ! (npx --yes depcheck@latest --json …)
```

Both download a package from the public registry at audit time and execute it as the auditing
user, with `@latest` — no version, no lockfile entry, no integrity hash.

**Expected.** Either the analyser is a declared dependency with a pinned version, or the rule
does not run. The product's stated guarantee is a deterministic, offline core.

**Impact.** Three at once: (a) the same tree can score differently on different days, because
`@latest` moves; (b) the audit executes whatever the registry serves that day; (c) on an
offline machine the rules fail into USA-AUD-031's PASS path. `ARCH-005` is `deep`-only and both
need `--allow-commands`, which limits the blast radius without fixing reproducibility.

**Remediation.** Pin (`dpdm@3.x.y`) and vendor, or make it an optional devDependency, or delete
the rules and let `oracle` ingest a committed dependency-graph artifact.

**Verification.** A test asserting no shipped `command` contains `@latest` or a bare `npx`
fetch.

**Roadmap mapping** USA-R20.

---

## USA-AUD-033 — 57 of the 315 rules are presence proxies and score like verification

**Severity** MEDIUM · **Priority** P1 · **Type** DESIGN-FLAW · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC (patterns read; verdicts in `inventories/rules-verdicts.csv`)

**Component** `grep_present` rules whose pattern is a tool or word name
**Location** 57 of the 315 rules, e.g. SEC-008, SEC-014, SEC-018, CICD-007, CICD-008, DATA-005,
MOB-001, SUP-005/006/007/016, IAC-002/004, NODE-001

**Observation.** These rules pass when the _name_ of a tool or header appears anywhere in the
matching files: `zod`, `429`, `helmet`, `/health`, `Sentry`, `take:`, `prometheus`. None of them
establishes that the property holds — `SEC-008` ("user input is validated at a trust boundary")
passes if `zod` is imported anywhere, including for a single email field.

**Expected.** A PASS from a proxy and a PASS from a verified condition should not be the same
object. Either the proxy gets its own status, or it is capped below full credit, or the title
says "evidence of" rather than asserting the property.

**Impact.** This is the mechanism behind USA-AUD-006. A score of 100 is partly a count of tool
names found. Because proxies are 18% of the catalogue and skew toward security and operations,
the score overstates exactly the categories a reader cares most about.

**Root cause.** `grep_present` has one PASS and one credit value. There is no way to express
"we found a signal, not a proof", which is the distinction the rest of the product is built on
(evidence vs verdict).

**Remediation.** A fourth automatability tier — `proxy` — that scores at, say, 0.5 and renders
differently. No pattern changes; one status, one credit value, one renderer branch.

**Verification.** A proxy rule's PASS renders with its tier; the score card shows proxy credit
separately.

**Roadmap mapping** USA-R21.

---

## USA-AUD-034 — Verified rule defects beyond the CRITICAL tier

**Severity** MEDIUM · **Priority** P2 · **Type** TEST-GAP · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN (regex probes)

**Component** SUP-003, SUP-008, CTNR-001, RS-003, SEC-002
**Location** `rules/core/supply-chain.yaml`, `rules/stacks/containers.yaml`,
`rules/stacks/rust.yaml`, `rules/core/security.yaml`

**Observation.** Five more patterns were probed with hand-written inputs:

| Rule     | Legitimate input                                     | Result              | Consequence                                                                                          |
| -------- | ---------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| SUP-003  | `"yaml": "^2.6.1",`                                  | **no match**        | cannot detect caret/tilde ranges — the dominant floating form; this repo passes for the wrong reason |
| SUP-008  | `env: TITLE: ${{ github.event.pull_request.title }}` | **MATCHES**         | flags the recommended mitigation                                                                     |
| CTNR-001 | `securityContext: { privileged: true }`              | **MATCHES** → PASS  | inverted signal on the worst case                                                                    |
| RS-003   | `unsafe { /* SAFETY: … */ }`                         | **MATCHES** → WRONG | penalises idiomatic Rust                                                                             |
| SEC-002  | ``console.log(`token ${t}`)``                        | **no match**        | blind to template interpolation, the common leak form                                                |

**Expected.** A rule detects the condition its title names and not the legitimate near-miss.

**Impact.** Two are false negatives on the exact behaviour named (SUP-003, SEC-002); three are
false positives that will block or waive legitimate code (SUP-008, CTNR-001, RS-003). SUP-003 is
the most instructive: the rule passes on this repository _because it cannot see carets_, so its
PASS is evidence of nothing.

**Remediation.** Five negative/positive fixture pairs, in the existing format. SUP-003's pattern
needs `\^\d` and `~\d` alternations; CTNR-001 must drop the bare `securityContext` alternative;
RS-003 should require the absence of a `SAFETY` comment on the same or preceding line (a
`grep_wrong` cannot express that — it needs an `invariant` or a new kind).

**Verification.** The five fixtures in `RULES-FULL-AUDIT.md` §"New verified defects".

**Roadmap mapping** USA-R11 (extended).

---

## USA-AUD-035 — The waivers are permanent, broad, and one asserts a false protection

**Severity** MEDIUM · **Priority** P2 · **Type** GOVERNANCE · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN (`gh api`, `.usa.yaml` read)

**Component** `.usa.yaml` suppressions; branch protection
**Location** `.usa.yaml` (14 entries); repository settings for `master`

**Observation.** All fourteen reasons still hold — thirteen are valid, one is incomplete.
The structure around them is weak:

- **0 of 14 have an `until:` date.** The engine supports expiry and surfaces stale reviews; the
  repository uses it for none of its own waivers.
- **13 of 14 are rule-wide.** Only REPO-002 carries a `file:` scope.
- **All 14 matched a finding** (no dead waivers) — this part is good.
- **FND-004's reason is materially wrong.** It claims "six required checks" (there are seven)
  and "CODEOWNERS review required", while `gh api` reports
  `enforce_admins: false` and `required_approving_review_count: 0`. The protection does not
  bind the repository owner and requires no approval, so the waiver's central claim — that
  protection is real and merely not stored in a file — is true for contributors and optional
  for the maintainer.

**Expected.** A waiver is a decision with a review date and a scope. A protection claim is true
or it is not made.

**Impact.** The FND-004 gap is the one with teeth: the repository's own doctrine is that a rule
which lives only in discipline gets broken by accident, and the reference implementation of the
structural version (`enforce_admins: true`) is another of the maintainer's repos. Here the
structural gate is absent and a waiver asserts it is present.

**Remediation.** Set `enforce_admins: true` on `master`; keep approvals at 0 (a single-account
repo cannot self-approve, so raising it would freeze every PR) but correct the text to say the
CODEOWNERS requirement is advisory; add `until:` to the eight premise-based waivers.

**Verification.** `gh api …/branches/master/protection` shows `enforce_admins.enabled: true`;
`docs:manifest`/`.usa.yaml` lint shows every waiver carrying an expiry or an explicit
`permanent: true`.

**Roadmap mapping** USA-R22.

---

## USA-AUD-036 — Every semgrep finding is recorded as LOW

**Severity** HIGH · **Priority** P1 · **Type** CONSISTENCY · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** `severity()` in the scanner normaliser
**Location** `src/scanner/normalize.ts:12-18`

**Observation.** A Semgrep rule at `severity: ERROR` — its highest class, matching
`eval(argv)` — is recorded as `LOW`:

```
semgrep 1.182.0 | ok | 1 evidence
- semgrep LOW · semgrep-rules.js-eval-argv — dynamic eval of an argument (app.js:2)
```

`KNOWN = ['CRITICAL','HIGH','MEDIUM','LOW','INFO','UNKNOWN']`; Semgrep emits `ERROR`,
`WARNING`, `INFO`, so **two of its three levels collapse to LOW** and no semgrep finding can be
recorded above LOW.

**Expected.** A per-adapter severity map. The normaliser is already adapter-aware everywhere
else.

**Impact.** The evidence report is the artefact a human triages; it ranks a code-execution
finding beside a missing `.editorconfig`. Because no adapter implements `findings()`
(USA-AUD-023), the audit's score is unaffected — the damage is confined to the scan report,
which is where a human looks first.

**Remediation.** `severityFor(adapterId, word)` with a per-adapter table; unknown words keep the
original in `rawSeverity` and degrade to UNKNOWN, not LOW.

**Verification.** Fixture with an ERROR-severity semgrep rule → evidence severity HIGH, and the
raw word preserved.

**Roadmap mapping** USA-R24.

---

## USA-AUD-037 — Repeated flags keep only the last value

**Severity** MEDIUM · **Priority** P2 · **Type** BUG · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** `parseArgs`
**Location** `src/cli-args.ts:40` (`args[body] = next`)

**Observation.**

```
--scanner semgrep --scanner dependency-cruiser   → only dependency-cruiser ran
--scanner trivy   --scanner semgrep              → only semgrep ran
--scanner trivy,semgrep                          → both ran (11 evidence)
```

Repeated flags overwrite, so `list()` never receives an array and the last occurrence wins. The
manifest then lists one adapter and looks complete.

**Expected.** Repeated flags accumulate; the comma form and the repeated form agree.

**Impact.** Silent under-scanning in the one command whose purpose is to gather evidence. The
workaround exists but is undocumented, which makes the broken form the one people will try
first. Every `list()`-backed flag is affected (`--fact`, `--include`, …).

**Remediation.** Push into an array when the key already exists.

**Verification.** `--scanner a --scanner b` produces two manifest rows.

**Roadmap mapping** USA-R25.

---

## USA-AUD-038 — The gitleaks binary is installed without a checksum

**Severity** MEDIUM · **Priority** P2 · **Type** SUPPLY-CHAIN · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** `ci.yml` secret-scan job
**Location** `.github/workflows/ci.yml:443-447`

**Observation.**

```bash
VERSION=8.30.1
curl -sSfL -o /tmp/gitleaks.tar.gz "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/…"
tar -xzf /tmp/gitleaks.tar.gz -C /tmp gitleaks
sudo install -m 0755 /tmp/gitleaks /usr/local/bin/gitleaks
```

Version pinned, **integrity unverified**. A replaced release asset runs arbitrary code in a job
holding the repository token.

**Expected.** `sha256sum -c` against a committed digest before installing — the same standard
the repository applies to every action it pins by SHA.

**Impact.** It is the only download-and-execute in CI that is not hash-verified, in the one
workflow whose job is to catch supply-chain compromise.

**Remediation.** Commit the digest; verify before `tar`.

**Verification.** A tampered tarball must fail the job before extraction.

**Roadmap mapping** USA-R23.

---

## USA-AUD-039 — A required check fails every Dependabot PR

**Severity** MEDIUM · **Priority** P2 · **Type** BUG · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC + observed on PR #276

**Component** `ci.yml` "Changeset present" job
**Location** `.github/workflows/ci.yml:246-250`

**Observation.** The shipped-path test includes `package.json` wholesale:

```bash
git diff --name-only "$BASE_SHA" "$HEAD_SHA" | grep -qE '^(src/|rules/|templates/|action\.yml|package\.json)'
```

A `devDependencies` bump changes `package.json`, so it is classified as shipped, so a changeset
is demanded, so the _required_ check fails. Dependabot opens exactly those PRs; PR #276 has
been red since 26 October for this reason.

**Expected.** The check asks whether anything the package _ships_ changed. A devDependency is
not shipped.

**Impact.** Every dependency PR is permanently unmergeable, which either blocks dependency
updates or trains the maintainer to bypass the gate. Both outcomes are worse than the gate not
existing.

**Remediation.** Inspect the `package.json` diff for `version`, `dependencies`,
`peerDependencies`, `bin`, `main`, `exports`, `files` — not the file.

**Verification.** A PR bumping only `devDependencies` passes; one bumping `dependencies` fails.

**Roadmap mapping** USA-R23.

---

## USA-AUD-040 — The release force-pushes to master, so `enforce_admins` cannot be toggled on

**Severity** MEDIUM · **Priority** P2 · **Type** GOVERNANCE · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC (workflow text) + VERIFIED-RUN (`gh api`)

**Component** `release.yml`; branch protection
**Location** `.github/workflows/release.yml:120-131`

**Observation.** `changesets/action` is configured with `push-with-git-cli: true`, documented as
"pushes with `git push --force` using the checkout PAT", and the job checks out with
`token: ${{ secrets.CHANGESET_TOKEN }}`. `release.yml` triggers on `push: branches: [master]`.

`gh api` reports `enforce_admins: false` and `allow_force_pushes: false`. Those two together are
what let the owner's PAT force-push while contributors cannot.

**This corrects USA-AUD-035.** I recommended setting `enforce_admins: true` as a one-call fix.
That would block the release's force-push and break publishing. The correct change is a
**ruleset with a bypass actor** for the release identity plus `enforce_admins: true`, and an App
installation token in place of the long-lived PAT.

**Impact.** Today the only automated write to `master` is a long-lived PAT that can force-push,
and protection is deliberately not enforced against its owner. A leaked token is a silent
rewrite of the default branch. The FND-004 waiver asserts the protection is adequate without
mentioning this dependency.

**Remediation.** Ruleset + bypass actor + App token; then `enforce_admins: true` is safe.

**Verification.** A human push to `master` is rejected; a release run still pushes its version
commit.

**Roadmap mapping** USA-R22 (revised).

---

## USA-AUD-041 — "Nothing to read yet" is a green check

**Severity** LOW · **Priority** P3 · **Type** CONSISTENCY · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** `provenance-check.yml`
**Location** `.github/workflows/provenance-check.yml:70-76`

**Observation.** With no bundle at or above the floor the job prints an honest message and
`exit 0`. The reasoning is stated and defensible; the _check_ is green, so a reviewer scanning
the run list cannot distinguish "verified" from "nothing to verify".

**Expected.** `neutral`/skip, or failure once a release exists at that version.

**Impact.** Low — the summary is honest and the floor is documented. It is the same shape as
`DEP-002`'s fail-open with better prose.

**Remediation.** Emit a warning annotation and exit 0 only while no release exists at the floor.

**Roadmap mapping** USA-R23.

---

## USA-AUD-042 — Floating tool installs in credentialed jobs

**Severity** LOW · **Priority** P3 · **Type** SUPPLY-CHAIN · **Confidence** Confirmed ·
**Evidence** VERIFIED-STATIC

**Component** `release.yml:70`, `publish.yml:83`, `ci.yml:460`
**Location** as listed

**Observation.** `npm install -g npm@^11.15.0` runs in the two jobs that hold
`id-token: write`/`packages: write`; `pnpm dlx license-checker` fetches and runs the latest
`license-checker` in CI.

**Expected.** Exact versions. The npm floor is deliberate (trusted publishing needs ≥ 11.15) but
`^` allows any 11.x minor to execute inside the release job.

**Impact.** Low but avoidable, and it is the same pattern the catalogue is criticised for
(`npx --yes <tool>@latest`).

**Remediation.** Pin `npm@11.15.x` exactly; pin `license-checker` as a devDependency.

**Roadmap mapping** USA-R23.

---

## USA-AUD-043 — The dependency-cruiser adapter is hardcoded to `src/`

**Severity** LOW · **Priority** P3 · **Type** BUG · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** `scanner/adapters/dependency-cruiser.ts` default config
**Location** `defaultConfig(): { args: ['src'] }`

**Observation.** Any target without a `src/` directory produces
`ERROR: Can't open 'src' for reading`, recorded as UNKNOWN.

**Expected.** Default to `.`, or derive the source root from detected facts.

**Impact.** The adapter is unusable outside `src`-shaped repositories — including this repo's
own `fixtures/`. The failure is honest (UNKNOWN with stderr attached), which is why this is LOW.

**Remediation.** `args: ['.']`.

**Verification.** The fixture scan produces parsed output rather than UNKNOWN.

**Roadmap mapping** USA-R24.

---

## USA-AUD-044 — Rule severity is not covered by any test

**Severity** MEDIUM · **Priority** P2 · **Type** TEST-GAP · **Confidence** Confirmed ·
**Evidence** VERIFIED-RUN

**Component** Rule metadata / fixture gate
**Location** `rules/**/*.yaml` `severity:` fields; `tests/integration/rule-fixtures.test.ts`,
`tests/integration/auditor-mutation.test.ts`

**Observation.** Planting a single defect — `SEC-001`'s `severity: CRITICAL` changed to `LOW` —
leaves both rule suites **green**:

```
R3 DOES NOT BITE  suite green  byte-identical  SEC-001 severity CRITICAL → LOW
```

By contrast, blinding the same rule's pattern (R1) and deleting its fixture (R2) both turn the
suite red, so the gate does test behaviour and coverage.

**Expected.** A rule's declared severity is part of its contract: it sets the score weight
(`DEFAULT_WEIGHT`: 10 for CRITICAL, 1.5 for LOW), decides `--fail-on` membership, and drives the
report's severity counts. It should be pinned, at least for the CRITICAL tier.

**Impact.** A typo or a careless edit silently cuts a rule's weight by 6.7× and removes it from
every gate, and nothing fails. For a catalogue whose CRITICAL tier is the triage path, an
unpinned severity is an unpinned safety property.

**Remediation.** Assert the severity of every CRITICAL rule (a generated snapshot is enough), or
assert `severity` in each fixture (`expect: { status, severity }`). The fixture schema already
carries `expect:`; severity is simply not checked.

**Verification.** Change any CRITICAL rule's severity → the suite fails naming the rule.

**Roadmap mapping** USA-R11 (extended).
