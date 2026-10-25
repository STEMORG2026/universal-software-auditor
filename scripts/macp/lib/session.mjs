/**
 * Session records: parse, query, render.
 *
 * A session file is a claim by an agent. This module reads it and writes it;
 * it does not decide whether the claim is true. That decision belongs to the
 * gates (`check-session-start.mjs`, `check-sessions.mjs`) and to `git`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const STATUS = Object.freeze({
  IN_PROGRESS: 'IN-PROGRESS',
  /**
   * The agent has finished and reported. Work is over, verification is recorded,
   * and the session now waits for the owner. It is deliberately NOT an active
   * status: the agent may not mutate the tree from here, and it may not leave
   * this state either — only the owner's `macp close` does.
   *
   * Hyphenated to match the vocabulary the files already use (`IN-PROGRESS`),
   * while the prose name is `AWAITING_USER`.
   */
  AWAITING_USER: 'AWAITING-USER',
  /** Abandoned by the owner: the work stopped, and the record says so. */
  ABANDONED: 'ABANDONED',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
});

/** Statuses in which a session may legally mutate the tree. */
export const ACTIVE_STATUSES = Object.freeze([STATUS.IN_PROGRESS, STATUS.REOPENED]);

/**
 * Statuses from which the agent may not record further work.
 *
 * `AWAITING_USER` is here because the agent has stopped; `COMPLETED` and
 * `CLOSED` because the owner has acted on it.
 */
export const TERMINAL_STATUSES = Object.freeze([
  STATUS.AWAITING_USER,
  STATUS.ABANDONED,
  STATUS.COMPLETED,
  STATUS.CLOSED,
]);

export const REQUIRED_FIELDS = Object.freeze([
  'Agent',
  'Harness',
  'History',
  'Branch',
  'Started',
  'Status',
  'Base commit',
]);

export function sessionsDir(root) {
  return path.join(root, 'state', 'sessions');
}

/** `**Name:** value` from anywhere in the file, or null. */
export function field(text, name) {
  const match = text.match(new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

/** The status token, without any parenthetical or trailing prose. */
export function statusOf(text) {
  const raw = field(text, 'Status');
  return raw ? raw.split(/[ (]/)[0] : null;
}

/** Body of a `## <title>` section up to the next `## `, or null. */
export function section(text, title) {
  const start = text.search(new RegExp(`^## ${title}\\s*$`, 'm'));
  if (start === -1) return null;
  const rest = text.slice(start);
  const end = rest.slice(3).search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end + 3);
}

/**
 * Branches named by a `**Branch:**` field.
 *
 * The field is prose in practice — `feat/x`, `` `feat/x`, `docs/y` ``, and
 * "master (merge-out; no feature branch of its own)" all occur. Split on
 * commas, strip backticks and parentheticals, and drop the sentinel.
 */
export function branchesNamed(text) {
  const raw = field(text, 'Branch');
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.replace(/`/g, '').split(/[(\s]/)[0].trim())
    .filter((part) => part && part !== 'master');
}

export function sessionFiles(root) {
  const dir = sessionsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => path.join(dir, name));
}

/** `SA12` from `20261024-1840-SA12-macp-runtime-v2.md`. */
export function idFromFile(file) {
  return path.basename(file).split('-')[2] ?? path.basename(file);
}

export function readSession(file) {
  const text = readFileSync(file, 'utf8');
  return {
    file,
    id: idFromFile(file),
    text,
    status: statusOf(text),
    agent: field(text, 'Agent'),
    harness: field(text, 'Harness'),
    branches: branchesNamed(text),
  };
}

export function listSessions(root) {
  return sessionFiles(root).map(readSession);
}

/** Sessions whose `**Branch:**` names `branch`, newest first. */
export function sessionsForBranch(root, branch) {
  return listSessions(root)
    .filter((session) => session.branches.includes(branch))
    .reverse();
}

/** The session that owns `branch` and may currently mutate the tree, if any. */
export function activeSessionForBranch(root, branch) {
  return sessionsForBranch(root, branch).find((s) => ACTIVE_STATUSES.includes(s.status)) ?? null;
}

export function activeSessions(root) {
  return listSessions(root).filter((session) => ACTIVE_STATUSES.includes(session.status));
}

/** Next free `SA<n>` id. Existing ids are the only input — no counter file. */
export function nextSessionId(root) {
  const used = listSessions(root)
    .map((session) => /^([A-Z]{2})(\d+)$/.exec(session.id))
    .filter(Boolean)
    .map((match) => ({ prefix: match[1], n: Number.parseInt(match[2], 10) }));
  const prefix = used.length > 0 ? used[used.length - 1].prefix : 'SA';
  const highest = used.reduce(
    (max, entry) => (entry.prefix === prefix ? Math.max(max, entry.n) : max),
    0,
  );
  return `${prefix}${String(highest + 1).padStart(2, '0')}`;
}

/**
 * `20261024-1840-SA12-slug.md` — lexical order is chronological order.
 *
 * Parsed from the ISO stamp rather than stripped from it: a `replace` over the
 * separators silently ate the time component, and the gate that picks "the
 * latest session" by filename then had nothing to sort on.
 */
export function sessionFileName({ id, slug, at }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(at);
  const stamp = match
    ? `${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}`
    : '00000000-0000';
  return `${stamp}-${id}-${slug}.md`;
}

/** `SA12` is an id, and so is `T01`; `Sathi` is not. */
export function looksLikeId(value) {
  return /^[A-Z]{1,4}\d{1,3}$/.test(value ?? '');
}

export function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'session'
  );
}

export function renderSession(fields) {
  const lines = [
    `**Agent:** ${fields.agent} (${fields.agentName ?? 'agent'})`,
    `**Harness:** ${fields.harness}`,
    `**History:** ${fields.history ?? 'not exported — the transcript lives in the harness, not the repo'}`,
    `**Branch:** ${fields.branch}`,
    `**Started:** ${fields.started}`,
    `**Status:** ${fields.status ?? STATUS.IN_PROGRESS}`,
    `**Base commit:** ${fields.baseCommit}`,
    '',
    `# Session ${fields.id} — ${fields.title}`,
    '',
    '## Objective',
    '',
    fields.task,
    '',
    '## Authorized scope',
    '',
    `> ${fields.authorizedBy.replace(/\n/g, '\n> ')}`,
    '',
    '## Log',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

/** Replace the status token in place. Throws when the field is absent. */
export function withStatus(text, status) {
  if (!/^\*\*Status:\*\*/m.test(text)) throw new Error('session file has no **Status:** field');
  return text.replace(/^\*\*Status:\*\*[ \t]*.*$/m, `**Status:** ${status}`);
}

/**
 * Append under `## <title>`, creating the section at the end when absent.
 *
 * Appending at the end rather than inserting before `## Outcome` is
 * deliberate: `## Outcome` is agent prose and its position is not a contract.
 */
export function appendToSection(text, title, body) {
  const existing = section(text, title);
  if (existing === null) return `${text.replace(/\s*$/, '')}\n\n## ${title}\n\n${body}\n`;
  const start = text.search(new RegExp(`^## ${title}\\s*$`, 'm'));
  const after = text.slice(start);
  const end = after.slice(3).search(/^## /m);
  const insertAt = end === -1 ? text.length : start + end + 3;
  const head = text.slice(0, insertAt).replace(/\s*$/, '');
  const tail = text.slice(insertAt);
  return `${head}\n\n${body}\n${tail}`;
}
