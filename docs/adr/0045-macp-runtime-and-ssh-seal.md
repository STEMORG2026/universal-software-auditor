# 45. MACP is a runtime with an SSH seal, not a set of Markdown files

- **Date:** 2026-10-24
- **Status:** Accepted
- **Supersedes in part:** ADR-0044 (the start gate it introduced is kept and
  hardened, not replaced)

## Context

ADR-0044 added `scripts/check-session-start.mjs` because the MACP startup was
unenforced. It was the right instinct and it did not work, for a reason that was
measured rather than guessed: the gate only asked whether the newest session
file was `IN-PROGRESS`. The normal state of `master` between sessions is a
`COMPLETED` file, so on a feature branch the gate inspected somebody else's
finished session and exited 0 without looking at the branch at all.

Six defects were reproduced on `4a4a63b` before anything was changed:

1. **A skipped startup passed every gate.** Scratch repository, feature branch,
   staged change, no session for that branch, no plan, not in `REGISTRY.md`:
   exit 0. Reproduced again after the fix: exit 1, naming the branch.
2. **The gate rejected `REOPENED`.** It accepted `CLOSED` but not `REOPENED`, so
   a session reopened by the owner could not commit — the one flow §4C exists to
   make possible.
3. **Nothing fired before the first edit.** The only pre-work artefact was
   `.husky/pre-commit`, which runs after the agent has edited ten files and can
   fabricate the session and plan retroactively to get past it.
4. **`state/CONTINUATION.md` was in no startup instruction.** `grep -rl
CONTINUATION` matched only the file itself and three old session files: not
   `AGENTS.md`, not `docs/macp.md`, not `state/STARTUP.md`, not `state.md`. The
   document that calls itself the canonical handoff was unread by construction.
5. **The post-commit hook forged freshness and appended to finished sessions.**
   It stamped `**Last Reconciled:**` on every commit while the body stayed put.
   Measured: eight such lines in `state/DASHBOARD.md`, the newest hours old,
   over a body claiming `Version: 2.26.0` and PR `#190` while `package.json`
   said `2.28.7`. `SA09` collected 27 commit lines after it was `COMPLETED`,
   which is how #245-#248 came to conflict with each other. `state.md` was a
   second copy of the same prose, frozen at 2026-10-01.
6. **The passkey was a string in a file.** `docs/macp.md` §4C was already honest
   that this is an audit control and not a security control. Correct, and not
   enough: it meant a forged reopen and a requested one looked identical until a
   human read the diff.

## Decision

### 1. The state machine is executable

`scripts/macp/` implements `UNBOUND → ACTIVE → CLOSING → COMPLETED → CLOSED →
REOPENED` as commands (`start`, `log`, `close`, `seal`, `reopen`, `status`,
`verify`, `queue`, `init-repo`, `install-hooks`). Transitions live in code
because prose cannot refuse. Zero dependencies and Node builtins only, so the
directory copies to another repository unchanged — which is the answer to ten
Markdown files and four bespoke scripts copy-pasted per repo.

`UNBOUND` is the default state on launching any harness, and it permits
read-only reconnaissance. Asking a question must not create a session, a plan, a
registry entry and a branch; a protocol that taxes the cheap case gets ignored
in the expensive one.

### 2. The pre-work gate has two layers

- **`macp start`** prints the `CONTINUATION` brief and the authorised scope to
  stdout — into the transcript, not into a file the agent may skip — and writes
  a local lease to `~/.macp/leases/<repo-id>.json`, outside the working tree. A
  receipt inside the tree can be copied from another branch, and copying a
  startup that never happened is the exact defect being fixed.
- **The harness pre-tool guard** refuses mutating tool calls while the
  repository is `UNBOUND`. One decision in `hooks/pretool.mjs`, four adapters
  (Claude Code `PreToolUse`, OpenCode `tool.execute.before`, Hermes
  `pre_tool_call`, a DSH shell wrapper), so the rule cannot drift.

`check-session-start.mjs` is the structural gate behind both: on a
non-`master`, non-bot branch carrying work it requires a session naming that
branch, live, with a plan, a `REGISTRY` entry, and a matching lease.

`[FACT]` The pre-tool guard is a speed bump, not a sandbox. Its mutating-command
list is a heuristic. The lease check is skipped in CI (`GITHUB_ACTIONS`) because
a fresh checkout has no `~/.macp`, which means an agent can set that variable
locally and defeat it. Neither is described as protection; both are described as
"the normal path is the authorised one".

### 3. The continuation object has two halves

Machine-stamped by `macp close` (SHAs, branch, tree state, commits, open PRs,
gate exit codes) and agent-authored but schema-validated (`outcome`,
`completed[]`, `remaining[]`, `discovered_bugs[]`, `deferred_work[]`,
`traps_learned[]`, `next_recommended_task`). A model will write "all tests pass"
whether or not it ran them; the split makes that claim structurally impossible
to record as a measurement.

`COMPLETED` requires every recorded gate green. `PARTIAL` and `BLOCKED` may
close red — that is what blocked means — but only with a committed tree, the
failing gate's output recorded, and `remaining[]` plus `next_recommended_task`
non-empty.

### 4. The seal is an SSH signature

`macp seal` signs a canonical payload with `ssh-keygen -Y sign -n macp`, stores
the SSHSIG base64 in the session file, and commits the **public** key to
`state/macp/owner.pub`. `macp verify` rebuilds the payload from the file itself
and verifies with `ssh-keygen -Y verify`. A one-character edit to any signed
field exits 255 and is reported. `macp reopen` requires the private key and
records a signature over the reopen reason and delta.

This is strictly stronger than the string it replaces: a reopen can no longer be
produced without the owner's key, and a forged one fails in CI against the
committed public key. It still does not stop an agent deleting the seal block
and writing a fresh session — nothing in a working tree can — but it makes the
unrequested reopen visible _and_ unverifiable, which is a different property
from invisible.

### 5. The post-commit hook measures instead of stamping

`auto-update-state.mjs` regenerates one marked region of `DASHBOARD.md` from
`package.json`, `git` and the ADR directory, and **writes nothing when those
facts are unchanged**. `**Machine Reconciled:**` is written by the machine;
`**Owner Reconciled:**` is written by a human and the hook never touches it. It
appends to no session that is `COMPLETED` or `CLOSED`. `state.md` is reduced to
a pointer with no state claims, so the two copies can no longer disagree.

### 6. The backend boundary exists before the backend

`MacpBackend` defines `start`, `log`, `close`, `seal`, `reopen`, `status`,
`verify`. `LocalBackend` runs them in-process. `JarvisBackend` posts the same
request objects to a central authority and throws with the route it wanted
rather than pretending to work. `MACP_BACKEND=jarvis` plus `MACP_JARVIS_URL`
selects it. The boundary is defined now because retrofitting it means touching
every command and every adapter.

## Consequences

**Good.** A skipped startup fails at the first edit rather than at push, and
fails again at commit if the guard was bypassed. `CONTINUATION.md` is read
because the command that opens a session prints it. A seal can be verified by
anyone with the repository and no network. Onboarding a second repository is
`macp init-repo` plus `macp install-hooks`, not a copy-paste. The dashboard
either tells the truth or says nothing, and the difference is a diff.

**Bad.** More moving parts: a runtime, four adapters, a lease store outside the
tree, and an SSH key that is now load-bearing for reopening. A lost key means a
sealed session cannot be reopened, which is the intended behaviour and will
still be experienced as a problem one day. The pre-tool guard has a
false-positive surface (a `bash` command containing `cp` is refused) and the
escape is to start the session, not to widen the list.

**Neutral.** The lease and the guard are audit controls. They make the
unauthorised path deliberate. They do not make it impossible, and this ADR says
so rather than implying otherwise.

## Defects found by running the gates

Two more defects surfaced only when the new runtime met the existing gates. They
are recorded here because both are _interactions_, not typos, and the same shape
will recur.

1. **A validator rule that was too broad.** `validateHandoff` demanded a captured
   output tail from **every** gate, not just the failing ones. A suite of quiet
   green gates therefore made a legitimate `PARTIAL` close impossible: the
   message said "a failing gate was recorded without its output" while nothing
   had failed. Narrowed to the failing gates, with a unit test that asserts both
   halves (green-and-quiet passes; red-and-silent refuses) and a planted defect
   that turns it red.

2. **Two gates rewriting each other's evidence.** `sync-docs` rewrites every
   `usa:fact` marker to the current value. `check-sessions` compares each sealed
   session file byte for byte against the commit that sealed it. Adding ADR-0045
   moved the ADR count from 44 to 45, so the sync rewrote the `44` inside four
   sealed sessions and the session gate then failed all four as "edited after its
   seal". The fix is a boundary, not a rule: session files are **immutable
   records**, excluded from both the fact sync and the claim scanner
   (`IMMUTABLE_RECORDS` in `scripts/lib/docs-sync.mjs`), while remaining visible
   to link and index checks. A number in a session file is a measurement from
   the day it was taken; keeping it current would falsify the record. The living
   documents — `CONTINUATION.md`, `DASHBOARD.md` — are where counts stay current.

A third, smaller one: the Python rule pack began firing because the Hermes
adapter is the first `.py` file in the tree. `PY-009` was satisfied by annotating
the adapter's one unannotated public function. `PY-001`, `PY-002`, `PY-003` and
`PY-010` are suppressed in `.usa.yaml` with reasons — they ask whether a Python
_project_ is well configured, and this repository has no Python package, no
Python dependency and no Python CI step. They stay visible under "Accepted
risk", and the reasons say what would make them true again.

## Explicitly deferred

- **`JarvisBackend` implementation.** The contract and the routes are recorded;
  there is no authority to talk to yet.
- **The `_tmp_*` directories at the repository root.** Hundreds of untracked
  directories, apparently test leftovers. Logged to `state/macp/queue.md`, not
  deleted: they are outside this session's authorised scope, and a bulk delete
  of paths nobody has inventoried is exactly the operation that goes wrong.
- **Retro-signing the seals made before this ADR.** `SA01`-`SA11` carry the old
  plaintext passkey. They are reported as notes, not failures; rewriting a
  sealed record to add a signature would violate the rule the signature exists
  to enforce.
