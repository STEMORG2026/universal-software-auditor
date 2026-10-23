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

**The dispatch called for in the previous handoff ran, and the step failed a
third time — for a third reason of the same shape.** Run 39943859454 on
`ab19ef7` died at `File provenance bundle + VSA` with

```
no provenance for 71e5278cc8d6… built from undefined (saw 3)
```

Three attestations were returned for that digest and one was built from
`refs/tags/@xenos1996/usa@2.28.3`. `EXPECTED_REF="…"` was a shell assignment,
not an environment entry, so `node -e` read `undefined`. Fixed in **#246**.

**#244 was merged before #246, and it failed exactly as predicted.** 2.28.4 is
on npmjs; `publish.yml` run `39949269341` died at the provenance step with

```
no provenance for 5e24c5200386ee6a8af527efd8b60cb9e6532b34ac8eee304135298742962378 built from undefined (saw 1)
```

`built from undefined` is #246's bug. One attestation existed and was skipped.
So **2.28.4 shipped without a filed provenance bundle**, and so did 2.28.3:
`provenance/` stops at 2.28.2.

**What the dispatch can and cannot recover — measured, not reasoned.**
Decoding the 2.28.4 attestation's DSSE payload shows the statement records
`workflow.ref = refs/tags/@xenos1996/usa@2.28.4`, which is exactly the string
the selector compares against. The dispatch therefore does **not** need to run
on the tag; it needs to repack the same bytes, because the tarball is packed
from the working tree and looked up by digest.

That is the part that is easy to get wrong in both directions. A local
`npm pack` of this tree gives `cb6c50db…`, not `5e24c520…` — the tarball is
**not** reproducible across environments, so a laptop cannot stand in for a
runner. Across GitHub runners it is: 2.28.3's digest carries three
attestations, two from `refs/heads/master` and one from the tag, all on the
same `71e5278cc8d6…`.

**That was then confirmed on 2.28.4, by running it.** #246 merged as `f1a0ebe`;
`publish.yml` was dispatched on master (run `39956868762`) and it printed

```
TARBALL_SHA256: 5e24c5200386ee6a8af527efd8b60cb9e6532b34ac8eee304135298742962378
selected provenance for refs/tags/@xenos1996/usa@2.28.4 (1 match)
```

The runner repacked to the identical byte, and #246's selector worked on real
data. The digest now carries two attestations — `refs/heads/master` and the tag
— the same shape 2.28.3 has. Both publish legs skipped (`already on npmjs`,
`already on GPR`), so the dispatch published nothing.

**It then failed one line later, on a fifth defect:**

```
line 125: cosign: command not found
exit 127
```

`publish.yml` calls `cosign verify-blob-attestation` and never installed cosign.
Four earlier runs died at the selector, one line above the call, so the missing
tool was never reached. **The step was two defects deep, not one** — which is
why "fix the export and it will work" was never a safe prediction. Fixed in
**#250** (`sigstore/cosign-installer`, pinned), with three tests pinning that
the tool is installed, pinned, and installed _before_ the step that calls it.

**Merge order now: #250 first, then #247, #245, #248.** #245 and #248 both touch
`state/` and conflict on `state/sessions/20261022-1410-SA09-handoff-protocol.md`
(hook-appended commit-log noise) — take #248's **sealed** copy, never a union:
the seal is checked against the commit that sealed it, so injecting master's log
line would break it.

**#249 is the changesets bot's Version Packages PR for 2.28.5**, opened within
minutes of #246 landing, and its only changeset is #246's. For two dispatches it
was a trap: merging it would have published 2.28.5 through a workflow that had
just failed, shipping another bundle-less release.

**That trap is now disarmed.** The dispatch succeeded (#252 filed the 2.28.4
bundle), so merging #249 would publish 2.28.5 through a working provenance step.
Merge #252 first so `provenance/` is complete for 2.28.4 before 2.28.5 exists,
then #249 is ordinary. Keep the ordering anyway: #249 should never go ahead of a
filed bundle for the version it supersedes.

**After #250 is on master: re-dispatch `publish.yml` on master.** That run
should file `provenance/v2.28.4` and open its own PR. Then
`node scripts/check-provenance.mjs 2.28.4` — rehearsed against the live
attestation already, three PASS and one NOTE. Do **not** dispatch on a feature
branch: the step skips when the branch `provenance/v2.28.4` already exists, so a
branch run would file that version's bundle permanently from the wrong place.

**2.28.3 is now unfilable by this route**, because the version selector reads
`package.json` and master has moved to 2.28.4. Recovering it would mean a
branch cut from the 2.28.3 tag carrying only the workflow fix — a deliberate,
separate decision, not a side effect of the 2.28.4 backfill. The honest default
is to leave it unfiled and say so.

## The provenance chain does not verify (found 2026-10-22, fixed in #240)

The rule this repo keeps re-learning, in a new place: **a claim nobody reads
back is not verified, it is merely written down.** Nothing had ever read a
filed bundle.

| #   | defect                                                       | measured evidence                                                                                                                                                                                            |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Every VSA names `release.yml` as verifier **and** policy     | `verifier.id` + `policy.uri` in all four filed pairs; the workflow that verifies is `publish.yml`                                                                                                            |
| 2   | `inputAttestations[].digest` = sha256 of the bundle **file** | one 2.28.1 attestation: 12284 B via `gh attestation download`, 11751 B via REST — no canonical serialisation exists                                                                                          |
| 3   | The VSA's tarball digest is **not** the published tarball    | 2.28.2: attested `ffc84fd7…`, published `10274573…`. npm adds `attestations` to `package.json`, the archive's first entry, so the gzip diverges at byte 0. 445 entries compared; only `package.json` differs |
| 4   | `gh attestation verify <tarball>` can never pass             | subject name is read from a ZIP manifest = 44 bytes of garbage at offset 30                                                                                                                                  |

`[DECISION]` **Do not claim the published tarball is attested.** It is not, and
never was. For the bytes a user installs the evidence is the registry's own
signature (`npm audit signatures`); the SLSA statement covers the publish run's
own `npm pack` output. `docs/release.md` § "What the attestation covers" now
states both digests side by side.

`[FACT]` #240 adds `scripts/check-provenance.mjs <version>`, which reads a
filed pair back, and `tests/unit/provenance-chain.test.ts`, which pins each
defect as a test. Each guard was mutated and observed failing, then restored
byte-identical.

`[TODO]` **Watch the first release after #240 merges.** `subject-name` and the
download-by-digest path run for the first time; if `provenance/v2.28.3` is not
filed, that step is where to look. The workflow now verifies via `cosign` over
the DSSE payload, not `gh attestation verify <file>`.

### The step failed twice more, for reasons that were knowledge, not code

`[FACT]` Both failures below were reproduced by hand before being edited, and
both were defects I had introduced in #240/#242.

| run                              | failure                                                                                                  | cause                                                                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 39806243386 (2.28.3 tag push)    | `unknown flag: --output`; `TARBALL_SHA256` empty                                                         | `gh attestation download` has no `--output`; `$GITHUB_ENV` is visible only to _later_ steps, so the writing step hashed `''`                                                                                       |
| 39816129742 (dispatch on master) | `failed to open local artifact: open usa-release-2.28.3.tgz@sha256:71e5278c…: no such file or directory` | `gh attestation download`'s positional argument is a **file path**. `name@sha256:<digest>` is not an addressing form it has                                                                                        |
| 39943859454 (dispatch on master) | `no provenance for 71e5278c… built from undefined (saw 3)`                                               | `EXPECTED_REF` was assigned without `export`, so `node -e` read `undefined`; fixed in #246                                                                                                                         |
| 39956868762 (dispatch on master) | `cosign: command not found`, exit 127 — **after** `selected provenance … (1 match)`                      | Nothing installed cosign. Four earlier runs died at the selector, one line above the call, so the missing tool was never reached; fixed in #250                                                                    |
| 39963116205 (dispatch on master) | HTTP 22 on `.../v3.1.3/cosign-linux-amd64.sig`, exit 22                                                  | cosign v3 publishes `.sigstore.json` bundles, **not** the legacy `.sig` that `cosign-installer` verifies against — no installer version can fetch a v3 (newest is v4.1.2, which predates cosign v3); fixed in #251 |

`[FACT]` The last two rows are the ones that matter for prediction. #246 was
correct and necessary and **not sufficient**: fixing it moved the failure one
line down and revealed a second, independent defect that had been invisible
behind the first. "Fix the known bug and it will work" was never safe here, and
the dispatch is what proved it.

`[FACT]` Then #250 repeated the pattern in a subtler direction, and this is the
one to remember: its flags were verified against **cosign v3.1.3**, which is what
happens to be installed on this machine — and cosign v3 cannot be installed by
`cosign-installer` at all. A locally-verified version is not necessarily an
installable version. **A pinned action is not a pinned tool, and neither is a
tool you happened to have.** Two of the six failures came from measuring the
wrong thing; #251 now pins `v2.6.5`, whose flags were checked on the real binary
and whose install path was confirmed against the release's assets.

`[FACT]` The third failure was reproduced and fixed **locally, against the live
API response**, before the workflow was edited: the same snippet exits 1 with
`built from undefined (saw 3)` when the variable is unexported and 0 with
`selected provenance for refs/tags/@xenos1996/usa@2.28.3 (1 match)` when it is
exported. `cosign verify-blob-attestation --digest 71e5278c…` over the selected
bundle returns `Verified OK`. `make-vsa.mjs` then built a VSA from it and
`check-provenance.mjs 2.28.3` returned three PASS and one NOTE (exit 0) — so
every part of the step downstream of selection was exercised without spending
a release.

`[FACT]` `cosign verify-blob-attestation` was also being handed the DSSE
payload as its blob. With the default `--check-claims=true` it hashes that file
and requires the digest to equal the statement's subject, so it could never
pass: measured, exit 1, `provided artifact digests do not match digests in
statement`. `--digest <sha256> --digestAlg sha256` names the subject directly
and returns `Verified OK`.

`[DECISION]` Fetch the attestation from
`repos/{owner}/{repo}/attestations/sha256:<digest>` and select the statement
whose `workflow.ref` is the release tag. The API returns **three** provenances
for 2.28.3 — one from the tag push, two from master dispatches, each dispatch
adding one — and `-L 1` returned whichever the server listed first. Selection
is by ref and then by payload bytes, so it does not depend on API ordering.

`[FACT]` `tests/unit/publish-workflow.test.ts` pins all four constraints
against the workflow source. Each was watched failing by reintroducing the
defect, then the file was restored and confirmed byte-identical (`4e0893cb…`).

## CHECKPOINT

```yaml
checkpoint:
  repository: STEMORG2026/universal-software-auditor
  canonical_handoff: state/CONTINUATION.md
  code_commit_sha: dcb24c3 # master; #246, #250, #251 all merged
  handoff_commit_sha: c9e919c # the checkpoint rewrite; a commit cannot name itself
  branch: docs/continuation-post-243
  working_tree_clean: true
  version: 2.28.4 # master; published without a provenance bundle
  published: npmjs @xenos1996/usa@2.28.4
  provenance: { latest_filed: '2.28.4 (in #252, unmerged)', missing: [2.28.3] }
  provenance_dispatch: '39968402220 SUCCESS — filed provenance/v2.28.4 as PR #252; check-provenance 2.28.4 = 3 PASS + 1 NOTE'
  tests: { total: 1471, passed: 1470, skipped: 1 } # on this branch, after merging #246
  gates: { lint: clean, typecheck: clean, format: clean, docs_all: OK, self_audit: '100/100' }
  open_prs:
    - number: 252
      title: 'docs: attach SLSA provenance bundle for v2.28.4'
      state: BLOCKED # bot branch, no checks; needs your approval
    - number: 249
      title: 'chore(master): release' # changesets bot; would publish 2.28.5
      state: BLOCKED # DO NOT merge before #251 — it would publish another bundle-less release
    - number: 247
      title: 'ci: read the filed provenance bundles back on a schedule'
      state: CLEAN
    - number: 245
      title: 'docs(state): hand off …'
      state: CLEAN # this file
    - number: 248
      title: 'docs(macp): sessions are opened and sealed by the owner'
      state: CLEAN # merge last; take its SEALED SA09 on any further conflict
  merged_this_phase: [244, 246, 250, 251] # 244 out of order; it published 2.28.4 and broke its provenance step
  open_findings: 0
  last_verified: 2026-10-23T19:05+05:45
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

| Check          | Command                                | Result                                                                                                    |
| -------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Types          | `pnpm run typecheck`                   | 0 errors                                                                                                  |
| Lint           | `pnpm run lint`                        | 0 errors, 0 warnings                                                                                      |
| Format         | `pnpm run format:check`                | clean                                                                                                     |
| Docs (6 gates) | `pnpm run docs:all`                    | OK — <!-- usa:fact adrs -->44<!-- /usa:fact --> ADRs, 138 tracked docs, cli.md + sample-report.md in sync |
| Tests          | `npx vitest run`                       | 1466 passed, 1 skipped (1467) on this branch — 1470 once #246 (+1) and #247 (+3) merge                    |
| Self-audit     | `pnpm run self-audit`                  | **100/100**, no open findings                                                                             |
| Action pins    | `node scripts/pin-actions.mjs --check` | all pinned to commit SHAs                                                                                 |

`[FACT]` On this machine `pnpm test` aborts before running: the harness's
safe-delete guard counts 63 files in one `_tmp_*` directory against a
per-turn threshold of 50. `npx vitest run` runs the same suite and is what the
number above came from.

`[FACT]` Guards were watched failing before being trusted, individually: the
e2e vacuous-pass counter, the depcruise `--config` argv assertion, the semgrep
`paths.scanned` guard, and the local-bin probe. Each was neutered, observed
failing, restored, and re-run green.

### The provenance step, rehearsed off-CI

The step has failed three times, so each stage was exercised against the live
API response for `sha256:71e5278c…` (2.28.3) rather than waited for:

| Stage                | How                                                            | Result                                                                                                                             |
| -------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| select the statement | the workflow's own `node -e`, unexported then exported         | exit 1 `built from undefined (saw 3)` → exit 0 `selected provenance for refs/tags/@xenos1996/usa@2.28.3 (1 match)`                 |
| verify the signature | `cosign verify-blob-attestation --digest … --digestAlg sha256` | `Verified OK`; a wrong `--digest` exits 1                                                                                          |
| assert subject + ref | the block extracted verbatim from `publish.yml`                | `verified: tarball 71e5278c… was built from the release tag`; a wrong digest exits 1 `statement subject … != tarball …`            |
| format, then digest  | `prettier --write` on the bundle, then `make-vsa.mjs`          | 12220 → 12506 B, file digest `4890e6db…` → `ef0adadb…`; the VSA must use the **post-format** digest, which is the workflow's order |
| read the pair back   | `check-provenance.mjs 2.28.3` on the rehearsed pair            | 3 PASS + 1 NOTE, exit 0                                                                                                            |

`[UNVERIFIED]` **Not** exercised: `git checkout -b provenance/vX`, the `git
push`, and `gh pr create`. Those four lines are the only part of the step that
has never run, and they cannot be rehearsed without filing a real bundle.

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
- `[FIXED]` ~~`provenance/v2.28.0` (#205) is unfiled.~~ It is filed: `v2.28.0.sigstore.json`
  (12224 B) and `v2.28.0.vsa.json` (1355 B) both landed in `e3099d0`, PR #205's own commit.
  The live gap is **2.28.3 and 2.28.4**, not 2.28.0.

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

`[FACT]` Open PRs, all owner-signature only and **all 13 checks green**:

| PR       | What                         | State                                                                                                                                              |
| -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#205** | provenance bundle for 2.28.0 | MERGEABLE — the truncated `cli.md` it carried was restored from master, and its state files were aligned, so it now carries only its two artefacts |
| **#233** | provenance bundle for 2.28.1 | MERGEABLE                                                                                                                                          |
| **#236** | release **2.28.2**           | MERGEABLE — carries #235's truncation fix; merging publishes                                                                                       |

Merge order: #205, #233, then #236 (which publishes).

## 13. Next steps

Ordered. Step 1 already ran green on this tree.

1. `[DONE]` **#246 merged** as `f1a0ebe`. The export fix is on master.
2. `[DONE]` **`publish.yml` dispatched on master** — run `39956868762`. The
   selector worked: `selected provenance for refs/tags/@xenos1996/usa@2.28.4
(1 match)`, and the runner repacked to the same digest `5e24c520…`. It then
   died with `cosign: command not found`.
3. `[DONE]` **#250 merged** — cosign installed, action pinned and version
   pinned. **Re-dispatched** (run `39963116205`) and it failed _installing_
   cosign: HTTP 22 on `…/v3.1.3/cosign-linux-amd64.sig`, because cosign v3 does
   not publish that asset and no installer can fetch a v3. Fixed in **#251**
   (`cosign-release: v2.6.5`, flags checked on the real binary).
4. `[DONE]` **#251 merged** (`dcb24c3`), `publish.yml` re-dispatched as run
   `39968402220` → **`conclusion: success`**. Six failures, then it worked. See
   step 5 for what it produced.
5. `[DONE]` **The backfill worked.** #251 merged; `publish.yml` dispatched (run
   `39968402220`) → `conclusion: success`. It filed **`provenance/v2.28.4`** and
   opened **PR #252** (`docs: attach SLSA provenance bundle for v2.28.4`).
   Read back with `node scripts/check-provenance.mjs 2.28.4` on the branch's own
   files:

   ```
   PASS  registry integrity (sha512 of the served tarball) — tarball sha256 55db0933ef97baaf…
   PASS  bundle signature over its own statement
   PASS  VSA fields
   NOTE  the attested subject (5e24c5200386ee6a…) is not any published tarball
   exit 0
   ```

   Exactly the three PASS and one NOTE this handoff had only ever promised. The
   attestation covers the _release_ tarball, not the published one — see
   `docs/release.md`, "What the attestation covers". For 2.25.x–2.28.2 it reports
   3 findings per version; those records are historical and are deliberately left
   as filed.

6. `[BLOCKED]` **Merge #252** — it has no checks (bot branch) and is waiting on
   your approval. After it lands, `provenance/` covers every release except
   **2.28.3**.
   The rehearsal also found that `checkVsa` required the subject name to be
   `xenos1996-usa-<version>.tgz` while the workflow attests
   `usa-release-X.Y.Z.tgz`, so the backfill would have filed a bundle the weekly
   job rejects. Fixed in #247, which is now the PR that makes step 5 pass.
   5b. `[OPEN]` **2.28.3 has no bundle and this route cannot produce one.**
   Recovering it needs a branch cut from the 2.28.3 tag carrying only #246's
   workflow change. Decide separately; do not let it ride on step 4.
7. `[TODO]` Consider wiring `check-provenance.mjs` into `self-audit.yml` on
   `schedule` only. Not done in #240 on purpose: it needs npm and the
   attestation API, and a network check on every PR is a check people learn to
   ignore.
8. `[BLOCKED]` **#247 is that wiring, as its own workflow** — merge it whenever;
   it does not interact with the release order above. Its first real run is the
   one after it lands, because GitHub refuses to dispatch a workflow that is not
   on the default branch (`HTTP 404 … not found on the default branch`,
   measured). **Watch that first run**: the loop was measured locally in both
   directions, but the checkout / setup-node / cosign-installer plumbing around
   it has never executed.
9. `[TODO]` Otherwise pick from §10. The one with an external consequence is
   the npm Trusted Publisher org confirmation (`docs/release.md` says
   `STEMORG2026`; only you can check the package page).

`[DECISION]` The step is still **unverified in CI** as of this handoff. The
logic was proven locally against the live API response, but no run of
`publish.yml` has reached the PR-creating tail of the step. Say so until one
has; three handoffs have now claimed this step was fixed and it was not.

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
