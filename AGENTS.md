# AGENTS.md — working in this repository

> This file is the operating manual for agents (and humans) doing work in
> USA itself. It is long on purpose: everything here was learned the hard
> way, and re-learning it costs sessions. Read it fully before your first
> change. Normative statements ("must", "never") are gates, not advice.

## What this repository is

USA (Universal Software Auditor) is a TypeScript CLI (`usa`) that audits
any project and writes a graded Markdown report. It ships as the npm
package `@xenos1996/usa` plus a GitHub composite action. The defining
habit: **the tool audits itself** — every PR runs USA on its own tree,
and the gates below enforce what it preaches. If a change would fail
`usa audit .`, it does not merge.

Key facts: Node with strict TypeScript, vitest suites, ESLint + Prettier,
**pnpm workspace** (one package), **changesets** releases (author states the
bump, the tool obeys),
Conventional Commits (they feed the CHANGELOG). The engine
(`src/engine/`) evaluates data-driven rule packs (`rules/`); the CLI
(`src/cli.ts`) is a thin driver over it.

## The Loop (make-or-break — follow it for every change)

0. **Prove the diagnosis before writing the fix.** This is step zero and it
   is not a formality — skipping it has cost this repo real releases.
   A plausible mechanism is not a verified one. Concretely:
   - **Read the code that decides the behaviour**, not the docs about it.
     "X is probably caused by Y" is a hypothesis; find the line of Y that
     does it, and quote it.
   - **Reproduce the mechanism directly** — a one-liner that prints the
     actual value, or a failing test. If you cannot demonstrate the cause
     in isolation, you do not know it yet.
   - **Trace the blast radius**: what else reads this, what fires from it,
     what silently _stops_ firing. The dangerous failures here are the ones
     that stay green (see the two case studies below).
   - **State the consequence before you change it.** If the fix is wrong,
     what breaks, and would anything notice?
     Then, and only then, patch.

   Three worked examples, all real, all in this repo's history:
   - _"Removing `packages/*` will make changesets tag `v*`."_ Plausible.
     False. `PnpmTool.isMonorepoRoot` checks only that `pnpm-workspace.yaml`
     **has** a `packages:` key and never counts the packages — so it tags
     `@xenos1996/usa@X.Y.Z` with one package or ten. The patch shipped, the
     tag shape did not change, and a release went out untagged for its
     consumers of `publish.yml`. One `console.log(packages.tool.type)`
     would have refuted the whole theory in five seconds. See
     `docs/release.md` "The tag shape".
   - _"The tighter SUP-010 regex flags unpinned actions."_ True, and it also
     flagged the comment that documented it, dropping the self-audit to
     94/100. Diagnosing the rule would have surfaced that in the same
     minute; the fix (`^(?!\s*#)`) was then trivial.
   - _"Scorecard's Token-Permissions check wants job-level grants, so moving
     `contents: write` from the top level to a job will clear the alerts."_
     Half right, and the wrong half was the whole point. Scorecard flags a
     write grant **on the top level unconditionally** — read
     `checks/raw/permissions.go`: `validateTopLevelPermissions` runs before
     `createIgnoredPermissions`, so the semantic-release / npm-packaging
     allowlist that exempts a grant never applies at the top level. A
     job-level write, by contrast, costs nothing at scoring time
     (`checks/evaluation/permissions.go` only penalizes it when the same
     workflow also writes at the top level). So the rule is exactly inverted
     from the guess: **top level must be `contents: read`; every write belongs
     on the one job that needs it.** Reproduce with
     `scorecard --local . --checks Token-Permissions --format probe` — it
     prints per-workflow findings the JSON view hides. Full mechanism in
     `docs/standards-mapping.md` "On Scorecard specifically".

   Corollary for automation: **"the workflow ran" is not "the workflow did
   its job."** A release can publish, report success, and skip every
   downstream step because a trigger or filter matched nothing. After
   touching anything release-shaped, verify the _effect_ (the tag exists,
   the mirror has the version, the provenance PR opened), never the status
   icon. Step 8 says the same thing for releases; it applies to every
   trigger you edit.

1. **Branch** from `master`: `fix/<topic>`, `feat/<topic>`,
   `chore/<topic>`, or `docs/<topic>`. Never commit to `master` directly.
   Branch from **current `master`**, not from another in-flight branch or a
   pre-squash commit — this repo squash-merges, so an unmerged base
   re-introduces already-merged work and the PR sits `DIRTY` with a diff
   listing files you never touched. If you must base on a branch, expect to
   rebuild before opening the PR.
2. **Implement** (see Code conventions). Prefer editing existing files;
   new files only with reason. Keep diffs minimal.
   2b. **Release note**: if the change touches a shipped path (`src/`,
   `rules/`, `templates/`, `action.yml`, `package.json`), run
   `pnpm changeset` and write one line explaining the bump. The
   `changesets` CI job fails a shipped-path PR without one.
3. **Local gates, all green, before pushing**: `pnpm run typecheck`,
   `pnpm run lint`, `pnpm run format:check`, `pnpm test`,
   `pnpm run docs:all`. No exceptions — CI runs the same gates and more.
4. **Commit** with a Conventional Commits subject
   (`fix:`, `feat:`, `chore:`, `docs:` …). Body lines must stay within a
   hundred characters or the commit-msg hook rejects the commit;
   subject-only messages always pass. The hook also runs lint-staged
   (ESLint + Prettier on staged files) — a red hook means fix, not bypass.
5. **Push, open a PR** (fill in the template: what, why, type of change).
   Squash-merge when green, delete the branch.
6. **CI must be fully green before merge.** Twelve-plus checks including
   Test, Lint & format, USA audit (self-audit, fail-on-critical),
   Security scans, CodeQL, Docs & ADR hygiene, Resync generated docs,
   Validate rule packs, Conventional commits, Changeset present, Build.
7. **Merging needs the branch-protection conditions**, not just green
   checks: CODEOWNERS review (`*` owned by the maintainer) and required
   status checks. `gh pr merge` failing with "use administrator
   privileges" means a condition is unmet — get the review, do not pass
   `--admin`. This repo does not bypass its own protection; neither do you.
8. **After merge: follow through.** A consumed changeset makes
   changesets/action open the Version Packages PR. Shepherd it (see
   Release machinery), watch the tag run, verify the registries.

## Bot pushes and the approval limbo (you will hit this weekly)

Runs triggered by bot pushes (changesets Version Packages branches,
dependabot branches, workflow-created branches) land in CI with every check
stuck at `action_required` and `gh pr checks` reporting nothing. This is
GitHub's approval quarantine, not a failure. As the maintainer, re-run the
four stuck workflows by ID (`gh run rerun <id>`), wait, and the checks go
green. Do not "fix" anything first — there is nothing broken.

Related: nothing automerges — every dependabot PR is merged by hand after
review. Review them like any dependency change: minors/patches of dev tools
are usually safe; majors (TypeScript 7, action v3→v4) need a verdict with
reasons.
`dependabot.yml` already ignores TypeScript majors — that ignore exists
because v7 is a rewrite that violates the linter's peer range, and the
comment there says so.

## Commands (the gates, exactly)

```bash
pnpm run typecheck      # tsc --noEmit, strict
pnpm run lint           # eslint . (complexity budget: max 10 per function)
pnpm run format:check   # prettier --check . (write with :format)
pnpm test               # vitest run, full suite
pnpm run test:cov       # with coverage (thresholds enforced, see below)
pnpm run build          # tsc emit to dist/
pnpm run docs:all       # all six doc gates (see Docs hygiene)
pnpm run self-audit     # build + `usa audit . --out AUDIT.md`
pnpm changeset          # write a release note (shipped changes)
```

Install once with `pnpm install` (lockfile is `pnpm-lock.yaml`; CI uses
`--frozen-lockfile`). `pnpm run usa -- …` runs the CLI from source without
building (`node --experimental-strip-types`). `AUDIT.md` is gitignored and
lands in the current working directory, never the target being audited.

## Commits and versioning

- Conventional Commits are still mandatory (the hook and the
  Conventional commits CI job enforce the format), but they no longer
  compute the bump: **the changeset does**. `feat:`/`fix:` titles keep the
  history readable and feed the CHANGELOG entry text; the declared bump is
  whatever `.changeset/*.md` says.
- Every PR touching a shipped path adds a note via `pnpm changeset`.
  `chore:`, `docs:`, `ci:`, `test:` PRs that touch no shipped path need
  none, and the `changesets` job says so explicitly when it fires.
- Keep the subject imperative and scoped (`fix(live): …`).
  Multi-line bodies are allowed but every line must fit the hook's
  length limit; when in doubt, ship subject-only and put rationale in
  the PR body.
- Never amend a failed commit and re-push over hooks; create a new
  commit. Never force-push shared branches.
- Commit often as local savepoints on your branch, even mid-task —
  uncommitted work dies on any `reset --hard`, rebase, or checkout
  mishap, and that loss has happened here before. Savepoints are not
  shipping: push and merge only when a significant, related, reviewable
  whole is complete. Prefer small reviewable PRs; large diffs need an
  explicit review before merging and must stay the exception, not the
  habit.
- Before ANY destructive operation (`reset --hard`, `checkout --`,
  `clean -fd`, branch deletes, stash drops): back up first — a WIP
  commit, a stash push with a name, or a patch file. No exceptions.
  Verifying the backup exists (`git stash list`, `git log`) is part of
  the operation, not optimism about it.

## Tests

- Layout is the scaling contract: `tests/unit/` (pure logic, no I/O),
  `tests/integration/` (real I/O: temp dirs, git, binaries, mocked
  boundaries), `tests/e2e/` (user journeys: CLI via `main()`, full
  sessions and cycles). Shared harnesses stay at `tests/` root
  (`helpers.ts`, `engine-helpers.ts`, …). Classify by behavior, not by
  filename — and the classifier (`classifyTestFile`) recognizes the
  directory layout, so keep it that way.
- Rules for writing tests: no network (stub `fetch`; a test that reaches
  the network fails by construction), deterministic (shuffle-safe —
  proven by experiment, keep it that way), temp dirs cleaned in
  `afterEach`, never write outside `os.tmpdir()`.
- Coverage thresholds are a ratchet (lines/functions/branches/
  statements, configured in `vitest.config.*`): they sit just below
  measured numbers and only ever rise. Never lower them, never exclude
  files to pass.
- Complexity budget is 10 per function (ESLint). If your change pushes a
  function over, extract a helper — do not bump the limit.
- Caught errors keep their `cause` (`preserve-caught-error`); user-facing
  messages stay static where values could leak (provider errors never
  interpolate key material, ids, or endpoints).
- Cosign-dependent tests can flake in sandboxes without the binary or
  network; CI is the arbiter for those, not your laptop.

## CLI conventions (hard-won, all enforced somewhere)

- Every command that writes files honors `--dry-run`: print resolved
  would-write paths, exit 0 before any work. No audit run, no model
  calls, no writes under `--dry-run`, ever.
- Some writers additionally refuse to clobber (`init`, `foundation
init` leave existing files alone with a message). The store is
  content-addressed append-only. Nothing in the CLI deletes user files
  or publishes — signing and publishing live in the release workflow.
- Exit codes: `0` success, `1` findings at/above `--fail-on` (gate),
  `2` usage/validation errors. Errors and usage go to stderr; machine
  output (`--format json`) must parse clean with empty stderr; human
  summaries stay on stdout.
- Stdin answers are capped (64 KiB per line, loud exit 2 over the cap).
  User free text never reaches the model — only sanitized values and
  aggregates — and model turns are fenced as data with an
  instruction-hierarchy guard in the system prompt. The model has no
  tools anywhere; its output goes only to the terminal and the labeled
  transcript.
- Never use `bash` tooling (or code comments) to talk to the user, and
  never `echo` your way through file operations — use the proper file
  tools. Verify your own work by execution: run the code, run the
  tests, show the output. Judge commands by exit codes, never by tailing
  output — an empty tail looks clean while errors hide two lines up.
  This bit twice on real work.

## Docs hygiene (CI enforces all of it)

- `pnpm run docs:all` runs four gates: ADR hygiene, docs governance
  (claim scanner), CLI reference sync, sample-report sync. All four must
  pass locally before pushing.
- `docs/reference/cli.md` and the sample reports are **generated** — edit
  the sources (help text, generators), rebuild (`pnpm run build` — CLI
  facts come from `dist/`, and a stale `dist/` bakes stale facts), then
  regenerate and commit the result. The Resync job pushes generated-doc
  fixes back to PR branches itself.
- Shared facts live behind `usa:fact` / `usa:begin…usa:end` markers;
  only rewrite between markers. The claim scanner flags unmarked numeric
  claims — use a marker, reword, or `usa:allow-claim` with reason.
- ADRs are **immutable history**: never edit a merged ADR, never reuse a
  number. New decisions append the next sequential file plus a README
  index entry (`scripts/check-adrs.mjs` enforces numbering, titles,
  dates, and the index).
- `.usa.yaml` holds suppressions (accepted risk, always with a reason —
  visible in reports) and dated reviews (attention with evidence, never
  changing a verdict). Both decay visibly: unused/stale entries warn.
  Prefer reviews over suppressions; suppress only what must stop
  reporting, and say why.

## Configuration policy (`.usa.yaml`)

The file records human judgement, so treat it as carefully as code:
every entry needs a reason a stranger would accept. Suppressions hide
findings repo-wide — never suppress a rule to silence one file unless
the reason covers the whole rule. Reviews attach evidence and an
`until` date; the audit warns when they go stale or match nothing, and
that warning is a task, not noise. Prettier checks the file; the
self-audit validates it.

## Release machinery (read before touching)

- changesets/action (PAT `CHANGESET_TOKEN`, never `GITHUB_TOKEN` —
  token-triggered pushes do not fire downstream workflows) keeps one
  **Version Packages PR** updated from the `.changeset/*.md` notes in
  merged PRs. Merge it: the same workflow then publishes and tags.
- Two workflows, two jobs. `release.yml` = version + publish to npmjs.
  `publish.yml` = the tag follower: GPR mirror, SBOM, attestation,
  `provenance/` PR. Do not merge them back — a tag push and a branch push
  need different permissions and different failure isolation.
- **Tags are `@xenos1996/usa@X.Y.Z`, not `vX.Y.Z`.** pnpm workspaces make
  `@manypkg/tools` report `tool.type: "pnpm"` (it checks only that
  `pnpm-workspace.yaml` has a `packages:` key, never the count), so
  changesets emits the scoped tag shape. `publish.yml` matches both `v*` and
  `@xenos1996/usa@**` — `**` is required, `*` does not cross `/`. Do not
  "fix" the tag shape by trimming the workspace; that was tried and did
  nothing. Release 2.25.3 published to npmjs while silently skipping the
  mirror, SBOM, attestation and provenance, with every workflow green — so
  **after any change to release triggers, confirm `publish.yml` actually
  ran**; do not trust the glob by inspection. Full story in
  `docs/release.md` "The tag shape".
- Two registries: npmjs (source of truth, OIDC trusted publishing —
  no long-lived token) and the GitHub Packages mirror (classic PAT
  `GPR_TOKEN` minted on the scope-owning account, because the repo owner
  is not the scope owner). The root `.npmrc` maps the scope at GPR.
- **The `.npmrc` trap** — and the precedence it actually follows, measured
  rather than assumed (v2.25.2 died here with a 401 from GitHub Packages):

  | Override                             | Wins over the project `.npmrc`? |
  | ------------------------------------ | ------------------------------- |
  | `--@xenos1996:registry=…` on the CLI | **yes**                         |
  | rewriting the `.npmrc` scope line    | **yes**                         |
  | `npm_config_@xenos1996:registry` env | no                              |
  | `NPM_CONFIG_USERCONFIG`              | no                              |

  `pnpm publish` (in `publish.yml`) can pass the CLI flag, so it does.
  `changeset publish` (in `release.yml`) builds its own `npm publish` call
  and offers no way to inject one, so that leg rewrites `.npmrc` before it
  runs. A bare `--registry` never wins — it is not scoped.

- Every release is attested (Sigstore provenance on npmjs, GitHub
  Artifact Attestations), verified (`gh attestation verify` as a job
  gate), and filed under `provenance/` (`v*.sigstore.json` +
  `v*.vsa.json`) through a normal PR — SUP-022/SUP-023 stay green that
  way. Never push `v*` tags by hand.
- If automation wedges, Actions → Release → Run workflow (dispatch) walks
  the version-or-publish path by hand; duplicate versions fail closed at
  the registry. If only the npmjs leg is stuck, Actions → **Publish** →
  Run workflow publishes on dispatch. Rollback is documented in
  `docs/release.md` (deprecate + repoint, delete release, delete mirror
  version) and has never been exercised — keep it that way by shipping
  carefully.
- Secrets live in GitHub settings, never the tree. `.env` is gitignored
  (the CLI loads it for provider keys; the environment always wins).
  GPR reads need a token even for public packages. On any suspected
  leak: rotate first, purge history second.

## Self-audit loop

Run `usa audit .` (or `pnpm run self-audit`) and read it like a reviewer:
fix HIGHs, record or suppress the rest with evidence, work the
judgement queue per ADR-0023 (assisted items get settled with
`--allow-commands`; judgement items get reasoning). The CI gate fails
on criticals — a red USA audit blocks merge like any red test.

## Architecture map (pointers, not a copy)

- `src/cli.ts` — argument parsing, per-command drivers, help texts.
- `src/engine/` — audit pipeline (load → detect → evaluate → score).
- `src/foundation/` — project-intent interview and detection defaults.
- `src/live/` — conversational sessions; the model boundary lives in
  `runner.ts` (`modelTurn` is the single choke point).
- `src/agent/` — provider presets and the chat transport (OpenAI-shaped,
  text in/out, no tools).
- `src/report/`, `src/detect/`, `src/store/`, `src/evolution/`,
  `src/bootstrap/`, `src/learn/` — as named.
- `rules/` — data-driven packs (`core/`, `stacks/`); adding a rule is a
  YAML change plus fixtures, not engine surgery. See `docs/rule-packs.md`.
- `scripts/` — doc generators and gates (all covered above).
- `provenance/` — per-release Sigstore bundles + verification summaries.
- `docs/ARCHITECTURE.md` — the five stages, the fact system, severity
  dampening, and what USA deliberately does not do. Read it once.

## Agent Communication Rules

When asking the owner what to do next, the agent MUST present options.
The session has full context of previous work (INDEX.md, DASHBOARD.md,
session files) — use it to offer concrete choices, not open-ended questions.

Example: "I can fix G3, release the changeset, or review the dependabot PRs. Which first?"

Never ask "What would you like me to do?" without options.

## Session Close is FINAL

When the owner says "close the session", the session is CLOSED. Do NOT reopen it unless:

- The owner explicitly says there is work to do, AND
- The owner paraphrases or confirms they want the session reopened

If the owner says "close the session" and then later says "continue" or "reopen", ASK for paraphrase before reopening. A closed session stays closed until the owner explicitly reopens it with clear intent.

---

## Review culture

A good review records a verdict **per change** with the reason and the
evidence checked — never a blanket approval. Staged review texts live
outside the repo; what lands in history is the merge and its rationale.
When the automation produces a PR (bundle filings, resyncs), verify
origin, content, and CI — routine does not mean rubber-stamp. When you
find yourself explaining the same thing twice, it belongs in this file.

---

## MACP — Multi-Agent Coordination Protocol

**Full protocol → [docs/macp.md](docs/macp.md)** — read it at session start.

Mandatory startup (always, before any work):

1. `state/` exists? If not → Bootstrap Protocol (Section 7 in macp.md).
2. Read `state/DASHBOARD.md` — check "Last Reconciled" (<24h trust, >48h stale).
3. Read `state/REGISTRY.md` — confirm no active-agent conflicts.
4. Register yourself: create `state/sessions/YYYYMMDD-HHMM-<ID>-<slug>.md` with Agent/Model/Branch/Started/Status/Base commit, add entry to `REGISTRY.md`.
5. Create `state/plans/agent-<ID>-<slug>.md` (objective, scope, approach, risks, rollback, success criteria).
6. Verify: `gh pr list`, `gh pr checks`, `pnpm test`, `pnpm run typecheck`, spot-check DASHBOARD claims.
7. Only then begin work.

Full protocol: `docs/macp.md` — 7 sections covering startup, live logging, validation, shutdown, conflict handling, anti-patterns, bootstrap. <!-- usa:allow-claim: macp.md's own section count, not the engine's -->
