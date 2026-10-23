---
'@xenos1996/usa': patch
---

fix(release): install cosign, which the provenance step calls

`publish.yml` verifies the bundle with `cosign verify-blob-attestation` before
filing it, and nothing in the workflow ever installed cosign. Four earlier runs
died a line earlier — at the ref selector — so the missing tool was never
reached. The first run to get past selection (39956868762) died with:

```
selected provenance for refs/tags/@xenos1996/usa@2.28.4 (1 match)
line 125: cosign: command not found
exit 127
```

Adds `sigstore/cosign-installer`, pinned to `398d4b0` (v3.9.1), before the step
that calls it. Three assertions in `tests/unit/publish-workflow.test.ts` pin the
shape: the step calls cosign, cosign is installed from a commit-pinned action,
and it is installed _before_ the step — an installer placed after the step is
as broken as none at all.
