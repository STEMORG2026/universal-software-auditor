# ARCHITECTURE

## What the system actually is

One CLI, one engine, one pass over a tree, one report. The pipeline is linear and the
linearity is the strongest thing about the design: there is no state machine, no daemon, no
plugin host, and no mutable global that a later stage can reach back into.

```
                    ┌──────────────────────────────────────────────┐
   usa audit <path> │  cli.ts → cli-audit.ts → engine/audit.ts     │
                    └───────────────────┬──────────────────────────┘
                                        │
   ┌────────────────────────────────────▼───────────────────────────────────┐
   │ 1  index        util/project.ts    one walk, sorted, cached, bounded    │
   │ 2  detect       detect/index.ts    + rules/detectors.yaml (236 facts)   │
   │ 3  select       engine/pack-selection.ts  skip_when / applies_when      │
   │ 4  evaluate     engine/evaluate.ts 14 of 18 kinds, fail-closed          │
   │ 5  dampen       engine/maturity.ts 5 profiles, CRITICAL immune          │
   │ 6  suppress     engine/suppression.ts rule-wide + site-level            │
   │ 7  score        engine/score.ts    weight × credit, section-weighted    │
   │ 8  gate         engine/gate.ts     --fail-on / --baseline               │
   │ 9  render       report/{markdown,json,sarif,html,narrative}.ts          │
   └────────────────────────────────────┬───────────────────────────────────┘
                                        │
        ┌───────────────┬───────────────┼───────────────┬────────────────┐
        ▼               ▼               ▼               ▼                ▼
   .usa.yaml        foundation      scanner/run     evolution/       serve/
   (config)         (intent)        (6 adapters)    (self-extend)    (localhost)
                                        │
                                        ▼
                                  external binaries
                                  (trivy, semgrep, codeql,
                                   depcruise, scorecard, ort)
```

## Layering, and whether it holds

| Layer        | Modules                                                          | Depends on           | Verdict                                                                                        |
| ------------ | ---------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| Primitives   | `util/{project,glob,yaml,files,env,site}.ts`                     | node stdlib + `yaml` | Clean. `project.ts` is the only module that touches the filesystem in bulk.                    |
| Domain types | `types.ts`                                                       | nothing              | Clean. Single source of truth for Status/Severity/Check.                                       |
| Engine       | `engine/*.ts` (28 modules)                                       | primitives + types   | Mostly clean; two breaches, below.                                                             |
| Reporters    | `report/*.ts`                                                    | types                | Clean — renderers take an `AuditReport` and return a string. No renderer reads the filesystem. |
| Integrations | `scanner/`, `agent/`, `serve/`, `live/`, `evolution/`, `intent/` | engine + primitives  | Boundaries exist and are mostly one-directional.                                               |
| Drivers      | `cli*.ts`                                                        | everything           | Thin, as claimed.                                                                              |

**Breach 1 — the engine knows about documentation.** `engine/evaluate-packs.ts` imports
`engine/docs-audit.ts` and `engine/docs-taxonomy.ts`; `appendDocUniverseFindings` runs a
_second_ audit engine (14 categories, 220 artefacts, its own 586-line module plus a 722-line
invariant module) inside the main evaluation and pushes synthetic findings into the scored
set via `syntheticDocRule`. That is 1 300 lines of a second product living inside the first
one's scoring loop, and it is why `score.ts` has to accept a `Rule` that no YAML pack
produced.

**Breach 2 — scoring reads the rule, not the finding.** `score.ts` calls
`ruleWeight(rule)` while `finding.severity` holds the dampened value. This is the mechanism
behind USA-AUD-003, and it is an architectural fact, not a typo: severity is stored twice
and the two copies disagree about which one the score means.

## Dependency direction

```
cli → engine → util
 │      │
 │      ├→ report (renderers; engine does not import report)
 │      ├→ scanner (only cli-scan and cli-audit's scan path)
 │      ├→ evolution → engine + scanner
 │      └→ foundation / intent / live / agent
 └→ serve → engine + report
```

No cycles were found in the import graph at the module-directory level. `index.ts` is a
public surface (exports `dampen`, `loadProfiles`, the audit entry) and is not imported
internally — a good sign that the library boundary is real rather than decorative.

## Trust boundaries

| #   | Boundary                 | Crossing mechanism                                        | Enforced?                                                                                  |
| --- | ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| T1  | audited tree → engine    | `Project` (read-only, 2 MB / 60 000 file caps)            | **Yes** — symlinks skipped, binary sniffed, no writes                                      |
| T2  | rule pack → engine       | YAML loaded by `loader.ts`, validated, warnings on reject | **Yes** — malformed fails closed                                                           |
| T3  | `.usa.yaml` → engine     | `config.ts`                                               | **Yes** — suppressions require a reason; unused waivers warned                             |
| T4  | engine → scanner process | `spawnSync` + allow-list env + scratch copy               | **No** — see USA-AUD-001/002/009/012                                                       |
| T5  | repository content → LLM | `agent/`                                                  | Partial — the LLM never writes verdicts, but `.env` from cwd can redirect it (USA-AUD-008) |
| T6  | HTTP → server            | loopback + bearer token + allow-roots                     | **Mostly** — no Host validation, but no ambient authority to exploit                       |
| T7  | report → consumer        | trailer + detached signature                              | Partial — binds machine state only (USA-AUD-013)                                           |

T4 is the boundary that matters and the one that is not real. Everything else in this
system is defensively built; the scanner runner is where the design assumes a cooperative
repository.

## Essential vs peripheral

**Essential to the deterministic core** (would have to survive any redesign):
`util/project.ts`, `util/glob.ts`, `types.ts`, `engine/{loader,evaluate,evaluate-packs,
score,suppression,maturity,gate,pack-selection,sections}.ts`, `report/markdown.ts` +
`report/json.ts`. Roughly 3 000 lines carry the product's thesis.

**Peripheral, and separable**: `docs-*` (1 300 lines), `serve/` (723), `live/` (489),
`agent/` (549), `evolution/` (≈900), `scanner/` (≈1 900), `intent/`, `bootstrap/`, `learn/`.

That split is the most important architectural observation in this audit: **the trustworthy
part is small and the untrusted surface is large.** 3 000 lines of engine are surrounded by
18 000 lines of integration, and the one integration that executes foreign code is the one
with the weakest boundary.

## Single points of failure

1. `util/project.ts` — every rule reads through it. A bug in the index is a bug in every
   finding. It is also the module with the ReDoS exposure (USA-AUD-004) and the gitignore
   asymmetry (USA-AUD-007).
2. `types.ts` — the `Status` union is load-bearing for scoring, gating, reporting and
   SARIF. Changing it touches everything; it has been stable, which is why it has held.
3. `score.ts` — 197 lines that produce the only number most readers see.

## Architectural drift observed

- The HTML renderer exists and ships while the roadmap says it is deliberately excluded.
- `docs-audit` grew a second scoring path inside the first.
- `oracle` and `invariant` check kinds were added for evidence ingestion and cross-rule
  composition; neither is used by a shipped rule, so both are untested-in-production code
  paths that the catalogue does not exercise.
- The scanner manifest's `network`/`sandbox` fields describe an intention that the
  implementation never had.
