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

STEP 3 — Read DASHBOARD.md
This gives you the full picture in <60 seconds:
• What's the current state of the project?
• Which agents are active right now?
• What are the critical alerts and blockers?
• What was recently completed?

Check the "Last Reconciled" timestamp at the top:
• <24h old → Trust it, proceed
• 24-48h old → Verify against git log before trusting
• >48h old → STALE. You must reconcile DASHBOARD.md before working
(read recent session files and rebuild it)

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
| Session ended                | state/REGISTRY.md, state/INDEX.md, state/DASHBOARD.md (incl. Next Steps section) |
| Plan created                 | state/plans/                                                                     |
| Plan completed               | state/plans/ (delete)                                                            |
| Conflict detected            | state/conflicts/                                                                 |
| Protocol violation           | state/BLOCKERS.md, session file                                                  |

This table is incomplete by design. When an event occurs that is not
covered, add a row to this table as part of session shutdown.

Event definition: an event is anything that would make an existing claim
in a state file become false or incomplete.

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
