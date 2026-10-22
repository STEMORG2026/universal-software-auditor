---
'@xenos1996/usa': patch
---

Verify the release provenance chain instead of only filing it.

Nothing in this repository had ever read a filed bundle back. Four defects
lived in that gap, and all four were found in one sitting:

- The VSA named `release.yml` as its verifier and policy. That is the
  workflow that publishes; the one that runs `gh attestation verify` and
  files the bundle is `publish.yml`. A VSA that misidentifies its own
  verifier is worse than no VSA, because it reads as evidence.
- `inputAttestations[].digest` held the sha256 of the bundle _file_. A
  bundle has no canonical byte sequence — one 2.28.1 attestation serialises
  to 12284 bytes via `gh attestation download` and 11751 via the REST API —
  so that digest identified a serialisation, not an attestation. It is now
  the DSSE payload's hash, with the file hash kept beside it under
  `attestations[].digest`.
- The VSA took the tarball digest from the tarball `npm pack` produced, but
  the published tarball differs: npm adds an `attestations` block to
  `package.json`, which is the archive's first entry, so every published
  tarball's gzip stream diverges at byte 0. Measured on 2.28.2 — attested
  `ffc84fd7…`, published `10274573…`. The docs said the attestation covered
  the tarball you install. It does not, and now say so.
- `gh attestation verify` could never pass: it looks an attestation up by
  subject _name_, read out of a ZIP manifest, and these tarballs' names are
  44 bytes of garbage at offset 30. The subject is now renamed to
  `usa-release-X.Y.Z.tgz` so the sha256 is the identifier both sides can
  compute, and the workflow verifies the statement (signature via `cosign`,
  then subject digest and `workflow.ref` asserted in code) instead of a
  filename it cannot reconstruct.

`scripts/check-provenance.mjs <version>` reads a filed pair back, and
`tests/unit/provenance-chain.test.ts` pins each defect as a test. Every
guard was mutated and watched failing before it was trusted.
