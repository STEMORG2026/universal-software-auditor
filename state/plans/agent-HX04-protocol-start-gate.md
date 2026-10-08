# Plan — agent-HX04-protocol-start-gate

**Agent:** HX04 (HERMES)
**Branch:** fix/protocol-start-gate
**Created:** 2026-10-02T05:14:00+05:45

## Objective

Close the enforcement gap that let a session skip the MACP startup
sequence entirely, and remove the root cause that made the startup
instructions unreadable (AGENTS.md truncation).

## Scope

**In:**

- ADR-0044 recording the root cause + decision.
- `scripts/check-session-start.mjs` — start-of-session gate.
- `package.json` script `protocol:start` + wiring into pre-commit and CI.
- AGENTS.md restructure so the MACP startup survives the 32K hint cliff.
- Update STARTUP.md / docs referencing the gate set.

**Out (not this PR):**

- Rewriting MACP itself (P1-P6 amendments stand).
- Touching the release machinery or dependabot PRs.
- Auto-fixing G3 ("four doc gates" wording) — that is a separate two-word
  change needing owner consent on a protected file.

## Approach

1. Branch `fix/protocol-start-gate` from `master` (614530a). **Done.**
2. Write ADR-0044 (proves diagnosis first, per AGENTS.md step 0).
3. Write `check-session-start.mjs`:
   - latest session file must exist and be `IN-PROGRESS` or `COMPLETED`
   - an `IN-PROGRESS` session must have a matching plan in `state/plans/`
   - an `IN-PROGRESS` session must be listed in `REGISTRY.md` Active Agents
   - if `state/` is absent → pass (bootstrap case)
4. Add `protocol:start` to package.json.
5. Wire into `.husky/pre-commit` and a CI job (`protocol-check.yml`).
6. Restructure AGENTS.md: keep the operating manual up top, move the MACP
   body into `docs/macp.md` (or compress it under the cliff) so the
   mandatory startup is always loaded. Update the manifest.
7. Run all local gates: typecheck, lint, format:check, test, docs:all.
8. Commit, push, open PR.

## Risks and mitigations

| Risk                                          | Mitigation                                                  |
| --------------------------------------------- | ----------------------------------------------------------- |
| Gate too strict → blocks legit bootstrap      | `state/` absent → pass; documented in the script header     |
| Gate too strict → blocks hotfix sessions      | allow `COMPLETED` sessions to pass (close path unaffected)  |
| Moving MACP breaks doc gates                  | run `docs:all` locally; update `docs/manifest.yaml`         |
| AGENTS.md move changes protected-file content | keep every normative line; this is relocation, not deletion |

## Rollback strategy

Single branch, no master commit. `git checkout master && git branch -D
fix/protocol-start-gate`. ADR-0044 becomes "Superseded" rather than edited
if the decision changes (ADR immutability rule).

## Success criteria

- `pnpm run protocol:start` passes on a clean, properly-registered session.
- It FAILS when a session file is IN-PROGRESS with no plan/registry entry.
- AGENTS.md's MACP startup section is inside the first 32,000 chars.
- All local gates green: typecheck, lint, format:check, test, docs:all.
- ADR-0044 passes `pnpm run docs:adrs`.
