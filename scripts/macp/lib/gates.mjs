/**
 * The verification gates `macp close` runs, and the record it keeps of them.
 *
 * A gate result is an exit code measured by execution. An agent cannot type
 * "tests pass" into this structure; it can only run the command and read what
 * happened. That is the whole distinction between a machine-stamped handoff and
 * a confident paragraph.
 */
import { execFileSync } from 'node:child_process';

const MAX_BUFFER = 32 * 1024 * 1024;
const TAIL_LINES = 40;

/** Ordered by cost. `self_audit` builds first and is the slowest by far. */
export const GATES = Object.freeze([
  { name: 'typecheck', command: 'pnpm', args: ['run', 'typecheck'] },
  { name: 'lint', command: 'pnpm', args: ['run', 'lint'] },
  { name: 'format', command: 'pnpm', args: ['run', 'format:check'] },
  { name: 'test', command: 'pnpm', args: ['test'] },
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
  const started = Date.now();
  try {
    const stdout = execFileSync(gate.command, gate.args, {
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
