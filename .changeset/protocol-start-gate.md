---
'@xenos1996/usa': patch
---

MACP protocol enforcement: add the missing start-of-session gate (ADR-0044).

- New `scripts/check-session-start.mjs` (npm `protocol:start`): fails when
  `state/` exists and the session was never registered — no session file,
  an `IN-PROGRESS` session with no plan in `state/plans/`, or one missing
  from `REGISTRY.md` Active Agents. `check-protocol.mjs` only ever checked
  the session _closed_ cleanly; the startup was unenforced.
- Wired into `.husky/pre-commit` (fails at the first commit, not only at
  push) and the `Protocol enforcement` CI workflow.
- `tests/integration/session-start-gate.test.ts`: drives the gate as a real
  process and asserts the pass and fail cases.
- ADR-0044 records the root cause: `AGENTS.md` (41,281 chars) is truncated
  by the subdirectory-hint loader (fixed 32,000-char cap, head 70% + tail
  20%), dropping the 12,481-char middle that contains the mandatory MACP
  startup sequence.

Dev/protocol only; no shipped runtime API change (patch).
