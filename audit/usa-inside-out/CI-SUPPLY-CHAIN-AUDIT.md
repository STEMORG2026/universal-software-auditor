# CI AND SUPPLY-CHAIN AUDIT

Eleven workflows, 1 627 lines. This is the surface where the release, the provenance and the
tokens actually live, and until now I had only read their _names_ to see which gates exist.

## Verdict

**This is the best-engineered part of the repository.** Every action is pinned to a 40-hex
SHA. There is no `pull_request_target` anywhere. Event data reaches shell only through `env:`,
never inline in a `run:` block. Top-level `permissions: contents: read` everywhere, with writes
scoped to the single job that needs them — and the comments explain _why_ in terms of
Scorecard's own check implementation, which is the AGENTS.md case study applied.

Seven findings, none of them a design failure. Two are material.

## What I checked, and what held

| Check                                                | Result                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `pull_request_target` (the classic injection vector) | **absent**                                                               |
| Actions pinned to a commit SHA                       | **all** (the only unpinned `uses:` in the tree is inside a comment)      |
| `${{ github.event.* }}` interpolated into `run:`     | **none** — `PR_NUMBER` goes through `env:`                               |
| Top-level write permissions                          | **none** — all `contents: read`, writes on the job                       |
| Secret exposure in logs                              | no `echo ${{ secrets.* }}`; gitleaks runs with `--redact`                |
| Fork PRs reaching secrets                            | no `pull_request_target`, so no fork-with-secrets path                   |
| `npm audit`/`curl \| bash` patterns                  | no pipe-to-shell; one `curl` download **without a checksum** (finding 3) |
| Self-audit gate                                      | present, `--depth deep`, `--fail-on critical`                            |

## Finding 1 (MEDIUM) — the release force-pushes to master, so `enforce_admins` cannot simply be turned on

`release.yml` uses `changesets/action` with:

```yaml
push-with-git-cli: true # "pushes with `git push --force` using the checkout PAT"
token: ${{ secrets.CHANGESET_TOKEN }}
```

and `release.yml` triggers on `push: branches: [master]`.

**This corrects my own earlier recommendation.** In `ACCEPTED-RISKS-AUDIT.md` I wrote that
setting `enforce_admins: true` was a one-call fix. It is not: the release path depends on the
owner's PAT being able to **force-push the version commit to master**, and branch protection
with `allow_force_pushes: false` blocks that for everyone the moment admins are enforced. Turn
it on as written and the next release fails at the push step.

The precise fix is a **bypass actor**, not a blunt toggle:

1. Create a GitHub App (or keep the PAT's identity) that represents release automation.
2. Convert branch protection to a **ruleset** with `bypass_actors` = that identity, and enable
   `enforce_admins`.
3. Delete the long-lived PAT in favour of an App installation token (1-hour lifetime).

That keeps "never push to main" true for humans, keeps the release working, and removes a
long-lived credential with `contents: write` from the secret store.

**Why it still matters:** today the only automated path to `master` is a PAT that can
force-push, and the protection is deliberately not enforced against the account that owns it.
A leaked `CHANGESET_TOKEN` is a direct, silent rewrite of `master`. The FND-004 waiver says the
protection is fine without mentioning that the release depends on it being bypassable.

## Finding 2 (MEDIUM) — the `Changeset present` required check fails every Dependabot PR

This is why PR #276 has been red since 26 October, and it is a gate bug, not a bad PR.

```bash
if ! git diff --name-only "$BASE_SHA" "$HEAD_SHA" \
    | grep -qE '^(src/|rules/|templates/|action\.yml|package\.json)'; then
  echo "No shipped paths touched — a changeset is not required."
```

`package.json` is in the shipped-path list, so **any** change to it — including a
`devDependencies` bump — demands a changeset. Dependabot is configured to open exactly those
PRs, so the check fails by construction on every dependency PR. It is a _required_ check, so
the PR can never merge.

The gate's own comments show the author knows this class of bug (the README-in-diff false
negative, the release-branch exception). This one is the same shape: a file-level test standing
in for a semantic one.

**Fix:** inspect the `package.json` diff for the fields that actually ship — `version`,
`dependencies`, `peerDependencies`, `bin`, `main`, `exports`, `files` — rather than the file.
A devDependency bump then passes; a runtime dependency bump still requires a note.

## Finding 3 (MEDIUM) — the gitleaks binary is downloaded without integrity verification

```yaml
VERSION=8.30.1
curl -sSfL -o /tmp/gitleaks.tar.gz \
"https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_linux_x64.tar.gz"
tar -xzf /tmp/gitleaks.tar.gz -C /tmp gitleaks
sudo install -m 0755 /tmp/gitleaks /usr/local/bin/gitleaks
```

The version is pinned, which is good. There is **no checksum**: a replaced release asset, or a
compromised upstream account, runs arbitrary code in the job that holds the repository token.
The repository pins _actions_ by SHA with obvious care, so this is an inconsistency rather than
a philosophy — and it is the only download-and-execute in CI that is not hash-verified.

**Fix:** commit the expected SHA-256 and `sha256sum -c` before `tar`.

## Finding 4 (LOW) — floating tool installs in the jobs that hold publish credentials

| Where                        | What                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `release.yml`, `publish.yml` | `npm install -g npm@^11.15.0` — floating within 11.x, in the job with `id-token: write` + `packages: write` |
| `ci.yml`                     | `pnpm dlx license-checker` — fetches and runs the latest `license-checker` at CI time                       |

Both are the same pattern the rule catalogue is criticised for elsewhere in this audit
(`npx --yes <tool>@latest`). The npm one is deliberate and documented (trusted publishing needs
npm ≥ 11.15), but `^11.15.0` should be an exact version: a compromised npm 11.x minor would run
inside the release job.

## Finding 5 (LOW) — "no evidence yet" is a green check

`provenance-check.yml` exits 0 when no bundle at or above the floor exists:

```
echo "no filed bundle at or above ${FLOOR} — nothing to read yet"
exit 0
```

The message is honest and the reasoning is sound ("this is not a pass, it is the statement that
the verified path has produced no evidence yet"). But the _check_ is green, so the thing a
reviewer scans is indistinguishable from a verified run. This is the same shape as
`DEP-002`'s fail-open, with better prose. Either exit neutral/skip, or make the absence of
expected evidence a failure once a release exists.

## Finding 6 (LOW) — `self-audit` gates at `--fail-on critical` only

```bash
node dist/cli.js audit . --depth deep --out AUDIT.md --fail-on critical
```

With zero CRITICAL findings and fourteen waivers, this gate cannot fire. It is not wrong — the
repo does have 0 CRITICAL — but as a regression gate it only catches the worst imaginable
regression. `--fail-on high` would catch the next tier at no cost today (there are 0 HIGH too,
so it is free to tighten). The docs gate next to it uses `--fail-on medium`, which is stricter
than the security gate — an inversion worth a second look.

## Finding 7 (LOW) — `gh issue list --search` with a title containing parentheses

`gitleaks-pin.yml` dedupes by searching for the literal title:

```bash
TITLE="[automation] gitleaks pin is stale ($PINNED → $LATEST)"
gh issue list --search "$TITLE in:title" ...
```

`(` and `)` are search operators in GitHub's issue search. On a title that contains them the
query is not the literal string it looks like, so the dedupe can miss and open a duplicate
issue monthly. Cosmetic, but it is the mechanism meant to prevent noise.

## What this means for the roadmap

None of the seven changes the architecture. Two of them (findings 1 and 2) are the difference
between "the release is automated and safe" and "the release is automated and the gate is red
forever". Both are small.

The CI surface is now audited. It was the last large unexamined area with real blast radius,
and it came out better than the engine did.
