# FULL RULE AUDIT — all 315

Supersedes the "23 of 315" limitation in `RULE-SEMANTIC-AUDIT.md`. That document remains the
detailed write-up of the CRITICAL tier; this one covers the rest and states the honest
verification count for the catalogue as a whole.

## What was actually done

| Achievement                                                                                                             |         Count |
| ----------------------------------------------------------------------------------------------------------------------- | ------------: |
| Rules inventoried (id, pack, section, kind, severity, class, automatability, fixture, references)                       |           315 |
| Rules read and given a verdict by this audit                                                                            | **142 (45%)** |
| Rules with a two-sided fixture and a passing behavioural test                                                           |           192 |
| Rules whose pattern was adversarially probed with a hand-written input                                                  |             9 |
| Rules whose verdict is a class default (manual / mechanical), not a reading                                             |           154 |
| Rules **semantically verified in the full sense** (pattern, severity, remediation, and field behaviour all established) |         **0** |

Every rule has a verdict in `inventories/rules-verdicts.csv`, with a `basis` column that says
whether it was `read` or assigned by `class`. That column is the point: 142 verdicts are
judgements, 154 are defaults, and conflating them would be the exact overclaiming this audit
criticises.

## Verdict distribution

| Verdict    | Count | Meaning                                                            |
| ---------- | ----: | ------------------------------------------------------------------ |
| SOUND      |    50 | Read; the pattern matches the claim; no FP/FN found                |
| NARROW     |    10 | Read; fires correctly but misses cases the title implies           |
| BROAD      |    11 | Read; fires on legitimate code                                     |
| PROXY      |    57 | Read; PASS means "the word/tool appears", not "the property holds" |
| FAIL-OPEN  |     4 | Read; reports PASS when the tool it depends on fails               |
| INERT      |     3 | Cannot fail, so cannot gate                                        |
| DEAD+BROAD |     1 | Cannot apply, and would misfire if it did                          |
| OVERSTATED |     2 | Title claims more than the check establishes                       |
| INVARIANT  |     3 | Composition rules with no per-rule fixture                         |
| MECHANICAL |    51 | File-existence / count; sound _as a presence check_                |
| JUDGEMENT  |   104 | `manual`; reviewed for actionability only                          |
| UNREVIEWED |    19 | Structurally sound, fixture-tested, semantics not judged           |

**78 of the 315 rules carry a substantive flag** (BROAD, PROXY, FAIL-OPEN, INERT, DEAD, OVERSTATED).
That is 25% of the catalogue, and it is the number the "315 rules" headline hides.

## The one thing the catalogue does very well

**All 107 `manual` rules have an `evidence` hint.** Not one is a bare "check this yourself" —
each says what artefact would settle it. I expected to find a tail of lazy judgement rules and
there is none. Combined with the 205-fixture gate, this is better discipline than most
commercial rule catalogues ship.

## New verified defects (beyond the CRITICAL tier)

Each was established by running the shipped pattern against a hand-written input.

### 1. SUP-003 cannot detect the most common floating version

Title: _"Dependency versions are pinned, not floating."_ Pattern:
`:\s*['"]?(\*|latest|x|~|\^|>=?|>|<=?|<|\d+\.[xX])['"]?\s*[,}]`

| Input               | Result       |
| ------------------- | ------------ |
| `"yaml": "^2.6.1",` | **no match** |
| `"yaml": "latest",` | match        |
| `"yaml": "*",`      | match        |

The alternation matches the caret, then demands a quote/comma immediately after it — but a real
caret range has a version after the caret. So the rule catches `latest` and `*` and misses
`^1.2.3` / `~1.2.3`, which is what most npm projects actually use. **This repository's own
`package.json` is full of carets and the rule passes** — it passes for the wrong reason, which
is the most dangerous way for a rule to be wrong.

### 2. SUP-008 flags the recommended mitigation

Title: _"CI workflows avoid script-injection patterns."_ The pattern matches
`${{ github.event.pull_request.* }}` anywhere in a workflow. That includes:

```yaml
env:
  TITLE: ${{ github.event.pull_request.title }} # the SAFE pattern
```

Passing the value through `env:` is exactly what the mitigation prescribes; the injection risk
is only when it is interpolated inside `run:`. Verified: **MATCHES** on the safe form. A
correctly-hardened workflow fails this rule.

### 3. CTNR-001 passes a privileged container

Title: _"Container does not run as root."_ The alternation includes the bare word
`securityContext`, so:

```yaml
securityContext: { privileged: true }
```

**MATCHES** → PASS. The rule's signal is inverted for the case that matters most.

### 4. RS-003 penalises idiomatic Rust

Title: _"unsafe blocks are justified and minimal."_ Any `unsafe {` matches — including one
carrying the `// SAFETY:` comment Rust's own guidelines require:

```rust
unsafe { /* SAFETY: invariants checked above */ }
```

**MATCHES** → WRONG (0.15 credit). The rule cannot see justification, so it penalises the
practice it names.

### 5. SEC-002 misses template interpolation

Title: _"Sensitive data is not written to logs."_ The pattern needs a sensitive word followed
by `:` or `=`.

| Input                          | Result       |
| ------------------------------ | ------------ |
| `console.log("password:", pw)` | match        |
| ``console.log(`token ${t}`)``  | **no match** |

Template interpolation is the common modern leak form and the rule is blind to it.

### 6. Four `command` rules fail open; three do not

| Rule            | Command shape                                               | On tool failure  |
| --------------- | ----------------------------------------------------------- | ---------------- |
| SUP-018/019/020 | `command -v cosign \|\| { echo "FAIL-CLOSED …"; exit 1; }`  | **fails closed** |
| REPO-003        | `! git log … \| grep … \| grep -q …`                        | **PASS**         |
| ARCH-005        | `! (npx --yes dpdm@latest … \| grep -qi circular)`          | **PASS**         |
| DEP-002         | `! (npm audit … 2>/dev/null \| grep -qiE "critical\|high")` | **PASS**         |
| DEP-005         | `! (npx --yes depcheck@latest … \| grep …)`                 | **PASS**         |

`npm audit` with no network produces no output → `grep` exits 1 → `!` inverts to 0 → **PASS**.
The fail-closed idiom exists in this codebase and is applied to three of seven command rules.
The other four report "clean" when they could not run — the exact inversion of the product's
own blind-spot doctrine.

### 7. Two rules download and execute an unpinned package mid-audit

`ARCH-005` runs `npx --yes dpdm@latest`; `DEP-005` runs `npx --yes depcheck@latest`. Both:

- fetch from the network at audit time, contradicting "offline deterministic core";
- pin nothing (`@latest`), so the same tree can score differently on different days;
- execute arbitrary current npm code as the auditing user.

`ARCH-005` is `deep`-only and both need `--allow-commands`, which limits exposure. It does not
make the analysis reproducible when enabled, and reproducibility is the product's core claim.

### 8. 57 of the 315 rules are presence proxies

`SEC-008` passes if the word `zod` appears anywhere. `SEC-014` passes on the string `429`.
`CICD-007` passes on `/health` in any YAML. `DATA-005` passes on `take:`. `MOB-001` passes on
`Sentry` in `package.json`. `SUP-006`/`SUP-007`/`SUP-016` pass on a tool name in CI config.

As _cheap signals_ these are defensible — a rule that says "we saw evidence of a validation
library" is honest if labelled that way. The problem is the report: a PROXY PASS earns 1.0
credit, exactly like `SEC-001` (a real regex over real source). A reader cannot tell
"we found the tool" from "we verified the property", and the score cannot either.

**This is the single highest-leverage fix in the catalogue**: give proxy rules a distinct
status (or cap their credit), and the score becomes meaningful without changing a single
pattern.

## By pack

| Pack                             | Rules | Notable                                                                        |
| -------------------------------- | ----: | ------------------------------------------------------------------------------ |
| core/security                    |    28 | 2 SOUND-critical, 2 PROXY, 2 BROAD, 1 NARROW, 1 DEAD                           |
| core/supply-chain                |    17 | SUP-003 FN, SUP-008 FP, 3 fail-closed, 2 proxy                                 |
| core/repo                        |    18 | REPO-001 overstated, REPO-002 broad, REPO-003 fail-open                        |
| core/testing + testing-assurance |    23 | Strongest packs: TEST/TAS mostly SOUND or PROXY-with-honest-titles             |
| stacks/python                    |    10 | PY-006 broad, PY-003 narrow, rest sound; all 4 suppressed rules verified valid |
| stacks/rust                      |     7 | RS-003 broad (idiomatic unsafe), RS-002 narrow                                 |
| stacks/containers                |     8 | CTNR-001 inverted signal                                                       |
| stacks/iac                       |     7 | IAC-001 broad, IAC-002/004 proxy                                               |
| stacks/ai-era                    |    12 | 4 manual CRITICAL (AI-001/003/004/007/010) — the whole pack is judgement       |
| stacks/data                      |    10 | DATA-005 proxy, DATA-007 sound                                                 |

## What a "complete" rule audit would still need

1. **A field corpus.** Run every rule across 20–30 real repositories of known quality and count
   hits that a human adjudicates. That produces precision per rule, which is the only number
   that would let a reader trust a PASS.
2. **Negative fixtures for the 78 flagged rules.** The format exists; the content does not.
3. **A proxy status in the engine**, so presence evidence stops scoring like verification.
4. **A decision on the two network-fetching rules** — vendor the analyser, pin it, or drop the
   rules.

None of those is a reading exercise, which is why this document stops where it does.

---

# Do the rules actually bite?

The question is not "is there a fixture" but "does the fixture notice when the rule changes".
Measured by planting defects in the shipped catalogue in a throwaway copy and running the two
rule suites (`rule-fixtures.test.ts` + `auditor-mutation.test.ts`). Every file was restored and
hash-verified byte-identical afterwards.

| #   | Defect planted                                               | Suite       | Meaning                                                                                                           |
| --- | ------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| R1  | SEC-001's pattern replaced with `zzz-never-matches-anything` | **RED**     | The rule's _content_ is load-bearing: a rule that cannot fire fails its own fixtures                              |
| R2  | `tests/fixtures/rules/SEC-001.yaml` deleted                  | **RED**     | The coverage gate bites: an automatable rule without a fixture fails CI                                           |
| R3  | SEC-001's severity `CRITICAL → LOW`                          | **GREEN**   | **Severity is untested.** A rule's weight can be cut 10 → 1.5 and its gate membership lost, with no test noticing |
| R4  | SUP-003's pattern "corrected" to catch `^1.2.3`              | _withdrawn_ | My mutation produced invalid YAML, then a pattern that matched nothing — an invalid experiment, not evidence      |

## What the three valid results mean

**The rule layer bites on behaviour.** R1 is the important one: gut a rule and the suite goes
red. Combined with the sensitivity harness, which blinds and saturates every fixture-bearing
rule's check in memory and asserts an outcome flips, **198 of 315 rules have a test that proves
their pattern determines their verdict.** That is a genuinely strong property and it is the
reason rule rot is a managed risk here.

**Coverage is enforced.** R2 confirms the gate described in the docs is real, not decorative.

**Metadata is not covered.** R3 is the gap. Severity drives `DEFAULT_WEIGHT` (10 for CRITICAL,
1.5 for LOW), drives `--fail-on`, and drives the report's severity counts. Nothing asserts it.
A typo in a pack's `severity:` silently changes a rule's weight sixfold and removes it from
every gate — and the suite stays green.

## The coverage map

| Layer                         |              Rules | Proof that they bite                                          |
| ----------------------------- | -----------------: | ------------------------------------------------------------- |
| Fixture + sensitivity harness |                198 | Blind the check → an outcome flips                            |
| Fixture, no sensitivity proof | 7 (`command` kind) | Fixture asserts the verdict; the harness skips them by design |
| Manual / invariant            |                110 | No automated proof possible — judgement rules                 |
| Fired on a real tree          |             **70** | Non-PASS verdict on at least one of four trees audited here   |

Across four trees — this repository, `examples/demo-app`, `fixtures/insecure-app`, and an empty
git repo — **70 of the 315 rules produced at least one non-PASS verdict**, 38 of them on two or more trees.
Thirteen rules fired on the clean self-audit, and all thirteen are the waived ones, so there
were **zero unsuppressed false positives** on this repository.

245 of the 315 rules never fired on any of those four trees. For most that is correct — Solidity rules on a
TypeScript repo should not fire — but it means their only evidence of biting is the fixture, not
the field.

## What "bites" does not mean

A rule that bites is not a rule that is _right_. Verified in this audit: SUP-003 fires on
`1.x` and `latest` (so it bites) and cannot see `^1.2.3` (so it is wrong); SEC-002 fires on
`console.log("password:", pw)` and misses ``console.log(`token ${t}`)``. The fixture proves
sensitivity, not correctness.

That is why the honest answer to "do the rules bite?" is:

> **Yes, at the level the tests measure — and the tests measure sensitivity, not truth.**
> 198 of the 315 rules are proven to react to their own content; 70 have reacted to real code; 8 are
> proven to react to the wrong thing.
