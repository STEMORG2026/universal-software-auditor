# Architecture Decision Records

Short, numbered, immutable records of the non-obvious choices in this
repository — see [ADR-0001](0001-record-architecture-decisions.md) for why
they exist and the rules for writing them (context, decision, consequences;
a changed decision gets a _new_ ADR that supersedes the old one).

## Index

| #    | Title                                                                | Status     | Supersedes |
| ---- | -------------------------------------------------------------------- | ---------- | ---------- |
| 0001 | Record architecture decisions                                        | Accepted   | —          |
| 0002 | Build the engine in TypeScript, not Python                           | Accepted   | —          |
| 0003 | Rule packs are YAML data, not TypeScript code                        | Accepted   | —          |
| 0004 | Markdown is the only output format                                   | Superseded | —          |
| 0005 | Lifecycle stage dampens severity; CRITICAL exempt                    | Accepted   | —          |
| 0006 | Severity/status two axes; WRONG outranks MISSING                     | Accepted   | —          |
| 0007 | Accepted risk stays visible, stops scoring, expires                  | Accepted   | —          |
| 0008 | Machine-readable trailer; audits are diffable                        | Accepted   | —          |
| 0009 | Malformed input fails closed and loudly                              | Accepted   | —          |
| 0010 | Detectors are cheap signals, fixed-point resolved                    | Accepted   | —          |
| 0011 | Coexist with deep scanners; consume evidence                         | Accepted   | —          |
| 0012 | Self-extension via bootstrap: propose, never self-trust              | Accepted   | —          |
| 0013 | Deterministic, offline evolution loop; no LLM in the spine           | Accepted   | —          |
| 0014 | Deterministic proposal stage; release requires evidence              | Accepted   | —          |
| 0015 | Persistent gap queue: append-only state, derived latest              | Accepted   | —          |
| 0016 | Scheduler requires automated evidence to release                     | Accepted   | —          |
| 0017 | Every automatable rule ships a positive/negative fixture             | Accepted   | —          |
| 0018 | JSON and SARIF renderers join Markdown                               | Accepted   | 0004       |
| 0019 | Oracle-ingestion check kind consumes evidence                        | Accepted   | —          |
| 0020 | Documentation facts are machine-synced and machine-checked           | Accepted   | —          |
| 0021 | Catalogues are pinned, and automatability is derived                 | Accepted   | —          |
| 0022 | Suppressions are site-level, and unused ones are reported            | Accepted   | —          |
| 0023 | Judgement queue is triaged; reviews are dated provenance             | Accepted   | —          |
| 0024 | Quality gates judge new code, not legacy debt                        | Accepted   | —          |
| 0025 | Report signatures are verified, never minted                         | Accepted   | —          |
| 0026 | Generated docs resync themselves on PRs                              | Accepted   | —          |
| 0027 | Provenance is verified: existence, then chain                        | Accepted   | —          |
| 0028 | Signature verification gets a CLI command                            | Accepted   | —          |
| 0029 | Foundation readiness: declared intent, deterministic check           | Accepted   | —          |
| 0030 | Live assurance phase: LLM outside the spine, honesty gate            | Accepted   | —          |
| 0031 | LLM providers: one transport, presets, no keys in files              | Accepted   | —          |
| 0032 | Testing assurance ships as deterministic slices                      | Accepted   | —          |
| 0033 | Future categories are derived, some honestly empty                   | Accepted   | —          |
| 0034 | Live sessions: deterministic machine, stubbed mind                   | Accepted   | —          |
| 0035 | Test evidence starts as counted signals, not verdicts                | Accepted   | —          |
| 0036 | Narrative report is a second format over the same substrate          | Accepted   | —          |
| 0037 | Two reports ship together: raw for machines, narrative for customers | Accepted   | —          |
| 0038 | A root AGENTS.md carries the repo's operating manual                 | Accepted   | —          |
| 0039 | Serve audits on localhost first, with the threat model written down  | Accepted   | —          |
| 0040 | Serve persists reports to disk only when asked                       | Accepted   | —          |
| 0041 | Severity follows observed maturity, never declared stage             | Accepted   | —          |
| 0042 | Documentation is a first-class audit universe, not a report garnish  | Accepted   | —          |

| 0043 | Continuous ingestion: auto-fetch repos, scheduled evolve, human-gated promotion | Accepted | — |

| 0044 | Enforce the MACP startup with a start-of-session gate | Accepted | — |

## Coverage map (what has no ADR, and why)

- **Scoring maths** — specified normatively in `docs/concepts.md`, not an
  ADR: it is a formula with tests, not a judgement call. Disagreeing with it
  means changing code, and the tests adjudicate.
- **Individual rule wordings** — rules are data (ADR-0003). Disputed rules
  get fixed in `rules/` with a regression test, not an ADR.
- **Release mechanics** — tracked in `ROADMAP.md` until decided, then
  recorded here (e.g. the eventual release-automation choice).
