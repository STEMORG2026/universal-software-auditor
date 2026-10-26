# DASHBOARD.md — Executive Summary

> **Read `state/CONTINUATION.md` first.** That is the handoff: what the last
> session finished, what it left, and what to do next. This file is the summary
> around it.

<!-- macp:generated:begin -->

**Machine Reconciled:** 2026-10-26T06:43:17.671+05:45
**Reconciled by:** `scripts/auto-update-state.mjs` (post-commit) — every value below is measured
**Repo:** Universal_Software_Auditor
**Remote:** git@github.com:Er-Sajan-PLG/universal-software-auditor.git

- **Version:** 2.28.7
- **Branch:** `feat/submit-not-terminal`
- **Tracked markdown:** 158
- **ADRs:** <!-- usa:fact adrs -->46<!-- /usa:fact -->

> This block is generated. Edit anything outside it, never inside it: the next
> commit overwrites the block, and `**Owner Reconciled:**` above is the field a
> human sets after actually reading the rest of this file.

<!-- macp:generated:end -->

**Owner Reconciled:** not recorded — this field is set by a human after reading
the prose below. `scripts/auto-update-state.mjs` never writes it, because a
timestamp a hook can mint is not a timestamp that means anything.

The block above is regenerated on commit from facts the hook measures:
`package.json`, `git`, and the ADR directory. It used to be a hand-maintained
body with an auto-stamped date on top, which is how this file came to claim
version 2.26.0 and PR `#190` under a timestamp seven hours old while
`package.json` said 2.28.7.

---

## What this project is

USA (Universal Software Auditor) is a TypeScript CLI (`usa`) that audits any
project and writes a graded Markdown report. It ships as the npm package
`@xenos1996/usa` plus a GitHub composite action. The defining habit: **the tool
audits itself** — every PR runs USA on its own tree.

- **Language:** TypeScript, strict, ESM, Node 20+
- **Package manager:** pnpm workspace (one package)
- **Tests:** vitest, split `unit/` `integration/` `e2e/`
- **Releases:** changesets (the author declares the bump)
- **Engine:** data-driven rule packs in `rules/`, driven by `src/engine/`

## Coordination

- **Protocol:** `docs/macp.md` (owner-opened, owner-sealed sessions)
- **Runtime:** `scripts/macp/cli.mjs` — `pnpm run macp -- <command>`
- **Handoff:** `state/CONTINUATION.md` — the canonical read at session start
- **Who is working:** `state/REGISTRY.md`
- **Session history:** `state/INDEX.md` and `state/sessions/`
- **Discoveries and deferred work:** `state/macp/queue.md`

## Where the truth lives

| Question                      | Answer                                                  |
| ----------------------------- | ------------------------------------------------------- |
| What should I do next?        | `state/CONTINUATION.md` §13                             |
| What is finished?             | `state/CONTINUATION.md` handoff block, `state/INDEX.md` |
| Is anything blocked?          | `state/BLOCKERS.md`                                     |
| What did we decide, and why?  | `docs/adr/` and `state/DECISIONS.md`                    |
| What is knowingly unfinished? | `state/DEBT.md`, `state/macp/queue.md`                  |
| How does the system work?     | `docs/ARCHITECTURE.md`, `state/ARCHITECTURE.md`         |

## Rules that are gates, not advice

1. Never push to `master`. Branch → PR → merge.
2. The agent never merges. A human does.
3. No session, no edits — the pre-tool guard and `check-session-start.mjs`
   enforce it from two directions.
4. A session solves one piece of work. The next piece is a new session.
5. Closing is the owner's instruction; sealing is the owner's signature.
6. A passing test proves nothing until it has been watched failing.
