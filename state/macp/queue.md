# MACP queue — discoveries and deferred work

Append-only. Every entry is a thing this repository decided not to do in the
session that found it. `macp start` prints the unchecked ones, so a discovery
survives the session that made it without derailing it.

Written by `macp log --type BUG_FOUND|DEFERRED`; closed by `macp queue --done <id>`.

## Open

- [ ] `Q003` SA01-SA11 seals carry no SSH signature; retro-signing would edit records sealed before the runtime existed, and would need the private key at each historical commit (DEFERRED, SA12, 2026-10-24)
- [ ] `Q004` root _tmp_* scratch directories (68 files each) accumulate and cannot be removed without tripping the environment bulk-delete guard (DEFERRED, SA12, 2026-10-24)

## Done

- [x] `Q001` validateHandoff demanded a tail from every gate, so quiet green gates blocked a valid PARTIAL close; narrowed to failing gates, unit test + mutation kill (BUG_FOUND, SA12, 2026-10-24)
- [x] `Q002` sync-docs rewrote the ADR count inside four sealed session files and check-sessions then failed them as edited-after-seal; sessions excluded from sync and claim scan (BUG_FOUND, SA12, 2026-10-24)
