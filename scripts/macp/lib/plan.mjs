/**
 * Plan items — the unit of authorised scope.
 *
 * `macp start --task "…"` takes the session's objective from whoever typed the
 * flag, which is the agent. The plan is the other way round: the owner wrote
 * the items, the owner maintains their status, and an item's body already says
 * what finishing it means. This module turns one row of that document into a
 * session's objective, so the scope is *read* rather than restated.
 *
 * It parses; it does not judge. Whether an id may be opened is decided by
 * `resolvePlanItem`, from the status column — the one place a phase's state is
 * recorded, so a delivered item cannot become work again by being asked for.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Where a repository keeps its plan, relative to its root. */
export const DEFAULT_PLAN_FILE = path.join('docs', 'remediation-plan.md');

/**
 * The only status a session may be opened against.
 *
 * `partial` is deliberately excluded alongside `delivered`: a half-finished
 * phase has no agreed remainder, so opening a session against it would let the
 * agent pick the remainder silently — which is the defect the flag exists to
 * close, one level up.
 */
export const STARTABLE = Object.freeze(['pending']);

/** `P7`, `P0`, `PH12`. A finding (`F-01`) or a test (`T-02a`) is not a plan item. */
const ID = /^[A-Z]{1,4}\d{1,3}$/;

function clean(cell) {
  return (cell ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();
}

/** Split a markdown table row into cells, dropping the outer pipes. */
function cells(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map(clean);
}

/** `delivered · #271` → `delivered`; `**pending**` → `pending`. */
function statusWord(cell) {
  const match = /^[A-Za-z][A-Za-z-]*/.exec(cell ?? '');
  return match ? match[0].toLowerCase() : '';
}

/**
 * The body of the `### <id>` section, up to the next `##`/`###`, minus a
 * trailing rule.
 *
 * The body is the scope. A row without one is a status with nothing behind it,
 * and `resolvePlanItem` refuses it rather than inventing an objective.
 */
function sectionBody(text, id) {
  const heading = new RegExp(`^###\\s+${id}\\b[^\\n]*$`, 'm');
  const match = heading.exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  const end = rest.search(/^#{2,3}\s/m);
  const body = (end === -1 ? rest : rest.slice(0, end)).trim();
  return body.replace(/\n+-{3,}\s*$/, '').trim() || null;
}

/**
 * Every item row in the document, with the section that carries it.
 *
 * A row qualifies when **both** hold:
 *
 *   1. it belongs to a table with a `Status` column — that column *is* the
 *      contract, and it is what distinguishes a plan item from the findings
 *      table (`F-01`), the decision table (`D1`) and the test matrix (`T-02a`)
 *      in the same document; and
 *   2. its first cell is a bare id (`P7`), so a prose row in a status table is
 *      not silently adopted.
 *
 * The `Status` column alone would still admit a `D1` row in a decisions table
 * that grew one. That case is not guessed at: two rows with the same id are
 * refused as ambiguous by `resolvePlanItem`, so a collision is an error rather
 * than a merged scope.
 *
 * Order is document order, which is dependency order.
 */
export function parsePlan(text) {
  const items = [];
  let header = null; // header cells of the table we are inside, once known
  let previous = null; // the last row seen, which is the header if a rule follows

  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trimStart().startsWith('|')) {
      header = null;
      previous = null;
      continue;
    }
    const row = cells(line);
    if (row.length > 0 && row.every((cell) => /^:?-{2,}:?$/.test(cell))) {
      header = previous; // the row above the rule is this table's header
      previous = null;
      continue;
    }
    if (header === null) {
      previous = row;
      continue;
    }
    if (row.length < 3 || !ID.test(row[0])) continue;
    if (!header.some((cell) => /^status$/i.test(cell))) continue;
    items.push({
      id: row[0],
      title: row[1],
      findings: row[2],
      status: statusWord(row[3]),
      statusText: row[3] ?? '',
      line: index + 1,
    });
  }
  for (const item of items) item.body = sectionBody(text, item.id);
  return items;
}

/**
 * Resolve `--plan <id>` against a repository's plan document.
 *
 * Returns `{ item }` or `{ error }`. The error is written to be acted on: it
 * names the file, what was asked for, and what would have worked.
 */
export function resolvePlanItem(root, id, { file } = {}) {
  const rel = (file ?? DEFAULT_PLAN_FILE).split(path.sep).join('/');
  const target = path.resolve(root, file ?? DEFAULT_PLAN_FILE);
  if (!existsSync(target)) {
    return {
      error:
        `no plan at ${rel} — pass --plan-file <path>, or write the plan before ` +
        'binding a session to it',
    };
  }

  const text = readFileSync(target, 'utf8');
  const wanted = String(id ?? '')
    .trim()
    .toUpperCase();
  const items = parsePlan(text);
  const matches = items.filter((item) => item.id === wanted);

  if (matches.length === 0) {
    const known = items.map((item) => `${item.id} (${item.status})`).join(', ') || 'none';
    return {
      error: `no plan item "${id}" in ${rel} — items there: ${known}`,
    };
  }
  if (matches.length > 1) {
    return {
      error:
        `${rel} lists ${wanted} ${matches.length} times (lines ` +
        `${matches.map((item) => item.line).join(', ')}) — one row per item, or its status is ` +
        'ambiguous and a session cannot be scoped from it',
    };
  }

  const [item] = matches;
  if (!STARTABLE.includes(item.status)) {
    const open = items.filter((entry) => STARTABLE.includes(entry.status)).map((e) => e.id);
    return {
      error:
        `${wanted} is "${item.statusText || item.status}" — a session may only be opened ` +
        `against ${STARTABLE.join('/')} work, so ${wanted} cannot be adopted as a scope. ` +
        `Open items: ${open.join(', ') || 'none'}.`,
    };
  }
  if (!item.body) {
    return {
      error:
        `${wanted} has a status row but no \`### ${wanted}\` section in ${rel}, so there is no ` +
        'scope to adopt — the row and the section are one item, not two',
    };
  }

  return {
    item: {
      id: item.id,
      title: item.title || item.id,
      findings: item.findings,
      status: item.status,
      body: item.body,
      file: rel,
      // The plan as it stood when the session was scoped. A later edit to the
      // document is then visible as a difference rather than as a silent
      // redefinition of what the session was authorised to do.
      sha: createHash('sha256').update(text).digest('hex').slice(0, 12),
    },
  };
}
