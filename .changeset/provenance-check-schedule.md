---
'@xenos1996/usa': patch
---

ci: read the filed provenance bundles back on a schedule

`publish.yml` verifies the bundle before filing it, which is necessary and not
sufficient — verification that happens only in the run that produced the
artefact cannot notice that the artefact was withdrawn afterwards, that the
signature no longer resolves, or that a VSA field was edited.

`.github/workflows/provenance-check.yml` runs `check-provenance.mjs` over every
filed bundle at or above **2.28.3** (the first version filed by the verified
path; older bundles carry three known findings and are left as filed) on a
weekly schedule and on manual dispatch. It is not a PR check: it needs the npm
registry and the cosign trust root, and a network check on every PR is a check
people learn to ignore.

Measured both directions before the job was added: at a floor of 2.28.2 it
enumerates `v2.28.2`, reports two FAIL and one NOTE, and exits 1; at the real
floor of 2.28.3 it reports `no filed bundle at or above 2.28.3 — nothing to read
yet` and exits 0. `docs/release.md` no longer says the read-back is unwired.

The checker also stopped requiring one spelling of the subject name. It
demanded `xenos1996-usa-<version>.tgz`, which every bundle up to 2.28.2 happens
to carry, while `publish.yml` has since set its `subject-name` to
`usa-release-X.Y.Z.tgz`. The first bundle filed after that change would have
failed the weekly job on a naming choice. It now requires the name to end
`-<version>.tgz` and to match the statement the VSA summarises — measured on the
live 2.28.4 attestation, which now reports three PASS and one NOTE.
