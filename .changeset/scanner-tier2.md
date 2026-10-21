---
'@xenos1996/usa': minor
---

Add Tier 2 scanner adapters: OpenSSF Scorecard and OSS Review Toolkit.

**Scorecard** shipped as a two-mode adapter, because the tool has two natures
and they are not interchangeable:

- `mode: local` (default) runs the file-based probes offline against a checkout
  with no token — verified by running the real v5.6.0 binary against this repo.
- `mode: repo` reaches the platform API for the platform probes (branch
  protection, token permissions, signed releases), needs network and a token,
  and is opt-in.

The aggregate score is deliberately **not** emitted as evidence. Each probe
becomes one row carrying `name (score/10): reason`, and a 9 or a 6 is `PARTIAL`
rather than collapsed to PASS or FAIL — Scorecard's scale means different things
per probe (License 9 is "detected, not identified"; Binary-Artifacts 6 is
"binaries present"), and the threshold is a rule's decision, not a parser's.

**ORT** was run for real (v97.0.0, from the project's container image), which
caught a command that would have failed on every invocation: `evaluate` rejects
`--input-dir` and takes `-i/--ort-file`. Its violations _payload_ remains
unverified — ORT 97 refuses to evaluate without a rules script — so that mapping
resolves anything unexpected to `UNKNOWN` rather than to a silent pass.

Two fixes found while wiring Tier 2, both in Tier 1 code:

- `--scanner` was accepted and ignored — every adapter ran regardless. It now
  filters, and an unknown id is a loud error naming the known adapters rather
  than an empty run.
- `usa scan` leaked a stack trace on a bad `--scanner`; it is now a usage error
  with exit 1.

`tests/fixtures/scanners/scorecard.json` is a real capture, not a synthetic
fixture, and the research document records the four things a run revealed that
the documentation does not say — including that platform checks _crash_ the run
in local mode rather than degrading to `?`.
