# REGISTRY.md — Agent Registry

**Last updated:** 2026-10-23T18:10+05:45

---

## Active Agents

### SA13

| Field   | Value                                                         |
| ------- | ------------------------------------------------------------- |
| Agent   | SA13 (WorkBuddy)                                              |
| Harness | WorkBuddy                                                     |
| Branch  | `audit/macp-enforcement`                                      |
| Task    | Task 1: macp resume — the signed AWAITING-USER to ACTIVE door |
| Since   | 2026-10-25T13:53:59+05:45                                     |
| Claims  | —                                                             |

### SA15

| Field   | Value                                                               |
| ------- | ------------------------------------------------------------------- |
| Agent   | SA15 (WorkBuddy)                                                    |
| Harness | WorkBuddy                                                           |
| Branch  | `feat/macp-runtime-v2`                                              |
| Task    | Unblock PR 270: unfilter the CI triggers so stacked PRs are checked |
| Since   | 2026-10-25T15:10:36+05:45                                           |
| Claims  | —                                                                   |

### SA18

| Field   | Value                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent   | SA18 (workbuddy)                                                                                                                                                                                                                                                           |
| Harness | workbuddy                                                                                                                                                                                                                                                                  |
| Branch  | `feat/plan-item-scope`                                                                                                                                                                                                                                                     |
| Task    | move MACP-REMEDIATION-PLAN-2026-10-24.md into the repo as docs/remediation-plan.md with a Status column (P3-P6 delivered in #271, P7-P9 pending), and add macp start --plan <id> so a session's scope comes from the plan item rather than from my prose. Stop after that. |
| Since   | 2026-10-26T02:04:56+05:45                                                                                                                                                                                                                                                  |
| Claims  | —                                                                                                                                                                                                                                                                          |

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
