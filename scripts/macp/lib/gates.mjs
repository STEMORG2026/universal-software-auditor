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
 * Each step names one of three things, tried in this order:
 *   `node`    a script in this repository, run with the current interpreter;
 *   `tool`    a binary in this repository's own `node_modules/.bin`;
 *   `script`  a package-manager script, which is what a repository onboarded
 *             with `macp init-repo` has and what its own CI runs.
 *
 * A gate also carries a `script` of its own. When no step can be resolved — a
 * fresh repository with none of these files — the whole gate falls back to that
 * one script, because `docs:all` is a chain there rather than six files.
 *
 * Why not just `pnpm run <gate>`: the package manager adds a process layer that
 * can fail for reasons unrelated to the check. Measured here — `pnpm run
 * docs:all` exited 1 with an environment delete-guard error while the six
 * scripts it chains all exited 0 when run directly. A gate that records the
 * package manager's mood is not measuring the code, and the recorded tail then
 * names the wrong failure.
 */
export const GATES = Object.freeze([
  {
    name: 'typecheck',
    script: 'typecheck',
    steps: [{ tool: 'tsc', args: ['-p', 'tsconfig.json', '--noEmit'] }],
  },
  { name: 'lint', script: 'lint', steps: [{ tool: 'eslint', args: ['.'] }] },
  {
    name: 'format',
    script: 'format:check',
    steps: [{ tool: 'prettier', args: ['--check', '.'] }],
  },
  { name: 'test', script: 'test', steps: [{ tool: 'vitest', args: ['run'] }] },
  {
    name: 'docs_all',
    script: 'docs:all',
    steps: [
      { node: 'scripts/check-adrs.mjs' },
      { node: 'scripts/check-docs.mjs' },
      { node: 'scripts/gen-cli-docs.mjs' },
      { node: 'scripts/gen-sample-report.mjs' },
      { node: 'scripts/gen-asvs-coverage.mjs' },
      { node: 'scripts/check-manifest.mjs' },
    ],
  },
  {
    name: 'self_audit',
    script: 'self-audit',
    steps: [
      { tool: 'tsc', args: [] },
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

/** One step as `{command, args}`, or `null` when this repository has no such file. */
function resolveStep(root, step) {
  if (step.node) {
    const file = path.join(root, step.node);
    if (existsSync(file)) return { command: process.execPath, args: [file, ...(step.args ?? [])] };
  }
  if (step.tool) {
    const local = path.join(root, 'node_modules', '.bin', step.tool);
    if (existsSync(local)) return { command: local, args: step.args };
  }
  return null;
}

/**
 * The commands one gate will actually run.
 *
 * The script fallback never passes `args`: those belong to the binary's calling
 * convention, not to a package script that already carries its own flags.
 */
export function gateCommands(root, name) {
  const gate = GATES.find((entry) => entry.name === name);
  if (!gate) throw new Error(`unknown gate "${name}"`);
  const resolved = gate.steps.map((step) => resolveStep(root, step));
  if (resolved.every((entry) => entry !== null)) return resolved;
  return [{ command: 'pnpm', args: ['run', gate.script] }];
}

/**
 * Run one gate. Never throws: a failing gate is a result, not an exception.
 *
 * The first failing step stops the gate — the rest would be measured against a
 * tree the failing step already invalidated — and its exit code and output are
 * what the handoff records.
 *
 * The timeout is generous because `test` on this repository is minutes, and a
 * gate that reports a timeout as a failure would be lying about which thing
 * failed.
 */
export function runGate(root, name, { timeoutMs = 20 * 60 * 1000 } = {}) {
  const started = Date.now();
  let out = '';
  for (const { command, args } of gateCommands(root, name)) {
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
