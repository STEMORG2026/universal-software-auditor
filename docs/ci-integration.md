# CI integration

## GitHub Actions

`usa init` writes a ready-made workflow. The minimum viable version:

```yaml
name: USA Audit
on: [pull_request]

permissions:
  contents: read

jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '20'

      - name: Run USA
        id: usa
        run: npx --yes @xenos1996/usa@2 audit . --depth standard --out AUDIT.md

      - name: Publish to job summary
        if: always()
        run: cat AUDIT.md >> "$GITHUB_STEP_SUMMARY"

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: usa-audit
          path: AUDIT.md
```

### Publish findings to GitHub code scanning (SARIF)

USA emits SARIF 2.1.0, so findings appear in the repo's **Security → Code
scanning** tab. No engine change and no extra service — just two flags:

```yaml
- name: USA audit (SARIF)
  run: npx --yes @xenos1996/usa@2 audit . --out usa.sarif

- name: Upload SARIF
  if: always()
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: usa.sarif
```

`--format json` (or an `.json` `--out`) emits the same report as a stable JSON
document for dashboards, with schema `usa-report-json-v1`. The format is
inferred from the `--out` extension, so `--out report.sarif` needs no flag.

### Quality gate

```yaml
- name: Quality gate
  run: npx --yes @xenos1996/usa@2 audit . --fail-on high
```

| Exit | Meaning                                   |
| ---- | ----------------------------------------- |
| `0`  | No findings at or above the threshold     |
| `1`  | Gate tripped — findings printed to stderr |
| `2`  | Usage or configuration error              |

**Roll-out advice:** start with `--fail-on critical`. Move to `high` once the backlog
is clear. Never start at `medium` — you will teach the team to bypass the check.

### New-code gate (`--baseline`)

The absolute gate above punishes legacy adoption: every pre-existing finding
fails the build until the backlog is clear. The new-code gate fails only on
what the change introduced or made worse, compared against a previous report:

```yaml
- name: Quality gate (new code only)
  run: |
    npx --yes @xenos1996/usa@2 audit . --out AUDIT.md --baseline reports/main.md --fail-on high
```

Gate semantics (shared with `usa diff`, so the diff text and the verdict agree):

- **Newly applicable + open at or above the threshold** fails. A rule absent
  from the baseline that is now `FAIL`/`WRONG`/`MISSING`/`DEPRECATED`/
  `EXPERIMENTAL` at `HIGH` or above blocks; legacy findings that were already
  open pass through at any severity.
- **Regressed rules** fail at any severity: a rule that passed (or was not
  applicable) and is now open — or fell back into the judgement queue — is
  new debt no matter the rung.
- Fixed rules, suppressions (accepted risk), and `UNKNOWN` findings never block.

The threshold defaults to `high` under `--baseline`; an explicit `--fail-on`
(including `none`, which disables the gate) still wins. The baseline is any
previous `AUDIT.md` (or a raw trailer file) — commit one per release or per
month and diff against it. A missing, unreadable, or malformed baseline exits
`2` loudly: a gate that cannot read its memory must never silently pass.

### Comment the score on the PR

```yaml
- name: Comment
  if: github.event_name == 'pull_request'
  uses: marocchino/sticky-pull-request-comment@v2
  with:
    path: AUDIT.md
```

### Composite action

```yaml
- uses: Er-Sajan-PLG/universal-software-auditor@v2
  with:
    depth: standard
    fail-on: high
```

See [`action.yml`](../action.yml).

---

## GitLab CI

```yaml
usa-audit:
  image: node:20
  stage: test
  script:
    - npx --yes @xenos1996/usa@2 audit . --out usa-report.md --fail-on critical
  artifacts:
    when: always
    paths: [usa-report.md]
    expose_as: 'USA Audit'
```

---

## Scheduled drift detection

The highest-value CI job is not the PR gate — it is a monthly audit that shows
movement:

```yaml
on:
  schedule:
    - cron: '0 6 1 * *' # 1st of the month
  workflow_dispatch:

jobs:
  audit:
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - run: npx --yes @xenos1996/usa@2 audit . --out reports/$(date +%Y-%m).md
      - run: |
          PREV=$(ls reports/*.md | tail -2 | head -1)
          npx --yes @xenos1996/usa@2 diff "$PREV" "reports/$(date +%Y-%m).md" --out DIFF.md || true
          cat DIFF.md >> "$GITHUB_STEP_SUMMARY"
      - uses: peter-evans/create-pull-request@v6
        with:
          title: 'chore: monthly USA audit'
          body-path: DIFF.md
```

A dated report per month plus `usa diff` gives you an audit trail that shows
improvement — the thing a single audit can never do.

---

## Reference: this repo's own CI (`.github/workflows/`)

USA audits itself with the full stack — copy what fits:

| Workflow              | What it does                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`              | lint+format+typecheck · Vitest with coverage thresholds · build + CLI smoke · rule-pack validation · **changeset gate** (shipped paths need a note) · npm audit + gitleaks + license scan · **hygiene** (`check-adrs` + `check-docs`) · **resync** (regenerates + pushes `cli.md`/`sample-report.md` on PRs) |
| `self-audit.yml`      | `usa audit . --depth deep --fail-on critical` on every PR, score as PR comment                                                                                                                                                                                                                               |
| `scorecard.yml`       | OpenSSF Scorecard monthly + on push (API-verified hygiene; SARIF to Security tab)                                                                                                                                                                                                                            |
| `gitleaks-pin.yml`    | Monthly check that the curl-pinned gitleaks binary in `ci.yml` is current (no bot watches it) — opens a deduped issue when stale                                                                                                                                                                             |
| `release.yml`         | `changesets/action`: opens the Version Packages PR, then publishes via OIDC trusted publishing (no long-lived token) + `--provenance`                                                                                                                                                                        |
| `publish.yml`         | Tag push (`v*` or `@xenos1996/usa@**`) → GPR mirror + CycloneDX SBOM artifact + Artifact Attestations + `provenance/` filing PR. Manual dispatch also publishes to npmjs if the release leg wedged.                                                                                                          |
| `commits` in `ci.yml` | Lints PR commit messages (commitlint) — the CHANGELOG is assembled from them, so history must parse                                                                                                                                                                                                          |

Release setup note: trusted publishing needs a one-time owner step on
npmjs.com (package Settings → Trusted Publisher → this repo + workflow)
before the first OIDC publish succeeds.

### Generated docs resync themselves

`docs/reference/cli.md` and `examples/sample-report.md` are byte-compared
against the real engine on every PR, so any CLI/engine change (or version bump)
would turn the next PR red until someone runs the generators. The `resync` job
in `ci.yml` runs them instead: on same-repo PRs it regenerates both files and
pushes the result back to the PR branch as a `docs:` commit, and the
re-triggered run validates it green. Expect a red-then-green cycle on PRs that
touch the CLI or the report renderer — no action needed. It never pushes to
forks, never pushes to `master`, and refuses a second consecutive push (a
still-dirty tree after a regen means a nondeterministic generator, which is a
bug to fix, not to commit over). Marker sync (`sync-docs`) stays manual:
markers encode author intent.

## How a release happens (developer-style, no manual versioning)

1. Land PRs with Conventional Commits titles (`feat:`, `fix:`, `docs:`,
   `refactor:` …) — squash-merge so the title becomes the commit.
2. If the PR touches a shipped path (`src/`, `rules/`, `templates/`,
   `action.yml`, `package.json`), add a release note: `pnpm changeset`,
   then pick the bump (`patch` / `minor` / `major`) and write one line
   explaining it. The `changesets` job in `ci.yml` fails a PR that changes
   shipped files without one. Chore/docs/ci/test PRs skip the gate.
3. `changesets/action` in `release.yml` keeps one open **Version Packages PR**
   updated: version bump in `package.json` + CHANGELOG entries, as a diff
   you review like code.
4. Merge that PR → the same workflow sees the notes consumed and runs
   `changeset publish`: npmjs via OIDC with provenance, then tag
   `@xenos1996/usa@X.Y.Z` (pnpm workspaces use the scoped shape, not `vX.Y.Z`
   — see `docs/release.md` "The tag shape").
   Tags are the release act; never push release tags by hand (first bootstrap
   tag `v1.0.0` excepted).
5. The tag fires `publish.yml`: GPR mirror + SBOM + attestations +
   `provenance/` bundle PR.
6. `changesets/action` authenticates with a fine-grained PAT
   (`CHANGESET_TOKEN`, repo-scoped: Contents + PRs read+write) — **not**
   `GITHUB_TOKEN`. A version commit pushed by `GITHUB_TOKEN` does not
   trigger downstream workflows, so with the default token the bump lands,
   the tag is created… and `publish.yml` never fires. Nothing reaches
   GitHub Packages. The PAT is load-bearing, not optional.

## Choosing a depth in CI

| Depth      | Rules                                          | Runtime (≈10k files) | Use for              |
| ---------- | ---------------------------------------------- | -------------------- | -------------------- |
| `quick`    | high-signal only                               | ~1–3 s               | Every PR             |
| `standard` | default                                        | ~3–10 s              | PRs + nightly        |
| `deep`     | adds cycles, duplication, complexity, mutation | ~10–30 s             | Weekly / pre-release |

`deep` is where the judgement-heavy rules live; the extra cost is mostly I/O.

## Notes

- **No network at audit time.** USA reads files and writes Markdown. It never uploads
  anything, which is why it is safe on private repositories.
- **`--allow-commands` in CI.** Only if you trust the target repo — it shells out for
  checks like `npm audit`. Off by default; those rules report ❓ NEEDS REVIEW instead.
- **Pin the version** in production pipelines (`@xenos1996/usa@2`, not `@latest`) so a
  rule-pack change cannot fail your build without a commit.
- **Commit `.usa.yaml`.** Suppressions and overrides without a commit are invisible
  decisions, and they are the first thing a reviewer asks about.
