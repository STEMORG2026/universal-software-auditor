#!/usr/bin/env node
/**
 * The pre-work guard: one portable script every harness adapter calls.
 *
 * WHY A SEPARATE PROCESS. Each harness exposes a different hook shape — Claude
 * Code pipes JSON on stdin and treats exit 2 as a block, OpenCode calls
 * `tool.execute.before` and blocks by throwing, Hermes registers a Python
 * `pre_tool_call` returning `{action: "block"}`, DSH runs a shell hook. Four
 * adapters, one decision. Keeping the decision in a script means the rule is
 * written once and cannot drift between harnesses.
 *
 * WHAT IT REFUSES. In `UNBOUND` mode — no lease for this repository and branch
 * — read-only recon is allowed and anything that mutates the tree is refused.
 * That is the difference between asking a question and starting work, and it is
 * the difference that keeps a casual Q&A from leaving a junk session behind.
 *
 * WHAT IT IS NOT. Not a sandbox. The mutating-command list is a heuristic: it
 * catches `rm`, `git commit`, `sed -i`, a redirect into a file, and the obvious
 * neighbours, and it will miss a determined agent's `node -e "…"`. It exists so
 * the normal path is the authorised one, not so the abnormal path is
 * impossible. `check-session-start.mjs` is the structural gate behind it.
 *
 * EXIT CODES: 0 allow · 2 block (stderr is the explanation the harness shows
 * the agent) · 1 internal error, which fails closed.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MUTATING_TOOLS = new Set([
  'edit',
  'write',
  'multiedit',
  'notebookedit',
  'apply_patch',
  'str_replace_editor',
  'create_file',
  'write_file',
  'patch',
  'skill_manage',
]);

/**
 * Commands that change the tree. Ordered roughly by how often an agent reaches
 * for them first. `>` is handled separately because `2>/dev/null` writes
 * nothing that matters.
 */
const MUTATING_COMMANDS = [
  /\brm\b/,
  /\brmdir\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bmkdir\b/,
  /\btouch\b/,
  /\btee\b/,
  /\bdd\b/,
  /\btruncate\b/,
  /\bln\s+-s/,
  /\bgit\s+(add|commit|push|merge|rebase|reset|checkout|switch|stash|apply|clean|tag|rm|mv|cherry-pick|revert)\b/,
  /\b(npm|pnpm|yarn)\s+(i|install|add|remove|uninstall|dlx|exec)\b/,
  /\bpip3?\s+install\b/,
  /\bsed\s+-i/,
  /\bperl\s+-i/,
  /\bpatch\s+-p/,
  />>?\s*(?!\/dev\/null)\S/,
];

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/** Normalise the four harness input shapes into `{tool, args, cwd}`. */
export function normalise(input) {
  const tool = input.tool_name ?? input.tool ?? input.name ?? '';
  const args = input.tool_input ?? input.args ?? input.arguments ?? {};
  const cwd = input.cwd ?? input.directory ?? args.cwd ?? process.cwd();
  return { tool: String(tool), args: args ?? {}, cwd: String(cwd) };
}

function commandOf(args) {
  if (typeof args === 'string') return args;
  return String(args.command ?? args.cmd ?? args.script ?? '');
}

/** The same identity derivation as `lib/repo.mjs`, kept inline so this file copies alone. */
export function repoIdOf(root) {
  const remote = git(root, ['remote', 'get-url', 'origin']);
  const identity = remote || path.resolve(root);
  const slug = identity
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .toLowerCase();
  return `${slug}-${createHash('sha256').update(identity).digest('hex').slice(0, 8)}`;
}

function leaseFor(root, branch, home) {
  // `MACP_HOME` first, because that is the variable the runtime and the gates
  // use to relocate the store. Reading only `~/.macp` here made the guard and
  // `check-session-start.mjs` disagree about where the lease lives whenever the
  // store was moved — the guard said UNBOUND while the gate said OK.
  const base = home ?? process.env.MACP_HOME ?? path.join(process.env.HOME ?? '~', '.macp');
  const store = path.join(base, 'leases');
  const file = path.join(store, `${repoIdOf(root)}.json`);
  if (!existsSync(file)) return { file, lease: null };
  try {
    return { file, lease: JSON.parse(readFileSync(file, 'utf8')).leases?.[branch] ?? null };
  } catch {
    return { file, lease: null };
  }
}

/**
 * Decide, with the reason attached. Exported so the adapters and the tests
 * share exactly one implementation of the rule.
 */
export function decide(input, { home } = {}) {
  const { tool, args, cwd } = normalise(input);
  const root = git(cwd, ['rev-parse', '--show-toplevel']);

  // Not a repository, or one that never adopted MACP: inert. The guard is
  // installed at user level across every project on the machine and must not
  // fight repositories that never asked for it.
  if (!root || !existsSync(path.join(root, 'state', 'sessions'))) {
    return { allow: true, reason: 'repository does not use MACP' };
  }

  const lower = tool.toLowerCase();
  const mutating =
    MUTATING_TOOLS.has(lower) ||
    ((lower === 'bash' || lower === 'shell') &&
      MUTATING_COMMANDS.some((re) => re.test(commandOf(args))));
  if (!mutating) return { allow: true, reason: 'read-only tool' };

  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const { file, lease } = leaseFor(root, branch, home);
  if (lease && (lease.state === 'ACTIVE' || lease.state === 'CLOSING')) {
    return { allow: true, reason: `session ${lease.session} holds the lease` };
  }

  return {
    allow: false,
    reason:
      `MACP is UNBOUND on ${branch}: no active session lease for this repository.\n` +
      'Read-only reconnaissance is allowed; editing and committing are not.\n\n' +
      'Start the session first:\n' +
      '  pnpm run macp -- start --agent <ID> --harness <name> --task "<the one piece of work>" \\\n' +
      '    --authorized-by "<the owner\'s instruction, verbatim>"\n\n' +
      `Lease expected at: ${file}\n` +
      'See docs/macp.md §4D. If the work is not authorised, ask the owner for a session.',
  };
}

function main() {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    let input = {};
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (raw) {
      try {
        input = JSON.parse(raw);
      } catch {
        process.stderr.write('macp-guard: stdin was not JSON; failing closed\n');
        process.exit(1);
      }
    }
    const verdict = decide(input);
    if (verdict.allow) process.exit(0);
    process.stderr.write(`macp-guard blocked this tool call.\n\n${verdict.reason}\n`);
    process.exit(2);
  });
}

if (process.argv[1] && path.basename(process.argv[1]) === 'pretool.mjs') main();
