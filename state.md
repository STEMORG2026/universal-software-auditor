# state.md — pointer

This file exists because older instructions told agents to read it. It holds no
facts of its own: every state claim it used to carry — a version, a branch, a
status line — was a second copy of something in `state/`, and the copies drifted
apart. It sat frozen at 2026-10-01 while the repository shipped three releases.

Read, in this order:

1. `state/CONTINUATION.md` — the handoff. What the last session finished, what
   it left, what to do next. **This is the primary startup read.**
2. `state/DASHBOARD.md` — the summary, with a machine-generated facts block.
3. `state/REGISTRY.md` — who is working, and on what.
4. `state/STARTUP.md` — the startup sequence, in full.
5. `docs/macp.md` — the protocol itself.

Or run `pnpm run macp -- start …`, which prints 1 and 2 into the transcript
before any work begins.

Do not add state claims to this file. If a fact belongs here, it belongs in
`state/DASHBOARD.md`'s generated block, where it is measured rather than typed.
