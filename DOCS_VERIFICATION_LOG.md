# Verification Log — Autonomous Documentation System

All steps run on branch `chore/autonomous-docs-system` against
`/home/sajan/Projects/Universal_Software_Auditor`. Every scenario is a real
command against the real repo; "exit" is the actual process exit code.

> **Historical record — read it as one.** This is the transcript of a single
> verification pass, not a description of the pipeline today: the gate names,
> check contexts, document counts and version numbers below are the ones that
> existed when the pass ran. [`docs/ci-integration.md`](docs/ci-integration.md)
> describes the current pipeline; [`docs/writing-docs.md`](docs/writing-docs.md)
> is the contract the docs are held to.

---

## 0. Baseline (current repo, clean tree)

```text
$ pnpm run docs:all
ADR hygiene: OK (42 records, index complete)
docs governance: OK (85 docs · facts 2.25.3/315 rules · sections · flags · links · index · pins)
CLI reference: OK (in sync)
sample report: OK (in sync)
doc manifest: OK (87 tracked docs · 29 standalone · 180-day review window)
EXIT = 0
```

`docs:all` = five regenerated-doc/check gates + the new manifest gate. All green.

Doc-subsystem test suite:

```text
$ npx vitest run tests/unit/docs-taxonomy.test.ts tests/integration/docs-audit.test.ts tests/e2e/docs-cli.test.ts
Test Files  3 passed (3)
Tests       38 passed (38)
```

Self-audit doc-universe gate (Layer 3, already present in `self-audit.yml`):

```text
$ node dist/cli.js docs audit . --fail-on medium --out /tmp/_docuniverse.md
usa docs audit (production, tiers 0,1,2,3,4) — 27/176 applicable artifacts present,
141 missing, 1 invariant(s) failing, 142 open finding(s)
EXIT = 0   # --fail-on medium => 0: USA keeps its tier-0 docs; missing ones are LOW
```

**Verdict:** zero unresolved CRITICAL/HIGH/MEDIUM findings. The 142 findings are
LOW-tier (missing tier-1+ artifacts) — honest debt the gate exposes, not a
gate failure.

---

## 1. Scenario 1 — Code change with no doc update (stale generated doc)

Simulates "CLI `--help` text changed but `docs/reference/cli.md` not regenerated":

```text
$ printf '\n[STALE DRIFT]\n' >> docs/reference/cli.md
$ node scripts/gen-cli-docs.mjs --check
docs/reference/cli.md is stale — run `node scripts/gen-cli-docs.mjs` and commit the result.
EXIT = 1
$ node scripts/gen-cli-docs.mjs          # regenerate from dist/
$ node scripts/gen-cli-docs.mjs --check
CLI reference: OK (in sync)
EXIT = 0
```

**Result:** the byte-compare gate catches the divergence and exits 1 with the exact
repair command. Regeneration restores the file (verified byte-identical to the committed
version). This is the CI enforcement for "did you forget to update the doc."

---

## 2. Scenario 2 — Doc-only change: broken internal link

Simulates "a broken `#anchor` link landed in a prose doc":

```text
$ # append a link to a heading USA.md lacks (space after ] so this report
$ # satisfies its own link-integrity gate; the live check used the contiguous form):
$ printf '\n[broken] (#this-heading-does-not-exist)\n' >> USA.md
$ node scripts/check-docs.mjs
docs governance: 1 problem(s):
- USA.md: anchor not found in USA.md: #this-heading-does-not-exist
EXIT = 1
$ git checkout -- USA.md        # revert
```

**Result:** `docs:check` (CI `hygiene` + pre-push payload) catches the broken anchor with an
actionable message naming the file and the missing anchor.

---

## 3. Scenario 3 — Doc classification gate (E4): unclassified doc

Simulates "a tracked markdown file with no manifest entry":

```text
$ # removed the ROADMAP.md entry from docs/manifest.yaml
$ node scripts/check-manifest.mjs
doc manifest: 1 problem(s):
- manifest: tracked doc ROADMAP.md has no classification — add a standalone
  entry to docs/manifest.yaml, or convert it to a marked/generated doc so it
  is auto-classified.
EXIT = 1
$ # restored the entry
$ node scripts/check-manifest.mjs
doc manifest: OK (87 tracked docs · 29 standalone · 180-day review window)
EXIT = 0
```

**Result:** the manifest gate forces conscious classification; untracked docs are caught before merge.

---

## 4. Scenario 4 — Doc classification gate (E4): expired review

Simulates "a standalone doc whose `reviewed` date passed the 180-day window":

```text
$ # set ROADMAP.md reviewed: 2020-01-01 in docs/manifest.yaml
$ node scripts/check-manifest.mjs
doc manifest: 1 problem(s):
- manifest: ROADMAP.md last reviewed 2020-01-01 — older than the 180-day
  review window. Re-verify the doc and bump 'reviewed'.
EXIT = 1
$ # restored to 2026-09-26
$ node scripts/check-manifest.mjs
doc manifest: OK (...)
EXIT = 0
```

**Result:** dated-review decay (ADR-0023 principle) forces periodic prose re-validation on a
schedule the team controls.

---

## 5. Scenario 5 — Pre-push hook fires and blocks a stale push (E2)

The hook `.husky/pre-push` runs `pnpm run build && pnpm run docs:all` (build so the
generated-doc `--check` gates compare against fresh `dist/`).

**Gotcha caught and fixed during verification:** the first draft sourced
`. "$(dirname "$0")/h"`, which resolves to `.husky/h` — a path that does **not**
exist. Direct invocation failed:
`.husky/pre-push: line 12: .husky/h: No such file or directory`. Inspecting the
machinery showed `core.hooksPath = .husky/_`, so git runs the _internal_
`.husky/_/pre-push` which sources `.husky/_/h` and then invokes
`sh -e .husky/pre-push "$@"` (the `-e` propagates the first failure). The working
`.husky/pre-commit` is **body-only** (no shebang, no source line), so the hook was
rewritten to the same body-only style.

**Verified** by simulating the husky shim's exact invocation, plus the stale-doc
negative:

```text
$ sh -e .husky/pre-push          # clean tree; the h-shim invocation path
... ADR hygiene / governance / CLI / sample / ASVS / manifest all OK ...
doc manifest: OK (87 tracked docs · 29 standalone · 180-day review window)
HOOK_SIM_EXIT = 0                # => push would proceed

$ printf '\n[STALE DRIFT]\n' >> docs/reference/cli.md
$ pnpm run docs:all
docs/reference/cli.md is stale — run `node scripts/gen-cli-docs.mjs` and commit the result.
EXIT = 1                         # => sh -e aborts, push is blocked
$ node scripts/gen-cli-docs.mjs  # regenerate → cli.md byte-identical
```

(A literal `git push` to a remote was **not** attempted: a local `git clone --bare`
for a local-remote test hit the destructive-action consent gate and was not retried,
per policy. Verifying the hook's `sh -e` invocation plus the S1 stale-fail is the
non-destructive proof of the same behaviour.)

---

## 6. Extensions in place (E1, E2, E3, E4, E5)

| Extension             | Artifact                                                                                                        | Verified                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| E1 ASVS gate in CI    | `.github/workflows/ci.yml` — `docs:asvs` in `hygiene` (line 289) + ASVS regen in `resync` (lines 357, 358, 368) | `docs:asvs` exits 0; YAML parses                          |
| E2 pre-push hook      | `.husky/pre-push` (executable, body-only) runs `build && docs:all`                                              | S5: `sh -e .husky/pre-push` exits 0 clean, 1 on stale doc |
| E3 "four→five gates"  | AGENTS.md not edited (protected agent-instruction file; needs explicit consent)                                 | documented as manual follow-up                            |
| E4 manifest gate      | `docs/manifest.yaml` + `scripts/check-manifest.mjs`; wired into `docs:all` + CI `hygiene`                       | S3/S4 prove it fails/passes; S0 green                     |
| E5 stray audit report | `.gitignore` ignored `/AUDIT.md` but not `/DOC-AUDIT.md` (default output of `usa docs audit`)                   | added `/DOC-AUDIT.md`; `git check-ignore` => ignored      |

---

## 7. Manual steps for the human (agent cannot configure these)

1. **Branch protection on `master`**: ensure the required status checks include
   `hygiene` and `self-audit` (and the new `docs:manifest` + `docs:asvs` steps
   within `hygiene`). Exact:
   ```
   gh api \
     repos/Er-Sajan-PLG/universal-software-auditor/branches/master/protection \
     --method GET -q '.required_status_checks.contexts'
   ```
   Add `hygiene`, `self-audit`, `resync`, `lint`, `test`, `build`, `rules`,
   `commits`, `changesets`, `security` if absent.
2. **AGANTS.md "four→five gates" (E3)**: AGANTS.md is a protected
   agent-instruction file; edits require explicit consent. Once granted, change
   both occurrences of "four doc gates" to "five" (the fifth being ASVS coverage)
   in `AGANTS.md` §6 (line ~140) and §7 (the `docs:all` note).
3. **Review `docs/manifest.yaml`**: the 29 `standalone` entries carry
   `reviewed: 2026-09-26` (baseline). After 180 days the gate will flag them for
   re-review — intended behaviour, not churn.

---

## 8. The capability you asked about: auditing _other_ repos' docs "at the same level"

Your intent: USA has a first-class doc system, so it should audit **other** projects'
documentation at that same level and report likewise, "along with auditing other status."
That capability already ships in USA — I did **not** add it; I verified and demonstrated it.

`usa docs audit <path>` runs the _same_ 220-artifact taxonomy and invariants against any
target directory, and `usa audit <path> --docs-universe` folds the doc universe into the
main code/rules/CI/security audit. Both write a graded Markdown report "likewise"
(same format as USA's own `DOC-AUDIT.md`).

Demonstration against a sibling repo (branch checked out):

```text
$ node dist/cli.js docs audit /home/sajan/Projects/PROFESSOR-J \
    --out /tmp/PPJ-DOC-AUDIT.md --fail-on none
usa docs audit (mvp, tiers 0,1,2) — 10/197 applicable artifacts present,
179 missing, 2 invariant(s) failing, 44 open finding(s)
report → /tmp/PPJ-DOC-AUDIT.md

$ node dist/cli.js audit /home/sajan/Projects/PROFESSOR-J \
    --docs-universe --out /tmp/PPJ-AUDIT.md --fail-on none
usa 64.5/100 (mvp) — 78 passed, open: high 6 · medium 5 · low 19 · future 56,
44 to review (78.8% verified automatically)
report → /tmp/PPJ-AUDIT.md
```

Both reports contain Executive Summary, findings by severity, Immediate Action,
Section-by-Section, Foundation Readiness, Judgement Queue, and a Recommended Roadmap —
a level-matched report "likewise."

Important caveat to state honestly: USA audits the target against **USA's own taxonomy**
(220 artifacts, ADR-0020 fact-marker model, generated-doc sync, etc.). A target that does
not follow USA's conventions therefore scores low on USA-specific artifacts — a _correct_
baseline, not a bug. To score a target against its **own** doc standards, supply
`--rules-dir` with that target's rule pack (the audit engine is data-driven); no
per-target pack is shipped in this repo.

> `AGENTS.md` states this is the tool's purpose: "a TypeScript CLI (`usa`)
> that audits any project and writes a graded Markdown report." The
> `--docs-universe` flag is what merges the doc-universe audit into that report.
