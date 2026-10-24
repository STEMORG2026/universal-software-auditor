**Agent:** SA10 (Sathi / WorkBuddy)
**Harness:** WorkBuddy
**History:** not exported — the transcript lives in the harness, not the repo
**Branch:** docs/macp-session-seal, docs/continuation-post-243
**Started:** 2026-10-23T18:00+05:45
**Status:** CLOSED
**Closed:** 2026-10-23T18:20+05:45 by owner
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

### 11:49 — Commit

`9da0675` chore(state): auto-update from post-commit hook

---

### 11:50 — Commit

`551ba77` fix(state): the hook maintains the table, and never writes into a seal

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

`[FACT]` The owner closed this session on 2026-10-23, after the work above.
The seal is in `## Close`.

## A second piece of work was absorbed mid-session — recorded, not hidden

`[FACT]` This is the drift §4C now forbids, caught happening in the session
that wrote §4C. After #248 was opened, the owner merged #244 out of order and
2.28.4 published with its provenance step failing, so #245's failing docs check
and the provenance question were worked in this same session, on a different
branch (`docs/continuation-post-243`).

What that produced, all on #245:

- The `Docs & ADR hygiene` failure was a real defect, not staleness:
  `state/CONTINUATION.md:326` carried a bare ADR count of 45 against a real count of
  <!-- usa:fact adrs -->44<!-- /usa:fact -->. Marked with `usa:fact adrs`, which
  also required dropping the file's now-contradictory `standalone` manifest
  entry. Mutation-checked: restoring that bare number reproduced CI's error verbatim.
- Two more figures in the same "every row was run" table were wrong and were
  replaced with measured values: `139 tracked docs` → 138, and
  `1469 / 1470` → `1466 / 1467`.
- The handoff's claim that a master dispatch files "a master build — the honest
  ref" was **wrong**. The 2.28.4 attestation records
  `refs/tags/@xenos1996/usa@2.28.4`, the exact string the selector demands.
- The tarball is not reproducible across environments (local `npm pack` gives
  `cb6c50db…`, the attested digest is `5e24c520…`) but is across runners —
  2.28.3's digest carries three attestations, two from master, one from the tag,
  all on `71e5278cc8d6…`.
- The CHECKPOINT block had every field stale, including a merged PR listed as
  open and a `[TODO]` claiming `provenance/v2.28.0` was unfiled when both files
  have been on master since `e3099d0`.

`[FACT]` The correct response to this is not to fold it in silently. It is the
reason `state/CONTINUATION.md` records the merge order and the provenance gap in
detail, and it is why this section exists.

## Close

- **Closed by:** owner (Sajan Gurung) — instruction: "Close the session after finishing this work."
- **Closed at:** 2026-10-23T18:20+05:45
- **Status at close:** COMPLETED
- **Outcome:** #248's protocol work is complete and CLEAN; #245's docs fix is CLEAN; #246 and #247 are CLEAN and unmerged; 2.28.3 and 2.28.4 still have no provenance bundle.
- **Passkey:** none issued — reopening needs an explicit owner instruction that names one, recorded under `## Reopen`
