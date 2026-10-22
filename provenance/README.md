# Release provenance bundles (SUP-022)

Each `v*.sigstore.json` file in this directory is the Sigstore bundle
attesting the release tarball of that version: what was built, from which
commit, in which workflow run. The Release workflow mints it with GitHub
Artifact Attestations and files it here through a normal pull request —
provenance that bypassed review would prove nothing.

Read a filed pair back — signature, VSA fields, and the registry's own hash:

```bash
node scripts/check-provenance.mjs 2.28.2
```

**`gh attestation verify <tarball> --repo STEMORG2026/universal-software-auditor`
does not work on these files, and never has.** GitHub identifies an
attestation by its subject _name_, stored inside a ZIP manifest; for this
repo's release tarballs that name decodes to 44 bytes of garbage (44 bytes at
offset 30 of the manifest, measured across every bundle from 2.28.0 on), so
the lookup 404s. Separately, the tarball `npm pack` produces in the publish
run is not byte-identical to the published one, because npm adds an
`attestations` block to `package.json` — so no attestation here has ever
covered the bytes the registry serves. `docs/release.md` § "What the
attestation covers" has both digests side by side.

The npm registry carries its own independent provenance for the same
release (published with Sigstore attestation), verifiable with
`npm audit signatures`. Two channels, same claim: the tarball you
installed is the tarball the release built.

## Verification summaries (SUP-023)

Each `v*.vsa.json` next to a bundle records that the release workflow
verified the tarball before filing it: Sigstore validity, repository
identity, SLSA provenance predicate, digest match. A VSA file exists if
and only if that check passed — the job fails before filing otherwise.

Re-run the check yourself with the same command the workflow uses — `cosign`
over the bundle's DSSE payload, with the signing workflow as the required
identity:

```bash
node scripts/check-provenance.mjs <version>   # does this for you
```

The VSA names `publish.yml` as its verifier and policy, because that is where
`cosign verify-blob-attestation` runs. Every VSA filed before 2.28.3 named
`release.yml` — the workflow that publishes, not the one that verifies — and
pinned the sha256 of the bundle _file_, which has no canonical byte sequence
(one 2.28.1 attestation serialises to 12284 bytes via `gh` and 11751 via the
API). `inputAttestations[].digest` is now the DSSE payload's hash; the file
hash lives beside it under `attestations[].digest`.

The statement follows the SLSA verification_summary shape: verifier,
time, resource, policy (pinned by digest), input attestation, verdict.
