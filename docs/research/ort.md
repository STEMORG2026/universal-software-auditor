# OSS Review Toolkit (ORT)

## Purpose

FOSS licence and vulnerability compliance for a project's full dependency
graph. It answers "what am I shipping, under which licences, with which known
vulnerabilities and policy violations".

## Architecture

A pipeline of stages, each producing a deterministic output artifact from the
previous one:

```text
Analyze   → dependency graph (resolved, declared)
Scan      → licence/concluded-copyright results per package
Advise    → vulnerabilities (chosen advisor) per package
Evaluate  → policy rules (licence allowlists/denylists) → rule violations
Report    → rendered output (WebApp, OpenHash, CycloneDX, …)
```

This staged, artifact-per-stage design is the part worth copying: the auditor's
adapter layer should compose the same way, so a rerun reuses earlier stages.

## Relevant APIs/CLI

**[VERIFIED-RUN]** against ORT 97.0.0, run from the project's container image
(`ghcr.io/oss-review-toolkit/ort`). Three things the documentation does not make
obvious:

```bash
ort analyze --input-dir <dir> --output-dir <dir>     # → analyzer-result.yml
ort evaluate -i <analyzer-result.yml> -o <dir> -f JSON   # → evaluation-result.json
```

1. **`evaluate` does not take `--input-dir`.** ORT 97 rejects it with "no such
   option --input-dir". The input is `-i/--ort-file` and it takes the _result
   file_, not a directory. The first version of our adapter used `--input-dir`
   and would have failed on every run.
2. **`evaluate` refuses to run without a rules script** — it prints
   "No rules specified." and writes no output. The rules are a _script_
   (`--rules-resource`), not the YAML policy file the older docs describe.
3. **The NPM analyzer needs the registry**: with `--network none` it resolved
   "1 project(s) and 0 package(s)" and reported an unresolved issue. An offline
   ORT run needs a pre-populated dependency graph, not just a lockfile.

## Output formats

YAML/JSON artifacts per stage plus rendered reports. No SARIF.

## License

Apache-2.0. **[VERIFIED-SOURCE]** — GitHub API `license.spdx_id`.

## Integration method

**CLI_ADAPTER** in Tier 2 (JVM, config-heavy). Consume its _evaluate_ output:
the dependency graph and rule violations, not the rendered HTML.

## Useful capabilities

- A resolved, declared-and-concluded dependency graph with provenance per
  package — exactly the evidence shape for DEP-* rules.
- Policy evaluation is a declarative layer over that graph: an allowlist
  violation is a finding with a version and a licence, not a judgement.
- CycloneDX/SPDX output is reusable for SBOM rules we already have
  (SUP-014).

## Limitations

- JVM plus many package managers make it the heaviest fetch-and-install of the
  set.
- Vulnerability advice needs an external source (OSS Index, etc.) — the same
  "network or cached DB" problem as Trivy's vuln scanner.
- Licences are concluded heuristically; a wrong declaration is still wrong.

## Security considerations

Does not execute project code. Advisors do network calls; a reproducible audit
must pin the advisor source or record when it was fetched.

## Recommended use in our auditor

Tier 2, and the model for the architecture: adopt the staged pipeline and the
"artifact per stage, evidence per package" shape. Two dependencycked engines
(Trivy and ORT) overlap; run Trivy for CVEs (which we do) and keep ORT for
licence policy (which we do not) rather than duplicating either.
