# MACP queue — discoveries and deferred work

Append-only. Every entry is a thing this repository decided not to do in the
session that found it. `macp start` prints the unchecked ones, so a discovery
survives the session that made it without derailing it.

Written by `macp log --type BUG_FOUND|DEFERRED`; closed by `macp queue --done <id>`.

## Open

- [ ] `Q003` SA01-SA11 seals carry no SSH signature; retro-signing would edit records sealed before the runtime existed, and would need the private key at each historical commit (DEFERRED, SA12, 2026-10-24)
- [ ] `Q004` root _tmp_* scratch directories (68 files each) accumulate and cannot be removed without tripping the environment bulk-delete guard (DEFERRED, SA12, 2026-10-24)
- [ ] `Q005` check-session-start door 2 returns true before inspecting the pending set, so a source change folded into the close-bookkeeping commit passes both pre-commit and pre-push while the gate prints 'state-only change' — files: scripts/check-session-start.mjs (BUG_FOUND, SA13, 2026-10-24)
- [ ] `Q006` macp reopen signs with whatever --ssh-key is given and never compares that key to the sealing key, so a wrong key produces REOPENED with an ACTIVE lease; only macp verify notices, and verify is not in pre-push and not a required check — files: scripts/macp/lib/lifecycle.mjs (BUG_FOUND, SA13, 2026-10-24)
- [ ] `Q007` buildBrief reads READ THIS FIRST / CHECKPOINT / 13. Next steps, but macp close writes '## Handoff — <id>'; nothing writes READ THIS FIRST, so a freshly initialised repo prints 'Nothing yet' forever — files: scripts/macp/lib/brief.mjs (BUG_FOUND, SA13, 2026-10-24)
- [ ] `Q008` macp start writes state/INDEX.md and state/REGISTRY.md in a form prettier --check rejects, so the format gate fails on the runtime's own bookkeeping and a COMPLETED close is refused until a human reformats them — files: scripts/macp/lib/statefiles.mjs (BUG_FOUND, SA13, 2026-10-24)
- [ ] `Q009` F-28: renaming a PR branch orphans the session that names it, and the gate refuses (BUG_FOUND, SA13, 2026-10-25)
- [ ] `Q010` F-30: extracting a branch's unique diff silently reverted a fix already on the base, and the resulting CodeQL thread blocked the merge via required_conversation_resolution (BUG_FOUND, SA13, 2026-10-25)
- [ ] `Q011` F-31: signPayload gave ssh-keygen /dev/null as stdin, so a passphrase could never be typed; every seal that ever worked used an agent-loaded key, the one path ADR-0046 forbids (BUG_FOUND, SA13, 2026-10-26)

## Done

- [x] `Q001` validateHandoff demanded a tail from every gate, so quiet green gates blocked a valid PARTIAL close; narrowed to failing gates, unit test + mutation kill (BUG_FOUND, SA12, 2026-10-24)
- [x] `Q002` sync-docs rewrote the ADR count inside four sealed session files and check-sessions then failed them as edited-after-seal; sessions excluded from sync and claim scan (BUG_FOUND, SA12, 2026-10-24)
