---
'@xenos1996/usa': patch
---

Report a semgrep scan that read no files as UNKNOWN instead of clean.

`results: []` has two causes and only one of them is good news: semgrep looked
at the code and found nothing, or semgrep looked at nothing. The adapter mapped
both to "no evidence", so a target the scanner could not analyse — wrong
language, vendored rules for another language, a path with no matching sources
— reported `status: ok` with zero rows, indistinguishable from a clean project.

`paths.scanned` is semgrep's own count. An empty list there now yields one
UNKNOWN row ("semgrep scanned no files — nothing was analysed, not a clean
result"). An absent key does not fire: older builds omit it, and a missing
field is not evidence of an empty scan.

Measured: a directory containing only a README went from `ok`, 0 rows to
UNKNOWN with that reason. `fixtures/insecure-app` still reports its real
finding, so a genuine clean scan is unaffected.

This is the same distinction trivy's `Results` guard and dependency-cruiser's
rules guard already keep; semgrep was the one Tier-1 adapter without it.
