/**
 * Mid-session events and the queue they feed.
 *
 * A worker knows things the git history will never show: that a library is
 * broken, that an approach was abandoned, that a bug exists three files away
 * from the authorised task. Without somewhere to put them, the agent either
 * fixes them (scope creep) or forgets them (silent loss). `macp log` is that
 * place, and `BUG_FOUND` / `DEFERRED` also land in the queue that the next
 * `macp start` prints.
 */
import { readFileSync } from 'node:fs';
import { currentBranch, repoId, repoRoot, writeText } from './repo.mjs';
import {
  STATUS,
  activeSessionForBranch,
  appendToSection,
  field,
  listSessions,
  section,
} from './session.mjs';
import { getLease } from './lease.mjs';
import { appendQueue, ensureQueue, resolveQueue } from './statefiles.mjs';
import { isoLocal } from './lifecycle.mjs';

export const LOG_TYPES = Object.freeze([
  'DISCOVERY',
  'DECISION',
  'PIVOT',
  'BUG_FOUND',
  'DEFERRED',
  'BLOCKER',
  'COORDINATION',
  'SCOPE_EXPANSION',
]);

/** Types that also belong in the durable queue, not only in this session. */
export const QUEUE_TYPES = Object.freeze(['BUG_FOUND', 'DEFERRED']);

function requireSession(root, branch, wanted) {
  const active = activeSessionForBranch(root, branch);
  if (active) return active;
  if (!wanted) return null;
  return listSessions(root).find((session) => session.id === wanted) ?? null;
}

export function log(options) {
  const root = repoRoot();
  if (!root) return { code: 2, out: 'not inside a git repository' };
  const branch = currentBranch(root);

  if (!LOG_TYPES.includes(options.type)) {
    return { code: 2, out: `--type must be one of ${LOG_TYPES.join(', ')}` };
  }

  const session = requireSession(root, branch, options.session);
  if (!session) {
    return {
      code: 1,
      out: `no active session on ${branch}. \`macp log\` records work in a session; there is none.`,
    };
  }

  // An active session is not enough — this machine must have started it.
  // Otherwise a log line is a claim that the session is live when it is not.
  const lease = getLease(root, repoId(root), branch);
  const live = lease && (lease.state === 'ACTIVE' || lease.state === 'CLOSING');
  if (!live && session.status !== STATUS.COMPLETED) {
    return {
      code: 1,
      out:
        `no lease for ${branch} on this machine. The session file exists, but \`macp start\` never ` +
        'ran here. Run it, then log.',
    };
  }

  const at = isoLocal().slice(11, 16);
  const files = options.files.length > 0 ? ` — files: ${options.files.join(', ')}` : '';
  const entry = `- ${at} [${options.type}] ${options.summary}${files}`;
  writeText(session.file, appendToSection(readFileSync(session.file, 'utf8'), 'Log', entry));

  let queued = null;
  if (QUEUE_TYPES.includes(options.type)) {
    ensureQueue(root);
    queued = appendQueue(root, {
      type: options.type,
      summary: options.summary,
      files: options.files,
      session: session.id,
      date: isoLocal().slice(0, 10),
    });
  }

  return {
    code: 0,
    out:
      `logged [${options.type}] in ${session.id}` +
      (queued
        ? `\n  queue: ${queued.duplicate ? 'already present' : `${queued.id} added to state/macp/queue.md`}`
        : ''),
  };
}

export function queue(options) {
  const root = repoRoot();
  if (!root) return { code: 2, out: 'not inside a git repository' };
  ensureQueue(root);

  if (options.done) {
    const resolved = resolveQueue(root, options.done);
    return resolved
      ? { code: 0, out: `${options.done} moved to Done` }
      : { code: 1, out: `no open entry ${options.done}` };
  }

  const text = readFileSync(`${root}/state/macp/queue.md`, 'utf8');
  const open = section(text, 'Open') ?? '';
  const lines = open.split('\n').filter((line) => /^- \[ \] /.test(line));
  if (lines.length === 0) return { code: 0, out: 'queue: empty' };
  return { code: 0, out: `queue: ${lines.length} open\n${lines.join('\n')}` };
}

/** `macp status` — what the state machine thinks, stated as measured facts. */
export function status() {
  const root = repoRoot();
  if (!root) return { code: 2, out: 'not inside a git repository' };
  const branch = currentBranch(root);
  const session = activeSessionForBranch(root, branch);
  const lease = getLease(root, repoId(root), branch);

  const lines = [
    `branch:  ${branch}`,
    `session: ${session ? `${session.id} (${session.status})` : 'none'}`,
    `lease:   ${lease ? `${lease.state} since ${lease.startedAt}` : 'none'}`,
    `mode:    ${session && lease ? 'ACTIVE' : 'UNBOUND'}`,
  ];
  if (session) {
    lines.push(
      `task:    ${field(session.text, 'Branch') ? '' : ''}${section(session.text, 'Objective')?.split('\n')[2]?.trim() ?? ''}`,
    );
  }
  return { code: 0, out: lines.join('\n') };
}
