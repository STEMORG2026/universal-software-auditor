---
'@xenos1996/usa': minor
---

Add the intent model: declared threats joined to observed evidence.

`usa intent <model.json> [--evidence <scan.json>]` reads an Open Threat Model
(OTM 0.2.0, the format Threat Dragon exports) and compares it with scanner
evidence from `usa scan --json`.

The join key is the CWE id, and nothing else: a threat declares `cwes`, evidence
carries `cwes`, and a match is a match. Evidence now carries **structured** CWEs
from the tool's own metadata (semgrep `extra.metadata.cwe`, SARIF rule tags)
rather than having them inferred from prose, because a join built on substring
matching would invent relationships.

Three verdicts per threat, and the one that matters is the middle one:

- `OBSERVED` — evidence cites one of its CWEs.
- `NOT_OBSERVED` — no evidence does. This does **not** prove the threat is
  mitigated, and the report says so in the same sentence.
- `UNKNOWN` — the threat declares no CWE, so nothing can be joined to it.

The more useful direction is the reverse: **CWEs the scanners observed that the
model never declared** — the gap between the design on paper and the weaknesses
found. Plus declared trust zones with no component inside them.

Deliberately not done: no diagram rendering, no Threat Dragon process, no
threat generation (a generated threat is a hypothesis, and hypotheses belong in
the judgement queue), and no severity arithmetic across two unrelated scales.

The parser is verified against Threat Dragon's own example model rather than from
memory, and it refuses the app's internal diagram format by name instead of
"parse failed".
