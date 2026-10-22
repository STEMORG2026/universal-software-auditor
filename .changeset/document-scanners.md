---
'@xenos1996/usa': patch
---

Document `usa scan` and `usa intent`, and make their flags discoverable.

The scanner subsystem had no prose documentation — it appeared only in the
generated `cli.md`. The reason turned out to be circular: `usa --help` carries an
option block for thirteen commands but **not** for `scan` or `intent`, and the
docs governance gate validates every documented flag against that help. So the
flags could not be documented without failing the gate, and nobody documented
them.

`usa --help` now lists both blocks, which fixes the discoverability problem for
users and the validation problem for the gate. A new `docs/scanners.md` covers
what the subsystem is for (evidence, not scoring), the six adapters and their
defaults, the analysed-nothing rule that makes `UNKNOWN` the safe verdict, the
child-environment boundary, staged tools, and the `usa intent` join.
