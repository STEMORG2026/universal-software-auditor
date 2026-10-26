/**
 * The verification gates `macp submit` runs, and the record it keeps of them.
 *
 * A gate result is an exit code measured by execution. An agent cannot type
 * "tests pass" into this structure; it can only run the command and read what
 * happened. That is the whole distinction between a machine-stamped handoff and
 * a confident paragraph.
 *
 * MACP is shared infrastructure, so the gate set belongs to the repository
 * being coordinated, not to this one. A consumer declares its gates in
 * `.macp/gates.json` at its root; without one, sensible defaults are guessed
 * from the stack (see `detectGates`). The shape is:
 *
 *     {
 *       "gates": [
 *         { "name": "test", "commands": [["pytest", "-q"]] },
 *         { "name": "lint", "commands": [["ruff", "check", "."]] }
 *       ]
 *     }
 *
 * Each entry in `commands` is argv — `[command, ...args]` — run with the
 * consumer repo as cwd. A gate passes when every command exits 0.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MAX_BUFFER = 32 * 1024 * 1024;
const TAIL_LINES = 40;

/**
 * "Run every gate this repository has configured" — the default for a submit.
 * An empty list is resolved by `resolveGateNames` to mean exactly that, never
 * "run nothing": a submit that skipped the gates by default would make the
 * default the bypass.
 */
export const DEFAULT_GATES = Object.freeze([]);

/** Resolve which gate names a submit runs: given, else every configured gate. */
export function resolveGateNames(root, requested) {
  if (requested && requested.length > 0) return requested;
  return gatesFor(root).map((gate) => gate.name);
}

/** Where a consumer repository declares its gates. */
export function gatesConfigPath(root) {
  return path.join(root, '.macp', 'gates.json');
}

/** Validate a parsed gates config; returns a list of problems (empty = ok). */
export function validateGatesConfig(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return ['the top level must be an object with a "gates" array'];
  }
  const { gates } = parsed;
  if (!Array.isArray(gates) || gates.length === 0) {
    return ['"gates" must be a non-empty array'];
  }
  const problems = [];
  const seen = new Set();
  for (const [index, gate] of gates.entries()) {
    if (!gate || typeof gate !== 'object') {
      problems.push(`gates[${index}] must be an object`);
      continue;
    }
    if (typeof gate.name !== 'string' || !/^[a-z0-9_]+$/.test(gate.name)) {
      problems.push(`gates[${index}].name must be snake_case (got ${JSON.stringify(gate.name)})`);
      continue;
    }
    if (seen.has(gate.name)) {
      problems.push(`gates[${index}]: duplicate gate name "${gate.name}"`);
    }
    seen.add(gate.name);
    if (!Array.isArray(gate.commands) || gate.commands.length === 0) {
      problems.push(`gates[${index}].commands must be a non-empty array`);
      continue;
    }
    for (const [step, argv] of gate.commands.entries()) {
      if (!Array.isArray(argv) || argv.length === 0 || !argv.every((a) => typeof a === 'string')) {
        problems.push(
          `gates[${index}].commands[${step}] must be an argv array of strings, e.g. ["pytest", "-q"]`,
        );
        continue;
      }
      if (argv[0].includes('/') || argv[0].includes('\\')) {
        problems.push(
          `gates[${index}].commands[${step}]: "${argv[0]}" must be a bare command name; use ` +
            `the consumer repo's package scripts, Makefile or venv activation for path-local tools`,
        );
      }
    }
  }
  return problems;
}

/** Guess a gate set from the consumer repository's own files. */
export function detectGates(root) {
  const gates = [];
  const has = (rel) => existsSync(path.join(root, rel));
  const isPython = has('pyproject.toml') || has('setup.py') || has('requirements.txt');
  const isNode = has('package.json');
  if (isPython) {
    if (has('pytest.ini') || has('tests') || has('tests/__init__.py')) {
      gates.push({ name: 'test', commands: [['python3', '-m', 'pytest', '-q']] });
    }
    if (has('.ruff.toml') || has('ruff.toml')) {
      gates.push({ name: 'lint', commands: [['ruff', 'check', '.']] });
    }
  }
  if (isNode) {
    let scripts;
    try {
      scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? null;
    } catch {
      scripts = null;
    }
    if (scripts) {
      if (scripts.test) gates.push({ name: 'test', commands: [['npm', 'test', '--silent']] });
      if (scripts.lint)
        gates.push({ name: 'lint', commands: [['npm', 'run', 'lint', '--silent']] });
      if (scripts.typecheck) {
        gates.push({ name: 'typecheck', commands: [['npm', 'run', 'typecheck', '--silent']] });
      }
    }
  }
  return gates;
}

/** The gate set for a repository: declared config, else detected, else none. */
export function gatesFor(root) {
  const file = gatesConfigPath(root);
  if (existsSync(file)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new Error(`${path.relative(root, file)} is not valid JSON — the gates cannot be run`);
    }
    const problems = validateGatesConfig(parsed);
    if (problems.length > 0) {
      throw new Error(`invalid ${path.relative(root, file)}:\n  ${problems.join('\n  ')}`);
    }
    return parsed.gates;
  }
  return detectGates(root);
}

function tail(text) {
  const lines = (text ?? '').trimEnd().split('\n');
  return lines.slice(-TAIL_LINES).join('\n');
}

/**
 * The commands one gate will actually run.
 *
 * Exported for tests and for previews; `runGates` is the only production caller.
 */
export function gateCommands(root, name) {
  const gates = gatesFor(root);
  const gate = gates.find((entry) => entry.name === name);
  if (!gate) throw new Error(`unknown gate "${name}" — it is not in this repository's gate set`);
  return gate.commands.map((argv) => ({ command: argv[0], args: argv.slice(1) }));
}

/**
 * Run one gate. Never throws: a failing gate is a result, not an exception —
 * and an unknown gate name is a refused result too, so a typo in `--gates`
 * is recorded as a red gate rather than crashing the submit.
 *
 * The first failing command stops the gate — the rest would be measured
 * against a tree the failing command already invalidated — and its exit code
 * and output are what the handoff records.
 *
 * The timeout is generous because a `test` gate can be minutes, and a gate
 * that reports a timeout as a failure would be lying about which thing failed.
 */
export function runGate(root, name, { timeoutMs = 20 * 60 * 1000 } = {}) {
  let steps;
  try {
    steps = gateCommands(root, name);
  } catch (error) {
    return { name, exit: 2, ms: 0, tail: error.message };
  }
  const started = Date.now();
  let out = '';
  for (const { command, args } of steps) {
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
