# OWASP Threat Dragon

## Purpose

A modelling application for threat analysis: a project describes its assets,
data flows and trust boundaries, records threats per flow, and attaches
mitigations. It produces the _intended_ security design, which is the thing a
code audit otherwise cannot check.

## Architecture

A desktop/web app editing a **model** — a single JSON document with projects →
diagrams (data-flow diagrams) → nodes (process, store, actor) → edges (data
flows) → threats, plus an entity list (actors, assets, services). Models are
files, not server state.

## Relevant APIs/CLI

**[UNVERIFIED]** — not installed. Consumption is reading the model JSON; the app
is only the authoring surface. We are not integrating the tool, only the model.

## Output formats

The model JSON, plus PDF/Markdown report rendering. No SARIF.

## License

Apache-2.0. **[VERIFIED-SOURCE]** — GitHub API `license.spdx_id`.

## Integration method

**FUTURE — concepts only.** Import the _schema_ concepts (asset, flow, trust
boundary, threat, mitigation) as first-class types in our evidence model. Do not
run the app in a pipeline.

## Useful capabilities

- Trust boundaries add the missing half of "does the implementation conform to
  the intended architecture": an input crossing a trust boundary must be
  validated there — a statement only a model can make.
- Threats and mitigations are structured, so a control can be _declared_ and then
  checked against evidence (THREAT-* / MITIG-* findings).
- The model is version-controlled alongside code, so intended-vs-observed can be
  compared per revision.

## Limitations

- It is only as good as the human model: no model means no intended state.
- Schema is not formally pinned and has changed across releases; parse
  defensively.
- It describes what _should_ be — never what _is_. An unmatched threat is not
  "safe", it is "unmodeled".

## Security considerations

The model itself may contain sensitive architecture details; treat it as internal
data. No code execution.

## Recommended use in our auditor

Tier 3 concepts, adopted into the evidence model now (so adapters can name the
concepts they map to) and integrated as a data source later. Adopt:
`Asset`, `Flow`, `TrustBoundary`, `Threat` (with `Mitigation`), from the model
JSON.
