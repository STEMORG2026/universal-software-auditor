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

### 11:12 — Commit

`8f3942c` fix(release): export the expected ref so the provenance selector can read it

### 13:00 — Commit

`5476f96` fix(release): install cosign, which the provenance step calls
