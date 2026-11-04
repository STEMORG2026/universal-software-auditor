# ADAPTER EXECUTION AUDIT

Three adapters had never been run against real output: `semgrep`, `dependency-cruiser`,
`cosign`. All three are installed here; `scorecard`, `codeql` and `ort` are not, so those
remain contract-read only. This document records what happened when the three ran.

## What ran

```bash
usa scan fixtures/insecure-app --scanner semgrep              # 1 evidence
usa scan fixtures/insecure-app --scanner dependency-cruiser   # 1 UNKNOWN
usa scan fixtures/insecure-app --scanner trivy,semgrep        # 11 evidence
```

## Finding 1 (HIGH) — every semgrep finding is recorded as LOW

The fixture rule is `severity: ERROR` — Semgrep's highest class, on `eval(argv)`:

```
semgrep 1.182.0 | ok | 1 evidence
- `a23ebf4c80b4096e67ca` semgrep LOW · semgrep-rules.js-eval-argv — dynamic eval of an argument (app.js:2)
```

`ERROR` is not in the normaliser's known set:

```ts
const KNOWN = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'UNKNOWN'];
export function severity(word: unknown): ScannerSeverity {
  const w = String(word ?? '').toUpperCase();
  return KNOWN.includes(w) ? (w as ScannerSeverity) : 'LOW';
}
```

Semgrep emits `ERROR`, `WARNING`, `INFO`. Two of those three are unknown, so **both collapse to
LOW** — which means no semgrep finding can ever be recorded above LOW. A dynamic `eval` of
process arguments, Semgrep's top severity, arrives at the bottom of USA's scale.

This is the concrete form of suspicion S14, which I could previously only assess statically. It
is not a cosmetic mislabel: the evidence report is the artefact a human triages, and it ranks a
code-execution finding alongside a missing `.editorconfig`.

**Fix:** a per-adapter severity map (`semgrep: {ERROR: HIGH, WARNING: MEDIUM, INFO: LOW}`)
rather than one global word list. The normaliser is already per-adapter in every other respect.

**Scope note:** because no adapter implements `findings()` (USA-AUD-023), this does not move the
audit's score — the damage is confined to the evidence report. That limits the blast radius and
does not make the label correct.

## Finding 2 (MEDIUM) — repeated flags keep only the last value

```bash
usa scan . --scanner semgrep --scanner dependency-cruiser   # only dependency-cruiser ran
usa scan . --scanner trivy   --scanner semgrep              # only semgrep ran
usa scan . --scanner trivy,semgrep                          # both ran (11 evidence)
```

`parseArgs` assigns rather than accumulates:

```ts
args[body] = next; // cli-args.ts:40
```

so `list()` never sees an array from the CLI, and the last occurrence wins. The manifest then
lists one adapter and looks complete — the same "silently less than you asked for" shape as the
invisible rules in USA-AUD-024.

The comma form works, which makes this worse rather than better: the documented-looking form
silently under-scans, and the working form is undiscoverable.

**Affects every multi-value flag**, not just `--scanner`: `--fact`, `--include`, and anything
else read through `list()`.

**Fix:** accumulate into an array when a key repeats.

## Finding 3 (MEDIUM) — dependency-cruiser is hardcoded to `src/`

```
dependency-cruiser 18.7.0 | ok | 1 evidence
- UNKNOWN — output was not valid JSON: Unexpected end of JSON input
  (exit 1: ERROR: Can't open 'src' for reading. Does it exist?)
```

The adapter's default config is `{ args: ['src'] }`. Any project without a `src/` directory —
a Go repo, a Python package, a flat JS app, this repository's own `fixtures/` — produces a
parse failure, recorded honestly as UNKNOWN.

Two things to credit: the failure is UNKNOWN, never a pass; and `annotateFailure` surfaced
depcruise's own stderr, which is exactly the diagnosis a human needs. The defect is the
hardcoded path, not the error handling.

**Fix:** default to `.` (depcruise's own default) or detect the source root from the facts the
audit already computed.

## Finding 4 (LOW) — the evidence id is truncated into a shape that cannot be read

`UNKNOWN-dependency-cruiser-dependency-cruiser-ou` — the id is built from
`status-adapter-rule-…` and cut at a fixed length. Two different findings from the same rule can
therefore share a prefix and be told apart only by a hash the reader cannot see. It is stable
and content-addressed (which is what matters for dedupe), but as a human identifier it is poor.

## What held

- **Absent binaries are named, not hidden.** `codeql` absent → `⚠️ codeql unavailable: … 0
evidence · 0 findings`, exit 0. A blind spot, not a pass (verified earlier, re-verified here).
- **Parse failures are UNKNOWN.** depcruise's malformed output produced UNKNOWN with the tool's
  stderr attached — the single best piece of error handling in the scanner subsystem.
- **Trivy parses real output.** 10 evidence items from a real Trivy run on the fixture's
  lockfile, in 651 ms, with the vulnerability DB already cached.
- **Exit codes are not verdicts.** The manifest records `stdout (exit 1)` for depcruise and
  still classifies the run by parse outcome, not by exit status.
- **The evidence model is stable.** Re-running produced identical ids for identical findings.

## Still unexecuted

`scorecard`, `codeql`, `ort` — each needs a binary that is not installed. CodeQL in particular
has a create-database-then-analyse pipeline whose failure semantics (a successful create
followed by a failed analyse) are the most likely place for an adapter bug, and it is the one I
cannot test here. That remains the largest gap in the scanner subsystem.
