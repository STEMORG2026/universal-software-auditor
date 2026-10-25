/**
 * The startup brief.
 *
 * Its job is to put the handoff into the agent's context window before the
 * agent has a chance to skip it. `AGENTS.md` asked for that in prose and the
 * prose lost, so the brief is printed by the command that also creates the
 * session: an agent that skipped the read did not run `macp start`, and an
 * agent that did run it has the text in its transcript whether it wanted it or
 * not.
 *
 * Sections are bounded. A handoff is allowed to be long; a brief that scrolls
 * a thousand lines teaches the agent to skim, which is the failure it exists to
 * prevent.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { section } from './session.mjs';
import { REGION_BEGIN, REGION_END } from './handoff.mjs';

const DEFAULT_SECTION_LINES = 60;

function readState(root, name) {
  const file = path.join(root, 'state', name);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function bounded(body, limit) {
  const lines = body.trimEnd().split('\n');
  if (limit <= 0 || lines.length <= limit) return lines.join('\n');
  return `${lines.slice(0, limit).join('\n')}\n… ${lines.length - limit} more lines — read the file.`;
}

/** Pull one `## <title>` out of CONTINUATION.md, bounded. */
export function continuationSection(root, title, limit = DEFAULT_SECTION_LINES) {
  const text = readState(root, 'CONTINUATION.md');
  if (!text) return null;
  const body = section(text, title);
  return body ? bounded(body.replace(/^## .*\n?/, ''), limit) : null;
}

/**
 * The machine-written handoff region at the top of CONTINUATION.md.
 *
 * `macp close` writes `## Handoff — <id>`, while this brief used to read
 * `## READ THIS FIRST` — a heading nothing writes. The audit's F-12: the handoff
 * existed, was never printed, and a fresh repository showed "Nothing yet"
 * forever. READ THIS FIRST is now the fallback, not the source.
 */
export function handoffRegion(root, limit = DEFAULT_SECTION_LINES) {
  const text = readState(root, 'CONTINUATION.md');
  if (!text) return null;
  const begin = text.indexOf(REGION_BEGIN);
  if (begin === -1) return null;
  const end = text.indexOf(REGION_END, begin);
  const body = end === -1 ? text.slice(begin) : text.slice(begin, end + REGION_END.length);
  const stripped = body
    .replace(new RegExp(`^${REGION_BEGIN}\\s*`), '')
    .replace(new RegExp(`\\s*${REGION_END}$`), '');
  return bounded(stripped, limit);
}

/** Unchecked queue entries — the `BUG_FOUND` / `DEFERRED` backlog. */
export function openQueueItems(root) {
  const file = path.join(root, 'state', 'macp', 'queue.md');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => /^- \[ \] /.test(line))
    .map((line) => line.replace(/^- \[ \] /, ''));
}

export function activeBlockers(root) {
  const text = readState(root, 'BLOCKERS.md');
  if (!text) return [];
  return text
    .split('\n')
    .filter((line) => /^\|\s*`?B\d|^\*\*B\d|^- \*\*B\d/.test(line) || /NEEDS HUMAN/.test(line))
    .slice(0, 12);
}

/**
 * The whole brief as one string. Sections are ordered by what an agent must
 * know first, not by where they live in the file.
 */
export function buildBrief({
  root,
  branch,
  baseCommit,
  sessionId,
  task,
  authorizedBy,
  machine = {},
  limit = DEFAULT_SECTION_LINES,
}) {
  const out = [];
  const rule = '─'.repeat(72);

  out.push(rule);
  out.push(`MACP BRIEF — ${sessionId} · ${branch} · base ${baseCommit}`);
  out.push(rule);
  out.push('');

  out.push('## Machine facts (measured now, not claimed)');
  for (const [key, value] of Object.entries(machine)) {
    if (value !== undefined && value !== null && value !== '') out.push(`- ${key}: ${value}`);
  }
  out.push('');

  out.push('## Authorized scope (this session, nothing else)');
  out.push(`- task: ${task}`);
  out.push(`- authorized by: ${authorizedBy}`);
  out.push('');

  const handoff = handoffRegion(root, Math.max(limit, 90));
  if (handoff) {
    out.push('## state/CONTINUATION.md — the previous handoff (machine-stamped)');
    out.push(handoff);
    out.push('');
  }

  const readFirst = continuationSection(root, 'READ THIS FIRST', limit);
  if (readFirst) {
    out.push('## state/CONTINUATION.md — READ THIS FIRST');
    out.push(readFirst);
    out.push('');
  }

  const checkpoint = continuationSection(root, 'CHECKPOINT', Math.min(limit, 30));
  if (checkpoint) {
    out.push('## CHECKPOINT');
    out.push(checkpoint);
    out.push('');
  }

  const next = continuationSection(root, '13. Next steps', Math.min(limit, 40));
  if (next) {
    out.push('## 13. Next steps');
    out.push(next);
    out.push('');
  }

  const blockers = activeBlockers(root);
  if (blockers.length > 0) {
    out.push('## Blockers');
    out.push(...blockers);
    out.push('');
  }

  const queue = openQueueItems(root);
  if (queue.length > 0) {
    out.push(`## Open discoveries and deferred work (${queue.length})`);
    out.push(...queue.slice(0, 25).map((item) => `- ${item}`));
    if (queue.length > 25) out.push(`… ${queue.length - 25} more in state/macp/queue.md`);
    out.push('');
  }

  out.push(rule);
  out.push(`Brief complete. Scope is above; anything else is a new session.`);
  out.push(rule);
  return `${out.join('\n')}\n`;
}
