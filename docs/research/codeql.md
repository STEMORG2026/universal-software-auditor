# CodeQL

## Purpose

Semantic code analysis: queries run against a relational database extracted from
source code, with full data-flow and control-flow information. Its precision on
taint-style vulnerabilities is the reason it is worth its cost.

## Architecture

Two phases, always in this order:

1. **Extraction** — a per-language extractor parses the code into a relational
   database (`codeql database create`). Compiled languages are traced through a
   real build; interpreted languages need no build command.
2. **Analysis** — QL queries (from query packs) run against that database and
   produce results, rendered to SARIF.

The query packs (`codeql/javascript-queries`, `codeql/python-queries`, …) are
versioned independently of the CLI, which is why the pack version must be part
of the run manifest.

## Relevant APIs/CLI

**[VERIFIED-SOURCE]** for `database create`; **[UNVERIFIED]** for `analyze`
flags, which the page consulted did not cover.

```bash
codeql database create <db> --language=javascript-typescript --source-root <dir>
codeql database analyze <db> <query-pack> --format=sarif-latest --output=results.sarif
```

- `--language` values: `c-cpp`, `csharp`, `actions`, `go`, `java-kotlin`,
  `javascript-typescript`, `python`, `ruby`, `rust`, `swift`.
- `--command` is **recommended for compiled languages and must not be passed for
  JS/TS, Python or Ruby** — doing so overrides the extractor and produces an
  empty database.
- `--build-mode none|autobuild` for C/C++, C#, Java, Rust.
- `--db-cluster` + comma-separated languages for multi-language repos.
- The database directory must not already exist; the docs say the command fails
  rather than overwriting.

## Output formats

SARIF is the primary machine format. The CLI also emits CSV and can upload to
GitHub code scanning.

## License

MIT for the queries in `github/codeql`. **[VERIFIED-SOURCE]** — GitHub API
`license.spdx_id`. The CLI binary is free to use but is not OSI-licensed; a
downstream consumer must check the CLI's own terms before redistribution.

## Integration method

**CLI_ADAPTER**, but the only Tier 1 adapter that is _expensive_: it needs a
download (hundreds of MB), a database per language, and a build for compiled
languages. It must be opt-in (`--with codeql`), never the default.

## Useful capabilities

- Data-flow paths: a finding can say _source → sink_, which no regex engine can.
- CWE-tagged queries, so control mapping is inherited rather than invented.
- SARIF output means the same normalizer as Semgrep/Trivy serves it.

## Limitations

- Disk and time: a JS/TS database is hundreds of MB; a Java build can be
  minutes.
- Language coverage is uneven, and "no database for this language" must be
  reported as `UNAVAILABLE`, not as a clean scan.
- The extractor needs the project's toolchain (Node for TS, Python 3 for
  Python). A sandbox without it silently yields an empty database — the adapter
  must check the database is non-empty before analyzing.

## Security considerations

**The extractor can run the project's build command.** `--command` is arbitrary
code execution by design. That is precisely the boundary the auditor must not
cross implicitly: if a build command is used, it is an explicit, recorded,
user-approved decision, and it runs under the same sandbox policy as any other
untrusted execution.

## Recommended use in our auditor

Tier 1, last of the four to be enabled, behind a flag. It provides the depth that
justifies the whole evidence model — but only for projects that can afford the
database, so its absence must be first-class (`UNAVAILABLE`), not an error.
