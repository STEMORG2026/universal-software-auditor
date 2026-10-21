# Continuation — where the scanner/evidence work stopped

Written 2026-10-21 at the close of the scanner-integration work. Read this first;
it exists so the next session does not reconstruct state from `git log`.

## State at close

`master` = `926839e`, version **2.27.0**, three changesets pending.

| Merged | What                                                                       |
| ------ | -------------------------------------------------------------------------- |
| #188   | removed the automerge workflow — merges are manual                         |
| #190   | four verdict-correctness fixes, `audit.ts` split, self-audit 100/100       |
| #192   | dev-dependencies bump (replaced #180)                                      |
| #178   | codeql-action analyze bump                                                 |
| #194   | scanner adapter layer, Tier 1 (Trivy, dependency-cruiser, Semgrep, CodeQL) |
| #196   | Tier 2 (Scorecard, ORT) + verification pass against real binaries          |
| #197   | intent model (`usa intent`), OTM → evidence join on CWE                    |

Gates at close: **1415 tests**, lint 0 warnings, `docs:all` clean, self-audit
**100/100 with no open findings**.

## The one thing left open

**PR #195 `chore(master): release` → `@xenos1996/usa@2.28.0`.** It is CLEAN and
carries all three changesets. Merging it publishes to npm, which is irreversible
and was deliberately left to the owner:

```bash
gh pr merge 195 --squash          # publishes 2.28.0
```

Two things to know before pressing it:

- The changesets action rewrites `changeset-release/master` after every merge to
  master, and each rewrite lands its workflow runs in GitHub's
  `action_required` quarantine. `gh pr checks` then reports **"no checks
  reported"**, which reads like "never triggered". Approve them by id:
  `gh api -X POST repos/STEMORG2026/universal-software-auditor/actions/runs/<id>/approve`
- After the release, the repo convention is a `provenance/v2.28.0` branch with
  the SLSA bundle + VSA, filed by PR (publish.yml does this automatically when
  the tag fires — check that it ran).

## Resume point: Tier 3

Both remaining items are **deliberately last**, and the reasons still hold.

### 1. SonarQube — `OPTIONAL_PLUGIN`

Consume via the Web API (`GET /api/issues/search`), never by embedding the server
or parsing scanner logs. Needs a server + credentials, so the adapter cannot be
end-to-end tested here; the fixture path is the only honest one.

Read `docs/research/sonarqube.md` first. The value is the **quality-gate** concept
(a policy over findings), not the tool's issue list.

### 2. OpenRewrite — `DO_NOT_INTEGRATE` until findings can name a verifiable change

The blocker is not the tool, it is our model: a finding has `remediation.text`
and an optional `proposedChange.what`, but nothing that can be _verified_. The
precondition is a verifier — apply the change in a scratch copy, re-run the
scanner that produced the finding, assert the evidence id is gone. Build that
first; the recipe is the easy half.

## Known gaps, in priority order

1. **ORT's violations payload is unverified.** The CLI is measured (v97.0.0:
   `ort evaluate -i <result> -o <dir> -f JSON`), but ORT refuses to evaluate
   without a _rules script_, so no violation has ever been captured. The parser
   accepts both `violations` and `evaluator.violations` and resolves anything else
   to `UNKNOWN`. To close: write a minimal ORT rules script, run it, replace
   `tests/fixtures/scanners/ort-evaluate.yml`.
2. **Semgrep and dependency-cruiser are only end-to-end tested where installed.**
   Their e2e tests skip loudly when absent, which is honest but means CI proves
   less than a local run. If they should run in CI, install them in the workflow.
3. **dependency-cruiser needs a local devDependency** to resolve TypeScript. A
   globally installed `depcruise` cruised **0 modules** against this repo.
4. **No requirement/control consumption yet.** `docs/architecture/finding-model.md`
   defines `Requirement` and `Control` as declared inputs; nothing reads them.
   The intent model (`src/intent/`) is the pattern to copy.

## Traps discovered — do not re-learn these

| Trap                               | Reality                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pull_request: branches: [master]` | A **stacked PR got zero CI** and looked green. Removed in #197; do not narrow it again.                                            |
| `docker run` in this sandbox       | Fails with "failed to create endpoint … operation not supported" unless `--network none`.                                          |
| `pip install semgrep`              | Needs `--break-system-packages` (PEP 668). Lands in `~/.local/bin`.                                                                |
| commitlint                         | Rejects a **sentence-case subject** (`subject-case`). `feat(scanner): tier 2 …` fails; lowercase it.                               |
| `package-lock.json` in fixtures    | Gitignored — needs `git add -f` or the CVE evidence silently disappears.                                                           |
| `fixtures/**`                      | Planted defects. Must stay in both `eslint.config.mjs` ignores and `.usa.yaml` ignore, or the self-audit reports them against USA. |
| Scanner e2e tests                  | External processes are not unit-test speed; they declare their own `timeout` (15s default flakes under load).                      |
| `--scanner` flag                   | Was parsed and ignored in Tier 1 — fixed in #196. Verify it still filters.                                                         |

## Local tooling used for verification (not committed)

| Tool               | Version | Where                                                            |
| ------------------ | ------- | ---------------------------------------------------------------- |
| trivy              | 0.75.0  | system                                                           |
| semgrep            | 1.182.0 | `~/.local/bin` (pip `--user`)                                    |
| dependency-cruiser | 18.7.0  | `~/.local/bin` (npm `-g`)                                        |
| scorecard          | 5.6.0   | `/tmp` — **ephemeral**, re-download from ossf/scorecard releases |
| ort                | 97.0.0  | docker image `ghcr.io/oss-review-toolkit/ort` (`--network none`) |

## Commands that must pass before any PR

```bash
npm run typecheck && npm run lint && npm run format:check
npm run docs:all            # 6 gates; regenerates cli.md + sample-report.md
npm test                    # 1415 tests
npm run build && node dist/cli.js audit . --out AUDIT.md   # must be 100/100
```

`docs:all` fails if a new doc is not classified in `docs/manifest.yaml`, and the
pre-commit hook fails if a new `state/sessions/*.md` lacks
`**Status:** IN_PROGRESS|COMPLETED`.
