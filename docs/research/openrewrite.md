# OpenRewrite

## Purpose

Automated, deterministic refactoring of source code through _recipes_: a recipe
is a composable, versioned transformation that can be validated, dry-run, and
replayed across a repository.

## Architecture

A core engine with a change-based result model (add/delete/modify per file with
byte-accurate patches), per-language modality modules, and a large recipe
registry. Recipes declare their dependencies (a "recipe stack") and run over a
parsed project.

## Relevant APIs/CLI

**[UNVERIFIED]** — not installed. Consumption is via the Maven/Gradle plugin or
the CLI image, producing a Git-formatted diff plus datatables.

## Output formats

A unified-diff patch is the natural output; otherwise rendered data tables (JSON
from the datatable endpoint). No SARIF.

## License

Apache-2.0. **[VERIFIED-SOURCE]** — GitHub API `license.spdx_id`.

## Integration method

**FUTURE — DO_NOT_INTEGRATE in phase 1.** This is the _fixer_ half of a
Finding → Recommendation → Proposed change → Verification pipeline, which only
works once the finding engine can name a proof-verified change. Running
refactoring without verification capability would produce unreviewable churn.

## Useful capabilities

- The recipe stack model (a declared, versioned set of transformations) is the
  right shape for a _proposed_ remediation.
- Change-based results with byte-accurate diffs are verifiable evidence about
  what a fix would do — comparable to the evidence model's raw_reference.

## Limitations

- JVM and per-language plugin overhead.
- Covers specific transformations, not arbitrary findings; most of our findings
  are not auto-fixable.
- Dry-run output is still "proposed", not "verified against a target".

## Security considerations

Runs code transformation on the audited tree; must be executed in a scratch
copy, never in place; every produced diff must be verified before being applied.

## Recommended use in our auditor

Tier 3. First design the finding's `remediation` field with a
`proposedChange` (the intent, not a patch). Then wire the fix pipeline for the
narrow set of mechanically verifiable findings (pinned dependency, removed
unused import, hashed algorithm swap) — each recipe a separate, testable adapter
with a reversible patch.
