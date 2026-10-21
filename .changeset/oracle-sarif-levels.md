---
'@xenos1996/usa': patch
---

Stop a SARIF oracle check from passing over findings it could not see.

SARIF 3.27.10 says a result may omit `level` when it equals the rule's
`defaultConfiguration.level`, and CodeQL omits it on **every** result. The
oracle filter defaulted a missing level to `warning`, so an `error`-level
finding matched neither `levels: [error]` nor anything else the author asked
for — a rule written to gate on errors counted **zero** of them and returned
PASS.

The filter now resolves a result's level in three steps: the result's own
`level`, then the rule's default from the same run's driver, then the SARIF
fallback of `warning`. The rule defaults are read per run, because that is
where they live.

Latent rather than live: no shipped rule uses `source: sarif` yet, so no score
changed with this fix. It is the path a rule takes the first time it ingests a
CodeQL or Semgrep report, and the failure mode is a silent pass — the one
outcome an auditor must never produce.

The same defect was fixed in the scanner's SARIF normaliser, which builds
evidence rows rather than verdicts.
