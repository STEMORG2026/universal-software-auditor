# REGISTRY.md — Agent Registry

**Last updated:** 2026-10-02T05:45:00+05:45

---

## Active Agents

None — no active sessions.

---

## File Ownership Rules

1. If another **ACTIVE** agent owns files you need → STOP, coordinate via session file
2. If owner is **INACTIVE** (>24h) → you may claim ownership
3. **Shared files** (config, package.json, etc.) → [COORDINATION] note in both session files

---

## Inactive Agents

### HERMES — Protocol Start Gate (HX04)

| Field         | Value                                                                          |
| ------------- | ------------------------------------------------------------------------------ |
| Agent ID      | HX04                                                                           |
| Model         | meituan/longcat-2.5-preview:free                                               |
| Branch        | fix/protocol-start-gate                                                        |
| Task          | Start-of-session gate + AGENTS.md truncation root cause                        |
| Started       | 2026-10-02T05:14:00+05:45                                                      |
| Completed     | 2026-10-02T05:45:00+05:45                                                      |
| Status        | COMPLETED                                                                      |
| Files claimed | `scripts/check-session-start.mjs`, `docs/adr/0044-*.md`, `state/`, `AGENTS.md` |

### HERMES — Continuation Session (HX02)

| Field         | Value                                |
| ------------- | ------------------------------------ |
| Agent ID      | HX02                                 |
| Branch        | docs/0042-continuous-ingestion       |
| Task          | MACP startup fix + HX01 handoff      |
| Started       | 2026-10-01T20:03:17+05:45            |
| Completed     | 2026-10-01T20:14:40+05:45            |
| Status        | COMPLETED                            |
| Files claimed | state/ (entire directory) — released |

### HERMES — Bootstrap Session (HX01)

| Field         | Value                                |
| ------------- | ------------------------------------ |
| Agent ID      | HX01                                 |
| Branch        | docs/0042-continuous-ingestion       |
| Task          | Bootstrap MACP + merge 8 branches    |
| Started       | 2026-10-01T16:30:00+05:45            |
| Completed     | 2026-10-01T18:45:00+05:45            |
| Status        | COMPLETED                            |
| Files claimed | state/ (entire directory) — released |

---

## Session Files

| Session                                         | Agent | Branch                         | Status    |
| ----------------------------------------------- | ----- | ------------------------------ | --------- |
| `sessions/20261001-1630-HX01-bootstrap-macp.md` | HX01  | docs/0042-continuous-ingestion | COMPLETED |
| `sessions/20261001-2003-HX02-continue-macp.md`  | HX02  | docs/0042-continuous-ingestion | COMPLETED |
