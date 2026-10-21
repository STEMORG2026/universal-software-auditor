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

## [VERIFIED-RUN] — what a real run showed (v5.6.0)

The release binary was downloaded and run against this repository. Four things
the documentation does not tell you, all of which change the adapter:

1. **`--local <folder>` exists.** It reads a checkout and runs the file-based
   checks with no network and no token. This is the mode an auditor of a local
   checkout wants, and it is not mentioned in the README.
2. **Platform checks do not degrade in local mode — they kill the run.**
   `--checks=Branch-Protection` with `--local` exits with
   `Unsupported RequestType [0] by check: Branch-Protection`. The check list must
   therefore be explicit in local mode; omitting it is a crash, not a partial
   result.
3. **Which checks work offline** (each verified by running it individually):
   `SAST`, `License`, `Pinned-Dependencies`, `Dependency-Update-Tool`,
   `Binary-Artifacts`, `Fuzzing`, `Packaging`. Which do not: `Maintained`,
   `CI-Tests`, `CII-Best-Practices`, `Contributors`, `Branch-Protection`,
   `Token-Permissions`, `Signed-Releases`, `Code-Review`, `Security-Policy`,
   `Vulnerabilities`.
4. **`scorecard version` prints an ASCII-art banner before the number**, so a
   loose version regex matches the art. The JSON report also carries the version
   and is the better source.

The JSON shape (captured, and committed as `tests/fixtures/scanners/scorecard.json`):

```json
{
  "repo": { "name": "file:///path", "commit": "unknown" },
  "scorecard": { "version": "v5.6.0" },
  "score": 7.5,
  "checks": [
    {
      "name": "License",
      "score": 9,
      "reason": "license file detected",
      "documentation": { "url": "…" }
    }
  ]
}
```

In local mode `repo.commit` is the string `unknown`, so the adapter must take the
revision from its own detection and never from scorecard.

## Relevant APIs/CLI

**[VERIFIED-SOURCE]** from the README:

```bash
# Offline, file-based checks against a checkout — the default in our adapter.
scorecard --local <folder> --format=json --checks SAST,License,Pinned-Dependencies

# Platform checks: needs network and GITHUB_AUTH_TOKEN.
scorecard --repo=<owner/repo> --format=json --show-details
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

Tier 2, implemented as a two-mode adapter: `mode: local` by default (offline,
file-based, no token) and `mode: repo` as the opt-in for platform facts. The
aggregate score is never emitted as evidence; each probe becomes one row whose
claim carries `name (score/10): reason`, and a 9 or a 6 is `PARTIAL` rather than
a collapse to PASS or FAIL — the threshold is a rule's decision, not a parser's. Adopt the **structured per-probe result** as the integration shape and
refuse the aggregate score as a finding. Its checks overlap our own REPO-_,
SUP-_, CICD-* rules; the adapter's value is the facts that need the platform API
(branch protection, token permissions), not a second opinion on files we can
read ourselves.
