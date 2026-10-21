# SonarQube

## Purpose

A static-analysis _platform_: server-side analysis of code smells, bugs and
vulnerabilities across ~30 languages, with quality gates, a dashboard history,
and a plugin model for extensions.

## Architecture

Three parts: the **scanner** CLI (collects and ships analysis), the **server**
(Web API + database + UI, PostgreSQL/MySQL required), and **per-language
analyzers** (bundled in the scanner). Issues are raised by rules and routed
through quality profiles; a **quality gate** decides pass/fail for the overall
project. All of this is server state — the scanner alone produces no durable
report.

## Relevant APIs/CLI

**[UNVERIFIED]** — SonarQube was not installed or run during this research.

```bash
sonar-scanner -Dsonar.host.url=<url> -Dsonar.projectKey=<key> -Dsonar.sources=.
```

The server exposes a REST Web API (`/api/issues/search`, `/api/measures/…`,
`/api/qualitygates/…`) returning JSON, which is the only sane consumption path:
scan once, pull the findings through the API rather than parsing scanner logs.

## Output formats

Server Web API JSON; scanner logs; an HTML report is a community/paid feature,
not the platform contract. No SARIF is produced by the community edition.

## License

LGPL-3.0. **[VERIFIED-SOURCE]** — GitHub API `license.spdx_id`. Note that
LGPL applies to the server: embedding it into another product is a distributing
act with obligations. We do not need to.

## Integration method

**OPTIONAL_PLUGIN / FUTURE** — not DIRECT_INTEGRATION. Consume via
`GET /api/issues/search` with a credentials-injecting HTTP client, never by
embedding the server or the scanner's log format.

## Useful capabilities

- Issue _types_ (bug, vulnerability, code smell) with effort estimates and rule
  descriptions, which are better than raw severity for prioritisation.
- Quality-gate status as a single gate with an explicit, configured threshold.
- History on the server, so trends are computed by the tool rather than by us.

## Limitations

- Requires a server, a database, credentials, and (for most languages) a build.
- Community edition has no SARIF and no full security engine; its security value
  overlaps our own S2 rules.
- Two sources of truth (server state + our evidence model) can drift; an audit
  must record the server version and the analysed snapshot id.

## Security considerations

The server holds credentials for SCM and results for private code. The scanner
needs no privileges but the Web API token is a secret. SonarQube analysis does
not execute project code (Java projects use bytecode analysis, not a build).

## Recommended use in our auditor

Tier 3, opt-in per project. The **quality gate** concept is worth adopting into
our model (a gate is a policy over findings, not a score); the tool itself is
only a source of issue evidence for teams that already run it.
