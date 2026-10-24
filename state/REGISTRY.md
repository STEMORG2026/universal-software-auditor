# REGISTRY.md — Agent Registry

**Last updated:** 2026-10-23T18:10+05:45

---

## Active Agents

### SA12

| Field   | Value                                                              |
| ------- | ------------------------------------------------------------------ |
| Agent   | SA12 (Sathi / WorkBuddy)                                           |
| Harness | WorkBuddy                                                          |
| Branch  | `feat/macp-runtime-v2`                                             |
| Task    | reopened: work discovered by the close is finished in this session |
| Since   | 2026-10-24T20:33:14+05:45                                          |
| Claims  | —                                                                  |

## File Ownership Rules

1. If another **ACTIVE** agent owns files you need → STOP, coordinate via its session file
2. If the owner is **INACTIVE** (>24h) → you may claim ownership
3. **Shared files** (config, package.json, etc.) → [COORDINATION] note in both session files
4. A **sealed** session owns nothing. Its files are free, and its record is immutable.

---

## Sealed Sessions

Closed by the owner on 2026-10-23 under the instruction recorded in each file's
`## Close` block. `scripts/check-sessions.mjs` fails if any of these files is
edited after the commit that sealed it.

| ID     | Agent | Harness   | Branch                                                       | Closed           |
| ------ | ----- | --------- | ------------------------------------------------------------ | ---------------- |
| `HX01` | HX01  | HERMES    | `docs/0042-continuous-ingestion`                             | 2026-10-23T18:05 |
| `HX02` | HX02  | HERMES    | `docs/0042-continuous-ingestion`                             | 2026-10-23T18:05 |
| `HX03` | HX03  | HERMES    | `master`                                                     | 2026-10-23T18:05 |
| `HX04` | HX04  | HERMES    | `fix/protocol-start-gate`                                    | 2026-10-23T18:05 |
| `OC01` | OC01  | opencode  | `fix/release-oidc-and-git-cli`                               | 2026-10-23T18:05 |
| `SA01` | SA01  | WorkBuddy | `fix/verdict-correctness`                                    | 2026-10-23T18:05 |
| `SA02` | SA02  | WorkBuddy | `fix/scanner-artifact-contract`                              | 2026-10-23T18:05 |
| `SA03` | SA03  | WorkBuddy | `feat/codeql-verified`                                       | 2026-10-23T18:05 |
| `SA04` | SA04  | WorkBuddy | `master (merge-out + release; no feature branch of its own)` | 2026-10-23T18:05 |
| `SA05` | SA05  | WorkBuddy | `fix/scanner-stderr-reason`                                  | 2026-10-23T18:05 |
| `SA06` | SA06  | WorkBuddy | `ci/e2e-no-vacuous-pass`                                     | 2026-10-23T18:05 |
| `SA07` | SA07  | WorkBuddy | `fix/local-scanner-bin`                                      | 2026-10-23T18:05 |
| `SA08` | SA08  | WorkBuddy | `ci/trivy-in-ci`                                             | 2026-10-23T18:05 |
| `SA09` | SA09  | WorkBuddy | `docs/handoff-protocol`                                      | 2026-10-23T18:05 |

The previous version of this file kept a prose block per inactive agent.
It went stale — the same agents appeared as both INACTIVE and active, and
HX04 was still described as IN-PROGRESS. The table above is generated from
the session files, which are the source of truth.
