# ROADMAP ASSESSMENT

## Which document is canonical

`ROADMAP.md` (131 lines, root). It is manifest-tracked (`docs/manifest.yaml`), referenced by
`README.md`, and its "Shipped" section is consistent with `CHANGELOG.md` and the ADR corpus.
`VISION.md` (39 lines) is the product intent; `docs/remediation-plan.md` is historical.
`state.md` / `state/` and `CONTINUATION.md` are the session protocol's own bookkeeping, not
product planning. **ROADMAP.md governs.**

## State of every initiative it lists

28 items: **26 shipped, 2 open, 1 contradiction.**

| Item                                                    | Claimed state   | Actual state                                                          | Decision                                                 |
| ------------------------------------------------------- | --------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `usa bootstrap` self-extension                          | shipped         | shipped, verified                                                     | KEEP                                                     |
| Honest scale limits                                     | shipped         | shipped — truncation/oversize/symlink counters all present and warned | KEEP (extend: USA-AUD-007 adds the ignored-file counter) |
| First graduation (Swift pack)                           | shipped         | `stacks/swift.yaml` present, 6 of the 315 rules                       | KEEP                                                     |
| SARIF + JSON renderers                                  | shipped         | shipped, SARIF 2.1.0 structurally valid, locations emitted            | KEEP                                                     |
| Per-rule fixtures                                       | shipped         | shipped, 205/205 deterministic rules                                  | KEEP (USA-AUD-015 closes the gaps)                       |
| Oracle check kind                                       | shipped         | shipped, **used by 0 shipped rules**                                  | KEEP — but note it is unexercised in production          |
| Complexity budget                                       | shipped         | `max 10` enforced, lint clean                                         | KEEP                                                     |
| Self-audit hardening (27 findings)                      | shipped         | evidenced by the fail-closed code paths                               | KEEP                                                     |
| release-please → changesets                             | shipped         | migrated; tag shape flipped (documented)                              | KEEP                                                     |
| pnpm workspace + changesets                             | shipped         | shipped, one package                                                  | KEEP                                                     |
| Trusted publishing + provenance + SBOM                  | shipped         | OIDC workflow present                                                 | KEEP                                                     |
| Generated CLI reference                                 | shipped         | `docs:cli --check` in CI                                              | KEEP                                                     |
| Coverage thresholds                                     | shipped         | `vitest.config.ts` ratchet; TEST-005 guards it                        | KEEP                                                     |
| OpenSSF Scorecard action                                | shipped         | workflow present                                                      | KEEP                                                     |
| Catalogue pinning + automatability                      | shipped         | `usa standards` works; **102 of the 315 rules uncatalogued**          | RE-SCOPE (USA-AUD-014)                                   |
| Provenance verification checks                          | shipped         | `core/provenance-cosign` + `-attestation`, 6 of the 315 rules         | KEEP                                                     |
| Site-level suppressions                                 | shipped         | implemented, partial-waiver logic correct                             | KEEP                                                     |
| Hotspot triage + review staleness                       | shipped         | `review.ts` + `.usa.yaml reviews:`                                    | KEEP                                                     |
| New-code gates (`--baseline`)                           | shipped         | implemented, shares `diff` taxonomy                                   | KEEP                                                     |
| Foundation readiness                                    | shipped         | `foundation/` + 14 FND rules                                          | KEEP                                                     |
| OpenSSF Best Practices badge                            | shipped         | badge says "in progress" — honest                                     | KEEP                                                     |
| Signed reports (verify side)                            | shipped         | verify-only, correct                                                  | KEEP (widen payload: USA-AUD-013)                        |
| Generated docs resync                                   | shipped         | CI job present — **and currently red on PR #276**                     | KEEP, investigate the red job                            |
| MADR/log4brains                                         | open, deferred  | correctly deferred                                                    | KEEP deferred                                            |
| LLM provider layer                                      | shipped         | `agent/providers.ts`, 406 lines                                       | KEEP                                                     |
| Live sessions                                           | shipped         | `live/`, deterministic fallback                                       | KEEP                                                     |
| Testing assurance subset                                | shipped         | TAS-001–011                                                           | KEEP                                                     |
| Future-ready categorization                             | shipped         | 10 categories, 5 empty — as documented                                | KEEP                                                     |
| Report format selection (narrative)                     | shipped         | present                                                               | KEEP                                                     |
| **"HTML / JUnit renderers — deliberately not planned"** | **not planned** | **HTML ships** (`--format html`, `report/html.ts`, server default)    | **CORRECT THE RECORD** (USA-AUD-021)                     |

## What the current roadmap gets right

It is honest about scope. The "Deliberately not planned" section names the charter
constraint (ADR-0011), refuses penetration testing, refuses a CVE database, refuses a second
analysis engine. For a project of this age that restraint is unusual and is the reason the
codebase is 21 000 lines rather than 80 000.

It is also _finished_. 26 of 28 items are shipped, and the two open ones are correctly
deferred. That is the problem: **the roadmap has run out of work at exactly the moment the
audit found the product's trust defects.** The next section is not "more rule coverage"; it
is the four items in this audit.

## What it lacks, structurally

- No IDs, so findings cannot map to initiatives and the traceability matrix has nothing to
  point at.
- No acceptance criteria, so "shipped" means "merged", not "proven".
- No priorities, so a P0 security defect and a P4 renderer would look the same.
- No kill criteria, so nothing is ever dropped on evidence.
- No workstream for verification, security or scoring — the three areas where the audit
  found everything.

## Initiatives that must not be started next

1. **Any new stack pack.** 315 rules with one-sided fixtures and unmeasured precision; adding
   more rules multiplies the unmeasured surface. Freeze the catalogue until USA-R11 lands.
2. **Any new scanner adapter.** Six adapters, one of which has been executed by this audit,
   behind a runner that executes project code. Fix the runner first.
3. **Any expansion of `usa evolve`.** The gate is decided over three self-authored cases.
4. **HTML/JUnit expansion.** The HTML renderer is already an undocumented deviation from a
   stated exclusion; do not build on it until the record is corrected.

## The revised roadmap

Written into `ROADMAP.md` (deliverable L). Fourteen initiatives across eight workstreams,
with the four trust-critical ones at NOW. Every CRITICAL and HIGH finding maps to one of
them; see `TRACEABILITY-MATRIX.md`.
