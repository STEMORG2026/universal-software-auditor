# Continuation — where the scanner/evidence work stopped

Written 2026-10-22 after **2.28.0 shipped**, updated the same day after the
stderr-diagnosis pass. Read this first; it exists so the next session does not
reconstruct state from `git log`.

## State at close

`master` = `bd3ed2d`, version **2.28.0** (published), **two changesets pending**
(`scanner-stderr-reason`, `local-scanner-bin`, both patch → 2.28.1). Working tree clean.

### Resume point — two PRs, both waiting on the owner

Nothing else is in progress. Both of these are gated on a human signature and
nothing else:

| PR                                  | What                         | Why it is stuck                                                                                                                                            |
| ----------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#205** `provenance/v2.28.0`       | SLSA bundle + VSA for 2.28.0 | Authored by `app/github-actions`; `master` requires a code-owner review and `CODEOWNERS` is `* @Er-Sajan-PLG`. All 13 checks pass. Approve it, then merge. |
| **#208** `changeset-release/master` | Release **2.28.1**           | Same review rule, plus its workflow runs land in `action_required` — approve **only the runs for the current head**, then merge. Merging publishes.        |

Do not `--admin` either one, and do not approve them as `Er-Sajan-PLG`: that is
recording his sign-off on his own behalf. They are deliberately waiting.

## What shipped

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
| #206   | the post-release handoff                                                   |
| #207   | a failing scanner's stderr carried into its UNKNOWN reason                 |

Gates at close: **1448 tests** (1447 passed, 1 skipped), lint 0 warnings,
`docs:all` clean (44 ADRs, 132 docs), self-audit **100/100 with no open
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

3. **Two scanners are end-to-end tested in CI: semgrep and trivy.** The central
   e2e test (_"every adapter that is installed produces evidence"_) used to loop
   over the available adapters, so with none on PATH it ran **zero iterations and
   passed** — measured, with `PATH` stripped it reported `1 passed`. #211 closed
   that with two counters (`ran` and `verdicts`, both must be non-zero) and
   installed semgrep; #215 added trivy.

   Both work in CI because the fixture is built for it: it vendors a semgrep
   ruleset (`.usa/scanners.yaml` points at it, so the run is offline) and ships a
   **committed `package-lock.json`** (force-added past the gitignore rule). Both
   binaries are pinned to the version the adapter was verified against — semgrep
   1.182.0, trivy 0.75.0 — while the vulnerability database is deliberately not,
   because the trivy e2e asserts only CVE-_format_, so database drift cannot turn
   it red.

   Still not in CI, deliberately: **codeql** (700 MB bundle), **ort** (docker),
   **scorecard** (platform token). Their tests still skip loudly, which is honest.
   dependency-cruiser runs but reports only an UNKNOWN row against this fixture,
   so it cannot satisfy the `verdicts` counter on its own.

4. **Closed by #213.** A globally installed `depcruise` cruised **0 modules**
   against this repo because it cannot resolve the project's TypeScript, and
   `probe()` searched `PATH` only, so the local binary was invisible.
   `probe(target?)` now takes the target and the runner puts the project's
   `node_modules/.bin` **first** on the child's PATH. Measured: global 0 modules,
   local **108**. dependency-cruiser is now a devDependency here.

   Still open, and a design decision rather than a fix: this repo ships no
   `.dependency-cruiser.json`, so `usa scan .` honestly reports _"ran without a
   rules config — a graph, not a verdict"_. Writing the rules is choosing the
   architecture, not fixing a bug.

5. **dependency-cruiser's default target is `src`.** A project whose sources are
   elsewhere gets `ok` plus one UNKNOWN row. The reason no longer misleads —
   #207 appends the tool's stderr, so it now reads
   `(exit 1: ERROR: Can't open 'src' for reading. Does it exist?)`. What remains
   is the default itself: changing `src` to `.` is a design decision, not a fix,
   because it changes what every depcruise run scans.
6. **No requirement/control consumption yet.** `docs/architecture/finding-model.md`
   defines `Requirement` and `Control` as declared inputs; nothing reads them.
   The intent model (`src/intent/`) is the pattern to copy.
7. **`state/DASHBOARD.md` guaranteed a conflict between any two branches.** It
   embeds a timestamp and the branch's own last-ten-commits, so no two branches
   ever agreed. Every merge wrote a new one, so a branch updated before a merge
   conflicted after it.

   Fixed by `.gitattributes` (`merge=union`), and the obvious fix was measured
   first because it does not work:

   | option        | result                                                                                                                                                  |
   | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `merge=ours`  | **does not work** — git needs a per-clone `[merge "ours"] driver = true`, so a fresh clone still conflicts. A fix absent on a fresh clone is not a fix. |
   | `merge=union` | works, needs no configuration, survives a clone.                                                                                                        |
   | gitignore it  | would work, but MACP startup (AGENTS.md step 2) reads this file to judge staleness, so a fresh clone must contain it.                                   |

   Accepted cost: for one commit — the merge commit — the file carries two
   `Last Reconciled` lines, because `union` keeps both sides. The post-commit hook
   rewrites the whole file in its auto-commit immediately after, so the doubled
   state does not survive the merge, and the staleness check can still read it.

## Traps discovered — do not re-learn these

| Trap                                  | Reality                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pull_request: branches: [master]`    | A **stacked PR got zero CI** and looked green. Removed in #197; do not narrow it again.                                                                                                                                                                                              |
| Deleting a base branch                | `gh pr merge <n> --delete-branch` **closes every PR stacked on that branch**. Recreate the branch at its commit, reopen, retarget, then delete.                                                                                                                                      |
| Merging a queue of PRs                | Must be **serial**: merge → fold the new `master` into the next branch → merge. Updating all branches first guarantees the second one conflicts.                                                                                                                                     |
| `state/DASHBOARD.md` in any merge     | Used to conflict on every merge. Fixed by `.gitattributes merge=union`; the merge commit carries a doubled `Last Reconciled` line and the hook rewrites the whole file in its auto-commit. Do not remove that line without reading gap 7.                                            |
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
| `gh pr checks --watch`                | Dies with `error connecting to api.github.com` after a long outage **while the checks actually complete**. Never trust the watcher's exit — re-read `gh pr view --json mergeStateStatus` before calling a PR red.                                                                    |
| e2e tests under load                  | A first full-suite run reported 4 failures in `cli.test.ts` and `evolution-determinism.test.ts`; a re-run was green and both files pass in isolation. Consistent with the 15s flake trap, but the cause was **not** isolated. Re-run before believing it.                            |

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
npm test                    # 1448 tests
npm run build && node dist/cli.js audit . --out AUDIT.md   # must be 100/100
```

`docs:all` fails if a new doc is not classified in `docs/manifest.yaml`, and the
pre-commit hook fails if a new `state/sessions/*.md` lacks
`**Status:** IN_PROGRESS|COMPLETED`.

Before shipping, also verify the artifact rather than the build: `npm pack`,
install the tarball into a clean directory, run `usa --version` and
`usa audit .`, and confirm the release's fixes are present in `dist/`.
