# 43. Continuous ingestion: auto-fetch repos, scheduled evolve, human-gated promotion

- **Date:** 2026-09-21
- **Status:** Accepted

## Context

USA audits exactly one local tree per invocation (`usa audit|evolve [path]`, default `.`). There is no fetcher, no source list, no timer: the operator clones, then runs. `docs/EVOLUTION.md` marks background/daemon mode `[DEFERRED]`; `src/evolution/schedule.ts` (`--all-gaps`) coordinates stages within one run but never proposes, audits, or schedules on its own. `usa serve` is loopback-only, single-flight, memory-or-opt-in-disk.

The request is a nonstop loop: continuously ingest repos/software, audit, evolve, never stop. Doing that naively breaks the invariants that make USA trustworthy: deterministic offline spine (ADR-0013), producer ≠ judge (ADR-0014), non-vacuous release evidence (ADR-0016), targets-are-read-never-run (ADR-0039), and the charter line (ADR-0011: no CVE database, resolver, dataflow engine, signer).

## Decision

Add a **platform-side ingestion loop** around the untouched deterministic core. Core (`snapshot`, `detect`, `engine`, `evolution/coverage|gap|capability|release`) stays pure, offline, stateless. All statefulness lives in three new platform pieces:

1. **Sources (declarative).** A `repos.yaml` (path TBD, e.g. `.usa/sources.yaml`): list of `{ git: <url>, ref: <branch|tag>, cadence: <cron|interval>, depth: quick|standard|deep, allowRoots }`. Local dirs allowed. Host allowlist required; private repos use operator-owned credentials from env, never from the file.
2. **Fetcher (one repo at a time).** For each source, in priority/cadence order: `clone --bare` or `fetch --ff-only` into a content-verified workdir under an explicit `--allow-root` (same resolve-and-verify containment as the store, SEC-010). Compute `snapshotId`; if unchanged since last run, skip. Never execute target code; apply existing `--max-files/--max-bytes` caps. One running job at a time (second trigger gets 409, mirroring serve slice 1).
3. **Scheduler + promotion gate (timer, not daemon first).** A timer (`systemd`/`cron`, later K8s CronJob) runs: `audit → evolve --all-gaps --propose --bench-dir <fleet> --store <store>` per changed snapshot. Gap queue (`src/evolution/queue.ts`, append-only) is the durable memory across runs. A `RELEASE/ACCEPT` never mutates `rules/index.yaml`: it produces a **promotion PR** (candidate pack + bench cases + BEFORE/AFTER delta + `usa diff`) for human review. Registry mutation stays human-gated per ADR-0012 "propose, never self-trust".

## Threat model (slice 1)

- **Malicious repo content.** Treated as untrusted input (ADR-0039 carries over): reads only, no hooks, no build, no `post-checkout` execution. Fetcher disables `core.hooksPath` and does not run target scripts.
- **Path escape.** Workdirs must resolve inside `--allow-root`; symlink/`..` escapes throw.
- **Resource exhaustion.** Caps + single-flight + bounded per-repo history; huge repos truncate loudly (existing oversize warnings), never silently.
- **Credential handling.** Git credentials from env/credential-helper only; never logged, never stored in the content-addressed store (store holds hashes + reports, not secrets).
- **Circular self-judgement.** Fetcher/scheduler coordinate only existing stages (audit, propose, benchmark, release); they invent no verdicts. LLM (if any) stays proposal-assistant only (ADR-0013).

## Consequences

**Good:** "continuously audit + evolve" becomes a governed pipeline with byte-exact provenance (`snapshotId + capabilitySetId + engineVersion → report`), skip-when-unchanged efficiency, and a reviewable promotion path. No core change required.

**Bad:** First slice is polling + timer, not event-driven (no webhooks) and not multi-tenant. Fleet is still tiny: most auto-proposals will be `manual`-only and correctly blocked by ADR-0016 — the loop will surface proposals faster than it releases them. That is intended.

**Neutral:** Daemon, webhooks, Postgres/NATS backend, dashboards remain deferred; the store interface (`src/store/`) already allows a backend swap without touching core.

## Explicitly deferred (gates, not backlog)

- Auto-mutation of `rules/` on ACCEPT (requires its own ADR + promotion-policy review).
- Webhook ingest / remote `serve` exposure (ADR-0039 gates apply first).
- CVE database / resolver / reachability / dataflow (re-opens ADR-0011 first).
- Multi-user/tenant isolation (AI-007 reasoning absent here; second operator changes the model).
