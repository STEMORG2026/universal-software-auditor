# Intent model — declared vs observed

Every other document in this directory is about _what the scanners saw_. This one
is about _what the project said it would be_ — the half of "conformance" that no
scanner can supply, because it is not in the code.

## Why it exists

A security audit that only reads code can answer "is this dangerous?". It cannot
answer "is this the system the team meant to build?" — that question needs a
declared design to compare against. Without one, "no evidence of a control" and
"the control was never intended here" are indistinguishable.

## The format, and why not Threat Dragon's own

Threat Dragon stores models two ways:

- its **internal diagram JSON** (`{summary, detail:{diagrams:[{diagramJson:{cells}}]}}`),
  which is a drawing: cells with positions, no semantics we can join on;
- **OTM** (Open Threat Model), the export format, versioned `0.2.0`, with real
  entities.

We consume OTM. Verified against the project's own example model rather than from
memory:

```yaml
otmVersion: '0.2.0'
project: { name, id, description, owner }
assets: [{ id, name, description, risk: { confidentiality, integrity, availability } }]
components: [{ id, name, type, parent: { trustZone }, assets, threats }]
dataflows: [{ id, name, source, destination, bidirectional, assets }]
trustZones: [{ id, name, type, risk: { trustRating } }]
threats: [{ id, name, description, categories: [STRIDE…], cwes: [CWE-…], risk }]
mitigations: [{ id, name, description, riskReduction }]
```

A document without `otmVersion` is refused with a message that names the
confusion — "Threat Dragon's internal diagram export is not supported, use its
OTM export" — rather than "parse failed".

## The join key is the CWE, and nothing else

```text
threat.cwes[]  ──┐
                 ├──►  evidence.cwes[]  ──►  ThreatMatch
evidence.id    ──┘
```

A threat declares `cwes: ["CWE-79"]`; scanner evidence that names `CWE-79` is the
observation. That is deterministic, auditable, and cheap. There is no similarity
scoring and no LLM in this path.

`evidence.cwes` is **structured**, populated from the tool's own metadata — semgrep
`extra.metadata.cwe`, SARIF rule tags (`external/cwe/cwe-094`) — not inferred from
prose. A join built on substring matching would invent relationships, which is the
one thing this subsystem must not do. When a tool states no CWE, the matcher falls
back to scanning the claim text and records which field matched.

## Three verdicts, and the one that matters

| Verdict        | Means                                           | Does NOT mean                             |
| -------------- | ----------------------------------------------- | ----------------------------------------- |
| `OBSERVED`     | evidence cites one of the threat's CWEs         | the threat is "confirmed"; it is observed |
| `NOT_OBSERVED` | no evidence cites any of them                   | **the threat is mitigated**               |
| `UNKNOWN`      | the threat declares no CWE, so nothing can join | a pass                                    |

`NOT_OBSERVED` is the one that gets misread. The reason string says so
explicitly: _"no evidence mentions CWE-79, CWE-787 — this does not prove the
threat is mitigated."_ The scanners that ran may not cover that weakness class at
all, and the run manifest says which ones ran.

## The more useful direction

The reverse join is the one that finds real problems: **CWEs the scanners
observed that the model never declared**. That is the gap between the design the
team wrote down and the weaknesses the tools found — and unlike
`NOT_OBSERVED`, it is a positive observation, not an absence.

```text
Observed but not declared in the model (1):
  • CWE-94 — 1 evidence item(s)
```

## Deliberately not done

- **No diagram rendering, no Threat Dragon process.** The model is a file.
- **No threat generation.** The tool compares; it does not invent threats. An
  LLM-suggested threat would be a hypothesis, and hypotheses belong in the
  judgement queue, not in the model.
- **No severity arithmetic.** A threat's `likelihood`/`impact` and an evidence
  row's severity are different scales; combining them would be a score, and this
  system does not make those.
