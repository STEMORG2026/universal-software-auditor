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
 * Ordered by cost. `self_audit` builds first and is the slowest by far.
 *
 * `tool` means "the binary in this repository's own `node_modules/.bin`, if it
 * is installed"; `command` means "whatever is on PATH". The first four prefer
 * the tool over `pnpm run <script>` because the script indirection adds a
 * process layer that can fail for reasons unrelated to the check — measured
 * here: `pnpm run typecheck` exited 1 with an environment delete-guard error
 * while the same `tsc` invocation nested inside `node -e` exited 0. A gate that
 * reports the package manager's mood is not measuring the code.
 *
 * The `script` fallback keeps the runtime portable: a repository onboarded with
 * `macp init-repo` has no `node_modules/.bin`, and `pnpm run <script>` is what
 * its own CI would run. `docs_all` and `self_audit` are script chains, not
 * binaries, so they always go through the package manager.
 */
export const GATES = Object.freeze([
  {
    name: 'typecheck',
    tool: 'tsc',
    script: 'typecheck',
    args: ['-p', 'tsconfig.json', '--noEmit'],
  },
  { name: 'lint', tool: 'eslint', script: 'lint', args: ['.'] },
  { name: 'format', tool: 'prettier', script: 'format:check', args: ['--check', '.'] },
  { name: 'test', tool: 'vitest', script: 'test', args: ['run'] },
  { name: 'docs_all', command: 'pnpm', args: ['run', 'docs:all'] },
  { name: 'self_audit', command: 'pnpm', args: ['run', 'self-audit'] },
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

/**
 * Run one gate. Never throws: a failing gate is a result, not an exception.
 *
 * The timeout is generous because `pnpm test` on this repository is minutes,
 * and a gate that reports a timeout as a failure would be lying about which
 * thing failed.
 */
export function runGate(root, name, { timeoutMs = 20 * 60 * 1000 } = {}) {
  const gate = GATES.find((entry) => entry.name === name);
  if (!gate) throw new Error(`unknown gate "${name}"`);
  const local = gate.tool ? path.join(root, 'node_modules', '.bin', gate.tool) : null;
  const useLocal = local !== null && existsSync(local);
  const command = useLocal ? local : (gate.command ?? 'pnpm');
  const args = useLocal ? gate.args : gate.command ? gate.args : ['run', gate.script];
  const started = Date.now();
  try {
    const stdout = execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: MAX_BUFFER,
      timeout: timeoutMs,
      env: { ...process.env, CI: process.env.CI ?? '1', FORCE_COLOR: '0' },
    });
    return { name, exit: 0, ms: Date.now() - started, tail: tail(stdout) };
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    return {
      name,
      exit: typeof error.status === 'number' ? error.status : 1,
      ms: Date.now() - started,
      tail: tail(`${stdout}\n${stderr}`),
    };
  }
}

/** Run the named gates in order, stopping at nothing — every result is recorded. */
export function runGates(root, names) {
  return names.map((name) => runGate(root, name));
}

/** Names of the gates that did not exit 0. */
export function failedGates(results) {
  return results.filter((result) => result.exit !== 0).map((result) => result.name);
}
