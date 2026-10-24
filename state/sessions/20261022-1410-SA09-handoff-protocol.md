**Agent:** SA09 (Sathi / WorkBuddy)
**Branch:** docs/handoff-protocol, docs/handoff-sha
**Started:** 2026-10-22T14:10+05:45
**Status:** COMPLETED (merged as #217)
**Base commit:** b7241ec (master, after #216)

# Session SA09 — handoff to the completion protocol

## Objective

Bring the repository's canonical handoff up to the _Universal Task Completion,
Verification & Seamless Handoff Protocol_ — 16 sections, labelled claims, and a
code commit distinct from the handoff commit.

## Decision: canonical location, not a new file

The protocol permits "an established project convention specifying another
canonical location", and this repo has one: `state/CONTINUATION.md`, designated
by MACP, read at session startup by `AGENTS.md` step 2, and classified in
`docs/manifest.yaml`. A root `HANDOFF.md` would have been a second handoff in a
repo whose own protocol rule is _do not create duplicate documentation_.

So the document was rewritten **in place**. The traps table (26 measured rows)
and the tooling table survive as appendices — reformatting is not a reason to
lose the most expensive knowledge in the file.

## What is genuinely new

- A CHECKPOINT block separating `code_commit_sha` from `handoff_commit_sha`.
- Labelled claims: 59 across all seven labels. Every `[FACT]` is something that
  was run; the `[UNKNOWN]`s and `[ASSUMPTION]`s are marked as exactly that.
- Six sections the old document lacked: must-preserve, interfaces and
  dependencies, assumptions and uncertainties, verification performed,
  completion criteria, open questions.

## Verification

`docs:all` green (44 ADRs, 138 tracked docs, links clean, cli.md and
sample-report.md in sync). Format clean. No placeholder TODOs — the nine
`[TODO]`s are labelled next-actions, not stubs.

## Note on the second commit

The CHECKPOINT initially shipped `handoff_commit_sha: null` because the commit
that lands a document cannot contain its own hash. A follow-up commit recorded
the real value. Both are docs-only; neither changes `code_commit_sha`.

### 09:14 — Commit

`3ecbc1e` docs(state): record the handoff commit in the checkpoint

### 09:34 — Commit

`085acb7` docs(state): record that the release branch was verified before signing

### 09:56 — Commit

`25c57bc` chore(audit): refresh the review ledger, and settle two items that were never reviewed

### 10:14 — Commit

`f78536c` docs(agents): write down the no-direct-push rule where an agent reads it

### 10:31 — Commit

`1a1385a` chore(audit): clear the never-reviewed backlog, and find Node 20 is EOL

### 10:37 — Commit

`1718081` ci: move the test path off end-of-life Node 20 to Node 24

### 10:43 — Commit

`e414b58` docs(state): hand off with the queue cleared and CI on Node 24

### 10:51 — Commit

`b0522d3` ci: bump the gitleaks pin to 8.30.1

### 11:03 — Commit

`310caff` ci: make the cli-reference gate explain itself when it fails

### 11:10 — Commit

`c6e23da` docs(state): hand off after the gitleaks bump and the gate diagnostics

### 11:18 — Commit

`8b6911f` docs: prose pass — fix a broken action ref, an EOL Node example, and stale URLs

### 11:24 — Commit

`d28b04f` docs(state): hand off after the prose pass

### 11:33 — Commit

`6d651be` docs(state): record the cli-reference failure signature

### 11:45 — Commit

`60ad74e` docs: document the scanner subsystem, and make its flags discoverable

### 11:50 — Commit

`eb9a8ce` ci: print where the generated CLI reference ends, on mismatch

### 11:56 — Commit

`6e428da` docs(state): hand off after documenting the scanner subsystem

### 12:16 — Commit

`bd6e29f` fix(docs): refuse to generate the CLI reference from a partial rule load

### 12:26 — Commit

`e8db299` fix(state): do not write state files on bot branches

### 12:50 — Commit

`7ad260a` fix(cli): stop truncating piped stdout on exit

### 12:51 — Commit

`07b3b7e` docs(state): record 2.28.1 published, #205 rescued, and the truncation root cause

### 13:05 — Commit

`8210808` docs(state): record the three PRs waiting for signature

### 13:27 — Commit

`d336dd6` chore(codeowners): make the provenance bundle owned by its signer

### 14:10 — Commit

`31df962` fix(release): verify the provenance chain instead of only filing it

### 14:12 — Commit

`11c2cf7` Merge remote-tracking branch 'origin/master' into fix/provenance-verified-not-just-filed

### 14:14 — Commit

`4fa33d1` Merge remote-tracking branch 'origin/fix/provenance-verified-not-just-filed' into fix/provenance-verified-not-just-filed

### 14:26 — Commit

`446fdf3` docs(state): hand off with the provenance finding, and the fix on #240

### 15:38 — Commit

`80aa97a` fix(release): unbreak the provenance step on its first real run

### 16:55 — Commit

`e265672` fix(release): fetch the provenance by digest, not by a file that does not exist

### 16:58 — Commit

`a5418a9` fix(release): do not let an API error body masquerade as the attestation response

### 17:01 — Commit

`b89d942` docs(release): correct how the attestation is fetched

### 11:00 — Commit

`7f3ce1c` docs(state): hand off with master at ab19ef7 and the provenance step unverified

### 11:13 — Commit

`cb45446` docs(state): record the third provenance failure and the merge order

### 11:14 — Commit

`0d86d84` chore(state): auto-update from post-commit hook

### 11:25 — Commit

`be55902` docs(state): list #247 and its dispatch limitation

### 11:31 — Commit

`7c82367` docs(state): record what the provenance step was rehearsed against

### 12:02 — Commit

`40787e3` docs(state): mark the ADR count so the claim gate can hold it

### 12:05 — Commit

`c4c63b0` docs(state): 2.28.4 shipped without provenance, and the backfill is measurable

### 12:12 — Commit

`c9e919c` docs(state): the checkpoint said 2.28.3 and listed a merged PR as open

### 12:12 — Commit

`54dc961` docs(state): fill in handoff_commit_sha

### 12:42 — Commit

`9681c1a` docs(state): step 5 is rehearsed, not expected

### 11:12 — Commit

`8f3942c` fix(release): export the expected ref so the provenance selector can read it

### 12:55 — Commit

`d541b42` Merge remote-tracking branch 'origin/master' into docs/continuation-post-243

### 13:02 — Commit

`3f419b2` docs(state): the dispatch ran, and the step was two defects deep

### 13:05 — Commit

`12c77b4` docs(state): #249 would publish 2.28.5 through the broken step

### 11:24 — Commit

`07fc125` ci: read the filed provenance bundles back on a schedule

### 12:36 — Commit

`f6f2c89` fix(provenance): check agreement, not a spelling

### 12:54 — Commit

`fece0aa` Merge remote-tracking branch 'origin/master' into ci/provenance-check-schedule

### 13:00 — Commit

`5476f96` fix(release): install cosign, which the provenance step calls

### 13:12 — Commit

`4c2b1dc` fix(release): pin the cosign version, and verify the call it makes

### 13:46 — Commit

`b7c55a7` Merge remote-tracking branch 'origin/master' into docs/continuation-post-243

### 13:51 — Commit

`4224394` docs(state): the sixth failure, and it was caused by my own pre-flight

### 13:56 — Commit

`7a199d2` Merge remote-tracking branch 'origin/master' into ci/provenance-check-schedule

### 13:45 — Commit

`210b780` fix(release): pin cosign to a v2.x, because the installer cannot fetch a v3

### 14:24 — Commit

`33fe893` Merge remote-tracking branch 'origin/master' into docs/continuation-post-243

### 14:27 — Commit

`3ece011` docs(state): the backfill worked — provenance/v2.28.4 is filed and reads back

### 03:51 — Commit

`5446d89` docs(state): #252 merged — the provenance chain is closed for 2.28.4

### 03:53 — Commit

`73cb7d3` docs(state): #247's first run is rehearsed, not guessed

### 04:23 — Commit

`00356f6` docs(state): #247 merged — and the re-dispatch I proposed was wrong

### 03:54 — Commit

`85e0629` Merge remote-tracking branch 'origin/master' into ci/provenance-check-schedule

### 04:25 — Commit

`4439030` Merge remote-tracking branch 'origin/master' into docs/continuation-post-243

### 04:28 — Commit

`6a5d25b` fix(state): remove conflict markers I committed into SA09

### 05:08 — Commit

`899890f` docs(state): the release PR had no checks, and that is systematic

### 05:31 — Commit

`061a672` docs(state): 2.28.5 shipped, the chain fired alone, and it caught a real defect

### 05:37 — Commit

`84664f4` docs(state): the release PRs were never un-triggered — they are awaiting approval
