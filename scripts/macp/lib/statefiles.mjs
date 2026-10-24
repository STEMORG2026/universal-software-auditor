/**
 * The two state files that must agree with the session files: `REGISTRY.md`
 * (who is active) and `INDEX.md` (the session table).
 *
 * They are edited here rather than by hand for one reason: `check-sessions.mjs`
 * fails when INDEX disagrees with a session file, and a hand edit is how they
 * came to disagree in the first place (HX04 read IN-PROGRESS for three weeks
 * while its file said COMPLETED).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeText } from './repo.mjs';

const ACTIVE_HEADING = '## Active Agents';

function file(root, name) {
  return path.join(root, 'state', name);
}

/** Body of `## Active Agents`, up to the next `## `. */
function activeBody(text) {
  const start = text.indexOf(ACTIVE_HEADING);
  if (start === -1) return null;
  const rest = text.slice(start + ACTIVE_HEADING.length);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}

function withActiveBody(text, body) {
  const start = text.indexOf(ACTIVE_HEADING);
  const rest = text.slice(start + ACTIVE_HEADING.length);
  const end = rest.search(/^## /m);
  const tail = end === -1 ? '' : rest.slice(end);
  return `${text.slice(0, start + ACTIVE_HEADING.length)}\n\n${body.trim()}\n\n${tail}`;
}

/**
 * Register an active agent, replacing any block with the same id.
 *
 * Blocks are delimited by `### <ID>` so a re-run of `macp start` on the same
 * branch is idempotent instead of stacking a second copy.
 */
export function upsertActiveAgent(root, entry) {
  const target = file(root, 'REGISTRY.md');
  if (!existsSync(target)) throw new Error('state/REGISTRY.md is missing');
  const text = readFileSync(target, 'utf8');
  const body = activeBody(text);
  if (body === null) throw new Error('state/REGISTRY.md has no "## Active Agents" section');

  const blocks = body
    .split(/^### /m)
    .filter((block) => block.trim() && !/^\**None\b/.test(block.trim()))
    .filter((block) => !block.startsWith(entry.id));

  const rendered = [
    `### ${entry.id}`,
    '',
    '| Field   | Value |',
    '| ------- | ----- |',
    `| Agent   | ${entry.agent} |`,
    `| Harness | ${entry.harness} |`,
    `| Branch  | \`${entry.branch}\` |`,
    `| Task    | ${entry.task} |`,
    `| Since   | ${entry.since} |`,
    `| Claims  | ${entry.claims} |`,
    '',
  ].join('\n');

  const next = [...blocks.map((block) => `### ${block.trim()}\n`), rendered].join('\n');
  writeText(target, withActiveBody(text, next));
}

/** Remove one agent; leaves `None.` when it was the last. */
export function removeActiveAgent(root, id) {
  const target = file(root, 'REGISTRY.md');
  if (!existsSync(target)) return;
  const text = readFileSync(target, 'utf8');
  const body = activeBody(text);
  if (body === null) return;

  const blocks = body
    .split(/^### /m)
    .filter((block) => block.trim() && !/^\**None\b/.test(block.trim()))
    .filter((block) => !block.startsWith(id));

  const next =
    blocks.length === 0
      ? '**None.** No session is open on this repository.'
      : blocks.map((block) => `### ${block.trim()}\n`).join('\n');
  writeText(target, withActiveBody(text, next));
}

function tableBounds(lines) {
  const headerAt = lines.findIndex((line) => line.startsWith('|') && /\|\s*Status\s*\|/.test(line));
  if (headerAt === -1) return null;
  let last = headerAt;
  for (let i = headerAt + 1; i < lines.length && lines[i].startsWith('|'); i += 1) last = i;
  return { headerAt, last };
}

function statusColumn(headerLine) {
  return headerLine.split('|').findIndex((cell) => cell.trim() === 'Status');
}

/** Insert or update the INDEX row for a session, keeping Status in sync. */
export function upsertIndexRow(root, row) {
  const target = file(root, 'INDEX.md');
  if (!existsSync(target)) throw new Error('state/INDEX.md is missing');
  const lines = readFileSync(target, 'utf8').split('\n');
  const bounds = tableBounds(lines);
  if (!bounds) throw new Error('state/INDEX.md has no table with a Status column');

  const at = statusColumn(lines[bounds.headerAt]);
  const rendered =
    `| \`${row.id}\` | ${row.date} | ${row.agent} | ${row.harness} | \`${row.branch}\` | ` +
    `${row.task} | ${row.status} | \`sessions/${row.file}\` |`;

  const existing = lines.findIndex(
    (line) => line.startsWith('|') && line.includes(`\`${row.id}\``),
  );
  if (existing !== -1) {
    const cells = lines[existing].split('|');
    cells[at] = ` ${row.status} `;
    lines[existing] = cells.join('|');
  } else {
    lines.splice(bounds.last + 1, 0, rendered);
  }
  writeText(target, `${lines.join('\n')}`);
}

export function setIndexStatus(root, id, status) {
  const target = file(root, 'INDEX.md');
  if (!existsSync(target)) return;
  const lines = readFileSync(target, 'utf8').split('\n');
  const bounds = tableBounds(lines);
  if (!bounds) return;
  const at = statusColumn(lines[bounds.headerAt]);
  const existing = lines.findIndex((line) => line.startsWith('|') && line.includes(`\`${id}\``));
  if (existing === -1) return;
  const cells = lines[existing].split('|');
  if ((cells[at] ?? '').trim() === status) return;
  cells[at] = ` ${status} `;
  lines[existing] = cells.join('|');
  writeText(target, lines.join('\n'));
}

const QUEUE_HEADER = `# MACP queue — discoveries and deferred work

Append-only. Every entry is a thing this repository decided not to do in the
session that found it. \`macp start\` prints the unchecked ones, so a discovery
survives the session that made it without derailing it.

Written by \`macp log --type BUG_FOUND|DEFERRED\`; closed by \`macp queue --done <id>\`.
`;

function queuePath(root) {
  return path.join(root, 'state', 'macp', 'queue.md');
}

/**
 * Render the whole file from its two lists.
 *
 * Written as a render rather than as string surgery because the previous
 * version appended a line directly after a heading, producing `## Open` with no
 * blank line beneath it — valid Markdown, but not what `prettier --check` wants,
 * so every `macp queue` left the tree failing `format:check`. A machine-written
 * file has to be a file the gates accept without a human running prettier.
 */
function renderQueue(open, done) {
  const section = (items) => (items.length === 0 ? '' : `\n${items.join('\n')}\n`);
  return `${QUEUE_HEADER}\n## Open\n${section(open)}\n## Done\n${section(done)}`;
}

function readQueue(text) {
  const openAt = text.indexOf('## Open');
  const doneAt = text.indexOf('## Done');
  const between = (from, to) =>
    text
      .slice(from, to)
      .split('\n')
      .filter((line) => line.startsWith('- ['))
      .map((line) => line.trimEnd());
  return {
    open:
      openAt === -1 ? [] : between(openAt + '## Open'.length, doneAt === -1 ? text.length : doneAt),
    done: doneAt === -1 ? [] : between(doneAt + '## Done'.length, text.length),
  };
}

export function ensureQueue(root) {
  const target = queuePath(root);
  if (existsSync(target)) return;
  writeText(target, renderQueue([], []));
}

/**
 * Append one entry, deduplicated by summary text.
 *
 * Deduplication is by content because the same bug is usually rediscovered by
 * the next session, and a queue that grows a duplicate per session is a queue
 * nobody reads.
 */
export function appendQueue(root, entry) {
  ensureQueue(root);
  const target = queuePath(root);
  const text = readFileSync(target, 'utf8');
  if (text.includes(entry.summary)) {
    const id = /`(Q\d+)`[^\n]*$/.exec(
      text.split('\n').find((line) => line.includes(entry.summary)) ?? '',
    )?.[1];
    return { id: id ?? null, duplicate: true };
  }

  const ids = [...text.matchAll(/`Q(\d+)`/g)].map((match) => Number.parseInt(match[1], 10));
  const id = `Q${String((ids.length > 0 ? Math.max(...ids) : 0) + 1).padStart(3, '0')}`;
  const files = entry.files.length > 0 ? ` — files: ${entry.files.join(', ')}` : '';
  const line = `- [ ] \`${id}\` ${entry.summary}${files} (${entry.type}, ${entry.session}, ${entry.date})`;

  const { open, done } = readQueue(text);
  writeText(target, renderQueue([...open, line], done));
  return { id, duplicate: false };
}

export function resolveQueue(root, id) {
  const target = queuePath(root);
  if (!existsSync(target)) return false;
  const text = readFileSync(target, 'utf8');
  const pattern = new RegExp(`^- \\[ \\] \`${id}\` (.*)$`, 'm');
  const match = pattern.exec(text);
  if (!match) return false;

  const { open, done } = readQueue(text);
  const moved = open
    .filter((line) => line.startsWith(`- [ ] \`${id}\``))
    .map((line) => line.replace('- [ ]', '- [x]'));
  writeText(
    target,
    renderQueue(
      open.filter((line) => !line.startsWith(`- [ ] \`${id}\``)),
      [...done, ...moved],
    ),
  );
  return true;
}
