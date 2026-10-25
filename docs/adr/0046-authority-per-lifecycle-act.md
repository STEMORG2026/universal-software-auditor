# 46. One key per lifecycle act: close, seal, reopen and destroy are separate principals

- **Date:** 2026-10-24
- **Status:** Accepted
- **Supersedes in part:** ADR-0045 §4 (a single `macp-owner` principal for every signed act)

## Context

The audit of 2026-10-24 (`MACP-AUDIT-2026-10-24.md`) found that the seal's authority
was weaker than its documentation claimed, in three separate ways:

1. **`reopen` accepted any key.** It compared the committed `owner.pub` to the
   _seal-time_ fingerprint, then signed the reopen with whatever `--ssh-key` it was
   given and never compared the two. Measured in a fixture: sealed by key A,
   reopened by key B, exit 0, session `REOPENED`, lease `ACTIVE`, and commits then
   passed both gates. Only `macp verify` objected, afterwards.
2. **`seal` overwrote the root of trust.** `lifecycle.mjs:555` writes `owner.pub`
   from whatever signed, with no comparison to the existing file. One seal with the
   wrong key invalidated twelve prior seals, and `verify` reported the _old_ sessions
   as tampered.
3. **`close` required no key at all.** The agent reached the terminal state
   `COMPLETED` alone; the owner's key gated only `CLOSED`, which every other gate
   treated as optional.

The owner then specified the model he wants, in his words: _"closing must be done by
me with key so do sealing as well and reopen as well … It also needs my passkey and it
is not same for close, sealing, its a different passkey."_

## Decision

**Every lifecycle act is gated by the owner's key, and no two acts share a passphrase.**

A passphrase belongs to a private key file, so "a different passphrase per act" means a
different key and therefore a different principal:

| Act         | Transition                  | Principal           | Key                   |
| ----------- | --------------------------- | ------------------- | --------------------- |
| report done | `ACTIVE → AWAITING_USER`    | agent, **unsigned** | —                     |
| close       | `AWAITING_USER → COMPLETED` | `macp-close`        | `~/.ssh/macp_close`   |
| seal        | `COMPLETED → CLOSED`        | `macp-seal`         | `~/.ssh/macp_seal`    |
| reopen      | `CLOSED → REOPENED`         | `macp-reopen`       | `~/.ssh/macp_reopen`  |
| destroy     | `CLOSED → DESTROYED`        | `macp-destroy`      | `~/.ssh/macp_destroy` |

`state/macp/owner.pub` becomes `state/macp/allowed_signers`, carrying one line per
principal. `lib/seal.mjs` already has the primitive — `allowedSignersLine(publicKey,
principal)` — and is called today with a single hardcoded principal.

**The owner performs the act, in person.** The owner's instruction: _"all of them needs me
to explicitly execute code and put my passphrase for the event to occur."_ A key on disk is
not enough, because a key loaded in `ssh-agent` signs with no prompt — measured: the first
seal of the audit was produced by the agent itself for exactly that reason. So every
privileged command refuses when its key is present in the agent (`ssh-add -l`), and the
passphrase is typed at the terminal each time. The agent may not hold, cache or load any of
the four keys.

**The owner performs the act, in person.** The owner's instruction: _"all of them needs me
to explicitly execute code and put my passphrase for the event to occur."_ A key on disk is
not enough, because a key loaded in `ssh-agent` signs with no prompt — measured: the first
seal of the audit was produced by the agent itself for exactly that reason. So every
privileged command refuses when its key is present in the agent (`ssh-add -l`), and the
passphrase is typed at the terminal each time. The agent may not hold, cache or load any of
the four keys.

Every signature is verified **before** the transition, not after it. `verify` remains
the offline, whole-repository check that runs in CI; it is not a substitute for
authorising the transition.

### The consequence that reorders the work

`macp close` currently writes `COMPLETED` with no key. Gating it on the owner's key
removes the agent's only way to say "I am done", so an unprivileged verb and a waiting
state are prerequisites, not follow-ups:

```
agent: macp submit          → AWAITING_USER   (unsigned, no authority)
owner: macp close  --key    → COMPLETED       (signed, macp-close)
owner: macp seal   --key    → CLOSED          (signed, macp-seal, different key)
owner: macp reopen --key    → REOPENED        (signed, macp-reopen)
```

This inverts the remediation plan's phase order: `AWAITING_USER` (P4) precedes the
principal set and key-gated transitions (P3).

## Consequences

**Good.** A key leaked for one act cannot perform another. `reopen` can no longer be
produced by a party that did not seal. `seal` can no longer silently replace the anchor,
because the anchor is a set of principals and a signature must match the principal that
is allowed to make _that_ transition. The agent loses the ability to reach any terminal
state on its own.

**Bad.** Four keys to hold, four passphrases to remember, and a lost key means that act
can never be performed again — intended, and it will still be experienced as a problem
one day. Every key must be passphrase-protected and not loaded in `ssh-agent`; an
agent-loaded key removes the gate entirely, which is how the wrong-key seal of 22:07
succeeded without a prompt.

**Neutral.** This is still an audit control at heart: an agent with the same OS account
can delete the record, and no key prevents that. What the principals buy is that a
transition cannot be _produced_ by the wrong party, and that a forgery is detectable
offline by anyone with the repository.

## Explicitly deferred

- **The fourth key — decided.** Asked directly whether destroy shares the seal key, the
  owner answered "own key for deleting sessions". `macp-destroy` is therefore a distinct
  principal with its own key, and the set is four: close, seal, reopen, destroy.
- **Key generation and custody.** The owner creates the keys; no agent should ever hold a
  passphrase. `seal` must refuse an unencrypted key, and every command must refuse to run
  when the key is present in `ssh-agent`.
- **Migration of existing seals.** SA01–SA12 were sealed under the single `macp-owner`
  principal. They remain verifiable against `owner.pub`; retro-signing them would violate
  the immutability the seal exists to enforce.
