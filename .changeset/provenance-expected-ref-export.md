---
'@xenos1996/usa': patch
---

release: export the expected ref so the provenance selector can read it

The `File provenance bundle + VSA` step failed for the third time on the 2.28.3
dispatch (run 39943859454), and again for a reason that was knowledge rather
than logic:

- `EXPECTED_REF="refs/tags/@xenos1996/usa@${VERSION}"` was a shell assignment,
  which is **not** an environment entry. `node -e` therefore read
  `process.env.EXPECTED_REF` as `undefined` and compared every statement's ref
  against it, so the step died with
  `no provenance for 71e5278c… built from undefined (saw 3)` — while all three
  attestations were present in the response, one of them from the release tag.
  The digest was correct the whole time; only the expected ref was invisible.
  The line is now `export`ed.
- The selector also refuses to run without `EXPECTED_REF` or `TARBALL_SHA256`
  in the environment, so this class of defect reports its cause instead of
  reading like a missing attestation.

`tests/unit/publish-workflow.test.ts` derives the constraint rather than naming
the variable: every `process.env.X` read by a node block in the step must come
from `$GITHUB_ENV`, the step's `env:` block, an inline `X=… node` prefix, or an
`export`. Reintroducing the bare assignment makes it fail with
`['EXPECTED_REF']`; restored, the file is byte-identical.
