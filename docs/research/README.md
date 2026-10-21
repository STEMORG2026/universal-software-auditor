# Research — external scanners

Every document here answers the same ten questions, in the same order, so the
recommendations can be compared without re-reading prose:

```
Purpose · Architecture · Relevant APIs/CLI · Output formats · License ·
Integration method · Useful capabilities · Limitations ·
Security considerations · Recommended use in our auditor
```

## How these documents were produced

Claims are marked with their evidence class, because the difference between
"the docs say" and "I ran it" is the difference between a plan and a guess:

- **[VERIFIED-RUN]** — executed on this machine, output quoted. Only Trivy
  qualifies today (v0.75.0 is installed).
- **[VERIFIED-SOURCE]** — read from the project's own documentation or
  repository metadata during this research (2026-10-21). Licenses were read from
  the GitHub API's SPDX detection, not from memory.
- **[UNVERIFIED]** — widely documented behaviour that this research did not
  confirm at the source. Every [UNVERIFIED] item must be re-checked before the
  adapter that depends on it is declared complete. As of 2026-10-21 the only
  remaining item in this class is ORT's _violations payload_: its CLI was run and
  is verified, but no violation could be produced without an ORT rules script.

No license below is guessed: all ten were read from
`GET /repos/{owner}/{repo}` → `license.spdx_id`.

## Capability matrix

| Tool                   | Primary purpose                                                              | Input                                          | Output                                | Machine-readable   | SARIF                                        | API/CLI                                      | License                                    | Integration difficulty                                            | Useful evidence                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- | ------------------ | -------------------------------------------- | -------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Scorecard**          | Repo security posture heuristics (18 checks, 0–10 each)                      | Repo URL (GitHub/GitLab/GHES), or package name | Text, JSON                            | Yes                | **No** (not in the README; text + JSON only) | CLI + REST API (`api.scorecard.dev`)         | Apache-2.0                                 | Low (single binary, needs a token for most checks)                | Branch protection, pinned deps, token permissions, signed releases, SAST presence |
| **SonarQube**          | Full static analysis platform (code smells, bugs, vulns, coverage)           | Source tree + build; server-side projects      | Web UI, Web API JSON, Sonar report    | Yes (Web API)      | Partial/third-party                          | Server + scanner CLI + Web API               | LGPL-3.0                                   | **High** (server, database, plugin ecosystem)                     | Rule-level issues with effort/type, quality-gate status, coverage                 |
| **CodeQL**             | Semantic data-flow analysis via queries over a code database                 | Source tree (+ build for compiled languages)   | SARIF                                 | Yes                | **Yes** (primary format)                     | CLI (`database create` → `database analyze`) | MIT (queries); CLI is free-to-use, not OSI | **High** (DB build, per-language extractors, GBs of disk)         | Data-flow paths, CWE-tagged queries, high precision                               |
| **Semgrep**            | Pattern/AST-based SAST with a large rule registry                            | Source tree + rule configs                     | Text, JSON, SARIF, JUnit, GitLab SAST | Yes                | **Yes**                                      | CLI                                          | LGPL-2.1                                   | Low–Medium (pip/binary; registry needs network or vendored rules) | Rule id, severity, message, precise span, fingerprint                             |
| **Opengrep**           | Community fork of the Semgrep engine (LGPL continuity)                       | Same as Semgrep                                | Same as Semgrep                       | Yes                | **Yes**                                      | CLI                                          | LGPL-2.1                                   | Low–Medium (drop-in CLI compatible)                               | Same as Semgrep                                                                   |
| **Trivy**              | Vulnerability + secret + misconfig + license scanning of artifacts and repos | Filesystem, repo, image, SBOM                  | Table, JSON, SARIF, CycloneDX, SPDX   | Yes                | **Yes**                                      | CLI                                          | Apache-2.0                                 | **Low** (one binary, no server)                                   | CVEs with fixed version, secret hits with rule id, misconfig ids, SBOM            |
| **ORT**                | License/security compliance pipeline over dependency graphs                  | Source tree + package managers                 | YAML/JSON reports, SPDX/CycloneDX     | Yes                | No (own model)                               | CLI (Kotlin/JVM)                             | Apache-2.0                                 | **High** (JVM, many package managers, config-heavy)               | Curated dependency graph, license conclusions, policy violations, advisor results |
| **dependency-cruiser** | Dependency graph + architecture rules for JS/TS                              | Source tree + rules config                     | JSON, DOT, HTML, text                 | Yes                | No                                           | CLI + Node API                               | MIT                                        | **Low** (npm package, no server)                                  | Forbidden/circular/orphan edges, graph metrics, rule violations                   |
| **Threat Dragon**      | Threat modelling (DFD: assets, flows, trust boundaries)                      | Human-authored model (JSON)                    | JSON model, PDF report                | Yes (model JSON)   | No                                           | Desktop/web app                              | Apache-2.0                                 | N/A (concepts, not a scanner)                                     | Threats, mitigations, trust boundaries as _intended state_                        |
| **OpenRewrite**        | Automated refactoring via recipes                                            | Source tree + recipe                           | Modified source, datatables           | Partial (datalogs) | No                                           | CLI/Maven/Gradle plugin                      | Apache-2.0                                 | **High** (JVM, per-language recipes)                              | Proposed fix + verification, not detection                                        |

## Reading the matrix

Two columns decide the architecture more than the others:

- **SARIF** — where a tool emits SARIF, the adapter can share one parser
  (`sarif → evidence`). Where it does not (Scorecard, ORT,
  dependency-cruiser), the adapter must own its mapping. This is why the
  evidence model is tool-agnostic and the _parsers_ are not.
- **Integration difficulty** — "Low" means a single binary with a stable JSON
  contract (Trivy, dependency-cruiser). "High" means a runtime we do not
  otherwise need (JVM for ORT/SonarQube, a database build for CodeQL). High
  difficulty tools are Tier 2/3 by construction, not by preference.

## Per-tool documents

| Document                                       | Tier                       |
| ---------------------------------------------- | -------------------------- |
| [scorecard.md](scorecard.md)                   | 2                          |
| [sonarqube.md](sonarqube.md)                   | 3                          |
| [codeql.md](codeql.md)                         | 1                          |
| [semgrep.md](semgrep.md)                       | 1                          |
| [opengrep.md](opengrep.md)                     | 1 (alternative to Semgrep) |
| [trivy.md](trivy.md)                           | 1                          |
| [ort.md](ort.md)                               | 2                          |
| [dependency-cruiser.md](dependency-cruiser.md) | 1                          |
| [threat-dragon.md](threat-dragon.md)           | 3 (concepts only)          |
| [openrewrite.md](openrewrite.md)               | 3 (fix pipeline)           |
