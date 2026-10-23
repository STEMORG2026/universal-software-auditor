---
'@xenos1996/usa': patch
---

docs: sessions are opened and sealed by the owner, and the record proves it

MACP had a start gate and a close gate, and the record drifted between them:
`state/INDEX.md` listed HX04 as IN-PROGRESS for three weeks while its own file
said COMPLETED, and OC01 sat IN-PROGRESS since 2026-10-09 with its work merged
as #184.

- **§4C of `docs/macp.md`** — the owner opens a session and the agent records
  it; one session is one piece of work, and new work is a new session and a new
  branch; `COMPLETED` is the agent's claim, `CLOSED` is the owner's act; a
  sealed file is immutable against the commit that sealed it; reopening needs an
  explicit owner instruction naming a passkey. The passkey is described as an
  audit control, not a security control, because it is one.
- **`scripts/check-sessions.mjs`** — enforces the field set, the status
  vocabulary, the `## Close` block, the seal, and agreement with `INDEX.md` and
  `REGISTRY.md`. Wired into the close job of `protocol-check.yml`.
- **`check-protocol.mjs`** — two measured defects fixed: it chose the "latest"
  session with `ls -t`, so touching an old file made it judge the wrong one, and
  its PR check used `--head master`, which lists PRs _from_ master and is
  therefore always empty.
- all fourteen sessions are sealed, `INDEX.md` is one generated table, and
  `REGISTRY.md` lists the sealed set instead of a stale prose block per agent.
