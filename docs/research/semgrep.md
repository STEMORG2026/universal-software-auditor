# Semgrep

## Purpose

Pattern- and AST-based static analysis for many languages, driven by YAML rules.
Its distinguishing property is that the rule format is readable enough for a
project to write its own rules without learning a query language.

## Architecture

A core engine (OCaml, historically wrapped in Python) parses source into a
generic AST, then matches rule patterns against it. Rules are YAML with
`patterns`/`pattern-either`/`pattern-inside`, optional taint tracking
(`mode: taint`), and metadata. Rule sources are files, directories, or registry
packs (`p/default`, `p/security-audit`). Results carry a stable per-rule
fingerprint.

## Relevant APIs/CLI

**[VERIFIED-SOURCE]** from the CLI reference:

```bash
semgrep scan --config p/default --json --output results.json ./src
semgrep scan --config my-rules/ --sarif --output results.sarif ./src
semgrep --config auto .          # registry rules tailored to the project
```

- `-f/-c/--config` — file, directory, URL, or registry entry. Repeatable.
  `--rules` is **not** a documented flag; the env equivalent is `SEMGREP_RULES`.
- `--severity INFO|WARNING|ERROR` — filter at the rule level, repeatable.
- `--json` / `--sarif` print to stdout; `--json-output` / `--sarif-output` /
  `-o` also write a copy.
- `--error` — exit `1` when there are findings. **Default `scan` exits 0 even
  with findings**, which is the opposite of what a CI gate expects.

**Exit codes** (documented): `0` OK, `1` findings with `--error`, `2` fatal,
`3` invalid target code (`--strict`), `4` invalid pattern, `5` unparseable
YAML, `7` invalid rule, `8` invalid language, `13` invalid API key.

## Output formats

Text, JSON, SARIF, JUnit XML, GitLab SAST, GitLab Secrets.

**[UNVERIFIED]** JSON shape — the CLI reference does not document field names.
The adapter is written against the widely documented shape
(`results[].check_id`, `path`, `start.line`, `end.line`, `extra.severity`,
`extra.message`, `extra.metadata`, `extra.fingerprint`) and must be validated
against a real capture before the adapter is called complete.

## License

LGPL-2.1. **[VERIFIED-SOURCE]** — GitHub API `license.spdx_id`.

## Integration method

**CLI_ADAPTER.** Run `semgrep scan --json`, parse, normalize. Rules are supplied
by the audit (vendored rule directory) rather than fetched at scan time, so an
audit stays reproducible offline.

## Useful capabilities

- Rule metadata carries CWE/OWASP tags, so evidence can be linked to a control
  without a second mapping table.
- Fingerprints are stable across line moves, which makes "new vs pre-existing"
  comparisons possible.
- Taint-mode rules give data-flow findings without CodeQL's database build.

## Limitations

- Registry rules change under you; `--config auto` also phones home. Neither is
  acceptable for a reproducible audit — pin the rule pack by version or commit.
- Severity is rule-declared, not computed; it is not comparable across packs.
- A missing rule pack is a **silent** absence of findings. The adapter must
  record which configs were loaded, or "0 findings" is unfalsifiable.

## Security considerations

Semgrep does not execute project code, but it parses it, and a malicious rule
pack can read files it should not. Vendor and review rule packs; run with the
network disabled and `--config` pointing at a local directory.

## Recommended use in our auditor

Tier 1. It is the SAST half of the evidence base: CodeQL for depth on the
languages it supports, Semgrep for breadth and for project-specific rules. The
adapter treats the rule pack as an input artifact recorded in the run manifest,
not as ambient configuration.
