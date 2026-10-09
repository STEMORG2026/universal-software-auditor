# BLOCKERS.md — Active Blockers and Dependencies

**Last updated:** 2026-10-01T20:14:40+05:45

---

## Active Blockers

**None.** Working tree is clean, no merge conflicts, no stashes, no upstream dependencies blocking work.

---

## Potential Blockers (watch list)

| Item                                      | Type    | Notes                                                                   |
| ----------------------------------------- | ------- | ----------------------------------------------------------------------- |
| AGENTS.md is a protected agent file       | Consent | G3 fix (two-word edit) needs explicit owner consent                     |
| All branches merged                       | Hygiene | No unmerged branches remain. Content in docs/0042-continuous-ingestion. |
| `.changeset/autonomous-docs-hardening.md` | Release | Pending changeset — will trigger Version Packages PR on next release    |

---

## Dependencies

| Dependency              | Type     | Status                                                                        |
| ----------------------- | -------- | ----------------------------------------------------------------------------- |
| `yaml` (npm)            | Runtime  | Only runtime dependency — structurally impossible to have redundancy          |
| `typescript`            | Dev      | Pinned, dependabot ignores majors (v7 rewrite violates linter peer range)     |
| `vitest`                | Dev      | Coverage thresholds ratcheted (lines 85, functions 90, branches 75, stmts 84) |
| `eslint`                | Dev      | Complexity budget 10 per function                                             |
| `prettier`              | Dev      | printWidth 100                                                                |
| `husky` + `lint-staged` | Dev      | Pre-commit hooks                                                              |
| `commitlint`            | Dev      | Conventional Commits, 100-char body limit                                     |
| `changesets`            | Dev      | Author declares bump                                                          |
| `cosign`                | External | Provenance verification (can flake in sandboxes)                              |
