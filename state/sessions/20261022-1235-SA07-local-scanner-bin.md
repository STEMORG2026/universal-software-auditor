**Agent:** SA07 (Sathi / WorkBuddy)
**Harness:** WorkBuddy
**History:** not exported — the transcript lives in the harness, not the repo
**Branch:** fix/local-scanner-bin
**Started:** 2026-10-22T12:35+05:45
**Status:** CLOSED
**Closed:** 2026-10-23T18:05+05:45 by owner
**Base commit:** bee3b2d (master, after #212)

# Session SA07 — the scanner that could not see itself

## Objective

Gap 4 of the SA06 handoff: _"dependency-cruiser still needs a local devDependency
to resolve TypeScript. A globally installed depcruise cruised 0 modules against
this repo."_ The fix looked like "add a devDependency". It was not.

## What the measurement showed

The devDependency alone changes nothing, because `probe()` searched **`PATH`
only** — a binary in `node_modules/.bin` was invisible to the very tool that
would benefit from it.

| binary                        | modules cruised against this repo |
| ----------------------------- | --------------------------------- |
| global `depcruise` on PATH    | **0**                             |
| `node_modules/.bin/depcruise` | **108**                           |

A global install cannot resolve the project's TypeScript, so it cruised nothing,
exited non-zero with empty stdout, and the adapter reported a parse error. The
tool was dead weight on the repository that ships it.

## What changed

- `probe(target?)` — the target is **optional**, so all eleven existing call
  sites are unaffected. Only the runner passes it.
- The runner puts the project's `node_modules/.bin` **first** on the child's
  PATH, keeping PATH for the global fallback. This helps every adapter.
- `dependency-cruiser` is added as a devDependency so the capability is real
  rather than theoretical.

## Verified on all three paths

| situation            | result                                                          |
| -------------------- | --------------------------------------------------------------- |
| local binary present | found, 108 modules, honest UNKNOWN (_"a graph, not a verdict"_) |
| only a global binary | found, fallback works                                           |
| neither              | `unavailable`, reason names both locations                      |

## The guard

Two tests. The local-binary one was **watched failing** — neutering `localBin`
turns it into `expected false to be true` — then restored and re-run green. The
second pins the fallback so the new search cannot mask a genuinely absent tool.

## Not done, deliberately

This repo still ships no `.dependency-cruiser.json`, so `usa scan .` reports
_"ran without a rules config — a graph, not a verdict"_. That is the correct
answer (#203), and writing the rules is choosing the architecture, not fixing a
bug. Recorded in the handoff rather than guessed at.

## Verified at close

1447 passed | 1 skipped (1448); typecheck, lint, format, docs:all clean;
self-audit 100/100. Merged as #213 at 6b05f38.

### 07:11 — Commit

`3471f61` docs(state): hand off after the local-scanner-bin pass

### 08:05 — Commit

`d469795` ci: run the trivy adapter end to end in CI instead of skipping it

---

## Close

- **Closed by:** owner (Sajan Gurung) — instruction: "complete the work left in each session and close them — all the sessions must be closed"
- **Closed at:** 2026-10-23T18:05+05:45
- **Status at close:** COMPLETED (merged as #213)
- **Outcome:** COMPLETED — work reached master before the seal (merged as #213).
- **Passkey:** none issued — reopening needs an explicit owner instruction that names one, recorded under `## Reopen`
