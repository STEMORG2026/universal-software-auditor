---
'@xenos1996/usa': patch
---

Read scanner artifacts from files, and run staged tools as stages.

The adapter contract assumed two things that two of the six adapters do not do:
that a tool writes its payload to **stdout**, and that it runs as **one
process**. ORT writes `evaluation-result.json` and logs progress to stdout;
CodeQL writes SARIF with `--output=`. Both adapters parsed log lines, and CodeQL
additionally parsed the output of `database create` — a command that writes a
database, not a finding. Neither could ever produce evidence, and the
fixture-based tests could not see it because they called `parse` with the file's
contents directly.

`ScannerCommand` gains `prepare` (stages that must succeed first) and
`artifacts` (files to read back, relative to the scan workdir). The runner reads
the first declared artifact that exists and hands that to `parse`; a declared
artifact that was not produced is an `error` with a reason, never an empty
result. The manifest records `prepare`, `artifact` and `exitCode`, and the
evidence report gains a Source column so a reader can tell a file-backed adapter
from a stdout one.

ORT is now verified end-to-end against the real binary (v97.0.0, container
image): `analyze` → `evaluate` → parse, on a real npm project, producing one
evidence row per violation. Four measured facts are recorded in
`docs/research/ort.md`, including that `--rules-resource` needs a **leading
slash** (the bare form crashes with a NullPointerException) and that `evaluate`
exits non-zero when it finds violations — a run that succeeded and objected.

The violations payload is no longer `[UNVERIFIED]`. `pkg` is a coordinate string
or `null`, and null is kept null rather than rendered as "unknown package"; a
violation's `message` and `how_to_fix` now travel with the evidence instead of
being dropped. A clean evaluation emits one `PASS` row, because "the policy ran
and nothing violated it" and "the policy never ran" must not look the same.

CodeQL's wiring is fixed but remains **[UNVERIFIED]** — no `codeql` binary was
available, so its two stages have not been executed.
