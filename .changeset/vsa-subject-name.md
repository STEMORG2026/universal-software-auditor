---
'@xenos1996/usa': patch
---

fix(release): the VSA named the npm pack file, not the attested subject

`publish.yml` attests the release tarball under `subject-name:
usa-release-X.Y.Z.tgz`, but built the VSA with `VSA_TARBALL_NAME="$TARBALL"` —
and `$TARBALL` is `npm pack`'s own filename, `xenos1996-usa-X.Y.Z.tgz`. The two
documents therefore disagreed about which artefact they describe.

Measured on the first fully automatic run of the chain (tag
`@xenos1996/usa@2.28.5`, run 40065874654):

```
2.28.4 VSA name : xenos1996-usa-2.28.4.tgz   stmt: usa-release-2.28.4.tgz
2.28.5 VSA name : xenos1996-usa-2.28.5.tgz   stmt: usa-release-2.28.5.tgz
```

`check-provenance.mjs` now fails both with `VSA subject name … != bundle subject
name …`, which is the invariant added in #247 doing its job on its first run.
It had passed before only because the older checker compared against a hardcoded
`xenos1996-usa-` spelling that happened to match the wrong value.

The VSA is a summary _of_ the attestation, so it takes the attestation's name.
`provenance/v2.28.4.vsa.json` is corrected here — same digest, same
`timeVerified`, same everything except the name. 2.28.5's is corrected in #253.
