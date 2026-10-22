# Continuation — where the scanner/evidence work stopped

> **This file is the canonical handoff for this repository.**
> MACP (`docs/macp.md`) owns the protocol; this document is where its state
> lives. It is read at session startup by `AGENTS.md` step 2 and is classified
> in `docs/manifest.yaml`. Do not create a competing root `HANDOFF.md` — that
> would be duplicate documentation, and this protocol's own rule is to update
> the canonical document in place.
>
> Written to satisfy the _Universal Task Completion, Verification & Seamless
> Handoff Protocol_: 16 sections, labelled claims, and a `code_commit_sha`
> distinct from the handoff commit.

## READ THIS FIRST

Master is at **`57fd95e`**, version **2.28.0**, already published to npmjs.
Everything I was asked to do is merged and verified; the working tree is clean.

**Two PRs are open and both are waiting on you, not on me** — they are gated by
the code-owner review rule, because both are authored by `app/github-actions`
and `CODEOWNERS` is `* @Er-Sajan-PLG`. All 13 checks pass on each. Nothing else
is in progress.

## CHECKPOINT

```yaml
checkpoint:
  repository: STEMORG2026/universal-software-auditor
  canonical_handoff: state/CONTINUATION.md
  code_commit_sha: aad6478 # verified implementation state; docs commits follow
  handoff_commit_sha: 59e8942e6dcb0e3e07d5a94b8b0e17d5b2ba9a56
  branch: master
  working_tree_clean: true
  version: 2.28.0
  published: npmjs @xenos1996/usa@2.28.0
  tests: { total: 1448, passed: 1447, skipped: 1 }
  open_prs:
    - number: 205
      title: 'docs: attach SLSA provenance bundle for v2.28.0'
      state: MERGEABLE
      checks: all 13 pass
      blocked_by: code-owner review (bot-authored)
    - number: 208
      title: 'chore(master): release'
      state: MERGEABLE
      checks: all 13 pass
      blocked_by: code-owner review (bot-authored)
      publishes: 2.28.1
  changesets_pending:
    - .changeset/scanner-stderr-reason.md
    - .changeset/local-scanner-bin.md
  last_verified: 2026-10-22T14:00+05:45
  last_verified_by: Sathi (WorkBuddy)
```

**Label legend.** `[FACT]` verified by running it · `[DECISION]` chosen, with
rationale · `[ASSUMPTION]` believed, not proven · `[INFERENCE]` derived ·
`[TODO]` actionable next · `[UNKNOWN]` not determined · `[BLOCKED]` waiting on
something outside the code.

## 1. Scope of this phase

The phase that just closed was **"make the scanner/evidence subsystem honest and
ship it"**. It ran across eleven merged PRs:

| PR   | What                                                                           |
| ---- | ------------------------------------------------------------------------------ |
| #211 | the e2e suite fails when no scanner is installed, instead of passing vacuously |
| #212 | handoff after the vacuous-e2e pass                                             |
| #213 | a scanner installed as the project's own devDependency is found, and preferred |
| #214 | handoff after the local-scanner-bin pass                                       |
| #215 | trivy runs end to end in CI instead of skipping                                |
| #216 | handoff after the trivy-in-CI pass                                             |

`[FACT]` The queue was drained in strict serial order (#201 → #199 → #200 →
#202 → #203 → #204), then the release (#195 → 2.28.0), then the five above.

## 2. Current state and completed work

`[FACT]` `master` = `b7241ec`, working tree clean, no local branches but `master`.

`[FACT]` Version **2.28.0** is published: tarball on npmjs, GitHub release marked
Latest, tag `@xenos1996/usa@2.28.0`, `provenance/v2.28.0` filed by `publish.yml`.

`[FACT]` Gates at close: **1448 tests** (1447 passed, 1 skipped), lint 0 warnings,
`docs:all` clean (44 ADRs, 138 tracked docs), self-audit **100/100, no open
findings**.

`[FACT]` Two changesets are pending, both patch, so the next release is 2.28.1.

`[FACT]` The audit's judgement queue has **zero items marked "never reviewed"**.
Twenty-two reviews are dated 2026-10-22 in `.usa.yaml`, each carrying the
measurement that settled it. Verdicts are unchanged — a review never moves a
score (ADR-0023).

`[FACT]` `usa scan` and `usa intent` are **documented** (#231, `docs/scanners.md`).
The reason they were not is worth knowing: `usa --help` carried an option block
for thirteen commands but not for those two, and the docs governance gate
validates every documented flag against that help — so the flags were
undiscoverable for users _and_ undocumentable for writers. The help now lists
both blocks, which is what made the doc possible.

`[FACT]` The prose-truth docs pass is **done** (#228) and the three issues that
had tracked it across missed cycles (#189, #181, #151) are closed. It found three
real defects: a **broken** composite-action reference (`@v2` never existed —
tags are `@xenos1996/usa@X.Y.Z`), two CI examples on end-of-life `node:20`, and
six links pointing at the pre-migration org. `docs:check` guards facts, links and
version pins; what it cannot see is prose that stopped being true, which is what
the pass covered.

`[FACT]` CI and `.nvmrc` run **Node 24**, not 20. Node 20 left LTS maintenance in
April 2026 and was still pinned in 17 places; the giveaway was that
`release.yml` and `publish.yml` had already moved to 24, so only the test path
was stale. `engines: >=20.0.0` is deliberately unchanged — narrowing a
compatibility promise is the owner's call, not a maintenance fix.

### The invariant the adapters kept getting wrong

Every adapter must distinguish **"ran and found nothing"** from **"analysed
nothing"**. Both produce an empty result list; only the first is a clean scan.
Two of six adapters had a real hole, both found by asking that one question of
every adapter rather than by reading code.

| adapter            | "analysed nothing" signal     | guard                                         |
| ------------------ | ----------------------------- | --------------------------------------------- |
| trivy              | absent `Results`              | yes — its comment is the origin of the rule   |
| codeql             | no `runs`                     | yes, shared SARIF normaliser                  |
| dependency-cruiser | no `modules`; no rules loaded | yes (#203 fixed the rules half)               |
| semgrep            | empty `paths.scanned`         | yes (#204)                                    |
| scorecard          | absent `checks`               | yes; an empty array is unreachable — measured |
| ort                | missing payload               | yes, UNKNOWN by construction                  |

## 3. Architecture and design decisions

`[DECISION]` **Full ADRs live in `docs/adr/`** (45 records) and are indexed in
`state/DECISIONS.md`. Do not duplicate them here. The decisions that shaped this
phase and are _not_ yet ADRs:

- `[DECISION]` **Scanner evidence never moves a score.** ADR-0011: rules consume
  scanner artifacts through the `oracle` check. `usa audit` does not read scanner
  output; only `usa intent` consumes `usa scan --json`. This is why the latent
  SARIF-level bug (#201) could not move a score — it was fixed because it was
  wrong, not because it was live.
- `[DECISION]` **A scanner that ran but analysed nothing is UNKNOWN, never
  clean.** See the table above. The evidence model already had the word; the
  adapters were not using it consistently.
- `[DECISION]` **`state/DASHBOARD.md` union-merges** (`.gitattributes`). It embeds
  a timestamp and the branch's own last-ten-commits, so it differs on every
  branch by construction and textually conflicted on every merge. `merge=ours`
  was tried first and **does not work** — git needs a per-clone
  `[merge "ours"] driver = true`, so a fresh clone still conflicts. Accepted
  cost: the merge commit carries a doubled `Last Reconciled` line, and the
  post-commit hook rewrites the whole file in its auto-commit immediately after.
- `[DECISION]` **A project's own `node_modules/.bin` is searched before PATH.**
  Measured on this repo: global `depcruise` cruised **0 modules**, the local
  devDependency cruised **108**, because only the local one can resolve the
  project's TypeScript. `probe(target?)` takes the target _optionally_ so all
  eleven existing call sites are unaffected.

## 4. Must preserve — do not change

These are load-bearing. Breaking any of them fails a gate or silently corrupts
an audit.

1. `[FACT]` **Never push to `main`.** Branch → PR → merge, in every repo. The
   owner has granted the agent merge authority, so this is now enforced by
   habit rather than by branch protection on `master`.
2. `[FACT]` **A passing test proves nothing until watched failing.** Every guard
   in this phase was mutated and observed failing before being trusted.
3. `[FACT]` **`fixtures/**` must stay excluded from every tool.** It is in
   `eslint.config.mjs` ignores, `.usa.yaml` ignore, **and**
   `.github/codeql-config.yml` `paths-ignore`. CodeQL was the last one added
   (#200) — without it, planting a defect to make the e2e test meaningful fails
   the scan as two new high alerts.
4. `[FACT]` **`fixtures/insecure-app/package-lock.json` is tracked despite the
   gitignore rule** (force-added). Without it the CVE evidence silently
   disappears and the trivy e2e asserts nothing.
5. `[FACT]` **The deny-list in `childEnv` is a security boundary**, not
   hygiene. A scanner child gets `PATH` and `TMPDIR` and nothing carrying a
   credential.
6. `[FACT]` **Do not `--admin` a PR that is blocked on review.** Both open PRs
   are blocked on a code-owner review that exists so bot-authored changes carry
   a human signature.

## 5. Interfaces, schemas, configuration, dependencies

`[FACT]` Runtime: Node v24.22.0, pnpm 10.34.5. Package manager is pinned in
`package.json` (`packageManager`), so **use `pnpm`, never `npm install`** — npm
silently no-ops in this workspace and the dependency never lands.

`[FACT]` The scanner adapter contract, `src/scanner/types.ts`:

```ts
interface ScannerAdapter {
  probe(target?: ScanTarget): AdapterProbe; // target optional; runner passes it
  buildCommand(target, config): ScannerCommand;
  parse(raw, context): Evidence[];
  findings?(evidence): ScannerFinding[];
}
```

`[FACT]` `ScannerCommand` gained staged-tool support: `prepare` (stages that must
succeed first) and `artifacts` (files read back relative to the scan workdir).
`AdapterRun` gained `prepare`, `artifact`, `exitCode`.

`[FACT]` `dependency-cruiser` 18.7.0 is a **devDependency** as of #213 — this is
what makes `usa scan .` read this repo instead of erroring.

`[FACT]` CI installs two scanners in the `test` job: semgrep **1.182.0** (pipx,
offline via the fixture's vendored ruleset) and trivy **0.75.0** (pinned binary,
database deliberately unpinned because the e2e asserts only CVE-_format_).

## 6. Assumptions and uncertainties

`[ASSUMPTION]` The 4 e2e failures seen once (`cli.test.ts`,
`evolution-determinism.test.ts`) were load flake. Evidence: a full re-run was
green and both files pass in isolation. **The cause was not isolated** — do not
repeat this as proven.

`[UNKNOWN]` Whether `scorecard`'s empty-`checks` array is reachable. Three
command shapes were tried (`--checks=` falls back to the full set, a bogus name
errors, an empty directory still returns 11 checks); none produced it. Recorded
as unreachable-in-practice, not proven unreachable.

`[INFERENCE]` Merging #208 will publish 2.28.1 and trigger `publish.yml` to file
`provenance/v2.28.1`. Inferred from the 2.28.0 cycle, not yet observed for 2.28.1.

`[UNKNOWN]` Whether the doubled-`Last Reconciled` line ever survives a merge in
practice. It should be rewritten by the hook's auto-commit, but that has not been
observed on a real merge of two divergent branches since `.gitattributes` landed.

## 7. Verification performed

Every row below was **run**, not expected. `[FACT]` throughout.

| Check              | Command                                             | Result                                                                       |
| ------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Types              | `pnpm run typecheck`                                | 0 errors                                                                     |
| Lint               | `pnpm run lint`                                     | 0 errors, 0 warnings                                                         |
| Format             | `pnpm run format:check`                             | clean                                                                        |
| Docs (6 gates)     | `pnpm run docs:all`                                 | OK — 44 ADRs, 138 tracked docs, cli.md + sample-report.md in sync            |
| Tests              | `pnpm test`                                         | 1447 passed, 1 skipped (1448)                                                |
| Self-audit         | `pnpm run self-audit`                               | **100/100**, no open findings                                                |
| Build              | `pnpm run build`                                    | 0 errors                                                                     |
| Published artifact | `npm pack` → clean install → `usa --version`        | 2.28.0 runs                                                                  |
| Packaged fixes     | `usa scan` on both defect projects from the tarball | depcruise `--config` row present; semgrep "scanned no files" UNKNOWN present |

`[FACT]` Guards were watched failing before being trusted, individually: the
e2e vacuous-pass counter, the depcruise `--config` argv assertion, the semgrep
`paths.scanned` guard, and the local-bin probe. Each was neutered, observed
failing, restored, and re-run green.

## 8. Known issues and limitations

`[FACT]` Live state is in `state/BLOCKERS.md` — it currently reads _"None"_. What
follows is not a blocker but is a real limitation.

- `[FACT]` **Two PRs are blocked on you.** #205 and #208 are MERGEABLE with all
  13 checks passing, and blocked only by the code-owner review rule (both
  authored by `app/github-actions`, `CODEOWNERS` = `* @Er-Sajan-PLG`). This gate
  is working as designed.
- `[FACT]` **`gh pr checks --watch` is not a status source.** It died on a
  network error twice while the checks had actually completed, and once showed
  `fail` for checks that were `cancelled` by concurrency. Always re-read
  `gh pr view --json mergeStateStatus`.

## 9. Technical debt

`[FACT]` Tracked in `state/DEBT.md`. Items added or sharpened this phase:

- `[TODO]` CodeQL's `security-severity` is dropped by the normaliser. **Latent,
  not live**: no shipped rule uses `source: sarif`, so no score moves. Carrying
  it would be plumbing for a path nothing uses — do not add it speculatively.
- `[TODO]` `provenance/v2.28.0` (#205) is unfiled. Bot-authored, needs a human
  approval.

## 10. Deferred work, and why

| Item                                       | Status      | Why deferred                                                                                                                                                                     |
| ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native docker support for ORT/CodeQL       | `[BLOCKED]` | A security decision, not plumbing — the auditor would spawn docker. The handoff's own instruction is _do not slip it in_.                                                        |
| A `.dependency-cruiser.json` for this repo | `[TODO]`    | Writing rules is choosing the architecture, not fixing a bug. Today `usa scan .` honestly says "a graph, not a verdict".                                                         |
| depcruise's default target `src`           | `[TODO]`    | Changing it to `.` changes what every depcruise run scans — a design decision.                                                                                                   |
| Requirement/Control consumption            | `[TODO]`    | `docs/architecture/finding-model.md` defines them as declared inputs; nothing reads them. The intent model (`src/intent/`) is the pattern to copy. This is a feature, not a fix. |
| codeql / ort / scorecard e2e in CI         | `[TODO]`    | 700 MB bundle, docker, platform token. They skip loudly, which is honest.                                                                                                        |

## 11. Artifact map

| Path                                | Role                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `state/CONTINUATION.md`             | **this file** — canonical handoff                                                            |
| `state/DASHBOARD.md`                | generated; reconciliation timestamp + last 10 commits                                        |
| `state/REGISTRY.md`                 | active agents (MACP)                                                                         |
| `state/sessions/`                   | per-session records, `YYYYMMDD-HHMM-<ID>-<slug>.md`                                          |
| `state/DECISIONS.md`                | ADR index; source of truth is `docs/adr/` (45 records)                                       |
| `state/DEBT.md`                     | technical debt                                                                               |
| `state/BLOCKERS.md`                 | active blockers                                                                              |
| `src/scanner/`                      | adapter layer: `types.ts`, `run.ts`, `sarif.ts`, `registry.ts`, `config.ts`, `adapters/` (6) |
| `src/engine/evaluate.ts`            | verdict engine; SARIF filter (ADR-0011 ingest)                                               |
| `src/intent/`                       | OTM → evidence join on CWE                                                                   |
| `tests/unit/scanner-runner.test.ts` | artifact / prepare / exit-code contract                                                      |
| `tests/e2e/scan.test.ts`            | real-tool e2e; the `ran`/`verdicts` counters live here                                       |
| `.changeset/*.md`                   | two pending, both patch                                                                      |
| `.gitattributes`                    | `state/DASHBOARD.md merge=union`                                                             |
| `.github/codeql-config.yml`         | `paths-ignore: examples/demo-app, fixtures/**`                                               |

## 12. Prerequisites for continuing

`[FACT]` Node v24.22.0, pnpm 10.34.5, `gh` authenticated as `Er-Sajan-PLG`.
`[FACT]` Locally useful but not required: trivy 0.75.0, semgrep 1.182.0,
dependency-cruiser 18.7.0 (now a devDependency, so `pnpm install` provides it).
`[FACT]` codeql, ort and scorecard are **not** available here — `/tmp` is
ephemeral, so re-download if a task needs them.

`[FACT]` **2.28.1 is published.** npm `latest`, tag `@xenos1996/usa@2.28.1`,
installed from the registry and verified: all three fixes present, audit runs.
The publish workflow filed **#233** (`provenance/v2.28.1`).

`[FACT]` **#205 is MERGEABLE again.** It had been carrying a truncated
`docs/reference/cli.md` — the resync job committed one generated from the
truncated output — which would have deleted seven rule packs on merge. Restored
from master, and the hook-generated session file that made it `CONFLICTING` was
aligned to master's copy.

`[FACT]` Open PRs, all owner-signature only: **#205** (provenance 2.28.0),
**#233** (provenance 2.28.1), **#235** (hook bot-branch guard + generator
pack-count guard + the `process.exit` truncation fix).

## 13. Next steps

Ordered. **Step 1 is a health check, not a feature.**

1. `[TODO]` Run `pnpm test && pnpm run docs:all && pnpm run self-audit`. If
   anything is red, stop and fix it before reading further.
2. `[BLOCKED]` Approve and merge **#205** (`provenance/v2.28.0`, SLSA bundle +
   VSA). Two JSON files, all checks green. This is yours to sign — the gate
   exists so bot-authored changes carry a human signature.
3. `[BLOCKED]` Approve the workflow runs for **#208**'s _current head only_, then
   merge it. This publishes **2.28.1** to npmjs and is irreversible. Merging
   also fires `publish.yml`, which files `provenance/v2.28.1` — approve that
   when it appears, same rule.

   `[FACT]` **The release branch was verified before you are asked to sign it**,
   in a scratch worktree, so the merge is not a leap of faith:

   | check                                      | result                                                            |
   | ------------------------------------------ | ----------------------------------------------------------------- |
   | builds on the release branch               | 0 type errors                                                     |
   | `usa --version` from the built CLI         | `2.28.1`                                                          |
   | self-audit on the release tree             | **100/100**, no open findings                                     |
   | `npm pack`                                 | `xenos1996-usa-2.28.1.tgz`                                        |
   | clean install of that tarball              | `usa 2.28.1` runs                                                 |
   | both pending fixes present in the artifact | semgrep "scanned no files" guard, depcruise `node_modules` search |
   | `CHANGELOG.md`                             | 2.28.1 section carries #213 and #207                              |

   None of this substitutes for your review — it only means the build, the
   version bump and the two changesets are known-good.

4. `[TODO]` **Confirm the npm Trusted Publisher org.** `docs/release.md` says
   `Er-Sajan-PLG`, but the canonical repo is `STEMORG2026` after the migration.
   Publishing works, so npm is resolving the rename — but the doc may be
   describing a setting that no longer matches. Only the owner can check
   npmjs.com → Package → Settings → Trusted Publisher.

5. `[TODO]` Only then pick from §10. Nothing there is urgent; #208 is the only
   item with an external consequence.

## 14. Completion criteria

The phase is complete when: `master` is clean and green on all gates in §7;
2.28.1 is published with its provenance branch filed; `state/CONTINUATION.md`
matches reality; and no PR is open that the agent could have closed.

`[FACT]` As of this handoff, the first criterion is met. The second and third are
blocked on the owner's signature by design.

## 15. Runbook

```bash
# Health check
pnpm test && pnpm run docs:all && pnpm run self-audit

# Before any PR
pnpm run typecheck && pnpm run lint && pnpm run format:check
pnpm run docs:all            # 6 gates
pnpm test                    # 1448 tests
pnpm run build && node dist/cli.js audit . --out AUDIT.md   # must be 100/100

# Merging a queue of PRs — strictly serial, never batched
gh pr merge <n> --squash --delete-branch
git checkout master && git pull --ff-only
git checkout <n+1-branch> && git merge origin/master   # resolve state/ files with --theirs
git push

# Un-blocking a changesets release PR
gh run list --branch changeset-release/master --json databaseId,headSha,conclusion \
  --jq '.[] | select(.conclusion=="action_required") | .databaseId'
gh api -X POST repos/STEMORG2026/universal-software-auditor/actions/runs/<id>/approve
```

`[FACT]` Approving **all** quarantined runs at once is a mistake: stale runs'
concurrency groups cancel the current head's, and `gh pr checks` then shows
`fail` for checks that were `cancelled`. Approve only the current head's, or
`gh run rerun <id>` on it.

## 16. Open questions

1. `[UNKNOWN]` Do you want a `.dependency-cruiser.json` for this repo, and if so
   what architecture rules? Until then `usa scan .` says "a graph, not a
   verdict", which is correct but uninformative.
2. `[UNKNOWN]` Should `probe()` keep the optional target, or should it become
   required and the eleven call sites be updated? Optional was chosen to avoid
   churn; a contract change is cleaner long-term.
3. `[UNKNOWN]` Is `state/DASHBOARD.md` worth tracking at all? It is read by MACP
   startup for staleness, so gitignoring it breaks the protocol — but generating
   it at read time would end the conflict entirely.

---

# Appendix A — Traps discovered. Do not re-learn these.

`[FACT]` Every row was measured the hard way.

| Trap                                  | Reality                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pull_request: branches: [master]`    | A **stacked PR got zero CI** and looked green. Removed in #197; do not narrow it again.                                                                                                                                                                                                                                                                                                                                  |
| Deleting a base branch                | `gh pr merge <n> --delete-branch` **closes every PR stacked on that branch**. Recreate the branch at its commit, reopen, retarget, then delete.                                                                                                                                                                                                                                                                          |
| Merging a queue of PRs                | Must be **serial**: merge → fold the new `master` into the next branch → merge. Updating all branches first guarantees the second one conflicts.                                                                                                                                                                                                                                                                         |
| `state/DASHBOARD.md` in any merge     | Used to conflict on every merge. Now `merge=union`; the merge commit carries a doubled `Last Reconciled` line and the hook rewrites the whole file in its auto-commit.                                                                                                                                                                                                                                                   |
| The post-commit state hook            | Leaves files **staged but uncommitted** after a merge commit. `git status` will show them; commit them before pushing.                                                                                                                                                                                                                                                                                                   |
| `git reset --hard` during cleanup     | Silently discards uncommitted edits, with no warning. Stage and commit _before_ cleaning up branches.                                                                                                                                                                                                                                                                                                                    |
| changesets release branch             | Its workflow runs land in `action_required`. Approving **all** of them cancels the current head's via concurrency, and `gh pr checks` then shows `fail` for checks that were `cancelled`. Approve only the current head.                                                                                                                                                                                                 |
| npmjs metadata after a publish        | The packument and `/pkg/version` can 404 for minutes **after** the tarball URL already serves 200. Read the tarball's `package.json`, not the metadata.                                                                                                                                                                                                                                                                  |
| `npm view` on this machine            | Useless: `~/.npmrc` maps `@xenos1996` to npm.pkg.github.com, and a scoped mapping beats `--registry`, so every `npm view` 401s. Use `curl https://registry.npmjs.org/@xenos1996%2fusa`.                                                                                                                                                                                                                                  |
| `npm install` in this repo            | **Silently no-ops.** It is a pnpm workspace; use `pnpm add -D <pkg>`.                                                                                                                                                                                                                                                                                                                                                    |
| `docker run` in this sandbox          | Fails with "failed to create endpoint … operation not supported" on bridge networking. `--network none` and `--network host` both work; **host is what makes a real `ort analyze` possible**.                                                                                                                                                                                                                            |
| `pip install semgrep`                 | Needs `--break-system-packages` (PEP 668). Lands in `~/.local/bin`.                                                                                                                                                                                                                                                                                                                                                      |
| commitlint                            | Rejects a **sentence-case subject** (`subject-case`). `feat(scanner): tier 2 …` fails; lowercase it.                                                                                                                                                                                                                                                                                                                     |
| `package-lock.json` in fixtures       | Gitignored — needs `git add -f` or the CVE evidence silently disappears.                                                                                                                                                                                                                                                                                                                                                 |
| `fixtures/**`                         | Planted defects. Must stay in `eslint.config.mjs` ignores, `.usa.yaml` ignore **and** `.github/codeql-config.yml` `paths-ignore`.                                                                                                                                                                                                                                                                                        |
| Scanner e2e tests                     | External processes are not unit-test speed; they declare their own `timeout` (15s default flakes under load).                                                                                                                                                                                                                                                                                                            |
| `--scanner` flag                      | Was parsed and ignored in Tier 1 — fixed in #196. Verify it still filters.                                                                                                                                                                                                                                                                                                                                               |
| `ort --rules-resource`                | Needs a **leading slash** (`/rules/osadl.rules.kts`). The bare form resolves against the command's jar and dies with a `NullPointerException`.                                                                                                                                                                                                                                                                           |
| `ort evaluate` exit status            | Non-zero when it finds violations — a run that succeeded and objected. Never read it as failure.                                                                                                                                                                                                                                                                                                                         |
| `ort --version`                       | Prints JVM warnings first, one naming `jna-5.19.1.jar`. A loose regex reports **5.19.1** as the ORT version. Only a line that _is_ a version counts.                                                                                                                                                                                                                                                                     |
| `codeql database analyze`             | The query specifier is **positional**: an empty string is one empty specifier, and the run dies with `Invalid package specification:` and writes no SARIF. Omit the argument instead.                                                                                                                                                                                                                                    |
| `codeql` SARIF                        | Omits `result.level` on every result; the level is in `defaultConfiguration.level` (SARIF 3.27.10). Reading only `result.level` makes every finding INFO.                                                                                                                                                                                                                                                                |
| `codeql --version`                    | Prints `… release 2.27.3.` — `[\d.]+` records the full stop.                                                                                                                                                                                                                                                                                                                                                             |
| A file-writing scanner's fixture test | Proves the parser and nothing about the wiring. If the tool writes a file, the test must go through the runner.                                                                                                                                                                                                                                                                                                          |
| `docs:all` "cli.md is stale"          | **Root-caused**: `usa rules` emits ~32 KB and the CLI ended with `process.exit()`, which truncates piped stdout — so in CI it arrived at ~25 KB, losing the last 7 rule packs and the summary line. Fixed by setting `process.exitCode` instead (#235). The generator now also refuses to write a document whose pack count disagrees with `rules/index.yaml`. If it reappears, the message says which of the two it is. |
| `docs:all` doc-manifest gate          | Rejects an untracked new doc. `git add -A` before running.                                                                                                                                                                                                                                                                                                                                                               |
| `gh pr checks --watch`                | Not a status source. It dies on network errors while checks complete, and reports cancelled runs as `fail`. Re-read `gh pr view --json mergeStateStatus`.                                                                                                                                                                                                                                                                |

# Appendix B — Local tooling used for verification (not committed)

`[FACT]` Scorecard and CodeQL live in `/tmp`, which is **ephemeral** — re-download
from `ossf/scorecard` and `github/codeql-action` releases if a task needs them.

| Tool               | Version | Where                                         |
| ------------------ | ------- | --------------------------------------------- |
| trivy              | 0.75.0  | system                                        |
| semgrep            | 1.182.0 | `~/.local/bin` (pip `--user`)                 |
| dependency-cruiser | 18.7.0  | devDependency (`node_modules/.bin`)           |
| scorecard          | 5.6.0   | `/tmp` — ephemeral                            |
| ort                | 97.0.0  | docker image `ghcr.io/oss-review-toolkit/ort` |
| codeql             | 2.27.3  | `/tmp` — ephemeral, 700 MB bundle             |

The ORT run used an `ort` shim on PATH:

```sh
#!/bin/sh
exec docker run --rm --network host -u "$(id -u):$(id -g)" \
  -v "$PWD:$PWD" -w "$PWD" ghcr.io/oss-review-toolkit/ort:latest "$@"
```
