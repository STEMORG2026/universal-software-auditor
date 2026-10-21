# state.md — Primary Entry Point

**Last updated:** 2026-10-01T16:30:00+05:45
**Agent:** HERMES (bootstrap)
**Repo:** Universal_Software_Auditor
**Branch:** docs/0042-continuous-ingestion

---

## Quick Start

1. Read `state/DASHBOARD.md` — executive summary (<60 seconds)
2. Read `state/REGISTRY.md` — who's active, file ownership
3. Read `state/BLOCKERS.md` — active blockers
4. Read `state/INDEX.md` — searchable session log
5. Read `state/ARCHITECTURE.md` — system architecture
6. Read `state/DECISIONS.md` — architecture decision records
7. Read `state/DEBT.md` — technical debt tracker

## Directory Structure

```
state/
├── DASHBOARD.md          # Executive summary — ALWAYS read first
├── REGISTRY.md           # Who's actively working and what files they own
├── INDEX.md              # Searchable log of all past sessions
├── ARCHITECTURE.md       # Current system architecture (living document)
├── DECISIONS.md          # Architecture Decision Records
├── DEBT.md               # Technical debt tracker
├── BLOCKERS.md           # Active blockers and dependencies
├── sessions/             # One file per agent session
├── plans/                # Active plans (deleted when done)
├── conflicts/            # Documented conflicts needing coordination
└── archive/              # Old sessions compressed by month
```

## Current Status (one-liner)

USA v2.26.2 — self-auditing TypeScript CLI. Self-audit **100/100, no open
findings** (2026-10-21). Branch `fix/verdict-correctness` is open as a PR and
awaiting owner review; `master` is clean. One pending changeset
(`verdict-correctness`). No blockers.

## MACP Protocol

This repository operates under **MACP (Multi-Agent Coordination Protocol)**.
All agents must follow the startup sequence defined in AGENTS.md.
See `state/DASHBOARD.md` for the full protocol summary.
