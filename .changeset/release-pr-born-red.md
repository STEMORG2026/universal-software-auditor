---
'@xenos1996/usa': patch
---

fix(release): stop the release PR being born red

Every Version Packages PR failed `Sample report is generated and committed`: the
version bump changes `package.json`, the sample embeds the version, and nothing
regenerated it.

A `resync` job exists for exactly this and works — the 2.28.7 branch carries
`349ae9d docs: resync generated docs`, and that commit is in sync. But resync
pushed with `GITHUB_TOKEN`, so the run for its commit landed in `action_required`
and was never validated. The repair was invisible and the PR stayed red on the
failure it had just fixed.

Three links fixed:

1. `version-packages` regenerates the generated docs after `changeset version`.
2. `release.yml` runs `pnpm run build` before versioning — the sample generator
   audits, and the audit needs `dist/`.
3. `resync` checks out with `CHANGESET_TOKEN`, so its push produces a run that
   executes.

Verified on the 2.28.7 branch at version 2.28.7: install, build, run the three
generators → `git diff` empty and `gen-sample-report --check` reports
`sample report: OK (in sync)`.
