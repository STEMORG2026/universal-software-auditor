/** Help texts and scaffold templates (pure data — no imports). Generated docs embed the help. */

export const MODELS_HELP_TEXT = `
usa models — list models a provider advertises

  usa models --provider ID

  Prints one model id per line (live listing, static default on fallback).
  Use it to check a model id exists before a session spends calls on a 404.
`.trim();

export const LIVE_HELP_TEXT = `
usa live — conversational audit session

  usa live [path] [--provider ID] [--model M] [--transcript FILE] [--triage-limit N] [--dry-run]

  Walks foundation → audit → triage → report with you. The deterministic
  engine verifies; the model only proposes. Without a provider the session
  runs deterministically (model turns are skipped loudly, never faked).

  --provider <id>     LLM provider preset (default $USA_PROVIDER, else deterministic-only)
  --model <m>         Model id (default preset default or $USA_MODEL)
  --transcript <file> Write the session transcript to this file
  --triage-limit <n>  Max findings to walk in triage (default 15, ceiling 50)
  --dry-run           Print the transcript path that would be written and exit
`.trim();

export const HELP = `
usa — Universal Software Auditor

  usa audit [path]              Audit a project and write a Markdown report
  usa docs audit [path]         Documentation universe audit (14 categories, 220 artifacts)
  usa docs impact [path]        Which documentation a change affects (semantic model)
  usa docs coverage [path]      Documentation coverage report against the taxonomy
  usa detect [path]             Print the auto-detected facts and maturity
  usa rules [--section S2]      List all loaded rule packs and rules
  usa explain <RULE-ID>         Show everything about one rule
  usa diff <before> <after>     Compare two previously generated reports
  usa verify-report <AUDIT.md>  Verify a report's detached signature sidecar
  usa init [path]               Scaffold .usa.yaml + a GitHub Actions workflow
  usa bootstrap [path]          Propose rule packs for stacks USA cannot audit yet
  usa learn <report.md>         Generate suggested rules from audit findings
  usa evolve [path]             Run the audit → gap → candidate → release loop
  usa standards                 Report catalogue coverage and automatability
  usa categories                Report future-domain category coverage
  usa foundation init [path]    Capture project intent into .usa/foundation.yaml
  usa foundation show [path]    Print the effective intent and asserted facts
  usa live [path]               Conversational audit session (deterministic without a provider)
  usa serve [opts]              Localhost audit server (loopback only, bearer token)
  usa scan [path]               Run scanner adapters, write a run manifest + evidence
  usa intent <model.json>       Compare a declared threat model with observed evidence
  usa models --provider ID      List models the provider advertises

evolve options
  --dry-run            Print what would be written and exit (no cycle, no store writes)
  --store <dir>        Persist audit runs/results (content-addressed store)
  --candidate <file>   A candidate capability pack (YAML) to benchmark and release
  --propose            Auto-propose a candidate from the gaps (bootstrap catalog)
  --all-gaps           Evaluate every proposable candidate (one per open gap)
  --learn <report.md>  Propose a candidate from a report's open findings (usa learn)
  --min-severity <s>   Min severity for --learn (default MEDIUM)
  --bench-dir <dir>    Directory of benchmark case *.json files
  --rules-dir <dir>    Rule pack directory             (default bundled rules/)

learn options
  --dry-run           Print the output path that would be written and exit
  --out <file>        Output YAML file (default learn-suggestions.yaml)
  --min-severity <s>  Minimum severity to consider (CRITICAL|HIGH|MEDIUM|LOW|FUTURE, default MEDIUM)

rules options
  --section <id>      Show one section only (e.g. S2)
  --facets            Facet coverage: ownership, review dates, evaluation cost

standards options
  --format <fmt>      md | json                       (default md)
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)

categories options
  --format <fmt>      md | json                       (default md)
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)

foundation options
  --dir <path>        Project directory (default .; a positional path works too)
  --non-interactive   Write the defaults file without prompting (init only)
  --dry-run           Print the file that would be written and exit (init only)

live options
  --dry-run           Print the transcript path that would be written and exit
  --provider <id>     LLM provider preset (default $USA_PROVIDER, else deterministic-only)
  --model <m>         Model id (default preset default or $USA_MODEL)
  --transcript <file> Write the session transcript to this file
  --triage-limit <n>  Max findings to walk in triage (default 15, ceiling 50)

models options
  --provider <id>     LLM provider preset (or $USA_PROVIDER)

scan options
  --out <file>             Evidence report path (default .usa/evidence/<id>.md)
  --scanner <id>           Run only this adapter (repeatable, or comma list)
  --network                Allow adapters that declare they need network
  --allow-build-commands   Permit build-requiring scanners (recorded, opt-in)
  --json                   Print the manifest and evidence as JSON

intent options
  --evidence <file>        A \`usa scan --json\` payload to join against the model
  --json                   Print the report as JSON

serve options
  --port <n>          Port to listen on (default 0 = ephemeral, printed at startup)
  --token <t>         Bearer token for /api/* (default: generated and printed once)
  --allow-root <dir>  Auditable root, repeatable (default: working directory)
  --data-dir <dir>    Persist finished audits here (default: memory only)

docs options (usa docs audit | impact | coverage)
  --out <file>        Report path for audit (default DOC-AUDIT.md)
  --format <fmt>      md | json                       (default md)
  --fail-on <sev>     audit only: exit 1 on findings >= sev
                      (same gate as CI; none|critical|high|medium|low)
  --changed <file>    audit/impact: changed file (repeatable, or comma separated)
  --describe <file>   impact: show one file's documentation relationship
  --tiers <list>      audit: expected tiers, comma separated (default by maturity)
  --profile <stage>   auto | prototype | mvp | beta | production | legacy
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)
  --config <file>     Explicit .usa.yaml location
  --dry-run           audit only: print the report path that would be written

audit options
  --dry-run           Print the report path that would be written and exit
  --out <file>        Report path (default AUDIT.md)
  --format <fmt>      md | json | sarif | narrative | html (default: inferred from --out)
  --depth <level>     quick | standard | deep          (default standard)
  --profile <stage>   auto | prototype | mvp | beta | production | legacy
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)
  --config <file>     Explicit .usa.yaml location
  --include <packs>   Force these packs on (comma separated)
  --exclude <packs>   Force these packs off
  --docs-universe     Include the documentation universe audit (DOCU-* findings in S12;
                      also via .usa.yaml \`docs.universe: true\`)
  --fact <ns:value>   Assert a fact detection missed, e.g. --fact has:database
  --allow-commands    Run \`command:\` checks (shells out; off by default)
  --fail-on <sev>     Exit 1 on findings >= sev: critical|high|medium|low|none
  --baseline <file>   New-code gate: only fail on findings new or regressed
                      vs this previous report (default threshold high;
                      explicit --fail-on overrides it)
  --quiet             Only errors
  --max-files <n>     Index at most n files (overrides config; default 60000)
  --max-bytes <n>     Skip files larger than n bytes (overrides config; default 2 MiB)

bootstrap options
  --dry-run           Print the path that would be written and exit (with --out)
  --out <file|dir>    Write pack files instead of printing (default: print)

init options
  --dry-run           Print the files that would be scaffolded and exit

verify-report options
  --bundle <file>       Signature sidecar (required, e.g. AUDIT.md.sig.json)
  --key <file>          PEM public key the bundle is verified against
  --cosign-binary <bin> Override the cosign binary (default cosign)
  --quiet               Only errors

examples
  usa audit . --depth deep
  usa bootstrap ~/code/legacy-php-app --out /tmp/packs
  usa audit ../api --profile production --fail-on high
  usa audit . --baseline reports/2026-08.md --fail-on high
  usa audit . --out reports/audit-$(date +%F).md
  usa learn AUDIT.md --out swift-suggestions.yaml
  usa verify-report AUDIT.md --bundle AUDIT.md.sig.json --key cosign.pub
`.trim();

export const WORKFLOW_TEMPLATE = `# USA — Universal Software Auditor
# Runs on every PR and pushes a Markdown summary you can read in the Actions UI.
name: USA Audit

on:
  pull_request:
  push:
    branches: [master]
  workflow_dispatch:
    inputs:
      depth:
        description: Audit depth
        required: false
        default: standard
        type: choice
        options: [quick, standard, deep]

permissions:
  contents: read
`;

// ---- main entry point ----
// Run only when this file is the entry point. Comparing `import.meta.url` to
// `file://${process.argv[1]}` breaks under npm's bin symlinks: argv[1] is the
// `.bin/usa` symlink while import.meta.url is the real dist/cli.js path, so
// the guard never matches and the CLI exits silently. Resolve argv[1] to its
// real path first (and guard the fs call so a non-file argv never throws).
