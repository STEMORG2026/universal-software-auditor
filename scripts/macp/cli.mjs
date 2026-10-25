#!/usr/bin/env node
/**
 * `macp` — the MACP runtime.
 *
 * Usage: `pnpm run macp -- <command> [flags]`, or `node scripts/macp/cli.mjs`.
 *
 * The CLI is thin on purpose: it parses flags, builds one request object, and
 * hands it to a backend. All judgement lives in `lib/`, so the same commands
 * work against the local backend today and a JARVIS authority later without a
 * second implementation of any rule.
 */
import { createBackend, JARVIS_ROUTES } from './lib/backend.mjs';
import { initAuthority, initRepo, installHooks } from './lib/install.mjs';

const COMMANDS = {
  start: {
    summary: 'open a session: recon, brief, register, lease',
    values: [
      'agent',
      'harness',
      'branch',
      'task',
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
  close: {
    summary: 'owner: close a submitted session (AWAITING-USER -> COMPLETED)',
    values: ['ssh-key'],
    flags: [],
  },
  resume: {
    summary: 'owner: let a submitted session continue (AWAITING-USER -> ACTIVE)',
    values: ['ssh-key', 'reason'],
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
  'init-authority': {
    summary: 'write state/macp/allowed_signers from four public keys (owner, once)',
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
    'Read docs/macp.md §4D before the first use.',
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
    case 'resume':
      return { sshKey: args.sshKey, reason: args.reason };
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
    default:
      return {};
  }
}

function validate(name, args) {
  const required = {
    start: ['agent', 'harness', 'task', 'authorizedBy'],
    log: ['type', 'summary'],
    resume: ['sshKey', 'reason'],
    abandon: ['sshKey', 'reason'],
    seal: ['session', 'instruction'],
    reopen: ['session', 'reason', 'delta'],
    'install-hooks': ['harness'],
  }[name];
  if (!required) return null;
  const missing = required.filter((key) => !args[key]);
  return missing.length === 0
    ? null
    : `missing required flag(s): ${missing.map((key) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`).join(', ')}`;
}

async function main(rawArgv) {
  // `pnpm run macp -- start …` forwards the separator as an argument, and the
  // documented invocation is exactly that. Drop leading `--` tokens rather than
  // reporting `unknown command "--"`.
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
