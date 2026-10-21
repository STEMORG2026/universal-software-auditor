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

## Why not check_available / health_check as separate methods

The task's sketch listed both. They collapse: `probe()` returning a version and a
reason is both the availability check and the health check, and it is the one
thing that must run _every_ audit (to report `UNAVAILABLE` early rather than
discovering it mid-scan).

## Execution policy (the runner)

One runner owns every process an adapter starts. Rules, all enforced there and
nowhere else:

| Concern           | Policy                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Timeout           | 300s default; a per-adapter override. `SIGTERM` on expiry → `UNAVAILABLE` with reason `timeout`                                                                                                        |
| Output bound      | 20 MB cap; truncation is recorded, never silent                                                                                                                                                        |
| Working directory | a **scratch copy** of the target, not the checkout                                                                                                                                                     |
| Environment       | inherit a _deny-listed_ subset: no `GITHUB_TOKEN`, no home credentials, no `NPM_CONFIG_*`                                                                                                              |
| Network           | denied by default; an adapter that needs network declares `needsNetwork: true` and the run manifest records it                                                                                         |
| Build commands    | **never executed by the engine**. An adapter may _propose_ one (CodeQL `--command`), and the engine refuses it unless the target config explicitly enables `allowBuildCommands` with a recorded reason |
| Exit codes        | parsed per adapter (Semgrep exits 1 on findings; dependency-cruiser's JSON reporter always exits 0)                                                                                                    |
| Success verdict   | **never inferred from exit code alone**, always from parsed output                                                                                                                                     |

The last two rows are consequences of real, measured behaviour in the research
documents. An adapter that forgot either would be a silent-failure machine.

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
      "evidence_count": 12,
      "elapsed_ms": 8200
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

Rule 6 has a graded fallback: if the tool is not installed, the integration test
skips **loudly** (`test.skip(...)` with the reason printed), because a silently
absent tool is exactly the failure mode this architecture exists to prevent.
