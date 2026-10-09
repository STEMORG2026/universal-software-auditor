# Releasing USA — operations runbook

The release pipeline is fully automated. Normal operation requires nothing
beyond merging PRs. This file exists so future-you (or a successor) can
reconstruct _why_ every piece is shaped the way it is, and what to do when
something breaks. It is the durable memory of the sessions that built it.

## The chain (normal operation — nothing to do)

```
change a shipped file (src/, rules/, templates/, action.yml)
        │  add a note: pnpm changeset
        │  patch → 2.25.1 → 2.25.2 · minor → 2.26.0 · major → 3.0.0
        ▼
release.yml runs changesets/action → opens/updates ONE
  "chore(master): release" PR
  (version bump + CHANGELOG entries as a reviewable diff)
        │  human merges it  ← the only manual step, and it is code review
        ▼
the same workflow sees no notes left and publishes via
  `changeset publish`: OIDC → npmjs (+ provenance), then tags vX.Y.Z
        ▼
the tag fires publish.yml:
  • mirrors the same tarball to GitHub Packages as `@xenos1996/usa`
    (same scope both channels; GPR maps scopes to GitHub identities, so the
    mirror authenticates with a `write:packages` PAT minted on the
    scope-owning account, stored as the `GPR_TOKEN` secret — never
    `GITHUB_TOKEN`, whose cross-account writes are rejected)
  • emits the CycloneDX SBOM artifact
  • attests the tarball, then files bundle + VSA under provenance/ via PR
```

What you do: write conventional titles, add a changeset when a shipped
path moves, review PRs, merge the Version Packages PR. Everything else —
bump arithmetic, CHANGELOG entries, tags, publishing, provenance, SBOM —
happens on its own.

The VSA step is driven entirely by `VSA_*` environment variables set by the
workflow (`VSA_TARBALL_NAME`, `VSA_TARBALL_DIGEST`, `VSA_BUNDLE_DIGEST`,
`VSA_VERSION`, `VSA_SHA`, `VSA_POLICY_DIGEST`, `VSA_TIME`, `VSA_GH_VERSION`)
and written to the path named by `VSA_OUT` — see `scripts/make-vsa.mjs`.

## Why changesets and not release-please

release-please reads commit history and guesses the bump. That works while
there is exactly one package, and breaks the day there are two: a `fix:` in
the history does not say _which_ package it fixes, so the guess becomes
wrong and the human gate becomes a human correction pass.

changesets inverts it: the author states the intent (`patch` for `@usa/cli`,
`minor` for `@usa/engine`) in a file that is part of the diff. The tool
obeys. For one package this is slightly more work per PR; for N packages it
is the only thing that stays correct. See "Monorepo growth" below.

The cost is one new habit, enforced by the `changesets` job in `ci.yml`: a
PR touching a shipped path must add `.changeset/<name>.md` or fail with
instructions. A chore/docs/ci/test PR touches no shipped path and passes
untouched.

## The tag shape (read this before touching release tags)

Releases are tagged `@xenos1996/usa@X.Y.Z`, **not** `vX.Y.Z`. That is not a
choice anyone made — it is what `changeset publish` does in a pnpm
workspace, and two separate attempts to "fix" it failed. Both are recorded
here so a third does not repeat them.

**Mechanism.** `@changesets/cli`'s `buildGitTag` is:

```js
function buildGitTag(tool, { name, version }) {
  return tool.type !== 'root' ? `${name}@${version}` : `v${version}`;
}
```

`tool` comes from `@manypkg/get-packages`, which asks each tool in turn
whether the directory is a monorepo root. `@manypkg/tools`'s
`PnpmTool.isMonorepoRoot` is:

```ts
const manifest = await readYamlFile(path.join(directory, 'pnpm-workspace.yaml'));
if (manifest.packages) {
  return true;
}
```

**It checks that the key exists. It never counts the packages.** So any
`pnpm-workspace.yaml` with a `packages:` field makes `tool.type === 'pnpm'`
and the scoped tag shape applies — even with exactly one package. Verified
live on this repo:

```console
$ node -e "getPackages(process.cwd()).then(p => console.log(p.tool.type, p.packages.length))"
pnpm 1
```

**Two failed fixes, do not retry them:**

1. _Remove `packages/*` so the workspace holds one package._ Done in #160. It
   changed nothing: `tool.type` is `"pnpm"` with one package too. The glob
   removal is harmless and stays (there is no `packages/` directory), but it
   was never the cause.
2. _Add an explicit `v${VERSION}` tag step._ Would work, but means two tags
   per release and a second thing to keep correct.

**What actually fixes it** is accepting the tag changesets writes and
matching it. `publish.yml` listens on both shapes:

```yaml
on:
  push:
    tags:
      - 'v*' # historical releases
      - '@xenos1996/usa@**' # what changeset publish writes now
```

Note `**`, not `*`. GitHub's tag globs treat `*` as "any characters except
`/`" and `**` as "including `/`". The tag contains a slash, so the obvious
`@xenos1996/usa@*` is a fix that looks right and silently matches nothing —
which is the same failure mode being fixed.

The `2.25.3` release is how this was found: npmjs published fine, the tag
was `@xenos1996/usa@2.25.3`, the `v*` filter matched nothing, and the GPR
mirror, SBOM, attestation and provenance steps were skipped with every
workflow showing green. **A release that succeeds while silently dropping
its evidence trail is the worst failure shape there is** — nothing turns
red, so nothing gets looked at.

Verification after any change here: dispatch `publish.yml` on `master`, or
push a tag, and confirm `publish.yml` actually runs. Do not trust the glob
by inspection — both trap patterns above looked correct on inspection.

This section is also the canonical example of AGENTS.md step 0 ("prove the
diagnosis before writing the fix"): the first fix here shipped on a
plausible mechanism nobody had reproduced, and cost a release.

## Monorepo growth (when a second package is born)

`pnpm-workspace.yaml` declares only `.` today; `packages/*` returns when a
real package does. The tag shape does **not** change when it does — the
workspace is already a pnpm workspace and already tags `@xenos1996/usa@X.Y.Z`
(see "The tag shape" above), and `publish.yml` already matches it. So:

1. Add `packages/*` back to `pnpm-workspace.yaml`.
2. Give the package a `package.json` with its own `name` (same `@xenos1996`
   scope), `version: 0.0.0`, and a `version` script if it needs one.
3. Add it to `.changeset/config.json` if it should be versioned
   independently — the empty `fixed`/`linked` arrays mean nothing moves
   together by default, which is the point.
4. That is all. `pnpm install --frozen-lockfile`, `pnpm -r` build/test, the
   changeset gate, and `changeset publish` already cover it: the gate checks
   `packages/`, and `changeset publish` publishes every package whose note
   was consumed.

The one thing to re-check when a second package lands: `changeset publish`
then emits one tag per published package — `@xenos1996/usa@X.Y.Z` for this
one, and the same shape for the newcomer. The scoped pattern above still
matches this package, but a second name needs its own pattern or a
`**`-style catch-all; and `publish.yml` keys off the root `package.json`
version, so a release where _only_ the second package bumped needs the
workflow checked before it is trusted.

What you would NOT do: resurrect release-please. It cannot express
per-package intent, which is the whole reason this repo moved.

## One-time setups (done — do not redo unless broken)

| #   | Setup                                                         | Where / state                                               |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Package exists on npmjs as `@xenos1996/usa` (scoped: the      | Created by a one-time manual publish of 2.0.1 (see below).  |
|     | bare name `usa` is blocked by the typosquat filter)           | Never republish a version.                                  |
| 2   | OIDC trusted publisher (org `STEMORG2026`, repo               | Package page → Settings → Trusted Publisher.                |
|     | `universal-software-auditor`, workflow `release.yml`, no env) | Exact basename — full paths do not match.                   |
| 3   | Trusted publisher may **publish directly**                    | Same page (checkbox). Without it, PUTs 404.                 |
| 4   | Publishing access: strictest (2FA required, no bypass tokens) | Same page. OIDC works with either option.                   |
| 5   | `CHANGESET_TOKEN`: fine-grained PAT, this repo only —         | Repo Settings → Secrets → Actions. **Check its expiry**     |
|     | Contents + PRs read+write                                     | (Settings → Developer settings → Tokens): when it lapses,   |
|     |                                                               | the Version Packages PR silently stops appearing. Rotate    |
|     |                                                               | yearly. (Was `RELEASE_PLEASE_TOKEN`; the secret was renamed |
|     |                                                               | on migration — create the new name, then delete the old.)   |

The bootstrap token used for the first manual publish is deleted. No
static credential that can publish exists anymore — only OIDC (CI) and
2FA (humans).

### Bootstrapping a brand-new package name (the chicken-and-egg)

OIDC trusted publishing **cannot create a package that does not exist
yet** — the very first PUT 404s (`404 Not Found - PUT …/@scope%2fname`),
while the tarball itself builds and signs provenance fine. npm only
accepts the OIDC flow once the package exists _and_ its Trusted
Publisher is configured. So the first publish of a new name is manual:

```bash
# from a clean checkout of the tag you intend to ship
git checkout v2.0.1 && pnpm install --frozen-lockfile && pnpm run build
npm login                              # owner account, 2FA
npm publish --access public            # creates the package (manual, once)
npm view @xenos1996/usa version        # → 2.0.1
```

Then, while logged in on npmjs.com: **Package → Settings → Trusted
Publisher → GitHub Actions**, org `Er-Sajan-PLG`, repo
`universal-software-auditor`, workflow `release.yml`, and tick _allow
publish directly_. From that point on, tags publish themselves; re-run
the failed Release run to confirm. This was done for the `usat → usa`
rename: `usat` got the same treatment at 1.0.0.

**Reading the re-run correctly.** Once the Trusted Publisher is wired,
re-running a tag whose version is already on the registry fails with
`You cannot publish over the previously published versions: X.Y.Z` — that
is the fix working, not a regression: OIDC authenticated and the registry
recognised the package, it simply refuses the duplicate. The definitive
green is the **next** new version: it publishes with no manual step. Do
not "fix" the duplicate-version error; it is the fail-closed contract.

## Recurring (calendar, not automation)

- **PAT expiry** — the one thing that silently breaks releases. Check the
  date when the reminder fires; generate a replacement with identical
  scope, swap the secret, delete the old token.
- **First-run review of each Version Packages PR** — read the CHANGELOG
  diff. It is assembled from the changeset notes you wrote, so a note that
  said nothing produces a note that says nothing. Fix the note file on your
  own PR before it merges; editing the Version Packages PR fights the
  generator.
- **Scorecard / Security tab** — glance monthly; the workflow already runs.

## Troubleshooting (every failure hit so far, in order)

| Symptom                                                | Cause                                                                                                              | Fix                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `403 … too similar to existing packages` on publish    | npm typosquat filter on the bare name                                                                              | Scoped name (`@xenos1996/usa`). Decided, shipped.                                                                                             |
| `bin[usa]` "invalid and removed" warning on publish    | npm v12 rejects `./`-prefixed bin targets; tarball ships with **no executable**                                    | `bin` value is `dist/cli.js` (no prefix). Never re-add `./`.                                                                                  |
| `npm sbom -o` → `EUNKNOWNCONFIG`                       | No `-o` flag exists; SBOM goes to stdout                                                                           | Redirect: `npm sbom … > sbom.cdx.json`, after a clean `pnpm install` (partial trees fail with `ESBOMPROBLEMS`).                               |
| PUT 404 with provenance signed fine                    | Runner npm too old for the registry OIDC exchange (needs npm ≥ 11.5.1 / Node ≥ 22.14)                              | `release.yml` pins Node 24 + `npm@^11.15.0` floor. Do not downgrade.                                                                          |
| PUT 404 on a **brand-new** package, provenance fine    | Trusted publishing cannot create a package that does not exist yet                                                 | One-time manual `npm publish` first, then configure Trusted Publisher. See bootstrap section above.                                           |
| `You cannot publish over the previously published …`   | Re-running a tag whose version is already on the registry (e.g. after a manual                                     | **Expected / success.** OIDC works; the registry is fail-closed on duplicates. Verify with the next version.                                  |
|                                                        | first publish). Not an error to "fix".                                                                             |                                                                                                                                               |
| Tag cut, GitHub Release created, **nothing published** | Tags pushed by `GITHUB_TOKEN` never fire downstream workflows (loop prevention)                                    | changesets/action uses the PAT, never the default token.                                                                                      |
| `401 … GET https://npm.pkg.github.com/@scope%2fname`   | `changeset publish` read the scope registry from the project `.npmrc`, found GPR, and had no GPR token in that job | `release.yml` rewrites the `.npmrc` scope line to npmjs before publishing. An env var does NOT win — see the precedence table in `AGENTS.md`. |
| Version Packages PR never appears                      | `CHANGESET_TOKEN` expired, or the PR has no changeset notes to consume                                             | Rotate the PAT. If it is not the PAT, the PR genuinely changes nothing shippable.                                                             |
| Release PR lint red on `CHANGELOG.md`                  | `changelog-github` writes double blank lines; prettier wants single                                                | `CHANGELOG.md` is prettier-ignored (machine-written).                                                                                         |
| `Unable to resolve action ossf/scorecard-action@v2`    | Upstream publishes no `v2` major tag                                                                               | Pinned exact `v2.4.4`. Check for newer semver occasionally.                                                                                   |
| Installed bin exits 0 and prints **nothing**           | Entry guard compared `import.meta.url` to `file://${argv[1]}`; under npm's bin                                     | Resolve `argv[1]` with `fs.realpathSync` before comparing. Regression-tested in `tests/e2e/cli.test.ts`.                                      |
|                                                        | symlink those never match, so `main()` never ran                                                                   |                                                                                                                                               |
| `npx @xenos1996/usa …` → `usa: command not found`      | Run from **inside the USA repo**: npx sees cwd's `package.json` is the same package,                               | Run `npx` from any other directory, or `npm install -g @xenos1996/usa`, or use `pnpm run usa -- …` in-repo.                                   |
|                                                        | skips the registry install, and there is no local `.bin/usa`                                                       |                                                                                                                                               |
| `usat --help` audited the repo                         | Arg parser files `--flags`, never positionals; the switch cases were dead code                                     | Fixed in `cli.ts` with regression tests. Do not reintroduce flag handling without a test.                                                     |
| `SEC-003` failing on `https://` URLs (pre-1.0 history) | Pattern used `https?://` for a plaintext-HTTP rule                                                                 | Fixed to `http://`; rule carries a `NOTE:` comment. See `tests/integration/rules.test.ts`.                                                    |

## Manual fallback

If automation ever wedges: Actions → **Release** → Run workflow (on
`master`) walks the same version-or-publish path by hand. Safe to re-run —
a duplicate version fails closed at the registry with nothing mutated.
Never push `v*` tags by hand; the tag belongs to `changeset publish`
(bootstrap tag `v1.0.0` excepted).

If the npmjs leg specifically is stuck — the notes were consumed but the
registry never got the tarball — use Actions → **Publish** → Run workflow.
That leg publishes on dispatch only (tag pushes skip it, because the
scheduled path already did the job) and then continues to the GPR mirror,
SBOM, and provenance steps.

## Rollback (un-shipping a bad release)

Use when a published version is broken or compromised. Registry mutations
cannot use OIDC trusted publishing — a human runs these with a classic
token, which is why this section exists instead of a workflow. Replace
`BAD` with the bad version and `GOOD` with the last known-good one.

```bash
# 1. npmjs (source of truth): deprecate the bad version, repoint latest.
npm deprecate "@xenos1996/usa@BAD" "broken release, use GOOD or later"
npm dist-tag add "@xenos1996/usa@GOOD" latest

# 2. GitHub Release: delete the release (keeps the tag as history).
#    Releases page → the BAD tag → Delete (do NOT delete the tag itself).

# 3. GitHub Packages mirror: Packages → usa → package versions → delete BAD.
```

Then announce: a patch release whose notes point away from `BAD`, so
`CHANGELOG.md` tells the story without rewriting it. Never republish over
`BAD` — registries are fail-closed on duplicates for a reason, and a
reused version number is how implants hide.

Status: documented, never exercised. The closest real event was a failed
publish (duplicate version, fail-closed at the registry), which is the
system working, not a rollback. Exercise this with a dry walk before it
is ever needed under pressure.

## Verifying a signed report (verify-only)

A rendered report can ship with an optional detached signature sidecar
(`AUDIT.md.sig.json`) as supply-chain-grade evidence that the bytes being
read are the bytes that were audited. USA only **verifies** such sidecars —
it never mints them.

**Minting is blocked.** The charter constraint behind ADR-0011 says USA has
no signer, so adding a sign capability would re-open ADR-0011 first — which
has not happened. Until such an amendment lands, signatures are produced
outside USA with stock Sigstore tooling, and USA only checks them. There is
deliberately no `sign` function, no CLI flag, and no key handling in the
codebase; the verify-side module is `src/report/signature.ts`.

How it fits together:

1. The signed payload is the report's canonical trailer bytes — the same
   machine-readable trailer `usa diff` already parses, so a signature binds
   exactly what a diff compares. No second canonicalization exists.
2. Whoever holds the signing key signs that payload externally:
   `cosign sign-blob --key key.pem --bundle report.bundle --yes AUDIT.md`
   (key management stays entirely outside USA).
3. The bundle is stored beside the report as `AUDIT.md.sig.json`, holding
   the payload hash plus the base64-encoded bundle.
4. Verification replays the check with the public key:
   `cosign verify-blob --key key.pub --bundle report.bundle AUDIT.md`,
   or programmatically through `verifyDetachedSignature()` in
   `src/report/signature.ts`, which performs the same subprocess call after
   first comparing the sidecar's bound hash.

Fail-closed contract (mirrors `command` checks): a tampered payload fails,
a missing key fails, a cosign rejection fails — and when the `cosign`
binary itself is absent, verification throws an explicit error instead of
passing. An unverifiable report is never reported as verified.

### Verifying from the CLI (`usa verify-report`)

```bash
usa verify-report AUDIT.md --bundle AUDIT.md.sig.json --key cosign.pub [--cosign-binary <path>] [--quiet]
```

Exit codes mirror the gate convention: `0` verified, `1` mismatch or
failed verification, `2` malformed input (no trailer, bad sidecar, missing
files) or an unrunnable environment (absent `cosign` binary) — always with
a loud error on stderr. `--quiet` suppresses the success line and the
mismatch detail; exit-2 errors stay loud.

## Decisions with permanent consequences

- **No moving `v1` tag.** It would retrigger `publish.yml` (`v*` matches)
  and fail on the duplicate version. Docs pin exact versions instead.
- **No semantic-release.** Rule-pack content keeps its human gate; fully
  automatic publishing is the wrong risk profile here (see ROADMAP.md).
- **changesets, not release-please.** Per-package intent has to be stated
  by the author to survive a second package. Reverting this to
  history-guessing would re-break the moment a second package is added.
- **pnpm, not npm.** `strict-peer-dependencies` makes a missing peer a hard
  error instead of a hoisted accident. It also means releases are tagged
  `@xenos1996/usa@X.Y.Z` rather than `vX.Y.Z` and no amount of workspace
  trimming changes that — see "The tag shape", which records the two failed
  fixes so they are not attempted a third time. `publish.yml` matches both
  tag shapes. The `.npmrc` scope mapping and its publish-time scoped
  override keep the GPR mirror working unchanged.
- **npmjs is the source of truth; GitHub Packages is a mirror.** Old
  versions were never backfilled to GPR — two sources of truth for dead
  versions is worse than a thin Packages tab for one cycle.
