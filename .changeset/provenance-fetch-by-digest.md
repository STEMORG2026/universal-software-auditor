---
'@xenos1996/usa': patch
---

release: fetch the release provenance by digest instead of addressing a file that does not exist

The `File provenance bundle + VSA` step failed on the first dispatch after
`publish.yml` gained verification, and every defect below was reproduced
before being fixed.

- `gh attestation download` was called with a `name@sha256:<digest>` argument.
  Its positional parameter is a local **file path** — there is no such
  addressing form — so the command failed with `failed to open local artifact:
open usa-release-2.28.3.tgz@sha256:71e5278c…: no such file`. Passing the real
  tarball does not help either: `gh` hashes the bytes it is given and looks
  _that_ digest up, so any byte difference (npm rewrites `package.json` inside
  the tarball) is a 404. The step now reads
  `repos/{owner}/{repo}/attestations/sha256:<digest>` directly, with retries
  for the endpoint's intermittent 502/504.
- The API returns every provenance for a digest. A second publish run for the
  same version leaves two with the same subject, and `-L 1` returned whichever
  the server listed first — so the VSA could be filed over another run's
  statement. The step now selects on
  `buildDefinition.externalParameters.workflow.ref == refs/tags/@xenos1996/usa@<version>`
  and refuses to file if no provenance matches.
- `cosign verify-blob-attestation` was given the DSSE payload as its blob.
  With the default `--check-claims=true` it compares _that file's_ sha256 to
  the statement's subject, so it always failed with `provided artifact digests
do not match digests in statement`. It now uses `--digest <tarball sha256>
--digestAlg sha256`, which names the subject directly. Verified by hand
  against the 2.28.3 bundle: `Verified OK`, and it exits 1 when the digest or
  the certificate identity is wrong.

`tests/unit/publish-workflow.test.ts` pins each of these against the workflow
source; all four were watched failing by reintroducing the defect.
