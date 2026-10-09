# 44. Enforce the MACP startup with a start-of-session gate

- **Date:** 2026-10-02
- **Status:** Accepted

## Context

MACP (AGENTS.md, "MACP — Multi-Agent Coordination Protocol") mandates a
10-step startup sequence before any work. It was not enforced, and on
2026-10-02 a session skipped it end to end: no acknowledgement, no STEP 8
verification against reality, no session registration (STEP 9), no plan
(STEP 10). The agent could not answer why nothing had stopped it.

Three facts explain the failure, all measured rather than assumed:

1. **The gate is end-loaded.** `scripts/check-protocol.mjs` runs only in
   `.husky/pre-push` and CI, and its four checks are all close-of-session:
   clean tree, session file `COMPLETED`, no active agents, no mergeable
   PRs. Nothing checks that the startup happened. An agent can skip steps
   0-10, do the entire task, and meet no friction until push.

2. **The acknowledgement is unbacked prose.** "Acknowledge you have read
   and understood this protocol before beginning any task" has no check
   behind it. A sentence cannot enforce anything.

3. **The protocol body is silently truncated.** `AGENTS.md` is 41,281
   chars. Hermes loads it through two paths with different caps:
   the startup (system-prompt) loader applies a dynamic cap — 251,658
   chars for a 1,048,576-token window, so no truncation — but the
   subdirectory-hint loader (`agent/subdirectory_hints.py`,
   `_MAX_HINT_CHARS = 32_000`) keeps head 70% + tail 20% and drops the
   middle. For this file that is head 22,400 + tail 6,400 of 41,280 —
   **12,481 chars of the middle omitted**, and that middle is the MACP
   core: Section 0 (state directory), **Section 1 (the mandatory startup
   sequence)**, and Section 4B (state-file ownership). The surviving tail
   begins at Section 4B, so the shutdown rules load while the startup
   rules do not. The loader prints its own truncation marker naming the
   omission; the session did not act on it.

## Decision

Add the missing half of protocol enforcement and remove the truncation
root cause.

1. **A start-of-session gate, `scripts/check-session-start.mjs`** (npm
   `protocol:start`). It fails when `state/` exists and either (a) no
   session file exists, (b) the latest session file is `IN-PROGRESS`
   without a matching plan in `state/plans/`, or (c) that session's agent
   is not under Active Agents in `REGISTRY.md`. A `COMPLETED` session
   passes — the close path stays `check-protocol.mjs`'s job. A repo with
   no `state/` passes — that is the Section 7 bootstrap case.

2. **Wire it where it can stop work.** The gate runs in
   `.husky/pre-commit` (before the first commit of a session, not only
   before push) and in the `Protocol enforcement` CI workflow alongside
   the existing close check.

3. **Keep the MACP startup inside the truncation window.** The protocol
   body is a candidate for extraction to its own document so the
   operating manual and the startup sequence both survive any single-file
   cap. The immediate, low-risk move is ordering: the mandatory startup
   must not sit in the middle of the largest tracked markdown file.

4. **Tests.** `tests/integration/session-start-gate.test.ts` drives the
   gate as a real process in a temp project and asserts both the pass
   cases (no state/, registered+planned, completed) and the fail cases
   (no session file, no plan, not registered, no Status header). The
   contract is the exit code and stderr, not internal functions.

## Options considered for the truncation (owner asked for options)

The truncation has four candidate fixes, cheapest first. This ADR records
them; choosing among them is an owner decision because `AGENTS.md` is a
protected file.

1. **Do nothing / document only.** The truncation marker already names the
   omission and the loader logs a WARNING. Cost: zero. Weakness: it relies
   on the agent noticing the marker — which is exactly what failed.
2. **Raise `context_file_max_chars` in `~/.hermes/config.yaml`.** A config
   value beats the dynamic cap, but the subdirectory-hint loader uses its
   own fixed `_MAX_HINT_CHARS = 32_000` and does not read that config, so
   this does **not** fix the hint path. Rejected as the primary fix.
3. **Shrink `AGENTS.md` below the 32,000-char cliff** (tighten prose,
   remove duplication). Cost: a protected-file edit with real diff churn;
   weakness: it re-arms the moment the file grows again, and the cliff is
   an implementation detail of one loader, not a documented contract.
4. **Extract the MACP body to `docs/macp.md`** and leave a compact
   mandatory-startup block plus a pointer in `AGENTS.md`. The operating
   manual shrinks to ~21K (under the cliff), the startup steps stay inline
   and always load, and the full protocol stays one `read_file` away. This
   is the structural fix; it carries the most doc-gate churn and touches a
   protected file, so it is a separate, owner-approved change.

**This ADR adopts (1) as the record and defers (4) as the structural fix.**
The gate in this decision addresses the _consequence_ (a skipped startup
now fails loudly); option 4 addresses the _cause_ (the startup text was
not readable). Both are needed; only the gate is unilaterally safe.

## Consequences

**Good:** Skipping the MACP startup now fails at the first commit with a
message naming the skipped step. The failure mode is loud and early
instead of silent and late. The gate is small, dependency-free, and
tested against its real invocation.

**Bad:** One more local gate on every commit, and one more CI job step.
A session that legitimately has no plan yet cannot commit until it writes
one — that is the point, but it is friction, and the friction is the
enforcement.

**Neutral:** The gate does not verify the _quality_ of a plan or the
truth of a session file — only that the artifacts the protocol names
exist. Deeper verification (STEP 8's "verify state against reality") stays
a human/agent obligation, because no script can prove an agent actually
looked.

## Explicitly deferred (gates, not backlog)

- Machine-checking that STEP 8 verification occurred. No script can prove
  an agent read reality; this stays a written obligation.
- Extracting the MACP body to `docs/macp.md` as a structural fix. This ADR
  records the truncation and the ordering rule; the extraction is a
  follow-up with its own doc-gate churn.
- Any change to the P1-P6 amendments or to `check-protocol.mjs`'s close
  checks.
