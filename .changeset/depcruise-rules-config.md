---
'@xenos1996/usa': patch
---

Pass dependency-cruiser's configured rules file to the command, closing a silent pass.

`scanners.dependency-cruiser.rules` was read by the parser but never reached
`argv`: the adapter always ran `depcruise --no-config`. The parser treats a
non-empty `rules` as "rules ran", so it stopped guarding the empty-violation
case, and a cruise that loaded no rules reported `ok` with **zero evidence
rows** — indistinguishable from a clean project.

Measured on a project with a real circular dependency and a `.dependency-cruiser.json`
that flags it: before, `status: ok`, 0 rows. After, one `dependency-edge` row
naming both endpoints (`src/a.js → src/b.js breaks rule no-circular`).

Without a rules file the command is unchanged (`--no-config`, and the parser
still says UNKNOWN — "a graph, not a verdict").
