#!/usr/bin/env node
/**
 * `macp` — the MACP runtime.
 *
 * Usage: `macp <command> [flags]` (installed globally or via a package script).
 *
 * The CLI is thin on purpose: it parses flags, builds one request object, and
 * hands it to a backend. All judgement lives in `lib/`, so the same commands
 * work against the local backend today and a JARVIS authority later without a
 * second implementation of any rule.
 */
import { createBackend, JARVIS_ROUTES } from './lib/backend.mjs';
import { initAuthority, initRepo, installHooks } from './lib/install.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENFORCE = path.resolve(HERE, '..', 'enforce');

/**
 * `macp check` — the structural gates, runnable from one command.
 *
 * The gates are plain scripts so a consumer repo can call them from git hooks
 * or CI directly (`node <macp>/enforce/check-session-start.mjs`); this command
 * is the convenience that does not require knowing the path.
 */
function runCheck({ gate = 'all', cwd } = {}) {
  const target = cwd ? path.resolve(cwd) : process.cwd();
  const gates = {
    start: 'check-session-start.mjs',
    close: 'check-protocol.mjs',
    sessions: 'check-sessions.mjs',
  };
  const names = gate === 'all' ? Object.keys(gates) : [gate];
  if (!names.every((n) => gates[n])) {
    console.error(`macp check: unknown gate "${gate}" — use start, close, sessions or all`);
    return 2;
  }
  let worst = 0;
  for (const name of names) {
    const script = path.join(ENFORCE, gates[name]);
    const result = spawnSync(process.execPath, [script], {
      cwd: target,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const text = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    if (text) console.log(`--- ${name} ---\n${text}`);
    if (result.status !== 0) worst = result.status;
  }
  if (worst === 0) console.log('macp check: all gates green');
  return worst;
}

const COMMANDS = {
  start: {
    summary: 'open a session: recon, brief, register, lease (scope from --plan or --task)',
    values: [
      'agent',
      'harness',
      'branch',
      'task',
      'plan',
      'plan-file',
      'authorized-by',
      'id',
      'history',
      'agent-name',
      'claims',
      'limit',
    ],
    flags: ['no-brief'],
  },
  log: {
    summary: 'record a mid-session event (and queue the durable ones)',
    values: ['type', 'summary', 'files', 'session'],
    flags: [],
  },
  queue: {
    summary: 'list open discoveries, or close one',
    values: ['done'],
    flags: [],
  },
  submit: {
    summary: 'agent: freeze, run the gates, record the report, wait for the owner',
    values: [
      'outcome',
      'completed',
      'remaining',
      'discovered',
      'deferred',
      'traps',
      'next',
      'required-context',
      'gates',
    ],
    flags: ['prepare', 'no-gates'],
    multi: ['completed', 'remaining', 'discovered', 'deferred', 'traps', 'required-context'],
  },
  checkpoint: {
    summary:
      'agent: submit a finished TASK for direction check — one-way stop until the owner acks',
    values: ['task', 'note'],
    flags: [],
  },
  ack: {
    summary: 'owner: ack a task checkpoint and release the branch (signed)',
    values: ['number', 'ssh-key', 'note'],
    flags: [],
  },
  close: {
    summary: 'owner: close a submitted session (AWAITING-USER -> COMPLETED)',
    values: ['ssh-key'],
    flags: [],
  },
  abandon: {
    summary: 'owner: stop an unfinished session (ACTIVE -> ABANDONED)',
    values: ['ssh-key', 'reason'],
    flags: [],
  },
  seal: {
    summary: 'owner-seal a COMPLETED session with an SSH signature',
    values: ['session', 'instruction', 'ssh-key', 'outcome', 'summary'],
    flags: [],
  },
  reopen: {
    summary: 'owner-reopen a CLOSED session, signed with the owner key',
    values: ['session', 'ssh-key', 'reason', 'delta'],
    flags: [],
  },
  status: { summary: 'what the state machine thinks right now', values: [], flags: [] },
  verify: { summary: 'verify every seal and reopen offline', values: [], flags: [] },
  check: {
    summary: 'run an enforcement gate: start | close | sessions | all',
    values: ['gate', 'cwd'],
    flags: [],
  },
  'init-authority': {
    summary: 'write state/macp/allowed_signers from five public keys (owner, once)',
    values: ['dir', 'cwd'],
    flags: ['force'],
  },
  'init-repo': {
    summary: 'scaffold state/ and install the guard',
    values: ['cwd'],
    flags: ['force'],
  },
  'install-hooks': {
    summary: 'install the pre-tool guard for one harness',
    values: ['harness', 'home'],
    flags: ['write'],
  },
};

const camel = (value) => value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

function parse(argv, spec) {
  const out = { _: [] };
  const multi = new Set(spec.multi ?? []);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const [rawKey, inline] = token.slice(2).split('=');
    const key = camel(rawKey);
    const isFlag = (spec.flags ?? []).includes(rawKey);
    const value = inline ?? (isFlag ? true : argv[(i += 1)]);
    if (multi.has(rawKey)) {
      (out[key] ??= []).push(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function usage() {
  const lines = ['macp — Multi-Agent Coordination Protocol runtime', '', 'Commands:'];
  for (const [name, spec] of Object.entries(COMMANDS)) {
    lines.push(`  ${name.padEnd(15)} ${spec.summary}`);
  }
  lines.push(
    '',
    'The state machine: UNBOUND → ACTIVE → CLOSING → COMPLETED → CLOSED → REOPENED',
    'Mid-session, per task: ACTIVE → AWAITING-CHECKPOINT (agent stops) → ACTIVE (owner acks)',
    'Read docs/PROTOCOL.md §4D before the first use.',
    '',
    `Backends: MACP_BACKEND=local (default) | jarvis (+ MACP_JARVIS_URL).`,
    `JARVIS routes: ${Object.values(JARVIS_ROUTES).join(' · ')}`,
  );
  return lines.join('\n');
}

function request(name, args) {
  const base = { root: process.cwd() };
  switch (name) {
    case 'start':
      return {
        ...base,
        agent: args.agent,
        agentName: args.agentName ?? args.harness ?? 'agent',
        harness: args.harness,
        branch: args.branch,
        task: args.task,
        plan: args.plan,
        planFile: args.planFile,
        authorizedBy: args.authorizedBy,
        id: args.id,
        history: args.history,
        claims: args.claims,
        brief: args.noBrief !== true,
        limit: args.limit ? Number.parseInt(args.limit, 10) : undefined,
      };
    case 'log':
      return {
        type: args.type,
        summary: args.summary,
        files: (args.files ?? '').split(',').filter(Boolean),
        session: args.session,
      };
    case 'queue':
      return { done: args.done };
    case 'checkpoint':
      return { task: args.task, note: args.note };
    case 'ack':
      return { number: args._[0] ?? args.number, sshKey: args.sshKey, note: args.note };
    case 'submit':
      return {
        prepare: args.prepare === true,
        runGates: args.noGates !== true,
        gates: args.gates ? String(args.gates).split(',').filter(Boolean) : undefined,
        outcome: args.outcome,
        completed: args.completed ?? [],
        remaining: args.remaining ?? [],
        discovered: args.discovered ?? [],
        deferred: args.deferred ?? [],
        traps: args.traps ?? [],
        next: args.next,
        requiredContext: args.requiredContext ?? [],
      };
    case 'close':
      return { sshKey: args.sshKey };
    case 'abandon':
      return { sshKey: args.sshKey, reason: args.reason };
    case 'seal':
      return {
        session: args.session,
        instruction: args.instruction,
        sshKey: args.sshKey ?? `${process.env.HOME}/.ssh/id_ed25519`,
        outcome: args.outcome,
        summary: args.summary,
      };
    case 'reopen':
      return {
        session: args.session,
        sshKey: args.sshKey ?? `${process.env.HOME}/.ssh/id_ed25519`,
        reason: args.reason,
        delta: args.delta,
      };
    case 'init-authority':
      return { dir: args.dir, cwd: args.cwd, force: args.force === true };
    case 'init-repo':
      return { cwd: args.cwd, force: args.force === true };
    case 'install-hooks':
      return { harness: args.harness, write: args.write === true, home: args.home };
    case 'check':
      return { gate: args.gate ?? 'all', cwd: args.cwd };
    default:
      return {};
  }
}

function validate(name, args) {
  // `start` is the one command whose required set depends on a flag: the scope
  // arrives either as prose (`--task`) or as a plan item (`--plan`), never both.
  if (name === 'start') {
    if (args.plan && args.task) {
      return (
        'pass --task or --plan, not both — with --plan the item in the plan document is the ' +
        'scope, and a --task alongside it is a second version of the same claim'
      );
    }
    const missing = ['agent', 'harness', 'authorizedBy'].filter((key) => !args[key]);
    if (!args.plan && !args.task) missing.push('task (or --plan <id>)');
    return missing.length === 0
      ? null
      : `missing required flag(s): ${missing.map((key) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`).join(', ')}`;
  }

  const required = {
    start: ['agent', 'harness', 'task', 'authorizedBy'],
    log: ['type', 'summary'],
    checkpoint: ['task'],
    ack: ['sshKey'],
    abandon: ['sshKey', 'reason'],
    seal: ['session', 'instruction'],
    reopen: ['session', 'reason', 'delta'],
    'install-hooks': ['harness'],
  }[name];
  if (!required) return null;
  if (name === 'ack' && !args._[0] && !args.number) {
    return 'missing the checkpoint number: `macp ack <n> --ssh-key <key>`';
  }
  const missing = required.filter((key) => !args[key]);
  return missing.length === 0
    ? null
    : `missing required flag(s): ${missing.map((key) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`).join(', ')}`;
}

async function main(rawArgv) {
  const argv = rawArgv[0] === '--' ? rawArgv.slice(1) : rawArgv;
  const [name, ...rest] = argv;
  if (!name || name === '--help' || name === '-h' || name === 'help') {
    console.log(usage());
    return 0;
  }
  const spec = COMMANDS[name];
  if (!spec) {
    console.error(`macp: unknown command "${name}"\n\n${usage()}`);
    return 2;
  }

  const args = parse(rest, spec);
  const problem = validate(name, args);
  if (problem) {
    console.error(`macp ${name}: ${problem}`);
    return 2;
  }

  if (name === 'init-authority') {
    const result = initAuthority(request(name, args));
    console.log(result.out);
    return result.code;
  }
  if (name === 'init-repo') {
    const result = initRepo(request(name, args));
    console.log(result.out);
    return result.code;
  }
  if (name === 'install-hooks') {
    const result = installHooks(request(name, args));
    console.log(result.out);
    return result.code;
  }
  if (name === 'check') {
    return runCheck(request(name, args));
  }

  const backend = createBackend();
  const method = name === 'queue' ? 'queue' : name;
  if (typeof backend[method] !== 'function') {
    console.error(`macp: the ${backend.constructor.name} does not implement ${name}`);
    return 2;
  }

  const result = await backend[method](request(name, args));
  const text = result.out ?? '';
  if (result.code === 0) {
    if (text) console.log(text);
  } else if (text) {
    console.error(text);
  }
  return result.code ?? 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(`macp: ${error.message}`);
    process.exit(1);
  },
);
