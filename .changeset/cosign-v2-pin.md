---
'@xenos1996/usa': patch
---

fix(release): pin cosign to a v2.x, because the installer cannot fetch a v3

#250 pinned `cosign-release: v3.1.3` to match the version its flags were checked
against. That was the right instinct and the wrong version: the install step
failed on the very next dispatch with HTTP 22, downloading

```
https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64.sig
```

cosign v3 releases ship `.sigstore.json` bundles and **no** `cosign-linux-amd64.sig`,
which is the asset `cosign-installer` verifies the download against. No installer
version helps — the newest, v4.1.2, predates cosign v3.

`v2.6.5` is the newest v2.x and carries the legacy assets. Its flag surface was
checked on the real binary rather than assumed: `--bundle`, `--digest`,
`--digestAlg` and `--type` all exist, and the step's exact
`verify-blob-attestation` invocation returns `Verified OK` against the real
2.28.4 bundle (and fails on a wrong digest).
