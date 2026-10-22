---
'@xenos1996/usa': patch
---

Find a scanner installed as the project's own devDependency, and prefer it.

`probe()` searched `PATH` only, so a scanner installed in the project's
`node_modules/.bin` was invisible — and that binary is the _better_ one. Measured
on this repository with dependency-cruiser:

| binary                        | modules cruised against this repo |
| ----------------------------- | --------------------------------- |
| global `depcruise` on PATH    | **0**                             |
| `node_modules/.bin/depcruise` | **108**                           |

A global install cannot resolve the project's TypeScript, so it silently cruised
nothing and the adapter reported a parse error. The devDependency is now also
added to this repository, and `usa scan .` reports the honest answer instead:
"dependency-cruiser ran without a rules config — a graph, not a verdict".

`probe(target?)` takes the target optionally, so existing callers are unaffected;
the runner passes it and puts the project's bin directory first on the child's
PATH, keeping PATH for the global fallback. This helps every adapter, not just
dependency-cruiser.
