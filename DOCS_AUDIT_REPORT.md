# Documentation Audit Report — Universal Software Auditor (USA)

**Scope:** repository `/home/sajan/Projects/Universal_Software_Auditor` on branch
`chore/autonomous-docs-system` (parent: `master`).
**Method:** static inventory + `git log` staleness sampling + running every
documentation gate the repo defines (`docs:adrs`, `docs:check`, `docs:cli`,
`docs:sample`, `docs:asvs`) against `master`, running the test suites for the
documentation subsystem, and exercising the CLI (`usa docs audit .`, `usa docs
coverage .`, `usa docs impact . --changed`, `usa docs audit . --fail-on <sev>`).
**Verdict:** the repo already implements a sophisticated, largely-enforced
documentation system (ADR-0020 machine-synced docs + ADR-0042 documentation
universe). This audit confirms what works, identifies three concrete
un-enforced gaps, and recommends a minimal, non-invasive set of fixes.

> This report is the Phase-1 deliverable for the autonomous-documentation task.
> It is the _as-is_ baseline; `DOCS_SYSTEM_DESIGN.md` is the target design.

---

## 1. Inventory

### 1.1 Stack (detected, not assumed)

```
Language:            TypeScript 5.7  (Node 20+, ESM, strict)
Package manager:     pnpm 10.34.5 (pnpm-workspace.yaml)
Build:               tsc -p tsconfig.json  -> dist/
Tests:               vitest 5 (unit/integration/e2e split)
Coverage:            v8, thresholds ratcheted (lines 85, functions 90, branches 75, stmts 84)
Lint/format:         ESLint 10 + typescript-eslint, Prettier 3 (printWidth 100)
Lint-complexity:     ESLint complexity ≤ 10 per function
Commits:             Conventional Commits (commitlint 21)
Releases:            changesets (author declares bump) -> Version Packages PR -> npmjs (OIDC) + GPR mirror (PAT)
CI:                  GitHub Actions (pinned actions, read-only defaults)
Hooks:               husky 9 + lint-staged 17
Doc tooling:         custom scripts in scripts/ (no Sphinx/mkdocs); fact-marker engine in scripts/lib/docs-sync.mjs
```

The repo is a **single-package** pnpm workspace: one npm package
`@xenos1996/usa` (the `usa` CLI), plus a GitHub composite action (`action.yml`).
It audits itself (every PR runs `usa audit .`).

### 1.2 Documentation artifacts (tracked, excluding build cache / experiments / demo-app)

| Artifact                                                       | Type                                  | Origin                                         | Governed?                                  |
| -------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| `AGENTS.md`                                                    | root operating manual                 | hand                                           | fact-markered, claim-scanner, link-checked |
| `USA.md`                                                       | the audit template (the deliverable)  | hand                                           | fact-markered, claim-scanner               |
| `README.md`                                                    | product entry                         | hand                                           | fact-markered, claim-scanner               |
| `CONTRIBUTING.md`                                              | contributor contract                  | hand                                           | claim-scanner                              |
| `ROADMAP.md`, `VISION.md`, `GOVERNANCE.md`                     | project intent                        | hand                                           | claim-scanner                              |
| `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `CITATION.cff` | governance/legal                      | hand                                           | version-pin checked                        |
| `CHANGELOG.md`                                                 | release history                       | **machine** (changesets)                       | machine-written                            |
| `AUDIT.md`                                                     | last self-audit output                | **machine** (gitignored pattern)               | not tracked                                |
| `docs/` (28 files)                                             | guides, architecture, ADRs, reference | hand + generated                               | full check-docs                            |
| `docs/adr/` (43 records + README index)                        | ADRs (immutable history)              | hand                                           | ADR-hygiene gate                           |
| `docs/reference/cli.md`                                        | CLI reference                         | **generated** from `dist/cli.js --help`        | byte-compare gate                          |
| `docs/reference/asvs-coverage.md` + fixture                    | ASVS coverage map                     | **generated** from rules                       | snapshot test only (see gap)               |
| `docs/reference/api.md`                                        | programmatic API                      | hand                                           | claim-scanner                              |
| `examples/sample-report.md`                                    | engine sample output                  | **generated** by `usa audit examples/demo-app` | byte-compare gate                          |
| `action.yml`                                                   | composite action                      | hand                                           | claim-scanner                              |
| `docs/writing-docs.md`                                         | the doc contract                      | hand (meta)                                    | META_DOCS — exempt from content checks     |

**Total tracked markdown governed by the doc system:** 83 files (per
`scripts/check-docs.mjs` `docFiles()`, which excludes `experiments/`,
`examples/demo-app/`, `CHANGELOG.md`, `examples/sample-report.md`, and
`docs/reference/cli.md` from the _marker/claim_ checks because those are
generated; they are still link/index checked where applicable).

### 1.3 Orphaned docs

None found by the living index: `docs/README.md` lists every `docs/**/*.md`
(check-docs step 5). The `ADR README` index lists all <!-- usa:fact adrs -->44<!-- /usa:fact --> ADRs and the checker
verifies no orphaned/missing/duplicate numbers. Root-level docs are cross
referenced from `AGENTS.md` "Required Reading" (PROFESSOR-J) and from
`docs/README.md` index where they have a home. `AUDIT.md` is gitignored by
convention. `UI_REDESIGN_PLAN.md` and `SKILL-AUDIT.md` exist at root and ARE
included in `docFiles()` — verified present, not orphaned in the index sense
(index coverage only applies to `docs/`).

### 1.4 Undocumented-by-taxonomy gaps

`docs/documentation-audit.md` (ADR-0042) declares a 220-artifact universe.
Running `usa docs audit .` against USA itself reports
**27/176 applicable artifacts present, 141 missing, 1 invariant failing
(`DOCU-INV-ROUTES` — expected: USA is a static CLI with no HTTP routes of its
own), 142 open findings.** These are not "gaps in USA's doc system" but findings
the doc-universe gate would require USA to resolve — i.e. the system works
against its own host. The missing artifacts are predominantly tier-1+/ongoing
(Tier 0 — README/LICENSE/CONTRIBUTING/CHANGELOG — are all present, which is
why `--fail-on medium` exits 0 against USA; `--fail-on low` exits 1).

---

## 2. Staleness detection (how the repo actually does it)

The repo does **not** use naive `git log` timestamp comparison (doc-mtime vs
src-mtime). That heuristic is unreliable (weekday prefixes, rebases,
whitespace-only edits, vendored files) and USA correctly rejects it. Instead it
uses strictly **content-based** checks, which never lie about a doc's current
truth:

| Mechanism                                                                                                     | Covers                                                                                                 | Enforced                                               |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `sync-docs.mjs` fact markers (`usa:fact KEY` / `usa:begin…end`)                                               | every derivable number/version/list (rules, sections, ADRs, version, rules-tree, standards mapping, …) | pre-commit (autosync) + `docs:check` (CI)              |
| Generated-doc byte-compare (`gen-cli-docs --check`, `gen-sample-report --check`, `gen-asvs-coverage --check`) | CLI reference, sample report, ASVS map                                                                 | CI hygiene (cli+sample only)                           |
| Claim scanner (`findUnmarkedClaims`)                                                                          | any bare "N rules/sections/packs/detectors/ADRs" not wrapped in a marker                               | `docs:check` (CI)                                      |
| Banned-string scan                                                                                            | known-stale tokens (see `BANNED` in `scripts/check-docs.mjs`)                                          | `docs:check` (CI)                                      |
| `DOCU-INV-*` invariants                                                                                       | routes, env vars, public docstrings, relative links, generated-artifact drift, changelog-vs-tags       | `usa docs audit` (self-audit CI gate)                  |
| Impact graph (`docs-taxonomy.yaml` `sources`/`derives_from`/`syncs_with` + `usa docs impact`)                 | "this file changed → which docs now lie" (semantic, not diff-only)                                     | `usa docs audit --changed` / `.usa.yaml docs.universe` |
| External-link scan                                                                                            | every `http(s)` link                                                                                   | scheduled `docs-link-check.yml` (15 d)                 |
| Prose review nudge                                                                                            | sentences true-when-written going stale                                                                | scheduled `docs-review.yml` (15 d)                     |
| ADR immutability                                                                                              | historical decisions                                                                                   | `docs:adrs` (CI)                                       |

**Result:** mechanical staleness is impossible by construction (you cannot
commit a stale count or a stale `--help` block). Prose staleness is reduced
(markers + links + scheduled review) and the residual is surfaced as
human-judgement work, never as silent truth.

---

## 3. Existing automation audit

### 3.1 Generation already wired

| Doc                               | Generator                                     | Inputs                                                                                       | Gate                                  |
| --------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| `docs/reference/cli.md`           | `scripts/gen-cli-docs.mjs`                    | `dist/cli.js --help` + `dist/cli.js rules`                                                   | CI `docs:cli` + auto-resync bot       |
| `examples/sample-report.md`       | `scripts/gen-sample-report.mjs`               | `dist/cli.js audit examples/demo-app`                                                        | CI `docs:sample` + auto-resync bot    |
| `docs/reference/asvs-coverage.md` | `scripts/gen-asvs-coverage.mjs`               | `rules/catalogues/asvs-5.0-controls.yaml` + loaded packs from `dist/`                        | **snapshot test only — see gap**      |
| fact values in 7 docs             | `scripts/sync-docs.mjs` (via `docs-sync.mjs`) | `package.json`, `rules/index.yaml`, `detectors.yaml`, `sections.ts`, `types.ts`, `docs/adr/` | CI `docs:check` + pre-commit autosync |

### 3.2 Hooks & enforcement points present

```
.git/hooks/pre-commit (native)        -> generated, delegates to pre-commit framework
.husky/commit-msg                     -> commitlint (Conventional Commits, 100-char body)
.husky/pre-commit                     -> node scripts/docs-autosync.mjs ; pnpm exec lint-staged
                                        (autosync facts + lint/fix staged source; NO doc gates)
.husky/pre-push                        -> NOT INSTALLED
.git/hooks/pre-receive …               -> not customized
```

- **Pre-commit** runs fact-autosync + lint-staged only. It does **not** run
  `docs:check`, `docs:adrs`, `docs:cli`, `docs:sample`, or `docs:asvs`.
- **CI `hygiene` job** (`ci.yml`): build → `docs:adrs` → `docs:check` →
  `docs:cli` → `docs:sample`. **No `docs:asvs`.**
- **CI `resync` job** (`ci.yml`): regenerates + pushes `docs/reference/cli.md`
  and `examples/sample-report.md` back to the PR. **Does not touch ASVS.**
- **CI `self-audit.yml`**: runs `usa audit . --fail-on critical` and a _separate_
  `usa docs audit . --fail-on medium` step (the documentation-universe gate).
- **`verify-docs` job** (`ci.yml`): existence-only check for the 9 named docs +
  `docs/adr` dir — a legacy presence check, superseded by the universe audit.

### 3.3 Linting / coverage tools already in use

- ESLint (`eslint.config.mjs`), Prettier, `tsc --noEmit` (strict), commitlint,
  vitest coverage (ratcheted thresholds), `pnpm audit --audit-level=high`,
  gitleaks (direct binary), bandit-equivalent SAST via scorecard, CodeQL.
- No markdown-specific linter (markdownlint/remark/vale) — the repo's
  **own** `check-docs.mjs` is the markdown governance layer instead, which is
  stricter and stack-specific. This is a deliberate, justified choice, not a gap.

### 3.4 CODEOWNERS

```
*                       @Er-Sajan-PLG
/src/engine/            @Er-Sajan-PLG
/rules/                 @Er-Sajan-PLG
```

Docs have no dedicated CODEOWNER line; the catch-all `*` covers them. Branch
protection requires review (per AGENTS.md §6). Docs are covered by the catch-all
review requirement and by the CI gates, not by a separate doc owner.

### 3.5 Versioning of docs

- Living docs (counts, versions) are fact-markered and auto-synced.
- ADRs are immutable history (supersede, never edit).
- Generated docs are byte-regenerated + diff-gated.
- `.usa.yaml` holds dated reviews + expiring suppressions (ADR-0023).

---

## 4. Sync-mechanism audit (the "did you forget the doc?" question)

| Change class                        | Detected how?                                                   | Enforced where                                         | Reliability                  |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------- |
| New rule / rule count change        | fact marker `rules` re-syncs; claim scanner flags bare counts   | pre-commit autosync + `docs:check` CI                  | high (content diff)          |
| New CLI flag / help text change     | `gen-cli-docs --check` byte-diff vs regenerated                 | CI `docs:cli`                                          | high                         |
| New env var / route / docstring     | `DOCU-INV-ENV` / `DOCU-INV-ROUTES` / `DOCU-INV-DOCS` invariants | `usa docs audit` self-audit CI                         | high (heuristic extraction)  |
| Sample report drift                 | `gen-sample-report --check` byte-diff                           | CI `docs:sample`                                       | high                         |
| ASVS coverage drift                 | `gen-asvs-coverage --check` (exists)                            | **NOWHERE in CI** (see gap)                            | missing                      |
| "this file changed, which docs lie" | `usa docs impact` / taxonomy `sources` edges                    | on-demand CLI; `.usa.yaml docs.universe` in main audit | available, not in pre-commit |
| Prose becoming false over time      | scheduled `docs-review.yml` nudge (15 d)                        | weekly cadence → human issue                           | low (calendar-only)          |

Confirmed gap: the only "code changed → doc must change" enforcement that does
**not** run automatically is **ASVS coverage** (it has a `--check` gate and a
generator but neither CI nor the resync bot runs them), and **prose staleness**
(which is intentionally calendar-gated, ADR-0042, and not a regression).

---

## 5. Gap report (risk-ranked)

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                          | Risk         | Evidence                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | **ASVS coverage `--check` gate absent from CI.** `gen-asvs-coverage.mjs --check` exists and passes, but no CI job runs it; the `resync` bot regenerates only `cli.md` + `sample-report.md`. Only `tests/integration/asvs-coverage.test.ts` guards the _snapshot-vs-citedIds_ equality — it does not byte-compare the committed `docs/reference/asvs-coverage.md` against the generator, so the doc can silently rot.                         | **Critical** | `grep -rn asvs .github/` → only a prose mention in `docs-review.yml`; hygiene job runs `docs:adrs docs:check docs:cli docs:sample` (no `docs:asvs`); resync regen lines 349–350 touch cli+sample only. |
| G2  | **No pre-push hook; pre-commit Layer 1 skips doc governance.** Pre-commit runs only fact-autosync + lint-staged. A doc commit with a broken internal link, an unmarked claim, a stale ADR, or a stale ASVS doc passes locally and is only caught later in CI — violating the "incremental docs check at commit" layer.                                                                                                                       | **High**     | `.husky/pre-commit` = autosync + lint-staged; no `.husky/pre-push`; `docs:check`/`docs:adrs`/generated `--check`s run only in CI.                                                                      |
| G3  | **AGENTS.md "four doc gates" is stale.** `docs:all` runs **five** gates (`adrs, check, cli, sample, asvs`), but AGENTS.md §6 and §7 both say "four gates: ADR hygiene, docs governance (claim scanner), CLI reference sync, sample-report sync."                                                                                                                                                                                             | **Low**      | AGENTS.md lines 140, 232–233.                                                                                                                                                                          |
| G4  | **No consolidated doc→code mapping / classification for individual repo files.** The 220-artifact taxonomy (ADR-0042) is the manifest for artifact _types_ and powers `usa docs impact`, but there is no per-repo-file registry, and `check-docs` index coverage spans only `docs/` (not root `.md`). A root doc has no explicit source-of-truth entry; it is caught only by the claim-link checks, never by a "this doc is untracked" gate. | **Low**      | `check-docs.mjs` index coverage reads only `docs/` + `docs/reference/`; no `docs.manifest.*`.                                                                                                          |
| G5  | **Pre-commit autosync silently skips if `dist/` is missing** (warns + exits 0). By design (CI is the backstop), but means a contributor with no build gets no local fact sync error.                                                                                                                                                                                                                                                         | **Low**      | `scripts/docs-autosync.mjs` `catch` → `process.exit(0)`.                                                                                                                                               |

### Risk summary

- **Critical:** 1 — G1. A committed generated doc (`asvs-coverage.md`) has no CI
  byte-check and no self-resync, so it can diverge from the rules it documents
  for up to a month with no gate.
- **High:** 1 — G2. Doc-only defects are not caught at commit/push time.
- **Low:** 3 — G3 (self-referential doc wording), G4 (manifest completeness),
  G5 (autosync fallback).

### Tool choices (justified by actual stack)

The repo is TypeScript/Node/pnpm; the existing tooling is custom scripts over
the real built engine. The correct, non-fragile choice is to **extend the
existing script framework**, not import a foreign linter (markdownlint/remark
would duplicate `check-docs.mjs` and conflict with the marker system). For the
two gaps above:

- G1 fix → add `docs:asvs` to the `hygiene` job and add ASVS to the `resync`
  regen. One YAML edit, zero new dependencies.
- G2 fix → add `.husky/pre-push` running `pnpm run build && pnpm run docs:all`.
  Zero new dependencies; re-uses four existing gates.
- G3 fix → two-word edit in AGENTS.md.
- G4 fix → optional lightweight `docs/manifest.yaml` registry + a
  `check-manifest` step folded into `docs:all` (deferred to Phase 3 if scope
  allows; the taxonomy already satisfies the spirit of the requirement).

---

## 6. Status (baseline vs. this commit)

_§2–§5 above is the as-is baseline captured at the start of this task. This
status row maps each finding to the hardening shipped in this same commit so
the report stays truthful to HEAD (the "close G1 now" recommendation below is
not still open)._

| Gap                                                   | Risk     | Status               | Shipped by                                                                                                                         |
| ----------------------------------------------------- | -------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| G1 ASVS coverage `--check` absent from CI             | Critical | **Closed**           | E1: `docs:asvs` added to CI `hygiene` + `resync` (regen `docs/reference/asvs-coverage.md` + snapshot, diff-gated)                  |
| G2 no pre-push doc gate; Layer 1 skips doc governance | High     | **Closed**           | E2: `.husky/pre-push` → `build && docs:all`                                                                                        |
| G3 AGENTS.md "four gates" stale (is five)             | Low      | **Pending — manual** | E3 deferred: AGENTS.md is a protected agent file; the two-word edit needs explicit owner consent (see DOCS_VERIFICATION_LOG.md §5) |
| G4 no per-repo-file classification registry           | Low      | **Closed**           | E4: `docs/manifest.yaml` + `scripts/check-manifest.mjs`, folded into `docs:all` + CI `hygiene`                                     |
| G5 autosync silently skips without `dist/`            | Low      | **Accepted**         | by design; CI is the backstop (§3.2, `docs/writing-docs.md` §3)                                                                    |

Evidence the closures hold: `pnpm run docs:all` exits 0 across all six gates
(adrs, check, cli, sample, asvs, manifest); `DOCS_VERIFICATION_LOG.md` §§1–6
log the local-gate verification; §8 documents the cross-repo demonstration
against PROFESSOR-J. G3 remains the only open action and is blocked on owner
consent, not on implementation.
