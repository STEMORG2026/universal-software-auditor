# MISSING CAPABILITIES

Classified against the strategic objective: _reliable understanding of what a project is,
what it promises, what it implements, what is wrong, what is uncertain, and what needs
further verification._ ESSENTIAL = the current stated objective cannot be met without it.
STRATEGIC = large differentiation. OPTIONAL = situational. OUT OF SCOPE = duplicates mature
tools or costs more than it returns.

Each entry answers: what problem, who is hurt, absent or not, build/integrate/delegate,
prerequisite, cost, owner module, success measure, why it might be rejected.

---

## ESSENTIAL

### E1 — A score that means something

**Problem.** The headline number is a ratio over whatever the engine could answer, with
suppressed findings removed from the denominator. Measured consequences: 100/100 at 66%
coverage (USA-AUD-006), 100 → 92 without waivers (USA-AUD-005), 45.3 for an empty repo,
identical scores across maturity stages (USA-AUD-003).

**Who is hurt.** Every reader who quotes the number; every adopter who needs to compare two
projects or two releases.

**Absent?** The arithmetic is present and correct; the _semantics_ are absent. This is a
design gap, not a missing module.

**Build.** USA-R03. Owner: `engine/score.ts` + the executive summary renderer.
**Success measure.** No report renders a score without its coverage figure; suppressing a
failing rule cannot raise the score (property test); the empty-repo floor is justified or
removed.

**Reject?** Only if the product repositions as "a checklist with a score-shaped ornament",
which contradicts VISION.md.

### E2 — Real process isolation for scanners

**Problem.** USA-AUD-001 (RCE) and USA-AUD-002 (false isolation claim). The product executes
untrusted repositories' binaries in the user's own namespace.

**Build vs integrate.** Integrate. `bwrap`/`firejail`/`sandbox-exec`/container runtimes
already exist; a bespoke sandbox would be worse and would need its own security review.
Owner: `scanner/run.ts`. Prerequisite: none — resolve `probe.executable` first (a ten-line
fix), then add optional OS isolation behind a flag.

**Success measure.** The USA-AUD-001 fixture cannot write its marker file with isolation on;
the manifest's isolation field is true or absent.

**Reject?** Never — but stage it: absolute-path spawn now, OS isolation next.

### E3 — Honest blind-spot accounting in every format

**Problem.** Warnings exist and are discarded by the server and by JSON/SARIF
(USA-AUD-010); gitignored files vanish uncounted (USA-AUD-007). The product's stated
differentiator is that it _says what it could not see_ — and it does, in one format, from one
entry point.

**Build.** USA-R07. Owner: report schema + all renderers + `serve`.
**Success measure.** A truncated audit carries a truncation warning in md, json and sarif,
and a served job's payload contains it.

### E4 — A benchmark corpus that is not authored by the candidate

**Problem.** The evolution gate's precision/recall 1.0 is decided over three self-authored
cases (USA-AUD-016). The self-audit is likewise a self-assessment.

**Build.** A held-out corpus of real repositories with adjudicated findings, versioned
separately from the packs. Owner: `evolution/benchmark.ts` + a new `bench/` tree.
**Success measure.** A candidate that fits the author's cases but fails a held-out case is
rejected.

**Reject?** Not rejectable, but deferrable — the mechanism gate can ship before the quality
gate is honest, provided the docs stop calling it a quality gate.

---

## STRATEGIC

### S1 — Per-rule precision measurement in the wild

**Problem.** 315 rules, zero measured false-positive rates. `report/learn` and the evolution
pipeline could accumulate adjudications, but nothing aggregates them.

**Build.** A local, opt-in "this finding was wrong" signal that writes to `.usa/feedback.yaml`,
aggregated per rule into a precision estimate shown in `usa rules --facets`. Owner:
`engine/review.ts`. Cost: small. Success: a precision column that is populated after real use.

### S2 — Semantic analysis behind the rule language

**Problem.** `grep_present` cannot distinguish a comment from an implementation. A rule that
looks for `csrf` in a source tree passes on a TODO saying "add csrf".

**Build vs integrate.** Integrate. Semgrep and CodeQL adapters already exist; the missing
piece is _mapping_ scanner results back into rule verdicts, which the `oracle` check kind
half-does. Extend `oracle` to assert on named rules rather than only counts. Owner:
`scanner/` + `engine/evaluate.ts`.

**Success measure.** At least the security class of rules can be answered by evidence rather
than by substring presence, and the report distinguishes the two.

### S3 — Monorepo / per-package scoring

**Problem.** This repo detects as `monorepo` and gets one score. A 40-package workspace gets
one number that hides which package is the problem.

**Build.** Section-aware, package-aware scorecard. Owner: `engine/sections.ts` + detection.
Cost: medium. Success: per-package rows with their own coverage.

### S4 — Baseline/ratchet as a first-class mode

**Problem.** `--baseline` exists and is good. It is not the default mental model, and the
docs present it as an option rather than _the_ way to adopt USA on an existing codebase.

**Build.** Documentation and DX, not code. Owner: `docs/getting-started.md`.
Success: a legacy repo can adopt USA without a wall of pre-existing findings, and the guide
says so in the first screen.

---

## OPTIONAL

| Capability           | Why optional                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| SBOM generation      | Delegated to the release pipeline already (CycloneDX on release); re-implementing is duplication |
| VEX ingestion        | Only meaningful once vulnerability findings exist, which the charter excludes                    |
| IDE/LSP integration  | High cost, narrow benefit at this maturity                                                       |
| Multi-repo dashboard | Needs a server product the project deliberately does not have                                    |
| Rule-pack signing    | Real need only once third-party packs exist                                                      |
| i18n of reports      | No demand signal                                                                                 |

## OUT OF SCOPE — say so explicitly

- **CVE database / resolver / reachability** — ADR-0011. Trivy and ORT already do this.
- **Interprocedural dataflow / taint** — CodeQL's job. USA's contribution is applicability
  and evidence correlation, not a second CodeQL.
- **Penetration testing / exploitation** — VISION.md defers it behind its own charter.
- **Compliance certification** — USA maps to standards; auditors certify.
- **A second HTML/JUnit renderer ecosystem** — already contradicted by the shipped HTML
  renderer; pick one story.

## The capability that would actually differentiate

Not more rules. **A defensible statement of what was verified, what was not, and why** —
per rule, per section, per project, in every format, with a number that cannot be inflated.
The product already has the ingredients (evidence model, automatability taxonomy, judgement
queue, coverage percentage). What it lacks is a headline that refuses to lie about them.
That is cheaper than any new scanner and worth more than all of them.
