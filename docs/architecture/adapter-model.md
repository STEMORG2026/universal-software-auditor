# Adapter model

Every scanner lives behind one contract. The contract is a TypeScript interface;
the registry is data; execution is a single runner with one sandbox policy. No
adapter may reach outside itself for anything.

## The contract

```ts
export interface ScannerAdapter {
  /** Stable id used in evidence.source.tool. */
  readonly id: string;
  /** Human name, for logs only. */
  readonly name: string;

  /** Is the executable present and usable, and what version? */
  probe(): AdapterProbe;

  /** Build the argv. Pure, so it can be unit-tested without the tool. */
  buildCommand(target: ScanTarget, config: ScannerConfig): ScannerCommand;

  /** Parse tool output into evidence items. Pure, tested with fixtures. */
  parse(raw: RawOutput): Evidence[];

  /** Map evidence onto findings when path (2) applies; default: none. */
  findings?(evidence: Evidence[], target: ScanTarget): ScannerFinding[];

  /** Default config, merged under the user's. Never a hard-coded policy. */
  defaultConfig(): ScannerConfig;
}
```

`parse` is deliberately pure over a string, not a child process. This is the
single most important property: command construction and parsing are testable
with fixtures, so a scanner that cannot be installed in CI still has a full test
suite.

### Where the string comes from

A command is not always one process, and its output is not always stdout:

```ts
export interface ScannerCommand {
  /** The command that produces the evidence. */
  argv: string[];
  /** Stages that must succeed first (ORT `analyze`, CodeQL `database create`). */
  prepare?: ScannerStage[];
  /** Files the tool writes its payload to, relative to the scan workdir. */
  artifacts?: string[];
  network?: boolean;
  timeoutMs?: number;
}
```

Both fields exist because adapters were written against the assumption that a
tool prints its JSON. Two of the six do not: ORT writes
`evaluation-result.json` and logs progress to stdout, and CodeQL writes SARIF
with `--output=`. Parsing stdout for those adapters parses log lines, and no
fixture test can see it, because the fixture is passed to `parse` directly.

The runner therefore reads the first declared artifact that exists and hands
_that_ to `parse`; a declared artifact that was not produced is an `error` with
a reason, never an empty result. `preparedBy` in the evidence provenance records
the stages, so a re-run reproduces the whole pipeline rather than its last step.

## Why not check_available / health_check as separate methods

The task's sketch listed both. They collapse: `probe()` returning a version and a
reason is both the availability check and the health check, and it is the one
thing that must run _every_ audit (to report `UNAVAILABLE` early rather than
discovering it mid-scan).

## Execution policy (the runner)

One runner owns every process an adapter starts. Rules, all enforced there and
nowhere else:

| Concern           | Policy                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timeout           | 300s default; a per-adapter override. `SIGTERM` on expiry → `UNAVAILABLE` with reason `timeout`                                                                                                                                   |
| Output bound      | 20 MB cap; truncation is recorded, never silent                                                                                                                                                                                   |
| Working directory | a **scratch copy** of the target, not the checkout                                                                                                                                                                                |
| Environment       | inherit a _deny-listed_ subset: no `GITHUB_TOKEN`, no home credentials, no `NPM_CONFIG_*`                                                                                                                                         |
| Network           | denied by default; an adapter that needs network declares `needsNetwork: true` and the run manifest records it                                                                                                                    |
| Build commands    | **never executed by the engine**. An adapter may _propose_ one (CodeQL `--command`), and the engine refuses it unless the target config explicitly enables `allowBuildCommands` with a recorded reason                            |
| Output location   | the declared artifact file if the tool writes one, otherwise stdout; a declared artifact that is missing is an `error`, not an empty result                                                                                       |
| Exit codes        | recorded in the manifest and **never interpreted**. Semgrep exits non-zero on findings, dependency-cruiser's JSON reporter always exits zero, and ORT exits non-zero when it finds violations — a run that succeeded and objected |
| Success verdict   | **never inferred from exit code alone**, always from parsed output                                                                                                                                                                |

The last three rows are consequences of real, measured behaviour in the research
documents. An adapter that forgot any of them would be a silent-failure machine.
A prepare stage is the one exception: it produces no payload to judge, so a
non-zero status there stops the pipeline and is reported as a blind spot — never
as a finding.

## Run manifest

Each execution writes one manifest — the reproducibility record that makes
audits comparable across machines:

```json
{
  "execution_id": "…",
  "target": "/abs/path",
  "revision": "abc123",
  "timestamp": "…",
  "adapters": [
    {
      "id": "trivy",
      "available": true,
      "version": "0.75.0",
      "command": ["trivy", "fs", "--format", "json", "."],
      "status": "ok",
      "exit_code": 0,
      "evidence_count": 12,
      "elapsed_ms": 8200
    },
    {
      "id": "ort",
      "available": true,
      "version": "97.0.0",
      "command": ["ort", "evaluate", "-i", "…", "-o", ".ort-results", "-f", "JSON"],
      "prepare": [["ort", "analyze", "--input-dir", "…", "--output-dir", ".ort-results"]],
      "artifact": ".ort-results/evaluation-result.json",
      "status": "ok",
      "exit_code": 2,
      "evidence_count": 3,
      "elapsed_ms": 17400
    },
    {
      "id": "codeql",
      "available": false,
      "status": "unavailable",
      "reason": "executable not found on PATH"
    }
  ],
  "environment": { "sandbox": "subprocess-scratch-copy", "network": "denied" }
}
```

This manifest is an artifact in its own right, never a log line: it is what
makes "42% of adapters ran" a computed fact rather than an anecdote.

## Registry

Adapters self-register in a list; the runner iterates it. Adding an adapter must
not require touching the runner, the CLI, or the rule packs. Tier-1 adapters:

```ts
export const adapters: ScannerAdapter[] = [
  trivyAdapter, // installed, verified-run
  dependencyCruiserAdapter,
  semgrepAdapter,
  codeqlAdapter, // opt-in, heavyweight
];
```

## Configuration

Per-project config, `.usa/scanners.yaml`:

```yaml
scanners:
  trivy:
    enabled: true
    scanners: [vuln, secret, misconfig]
    severity: [HIGH, CRITICAL]
  codeql:
    enabled: false # until the packs cache exists
    packs: codeql/javascript-queries@latest
  dependency-cruiser:
    rules: .dependency-cruiser.cjs
```

Unknown keys are an error, not a silent ignore — a typo'd option must fail the
adapter's config check, not the scan.

## Testing contract

Each adapter must prove, at minimum:

1. `buildCommand` produces the expected argv (unit, no tool).
2. `parse` maps a **captured real fixture** to the expected evidence (unit).
3. `parse` handles empty output, malformed output, and a truncated file.
4. `probe` reports `UNAVAILABLE` when the executable is missing (unit, PATH
   stubbed).
5. A timeout produces `UNAVAILABLE`, not a crash (runner-level, with a fake
   executable that sleeps).
6. Where the tool is installed in CI, at least one end-to-end run against
   `fixtures/insecure-app` with an assertion on a _named_ evidence id.
7. **If the tool writes its payload to a file, the test goes through the
   runner.** Calling `parse` with the file's contents proves the parser and
   proves nothing about the wiring: two adapters passed that test while being
   incapable of ever receiving the file.

Rule 6 has a graded fallback: if the tool is not installed, the integration test
skips **loudly** (`test.skip(...)` with the reason printed), because a silently
absent tool is exactly the failure mode this architecture exists to prevent.
