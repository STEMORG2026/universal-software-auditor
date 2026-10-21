# Opengrep

## Purpose

A community fork of the Semgrep engine, created when Semgrep's core moved to a
different licence model. The stated intent is to keep an LGPL, fully open
engine available with the same rule language.

## Architecture

Same design as Semgrep: source → generic AST → pattern matching over YAML rules,
with taint mode. The fork keeps the CLI surface and the rule schema, which is
what makes it usable as a drop-in.

## Relevant APIs/CLI

**[UNVERIFIED]** — Opengrep is not installed on this machine and its CLI was not
run during this research. It is designed to be command-compatible with Semgrep
(`opengrep scan --config … --json`), but the exact binary name, flag parity, and
any divergences must be verified against a real installation before the adapter
is called complete.

## Output formats

**[UNVERIFIED]** — intended to match Semgrep: JSON, SARIF, text.

## License

LGPL-2.1. **[VERIFIED-SOURCE]** — GitHub API `license.spdx_id`.

## Integration method

**OPTIONAL_PLUGIN — and the reason the adapter layer takes a binary name as
configuration rather than a hard-coded one.**

The Semgrep adapter is written against the _rule + output contract_, not the
binary. Opengrep support is therefore a second registration of the same adapter
with a different executable, provided its output is confirmed compatible. That
decision is deferred until a real capture exists; claiming parity without one
would be exactly the "assume the interface" failure this project forbids.

## Useful capabilities

- LGPL engine with no vendor account requirement.
- Same rule language as Semgrep, so one rule pack can serve both.

## Limitations

- Younger project; fewer integrations, smaller rule ecosystem.
- Divergence from Semgrep is possible over time; the adapter must not assume
  forever-parity.

## Security considerations

Same as Semgrep: parsing only, but rule packs are input and must be vendored and
reviewed.

## Recommended use in our auditor

Ship Semgrep first. Register Opengrep as an alternative executable for the same
adapter once its JSON is captured and diffed against Semgrep's. Do not maintain
two adapters for one contract.
