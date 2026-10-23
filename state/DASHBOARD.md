# DASHBOARD.md — Executive Summary

> **⚠️ STOP — Read AGENTS.md before doing anything.**
> The mandatory MACP startup sequence is in AGENTS.md.
> Do not skip it. Do not summarize state without following it.

**Last Reconciled:** 2026-10-23T12:48:16.770+05:45
**Last Reconciled:** 2026-10-23T11:12:17.101+05:45
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

|| Branch | Status | Ahead/Behind master |
|| ----------------------------------- | -------------------- | ------------------- |
|| `master` | #188 merged (`8d63e2f`), clean | 0 |
|| `fix/verdict-correctness` | **current, PR #190, rebased on #188** | +4 |
|| `dependabot/…dev-dependencies…` | PR #180 open — needs rebase + re-approval | — |
|| `dependabot/…codeql-action/analyze…` | PR #178 open — UNSTABLE (2 non-required reds) | — |

**`fix/verdict-correctness`** — four verdict-correctness fixes found by auditing
the auditor, the `audit.ts` split, layer-boundary lint, and a declared
zero-retry test budget. Self-audit: **100/100, no open findings** (was 94.2 with
1 HIGH · 1 MEDIUM · 1 LOW · 5 FUTURE).

---

## Active Agents

None — no active sessions.

See `state/REGISTRY.md` for details.

---

## Critical Alerts

- **None.** Working tree is clean, no merge conflicts, no stashes.

---

## Recently Completed (last 10 commits)

1. `0daf4d6 fix(state): the hook must not log the same commit twice`
2. `42d8d76 chore(state): auto-update from post-commit hook`
3. `91e1959 Merge remote-tracking branch 'origin/master' into docs/macp-session-seal`
4. `958b668 chore(state): auto-update from post-commit hook`
5. `f3c50db fix(state): the start gate must accept a sealed session, and seal SA10`
6. `902871f chore(master): release (#244)`
7. `551ba77 fix(state): the hook maintains the table, and never writes into a seal`
8. `9a3437a chore(state): auto-update from post-commit hook`
9. `9da0675 chore(state): auto-update from post-commit hook`
10. `442812d docs(state): record SA10's outcome and the PR it ships in`
11. `8f3942c fix(release): export the expected ref so the provenance selector can read it`
12. `ab19ef7 fix(release): fetch the provenance by digest, not by a file that does not exist (#243)`
13. `1bc3c8e fix(release): unbreak the provenance step on its first real run (#242)`
14. `b642596 chore(master): release (#241)`
15. `a96aac3 fix(release): verify the provenance chain instead of only filing it (#240)`
16. `af3247f docs: attach SLSA provenance bundle for v2.28.2 (#239)`
17. `f269766 chore(master): release (#236)`
18. `9051264 docs: attach SLSA provenance bundle for v2.28.1 (#233)`
19. `e3099d0 docs: attach SLSA provenance bundle for v2.28.0 (#205)`
20. `0e23ace chore(codeowners): make the provenance bundle owned by its signer (#238)`

---

## Pending Changeset

`.changeset/verdict-correctness.md` — `minor`, on `fix/verdict-correctness`.
The two earlier changesets (`autonomous-docs-hardening`, `protocol-start-gate`)
were consumed by the 2.26.2 release.

## Next Steps

1. Owner review + merge of `fix/verdict-correctness` (agent never merges)
2. Then #178 (update branch → security scan goes green), then #180 (`@dependabot rebase`)
3. Release the pending changeset (Version Packages PR → publish)
4. D1 (AGENTS.md "four gates" → six) is still blocked on owner consent

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

**G3 closed:** AGENTS.md now says "six doc gates" (fixed in 4ed51c9).

---

## Release Machinery

- **Two workflows:** `release.yml` (version + npmjs publish) → `publish.yml` (GPR mirror + SBOM + attestation + provenance PR)
- **Tags:** `@xenos1996/usa@X.Y.Z` (scoped, not `v*`)
- **Registries:** npmjs (OIDC trusted publishing) + GitHub Packages (classic PAT)
- **Provenance:** Sigstore bundles for every release v2.9.0 through v2.26.0
- **Changeset token:** `CHANGESET_TOKEN` (fine-grained PAT, not GITHUB_TOKEN)
