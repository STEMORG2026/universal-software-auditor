# Evidence model

Evidence is the ground truth of this system. Everything else — findings, risks,
recommendations, scores, trends — is a _derived_ view, and any derived claim that
cannot point at evidence is invalid by construction.

This document defines the internal shape. It is not a database schema: the
engine computes over plain objects, which are what tests, the JSON report and
the content-addressed store all exchange.

## The one invariant

> A finding is only ever a reference to evidence. The engine never invents a
> fact.

If a claim has no `evidence` ids, it is not a finding — it is a hypothesis, and
the system has exactly one home for those: the judgement queue (which is why
that queue says "never mark ✅ without evidence").

## Shape

```yaml
evidence:
  id: EVT-<hash> # content-addressed: same claim + same location → same id

  source:
    tool: trivy # which adapter produced this
    version: 0.75.0 # tool version, always recorded (see note on scores)
    kind: vuln # tool-native category, never reinterpreted
    rule_id: CVE-2023-XXXX # tool-native identifier, preserved verbatim

  provenance:
    execution_id: <run> # links every item of one scan
    command: [...] # argv actually executed
    config: <object> # options and rule pack, with their versions
    repository_revision: <commit> # or "unversioned" — never blank
    timestamp: <utc>
    environment:
      executable: /usr/bin/trivy
      sandbox: subprocess-timeout-30s
    reproducibility: # enough for a re-run to be possible at all
      tool_install: '...'
      config_path: '...'

  claim:
    text: '...' # the fact, in the tool's words, paraphrased only to remove noise

  location:
    file: '...'
    line: ...
    column: ...
    # null never means "everywhere" — it means "this tool does not locate".

  severity: CRITICAL|HIGH|MEDIUM|LOW|INFO # the tool's word, kept
  confidence: 0.0–1.0 # see below
  status: PASS|FAIL|PARTIAL|UNKNOWN|NOT_APPLICABLE|UNAVAILABLE

  raw_reference:
    filename: '...'
    json_path: '...'
    excerpt: '...' # short, verbatim
```

## Why the tool's own severity is kept verbatim

Severity is not a property of a defect; it is a property of a _context_. Trivy's
CRITICAL for a CVE in a library you never call is not our CRITICAL. But the
translation is a policy decision, and policy belongs to the rule engine.

So the split is deliberate:

- `evidence.severity` — the tool's word, quoted. Never renamed, never averaged.
- `finding.severity` — our policy's word, derived. Always traceable back.

This is what stops one tool's scale from silently redefining another's.

## Confidence, and where it does not come from

`confidence` is the probability that the claim is _true_, given the tool that
made it. It is not how badly it might hurt (that is severity) and not how much I
trust the tool generally (that is tool maturity, a property of the adapter).

Rules for setting it:

| Situation                                                                       | Confidence                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------- |
| Deterministic parse of machine output (a CVE id, a package version)             | 1.0                                         |
| Tool with a stated false-positive rate, per-rule (e.g. a heuristic secret rule) | 0.6–0.9, from the rule's own metadata       |
| Tool could not determine something                                              | _not a confidence issue_ → status `UNKNOWN` |
| Tool was not available → status `UNAVAILABLE`; confidence is meaningless        | —                                           |

A number in the middle of that table must cite where it came from in
`provenance.config`. An invented confidence is worse than a missing one, because
it is indistinguishable from a measured one.

## Status is six-valued, on purpose

| Status           | Means                                                     | Does NOT mean                   |
| ---------------- | --------------------------------------------------------- | ------------------------------- |
| `PASS`           | the check ran and the asserted condition held             | "the control exists in general" |
| `FAIL`           | the check ran and the condition was violated              | —                               |
| `PARTIAL`        | some instances hold, others do not                        | "mostly fine"                   |
| `UNKNOWN`        | the check was attempted and could not conclude            | "the feature is absent"         |
| `NOT_APPLICABLE` | the tool cannot apply to this target (language, platform) | "nothing to check"              |
| `UNAVAILABLE`    | the tool is absent, could not run, or had no input data   | "no findings"                   |

The two right-hand cells are the whole point. "No evidence found" collapses into
`UNKNOWN`, and the reason string is mandatory:

```yaml
status: UNAVAILABLE
claim: CodeQL did not run — no credentials to download query packs
reason: offline run, neither --packs-cache nor --no-download was configured
```

`UNAVAILABLE` must also be recorded as a _first-class event in the run manifest_
(see the adapter model), so "3 of 4 adapters were silent" is a scored fact about
coverage rather than an omission someone notices later.

## Identity and equality

`id` is a hash over the fields that make a claim the _same_ claim:
`source.tool`, `source.kind`, `source.rule_id`, `location`, `claim`. Not the
timestamp, not the execution id.

That gives three properties for free:

- **Deduplication** across tools and runs: one CVE id asserted by two adapters
  is one evidence item with two provenance records.
- **Trend comparison**: an evidence id present in run N-1 and absent in run N is
  either fixed or no longer checkable — and the status distinguishes those.
- **Backlinks**: a finding can name its evidence ids and the JSON report can
  inline them, so a reader can check the claim without trusting the finding.

## What is not evidence

- The tool's version banner, its runtime, its cache state — provenance, not
  evidence.
- A summary line ("6 vulnerabilities found") — derived, and therefore a
  different type (`summary`), never cited as proof of a specific claim.
- The absence of an item — a real thing that must be recorded as an explicit
  `coverage` event, never as an evidence row.
