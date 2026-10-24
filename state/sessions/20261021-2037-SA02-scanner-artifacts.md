**Agent:** SA02 (Sathi / WorkBuddy)
**Harness:** WorkBuddy
**History:** not exported — the transcript lives in the harness, not the repo
**Branch:** fix/scanner-artifact-contract
**Started:** 2026-10-21T20:37+05:45
**Status:** CLOSED
**Closed:** 2026-10-23T18:05+05:45 by owner
**Base commit:** aefa1cb (master)

# Session SA02 — Scanner artifacts, not stdout

## Objective

Owner instruction: "continue the work on Universal_Software_Auditor". The handoff
in `state/CONTINUATION.md` listed five gaps in priority order; the first was
"ORT's violations payload is unverified". Closing it was attempted first.

## What the gap actually was

Gap 1 was written up as a fixture problem. It was a wiring problem, and it was
not confined to ORT.

The adapter contract assumed two things that two of six adapters do not do:

| Adapter                                       | Writes its payload to    | Runs as                       |
| --------------------------------------------- | ------------------------ | ----------------------------- |
| Trivy, dependency-cruiser, Semgrep, Scorecard | stdout                   | one process                   |
| ORT                                           | `evaluation-result.json` | `analyze` **then** `evaluate` |
| CodeQL                                        | SARIF via `--output=`    | `create` **then** `analyze`   |

The runner parsed `spawn.stdout` and ran one command. So ORT parsed progress
logs, and CodeQL parsed the output of `database create` — a command that writes a
database and no finding. Neither could ever produce evidence.

**1415 passing tests could not see it**, because the adapter tests called
`parse(read('fixture.json'))` directly. A fixture test proves the parser; it
proves nothing about what the runner hands the parser.

## What changed

- `ScannerCommand.prepare` — stages that must run first.
- `ScannerCommand.artifacts` — files to read back, relative to the scan workdir.
  The runner reads the first that exists; a declared artifact that is missing is
  `error` with a reason, never an empty result.
- `AdapterRun` gains `prepare`, `artifact`, `exitCode`; `EvidenceProvenance`
  gains `preparedBy`. The evidence report gains a **Source** column.
- A prepare stage that exits non-zero stops the pipeline and is reported as a
  blind spot. That is the one place an exit status decides anything, and it
  decides _coverage_, never a verdict.

## ORT, verified end-to-end

Run for real: ORT 97.0.0 from `ghcr.io/oss-review-toolkit/ort`, on a small npm
project, with a three-rule script. Four facts the documentation does not say, all
now in `docs/research/ort.md`:

1. `--rules-resource` needs a **leading slash**; the bare form NPEs with a stack
   trace instead of a usage error.
2. Violations are written to a **file**; stdout is progress logs.
3. `evaluate` **exits non-zero** when it finds violations — a run that succeeded
   and objected.
4. `ort --version` prints JVM warnings first, one naming `jna-5.19.1.jar`. A
   loose regex reports **5.19.1** as the ORT version. Caught before shipping by
   running the command and reading the output rather than trusting the pattern.

The payload: `pkg` is a coordinate string or `null` (null is a result-level
violation, not "unknown package"), and the ruleset is **not recorded anywhere in
the output** — only provenance can carry it.

End-to-end through `usa scan`: 3 evidence rows from 3 violations, `ok` with
`(exit 2)` in the Source column, `.ort-results/evaluation-result.json` named.

## CodeQL

Same mechanism, still `[UNVERIFIED]`: no `codeql` binary was available, so
`create` and `analyze` have never executed. Flagged in the adapter header, the
changeset and the continuation doc rather than left to be discovered.

## Verification

| Gate        | Result                          |
| ----------- | ------------------------------- |
| `typecheck` | pass                            |
| `lint`      | pass, 0 warnings                |
| `test`      | 1433 passed, 1 skipped (18 new) |
| `docs:all`  | pass (6 gates)                  |
| self-audit  | **100/100**, no open findings   |

Tests were proven able to fail before being trusted: reverting `raw = read.content`
to `raw = spawn.stdout`, removing the prepare-exit check, removing the workdir
escape guard, removing the output cap, and restoring the loose version regex each
produced a named failure (4, 1, 1, 1 and 1 respectively), and each was restored
and re-run green.

### 15:12 — Commit

`d68d1e6` fix(scanner): read scanner artifacts from files, and run staged tools as stages

---

## Close

- **Closed by:** owner (Sajan Gurung) — instruction: "complete the work left in each session and close them — all the sessions must be closed"
- **Closed at:** 2026-10-23T18:05+05:45
- **Status at close:** COMPLETED
- **Outcome:** COMPLETED — the session's work was merged before the seal; the record carried no PR number.
- **Passkey:** none issued — reopening needs an explicit owner instruction that names one, recorded under `## Reopen`
