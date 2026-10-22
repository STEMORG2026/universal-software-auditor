---
'@xenos1996/usa': patch
---

Stop truncating piped output on exit.

The CLI ended with `process.exit(code)`. When stdout is a pipe, Node writes
asynchronously, and exiting immediately drops whatever is still buffered — so a
command that prints a lot can arrive cut off.

Measured on `usa rules`, which emits ~32 KB: in CI it arrived at ~25 KB, missing
the last seven rule packs and the closing "315 rule(s) across 32 pack(s)"
summary entirely. Locally it never reproduced, because the pipe drained fast
enough.

`process.exitCode` is now set instead, so the process drains stdout and exits on
its own. Exit codes are unchanged — verified 0, 2 for a bad path, and 1 for
`--fail-on critical` on a deliberately weak target.

This was found by a guard added in the same change: the CLI-reference generator
now refuses to write a document when the pack count it sees disagrees with
`rules/index.yaml`, which turned a silent truncation into a loud one.
