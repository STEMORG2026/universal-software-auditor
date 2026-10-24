---
'@xenos1996/usa': patch
---

fix(ci): the read-back job installed a cosign that cannot verify

`provenance-check.yml` used `sigstore/cosign-installer` without `cosign-release`,
so it took the installer's default — **v2.5.2** — while `publish.yml` pins
**v2.6.5**. v2.5.2's `verify-blob-attestation` has no `--digest` flag, so the job
failed every bundle:

```
FAIL  bundle signature over its own statement — error during command execution: unknown flag: --digest
```

Measured on the workflow's first real run, `40073426157` — dispatched precisely
because the plumbing around the read-back had never executed, only its `run:`
block extracted locally (where cosign is v3.1.3 and the flag exists).

Both workflows now pin `v2.6.5`, and a test asserts the two agree rather than
each matching a literal, so a one-sided bump fails.
