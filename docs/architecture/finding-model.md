# Finding model

A finding is a _policy verdict applied to evidence_, not a scanner result. A
scanner result is an observation; a finding is what the audit concludes about it.

```text
   Evidence            (what a tool saw, verbatim)
      ↓  reference-by-id
   Finding             (what our policy concludes, with a rule id)
      ↓
   Risk                (what it could cost, in the project's terms)
      ↓
   Recommendation      (the next action, with a verification for it)
```

## The rule-vs-finding boundary

The existing engine already has this shape and it works: `Rule` (data, YAML) +
`Finding` (computed, one per rule per run). A scanner adapter must not sidestep
it. There are exactly two places scanner results can enter:

1. **As evidence consumed by a rule.** The existing `oracle` check kind already
   proves this: a committed artifact, an assertion, a verdict. The scanner layer
   produces the artifact and the normalization; the rule decides what it means.
2. **As a finding whose rule is generated from the scanner's own taxonomy** —
   for CVEs and architecture violations, where "is this a problem" is not
   something a fixed rule pack could have anticipated.

Path (1) is preferred because it is testable, deterministic, and it keeps the
policy in one place. Path (2) is used when the rule set would be unbounded (one
per CVE) and is explicitly marked generated.

## Finding shape

```yaml
finding:
  id: FND-<n> # stable per rule+target per run, never reused across runs
  rule_id: TRIVY-VULN-CRITICAL # or an existing rule id (DEP-002)
  origin:
    kind: rule | scanner # which of the two paths above produced it

  title: ...
  claim: ... # one sentence, derived, differs from evidence.claim only by our policy's word

  severity: CRITICAL|HIGH|MEDIUM|LOW|FUTURE # OUR scale, dampened only by the maturity profile
  confidence: 0.0–1.0 # inherited from evidence; a finding cannot raise it

  status: PASS|FAIL|WRONG|MISSING|UNKNOWN|NOT_APPLICABLE|UNAVAILABLE
  # WRONG/PASS/... are the engine's existing words; scanner verdicts map to them
  # deterministically (table below), so there is exactly one status vocabulary
  # in the whole system.

  evidence:
    - EVT-... # ids only. Never a copy of the claim.

  remediation:
    text: ...
    proposedChange: # optional; intent, not a patch
      what: bump lodash to 4.17.21
      verification: 'the same scan returns no this-cve evidence'

  locations: [...] # where to look; from evidence locations, never invented
  revision: <commit> # the revision the finding applies to
```

## Status mapping (scanner → finding)

| Scanner verdict  | Finding status                                        | Note                                                    |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| `FAIL`           | `FAIL` (or `WRONG` for "present but incorrect" usage) |                                                         |
| `PASS`           | `PASS`                                                |                                                         |
| `PARTIAL`        | `FAIL` with `statusDetail: partial`                   | a partial is a failure unless the rule says a threshold |
| `UNKNOWN`        | `UNKNOWN`                                             | lands in the judgement queue                            |
| `NOT_APPLICABLE` | `NOT_APPLICABLE`                                      | excluded from scoring                                   |
| `UNAVAILABLE`    | **`UNKNOWN` + coverage event**                        | NOT a pass, NOT a fail — it is a blind spot             |

That last row is a decision worth stating: a missing tool has no verdict, so it
may not score as one; but the coverage event it produces _does_ affect the
reported confidence, so the audit says "42% of adapters ran" rather than
pretending coverage was total.

## Risk

`Risk` is deliberately not a number. It is a structured projection of a finding
into the project's terms, so two people can argue about it:

```yaml
risk:
  from: FND-0031
  consequence: credential leak       # what kind of thing breaks
  exposure: internet-facing          # where it matters
  likelihood_evidence: [EVT-012]      # what makes it probable
  decomposes: [                      # the finding that would fix other findings too
    - FND-0019
  ]
```

`decomposes` is the one field that earns its keep: it is how the system
recommends one action that closes several findings instead of five separate
tickets.

## Requirement / control / threat

Three more concept types exist purely so that "we intended X" can be checked
against "we observed Y". All three are _declared_ inputs, never derived:

| Type          | Declared in              | Checked by                                                                              |
| ------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `Requirement` | `.usa/requirements.yaml` | rule verdicts that must be PASS                                                         |
| `Control`     | `.usa/controls.yaml`     | evidence presence from control-shaped adapters (SAST, secret scanning, signed releases) |
| `Threat`      | Threat Dragon model JSON | mitigations matched against evidence                                                    |

A declared item with no evidence is `UNKNOWN` with the reason "no evidence
recorded" — it is not `MISSING`, because a missing control is an _observed_
absence, and this is an _unobserved_ one.

## Deltas and trends

Findings carry `revision` and evidence carries `execution_id`, so the trend
engine is a pure function of two runs: same evidence id with changed status is a
regression or a fix by the id's own history, not by similarity heuristics.
