# MACP — remediation plan

**Written:** 2026-10-24, session `SA13`, against `scripts/macp/` in this repository.
**Basis:** `MACP-AUDIT-2026-10-24.md`, read in full, plus the five findings logged in `SA13`'s
`## Log`.
**Status:** live. **§5 carries the only per-phase status.** `pnpm run macp -- start --plan <id>`
reads that table: it adopts the item's section as the session's objective, and it refuses an id
whose status is not `pending`. A phase's state is recorded in exactly one place so the two cannot
disagree.

---

## 0. Baseline — frozen, not to be edited

|                     | Pre-remediation                                       |
| ------------------- | ----------------------------------------------------- |
| Audit verdict       | `MACP FUNCTIONALLY COMPLETE BUT HAS ENFORCEMENT GAPS` |
| Completeness        | **45 %**                                              |
| Enforcement         | **14 %**                                              |
| Existing MACP tests | 80 / 80 green while every finding reproduced          |

These are the numbers against which the remediation must be measured. Nothing in this plan
changes them; the plan exists to move the second number, and the first only as a side effect.

**Finding inventory.** The audit report carries 16 numbered findings. Three numbers —
**F-03**, **F-13**, **F-17** — were folded into neighbouring sections when the report was
written. They are distinct defects and are restored below from the audit's own evidence,
with their provenance marked. No conclusion is altered; nothing is added that was not measured.

---

## 1. Current architecture

```
agent ──(voluntary)──▶ pnpm run macp -- start ──▶ session file + plan + REGISTRY + INDEX + lease
                                                                    │
agent ──(any tool)──▶ [harness pre-tool guard]  ── not installed ──▶ nothing
                                                                    │
agent edits freely ──▶ git commit ──▶ check-session-start ──▶ refuses (commit-time only)
agent pushes        ──▶ pre-push   ──▶ typecheck + check-session-start + check-protocol
PR                  ──▶ CI "Protocol compliance" ──▶ runs, but is NOT a required check
merge to master     ──▶ CI session-close ──▶ check-protocol + check-sessions + verify
```

Seven facts define the current shape:

1. **The only pre-work layer is uninstalled.** `hooks/pretool.mjs` decides correctly
   (`Write` → exit 2, `Read` → exit 0) and is wired to no harness (F-02).
2. **Every working gate is post-hoc.** Commit, push and CI all run after the edit (F-08).
3. **The agent authors the record it is judged by** — objective, plan, gate selection,
   and the transition to `COMPLETED` (F-04, F-06, F-07, F-17).
4. **`COMPLETED` is terminal for every gate**, so `CLOSED` — the only state the owner's key
   controls — is optional (F-10).
5. **The seal authenticates "a key", not "the owner's key"** (F-09), and the verifier
   treats a missing root of trust as success (F-10b).
6. **Absence of a file is read as absence of a requirement** (F-10b, F-11, F-18).
7. **The CI gate is advisory** — `Protocol compliance` is not in the required set (F-15).

The primitives are sound: a real state machine, an out-of-tree lease, a split handoff,
measured gate exit codes, and SSHSIG. The defect is uniformly **where the refusal is attached**:
after the edit, after the choice, after the merge.

---

## 2. Enforcement architecture — what must change

### 2.1 The honest boundary first

No mechanism on the same OS account can stop a determined process from writing a file. An
agent that can run `bash` can run `node -e "fs.writeFileSync(...)"`. Therefore the design
target cannot be "impossible"; it must be **three properties that are achievable**:

| Property                                       | Meaning                                                                         | Mechanism                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| **P-a · Normal path enforced**                 | the ordinary agent flow cannot proceed without the session                      | harness hook + install verification               |
| **P-b · Bypass is deliberate**                 | an agent that bypasses must choose a distinct, unusual action                   | deny-by-default tool policy, not a regex denylist |
| **P-c · Bypass is visible and non-repudiable** | the record cannot be produced without the owner's key, and the artifact says so | signatures over the facts, not the file           |

Everything below serves one of those three. **Real prevention requires process isolation
(a separate user or container) and that is a decision for the owner, not a default** — see D1.

### 2.2 The four boundaries

```
USER ──signs──▶ authority artefact (objective hash, close, reopen, purge)
                    │
MACP ──verifies──▶  ▼  state transition allowed
                    │
AGENT ──requests──▶ TOOL ──▶ [enforcement layer] ──▶ filesystem / git
```

- **User authority** = possession of the passphrase-protected owner key. Everything the
  design calls "the owner's act" must require a signature _before_ the transition, not after.
- **MACP authority** = the state machine's right to refuse. It must never rely on the agent
  reporting its own compliance.
- **Agent authority** = read the repo, propose, write inside an `ACTIVE` session, and nothing
  else. It cannot select gates, cannot declare a session closed, cannot delete a record.
- **Tool authority** = whatever the enforcement layer permits. Deny-by-default in `UNBOUND`.

### 2.3 The target lifecycle

```
USER TASK
   ↓
macp start  ──▶ CREATED ──▶ INITIALIZING
                              │  objective hash + plan + branch + base + lease + required_gates
                              ▼
                            ACTIVE ◀──────────────┐
                              │ work, macp log     │
                              ▼                   │
                           VERIFYING              │
                              │ gates on frozen tree
                    ┌─────────┴─────────┐         │
                    ▼                   ▼         │
            VERIFICATION_FAILED     AWAITING_USER │
                    │ (recoverable)     │         │
                    └──▶ ACTIVE         │ signed close
                                        ▼         │
                                     CLOSED ──────┘ (only via signed reopen)
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                           ARCHIVED            DESTROYED (signed, tombstoned)
```

`AWAITING_USER` is the state the current design is missing. It is what makes "the agent has
finished" distinguishable from "the owner has closed".

---

## 3. Findings — root cause, impact, severity

Severity rule used: **BLOCKER** = a stated control can be defeated with no unusual action ·
**CRITICAL** = defeated, and the defeat is silent · **HIGH** = degraded or detectable only
after the fact · **MEDIUM/LOW** = friction, ambiguity, or a record defect.

| #     | Finding                                                                                                              | Root cause                                                                       | Impact                                                                    | Depends on | Severity    |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ----------- |
| F-01  | No abandon/cancel transition; `clearAllLeases` unreachable                                                           | lifecycle covers only the happy path                                             | mistaken session has no lawful exit; pushes agents to hand-edit the lease | L3         | HIGH        |
| F-02  | Pre-tool guard not installed on any harness                                                                          | install is opt-in and unverified                                                 | **edit before session** is unblocked — the primary control                | L1, D2     | **BLOCKER** |
| F-03  | Guard is a regex denylist (`node -e`, `python3 -c`, `git branch -D` unmatched) _(restored; code-read, not executed)_ | heuristic instead of policy                                                      | a deliberate agent routes around it in one line                           | F-02       | HIGH        |
| F-04  | Gate set selectable at close (`--gates`)                                                                             | gates chosen where the result is known                                           | six gates become one, after the work                                      | L4, D8     | **BLOCKER** |
| F-05  | `--no-gates` + `PARTIAL` closes with zero gates and passes `check-protocol`                                          | `COMPLETED` requires _a_ gate, not _the_ gates; `PARTIAL` written as `COMPLETED` | **false success recorded as clean close**                                 | L4         | **BLOCKER** |
| F-06  | Objective is agent-typed, mutable, unbound to the prompt                                                             | `start` writes `--task` verbatim; nothing hashes or freezes it                   | agent substitutes its own authorisation                                   | L2, D3     | CRITICAL    |
| F-07  | Plan is a filename; template placeholder passes                                                                      | gate checks existence, not content                                               | planning is theatre                                                       | L2         | HIGH        |
| F-08  | Source change folds into the close-bookkeeping commit                                                                | "door 2" returns true before inspecting the staged set                           | **work after `COMPLETED` ships**, and the gate says "state-only"          | L5         | CRITICAL    |
| F-09  | `reopen` accepts any private key                                                                                     | signs with `--ssh-key`, never compares it to the sealing key                     | **unauthorised reopen → `ACTIVE` → commits pass**                         | L7         | **BLOCKER** |
| F-10a | Agent reaches terminal `COMPLETED` alone                                                                             | agent and owner conflated in one state                                           | human close is optional                                                   | L6, D4     | **BLOCKER** |
| F-10b | `verify` exits 0 when `owner.pub` is deleted                                                                         | absence read as "nothing to verify"                                              | root of trust removable; forged reopen invisible                          | L7         | **BLOCKER** |
| F-11  | Deleting one session record is undetected                                                                            | gate iterates existing files; dangling `INDEX` row ignored                       | **silent loss of sealed history**                                         | L8         | CRITICAL    |
| F-12  | Brief reads `READ THIS FIRST`; `close` writes `## Handoff`                                                           | reader/writer disagree on artifact shape                                         | recovery path dead in a fresh repo                                        | L8         | HIGH        |
| F-13  | Handoff has no `objective`, no `files_changed`, no test names _(restored)_                                           | schema never extended past the first design                                      | next session cannot reconstruct what was done                             | L8         | MEDIUM      |
| F-14  | Baseline is merge-base; commits from `master..HEAD`                                                                  | one field used for two different questions                                       | misattributes another session's commits                                   | L8         | MEDIUM      |
| F-15  | `Protocol compliance` not a required check                                                                           | protection config never updated                                                  | **every protocol gate is advisory**                                       | L6         | **BLOCKER** |
| F-16  | `CLOSING` does not freeze                                                                                            | guard treats `CLOSING` as authorising; only next `close` notices                 | freeze is advisory                                                        | L3         | MEDIUM      |
| F-17  | `PARTIAL`/`BLOCKED` written as `**Status:** COMPLETED` _(restored)_                                                  | `withStatus(COMPLETED)` regardless of outcome                                    | outcome invisible to every gate                                           | L4         | HIGH        |
| F-18  | No delete / purge / archive; `rm -rf state` passes 2 of 4 gates                                                      | destruction not modelled; bootstrap and destruction indistinguishable            | **protected history removable**                                           | L9, D7     | CRITICAL    |
| F-19  | 80 tests green while all findings reproduce                                                                          | no negative tests for the bypasses                                               | regressions invisible                                                     | all phases | HIGH        |

---

## 4. Finding → fix mapping

| Finding          | Fix                                                                                                                                                                         | Regression test (see §6) | Phase       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------- |
| F-04, F-05, F-17 | `start` records `required_gates` in the lease; `close` may add but never remove; `--no-gates` only legal with outcome ≠ `COMPLETED`; outcome written into `**Status:**`     | T-04a, T-04b, T-05, T-17 | P1          |
| F-08             | door 2 inspects the staged set before returning true; bookkeeping moves into `seal`                                                                                         | T-08a, T-08b             | P2          |
| F-02 (partial)   | `start` refuses when no installed adapter is detected for `--harness`; `install-hooks --write` becomes the default and verifies by re-reading the config                    | T-02a                    | P2          |
| F-09             | after signing, assert `signed.fingerprint === sealing fingerprint`; refuse otherwise; store the seal fingerprint in `**Passkey:**`                                          | T-09a, T-09b             | P3          |
| F-10b            | `verify` fails when `owner.pub` is absent while any `CLOSED` session carries a signature                                                                                    | T-10b                    | P3          |
| F-10a, F-15      | new `AWAITING_USER`; `close` may only reach `COMPLETED`; `check-protocol` requires `CLOSED`; `Protocol compliance` added to required checks; `verify` moved into the PR job | T-10a, T-15              | P4          |
| F-11             | every `INDEX` row must resolve to a file; missing file is a finding                                                                                                         | T-11                     | P5          |
| F-12             | brief reads the `macp:handoff` region directly                                                                                                                              | T-12                     | P5          |
| F-13             | handoff schema gains `objective`, `plan_sha`, `files_changed[]`, `tests[]`                                                                                                  | T-13                     | P5          |
| F-14             | record `start_head_sha` separately; `commits[]` = `start_head..HEAD`                                                                                                        | T-14                     | P5          |
| F-01             | `ABANDONED` state, owner-signed; `macp abandon --session … --ssh-key …`                                                                                                     | T-01                     | P6          |
| F-16             | guard refuses mutations in `CLOSING`; `close --prepare` is the only writer                                                                                                  | T-16                     | P6          |
| F-02 (rest)      | adapter per harness, installed by default; `UNBOUND` becomes deny-by-default for `bash` with a read-only allowlist                                                          | T-02b, T-03              | P7          |
| F-18             | `archive` / `delete` / `purge` as distinct, owner-signed operations with tombstones                                                                                         | T-18a, T-18b, T-18c      | P8          |
| F-06             | objective supplied as a file, hashed, signed at `start`, frozen while `IN-PROGRESS`                                                                                         | T-06a, T-06b             | P9          |
| F-07             | `start` writes a plan with a machine marker; gate refuses while the marker is present; success criteria hashed at first commit                                              | T-07a, T-07b             | P9          |
| F-19             | one negative test per bypass, plus a mutation pass per fix                                                                                                                  | §6                       | every phase |

---

## 5. Ordered implementation phases

Ordering rule: **a phase may only depend on phases before it.** Gates before evidence,
because evidence from a gate that can be removed proves nothing. Authority before
convenience, because every later check trusts the key.

| Phase | Scope                          | Findings                         | Status           |
| ----- | ------------------------------ | -------------------------------- | ---------------- |
| P0    | Decisions and freeze           | D1–D8                            | partial          |
| P1    | Gate integrity                 | F-04, F-05, F-17                 | pending          |
| P2    | Evidence and install integrity | F-08, F-02 (partial), F-24, F-25 | pending          |
| P3    | Reopen and verify authority    | F-09, F-10b                      | delivered · #271 |
| P4    | Human close boundary           | F-10a, F-15, D4                  | delivered · #271 |
| P5    | Session integrity and recovery | F-11, F-12, F-13, F-14           | delivered · #271 |
| P6    | State machine completeness     | F-01, F-16, F-23                 | delivered · #271 |
| P7    | Tool enforcement               | F-02 (rest), F-03                | pending          |
| P8    | Destruction                    | F-18                             | pending          |
| P9    | Objective and plan binding     | F-06, F-07                       | pending          |

A row's status is the only record of that phase's state. The prose under each heading is the
scope — what the phase must do — not a progress note, and not something to be restated in a
`--task` string.

**Two rows are older than the work that overtook them.** §12.2 ordered P1 and P2 _before_
P3–P6; #271 delivered P3–P6 first. P1 and P2 are still open, and they are the two every later
phase's evidence rests on: a gate set the agent can shrink after the work (`F-04`), and a close
that measures the tree before the record is in it (`F-08`, `F-24`). Read the delivery column as
"the boundary moved", not as "the foundation is done".

**P0 is `partial`, not `delivered`.** D5 has the owner's answer, recorded in §12. D1–D4 and D6–D8
are still recommendations in §9; the code adopted some of them without a recorded decision, which
is why the row is not `delivered`.

### P0 — Decisions and freeze (no code)

Resolve D1–D8 (§8). Record the answers as an ADR. Nothing else starts until D1, D3, D4
and D8 are answered, because each changes the shape of the code that follows.

### P1 — Gate integrity (F-04, F-05, F-17)

`required_gates` written by `start` into the lease; `close` intersects rather than replaces;
`--no-gates` refuses any outcome other than `PARTIAL`/`BLOCKED`; outcome written to
`**Status:**`; `check-protocol` requires `CLOSED`, not `COMPLETED`.
**Why first:** it is the only change that closes a false-success path without a new
architecture, and it makes every later phase's evidence meaningful.

### P2 — Evidence and install integrity (F-08, F-02 partial)

Door 2 inspects the staged set; the handoff records `tree_sha` measured at gate time and
`gates_definition_sha` (hash of `gates.mjs`); `close` refuses if HEAD moved or the
definitions changed. `start` refuses when no adapter is installed.
**Why second:** it turns "the gates ran" into "the gates ran on this tree, with these
definitions" — the precondition for trusting any result.

### P3 — Reopen and verify authority (F-09, F-10b)

Compare the signing key to the sealing key before writing `REOPENED`; fail closed on a
missing `owner.pub`.
**Why third:** three lines, and it removes the only cryptographic hole. Nothing later
matters while a wrong key can reopen.

### P4 — Human close boundary (F-10a, F-15)

Add `AWAITING_USER`; `close` stops at `COMPLETED`; `seal` is the only path to `CLOSED`;
`check-protocol` accepts only `CLOSED`; the workflow gains the required check and `verify`
on PRs.
**Why fourth:** needs P1 (so `COMPLETED` is not a shortcut) and P3 (so the key is meaningful).

### P5 — Session integrity and recovery (F-11, F-12, F-13, F-14)

Dangling-index detection; brief reads the handoff region; schema extended; baseline split.
**Why fifth:** these are readers of records that P1–P4 make trustworthy.

### P6 — State machine completeness (F-01, F-16)

`ABANDONED` with owner signature; `CLOSING` actually freezes.
**Why sixth:** depends on the authority boundary from P3/P4 to sign an abandon.

### P7 — Tool enforcement (F-02 rest, F-03)

Adapters for every harness in scope; `install-hooks` verifies by re-reading config;
`UNBOUND` becomes deny-by-default with a read-only allowlist.
**Why seventh:** needs D1 and D2, and is the only phase whose design is genuinely open.

### P8 — Destruction (F-18)

`archive` / `delete` / `purge` as separate signed operations with tombstones;
`check-session-start` distinguishes "never adopted" from "wiped".
**Why eighth:** depends on P3/P4 for signatures and P5 for index integrity.

### P9 — Objective and plan binding (F-06, F-07)

Objective from a file, hashed and signed; immutability table enforced; plan marker.
**Why last:** needs D3, and it is the only phase that changes how the owner invokes `start`,
so it lands after the checks that consume the objective.

**Half of this row is now done, and the row stays `pending`.** `macp start --plan <id>` takes the
session's objective from a plan item instead of a `--task` string, and records the plan file's
sha in the lease and the handoff. That is the "plan is a filename" defect (F-07) closed at the
entry point. Still open: the objective is not signed by the owner's key (D3), the immutability
table is not enforced against an edit to `## Objective` mid-session (F-06), and `start` still
writes a plan template whose placeholder text nothing refuses (the marker half of F-07).

---

## 6. Files and modules affected

All paths verified in the tree.

| Area                      | Path                                                                                             | Phase          |
| ------------------------- | ------------------------------------------------------------------------------------------------ | -------------- |
| CLI surface               | `scripts/macp/cli.mjs`                                                                           | P1, P6, P8, P9 |
| Transitions               | `scripts/macp/lib/lifecycle.mjs`                                                                 | P1, P3, P4, P6 |
| Gate definitions/runner   | `scripts/macp/lib/gates.mjs`                                                                     | P1, P2         |
| Handoff schema            | `scripts/macp/lib/handoff.mjs`                                                                   | P2, P5         |
| Lease (authority carrier) | `scripts/macp/lib/lease.mjs`                                                                     | P1, P2, P6     |
| Status vocabulary         | `scripts/macp/lib/session.mjs`                                                                   | P4, P6         |
| Brief                     | `scripts/macp/lib/brief.mjs`                                                                     | P5             |
| Verifier                  | `scripts/macp/lib/verify.mjs`                                                                    | P3             |
| Installer/adapters        | `scripts/macp/lib/install.mjs`, `scripts/macp/hooks/pretool.mjs`, `scripts/macp/hooks/adapters/` | P2, P7         |
| Start gate                | `scripts/check-session-start.mjs`                                                                | P2, P8         |
| Seal gate                 | `scripts/check-sessions.mjs`                                                                     | P4, P5, P8     |
| Close gate                | `scripts/check-protocol.mjs`                                                                     | P1, P4         |
| CI                        | `.github/workflows/protocol-check.yml`                                                           | P4             |
| Local hooks               | `.husky/pre-push` (add `macp verify`)                                                            | P3             |
| Immutable records         | `scripts/lib/docs-sync.mjs` (`IMMUTABLE_RECORDS`, line 346)                                      | P8             |
| New state                 | `state/macp/tombstones/`                                                                         | P8             |

No new top-level directory is proposed; the runtime stays dependency-free and copyable,
which is the property ADR-0045 bought.

---

## 7. Test strategy

**Structure.** `tests/integration/macp-runtime.test.ts` already contains a local `makeRepo()`
helper (throwaway `git init`, no-op gates, isolated `MACP_HOME`). Extract it to
`tests/integration/macp-fixture.ts` so new negative tests share it, then add
`tests/integration/macp-enforcement.test.ts`. Unit tests for pure functions go in
`tests/unit/macp-handoff.test.ts` (existing).

**Rule for every test below:** it must be watched failing against the current code _before_
the fix lands, and the fix must be mutation-checked afterwards (plant the defect back, watch
the test go red, restore byte-identically). A test that has never been red is not evidence.

| ID    | Precondition                           | Action                                                          | Expected                                           | Failure condition     | Phase |
| ----- | -------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- | --------------------- | ----- |
| T-02a | repo initialised, no adapter installed | `macp start --harness claude`                                   | exit 1, names the missing adapter                  | exit 0                | P2    |
| T-02b | `UNBOUND`, adapter installed           | tool call `Write`                                               | exit 2 (blocked)                                   | exit 0                | P7    |
| T-03  | `UNBOUND`                              | `bash -c 'node -e "fs.writeFileSync(…)"'`                       | blocked by policy                                  | allowed               | P7    |
| T-04a | `start` with 6 required gates          | `close --gates format --outcome COMPLETED`                      | exit 1, names the 5 unrun gates                    | exit 0                | P1    |
| T-04b | same                                   | `close --gates format,test,…` (all 6)                           | exit 0 only if all green                           | green subset accepted | P1    |
| T-05  | `start`                                | `close --no-gates --outcome COMPLETED`                          | exit 1                                             | exit 0                | P1    |
| T-05b | `start`                                | `close --no-gates --outcome PARTIAL …` then `check-protocol`    | `check-protocol` exit 1                            | "All checks passed"   | P1    |
| T-06a | objective file given at `start`        | edit `## Objective` mid-session, commit                         | exit 1, "objective changed"                        | accepted              | P9    |
| T-06b | same                                   | `start` again with a different objective                        | refused without owner signature                    | overwritten           | P9    |
| T-07a | `start`                                | commit with the plan template marker intact                     | exit 1                                             | accepted              | P9    |
| T-07b | work begun                             | rewrite `## Success criteria`, commit                           | exit 1                                             | accepted              | P9    |
| T-08a | `COMPLETED` session, clean tree        | edit a source file, stage it with the close artefacts, run gate | exit 1, names the source file                      | "state-only change"   | P2    |
| T-08b | same, after the fix                    | commit only `state/`                                            | exit 0                                             | blocked               | P2    |
| T-09a | sealed by key A                        | `reopen --ssh-key B`                                            | exit 1, "not the sealing key"                      | `REOPENED`            | P3    |
| T-09b | sealed by key A                        | `reopen --ssh-key A`                                            | exit 0, `verify` exit 0                            | any failure           | P3    |
| T-10a | `COMPLETED`                            | `close`                                                         | state `AWAITING_USER`, not `CLOSED`                | reaches `CLOSED`      | P4    |
| T-10b | sealed session                         | `rm state/macp/owner.pub`, `verify`                             | exit 1                                             | exit 0                | P3    |
| T-11  | two sessions, one sealed               | delete one file, leave its `INDEX` row                          | exit 1, "row has no file"                          | 0 findings            | P5    |
| T-12  | init → start → close → start           | inspect the brief                                               | contains the previous session id and handoff       | "Nothing yet"         | P5    |
| T-13  | closed session                         | read handoff JSON                                               | has `objective`, `files_changed`, `tests`          | absent                | P5    |
| T-14  | branch stacked on another              | close                                                           | `commits[]` contains only this session's commits   | includes the parent's | P5    |
| T-15  | protection config                      | assert required contexts                                        | includes `Protocol compliance`                     | absent                | P4    |
| T-16  | `close --prepare`                      | mutate a source file                                            | refused before commit                              | allowed               | P6    |
| T-01  | `ACTIVE` session                       | `macp abandon --ssh-key …`                                      | `ABANDONED`, lease released, new `start` permitted | conflict persists     | P6    |
| T-17  | `close --outcome PARTIAL`              | read `**Status:**`                                              | `PARTIAL`                                          | `COMPLETED`           | P1    |
| T-18a | sealed session                         | `macp delete` without a signature                               | exit 1                                             | deleted               | P8    |
| T-18b | sealed session                         | `macp purge --ssh-key …`                                        | tombstone written, `INDEX` row kept                | file gone, row gone   | P8    |
| T-18c | initialised repo                       | `rm -rf state`, run all four gates                              | at least `check-session-start` fails               | skips as "bootstrap"  | P8    |
| T-19  | full suite                             | mutation pass per phase                                         | every new test observed red                        | any never-red test    | all   |

---

## 8. Security model

| Authority | Holder                              | Exercised by                                                        | Enforced at                                  | Must never be able to                                 |
| --------- | ----------------------------------- | ------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| **USER**  | owner, via passphrase-protected key | `start` (objective), `seal`, `reopen`, `abandon`, `delete`, `purge` | signature verified **before** the transition | —                                                     |
| **MACP**  | the runtime and gates               | every transition                                                    | exit code                                    | be satisfied by the agent's assertion                 |
| **AGENT** | the model                           | read, propose, edit inside `ACTIVE`, `macp log`                     | lease + guard                                | choose gates, declare closure, delete records, reopen |
| **TOOL**  | the harness                         | each tool call                                                      | pre-tool guard, deny-by-default              | run mutating commands in `UNBOUND`/`CLOSING`          |

The load-bearing assumption, stated so it can be attacked: **the agent runs as the same OS
user as the owner.** Everything the design calls "the owner's act" is therefore only as strong
as the passphrase on `~/.ssh/id_ed25519`. Measured on this machine, that key _is_
passphrase-protected (`ssh-keygen -y -P ""` → exit 255), which is why `macp seal` cannot be
completed by a non-interactive agent today. **That is an external property, not an enforced
one** — no code checks it. P3 should add the check: `seal` refuses an unencrypted key.

---

## 9. Decisions requiring approval

Only the ones where more than one design is defensible. Each names what it blocks.

| #      | Decision                        | Options                                                                                                                                                                                                                     | Recommendation                                                                                              | Blocks |
| ------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| **D1** | Enforcement model               | (a) harness hook + git gates, hardened; (b) OS isolation (separate user/container) for true prevention; (c) filesystem immutability                                                                                         | (a) now, and say plainly it is an audit control; (b) only if you want prevention, which changes the product | P0, P7 |
| **D2** | Harnesses in scope              | claude / opencode / hermes / dsh / WorkBuddy                                                                                                                                                                                | add WorkBuddy, since that is what this machine runs                                                         | P7     |
| **D3** | Where the objective comes from  | (a) `--objective-file` + hash, unsigned; (b) hash signed by the owner key at `start`                                                                                                                                        | (b) — (a) is still agent-typed                                                                              | P9     |
| **D4** | Is `COMPLETED` enough to merge? | (a) yes, keep today; (b) no — only `CLOSED`                                                                                                                                                                                 | (b); without it the human gate stays optional                                                               | P4     |
| **D5** | Key policy                      | **DECIDED 2026-10-24T23:01 by the owner:** every lifecycle act is gated by the owner's key, and the passphrase differs per act — close, seal and reopen each use their own key. `seal` must also refuse an unencrypted key. | see §12                                                                                                     | P3, P4 |
| **D6** | Abandon / resume                | allow `ABANDONED`; may a new session resume the branch                                                                                                                                                                      | allow abandon, require a new session for the same branch                                                    | P6     |
| **D7** | Destruction                     | is `purge` ever permitted; what survives (tombstone + `INDEX` row)                                                                                                                                                          | tombstone + row always survive; `purge` needs a signature and a reason                                      | P8     |
| **D8** | Gate immutability               | gates as a code constant + hash, or a committed `state/macp/gates.json` per repo                                                                                                                                            | committed file, hashed into the lease                                                                       | P1     |

---

## 10. Definition of done

MACP is **enforced** when all of the following are true, each demonstrated by a test that
has been watched failing first:

**Positive**

1. A clean session runs start → work → gates → report → `AWAITING_USER` → signed close, and
   the handoff a fresh session reads contains the objective, the files changed, the gate
   results and the next task.
2. `macp verify` returns 0 on a genuinely sealed repository, offline.

**Negative — each of these must exit non-zero** 3. Edit before `start` (guard), and commit before `start` (gate). 4. Work with no objective, and work with no plan. 5. `close` with fewer gates than `start` required; `close --no-gates` as `COMPLETED`. 6. `COMPLETED` reached without the owner's key. 7. `reopen` with a key that is not the sealing key. 8. `verify` with the root of trust removed. 9. Edit to a sealed session file; deletion of a sealed session record; `rm -rf state`. 10. A `PARTIAL` close that any gate reads as `COMPLETED`. 11. A post-close source commit, in any shape, including folded into the bookkeeping commit. 12. A dangling `INDEX` row, and a handoff that omits the objective.

**And the meta-condition:** the full suite must be green _and_ every negative test must have
been observed red against the pre-fix code. A green suite that was never red is the exact
failure this audit found (F-19).

---

_Design written 2026-10-24 with no MACP source modified. `SA13` was closed and sealed on
2026-10-26 (`b05bca3`); one test file had been changed earlier (`f923f7e`) to clear inherited
`GITHUB_*`, see §11. The per-phase status in §5 is the live record; this paragraph is provenance,
not state._

---

## 11. Findings added during the audit work itself (F-23 – F-25)

The plan was written from 19 findings. Three more were produced by doing the work, and they are
not theoretical: each one caught the auditor. They are recorded in the audit report §8 alongside
the eight mistakes that exposed them.

| #        | Finding                                                                                                                                                                                                                                                              | Phase                  | Regression test                                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F-23** | `**Status:**` is the state machine's authority and is a plain text line. An agent moved a session from `COMPLETED` to `IN-PROGRESS` with an editor; `macp reopen` refused, the edit did not.                                                                         | **P6** (state machine) | T-23: hand-edit `COMPLETED → IN-PROGRESS`, run `check-sessions` → exit 1, "status changed without a signed transition"                                                                                      |
| **F-24** | `macp close` measures the tree **before** the close exists. `check-manifest` only inspects tracked files, so `docs_all` passed on untracked session/plan files and CI failed the moment they were committed.                                                         | **P2** (evidence)      | T-24: close with a new session file still untracked, then commit → the same gate must fail both times, or `close` must stage the record before gating                                                       |
| **F-25** | The suite is green outside CI and red inside it: `currentBranch()` prefers `GITHUB_HEAD_REF`, and the harness did not clear it, so 19 tests failed only in CI. `macp close` therefore recorded a green `test` gate for a suite that could not pass where it decides. | **P2** (evidence)      | T-25: run the gate suite with `GITHUB_HEAD_REF` set to a branch absent from the fixture → all cases must still pass; and `close` must refuse to record a `test` gate that was never run under CI conditions |

### Why they belong in the plan rather than a footnote

All three share one shape with the original findings: **the check runs at a moment when the
thing it is checking does not yet exist, or under conditions that differ from the ones that
matter.** F-23 checks a file whose history nothing reads; F-24 checks a tree before the record
is in it; F-25 checks a suite in an environment that is not the gate's.

That is the same defect as F-08 (door 2 before inspecting the staged set) and F-04 (gates chosen
after the work). The remediation's ordering principle — attach the refusal to the moment the
decision is made — covers all five.

### Effect on the phase plan

No new phases. F-24 and F-25 land in **P2**, because they are evidence-integrity problems, and
P2 already owns "the gates ran on this tree, with these definitions". F-23 lands in **P6**, which
already owns `ABANDONED` and the `CLOSING` freeze — the same question, "what may change a
session's state, and who may change it".

The **Definition of Done** gains three negative conditions:

13. A status line edited by hand is a finding, not a state change.
14. A close that passes locally and fails in CI is a failed close.
15. A gate recorded as green must have been run in the environment that enforces it.

---

## 12. Authority model as specified by the owner — D5, 2026-10-24T23:01

In his words: _"closing must be done by me with key so do sealing as well and reopen as well …
It also needs my passkey and it is not same for close, sealing, its a different passkey."_

Read as a requirement: **every lifecycle act is gated by the owner's key, and no two acts share a
passphrase.** That is a stronger model than the one the plan assumed, and it is the right one —
it means a key leaked for one act cannot perform another.

### 12.1 What "a different passphrase" forces

A passphrase belongs to a private key file. Different passphrases therefore mean **different key
files**, which means **different principals**. The model becomes:

| Act                | Transition                  | Principal       | Key                   |
| ------------------ | --------------------------- | --------------- | --------------------- |
| report done        | `ACTIVE → AWAITING_USER`    | agent, unsigned | — (no authority)      |
| **close**          | `AWAITING_USER → COMPLETED` | `macp-close`    | `~/.ssh/macp_close`   |
| **seal**           | `COMPLETED → CLOSED`        | `macp-seal`     | `~/.ssh/macp_seal`    |
| **reopen**         | `CLOSED → REOPENED`         | `macp-reopen`   | `~/.ssh/macp_reopen`  |
| **delete / purge** | `CLOSED → DESTROYED`        | `macp-destroy`  | `~/.ssh/macp_destroy` |

`state/macp/owner.pub` (one key) becomes `state/macp/allowed_signers` (four principals).
`lib/seal.mjs` already has the primitive — `allowedSignersLine(publicKey, principal)` — it is
simply called today with one hardcoded principal, `macp-owner`.

### 12.2 The consequence that must not be missed

Today `macp close` writes `COMPLETED` **with no key at all**. If close requires the owner's key,
then the agent loses its only way to say "I am done". So key-gated close **requires** the
`AWAITING_USER` state first:

```
agent: macp submit          → AWAITING_USER   (unsigned, unprivileged)
owner: macp close --key     → COMPLETED       (signed)
owner: macp seal  --key     → CLOSED          (signed, different key)
```

That reorders the plan: **P4 (AWAITING_USER) becomes a prerequisite for P3**, not a successor.
The corrected order is P1 gates → P2 evidence → **P4a `submit`/`AWAITING_USER`** → P3 principals
and key-gated close/seal/reopen → P5 integrity → P6 state machine → P7 tool enforcement →
P8 destruction → P9 objective binding.

### 12.3 Corrections to the premises this was specified on

Two assumptions in the instruction are not true of the current code, and the design should not
inherit them:

| Premise                                     | Measured reality                                                                                                                                                                                                                                                                                        | Finding              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| "reopen — I think it is already configured" | `reopen` compares the committed `owner.pub` to the **seal-time** fingerprint, then signs with whatever `--ssh-key` it is given and never compares the two. Fixture: sealed by A, reopened by B → **exit 0**, `REOPENED`, lease `ACTIVE`, commits passed both gates. Only `verify` objected, afterwards. | **F-09**             |
| "nobody can delete the session"             | There is no `delete`, `purge`, `archive` or `abandon` command — deletion is `rm`. The guard that would block it is not installed. `check-sessions` builds its list from the files that still exist, so deleting one record among survivors reports **0 findings**.                                      | **F-18, F-11, F-02** |

So "set up reopen" is not a configuration tweak. It is: add the principal, compare the signing key
to the one that sealed, and check **before** the transition — P3.

### 12.4 What this section does not do

It records the model. It does not implement it: no key was generated, no MACP source changed, and
`SA13`'s objective was **not** edited — the session is `COMPLETED`, and editing its objective is
the F-23 bypass this plan exists to close. Implementation needs a session that is legitimately
`ACTIVE`, which is the owner's call.
