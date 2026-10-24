/**
 * The verification gates `macp close` runs, and the record it keeps of them.
 *
 * A gate result is an exit code measured by execution. An agent cannot type
 * "tests pass" into this structure; it can only run the command and read what
 * happened. That is the whole distinction between a machine-stamped handoff and
 * a confident paragraph.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const MAX_BUFFER = 32 * 1024 * 1024;
const TAIL_LINES = 40;

/**
 * A gate is a sequence of steps, and it passes only when every step exits 0.
 *
 * Each step names either a `tool` (the binary in this repository's own
 * `node_modules/.bin`, if installed) or a `command` (whatever is on `PATH`).
 * Both may carry a `script` name, which is the fallback when the tool is not
 * installed — a repository onboarded with `macp init-repo` has no
 * `node_modules/.bin`, and `pnpm run <script>` is what its CI would run.
 *
 * Why steps and not `pnpm run <gate>`: the package manager adds a process layer
 * that can fail for reasons unrelated to the check. Measured here — `pnpm run
 * docs:all` exited 1 with an environment delete-guard error while the six
 * scripts it chains all exited 0 when run directly. A gate that records the
 * package manager's mood is not measuring the code, and the recorded tail then
 * names the wrong failure.
 */
export const GATES = Object.freeze([
  {
    name: 'typecheck',
    steps: [{ tool: 'tsc', script: 'typecheck', args: ['-p', 'tsconfig.json', '--noEmit'] }],
  },
  { name: 'lint', steps: [{ tool: 'eslint', script: 'lint', args: ['.'] }] },
  { name: 'format', steps: [{ tool: 'prettier', script: 'format:check', args: ['--check', '.'] }] },
  { name: 'test', steps: [{ tool: 'vitest', script: 'test', args: ['run'] }] },
  {
    name: 'docs_all',
    steps: [
      { node: 'scripts/check-adrs.mjs' },
      { node: 'scripts/check-docs.mjs' },
      { node: 'scripts/gen-cli-docs.mjs', args: ['--check'] },
      { node: 'scripts/gen-sample-report.mjs', args: ['--check'] },
      { node: 'scripts/gen-asvs-coverage.mjs', args: ['--check'] },
      { node: 'scripts/check-manifest.mjs' },
    ],
  },
  {
    name: 'self_audit',
    steps: [
      { tool: 'tsc', script: 'build', args: [] },
      { node: 'dist/cli.js', args: ['audit', '.', '--out', 'AUDIT.md'] },
    ],
  },
]);

export const DEFAULT_GATES = Object.freeze([
  'typecheck',
  'lint',
  'format',
  'test',
  'docs_all',
  'self_audit',
]);

function tail(text) {
  const lines = (text ?? '').trimEnd().split('\n');
  return lines.slice(-TAIL_LINES).join('\n');
}

/** Resolve one step to `{command, args}`, preferring an installed local tool. */
function resolveStep(root, step) {
  if (step.node) {
    return { command: process.execPath, args: [path.join(root, step.node), ...(step.args ?? [])] };
  }
  const local = step.tool ? path.join(root, 'node_modules', '.bin', step.tool) : null;
  if (local !== null && existsSync(local)) return { command: local, args: step.args };
  return { command: step.command ?? 'pnpm', args: ['run', step.script, ...(step.args ?? [])] };
}

/**
 * Run one gate. Never throws: a failing gate is a result, not an exception.
 *
 * The first failing step stops the gate — the remaining steps would be measured
 * against a tree the failing step already invalidated — and its exit code and
 * output are what the handoff records.
 *
 * The timeout is generous because `test` on this repository is minutes, and a
 * gate that reports a timeout as a failure would be lying about which thing
 * failed.
 */
export function runGate(root, name, { timeoutMs = 20 * 60 * 1000 } = {}) {
  const gate = GATES.find((entry) => entry.name === name);
  if (!gate) throw new Error(`unknown gate "${name}"`);

  const started = Date.now();
  let out = '';
  for (const step of gate.steps) {
    const { command, args } = resolveStep(root, step);
    try {
      out += execFileSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: MAX_BUFFER,
        timeout: timeoutMs,
        env: { ...process.env, CI: process.env.CI ?? '1', FORCE_COLOR: '0' },
      });
    } catch (error) {
      const stdout = typeof error.stdout === 'string' ? error.stdout : '';
      const stderr = typeof error.stderr === 'string' ? error.stderr : '';
      return {
        name,
        exit: typeof error.status === 'number' ? error.status : 1,
        ms: Date.now() - started,
        tail: tail(`${out}${stdout}\n${stderr}`),
      };
    }
  }
  return { name, exit: 0, ms: Date.now() - started, tail: tail(out) };
}

/** Run the named gates in order, stopping at nothing — every result is recorded. */
export function runGates(root, names) {
  return names.map((name) => runGate(root, name));
}

/** Names of the gates that did not exit 0. */
export function failedGates(results) {
  return results.filter((result) => result.exit !== 0).map((result) => result.name);
}
