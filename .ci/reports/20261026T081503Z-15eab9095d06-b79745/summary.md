# CI run 20261026T081503Z-15eab9095d06-b79745

- Project: **usa** 2.28.8
- Profile: `standard`
- Command: `check`
- Result: **FAIL** (exit 1)
- Duration: 15.2s
- Commit: `15eab9095d06` on `feat/submit-not-terminal` (dirty)
- Gates: 11 pass, 1 fail, 0 warn, 1 skip, 0 error

| Stage | Status | Duration | Gates |
| --- | --- | --- | --- |
| precheck | PASS | 3ms | 7 |
| format | PASS | 7.6s | 1 |
| lint | PASS | 3.4s | 1 |
| typecheck | PASS | 2.1s | 1 |
| security | FAIL | 1.0s | 3 |

## Blocking failures

### `security.secrets` (security)

34 new potential secret(s) in 781 files
- Log: `.ci/reports/20261026T081503Z-15eab9095d06-b79745/secrets.json`
- Remediation: Remove the credential and rotate it. For deliberate test fixtures, add `localci:allow-secret` on the line, configure a precise allowlist entry such as `tests/fixtures/**/*.py:generic-assignment`, or accept it in the committed baseline with `./ci security --update-baseline`.


## Evidence

- Result JSON: `.ci/results/20261026T081503Z-15eab9095d06-b79745.json`
- Logs: `.ci/logs/20261026T081503Z-15eab9095d06-b79745`
- Reports: `.ci/reports/20261026T081503Z-15eab9095d06-b79745`
- Artifacts: `.ci/artifacts/20261026T081503Z-15eab9095d06-b79745`
