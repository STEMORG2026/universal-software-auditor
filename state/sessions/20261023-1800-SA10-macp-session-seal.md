**Agent:** SA10 (Sathi / WorkBuddy)
**Harness:** WorkBuddy
**History:** not exported — the transcript lives in the harness, not the repo
**Branch:** docs/macp-session-seal
**Started:** 2026-10-23T18:00+05:45
**Status:** COMPLETED
**Base commit:** ab19ef7 (master)

# Session SA10 — owner-sealed session lifecycle

## Objective

The owner asked for three things in one instruction, and they are one change:

> "a session is designed to solve one piece of work. once i ask to close a
> session it must not be reopened unless i explicitly say so with a passkey.
> sessions have start time, major work, synced with agent history. if not
> integrated into macp, integrate at last. a session is not something the agent
> creates. now complete the work left in each session and close them. all the
> sessions must be closed. new work will be in new session with new branch."

So: make the session lifecycle explicit in MACP — owner-opened, one work per
session, owner-sealed, passkey to reopen — and then bring the fourteen existing
sessions into that state.

## This session was opened on the owner's instruction

Recorded because MACP now says an agent does not create sessions. This one was
created because the owner said "new work will be in new session with new
branch" in the same breath as the work order. It is the only session in the
repository that can say that, and that is the point of recording it.

## What was found before anything was changed

`[FACT]` Fourteen session files, and the record had already drifted from itself:

| #   | finding                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `state/INDEX.md` listed **HX04** as IN-PROGRESS while its own file said COMPLETED — for three weeks.                                                                                                              |
| 2   | **OC01** was IN-PROGRESS since 2026-10-09. Its work merged as **#184** on 2026-10-09, and its four follow-ups were all resolved: #174 closed, #180 closed, #176–#179 merged. Nothing was left to do but close it. |
| 3   | No session recorded **which harness** ran it, or any pointer to that harness's own transcript. Two of the three agents here are not WorkBuddy.                                                                    |
| 4   | `COMPLETED` meant "the agent says it is finished". Nothing recorded that the **owner** closed it, and nothing stopped a completed file being edited afterwards.                                                   |

`[FACT]` Every session branch is merged or gone: no session has unmerged work on
the remote. The only outstanding item was OC01's status.

## What this session changed

- `docs/macp.md` — new section 4C, the lifecycle and the seal.
- `scripts/check-sessions.mjs` — the gate: required fields, one status
  vocabulary, a close block on every sealed session, immutability of a sealed
  file against the commit that sealed it, INDEX and REGISTRY consistency.
- all fourteen session files — `Harness:`, `History:`, `Status: CLOSED`,
  `Closed:`, and a `## Close` block quoting the owner's instruction.
- `state/INDEX.md` — one table, generated from the files.
- `state/REGISTRY.md` — no active agents, sealed sessions listed with their
  close date.
- `.github/workflows/protocol-check.yml` — the gate runs in the close job.

## Not claimed

- `[UNVERIFIED]` The passkey is an **audit** control, not a security control.
  Anyone with the checkout can write these files; what the seal buys is that an
  edit after closing is a readable diff against a named commit. The protocol
  says so in those words rather than implying protection it does not have.
- `[FACT]` No harness transcript is exported into this repository, for any
  session. `History:` says that instead of inventing a reference.

### 11:35 — Commit

`800a029` docs(macp): sessions are opened and sealed by the owner

### 11:39 — Commit

`73cec8a` docs(state): classify SA10 and add the changeset

### 11:44 — Commit

`442812d` docs(state): record SA10's outcome and the PR it ships in

---

## Outcome — COMPLETED, awaiting the owner's seal

`[FACT]` **PR #248** — 13 checks pass, CLEAN/MERGEABLE. Gates on this branch:
`docs:all` clean, lint, typecheck, format, `actions:pin --check`, **1466 passed /
1 skipped**.

`[FACT]` Both protocol gates pass on this tree:
`check-sessions.mjs` → `sessions: OK (15 files · 14 sealed · 0 findings)`, and
`check-protocol.mjs` → all four checks PASS.

`[FACT]` The gate was watched failing five times before being trusted, each
mutation restored byte-identical: editing a sealed file, dropping a `## Close`
block, listing a sealed session as active, INDEX disagreeing with a file, and
reopening without a passkey.

`[TODO]` This session is `COMPLETED`, not `CLOSED`. Closing it is the owner's
act — `## Close` with an instruction, a date, an outcome and a passkey line.

## Outcome — COMPLETED, awaiting the owner's seal

`[FACT]` **PR #248** — 13 checks pass, CLEAN/MERGEABLE. Gates on this branch:
`docs:all` clean, lint, typecheck, format, `actions:pin --check`, **1466 passed /
1 skipped**.

`[FACT]` Both protocol gates pass on this tree:
`check-sessions.mjs` → `sessions: OK (15 files · 14 sealed · 0 findings)`, and
`check-protocol.mjs` → all four checks PASS.

`[FACT]` The gate was watched failing five times before being trusted, each
mutation restored byte-identical: editing a sealed file, dropping a `## Close`
block, listing a sealed session as active, INDEX disagreeing with a file, and
reopening without a passkey.

`[TODO]` This session is `COMPLETED`, not `CLOSED`. Closing it is the owner's
act — `## Close` with an instruction, a date, an outcome and a passkey line.
