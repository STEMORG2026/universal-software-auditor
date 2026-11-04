# USA Roadmap

Short, dated, explicitly non-committal. Rule-coverage direction first (this
is an audit template — the packs _are_ the product), automation second.
Items graduate to ADRs when decided and to `CHANGELOG.md` when shipped.

> Charter constraint (ADR-0011): no CVE database, no resolver, no dataflow
> engine, no signer. Proposals crossing that line re-open ADR-0011 first.

**Revised 2026-10-31** after the independent forensic audit in
[`audit/usa-inside-out/`](audit/usa-inside-out/README.md). That audit found
the shipped surface sound and the _trust surface_ unsound: the score can be
raised without fixing anything, the scanner runner executes the audited
repository's own binaries, and the scan manifest claims an isolation that
does not exist. The phases below put those first and freeze rule growth
until they are closed. Finding IDs (`USA-AUD-nnn`) refer to
[`FINDINGS.md`](audit/usa-inside-out/FINDINGS.md).

Phase vocabulary: **NOW** (trust and correctness, blocks other work) ·
**NEXT** (architectural and verification) · **LATER** (capability) ·
**DEFER / WON'T DO** (explicitly excluded). No calendar dates are promised;
sequence is the commitment.

---

## NOW — trust and correctness (P0/P1)

| ID      | Initiative                                            | Priority | Problem                                                                                                                                                                                                                                                   | Acceptance                                                                                                                                                                                                                                                                                                                                                              | Complexity | Blocks                     |
| ------- | ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------- |
| USA-R01 | **Scanner executes only the auditor's binary**        | P0       | USA-AUD-001, 002, 009, 012 — a repo's `node_modules/.bin/<scanner>` runs as the user; the manifest says `network: denied` and a sandbox that does not exist                                                                                               | Spawn the absolute path from `probe.executable`; manifest emits `isolation: none` (or the real mechanism) and never `network: denied` without enforcement; timeout kills the process group; `ENV_DENY` either fires or is deleted. The hijack fixture (a `node_modules/.bin/trivy` that writes a marker) must not execute, and that test must be observed failing first | M          | every other scanner change |
| USA-R02 | **Bounded regex evaluation**                          | P1       | USA-AUD-004 — `(a+)+$` took 95 s on a 41-byte line; `--rules-dir` and generated packs can supply patterns                                                                                                                                                 | Per-`grep` deadline; a pattern that breaches it yields UNKNOWN with a warning naming the rule; load-time validation warns on nested quantifiers                                                                                                                                                                                                                         | S          | rule-pack contributions    |
| USA-R03 | **A score that cannot be inflated**                   | P1       | USA-AUD-005, 006, 020 — waiving 13 zero-credit findings turns 92.0 into 100.0; 100 is printed at 66% coverage; an empty repo scores 45.3; `overall` is 0 when nothing resolves                                                                            | Suppressed zero-credit findings stay in the denominator; `overall` is `null` when `totalW === 0`; every rendered headline carries its coverage figure. Three property tests: suppress-a-FAIL must not raise the score; no-resolved-rules must not print a number; a score is never rendered without coverage                                                            | S          | comparison across releases |
| USA-R04 | **Decide what maturity means**                        | P1       | USA-AUD-003 — dampening moves labels, counts and the gate, and moves the score by exactly zero; `--profile` turns `--fail-on high` from exit 1 into exit 0 on an unchanged tree                                                                           | One ADR stating whether the score is stage-relative; a test pinning the chosen relationship; the gate's use of dampened severity documented as policy (or removed). Same tree, two profiles → a documented, tested difference, not an accident                                                                                                                          | S          | USA-R03                    |
| USA-R05 | **Index blind spots are counted**                     | P2       | USA-AUD-007 — only the root `.gitignore` is honoured; ignored files disappear with no counter while size/symlink/truncation are all counted                                                                                                               | Nested ignore files honoured (nearest wins) or documented as unsupported; an ignored-file count joins `truncated`/`skippedLarge`/`skippedSymlinks` in the warnings channel                                                                                                                                                                                              | M          | USA-R07                    |
| USA-R06 | **Config is not sourced from the audited tree**       | P2       | USA-AUD-008 — `<cwd>/.env` rewrites the auditor's own environment, including provider endpoints                                                                                                                                                           | `.env` loads from the installation or an explicit `--env-file`; loaded key _names_ logged at `--verbose`                                                                                                                                                                                                                                                                | S          | —                          |
| USA-R16 | **Every rule has a recorded disposition**             | P1       | USA-AUD-024 — 166 of 315 rules are absent from the report; `NOT_APPLICABLE` never appears, so "does not apply", "gated on a fact nobody produces" and "disabled" are the same state                                                                       | Each rule yields `{applicable:false, reason}` in an unscored section; `findings + skipped === catalogue`; the eight rules gated on unproducible facts (`has:crypto`, `has:file-upload`, `has:pii`, `has:payments`) are reported as `unknown-fact`                                                                                                                       | M          | USA-R10                    |
| USA-R19 | **A rule that cannot compile does not pass**          | P1       | USA-AUD-025 — an invalid regex returns no hits, so `grep_absent`/`grep_wrong`/`grep_deprecated` report PASS with no warning                                                                                                                               | `grep` distinguishes "no hits" from "could not evaluate"; a broken pattern yields UNKNOWN plus a load-time warning naming the rule; fixture `(unclosed` must not pass                                                                                                                                                                                                   | S          | rule contributions         |
| USA-R20 | **A rule whose tool failed does not report clean**    | P1       | USA-AUD-031, 032 — four of seven `command` rules invert a pipeline that is empty on failure, so `DEP-002` says "no known HIGH vulnerabilities" when `npm audit` never ran; two rules run `npx --yes <tool>@latest` from the network mid-audit             | All seven use the existing `command -v <tool> \|\| fail-closed` idiom (the cosign rules are the template); no shipped rule contains `@latest` or a bare `npx` fetch; a test asserts both                                                                                                                                                                                | S          | —                          |
| USA-R21 | **Presence evidence stops scoring like verification** | P1       | USA-AUD-033 — a quarter of the catalogue passes on the name of a tool (`zod`, `429`, `helmet`, `Sentry`), and a proxy PASS earns 1.0 credit exactly like a verified condition <!-- usa:allow-claim: count in audit/usa-inside-out/RULES-FULL-AUDIT.md --> | A `proxy` automatability tier with its own credit (≤0.5) and its own rendering; the score card reports proxy credit separately; no pattern changes                                                                                                                                                                                                                      | M          | USA-R03                    |

## NEXT — verification and evidence (P2)

| ID      | Initiative                                                 | Priority | Problem                                                                                                                                                                                                                                                                                 | Acceptance                                                                                                                                                                                                                                                                                                      | Complexity |
| ------- | ---------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| USA-R07 | **Warnings travel with the report**                        | P2       | USA-AUD-010 — `serve` discards `runAudit`'s warnings; JSON and SARIF have no channel                                                                                                                                                                                                    | `warnings` is part of `AuditReport`, serialized in md/json/sarif (as `toolExecutionNotifications`) and preserved by `serve`; a truncated audit proves it in all four                                                                                                                                            | S          |
| USA-R08 | **Server does not block its own event loop**               | P2       | USA-AUD-011 — the sync engine runs on the loop, so progress polling cannot be answered mid-audit                                                                                                                                                                                        | Audit runs in a worker/child, or progress is streamed; `GET /api/audits/:id` answers `running` before completion                                                                                                                                                                                                | M          |
| USA-R09 | **Signature binds what a reader acts on**                  | P2       | USA-AUD-013 — the signed payload is the trailer only; finding text, locations and remediation are tamperable                                                                                                                                                                            | Payload covers body + trailer (two hashes in the sidecar), or `SECURITY.md` states the limitation explicitly; editing a finding message must fail verification                                                                                                                                                  | S          |
| USA-R10 | **Catalogue provenance is explicit**                       | P3       | USA-AUD-014 — 102 of 315 rules (32%) map to no standard; `usa standards` implies total coverage                                                                                                                                                                                         | The uncatalogued proportion is printed in the summary; house rules are tagged so the distinction is machine-readable                                                                                                                                                                                            | S          |
| USA-R11 | **Fixtures prove both directions**                         | P3       | USA-AUD-015, 028, 029 — 6 negative-only, 7 positive-only fixtures; 3 invariants outside the gate; six CRITICAL rules fire on legitimate code; six mutants are caught only by the full suite                                                                                             | Gate requires `positive && negative`; invariant rules get a finding-set fixture; the six CRITICAL false positives get the negative fixtures named in `RULE-SEMANTIC-AUDIT.md`; property tests kill mutants M08/M15/M16                                                                                          | M          |
| USA-R17 | **Comparison fails closed**                                | P2       | USA-AUD-026 — `usa diff` renders "no net movement" and exits 0 for a report with no trailer, while `--baseline` refuses the same input                                                                                                                                                  | `diff` exits 2 with a named reason on a missing/corrupt trailer; one test pins both readers to the same posture                                                                                                                                                                                                 | S          | —       |
| USA-R22 | **Waivers are dated and a protection claim is true**       | P2       | USA-AUD-035, 040 — 0 of 14 waivers carry an `until:`; FND-004 asserts "CODEOWNERS review required" while `gh api` reports `enforce_admins: false` and 0 approvals; and the release **force-pushes to master** with a long-lived PAT, which is why admins are not enforced               | A ruleset with a **bypass actor** for the release identity (not a blunt `enforce_admins` toggle, which would break publishing — see USA-AUD-040), an App token replacing `CHANGESET_TOKEN`, FND-004's text corrected to seven checks with CODEOWNERS advisory, and an expiry on the eight premise-based waivers | M          |
| USA-R23 | **The CI gate is honest and the supply chain is verified** | P2       | USA-AUD-038, 039, 041, 042 — the gitleaks binary is installed with no checksum; the `Changeset present` required check fails every Dependabot PR because `package.json` is a shipped path; `provenance-check` is green with no evidence; two credentialed jobs install a floating `npm` | `sha256sum -c` before installing gitleaks; the changeset gate inspects the `package.json` diff for shipped fields, not the file; "nothing to verify" is neutral, not green; exact tool versions in the jobs holding `id-token`/`packages`                                                                       | M          | USA-R22 |
| USA-R24 | **Scanner severity survives the adapter**                  | P2       | USA-AUD-036, 043 — Semgrep's `ERROR` and `WARNING` are unknown to the normaliser and both become LOW, so no Semgrep finding can exceed LOW; the dependency-cruiser adapter is hardcoded to `src/`                                                                                       | Per-adapter severity table with the raw word preserved; unknown words degrade to UNKNOWN, never LOW; depcruise defaults to `.`                                                                                                                                                                                  | S          | USA-R15 |
| USA-R25 | **Repeated flags accumulate**                              | P2       | USA-AUD-037 — `--scanner a --scanner b` silently runs only `b`, and the manifest looks complete                                                                                                                                                                                         | `parseArgs` pushes into an array on repeat; a test asserts two manifest rows                                                                                                                                                                                                                                    | S          | —       |
| USA-R18 | **Severity and mechanism agree**                           | P3       | USA-AUD-027, 030 — four CRITICAL rules can never gate (3 manual, 1 `command`); no adapter enforces a minimum scanner version                                                                                                                                                            | Every CRITICAL rule is automatable or listed in an accepted-judgement register; adapters declare `minVersion` and report `unavailable` with a version reason                                                                                                                                                    | M          | —       |

## LATER — capability (P3/P4)

| ID      | Initiative                              | Priority | Problem                                                                                                                                                           | Acceptance                                                                                                                                                                                                                                  | Complexity |
| ------- | --------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| USA-R12 | **Evolution gate stops overclaiming**   | P3       | USA-AUD-016, 017 — precision/recall 1.0 over three self-authored cases; `REVIEW-REQUIRED` is a comment                                                            | Two gates: _mechanism_ (self-authored cases are fine) and _quality_ (held-out corpus). A candidate that fits one author case and fails a held-out case is rejected. A pack carrying the marker and listed in the index is refused or warned | L          |
| USA-R13 | **Docs state what ships**               | P4       | USA-AUD-018, 021, 022 — HTML ships while the roadmap excludes it; counts drift (18 kinds not 16, 22 commands not 19, 5 formats not 4); no per-command help        | `--format html` and `report/html.ts` appear under Shipped with their ADR; JUnit alone stays excluded; the existing fact markers cover kinds/commands/formats; `usa audit --help` lists audit's flags                                        | S          |
| USA-R14 | **Rule-language honesty**               | P4       | USA-AUD-019 — `grep` honours `i` only; `m`/`g` are silently dropped                                                                                               | Flags validated at load; unknown flags warn; `m` honoured                                                                                                                                                                                   | S          |
| USA-R15 | **Decide what scanner evidence is for** | P3       | USA-AUD-023 — no adapter implements `findings()`, so `ScanResult.findings` is always empty and scanner evidence never reaches the audit's findings, score or gate | Either one adapter proves the evidence→finding→score path end to end, or `ScannerFinding` is deleted and `docs/scanners.md` states that `usa scan` is evidence-only                                                                         | M          |

## DEFER / WON'T DO

- **New stack packs** — frozen until USA-R11 lands. 315 rules with one-sided fixtures and
  no measured precision; more rules multiply the unmeasured surface.
- **New scanner adapters** — frozen until USA-R01 lands.
- Penetration testing: USA finds the hole, never exploits it. Needs its own charter (VISION.md).
- CVE database / lockfile resolver / reachability analysis (ADR-0011).
- Interprocedural analysis, DAST, fuzzing — CodeQL/Semgrep own this; integrate results
  through `oracle` instead of rebuilding them.
- Compliance certification (USA maps to standards; auditors certify).
- Full DORA platform, Renovate migration.
- **JUnit renderer** — JSON and SARIF feed standards-based consumers (ADR-0018).
  _(HTML was listed here in error and ships; see Shipped.)_

## Strategic success metrics

Measured, not asserted. Baselines are the numbers this audit established; targets are
directions, not promises.

| Metric                                      | Baseline (2026-10-31)                 | Direction                                 | How measured                   |
| ------------------------------------------- | ------------------------------------- | ----------------------------------------- | ------------------------------ |
| Score cannot be raised by waiving           | 100.0 → 92.0 counterfactual           | suppress-a-FAIL must not raise the score  | property test                  |
| Headline states its coverage                | 100 printed at 66.4%                  | every score carries coverage              | renderer test                  |
| Scanner executes only the auditor's binary  | project binary ran                    | 0 project binaries executed               | hijack fixture                 |
| Manifest isolation claims true              | `network: denied` with no enforcement | every manifest field true or absent       | schema test                    |
| Deterministic rules with two-sided fixtures | 192 of 205                            | 205 of 205                                | fixture gate                   |
| Rules with a recorded disposition           | 149 of 315 (166 invisible)            | 315 of 315                                | report section + test          |
| Invalid pattern cannot pass                 | PASS today                            | UNKNOWN + warning                         | fixture `(unclosed`            |
| CRITICAL rules that can gate                | 19 of 23                              | 23 of 23                                  | automatable-or-registered test |
| Mutants killed by the owning test file      | 14 of 20 (20/20 by the full suite)    | 20 of 20                                  | mutation harness               |
| Rules mapped to a standard                  | 213 of 315 (68%)                      | stated, then rising                       | `usa standards`                |
| Regex evaluation bounded                    | 95 s unbounded                        | no rule exceeds its budget                | timeout test                   |
| Evolution quality gate                      | 3 self-authored cases                 | held-out corpus with adjudicated findings | bench run                      |

## Four decisions only the maintainer can make

1. **Is the score stage-relative or absolute?** (USA-R04.) Everything downstream follows.
2. **Is `usa scan` safe to point at untrusted code?** Today the honest answer is "no". Either
   isolate it or document the boundary where the flag is used.
3. **Breadth or depth?** 315 rules, 32 packs, 68% catalogued, precision unmeasured, a quarter of them
   presence proxies. <!-- usa:allow-claim: proxy count measured by the 2026-10-31 audit, see audit/usa-inside-out/RULES-FULL-AUDIT.md --> The next thousand rules cost more than the next measured hundred.
4. **Is `master` protected for the owner too?** Today `enforce_admins: false` and
   `required_approving_review_count: 0`, so "never push to main" is discipline, not a gate.
   `scholarhub` already has the structural version; this repo does not.

---

## Shipped

Rule coverage (the product):

- [x] **`usa bootstrap` self-extension** — curated starter packs for
      uncovered stacks (php/ruby/cpp/csharp/swift + fallback), fail-closed
      per ADR-0012, proven on Vapor.
- [x] **Honest scale limits** — truncation/oversize warnings instead of
      silent absorption. _(extend with the ignored-file counter: USA-R05)_
- [x] **First graduation** — Swift pack + vapor/platform/executable
      detectors shipped from the bootstrap proof; catalog entry replaced.
      _(the standing rule: every bigger repo expands the template)_
- [x] **SARIF + JSON renderers** — `--format md|json|sarif`, `--out`
      extension inference; SARIF 2.1.0 schema-validated. ADR-0018 supersedes
      ADR-0004.
- [x] **Per-rule expected-finding fixtures** — positive/negative fixture per
      automatable rule, coverage gate blocks untested rules. ADR-0017.
      _(two-sided gate: USA-R11)_
- [x] **Oracle-ingestion check kind** — `oracle` ingests a committed
      SARIF/JSON artifact and asserts a bound; offline-by-default preserved.
      ADR-0019. _(shipped but used by 0 bundled rules — unexercised in
      production)_

Automation and governance:

- [x] **Complexity budget** — warn-only `complexity` rule + dispatch-table
      refactors; lint is warning-free.
- [x] **Self-audit correctness hardening** — 27-finding adversarial review
      (fail-closed inputs, expiry-aware suppressions, fixed-point detection,
      trailer hygiene).
- [x] **release-please + commitlint** — reviewable Release PRs (version +
      CHANGELOG + tag atomically); human gate kept on rule-content releases.
      Superseded by the pnpm + changesets migration below.
- [x] **pnpm workspace + changesets** — author-declared bumps survive
      `packages/*` growth; workspace globs are already in place. See
      `docs/release.md`.
- [x] **Trusted publishing + npm provenance + SBOM** — OIDC (no long-lived
      `NPM_TOKEN`), `--provenance`, CycloneDX SBOM artifact on every release.
- [x] **Generated CLI reference + diff gate** — `docs/reference/cli.md`
      regenerated from the real parser and asserted with `--check` in CI.
- [x] **Coverage thresholds** — ratcheted at the measured number.
- [x] **OpenSSF Scorecard action** — monthly + on push, SARIF to the
      Security tab.
- [x] **Catalogue pinning + automatability tags** — `rules/catalogues.yaml`
      pins every standard's version; catalogue derived from each rule's
      `references:` and automatability from its check kind. `usa standards`
      reports coverage. ADR-0021. _(uncatalogued rules remain: USA-R10)_
- [x] **Provenance verification checks (verify, don't mint)** — `cosign
verify` chain at production (`core/provenance-cosign`, SUP-018–020),
      attestation/VSA existence at beta and up (`core/provenance-attestation`,
      SUP-022–024); verification only per ADR-0011. ADR-0027.
- [x] **Site-level suppressions** — a waiver may carry a `file` glob (and
      optional `line`); only matching locations are excused, unmatched ones
      stay active, and a waiver that matched nothing is reported. ADR-0022.
- [x] **Hotspot triage + review staleness** — judgement queue split by
      automatability; `.usa.yaml` `reviews:` record dated human attention
      with an optional `until` deadline. ADR-0023.
- [x] **New-code quality gates** — `usa audit --baseline` fails only on
      newly-introduced ≥ HIGH plus regressed rules, sharing the `usa diff`
      movement taxonomy. ADR-0024.
- [x] **Foundation readiness** — `usa foundation init` interviews vision,
      intents and per-pillar promises into `.usa/foundation.yaml`; intents
      become audit facts, `core/foundation` (FND-001–014) checks the setup.
      ADR-0029.
- [x] **OpenSSF Best Practices badge** — honest in-progress badge + status
      section.
- [x] **Signed reports, verify side (Sigstore)** — detached-signature
      verification via local cosign plus `usa verify-report`; minting stays
      blocked pending an ADR-0011 amendment. ADR-0025, ADR-0028.
      _(payload breadth: USA-R09)_
- [x] **Generated docs resync** — the `resync` CI job regenerates and pushes
      `cli.md`/`sample-report.md` on PRs instead of merely failing. ADR-0026.
- [ ] **MADR/log4brains** — only when the ADR corpus triples or decisions
      become routinely contested. Not now.

Live assurance (VISION.md):

- [x] **LLM provider layer** — `src/agent/` with major-provider presets,
      custom endpoints, tunable reasoning/temperature/context, live model
      listing. Deterministic spine untouched; the model proposes, the engine
      verifies. ADR-0031.
- [x] **Live audit sessions + interactive interviews** — `usa live`: a
      conversing session (foundation interview, environment checks, vision
      alignment) with a transcript. Deterministic state machine; degrades
      loudly to deterministic-only. ADR-0034.
- [x] **Testing assurance, deterministic subset** — TAS-001–011 presence
      heuristics with per-rule honesty clauses, plus counted evidence signals
      as library code. ADR-0032, ADR-0035.
- [x] **Future-ready categorization** — ten domains as a derived axis over
      rules (`rules/categories.yaml` + `usa categories`); five resolve, five
      honestly empty. ADR-0033.
- [x] **Report format selection** — the narrative renderer ships as a second
      format (`narrative`): verdict-first, foundation gate, honest confidence.
      ADR-0036.
- [x] **HTML renderer** — `--format html` + `src/report/html.ts`, and the
      `serve` UI's `html` format. _(Corrected 2026-10-31: previously listed
      under "deliberately not planned", which contradicted the shipped code.
      Recorded here so the record matches the tree; JUnit remains excluded.)_
