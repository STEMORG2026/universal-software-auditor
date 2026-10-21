# OpenSSF Scorecard

## Purpose

Scores a _repository's_ security posture — not its code — across 18 heuristics
(branch protection, code review, pinned dependencies, token permissions, signed
releases, SAST presence, …). Each check is 0–10; the aggregate is a
risk-weighted average.

## Architecture

A set of independent probes, each querying a platform API (GitHub/GitLab) or the
repository contents, producing a check result with a score, a reason, and
structured details. A runner collects the results and a scorer aggregates them
with weights: Critical 10, High 7.5, Medium 5, Low 2.5.

The project's own README is explicit that the checks are **heuristics with false
positives and false negatives**, and that the aggregate score "tells you nothing
about what individual behaviors a repository is or is not doing". The v5 line
moves toward "structured results" — per-probe facts rather than a single number
— which is the direction worth copying.

## Relevant APIs/CLI

**[VERIFIED-SOURCE]** from the README:

```bash
scorecard --repo=github.com/<org>/<repo> --format=json
scorecard --repo=<url> --checks Branch-Protection --show-details
```

- `--repo`, `--checks`, `--show-details`, `--show-annotations`, `--format`.
- Package lookups instead of repos: `--npm`, `--pypi`, `--rubygems`, `--nuget`.
- Most checks need a token (`GITHUB_AUTH_TOKEN`); unauthenticated runs silently
  degrade several checks to `?`.

## Output formats

Text (default) and JSON. **[VERIFIED-SOURCE]** — the README documents only these
two and does not mention SARIF, so the adapter must not assume SARIF exists.

## License

Apache-2.0. **[VERIFIED-SOURCE]** — GitHub API `license.spdx_id`. (The _data_
served by the REST API is CDLA-Permissive-2.0, a separate matter.)

## Integration method

**CLI_ADAPTER**, but network-dependent: it reads a remote repository through an
API. That makes it unsuitable for an offline audit of a local checkout unless a
token and network are explicitly allowed.

## Useful capabilities

- Facts the code itself cannot contain: branch protection, review requirements,
  token scopes, signed releases.
- `--show-details` gives the per-check reason, which is the evidence we want —
  not the 0–10 score.
- Per-probe structured results (v5) map cleanly onto our evidence model.

## Limitations

- A score is not evidence. "Branch-Protection: 7" is not a finding; "required
  review is not enforced on the default branch" is.
- `?` means "could not evaluate" — the adapter must map it to `UNKNOWN`, never
  to a pass or a zero.
- Scores are mutable across tool versions, so they must never be compared across
  runs without recording the tool version.
- It assesses the _platform configuration_, which for a local checkout may
  differ from the repo it came from.

## Security considerations

Requires a token with read access to the repository; the token is a credential
and must never be written into the run manifest. It does not execute project
code.

## Recommended use in our auditor

Tier 2. Adopt the **structured per-probe result** as the integration shape and
refuse the aggregate score as a finding. Its checks overlap our own REPO-_,
SUP-_, CICD-* rules; the adapter's value is the facts that need the platform API
(branch protection, token permissions), not a second opinion on files we can
read ourselves.
