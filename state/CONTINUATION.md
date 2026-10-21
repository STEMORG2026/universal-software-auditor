# Continuation — where the scanner/evidence work stopped

Written 2026-10-21 at the close of the scanner-integration work, revised the
same day after the artifact-contract pass. Read this first; it exists so the
next session does not reconstruct state from `git log`.

## State at close

`master` = `aefa1cb`, version **2.27.0**, three changesets pending.

| Merged | What                                                                       |
| ------ | -------------------------------------------------------------------------- |
| #188   | removed the automerge workflow — merges are manual                         |
| #190   | four verdict-correctness fixes, `audit.ts` split, self-audit 100/100       |
| #192   | dev-dependencies bump (replaced #180)                                      |
| #178   | codeql-action analyze bump                                                 |
| #194   | scanner adapter layer, Tier 1 (Trivy, dependency-cruiser, Semgrep, CodeQL) |
| #196   | Tier 2 (Scorecard, ORT) + verification pass against real binaries          |
| #197   | intent model (`usa intent`), OTM → evidence join on CWE                    |
| #198   | the handoff document                                                       |

Then the artifact-contract pass on `fix/scanner-artifact-contract`: `prepare` and
`artifacts` on `ScannerCommand`, the ORT payload verified end-to-end, CodeQL's
wiring repaired. 1439 tests.

Gates at close: **1439 tests**, lint 0 warnings, `docs:all` clean, self-audit
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

## What the artifact-contract pass changed

The adapter contract assumed a tool writes its payload to **stdout** and runs as
**one process**. Two of six do neither, so both were dead code that 1415 passing
tests could not see — the fixture tests called `parse` with the file's contents
directly.

- `ScannerCommand.prepare` — stages that must succeed first (`ort analyze`,
  `codeql database create`).
- `ScannerCommand.artifacts` — files to read back, relative to the scan workdir;
  the first that exists is what `parse` receives. A declared artifact that was
  not produced is `error` with a reason, never an empty result.
- `AdapterRun` gains `prepare`, `artifact`, `exitCode`. The evidence report gains
  a **Source** column (`stdout` or the artifact path, plus a non-zero exit).
- ORT: verified end-to-end against the real binary, so its payload is no longer
  `[UNVERIFIED]`. `pkg: null` stays null, `message`/`how_to_fix` travel with the
  evidence, and a clean evaluation emits one `PASS` row.
- CodeQL: `create` → `analyze`, parsing the SARIF file. **Still `[UNVERIFIED]`**
  — no `codeql` binary was available, so neither stage has ever run.

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

1. **ORT and CodeQL are only reachable through host binaries.** `probe()` looks
   on PATH; the verified invocations are a container image and a 700 MB bundle.
   A machine without either needs a shim (a shim that mounts `$PWD` at the same
   path works, because the runner's argv and workdir are both relative).
   Deciding whether to support docker natively is a security question — the
   auditor would spawn docker — not a plumbing one. Do not slip it in.
2. **CodeQL's `security-severity` is ignored.** The normaliser maps
   `defaultConfiguration.level` (error/warning/note) and stops there. CodeQL
   also publishes a numeric `properties.security-severity` (7.5 for both fixture
   findings), which is the only thing that distinguishes a 9.8 from a 5.3. A
   rule can read it only if the normaliser carries it; today it does not.
3. **Semgrep and dependency-cruiser are only end-to-end tested where installed.**
   Their e2e tests skip loudly when absent, which is honest but means CI proves
   less than a local run. If they should run in CI, install them in the workflow.
4. **dependency-cruiser needs a local devDependency** to resolve TypeScript. A
   globally installed `depcruise` cruised **0 modules** against this repo.
5. **No requirement/control consumption yet.** `docs/architecture/finding-model.md`
   defines `Requirement` and `Control` as declared inputs; nothing reads them.
   The intent model (`src/intent/`) is the pattern to copy.
6. **`tests/e2e/scan.test.ts` has two duplicated blocks** — the "every adapter
   that is installed" test and the "usa scan command" test each appear twice,
   so they run twice. Harmless, but it doubles the slowest e2e file's runtime.

## Traps discovered — do not re-learn these

| Trap                                  | Reality                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pull_request: branches: [master]`    | A **stacked PR got zero CI** and looked green. Removed in #197; do not narrow it again.                                                                                                       |
| `docker run` in this sandbox          | Fails with "failed to create endpoint … operation not supported" on bridge networking. `--network none` and `--network host` both work; **host is what makes a real `ort analyze` possible**. |
| `pip install semgrep`                 | Needs `--break-system-packages` (PEP 668). Lands in `~/.local/bin`.                                                                                                                           |
| commitlint                            | Rejects a **sentence-case subject** (`subject-case`). `feat(scanner): tier 2 …` fails; lowercase it.                                                                                          |
| `package-lock.json` in fixtures       | Gitignored — needs `git add -f` or the CVE evidence silently disappears.                                                                                                                      |
| `fixtures/**`                         | Planted defects. Must stay in both `eslint.config.mjs` ignores and `.usa.yaml` ignore, or the self-audit reports them against USA.                                                            |
| Scanner e2e tests                     | External processes are not unit-test speed; they declare their own `timeout` (15s default flakes under load).                                                                                 |
| `--scanner` flag                      | Was parsed and ignored in Tier 1 — fixed in #196. Verify it still filters.                                                                                                                    |
| `ort --rules-resource`                | Needs a **leading slash** (`/rules/osadl.rules.kts`). The bare form resolves against the command's jar and dies with a `NullPointerException` + stack trace.                                  |
| `ort evaluate` exit status            | Non-zero when it finds violations — a run that succeeded and objected. Never read it as failure.                                                                                              |
| `ort --version`                       | Prints JVM warnings first, one naming `jna-5.19.1.jar`. A loose regex reports **5.19.1** as the ORT version. Only a line that _is_ a version counts.                                          |
| `codeql database analyze`             | The query specifier is **positional**: an empty string is one empty specifier, and the run dies with `Invalid package specification:` and writes no SARIF. Omit the argument instead.         |
| `codeql` SARIF                        | Omits `result.level` on every result; the level is in `defaultConfiguration.level` (SARIF 3.27.10). Reading only `result.level` makes every finding INFO.                                     |
| `codeql --version`                    | Prints `… release 2.27.3.` — `[\d.]+` records the full stop.                                                                                                                                  |
| A file-writing scanner's fixture test | Proves the parser and nothing about the wiring. If the tool writes a file, the test must go through the runner.                                                                               |

## Local tooling used for verification (not committed)

| Tool               | Version | Where                                                                    |
| ------------------ | ------- | ------------------------------------------------------------------------ |
| trivy              | 0.75.0  | system                                                                   |
| semgrep            | 1.182.0 | `~/.local/bin` (pip `--user`)                                            |
| dependency-cruiser | 18.7.0  | `~/.local/bin` (npm `-g`)                                                |
| scorecard          | 5.6.0   | `/tmp` — **ephemeral**, re-download from ossf/scorecard releases         |
| ort                | 97.0.0  | docker image `ghcr.io/oss-review-toolkit/ort`                            |
| codeql             | 2.27.3  | `/tmp` — **ephemeral**, 700 MB bundle from github/codeql-action releases |

The ORT run used a `ort` shim on PATH:

```sh
#!/bin/sh
exec docker run --rm --network host -u "$(id -u):$(id -g)" \
  -v "$PWD:$PWD" -w "$PWD" ghcr.io/oss-review-toolkit/ort:latest "$@"
```

## Commands that must pass before any PR

```bash
npm run typecheck && npm run lint && npm run format:check
npm run docs:all            # 6 gates; regenerates cli.md + sample-report.md
npm test                    # 1439 tests
npm run build && node dist/cli.js audit . --out AUDIT.md   # must be 100/100
```

`docs:all` fails if a new doc is not classified in `docs/manifest.yaml`, and the
pre-commit hook fails if a new `state/sessions/*.md` lacks
`**Status:** IN_PROGRESS|COMPLETED`.
