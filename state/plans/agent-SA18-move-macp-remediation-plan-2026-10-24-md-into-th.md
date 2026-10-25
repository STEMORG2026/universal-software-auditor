# Plan — SA18: the plan document and `start --plan <id>`

**Agent:** SA18 · **Branch:** `feat/plan-item-scope`

## Objective

move MACP-REMEDIATION-PLAN-2026-10-24.md into the repo as docs/remediation-plan.md with a Status column (P3-P6 delivered in #271, P7-P9 pending), and add macp start --plan <id> so a session's scope comes from the plan item rather than from my prose. Stop after that.

## Scope

**In:** `docs/remediation-plan.md` (the 2026-10-24 plan, with §5 converted to a table carrying a
Status column); `scripts/macp/lib/plan.mjs` (parse an item, refuse what may not be opened);
`start --plan <id>` wired through the CLI, lifecycle, session, lease and handoff; tests; the
manifest and docs-index entries the repo's own gates require.

**Out:** P1 and every later phase in the plan's own table. `check-protocol`'s acceptance of
`COMPLETED` is left alone — the code carries a reasoned counter-argument for it, and D4 has never
been recorded. Nothing in `Projects/MACP`, which is dsh's repository and out of scope.

Authorized by: Sajan, 2026-10-26, verbatim: "move MACP-REMEDIATION-PLAN-2026-10-24.md into the repo as docs/remediation-plan.md with a Status column (P3-P6 delivered in #271, P7-P9 pending), and add macp start --plan <id> so a session's scope comes from the plan item rather than from my prose. Stop after that."

## Approach

1. Copy the plan in verbatim; add the Status column to §5 only. No finding, number or conclusion
   is rewritten — the row statuses are the one thing that changes.
2. Write `plan.mjs`: an item is a row in a table that has a `Status` column whose first cell is a
   bare id, plus the `### <id>` section as its scope. Refuse unknown, delivered, partial, bodiless
   and duplicate ids. Record the plan's sha.
3. Wire `--plan` / `--plan-file` through the CLI, `start`, `renderSession`, `makeLease` and the
   handoff. `--task` and `--plan` together are refused rather than merged.
4. Tests: six cases through the CLI, then plant six defects and watch each one turn a test red.
5. Gates: typecheck, lint, format, test, docs_all, self_audit. Fix what they refuse (manifest
   classification, docs index) rather than narrowing the gate set.

## Risks and mitigations

- **The parser adopts the wrong table.** The document contains a findings table (`F-01`), a
  decisions table (`D1`) and a test matrix (`T-02a`). Mitigated by requiring a `Status` column
  _and_ a bare-id first cell, and by a test for each of the two shapes. This already happened once:
  the first version swallowed `D1`–`D8`.
- **The plan's sha makes every later edit look like drift.** That is the intent — a difference to
  be seen, not a silent redefinition — but it must not be presented as a verification failure.
- **`start --plan` refuses a phase the owner wants opened.** `partial` is refused on purpose; the
  error names the open ids so the next action is one command away.

## Rollback

The change is additive: a new file, a new flag, three additive record fields. Reverting the branch
restores the previous behaviour exactly; no existing session file is rewritten, and `plan` is
`null` for every session started without the flag.

## Success criteria

1. `start --plan P3` (delivered) exits 1, names the open ids, and writes no session.
2. `start --plan P1` records the item body verbatim as the objective, and the binding appears in
   the session (`**Plan:**`), the lease and the handoff.
3. `--task` and `--plan` together exit 2.
4. Six planted defects each observed red, then restored byte-identically.
5. All six gates green on the committed tree.
