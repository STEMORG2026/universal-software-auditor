# CI run 20261026T081447Z-15eab9095d06-460c68

- Project: **usa** 2.28.8
- Profile: `standard`
- Command: `validate`
- Result: **FAIL** (exit 1)
- Duration: 1.3s
- Commit: `15eab9095d06` on `feat/submit-not-terminal` (dirty)
- Gates: 15 pass, 1 fail, 1 warn, 1 skip, 0 error

| Stage | Status | Duration | Gates |
| --- | --- | --- | --- |
| precheck | PASS | 3ms | 7 |
| repository | FAIL | 157ms | 11 |

## Blocking failures

### `repository.forbidden-files` (repository)

1 forbidden path(s): .env.example
- Remediation: Remove the files from Git (`git rm --cached <path>`), rotate any exposed credential, and extend .gitignore.


## Warnings

- `repository.clean`: dirty: 3 path(s); release will refuse until committed

## Evidence

- Result JSON: `.ci/results/20261026T081447Z-15eab9095d06-460c68.json`
- Logs: `.ci/logs/20261026T081447Z-15eab9095d06-460c68`
- Reports: `.ci/reports/20261026T081447Z-15eab9095d06-460c68`
- Artifacts: `.ci/artifacts/20261026T081447Z-15eab9095d06-460c68`
