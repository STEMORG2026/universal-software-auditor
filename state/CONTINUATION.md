# Continuation — where the scanner/evidence work stopped

Written 2026-10-22 after **2.28.0 shipped**. Read this first; it exists so the
next session does not reconstruct state from `git log`.

## State at close

`master` = `da507d9`, version **2.28.0**, **published to npmjs**, no open pull
requests, no pending changesets, working tree clean.

`@xenos1996/usa@2.28.0` is live: tarball on npmjs, GitHub release marked Latest,
tag `@xenos1996/usa@2.28.0`, and `provenance/v2.28.0` filed by `publish.yml`.

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
| #201   | SARIF result level resolved from the rule default before filtering         |
| #199   | scanner artifacts read from files; staged tools run as stages              |
| #200   | CodeQL adapter verified against the real toolchain                         |
| #202   | two duplicated e2e blocks removed                                          |
| #203   | dependency-cruiser's configured rules file reaches the command             |
| #204   | a semgrep scan that read no files reports UNKNOWN, not clean               |
| #195   | release 2.28.0                                                             |

Gates at close: **1443 tests** (1442 passed, 1 skipped), lint 0 warnings,
`docs:all` clean (44 ADRs, 139 docs), self-audit **100/100 with no open
findings**.

## The one invariant the adapters kept getting wrong

An adapter must distinguish **"ran and found nothing"** from **"analysed
nothing"**. Both produce an empty result list; only the first is a clean scan.
The evidence model already has the word for the second (`UNKNOWN`) — and by the
end of this work, every adapter used it:

| adapter            | "analysed nothing" signal     | guard                                         |
| ------------------ | ----------------------------- | --------------------------------------------- |
| trivy              | absent `Results`              | yes — its comment is the origin of the rule   |
| codeql             | no `runs`                     | yes, shared SARIF normaliser                  |
| dependency-cruiser | no `modules`; no rules loaded | yes (#203 fixed the rules half)               |
| semgrep            | empty `paths.scanned`         | yes (#204)                                    |
| scorecard          | absent `checks`               | yes; an empty array is unreachable — measured |
| ort                | missing payload               | yes, UNKNOWN by construction                  |

Two were real holes, both found by asking that one question of every adapter
rather than by reading code. Ask it again for any new adapter.

## What the artifact-contract pass changed (#199, #200)

The adapter contract had assumed a tool writes its payload to **stdout** and runs
as **one process**. Two of six do neither, so both were dead code that 1415
passing tests could not see — the fixture tests called `parse` with the file's
contents directly.

- `ScannerCommand.prepare` — stages that must succeed first (`ort analyze`,
  `codeql database create`).
- `ScannerCommand.artifacts` — files to read back, relative to the scan workdir;
  the first that exists is what `parse` receives. A declared artifact that was
  not produced is `error` with a reason, never an empty result.
- `AdapterRun` gains `prepare`, `artifact`, `exitCode`. The evidence report gains
  a **Source** column (`stdout` or the artifact path, plus a non-zero exit).
- ORT: verified end-to-end against the real binary; `pkg: null` stays null,
  `message`/`how_to_fix` travel with the evidence, a clean evaluation emits one
  `PASS` row.
- CodeQL: `create` → `analyze`, parsing the SARIF file. **Now verified** against
  CodeQL 2.27.3 — it is no longer `[UNVERIFIED]`.

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
   `defaultConfiguration.level` (error/warning/note) and stops there. CodeQL also
   publishes a numeric `properties.security-severity` (7.5 for both fixture
   findings), the only thing that distinguishes a 9.8 from a 5.3. A rule can read
   it only if the normaliser carries it; today it does not.
3. **Semgrep and dependency-cruiser are only end-to-end tested where installed.**
   Their e2e tests skip loudly when absent, which is honest but means CI proves
   less than a local run. If they should run in CI, install them in the workflow.
4. **dependency-cruiser still needs a local devDependency** to resolve
   TypeScript. A globally installed `depcruise` cruises **0 modules** against this
   repo. #203 fixed the rules half; this half remains.
5. **dependency-cruiser's default target is `src`.** A project whose sources are
   elsewhere gets `ok` plus one UNKNOWN row whose reason reads "output was not
   valid JSON" when the truth is "`src/` does not exist". The verdict is safe; the
   reason misleads. Surfacing stderr in that reason is the fix.
6. **No requirement/control consumption yet.** `docs/architecture/finding-model.md`
   defines `Requirement` and `Control` as declared inputs; nothing reads them.
   The intent model (`src/intent/`) is the pattern to copy.
7. **`state/DASHBOARD.md` guarantees a conflict between any two branches.** It
   embeds a timestamp and the branch's own last-ten-commits, so no two branches
   ever agree. Every merge writes a new one, so a branch updated before a merge
   conflicts after it. Merges must be serial (see the traps table); a
   `.gitattributes` merge driver or generating it at read time would end it.

## Traps discovered — do not re-learn these

| Trap                                  | Reality                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pull_request: branches: [master]`    | A **stacked PR got zero CI** and looked green. Removed in #197; do not narrow it again.                                                                                                                                                                                              |
| Deleting a base branch                | `gh pr merge <n> --delete-branch` **closes every PR stacked on that branch**. Recreate the branch at its commit, reopen, retarget, then delete.                                                                                                                                      |
| Merging a queue of PRs                | Must be **serial**: merge → fold the new `master` into the next branch → merge. Updating all branches first guarantees the second one conflicts.                                                                                                                                     |
| `state/DASHBOARD.md` in any merge     | Always conflicts, always with itself. `git checkout --theirs` it; the post-commit hook regenerates the content on the next commit.                                                                                                                                                   |
| The post-commit state hook            | Leaves files **staged but uncommitted** after a merge commit. `git status` will show them; commit them before pushing.                                                                                                                                                               |
| changesets release branch             | Its workflow runs land in `action_required`. Approving **all** of them at once is a mistake: stale runs' concurrency groups cancel the current head's, and `gh pr checks` then shows `fail` for checks that were `cancelled`. Approve only the current head, or `gh run rerun <id>`. |
| npmjs metadata after a publish        | The packument and `/pkg/version` can 404 for minutes **after** the tarball URL already serves 200. Read the tarball's `package.json`, not the metadata.                                                                                                                              |
| `docker run` in this sandbox          | Fails with "failed to create endpoint … operation not supported" on bridge networking. `--network none` and `--network host` both work; **host is what makes a real `ort analyze` possible**.                                                                                        |
| `pip install semgrep`                 | Needs `--break-system-packages` (PEP 668). Lands in `~/.local/bin`.                                                                                                                                                                                                                  |
| commitlint                            | Rejects a **sentence-case subject** (`subject-case`). `feat(scanner): tier 2 …` fails; lowercase it.                                                                                                                                                                                 |
| `package-lock.json` in fixtures       | Gitignored — needs `git add -f` or the CVE evidence silently disappears.                                                                                                                                                                                                             |
| `fixtures/**`                         | Planted defects. Must stay in `eslint.config.mjs` ignores, `.usa.yaml` ignore **and `.github/codeql-config.yml` `paths-ignore`**, or a tool reports them against USA itself.                                                                                                         |
| Scanner e2e tests                     | External processes are not unit-test speed; they declare their own `timeout` (15s default flakes under load).                                                                                                                                                                        |
| `--scanner` flag                      | Was parsed and ignored in Tier 1 — fixed in #196. Verify it still filters.                                                                                                                                                                                                           |
| `ort --rules-resource`                | Needs a **leading slash** (`/rules/osadl.rules.kts`). The bare form resolves against the command's jar and dies with a `NullPointerException` + stack trace.                                                                                                                         |
| `ort evaluate` exit status            | Non-zero when it finds violations — a run that succeeded and objected. Never read it as failure.                                                                                                                                                                                     |
| `ort --version`                       | Prints JVM warnings first, one naming `jna-5.19.1.jar`. A loose regex reports **5.19.1** as the ORT version. Only a line that _is_ a version counts.                                                                                                                                 |
| `codeql database analyze`             | The query specifier is **positional**: an empty string is one empty specifier, and the run dies with `Invalid package specification:` and writes no SARIF. Omit the argument instead.                                                                                                |
| `codeql` SARIF                        | Omits `result.level` on every result; the level is in `defaultConfiguration.level` (SARIF 3.27.10). Reading only `result.level` makes every finding INFO.                                                                                                                            |
| `codeql --version`                    | Prints `… release 2.27.3.` — `[\d.]+` records the full stop.                                                                                                                                                                                                                         |
| A file-writing scanner's fixture test | Proves the parser and nothing about the wiring. If the tool writes a file, the test must go through the runner.                                                                                                                                                                      |
| `docs:all` "cli.md is stale"          | Can fire when it is in sync. Run `node scripts/gen-cli-docs.mjs` (it writes identical bytes) and re-run; the gate then passes.                                                                                                                                                       |

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
npm test                    # 1443 tests
npm run build && node dist/cli.js audit . --out AUDIT.md   # must be 100/100
```

`docs:all` fails if a new doc is not classified in `docs/manifest.yaml`, and the
pre-commit hook fails if a new `state/sessions/*.md` lacks
`**Status:** IN_PROGRESS|COMPLETED`.

Before shipping, also verify the artifact rather than the build: `npm pack`,
install the tarball into a clean directory, run `usa --version` and
`usa audit .`, and confirm the release's fixes are present in `dist/`.
