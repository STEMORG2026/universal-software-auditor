# Scanners and evidence

`usa scan` runs real security tools over a checkout and writes down what they
found, with provenance. It is **not** part of scoring — see
[ADR-0011](adr/0011-coexist-with-deep-scanners.md) — and that separation is the
whole design.

An audit answers "is this true?" from files the repository already contains. A
scan answers a different question: "what did a tool observe, and can we prove
which tool, which version, on which revision?" Evidence is recorded so that a
later judgement — a threat model, a control review, a release gate — can cite it
instead of re-running the tool.

---

## The six adapters

Tier 1 is cheap and local. Tier 2 is expensive, and two of them are off by
default.

| Adapter              | Tier | Produces                                    | Default         |
| -------------------- | ---- | ------------------------------------------- | --------------- |
| `trivy`              | 1    | vulnerabilities from lockfiles              | on              |
| `dependency-cruiser` | 1    | architecture violations from a rules file   | on              |
| `semgrep`            | 1    | SAST findings from a rules directory        | on              |
| `codeql`             | 2    | SAST findings from a built database (SARIF) | **off**         |
| `scorecard`          | 2    | supply-chain checks                         | on (local mode) |
| `ort`                | 2    | licence and dependency-cone violations      | **off**         |

`codeql` and `ort` are disabled by default because each needs hundreds of
megabytes and a build step. They are opt-in per project in `.usa/scanners.yaml`,
never silently.

`scorecard` has two modes: `local` (default) reads files and never touches the
network; `repo` calls the GitHub API and needs a token.

---

## The invariant: "found nothing" is not "looked at nothing"

This is the rule that most of the adapter code exists to enforce.

A tool that ran and found nothing, and a tool that analysed nothing, both produce
an empty result list. Only the first is a clean scan. Reporting the second as
clean is how an audit invents confidence, so every adapter has to be able to tell
them apart — and when it cannot, the verdict is `UNKNOWN`, never `PASS`.

| Adapter              | Signal that nothing was analysed |
| -------------------- | -------------------------------- |
| `trivy`              | `Results` absent from the report |
| `codeql`             | no `runs` in the SARIF           |
| `dependency-cruiser` | no `modules`, or no rules loaded |
| `semgrep`            | empty `paths.scanned`            |
| `scorecard`          | `checks` absent                  |
| `ort`                | payload missing                  |

Two of these were real holes found by asking the question of every adapter in
turn, not by reading the code: `semgrep` reported a scan of zero files as clean,
and `dependency-cruiser` reported a cruise with no rules file loaded as a
verdict. Both are `UNKNOWN` now.

`UNKNOWN` carries a reason. When the tool exited non-zero, the reason includes
the last line of its stderr, because that is usually the whole diagnosis:

```
dependency-cruiser output was not valid JSON: Unexpected end of JSON input
  (exit 1: ERROR: Can't open 'src' for reading. Does it exist?)
```

---

## Running a scan

```bash
usa scan .                              # every enabled adapter that is installed
usa scan . --scanner semgrep            # one adapter
usa scan . --scanner trivy,semgrep      # a list
usa scan . --json                       # machine-readable manifest + evidence
usa scan . --out reports/scan.md        # default: .usa/evidence/<executionId>.md
```

Two opt-ins exist, and both are recorded in the manifest when used:

- `--network` — allow adapters that declare they need network. Denied by default.
- `--allow-build-commands` — permit a scanner to run a build (`codeql`). The
  engine never runs build commands without this.

An adapter that is not installed is not an error. It reports `unavailable` with a
reason, and the run continues. A scan that silently skips a missing tool is worse
than one that says so.

### Where the binary is looked up

The project's own `node_modules/.bin` is searched **before** `PATH`, and the
local binary wins. That is not a preference — measured on this repository, a
globally installed `depcruise` cruised **0 modules** because it cannot resolve
the project's TypeScript, while the devDependency cruised **108**.

---

## Configuration

`.usa/scanners.yaml` is optional. Each adapter gets a key of its own:

```yaml
scanners:
  semgrep:
    # A vendored rules directory. `--config auto` phones home and a registry
    # pack changes under you, so neither is acceptable for an audit run.
    rules: semgrep-rules
  dependency-cruiser:
    rules: .dependency-cruiser.json
  codeql:
    language: javascript
    packs: security-extended
  scorecard:
    mode: local # or `repo`, which needs network and a token
  ort:
    rulesResource: /rules/osadl.rules.kts
```

A scanner with no rules configured still runs. It just cannot produce a verdict,
and says so: `dependency-cruiser ran without a rules config — a graph, not a
verdict`. That is the correct answer, not a bug — the alternative is inventing
findings from a graph nobody asked a question about.

---

## The security boundary

Scanner children are the part of USA that executes third-party code, so the
environment they inherit is an allow-list followed by a deny-list — not a
filtered copy of the parent's.

**Allowed:** `HOME`, `PATH`, `LANG`, `LC_ALL`, `TMPDIR`, `https_proxy`,
`http_proxy`.

**Denied regardless:** `GITHUB_TOKEN`, `GH_TOKEN`, `NODE_AUTH_TOKEN`,
`NPM_TOKEN`, `NPM_CONFIG_REGISTRY`, `NPM_CONFIG_USERCONFIG`, `SEMGREP_APP_TOKEN`,
`SNYK_TOKEN`, `GPR_TOKEN`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`.

The deny-list is a security boundary, not hygiene. A scanner that can read a
token can exfiltrate it, and scanners are exactly the tools that fetch rules from
the internet.

Network is denied unless the run opts in, and an adapter that needs it returns
`unavailable` naming the config key that would make it work offline.

---

## Staged tools

Some scanners are two commands, not one. `codeql` builds a database and then
analyses it; `ort` resolves dependencies and then evaluates them.

`ScannerCommand` expresses this with `prepare` (stages that must succeed first)
and `artifacts` (files to read back, relative to the scan workdir). The runner
runs the stages in order, and a failing stage reports which one failed rather
than a generic error from the last command.

This matters because the obvious implementation — parse stdout — is wrong for
both tools. `codeql database analyze` logs progress to stdout and writes SARIF to
a file. A test that only exercises the parser proves nothing about that wiring,
so the e2e tests go through the runner.

---

## Joining evidence to a threat model

`usa intent` is the consumer. It reads a declared Threat Dragon model and
compares it with what the scanners observed:

```bash
usa scan . --json > scan.json
usa intent threat-model.json --evidence scan.json
```

Two questions, both deterministic: which declared threats did anything actually
observe, and which CWEs did the scanners find that the model never declared. The
second is the more useful one — it is the gap between the design the team wrote
down and the weaknesses the tools found.

---

## Adding an adapter

Append it to `src/scanner/registry.ts`. That is the whole integration: the
runner, the CLI and the rule packs take their list from there.

An adapter implements `ScannerAdapter` in `src/scanner/types.ts` — `probe`,
`buildCommand`, `parse`, and optionally `findings`. Two obligations are not
optional:

1. **Distinguish analysed-nothing from found-nothing**, or the adapter will
   report a clean scan it did not perform.
2. **Never let a parse failure become a PASS.** A verdict comes from the parser;
   anything the parser cannot read is `UNKNOWN` with a reason.

`tests/e2e/scan.test.ts` runs every installed adapter against
`fixtures/insecure-app` and asserts that at least one of them actually executed —
because a suite that skips every scanner is a green build that proved nothing.
