# Plan — SA13: audit whether MACP is functional and whether it enforces itself

**Agent:** SA13 · **Branch:** `audit/macp-enforcement` · **Base:** `4a4a63b` (merge-base with `master`), entered at `024493c`

## Objective

Determine whether the existing MACP implementation is fully functional as designed,
and whether it **enforces** the protocol rather than instructing an agent to follow
it. Every requirement is classified IMPLEMENTED / EXECUTED / ENFORCED, with
reproducible evidence, and no artefact's existence is accepted as proof of
enforcement.

## Scope

In scope: `scripts/macp/**`, `scripts/check-session-start.mjs`,
`scripts/check-sessions.mjs`, `scripts/check-protocol.mjs`,
`scripts/auto-update-state.mjs`, the four harness adapters, `.husky/*`,
`.github/workflows/protocol-check.yml`, `docs/macp.md` §4C-4D, ADR-0044/0045,
`state/**`.

Out of scope: fixing anything. This session audits and reports; it does not edit
MACP. No commit, no push, no close without the owner's explicit word.

## Approach — the sixteen questions the audit must answer

1. **Architecture / specification inspection.** Reconstruct the intended design from
   `docs/macp.md`, ADR-0044, ADR-0045 and `state/STARTUP.md`; record every place the
   documentation and the code disagree.
2. **Lifecycle / state machine.** Enumerate the states and transitions actually
   implemented (`UNBOUND`, `ACTIVE`, `CLOSING`, `COMPLETED`, `CLOSED`, `REOPENED`),
   who may trigger each, what validates it, and which are bypassable.
3. **Startup behaviour.** Which of the reconnaissance, brief, registry, index, plan
   and lease steps are executed by `macp start`, which are only instructed, and
   which are absent.
4. **Objective and plan enforcement.** Whether an agent can perform work with no
   objective and no plan, and whether the objective is bound to the owner's prompt
   or merely typed by the agent.
5. **Repository / branch / baseline handling.** Whether the branch is created by the
   runtime or by the agent; whether the baseline recorded is the commit work began
   at.
6. **Testing.** Whether tests are required, whether their exit codes are measured,
   whether results are persisted, and whether an agent's "tests pass" is accepted
   without execution.
7. **Verification.** Whether verification is independent of the agent's claim, and
   whether a failed verification blocks progression or merely records itself.
8. **Gates.** Every gate's trigger, mandate, evidence, failure behaviour, and whether
   the agent can choose which gates run.
9. **Report before close.** Whether a close can occur without a handoff, and whether
   the handoff's measured half can be fabricated.
10. **Human approval.** Whether an agent can reach a terminal state on its own, and
    what exactly the human gate consists of.
11. **Reopen authorization.** Whether a sealed session can be reopened without the
    owner, including with the wrong key, and which gate notices.
12. **Deletion / destruction.** Whether delete, purge and archive exist at all,
    whether they are distinct from close, and whether deletion of sealed history is
    detected.
13. **Session persistence and recovery.** Whether a new session can reconstruct the
    previous one from artifacts alone, without the old agent's transcript.
14. **Agent / tool enforcement.** Whether the pre-tool guard exists, is installed,
    and actually refuses a mutating call in `UNBOUND`; whether commit-time and
    CI-time gates cover the gap.
15. **Adversarial bypass testing.** Reproduce each bypass in throwaway repositories
    under `/tmp` with the real scripts and an isolated `MACP_HOME`.
16. **Final verdict.** Separate completeness from enforcement, show the arithmetic,
    and choose exactly one of the four permitted verdicts.

## Method

- Read before running. Every "enforced" claim must be backed by an observed non-zero
  exit; every "not enforced" claim by a reproduced bypass.
- Fixtures only: fresh `git init` under `/tmp/macpaudit/`, `MACP_HOME` redirected,
  throwaway keypairs. No test may touch this repository or `~/.macp`.
- A passing test proves nothing until the corresponding defect has been planted and
  the test watched to fail.

## Risks and mitigations

- **Mutating the audited artefact.** Mitigation: no MACP source edits this session;
  all destructive experiments happen in `/tmp`.
- **Auditing the wrong tree.** The runtime exists only on the unmerged
  `feat/macp-runtime-v2` (PR #270); a branch cut from `master` contains no
  `scripts/macp/`. This branch is stacked on it deliberately.
- **Consuming the owner's key.** Seal/reopen tests use throwaway keys; the real key
  is only probed for whether it requires a passphrase.

## Rollback

Nothing to roll back: no MACP source change. `git checkout master` plus deleting
`audit/macp-enforcement`, and `rm -rf /tmp/macpaudit`, returns the machine to its
prior state. The only project-side artefacts are this session's own `state/` files.

## Success criteria

- Every one of the sixteen areas carries a classification and evidence.
- Completeness and enforcement are scored separately, with the arithmetic shown.
- The report names, for each critical gap, the exact enforcement boundary that is
  missing and the reproduction steps.
- The session is left `IN-PROGRESS` and unsealed for the owner to judge.

## Gates

MACP's gate set as defined in `scripts/macp/lib/gates.mjs:71-78` — `typecheck`,
`lint`, `format`, `test`, `docs_all`, `self_audit` — is what `macp close` would run.
Note for the audit: `close` accepts `--gates` and `--no-gates`, so the set is
**chosen at close time, not bound at start**; the plan cannot pin it. Recorded here
as an observation, to be classified in the report rather than fixed.
