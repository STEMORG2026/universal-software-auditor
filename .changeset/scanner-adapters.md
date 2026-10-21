---
'@xenos1996/usa': minor
---

Add the scanner adapter layer: a new `usa scan` command and `src/scanner/**`, an
evidence-first subsystem that runs established open-source scanners behind one
adapter contract and records provenance for every observation.

**Tier 1 adapters:** Trivy (verified end-to-end against v0.75.0),
dependency-cruiser, Semgrep, and CodeQL (opt-in, heavy). Adding an adapter means
appending to `src/scanner/registry.ts` — the runner, the CLI and the rule packs
do not change.

**The contract that matters:** command construction and parsing are pure
functions, so every adapter is tested against captured fixtures without the
scanner installed. Every unavailable tool is recorded as `UNAVAILABLE` with a
reason in the run manifest, never skipped silently.

**Security boundaries, enforced in the runner:** a scratch copy of the target,
a per-adapter timeout, a 20 MB output cap, an allow/deny-listed environment with
no credentials, network denied by default, and no build command ever run without
an explicit, recorded opt-in.

No change to `usa audit` semantics or to any rule verdict: `usa scan` writes
evidence artifacts under `.usa/evidence/`, which rules consume later through the
existing `oracle` check.

Also ships `docs/research/**` (ten tool documents plus a capability matrix) and
`docs/architecture/**` (evidence model, finding model, adapter model,
integration architecture and plan).
