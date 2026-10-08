# DASHBOARD.md — Executive Summary

> **⚠️ STOP — Read AGENTS.md before doing anything.**
> The mandatory MACP startup sequence is in AGENTS.md.
> Do not skip it. Do not summarize state without following it.

**Last Reconciled:** 2026-10-01T23:48:39.283+05:45
**Reconciled by:** auto-update (post-commit)
**Repo:** Universal_Software_Auditor
**Remote:** git@github.com:Er-Sajan-PLG/universal-software-auditor.git

---

## What Is This Project

USA (Universal Software Auditor) is a TypeScript CLI (`usa`) that audits any
project and writes a graded Markdown report. It ships as npm `@xenos1996/usa`
plus a GitHub composite action. The defining habit: **the tool audits itself**.

- **Version:** 2.26.0
- **License:** MIT
- **Language:** TypeScript 5.7 (Node 20+, ESM, strict)
- **Package manager:** pnpm 10.34.5 (pnpm-workspace.yaml)
- **Tests:** vitest 5 (unit/integration/e2e split)
- **Releases:** changesets (author declares bump)
- **CI:** GitHub Actions (11 workflows, 1232 lines total)

---

## Current Branch State

| Branch                              | Status               | Ahead/Behind master |
| ----------------------------------- | -------------------- | ------------------- |
| `fix/protocol-start-gate` (CURRENT) | pushed, PR #183 open | +6 ahead of master  |
| `master`                            | at origin            | 0                   |

**PR #183 open** (`fix/protocol-start-gate`) — start-of-session gate
(ADR-0044). CI fully green, mergeable. Awaiting owner merge.

---

## Active Agents

None — no active sessions.

See `state/REGISTRY.md` for details.

---

## Critical Alerts

- **None.** Working tree is clean, no merge conflicts, no stashes.

---

## Recently Completed (last 10 commits)

1. `0da0a37 docs(state): fix session-file claim classification`
2. `8cd8a34 chore(state): auto-update from post-commit hook`
3. `4ec7a0a chore(state): close HX04 — PR #183 green, session COMPLETED`
4. `3b12b6d chore(state): auto-update from post-commit hook`
5. `fe2b726 fix(ci): split protocol workflow into start (PR) and close (master push)`
6. `f7a78c7 chore(state): auto-update from post-commit hook`
7. `36a65bc fix(hooks): run the close gate only on master pushes`
8. `ec7a8e3 chore(state): auto-update from post-commit hook`
9. `abc2254 feat(macp): add start-of-session gate (ADR-0044)`
10. `614530a chore(state): auto-update from post-commit hook`

---

## Pending Changeset

`.changeset/autonomous-docs-hardening.md` — unreleased changeset waiting for next release.

## Next Steps (from last session)

1. **Merge PR #183** (`fix/protocol-start-gate`) — CI green, mergeable.
2. Fix AGENTS.md G3 (two-word edit, needs owner consent)
3. Consider ADR-0044 option 4 (extract MACP to `docs/macp.md`) — the
   structural fix for the truncation cause; owner-approved, protected file.
4. Release pending changesets (`autonomous-docs-hardening`, `protocol-start-gate`)
5. Review dependabot PRs (#176-#180)

---

## Key Files Map

| Area         | Path                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| CLI entry    | `src/cli.ts`                                                                                               |
| Engine       | `src/engine/` (audit, evaluate, score, maturity, diff, loader)                                             |
| Rules (data) | `rules/` (core/, stacks/, catalogues/, detectors.yaml, docs-taxonomy.yaml)                                 |
| Reports      | `src/report/` (markdown, json, sarif, html, narrative, signature)                                          |
| Live/Agent   | `src/live/`, `src/agent/`                                                                                  |
| Evolution    | `src/evolution/`                                                                                           |
| Foundation   | `src/foundation/`                                                                                          |
| Serve        | `src/serve/`                                                                                               |
| Docs         | `docs/` (28 files), `docs/adr/` (<!-- usa:fact adrs -->44<!-- /usa:fact --> ADRs + README)                 |
| Scripts      | `scripts/` (13 .mjs files)                                                                                 |
| Tests        | `tests/` (unit/, integration/, e2e/, contracts/)                                                           |
| CI           | `.github/workflows/` (11 workflows)                                                                        |
| Config       | `.usa.yaml`, `package.json`, `tsconfig.json`, `vitest.config.ts`                                           |
| Provenance   | `provenance/` (v2.9.0 through v2.26.0)                                                                     |
| MACP state   | `state/` (DASHBOARD, STARTUP, REGISTRY, INDEX, ARCHITECTURE, DECISIONS, DEBT, BLOCKERS, sessions/, plans/) |

---

## MACP Protocol Summary

Every agent working in this repo MUST:

1. **Start clean** — `git status`, `git branch -vva`, `git log --oneline -10`, `git stash list`
2. **Read state/** — DASHBOARD.md first, then STARTUP.md, REGISTRY.md, BLOCKERS.md, INDEX.md
3. **Verify** — check PR exists, CI green, tests pass, typecheck passes, spot-check claims
4. **Register** — create `state/sessions/YYYYMMDD-HHMM-<AGENT-ID>-<slug>.md`
5. **Plan** — create `state/plans/agent-<ID>-<slug>.md`
6. **Work** — log progress in real-time in session file
7. **End clean** — commit or stash all work, update DASHBOARD.md, update REGISTRY.md

Full protocol in AGENTS.md. Quick reference in `state/STARTUP.md`.

---

## Documentation System Status

The repo has a sophisticated documentation governance system (ADR-0020 + ADR-0042):

- <!-- usa:fact adrs -->44<!-- /usa:fact --> ADRs, 83 tracked markdown files
- 6 doc gates: adrs, check, cli, sample, asvs, manifest
- Fact-marker engine, claim scanner, byte-compare gates
- Pre-commit: autosync + lint-staged
- Pre-push: build + docs:all
- CI hygiene: all 6 gates
- Self-audit: `usa audit . --fail-on critical` + `usa docs audit . --fail-on medium`

**Open gap:** G3 — AGENTS.md says "four doc gates" but there are now six. Blocked on owner consent (protected file).

---

## Release Machinery

- **Two workflows:** `release.yml` (version + npmjs publish) → `publish.yml` (GPR mirror + SBOM + attestation + provenance PR)
- **Tags:** `@xenos1996/usa@X.Y.Z` (scoped, not `v*`)
- **Registries:** npmjs (OIDC trusted publishing) + GitHub Packages (classic PAT)
- **Provenance:** Sigstore bundles for every release v2.9.0 through v2.26.0
- **Changeset token:** `CHANGESET_TOKEN` (fine-grained PAT, not GITHUB_TOKEN)
