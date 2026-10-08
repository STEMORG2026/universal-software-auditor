# DECISIONS.md — Architecture Decision Records

**Last updated:** 2026-10-01T16:30:00+05:45
**Source of truth:** `docs/adr/` (<!-- usa:fact adrs -->44<!-- /usa:fact --> ADRs)

---

## ADR Index

| #    | Title                                 | File                                                     |
| ---- | ------------------------------------- | -------------------------------------------------------- |
| 0001 | Record architecture decisions         | `docs/adr/0001-record-architecture-decisions.md`         |
| 0002 | TypeScript engine over Python         | `docs/adr/0002-typescript-engine-over-python.md`         |
| 0003 | Rules are data, not code              | `docs/adr/0003-rules-are-data-not-code.md`               |
| 0004 | Markdown only output                  | `docs/adr/0004-markdown-only-output.md`                  |
| 0005 | Maturity dampens severity             | `docs/adr/0005-maturity-dampens-severity.md`             |
| 0006 | Severity/status two axes              | `docs/adr/0006-severity-status-two-axes.md`              |
| 0007 | Suppressions are visible and expiring | `docs/adr/0007-suppressions-are-visible-and-expiring.md` |
| 0008 | Report trailer and diff               | `docs/adr/0008-report-trailer-and-diff.md`               |
| 0009 | Fail closed on malformed input        | `docs/adr/0009-fail-closed-on-malformed-input.md`        |
| 0010 | Detector design                       | `docs/adr/0010-detector-design.md`                       |
| 0011 | Coexist with deep scanners            | `docs/adr/0011-coexist-with-deep-scanners.md`            |
| 0012 | Self-extension via bootstrap          | `docs/adr/0012-self-extension-via-bootstrap.md`          |
| 0013 | Deterministic evolution loop          | `docs/adr/0013-deterministic-evolution-loop.md`          |
| 0014 | Proposal stage and release evidence   | `docs/adr/0014-proposal-stage-and-release-evidence.md`   |
| 0015 | Persistent gap queue                  | `docs/adr/0015-persistent-gap-queue.md`                  |
| 0016 | Scheduler requires automated evidence | `docs/adr/0016-scheduler-requires-automated-evidence.md` |
| 0017 | Per-rule fixtures                     | `docs/adr/0017-per-rule-fixtures.md`                     |
| 0018 | JSON and SARIF renderers              | `docs/adr/0018-json-and-sarif-renderers.md`              |
| 0019 | Oracle evidence ingestion             | `docs/adr/0019-oracle-evidence-ingestion.md`             |
| 0020 | Machine-synced documentation          | `docs/adr/0020-machine-synced-documentation.md`          |
| 0021 | Catalogue pinning + automatability    | `docs/adr/0021-catalogue-pinning-automatability.md`      |
| 0022 | Site-level suppressions               | `docs/adr/0022-site-level-suppressions.md`               |
| 0023 | Triaged queue and dated reviews       | `docs/adr/0023-triaged-queue-and-dated-reviews.md`       |
| 0024 | New-code quality gates                | `docs/adr/0024-new-code-quality-gates.md`                |
| 0025 | Detached signature verification       | `docs/adr/0025-detached-signature-verification.md`       |
| 0026 | Generated docs resync                 | `docs/adr/0026-generated-docs-resync.md`                 |
| 0027 | Provenance verification               | `docs/adr/0027-provenance-verification.md`               |
| 0028 | Verify report command                 | `docs/adr/0028-verify-report-command.md`                 |
| 0029 | Foundation readiness                  | `docs/adr/0029-foundation-readiness.md`                  |
| 0030 | Live assurance phase                  | `docs/adr/0030-live-assurance-phase.md`                  |
| 0031 | LLM provider layer                    | `docs/adr/0031-llm-provider-layer.md`                    |
| 0032 | Testing assurance slices              | `docs/adr/0032-testing-assurance-slices.md`              |
| 0033 | Future categories                     | `docs/adr/0033-future-categories.md`                     |
| 0034 | Live sessions                         | `docs/adr/0034-live-sessions.md`                         |
| 0035 | Test evidence signals                 | `docs/adr/0035-test-evidence-signals.md`                 |
| 0036 | Narrative report                      | `docs/adr/0036-narrative-report.md`                      |
| 0037 | Dual report doctrine                  | `docs/adr/0037-dual-report-doctrine.md`                  |
| 0038 | Root AGENTS.md                        | `docs/adr/0038-root-agents-md.md`                        |
| 0039 | Localhost serve                       | `docs/adr/0039-localhost-serve.md`                       |
| 0040 | Serve persistence                     | `docs/adr/0040-serve-persistence.md`                     |
| 0041 | Severity follows observed maturity    | `docs/adr/0041-severity-follows-observed-maturity.md`    |
| 0042 | Documentation universe audit          | `docs/adr/0042-documentation-universe-audit.md`          |
| 0043 | Continuous ingestion                  | `docs/adr/0043-continuous-ingestion.md`                  |

---

## Key Constraints (ADR-0011 Charter)

- No CVE database
- No resolver
- No dataflow engine
- No signer

Proposals crossing that line re-open ADR-0011 first.

---

## Pending Decisions

None — all <!-- usa:fact adrs -->44<!-- /usa:fact --> ADRs are merged and immutable.
