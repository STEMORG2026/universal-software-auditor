# Plan — SA19: the session boundary — a report is not an ending, and one live session per repo

**Agent:** SA19 · **Branch:** `feat/submit-not-terminal`

## Objective

after submit, anything the owner reports back can be acted on because the session stays active, and the agent submits again — close begins only when the owner is satisfied

**Widened at 10:31, in the owner's words:** "Build the gate." — `start` must refuse a second
session while one is already live in this repository, so a physical harness conversation cannot
hold two MACP sessions.

## Which remediation item, and how much of it

**Not a phase in `docs/remediation-plan.md`.** It amends **P4 (human close boundary)**, which #271
delivered as `submit → AWAITING-USER → close → seal`, and it closes the hole P4's own state model
created: because `submit` froze the session, the second-session guard saw nothing live and let
`SA19` open alongside `SA18` in the same conversation. A row should be added to §5 (`P10` or
`F-32`); **proposed, not applied** — the Status column is the owner's.

## Scope

**In:** `submit` leaves the session workable; `close` acts on a reported session whatever its
state; `start` refuses while any lease in this repo is live; the guard and `docs/macp.md`; tests.

**Out:** `seal`, `reopen`, `abandon`, the key model, the other remediation phases, and anything in
`Projects/MACP`.

Authorized by: Sajan, 2026-10-26, verbatim: "What i want you to write in MACP is after the submit is done, anything i report back or ask you to do, you can do it becasue the session will be active and then you submit again not ask for close until i am satisfied. After i am satisfied with the submi. You follow the protocal and closing sessiion begins following the protocal."

## The change

|                                              | Today                               | After                                      |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------ |
| `submit` ends at                             | `AWAITING-USER` — frozen            | `IN-PROGRESS` — workable                   |
| agent continues after a report               | `macp resume` with the owner's key  | edits and commits, no key                  |
| `close` requires                             | a session in `AWAITING-USER`        | **a handoff that exists** for this session |
| the report section                           | appended                            | replaced, so the file holds the latest     |
| a second `start` while another session lives | allowed once the first is submitted | **refused**                                |

`close` keeps every refusal it has today and gains one: no handoff, no close. It still refuses if
any non-`state/` file changed since the handoff's `code_commit_sha`, so the owner closes the tree
that was measured.

The gate: `conflictingLease` today only blocks a second **ACTIVE** lease. It becomes "any live
lease" — `ACTIVE`, `CLOSING`, `AWAITING-USER`, `AWAITING-CHECKPOINT` — because those are all states
in which a session still owns the branch. That is the exact hole: `SA18` was `AWAITING-USER`, so
the guard saw nothing and `SA19` opened.

## Approach

1. `submit`: after writing the handoff and report, return session, lease and INDEX to `IN-PROGRESS`
   instead of `AWAITING-USER`.
2. `close`: find the session by "has a handoff", not by status; keep the source-unchanged and
   clean-tree checks.
3. Report section: replace rather than append.
4. `conflictingLease`: widen from `ACTIVE` to a `LIVE` set exported from `lease.mjs`.
5. Docs: §4C and the §4D state table, with the honest cost stated.
6. Tests: each case watched failing first, then the fix.

## Risks and mitigations

- **"The agent has stopped" is no longer a state.** Mitigation: the handoff is the signal, and it
  names the commit it measured; a `close` after any source change is refused by name.
- **A stale live lease blocks every new session.** Real: a crashed harness leaves an ACTIVE lease.
  Mitigation: `start` on the _same_ branch may resume it (already true), and the refusal names the
  lease file and the branch so the owner can see what holds it. No silent expiry — a lease that
  expires is a session that resumed without authorisation.
- **`close` on a never-submitted session.** Refused: no handoff.
- **Sessions already `AWAITING-USER`.** `close` accepts them, so no record is stranded.

## Rollback

Revert the branch. Sessions written under the new behaviour are ordinary `IN-PROGRESS` records
with a handoff, which the old code still closes — a rollback strands nothing.

## Success criteria

1. `submit` exits 0, writes the handoff, and `status` still says `IN-PROGRESS` with a live lease.
2. After a submit, an edit and a commit succeed with no owner signature.
3. A second `submit` exits 0 and the report section holds one report, not two.
4. `close` on a session with no handoff is refused.
5. `close` after a source change since the handoff is refused, naming the file.
6. `close` with the owner's key on a reported, unchanged tree reaches `COMPLETED`.
7. `start` on a new branch while another session's lease is `AWAITING-USER` is refused, naming it.
8. `start` after the previous lease is closed is allowed.
9. A session already in `AWAITING-USER` from the old code still closes.
