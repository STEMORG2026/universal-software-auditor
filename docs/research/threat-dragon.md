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

**[VERIFIED-SOURCE]** — read from the project's own example model in its
repository (`ThreatDragonModels/test/example-open-threat-model.json`), not from
memory. The app is the authoring surface; we consume the file.

Two formats exist and only one is worth consuming:

- the **internal diagram JSON** — `{summary, detail:{diagrams:[{diagramJson:{cells}}]}}`
  with cell types `tm.Actor`, `tm.Process`, `tm.Store`, `tm.Boundary`, `tm.Flow`.
  It is a drawing: positions and names, with no joinable semantics.
- **OTM 0.2.0** — the export format, with `assets[]`, `components[]`,
  `dataflows[]`, `trustZones[]`, `threats[]` (carrying `cwes[]` and STRIDE
  `categories[]`), `mitigations[]`. This is what we parse.

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

Tier 3, implemented: `src/intent/**` parses OTM and joins threats to evidence on
the CWE id, and `usa intent` reports observed / not-observed / unknown per threat
plus the CWEs observed but never declared. See
`docs/architecture/intent-model.md`.

The concepts adopted are exactly the OTM ones — `Asset`, `Component`, `DataFlow`,
`TrustZone`, `Threat`, `Mitigation` — and nothing was invented on top, because a
home-grown threat schema would have to be maintained against an upstream one that
already exists.
