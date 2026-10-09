# ARCHITECTURE.md — System Architecture

**Last updated:** 2026-10-01T16:30:00+05:45
**Source of truth:** `docs/ARCHITECTURE.md` (canonical), this file (MACP mirror)

---

## Overview

USA is a **rule interpreter**, not a linter. Nothing about any particular
language, framework, or standard is hard-coded in TypeScript. The engine knows
how to walk a directory, match a glob, grep a file, and do arithmetic on
weights. Everything _opinionated_ lives in `rules/`, as YAML.

## The Five Stages

```
   project tree
        │
        ▼
  ┌───────────┐   rules/detectors.yaml    ┌──────────┐
  │  Project  │ ─────────────────────────▶│  Facts   │  lang, pm, fw, maturity…
  │  (index)  │                           └────┬─────┘
  └───────────┘                                │
        │                                      ▼
        │                        ┌──────────────────────────┐
        │                        │  Pack selection          │
        │                        │  pack.applies_when ⊨ facts│
        │                        └────────────┬─────────────┘
        │                                     ▼
        │                        ┌──────────────────────────┐
        │                        │  Rule evaluation         │
        │                        │  <!-- usa:fact check-kinds -->16 check kinds<!-- /usa:fact --> → status  │
        │                        └────────────┬─────────────┘
        │                                     ▼
        │                        ┌──────────────────────────┐
        └───────────────────────▶│  Maturity dampening      │
                                 │  severity × profile      │
                                 └────────────┬─────────────┘
                                              ▼
                                 ┌──────────────────────────┐
                                 │  Scoring → report        │
                                 │  Markdown · JSON · SARIF │
                                 └──────────────────────────┘
```

## Module Map

| Module        | File                                            | Responsibility                                                               |
| ------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Project index | `src/util/project.ts`                           | One pass over the tree. Honours `.gitignore` + user ignores. Caches reads.   |
| Glob matcher  | `src/util/glob.ts`                              | Dependency-free glob → RegExp.                                               |
| YAML shape    | `src/util/yaml.ts`                              | Makes the parse boundary explicit.                                           |
| Detection     | `src/detect/index.ts`                           | Evaluates 236 detector primitives into a fact set, then classifies maturity. |
| Pack loading  | `src/engine/loader.ts`                          | Parses + validates packs, applies user overrides.                            |
| Evaluation    | `src/engine/evaluate.ts`                        | Runs one check against the index; resolves `applies_when` predicates.        |
| Maturity      | `src/engine/maturity.ts`                        | Dampens severity by lifecycle stage. CRITICAL is never dampened.             |
| Scoring       | `src/engine/score.ts`                           | Weighted credit arithmetic. Returns `null` for unverified sections.          |
| Report        | `src/report/`                                   | Deterministic Markdown (+ YAML trailer), JSON, and SARIF 2.1.0.              |
| Diff          | `src/engine/diff.ts`                            | Compares two reports via their trailers.                                     |
| Evolution     | `src/evolution/`, `src/store/`, `src/snapshot/` | Optional self-extension loop.                                                |
| Live          | `src/live/`                                     | Conversational sessions with LLM.                                            |
| Agent         | `src/agent/`                                    | Provider presets and chat transport.                                         |
| Foundation    | `src/foundation/`                               | Project-intent interview and detection.                                      |
| Serve         | `src/serve/`                                    | Localhost server for reports.                                                |
| Learn         | `src/learn/`                                    | Learning from audit runs.                                                    |
| Bootstrap     | `src/bootstrap/`                                | Self-extension via curated starter packs.                                    |

## Key Design Principles

1. **Rules are data, not code** — adding a framework is a YAML diff, not a release
2. **Fact system** — detectors produce facts, rules declare predicates over facts
3. **Severity dampening** — prototype vs production get different reported severity
4. **Scores can be null** — unverified sections are excluded, not zero
5. **No plugins, no network, no auto-fixing** — deterministic, offline, evidence-first
6. **Self-auditing** — every PR runs USA on its own tree

## Extension Points

| To add…                         | You touch…                                |
| ------------------------------- | ----------------------------------------- |
| A check                         | any `rules/**/*.yaml`                     |
| A technology USA must recognise | `rules/detectors.yaml`                    |
| A lifecycle profile             | `rules/profiles/maturity.yaml`            |
| A new check _kind_              | `src/engine/evaluate.ts` + `src/types.ts` |

## CLI Commands

- `usa audit` — run an audit
- `usa detect` — print the fact set
- `usa rules` — list rules
- `usa explain <rule-id>` — explain a rule
- `usa diff` — compare two reports
- `usa standards` — standards coverage
- `usa categories` — rule categories
- `usa docs audit` — documentation universe audit
- `usa docs impact` — which docs changed files invalidate
- `usa docs coverage` — full-universe coverage report
- `usa bootstrap` — self-extension
- `usa evolve` — evolution loop
- `usa live` — live audit session
- `usa foundation init` — foundation interview
- `usa serve` — localhost server
- `usa verify-report` — verify signed report
- `usa learn` — learn from runs
- `usa snapshot` — snapshot management
- `usa reports` — report management
- `usa query` — query the store
- `usa scaffold` — scaffold new content
- `usa cli-docs` — CLI documentation
