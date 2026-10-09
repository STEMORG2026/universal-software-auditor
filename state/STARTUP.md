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

### STEP 3 — Read DASHBOARD.md

This gives you the full picture in <60 seconds:

- What's the current state of the project?
- Which agents are active right now?
- What are the critical alerts and blockers?
- What was recently completed?

Check the "Last Reconciled" timestamp at the top:

- <24h old → Trust it, proceed
- 24-48h old → Verify against git log before trusting
- > 48h old → STALE. You must reconcile DASHBOARD.md before working

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
**Model:** <model/type>
**Branch:** <branch>
**Started:** <ISO 8601 timestamp>
**Status:** IN-PROGRESS
**Base commit:** <git commit SHA at session start>
```

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

Before marking a session COMPLETED, verify ALL of the following:

1. **Working tree clean** — `git status --porcelain` returns empty
2. **All PRs merged** — `gh pr list --state open` returns nothing, OR all open PRs are not yet mergeable (CI red, conflicts, etc.)
3. **Session file marked COMPLETED** — `**Status:** COMPLETED` in session file
4. **REGISTRY.md has no active agents** — "None — no active sessions"
5. **State files updated** — DASHBOARD.md reconciliation timestamp is current

Run `node scripts/check-protocol.mjs` — it checks all of the above mechanically.
If any check fails → fix it before closing the session.

## Session Close is FINAL

When the owner says "close the session", the session is CLOSED. Do NOT reopen it unless:

- The owner explicitly says there is work to do, AND
- The owner paraphrases or confirms they want the session reopened

If the owner says "close the session" and then later says "continue" or "reopen", ASK for paraphrase before reopening. A closed session stays closed until the owner explicitly reopens it with clear intent.

---

## Quick Reference: State File Map

| File              | Purpose                          |
| ----------------- | -------------------------------- |
| `DASHBOARD.md`    | Executive summary — read first   |
| `REGISTRY.md`     | Who's active and what they own   |
| `INDEX.md`        | Searchable session log           |
| `ARCHITECTURE.md` | System architecture              |
| `DECISIONS.md`    | ADR index                        |
| `DEBT.md`         | Technical debt tracker           |
| `BLOCKERS.md`     | Active blockers                  |
| `STARTUP.md`      | This file — the 10-step sequence |
| `sessions/`       | One file per agent session       |
| `plans/`          | Active plans                     |
| `conflicts/`      | Documented conflicts             |
| `archive/`        | Old sessions                     |
