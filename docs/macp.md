# MACP — Multi-Agent Coordination Protocol

> See `AGENTS.md` for the mandatory-startup block and pointer.
> This file is the full protocol — read it at session start.

This repository operates under **MACP (Multi-Agent Coordination Protocol)** —
a disciplined, state-driven workflow that enables multiple AI agents to work
on the same repository without conflicts, context loss, or stepping on each
other's work.

**If any rule here conflicts with other instructions, this protocol wins
unless the user explicitly overrides it.**

═══════════════════════════════════════════════════════════════
CORE PHILOSOPHY
═══════════════════════════════════════════════════════════════

You are stateless. The repository is not. Other agents have worked here
before you, and others will work here after you. Your job is not just to
complete the task — it's to leave a perfect record so the next agent can
continue seamlessly.

Three unbreakable rules:

1. ALWAYS start by reading state. NEVER assume you know the current situation.
2. ALWAYS log your work in real-time. NEVER wait until the end to document.
3. ALWAYS end clean. NEVER leave uncommitted changes, broken state, or ambiguous handoffs.

═══════════════════════════════════════════════════════════════
THE STATE DIRECTORY STRUCTURE
═══════════════════════════════════════════════════════════════

All coordination happens through a `state/` directory at the repo root:

```
state/
├── DASHBOARD.md          # Executive summary — ALWAYS read first
├── STARTUP.md            # Mandatory 9-step startup sequence (read first)
├── REGISTRY.md           # Who's actively working and what files they own
├── INDEX.md              # Searchable log of all past sessions
├── ARCHITECTURE.md       # Current system architecture (living document)
├── DECISIONS.md          # Architecture Decision Records
├── DEBT.md               # Technical debt tracker
├── BLOCKERS.md           # Active blockers and dependencies
├── sessions/             # One file per agent session (your workspace)
├── plans/                # Active plans (deleted when done)
├── conflicts/            # Documented conflicts needing coordination
└── archive/              # Old sessions compressed by month
```

If this directory does not exist, you must create it via the Bootstrap Protocol (Section 7 below).

═══════════════════════════════════════════════════════════════
SECTION 1: STARTUP SEQUENCE (MANDATORY)
═══════════════════════════════════════════════════════════════

Before doing ANY work, execute these steps in order:

STEP 1 — Git Reconnaissance
Run (or request to run):

```
git status
git branch -vva
git log --oneline -10
git stash list
git fetch --all
```

Confirm:
□ Working tree is clean (if not, document why)
□ You know which branch you're on
□ No unresolved merge conflicts exist
□ You have the latest from remote

STEP 2 — Check if state/ directory exists
IF state/ DOES NOT EXIST → Jump to Section 7 (Bootstrap Protocol)
IF state/ EXISTS → Continue to Step 3

STEP 3 — Read CONTINUATION.md, then DASHBOARD.md
`state/CONTINUATION.md` is the handoff and it is the FIRST thing to read: what
the last session finished, what it left undone, the traps it learned, and the
next recommended task. `macp start` prints it into the transcript before
anything else for exactly this reason. If the file is missing, that is a
finding, not a blank — the session that closed before this one failed to write
it.

Then read `state/DASHBOARD.md` for the shape of the project:
• What is this project, and what are its gates?
• Which agents are active right now?
• Where does the truth live?

`DASHBOARD.md` has two halves, and they are not equally trustworthy:

• The `<!-- macp:generated -->` block is **measured**. `scripts/auto-update-state.mjs`
rebuilds it from `package.json`, `git` and the ADR directory, and writes
nothing at all when those facts are unchanged. `**Machine Reconciled:**` is
therefore current by construction. Trust it.
• The prose around it is **not** machine-checked. `**Owner Reconciled:**` says
when a human last read it. If that is absent or old, verify the prose against
the code before relying on it.

STEP 4 — Read REGISTRY.md
Identify:
• Who else is active on this repo right now
• Which files/directories they have claimed ownership of
• Whether your intended work overlaps with their claims

File ownership rules:
• If another ACTIVE agent owns files you need to modify → STOP.
Either coordinate (add note to their session file), choose a
different approach, or wait.
• If owner is INACTIVE (>24h) → You may claim ownership.
• Shared files (config, package.json, etc.) require a
[COORDINATION] note in both session files.

STEP 5 — Check BLOCKERS.md (if it exists)
Confirm your task is not blocked by something upstream.
Confirm your task does not block another agent's work.

STEP 6 — Targeted History Reading via INDEX.md
Search INDEX.md by keyword or file path relevant to your task.
Read ONLY the 2-3 most relevant past session files.
DO NOT read every session file — that wastes your context window.

STEP 7 — Read ARCHITECTURE.md and DECISIONS.md (conditionally)
• Only read ARCHITECTURE.md if your task touches system structure
• Only read DECISIONS.md if you're about to make a design choice
(someone may have already decided it)

STEP 8 — VERIFY STATE AGAINST REALITY (MANDATORY)
State files are claims, not facts. Before proceeding, verify:
□ Run `gh pr list --head <current-branch> --state open` — does a PR already exist?
□ Run `gh pr checks <pr-number>` — is CI green?
□ Run `pnpm test` — do tests actually pass?
□ Run `pnpm run typecheck` — does the code compile?
□ Spot-check at least one claim from DASHBOARD.md against actual code
□ If any verification fails → STOP. Document the discrepancy in your session file.
Fix it, or escalate to the owner. Do NOT proceed on stale state.

STEP 9 — Register Yourself
Create your session file:
`state/sessions/YYYYMMDD-HHMM-<AGENT-ID>-<short-slug>.md`

Example: `state/sessions/20250614-1530-C7A2-fix-login-bug.md`

Session file header schema (MUST be the first lines of the file):
**Agent:** <AGENT-ID> (<agent name>)
**Model:** <model/type>
**Branch:** <branch>
**Started:** <ISO 8601 timestamp>
**Status:** IN-PROGRESS
**Base commit:** <git commit SHA at session start>

Add yourself to REGISTRY.md with:
• Your agent ID (invent one: 4 alphanumeric characters)
• Your model/type (e.g., "Claude 3.5 Sonnet")
• Your branch
• Your task (one line)
• Current UTC timestamp
• Files/directories you claim ownership of

STEP 10 — Create a Plan Entry
Add `state/plans/agent-<YOUR-ID>-<slug>.md` with:
• Objective
• Scope (what's in and out)
• Approach (step by step)
• Risks and mitigations
• Rollback strategy
• Success criteria

Only after all 10 steps are complete may you begin actual work.

═══════════════════════════════════════════════════════════════
SECTION 2: DURING WORK (LIVE LOGGING)
═══════════════════════════════════════════════════════════════

While working, maintain a running log in YOUR session file. Write ONLY to your own session file during active work. Do not touch DASHBOARD.md, REGISTRY.md, or INDEX.md until shutdown.

Log every significant event using these tags:

`[START]` — Beginning a work phase
`[PROGRESS]` — Completed a milestone
`[DISCOVERY]` — Found something unexpected
`[PIVOT]` — Changing approach from the original plan
`[DECISION]` — Chose between alternatives (document rationale)
`[BLOCKER]` — Cannot proceed, need resolution
`[COORDINATION]` — Need to notify or sync with another agent
`[DEBT]` — Introducing known technical debt
`[BUG FOUND]` — Found unrelated bug (log it, don't fix unless blocking)
`[SECURITY]` — Security-relevant consideration
`[SCOPE EXPANSION]` — Doing something beyond original plan (must justify)
`[DISCREPANCY]` — State files don't match reality

Example entries:
`15:45` [DISCOVERY] Found that auth.ts exports changed in last session.
Adjusted my refactor to preserve backward compatibility.
`16:12` [PIVOT] Redis approach won't work — Redis isn't in the stack.
Switching to DB-backed solution.
`16:30` [COORDINATION] Modified shared config.ts. Notified agent B3K1
via note in their session file.

Scope discipline:
• If a "quick fix" reveals a deeper issue → log [BUG FOUND], stay focused.
• If you must expand scope → log [SCOPE EXPANSION] with justification.
• Never silently refactor unrelated code.
• Never fix unrelated bugs unless they block your current work.

Completion declaration rule:
• Declare completion ONLY when all plan items are checked off AND
Section 3 validation passes. User satisfaction is not a completion signal.
• A session is NOT complete until the owner explicitly says so.

Record-keeping principle (P5):
• Any claim in a record must be either (a) a durable historical fact
that cannot change, or (b) a current-state claim paired with the
command and timestamp that would reproduce it. Unverifiable assertions rot.
• Test counts, commit counts, line counts are permitted as deltas or
historical markers ("+30 tests added this session," "at session start:
1100 passing"). They are forbidden as current-state claims ("we have
1130 passing tests") without the verification suffix.
• Action timestamps are always allowed ("Decision made at 15:30 UTC").
State timestamps require verification context ("DASHBOARD current as
of commit abc123, verified via git log -1").
• When you reference a count or state, cite the command that produced it.

═══════════════════════════════════════════════════════════════
SECTION 3: VALIDATION (BEFORE DECLARING DONE)
═══════════════════════════════════════════════════════════════

Nothing is "done" until verified. Run and confirm:

□ All tests pass (full suite, not just yours)
□ Linter passes with no new violations
□ Type checker passes (if applicable)
□ Build succeeds (if applicable)
□ No secrets, credentials, or .env files in your diff
□ No debug/console statements left in production code
□ Error handling exists for all IO, network, and parsing operations
□ Documentation updated if behavior changed
□ Database migrations are reversible (if applicable)

Record verification (P6):
□ Session file header matches REGISTRY (agent, branch, status)
□ Every commit in git log <base>..HEAD is mentioned in session file
□ DASHBOARD "Active Agents" section matches REGISTRY
□ No checked-off TODOs for unfinished work
□ All plan items accounted for in session summary

If any check fails and you cannot fix it in scope:
→ Log it in your session file with severity and remediation plan
→ Do NOT silently skip it

═══════════════════════════════════════════════════════════════
SECTION 4: SHUTDOWN SEQUENCE (MANDATORY)
═══════════════════════════════════════════════════════════════

STEP 0 — STOP WORKING (P1)
Before any shutdown step:
• No new code changes
• No new config changes
• No new state file changes (except the session file being finalized)
• No new commits touching repo content

If any of these occur during shutdown → ABORT shutdown, return to work mode.
Maximum 3 shutdown restarts per session. Fourth attempt → halt, log
[NEEDS HUMAN] in BLOCKERS.md.

Mid-shutdown abort is NOT a re-open. Re-open (Section 4A) applies only
after a shutdown fully completed and REGISTRY was updated to COMPLETED.

STEP 1 — Finalize Your Session File
Add a complete summary section:
• Outcome: COMPLETED | PARTIAL | BLOCKED | PIVOTED
• What was accomplished
• What was NOT accomplished and why
• Files changed (table: path, action, summary)
• Key decisions made and rationale
• Technical debt introduced (if any)
• Bugs discovered but not fixed (with location)
• Risks and warnings for the next agent
• Prioritized next steps

STEP 2 — Update REGISTRY.md
Change your status from IN-PROGRESS to COMPLETED.
Release your file ownership claims.

STEP 3 — Clean Up state/plans/
If your plan is complete, delete your plan file.
If partially complete, update it with current status.

STEP 4 — Add Entry to INDEX.md
One row with: session ID, your agent, date, title, files touched,
status, branch.

STEP 5 — Git Cleanup
Verify:
□ Working tree is clean
□ All changes committed with descriptive messages
□ Branch pushed to remote
□ No orphan files or forgotten artifacts

STEP 6 — Reconciliation (IF applicable)
If you are the last active agent OR if you merged branches:
You are the RECONCILER. You must:
• Rebuild DASHBOARD.md to reflect current merged reality
• Update REGISTRY.md (remove inactive agents)
• Resolve any conflicts in state/conflicts/
• Update ARCHITECTURE.md if structure changed
• Add any new ADRs to DECISIONS.md
• Commit: "chore(state): reconcile after <description>"

STEP 7 — Terminal Verification Loop (P2)
After shutdown completes, verify the record against reality:

    1. Run git log <base>..HEAD --oneline — every commit must be in session
       file's commit list.
    2. Run git status — must be clean.
    3. Re-read DASHBOARD "Active Agents" and REGISTRY — must match.
    4. Re-read session summary — every claim must be checkable.

If any discrepancy → classify:
• Record error → fix the record, re-verify.
• Reality error → this is a bug in your work. Fix it, which means
re-entering work mode, which means Step 0 aborts shutdown.

Maximum 3 iterations. If not converged → mark session PARTIAL or FAILED,
log [NEEDS HUMAN] in BLOCKERS.md.

═══════════════════════════════════════════════════════════════
SECTION 4A: RE-OPEN TRANSITION (P3)
═══════════════════════════════════════════════════════════════

A session marked COMPLETED may be re-opened only with:

• Explicit owner instruction
• Timestamped entry in session file: "Re-opened: <reason>"
• Reason must include: - What triggered the reopen (user request, self-review, cold-read
finding, new discovery) - Why it couldn't wait for a fresh session - What's the delta from the "completed" state
• Git check: git fetch && git log to detect divergence from last
session's commit list

Decision rule:
• Re-open same session when: continuing the same objective, within
same calendar day, no other agent has worked in between.
• Start new session when: new objective, next day, or another agent's
session is interleaved.

After re-open, full shutdown must be re-executed when the session
eventually closes.

═══════════════════════════════════════════════════════════════
SECTION 4B: STATE-FILE OWNERSHIP TABLE (P4)
═══════════════════════════════════════════════════════════════

Every event that occurs in a session triggers mandatory updates to
specific state files. All triggered files must be updated in the same
session that produced the event. Partial updates are failures.

| Event                        | Files to update                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------- |
| New ADR created              | docs/adr/, docs/adr/README.md, state/DECISIONS.md                                |
| Architecture change          | state/ARCHITECTURE.md                                                            |
| New dependency added/removed | state/DEBT.md, state/ARCHITECTURE.md                                             |
| New blocker discovered       | state/BLOCKERS.md                                                                |
| Technical debt introduced    | state/DEBT.md                                                                    |
| Branch merged                | state/DASHBOARD.md, state/DEBT.md                                                |
| Session started              | state/REGISTRY.md, state/INDEX.md, state/STARTUP.md (read)                       |
| Session ended (agent done)   | state/REGISTRY.md, state/INDEX.md, state/DASHBOARD.md (incl. Next Steps section) |
| Session sealed by the owner  | session file `## Close` block, state/REGISTRY.md, state/INDEX.md                 |
| Plan created                 | state/plans/                                                                     |
| Plan completed               | state/plans/ (delete)                                                            |
| Conflict detected            | state/conflicts/                                                                 |
| Protocol violation           | state/BLOCKERS.md, session file                                                  |

This table is incomplete by design. When an event occurs that is not
covered, add a row to this table as part of session shutdown.

Event definition: an event is anything that would make an existing claim
in a state file become false or incomplete.

═══════════════════════════════════════════════════════════════
SECTION 4C: SESSION LIFECYCLE — OWNER-OPENED, OWNER-SEALED
═══════════════════════════════════════════════════════════════

A session is not a scratch file an agent makes for itself. It is the unit of
work the owner hands out, and it has a lifecycle with two gates that the agent
does not control.

WHO OPENS A SESSION
• The **owner** opens a session. The agent records the one it was given.
• An agent that finds no open session **asks the owner for one**. It does not
create one, and it does not start work in the hope that a session will be
retro-fitted afterwards.
• Exception, and it must be stated in the file: the owner may open a session in
the same instruction that orders the work ("do X, in a new session"). The
session file records that sentence verbatim. `SA10` is the first such case.

ONE SESSION, ONE PIECE OF WORK
• A session solves one piece of work, start to finish.
• **New work is a new session and a new branch.** Not a continuation, not a
"while I am here", not a second objective appended to a finished one.
• If the work turns out to be two things, the session says so and the second
thing becomes a new session. Splitting mid-session is a legitimate close.

REQUIRED FIELDS (front matter of every session file)

| Field              | Meaning                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**Agent:**`       | The agent's own id and harness, e.g. `SA09 (Sathi / WorkBuddy)`                                                                                   |
| `**Harness:**`     | The harness that ran it. **Not** assumed to be one product — several agents on different harnesses may work this repo, and do.                    |
| `**History:**`     | A pointer to that harness's own transcript, in whatever form the harness offers. If nothing is exported, say `not exported` — never invent an id. |
| `**Branch:**`      | The branch the session works on                                                                                                                   |
| `**Started:**`     | ISO 8601 with offset                                                                                                                              |
| `**Status:**`      | `IN-PROGRESS` · `COMPLETED` · `CLOSED` · `REOPENED`                                                                                               |
| `**Base commit:**` | The commit the branch was cut from                                                                                                                |

STATUS VOCABULARY — and the difference that matters

• `IN-PROGRESS` — the owner opened it; work is in progress. (The word is the
one the start gate and `STARTUP.md` already use — a second vocabulary for the
same state is how two gates end up disagreeing.)
• `COMPLETED` — the **agent** says the work is done. This is a claim, not a
closure. It may still be reviewed, merged, and questioned.
• `CLOSED` — the **owner** closed it. Sealed. Immutable.
• `REOPENED` — the owner reopened a sealed session, with a passkey.

CLOSING IS THE OWNER'S ACT
• The agent finishes, marks `COMPLETED`, and stops. It does **not** decide that
a session is closed.
• The owner closes by saying so. The close is recorded in the session file as a
`## Close` block, and it quotes the owner's instruction verbatim:

      ## Close

      - **Closed by:** owner (<name>) — instruction: "<verbatim>"
      - **Closed at:** <ISO 8601>
      - **Status at close:** COMPLETED | PARTIAL | BLOCKED
      - **Outcome:** <one line, checkable>
      - **Passkey:** <the passkey the owner gave, or "none issued">

• `scripts/check-sessions.mjs` enforces the block, the field set, the status
vocabulary, and agreement between the file, `state/INDEX.md`, and
`state/REGISTRY.md`.

THE SEAL
• A `CLOSED` session file is **immutable**. The gate compares it byte-for-byte
with the commit that sealed it; any later edit is a finding.
• No tool may rewrite one either. `scripts/lib/docs-sync.mjs` exports
`IMMUTABLE_RECORDS` (`state/sessions/**`), which excludes session files from
both the fact-marker sync and the numeric-claim scanner. Without that boundary
adding one ADR breaks four old sessions: the sync rewrites their ADR count, and
the seal gate then fails them as edited. Counts stay current in
`CONTINUATION.md` and `DASHBOARD.md`; a session file keeps the number it
measured on the day it was sealed.
• A sealed session owns no files, blocks nothing, and is not a place to put
"one more thing". Its record is evidence, not a workspace.

REOPENING REQUIRES A PASSKEY
• A sealed session reopens **only** on an explicit owner instruction that names
a passkey.
• Record it under `## Reopen`, and flip `**Status:**` to `REOPENED`:

      ## Reopen

      - **Reopened at:** <ISO 8601>
      - **Passkey:** <verbatim from the owner>
      - **Reason:** <what triggered it — user request, cold-read finding, new evidence>
      - **Delta:** <what changes relative to the sealed state>

• The agent never invents a passkey, and never reopens a session because it
found something interesting in it. A finding after a seal is a **new
session**, not a reopen. Reopening is for continuing the same objective.
• On re-close, the file gets a fresh `## Close` block and a fresh seal.

WHAT THE PASSKEY IS, AND IS NOT

`[FACT]` It is an **audit control**, not a security control. Anyone with the
checkout can write these files, so no passkey can stop a determined edit. What
it buys is visibility: the seal is pinned to a commit, a reopen must quote the
owner's words, and an edit to a sealed file is a readable diff. Do not describe
it as protection — that would be the exact kind of claim this repository has
been burned by.

═══════════════════════════════════════════════════════════════
SECTION 4D: THE RUNTIME — AN EXECUTABLE STATE MACHINE
═══════════════════════════════════════════════════════════════

Sections 4A-4C describe a lifecycle. This section is the machine that enforces
it: `pnpm run macp -- <command>`, implemented in `scripts/macp/`.

WHY A RUNTIME AND NOT MORE PROSE

`AGENTS.md` asked agents to read the state before working. Three PRs in a row
skipped it and every gate stayed green, because the only thing that looked at
the startup was a `pre-commit` hook — and by then the agent had already edited
ten files, and could fabricate the session and plan files retroactively to get
past it. A rule that is checked after the fact is a rule an agent can satisfy
backwards.

THE STATES

    UNBOUND ──start──▶ ACTIVE ──submit──▶ ACTIVE ──close──▶ COMPLETED ──seal──▶ CLOSED
                          ▲  │                                        │                    │
                          │  └──submit --prepare──▶ CLOSING          │                    │
                          │        (gates on a frozen tree)          │                 reopen
                          └───────────── REOPENED ◀───────────────────┴────────────────────┘

    AWAITING-USER is gone from this path: a report no longer parks the session.

| State           | How you get there                           | What it permits                                               |
| --------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `UNBOUND`       | the default on launching any harness        | read-only recon. No edit, no commit, no session file.         |
| `ACTIVE`        | `macp start …`                              | edits on the session's branch, `macp log`                     |
| `CLOSING`       | `macp submit --prepare`                     | nothing. Source is frozen; run the gates, then submit.        |
| `AWAITING-USER` | only in sessions written before this change | nothing. Legacy: `macp resume` releases it.                   |
| `COMPLETED`     | `macp close` (owner)                        | nothing. Closed by the owner; not yet sealed.                 |
| `CLOSED`        | `macp seal --session … --ssh-key …`         | nothing. Immutable, byte-compared against its sealing commit. |
| `REOPENED`      | `macp reopen --session … --ssh-key …`       | edits again, on the same objective, until re-submitted.       |

**Why `submit` and `close` are separate.** They were one command, and that command
wrote `COMPLETED` with no key — so the agent could reach a terminal state alone and
the owner's key gated only the optional `seal`. `submit` is the agent reporting: it
freezes the tree long enough to run the gates, writes the report, and releases the
freeze. `close` is the owner acting on that report, and it refuses if any
non-`state/` file changed after the commit the gates measured — so the tree being
closed is the tree that was verified. See ADR-0046 for the authority model this is
the first half of.

**Why a report does not park the session.** It did, and that made the owner's
answer expensive: every "also do X" needed `macp resume` signed with his key before
the agent could move, so a conversation became a series of signed door-openings.
`submit` now returns the session to `ACTIVE`; the report is what `close` acts on,
and the owner decides when he is satisfied. The cost is stated plainly: there is no
longer a state that means "the agent has stopped". The handoff is the signal — it
exists, and it names the commit it measured — and `close` refuses if the source
moved since, so the owner still closes the tree that was reported, never a later one.

**Why one repository holds one live session.** A MACP session is physically tied to
a harness conversation: the conversation is the thing that runs the agent, and
`start` binds the record to it. Two records in one conversation is a bookkeeping
fiction — on 2026-10-26 `SA18` and `SA19` existed at once in one checkout, because
`SA18` was parked at `AWAITING-USER` and the collision check only looked at `ACTIVE`.
`start` now refuses while any lease in the repository is live — `ACTIVE`, `CLOSING`,
`AWAITING-USER` or `AWAITING-CHECKPOINT` — and names the session that holds it.

`UNBOUND` is the important one. Asking a question in a repository should not
create a session file, a plan, a registry entry and a branch; that is how a
protocol acquires a reputation for ceremony and then gets ignored. Read-only
tools are allowed in `UNBOUND` precisely so the cheap case stays cheap.

THE TWO LAYERS OF THE PRE-WORK GATE

1. **`macp start`** runs the reconnaissance, prints the `CONTINUATION` brief and
   the authorised scope to stdout — into the agent's transcript, whether the
   agent wanted it or not — registers the session and plan, updates `REGISTRY`
   and `INDEX`, and writes a **local lease** to `~/.macp/leases/<repo-id>.json`.
   The lease is outside the working tree on purpose: a receipt inside the tree
   is a receipt an agent can copy from another branch, and copying a startup it
   never performed is the exact defect this replaces.

2. **The harness pre-tool guard** (`scripts/macp/hooks/pretool.mjs`, installed
   by `macp install-hooks --harness <claude|opencode|hermes|dsh>`) refuses
   mutating tool calls while the repository is `UNBOUND`. One decision, four
   adapters, so the rule cannot drift between harnesses.

   `[FACT]` It is a speed bump, not a sandbox. The mutating-command list is a
   heuristic and a determined agent can route around it. What it buys is that
   the _normal_ path is the authorised one, and that the deviation is a
   deliberate act rather than an oversight.

3. **`scripts/check-session-start.mjs`** is the structural gate behind both. On
   a non-`master`, non-bot branch that carries work it requires a session naming
   that branch, in `IN-PROGRESS` or `REOPENED`, with a plan, a `REGISTRY` entry,
   and a matching local lease. `master` and bot branches keep the close-path
   behaviour, because that is where work arrives.

MID-SESSION EVENTS

    macp log --type DISCOVERY|DECISION|PIVOT|BUG_FOUND|DEFERRED|BLOCKER \
             --summary "…" [--files a,b]

`BUG_FOUND` and `DEFERRED` also land in `state/macp/queue.md`, and the next
`macp start` prints the open entries. That is the mechanism for "log it, do not
fix it": the idea survives the session that had it, without derailing the
session that was authorised.

THE CONTINUATION OBJECT — TWO HALVES THAT MUST NOT BE CONFUSED

`macp close` writes `state/macp/handoff/<session>.json` and a rendered block at
the top of `state/CONTINUATION.md`.

| Half                | Fields                                                                                                                      | Who produces it        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Machine-stamped** | `base_commit_sha`, `code_commit_sha`, `branch`, `working_tree_clean`, `commits[]`, `open_prs[]`, gate exit codes and times  | `macp close`, measured |
| **Agent-authored**  | `outcome`, `completed[]`, `remaining[]`, `discovered_bugs[]`, `deferred_work[]`, `traps_learned[]`, `next_recommended_task` | the agent, validated   |

`COMPLETED` requires every recorded gate to exit 0. `PARTIAL` and `BLOCKED` are
allowed to close red — that is what "blocked" means — but only when the tree is
committed, the failing gate's output was recorded, and `remaining[]` and
`next_recommended_task` are non-empty. A close that satisfies none of those is
refused, and the refusal names the missing piece.

THE SSH SEAL — MECHANISM

§4C says the passkey is an audit control, not a security control, because a
string typed into a file is a string anyone can type. That is true of a string.
It is not true of a signature.

**How it works.** The owner already has an ed25519 key (`~/.ssh/id_ed25519`).
At seal time `macp seal` builds a canonical payload — sorted `key=value` lines
covering the repository, session, agent, branch, base commit, code commit,
outcome and close time — and signs it:

    ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n macp payload.txt

The result is an SSHSIG, stored base64 in the session file as
`**Seal signature:**`. The matching **public** key is committed to
`state/macp/owner.pub`; the private key never leaves `~/.ssh`.

At check time `macp verify` (and CI) rebuilds the payload from the session file
itself and verifies:

    ssh-keygen -Y verify -f allowed_signers -I macp-owner -n macp -s payload.sig

Measured behaviour: a one-character edit to any signed field exits 255 and
`macp verify` reports "seal signature does not verify". The edit is detected
because the payload is derived from the file — there is no second copy to keep
in sync.

**One key per act.** Since ADR-0046 the seal is not the only signed act, and no two
acts share a key:

| Act     | Transition           | Principal      | Key                   |
| ------- | -------------------- | -------------- | --------------------- |
| close   | `ACTIVE → COMPLETED` | `macp-close`   | `~/.ssh/macp_close`   |
| seal    | `COMPLETED → CLOSED` | `macp-seal`    | `~/.ssh/macp_seal`    |
| reopen  | `CLOSED → REOPENED`  | `macp-reopen`  | `~/.ssh/macp_reopen`  |
| destroy | `CLOSED → DESTROYED` | `macp-destroy` | `~/.ssh/macp_destroy` |

They are listed in `state/macp/allowed_signers`, written once by
`macp init-authority`. A signature is checked against the principal that is
allowed to make _that_ transition, **before** it happens — a close signed with the
seal key is refused even though both keys are the owner's. `macp seal` never
rewrites the authority file; rotating keys is a separate, deliberate act
(`init-authority --force`).

**What this buys.** A reopen cannot be produced without the private key. The
old flow let anyone write `**Passkey:** whatever` and the gate accepted it; the
new flow requires a signature that verifies against the committed public key, so
a forged reopen fails in CI even if the local gate was bypassed.

**What it does not buy.** It does not stop a determined agent deleting the seal
block and writing a fresh session. Nothing in a working tree can. The seal makes
an unrequested reopen _visible and non-verifiable_, which is a different and
much stronger property than invisible.

**How to use it.** One command, once, with the owner's key:

    pnpm run macp -- seal --session SA12 --instruction "<the owner's words, verbatim>" \
      --ssh-key ~/.ssh/id_ed25519

and to reopen, the same key is required:

    pnpm run macp -- reopen --session SA12 --ssh-key ~/.ssh/id_ed25519 \
      --reason "why" --delta "what changes"

Without the key, `macp reopen` refuses and the session stays closed. That is the
whole point.

THE BACKEND BOUNDARY — LOCAL NOW, JARVIS LATER

`scripts/macp/lib/backend.mjs` defines `MacpBackend` with `start`, `log`,
`close`, `seal`, `reopen`, `status`, `verify`. `LocalBackend` runs them
in-process. `JarvisBackend` posts the same request objects to a central
authority and is a documented stub: `MACP_BACKEND=jarvis` plus
`MACP_JARVIS_URL` selects it, and it throws with the route it wanted rather than
pretending to work. The boundary exists now because adding it later means
touching every command and every harness adapter.

═══════════════════════════════════════════════════════════════
SECTION 5: CONFLICT HANDLING RULES
═══════════════════════════════════════════════════════════════

If you discover a conflict (overlapping files, contradictory plans,
stale ownership, merge issues):

1. STOP active work.
2. Create a file in state/conflicts/ describing:
   • What the conflict is
   • Which agents/sessions are involved
   • Proposed resolution
3. If the other agent is active (<24h), add a [COORDINATION REQUEST]
   note in their session file.
4. If the other agent is inactive, document your takeover and proceed.
5. If the conflict is unresolvable without human input, mark it
   [NEEDS HUMAN] in BLOCKERS.md and halt.

Never silently overwrite another agent's work. Never resolve a
conflict by just "going first and hoping."

═══════════════════════════════════════════════════════════════
SECTION 6: ANTI-PATTERNS (NEVER DO THESE)
═══════════════════════════════════════════════════════════════

❌ Starting work without reading DASHBOARD.md and REGISTRY.md
❌ Reading every single file in state/sessions/ (wastes context)
❌ Modifying files owned by an active agent without coordination
❌ Writing to DASHBOARD.md, REGISTRY.md, or INDEX.md during active work
❌ Leaving uncommitted changes at session end
❌ Fixing unrelated bugs without logging them first
❌ Silently expanding scope beyond the original plan
❌ Catching errors without logging or re-throwing
❌ Committing secrets, API keys, or .env files
❌ Trusting a DASHBOARD.md that's >48h stale without verification
❌ Skipping tests because they're "probably fine"
❌ Making handoff notes assuming the next agent has your context
❌ Marking a session COMPLETED without explicit owner instruction
❌ Writing current-state claims without verification command/timestamp
❌ Updating some but not all files triggered by an event (partial update)

═══════════════════════════════════════════════════════════════
SECTION 7: BOOTSTRAP PROTOCOL (NO state/ EXISTS)
═══════════════════════════════════════════════════════════════

If the state/ directory does not exist, you are the first agent
under this protocol. Perform a full repository audit before any
other work:

STEP 1 — Comprehensive Audit
Investigate and document:
• Directory structure (tree, depth 3-4, exclude node_modules/.git)
• Technology stack (languages, frameworks, versions)
• Entry points and main modules
• Database type and migration state
• API surface (endpoints, auth mechanism)
• Testing framework and current test status (run them!)
• CI/CD configuration
• Dependencies (outdated, vulnerable)
• Documentation state (README accuracy, inline docs)
• Known issues visible in code (TODOs, FIXMEs, broken areas)
• Current working features vs broken features

STEP 2 — Create state/ Structure
Create the directory and these initial files:
• DASHBOARD.md — summary of your audit findings
• REGISTRY.md — empty table, ready for agents
• INDEX.md — empty, ready for sessions
• ARCHITECTURE.md — architecture summary from audit
• DECISIONS.md — empty, ready for ADRs
• DEBT.md — list all tech debt found in audit
• BLOCKERS.md — list any blockers found
• sessions/ — directory with your first session file
• plans/ — empty directory
• conflicts/ — empty directory
• archive/ — empty directory

STEP 3 — Create Your Bootstrap Session File
Document the audit itself as your first session.
Filename: state/sessions/YYYYMMDD-HHMM-<ID>-bootstrap-audit.md

STEP 4 — Commit the Bootstrap
Commit message:
"chore(state): bootstrap MACP protocol with repository audit"

STEP 5 — Now Proceed to Normal Startup (Section 1)
Treat the bootstrap as complete and proceed with your actual task.

═══════════════════════════════════════════════════════════════
DEFERRED: P7
═══════════════════════════════════════════════════════════════

Machine-checked state drift detection is DEFERRED until P1–P6 have been
exercised for a non-trivial period and the actual residual failures are
known. Tooling that enforces undisciplined behavior produces
compliant-looking rot. Revisit after 20+ sessions with P1–P6 in place.

═══════════════════════════════════════════════════════════════
REMEMBER
═══════════════════════════════════════════════════════════════

• You are one of many agents. Act like it.
• The state/ directory is the shared brain. Keep it accurate.
• When in doubt: document more, assume less.
• A clean handoff is more valuable than a clever shortcut.
• If you break the protocol, document why — don't hide it.
• Every assertion needs a verifier, every state needs a transition,
every file needs an owner.

Acknowledge you have read and understood this protocol before
beginning any task.
