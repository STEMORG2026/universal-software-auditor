# STARTUP.md — Mandatory MACP Startup Sequence

**Source:** AGENTS.md Section 1 (verbatim, condensed for quick reference)
**Purpose:** Ensure every agent sees the startup sequence immediately upon
reading `state/`, even if they skip AGENTS.md.

---

## The 10-Step Startup Sequence

Before doing ANY work, execute these steps in order:

### STEP 1 — Git Reconnaissance

Run:

```
git status
git branch -vva
git log --oneline -10
git stash list
git fetch --all
```

Confirm:

- Working tree is clean (if not, document why)
- You know which branch you're on
- No unresolved merge conflicts exist
- You have the latest from remote

### STEP 2 — Check if state/ directory exists

- IF state/ DOES NOT EXIST → Jump to Bootstrap Protocol (AGENTS.md Section 7)
- IF state/ EXISTS → Continue to Step 3

### STEP 3 — Read CONTINUATION.md, then DASHBOARD.md

**`state/CONTINUATION.md` is the first read.** It is the handoff: what the last
session finished, what it left undone, the traps it learned, and the next
recommended task. `macp start` prints it into the transcript for exactly this
reason. A missing file is a finding — the previous close failed to write it.

Then read `state/DASHBOARD.md`:

- What's the current state of the project?
- Which agents are active right now?
- Where does the truth live?

`DASHBOARD.md` has a `<!-- macp:generated -->` block that
`scripts/auto-update-state.mjs` rebuilds from `package.json`, `git` and the ADR
directory. `**Machine Reconciled:**` inside it is current by construction.
The prose outside it is not: `**Owner Reconciled:**` is the field a human sets
after reading, and the hook never writes it. Treat absent or old prose as
unverified rather than stale — the distinction matters, because the old rule
("<24h → trust it") trusted a timestamp the hook itself had minted.

### STEP 4 — Read REGISTRY.md

Identify:

- Who else is active on this repo right now
- Which files/directories they have claimed ownership of
- Whether your intended work overlaps with their claims

File ownership rules:

- If another ACTIVE agent owns files you need to modify → STOP.
  Either coordinate (add note to their session file), choose a
  different approach, or wait.
- If owner is INACTIVE (>24h) → You may claim ownership.
- Shared files (config, package.json, etc.) require a
  [COORDINATION] note in both session files.

### STEP 5 — Check BLOCKERS.md (if it exists)

Confirm your task is not blocked by something upstream.
Confirm your task does not block another agent's work.

### STEP 6 — Targeted History Reading via INDEX.md

Search INDEX.md by keyword or file path relevant to your task.
Read ONLY the 2-3 most relevant past session files.
DO NOT read every session file — that wastes your context window.

### STEP 7 — Read ARCHITECTURE.md and DECISIONS.md (conditionally)

- Only read ARCHITECTURE.md if your task touches system structure
- Only read DECISIONS.md if you're about to make a design choice
  (someone may have already decided it)

### STEP 8 — VERIFY STATE AGAINST REALITY (MANDATORY)

State files are claims, not facts. Before proceeding, verify:

- Run `gh pr list --head <current-branch> --state open` — does a PR already exist?
- Run `gh pr checks <pr-number>` — is CI green?
- Run `pnpm test` — do tests actually pass?
- Run `pnpm run typecheck` — does the code compile?
- Spot-check at least one claim from DASHBOARD.md against actual code
- If any verification fails → STOP. Document the discrepancy in your session file.
  Fix it, or escalate to the owner. Do NOT proceed on stale state.

### STEP 9 — Register Yourself

Create your session file:
`state/sessions/YYYYMMDD-HHMM-<AGENT-ID>-<short-slug>.md`

Example: `state/sessions/20250614-1530-C7A2-fix-login-bug.md`

**Session file header schema (MUST be the first lines of the file):**

```
**Agent:** <AGENT-ID> (<agent name>)
**Harness:** <the physical harness that ran this session>
**History:** <pointer to that harness's transcript, or "not exported">
**Branch:** <branch>
**Started:** <ISO 8601 timestamp>
**Status:** IN-PROGRESS
**Base commit:** <git commit SHA at session start>
```

`**Harness:**` and `**History:**` exist because several agents on different
harnesses work this repository, and "which transcript is this" is not answerable
from git. If the harness exports nothing, write `not exported` — never invent an
id.

Add yourself to REGISTRY.md with:

- Your agent ID (invent one: 4 alphanumeric characters)
- Your model/type (e.g., "Claude 3.5 Sonnet")
- Your branch
- Your task (one line)
- Current UTC timestamp
- Files/directories you claim ownership of

### STEP 10 — Create a Plan Entry

Add `state/plans/agent-<YOUR-ID>-<slug>.md` with:

- Objective
- Scope (what's in and out)
- Approach (step by step)
- Risks and mitigations
- Rollback strategy
- Success criteria

---

**Only after all 10 steps are complete may you begin actual work.**

---

## Session Close Checklist (MANDATORY)

`pnpm run macp -- close --outcome COMPLETED|PARTIAL|BLOCKED …` performs steps 1-4
and refuses the close when they are not true. The checklist is below because a
refusal is easier to act on when you know what it is checking.

1. **Working tree clean** — no uncommitted source change. `state/` churn is
   allowed; a source file is not.
2. **Gates run and recorded** — `typecheck`, `lint`, `format`, `test`,
   `docs:all`, `self-audit`, each with an exit code. `COMPLETED` requires all
   green. `PARTIAL` and `BLOCKED` may close red, but only with the failing
   gate's output recorded and `remaining[]` + `next_recommended_task` filled in.
3. **Handoff written** — `state/macp/handoff/<session>.json` plus the rendered
   block at the top of `state/CONTINUATION.md`. The facts in it are measured by
   `macp close`, not typed by the agent.
4. **Session marked COMPLETED** — never CLOSED. Sealing is the owner's act:
   `pnpm run macp -- seal --session <ID> --instruction "<verbatim>" --ssh-key …`
5. **REGISTRY has no active agents** and `INDEX.md` agrees with the session file.

Run `node scripts/check-protocol.mjs` and `node scripts/check-sessions.mjs` — the
first checks the close, the second checks every session record against git.
If any check fails → fix it before closing the session.

## The runtime, in one table

| You want to…               | Run                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| start a session            | `macp start --agent … --harness … --task … --authorized-by …`                                 |
| record a discovery         | `macp log --type DISCOVERY --summary "…"`                                                     |
| park a bug for later       | `macp log --type BUG_FOUND --summary "…" --files a,b`                                         |
| see the parked queue       | `macp queue` · `macp queue --done Q001`                                                       |
| freeze and submit          | `macp submit --prepare`, then `macp submit --outcome …`                                       |
| close (owner only)         | `macp close --ssh-key ~/.ssh/macp_close` — only on `AWAITING-USER`, only if no source changed |
| write the authority        | `macp init-authority --dir ~/.ssh` — once, from the four public keys                          |
| seal (owner only)          | `macp seal --session … --instruction "…" --ssh-key ~/.ssh/macp_seal`                          |
| reopen (owner only)        | `macp reopen --session … --ssh-key ~/.ssh/macp_reopen --reason … --delta …`                   |
| check every seal offline   | `macp verify`                                                                                 |
| onboard another repository | `macp init-repo` · `macp install-hooks --harness …`                                           |

## Session Close is FINAL

When the owner says "close the session", the session is CLOSED. Do NOT reopen it unless:

- The owner explicitly says there is work to do, AND
- The owner paraphrases or confirms they want the session reopened

If the owner says "close the session" and then later says "continue" or "reopen", ASK for paraphrase before reopening. A closed session stays closed until the owner explicitly reopens it with clear intent.

---

## Quick Reference: State File Map

| File              | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `CONTINUATION.md` | The handoff — **read this first**                       |
| `DASHBOARD.md`    | Executive summary, machine facts block                  |
| `REGISTRY.md`     | Who's active and what they own                          |
| `INDEX.md`        | Searchable session log                                  |
| `ARCHITECTURE.md` | System architecture                                     |
| `DECISIONS.md`    | ADR index                                               |
| `DEBT.md`         | Technical debt tracker                                  |
| `BLOCKERS.md`     | Active blockers                                         |
| `STARTUP.md`      | This file — the 10-step sequence                        |
| `sessions/`       | One file per agent session                              |
| `plans/`          | Active plans                                            |
| `macp/queue.md`   | Discoveries and deferred work, surfaced at `macp start` |
| `macp/handoff/`   | Machine-stamped handoff records per session             |
| `macp/owner.pub`  | The public key seals and reopens verify against         |
| `conflicts/`      | Documented conflicts                                    |
| `archive/`        | Old sessions                                            |
