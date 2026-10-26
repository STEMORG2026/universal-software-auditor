---
'@xenos1996/usa': patch
---

A SARIF run that analysed nothing is no longer recorded as a clean scan.

The shared SARIF parser returned an empty evidence list for a run with an empty
`results` array, and for a run with no `results` key at all. Both read as
"scanned, found nothing" — the failure the semgrep adapter already guards against
in its own code, where a scan that touched no files becomes `UNKNOWN`. Three of
the four Tier-1 tools produce SARIF, so the rule existed in one adapter and was
missing from the parser they share; CodeQL, wired but never verified end to end,
is the case that matters.

- A run with no `results` array is `UNKNOWN` — malformed, not clean.
- An empty `results` array is `UNKNOWN` when the run says it did not analyse:
  `invocations[].executionSuccessful: false`, or `artifacts: []`.
- Otherwise it stays clean. The evidence of non-analysis must be positive — most
  producers omit `artifacts`, and treating an absent field as an accusation would
  turn every clean scan into `UNKNOWN`.
