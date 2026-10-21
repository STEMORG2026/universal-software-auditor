# dependency-cruiser

## Purpose

Builds a dependency graph for JavaScript/TypeScript projects and validates it
against declared architecture rules: forbidden edges, circular dependencies,
orphan modules, and reachability constraints.

## Architecture

Resolves every module in the target tree through the project's own resolver
(tsconfig paths, package.json `exports`), producing a cruise: modules with their
dependencies, plus a validation result against a rules config. Rules are
`forbidden` entries with `from`/`to` path matchers, an optional `via`/`moreThan`
constraint, and a severity.

## Relevant APIs/CLI

**[VERIFIED-SOURCE]** from the project's CLI documentation:

```bash
dependency-cruiser --output-type json src -f cruise.json
dependency-cruiser --config my.rules.json src test     # validate, err reporter
dependency-cruiser --no-config src                     # graph only
```

- `-T/--output-type`: `json`, `dot`, `html`, `err`, `err-long`, `teamcity`,
  `null`, `anon`, `metrics`.
- `-f/--output-to`: file, `-` for stdout (default).
- `--config`: alternate config path. **v13+ auto-detects**
  `.dependency-cruiser.{js,cjs,mjs,ts,cts,mts,json}`, so `--config` is only for
  non-default names; `--no-config` disables detection.
- `--metrics` adds `N`/`Ca`/`Ce`/`I` stability metrics to the JSON.

**Exit codes:** the `err`/`err-long`/`teamcity` reporters exit with the **number
of `error`-severity violations**. `-T json` **exits 0 regardless of
violations** — it only serializes. That asymmetry is the single most important
fact for the adapter: parse the JSON, never infer the verdict from exit status.
For a gating exit code from a saved cruise, the docs point at
`depcruise-fmt --exit-code`.

## Output formats

JSON (the internal cruise representation), DOT, HTML, text, TeamCity.

[VERIFIED-RUN] dependency-cruiser 18.7.0 was installed and run on a two-file
fixture with a rules config. Top-level keys are `modules` and `summary` — and
**there is no top-level `rules` key**, so whether rules ran is a _configuration_
fact that cannot be detected from the output. A violation is:

```json
{
  "type": "dependency",
  "from": "a.js",
  "to": "b.js",
  "unresolvedTo": "./b.js",
  "dependencyTypes": ["local", "require"],
  "rule": { "severity": "error", "name": "no-a-to-b" }
}
```

`from` and `to` are **plain strings**, not objects with a `path` field — the
first version of the adapter assumed objects and produced `? → ?` for every
violation. The adapter now accepts both shapes.

## License

MIT. **[VERIFIED-SOURCE]** — GitHub API `license.spdx_id`.

## Integration method

**CLI_ADAPTER** (with an optional Node API path later — the package exports a
programmatic `cruise()`). CLI first: it keeps the audit runnable without adding
a dependency to our own tree.

## Useful capabilities

- **Architecture conformance as evidence**: a forbidden edge is a fact with two
  endpoints, not an opinion.
- Circular dependencies and orphans are computed from the real graph, so they
  cannot be argued with.
- Metrics (`I` instability, `Ce` efferent coupling) give the trend engine a
  numeric series to compare across revisions.

## Limitations

- JavaScript/TypeScript only. For other stacks the architecture engine needs a
  different graph source; the evidence model must not assume JS.
- Requires the project's dependencies to be installed to resolve accurately;
  resolution failures produce phantom edges. The adapter must report resolution
  errors rather than treat them as clean.
- Without a rules config it produces a graph but **no violations** — a clean
  result then means "no rules", not "no problems". The adapter therefore passes
  `--config` only when the project supplies one, and reports `UNAVAILABLE`-style
  `UNKNOWN` ("a graph, not a verdict") when it does not. Verified: a globally
  installed depcruise cruised **0 modules** against this repo's TypeScript
  because it cannot resolve the project's local `typescript`; install it as a
  local devDependency for real JS/TS graphs.

## Security considerations

Reads source and `node_modules`; does not execute project code, though a
`.dependency-cruiser.js` config **is** executed as a Node module. Treat a config
file as code: run with the config pinned and reviewed, or pass `--no-config` and
supply our own.

## Recommended use in our auditor

Tier 1, and the backbone of the architecture engine: it is the cheapest way to
turn "the design says layers point inward" into an evidence-backed finding with
file:line on both ends of the violating edge.
