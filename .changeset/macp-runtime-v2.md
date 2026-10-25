---
'@xenos1996/usa': patch
---

Add the `macp` runtime and harden the session gates. `pnpm run macp -- start`
runs the session reconnaissance, prints the continuation handoff, registers the
session and writes a local lease; `log`, `close`, `seal`, `reopen`, `verify`,
`queue`, `init-repo` and `install-hooks` complete the lifecycle. Seals are now
SSH signatures verified against a committed public key, the start gate requires
a session bound to the current branch, and the post-commit hook regenerates
measured dashboard facts instead of stamping a timestamp over stale prose. The
docs sync and the numeric-claim scanner now skip `state/sessions/**`, because a
sealed session is immutable and a count written in one is a dated measurement,
not a claim to keep current. No change to the `usa` CLI surface.
