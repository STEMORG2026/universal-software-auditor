# Plan — SA12: the MACP runtime, the pre-work gate, and the SSH seal

**Agent:** SA12 · **Branch:** `feat/macp-runtime-v2` · **Base:** `4a4a63b`

## Objective

Make the MACP state machine executable rather than descriptive, and make the
gate fire before the first edit rather than after it.

## Verified findings (Step 0 — measured on `4a4a63b`, not assumed)

| #   | Claim in the instruction                                                    | Status on this commit                                                                                                                      | Evidence                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `check-session-start.mjs` passes sessions that skip MACP entirely           | **CONFIRMED**                                                                                                                              | Temp repo: feature branch, staged change, no session for that branch, no plan, not in REGISTRY → exit `0`                                                                                                                                                               |
| 1b  | It does not recognise `CLOSED` / `REOPENED`                                 | **HALF FIXED.** `CLOSED` is accepted. `REOPENED` fails: a reopened session cannot commit, which blocks the reopen flow it exists to serve. | Temp repo with `**Status:** REOPENED` → exit `1`, "no … CLOSED header"                                                                                                                                                                                                  |
| 2   | `git commit` is too late; there is no pre-work gate                         | **CONFIRMED.** The only pre-work artefact is `.husky/pre-commit`. No `macp` CLI exists anywhere in `src/` or `scripts/`.                   | `grep -rn macp src/cli.ts` → nothing; `ls scripts` → no runtime                                                                                                                                                                                                         |
| 3   | `state/CONTINUATION.md` is missing from all startup instructions            | **CONFIRMED**                                                                                                                              | `grep -rl CONTINUATION` → only `CONTINUATION.md` itself and three old session files. Not in `AGENTS.md`, `docs/macp.md`, `STARTUP.md`, `state.md`                                                                                                                       |
| 4   | `auto-update-state.mjs` forges freshness and appends to finished sessions   | **CONFIRMED, worse than described**                                                                                                        | `state/DASHBOARD.md` carries **8** `**Last Reconciled:**` lines, the top one 7 hours old, over a body that says `Version: 2.26.0` and PR `#190` while `package.json` says `2.28.7`. `state.md` frozen at `2026-10-01`. The CLOSED guard exists; COMPLETED is unguarded. |
| 5   | §4C vocabulary disagrees with `check-sessions.mjs`                          | **CONFIRMED** for the vocabulary. `docs/macp.md` line 405 lists `OPEN`; five lines later and in the gate it is `IN-PROGRESS`.              | read of `docs/macp.md` §4C                                                                                                                                                                                                                                              |
| 5b  | Duplicated `## Outcome` in `SA10`                                           | **ALREADY FIXED** — one `## Outcome` at line 96. Not re-fixed.                                                                             | `grep -n '## Outcome'` → single hit                                                                                                                                                                                                                                     |
| 6   | Passkey is a verbatim string; no out-of-tree record, no cryptographic check | **CONFIRMED.** `**Passkey:**` is committed plaintext and `check-sessions.mjs` only tests that it is non-empty.                             | read of `check-sessions.mjs` lines 113-142                                                                                                                                                                                                                              |

## Approach

1. **`scripts/macp/` — a zero-dependency runtime.** Node ESM, builtins only, so
   the directory is portable to another repository unchanged. Commands:
   `start`, `log`, `queue`, `close`, `seal`, `reopen`, `status`, `verify`,
   `init-repo`, `install-hooks`. State transitions live here, not in Markdown.
2. **`MacpBackend` boundary.** `LocalBackend` (implemented) keeps ephemeral
   leases and seals under `~/.macp/`; `JarvisBackend` is a contract stub whose
   methods throw `NotImplemented` with the wire shape documented, so the worker
   CLI and hooks do not change when the authority moves.
3. **Hardened `check-session-start.mjs`.** On a non-`master`, non-bot branch
   carrying work: require an `IN-PROGRESS`/`REOPENED` session whose `**Branch:**`
   is this branch, a plan, a REGISTRY entry, and a local lease matching
   repo+branch. `master` and bot branches keep the close-path behaviour.
4. **`auto-update-state.mjs`.** Stop writing a human reconciliation timestamp.
   Regenerate a marked machine region from live truth instead, and never append
   to a `COMPLETED` or `CLOSED` session.
5. **SSH seal.** `ssh-keygen -Y sign` over a canonical payload at seal,
   `-Y verify` at every check, public key committed (`state/macp/owner.pub`) so
   CI can verify, private key never leaves the owner's machine.
6. **Docs.** `CONTINUATION.md` becomes step 1 of startup in all four places;
   §4C vocabulary aligned; new §4D for the runtime, the pre-work gate, the split
   continuation object and the backend boundary; ADR-0045 records the decision.

## Risks and mitigations

| Risk                                                       | Mitigation                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| The new gate blocks every legitimate commit                | Build it against the live repo first, then run the full suite; the gate is the last thing wired into `pre-commit`.  |
| A guard that passes because it never ran                   | Every guard gets a temp-dir integration test driven as a real process, and each is watched failing via mutation.    |
| Sealing makes `SA12` immutable before the work is reviewed | `macp seal` is owner-only by instruction; this session calls it once, at the end, with the owner's own SSH key.     |
| Doc claim scanner flags new numbers in `docs/macp.md`      | Avoid bare numeric claims; use `usa:fact` markers where a number is unavoidable.                                    |
| `state.md` deletion breaks `docs/manifest.yaml`            | Do not delete it. Reduce it to a pointer with zero state claims, which is what "no duplicate prose" actually needs. |

## Rollback

Every change is additive except `check-session-start.mjs`, `auto-update-state.mjs`
and four docs. Revert the branch; nothing is pushed to `master` outside a PR.

## Success criteria

- `macp start` refuses to run on `master`, refuses a second active session on a
  different branch, and prints the `CONTINUATION` brief to stdout.
- A skipped startup fails `check-session-start.mjs` on a feature branch and the
  same tree passes when a session + plan + lease exist. Both directions tested.
- `macp seal` produces a signature that `check-sessions.mjs` verifies, and a
  one-byte payload change fails verification.
- `macp reopen` without the private key is impossible; with it, the reopen is
  recorded and re-verifiable in CI.
- All local gates green; self-audit still 100/100.
