#!/usr/bin/env node
/**
 * Session lifecycle gate — sessions are opened by the owner, sealed by the
 * owner, and immutable once sealed.
 *
 * WHY THIS EXISTS. MACP already had a start gate (`check-session-start.mjs`)
 * and a close gate (`check-protocol.mjs`), and between them the record still
 * drifted: `state/INDEX.md` listed HX04 as IN-PROGRESS for three weeks while
 * its own file said COMPLETED, and OC01 sat IN-PROGRESS since 2026-10-09 with
 * its work merged as #184. Both were invisible because nothing read the
 * sessions back against each other or against git.
 *
 * The rules this enforces, in the owner's words:
 *
 *   - a session solves ONE piece of work; new work is a new session and a new
 *     branch, never a continuation of a sealed one;
 *   - the agent does not create sessions — it records the one it was given;
 *   - closing is the owner's instruction, not the agent's convenience;
 *   - a closed session is sealed. Reopening requires an explicit owner
 *     instruction naming a passkey, and the passkey is recorded verbatim.
 *
 * THE PASSKEY IS AN AUDIT CONTROL, NOT A SECURITY CONTROL. These files are
 * writable by whoever holds the checkout, so no passkey can stop a determined
 * edit. What it does is make an unrequested reopen *visible*: the seal is
 * pinned to a commit, and any change to a sealed file is a diff someone can
 * read. Do not describe it as protection.
 *
 * Usage: node scripts/check-sessions.mjs
 * Exit 0 = every session is well-formed and consistent; 1 = findings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SESSIONS = path.join(ROOT, 'state', 'sessions');
const INDEX = path.join(ROOT, 'state', 'INDEX.md');
const REGISTRY = path.join(ROOT, 'state', 'REGISTRY.md');

const STATUSES = new Set(['IN-PROGRESS', 'AWAITING-USER', 'COMPLETED', 'CLOSED', 'REOPENED']);
const REQUIRED = ['Agent', 'Harness', 'History', 'Branch', 'Started', 'Status', 'Base commit'];

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** `**Field:** value` from the file's front matter, or null. */
function field(text, name) {
  const m = text.match(new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

/** The body of a `## <title>` section, up to the next `## `. */
function section(text, title) {
  const start = text.search(new RegExp(`^## ${title}\\s*$`, 'm'));
  if (start === -1) return null;
  const rest = text.slice(start);
  const end = rest.slice(3).search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end + 3);
}

function sessionFiles() {
  if (!fs.existsSync(SESSIONS)) return [];
  return fs
    .readdirSync(SESSIONS)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => path.join(SESSIONS, f));
}

function checkFile(file, findings) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, 'utf8');
  const id = path.basename(file).split('-')[2] ?? path.basename(file);

  for (const name of REQUIRED) {
    if (!field(text, name)) findings.push(`${rel}: missing **${name}:**`);
  }

  const status = field(text, 'Status');
  if (status && !STATUSES.has(status.split(/[ (]/)[0])) {
    findings.push(`${rel}: status "${status}" is not one of ${[...STATUSES].join(', ')}`);
  }

  // A sealed session is also the only state in which the file may not change.
  if (status?.startsWith('CLOSED')) {
    if (!field(text, 'Closed')) findings.push(`${rel}: CLOSED without a **Closed:** field`);
    const close = section(text, 'Close');
    if (!close) {
      findings.push(`${rel}: CLOSED without a "## Close" block`);
    } else {
      for (const need of ['Closed by', 'Closed at', 'Outcome', 'Passkey']) {
        if (!new RegExp(`\\*\\*${need}:\\*\\*`).test(close)) {
          findings.push(`${rel}: "## Close" is missing **${need}:**`);
        }
      }
    }
    // The seal: a CLOSED file must be byte-identical to the commit that closed
    // it. This is the check that makes "do not reopen" a fact rather than a
    // promise — an edit after sealing shows up here as a diff.
    //
    // An owner-authorised reopen re-pins the seal to the latest commit that
    // touched the file. The `-S` derivation assumes linear history and this repo
    // squash-merges: a reopen that flips CLOSED -> COMPLETED -> CLOSED on a branch
    // arrives as ONE commit on master, so the count of `**Status:** CLOSED` is
    // unchanged and `-S` still points at the original close, whose blob no longer
    // matches. Measured on SA11: the amendment landed as 23c8f2d and the gate
    // reported "edited after its seal at 8b8703b".
    //
    // This does not weaken the control. Per this file's own doctrine the passkey
    // is an audit control, not a security control — it makes an unrequested
    // reopen *visible*, and the `## Reopen` block is that visibility. An edit
    // with no reopen block, or one with no passkey, still fails.
    const reopenBlock = section(text, 'Reopen');
    const authorised = Boolean(reopenBlock) && /\*\*Passkey:\*\*\s*\S/.test(reopenBlock);

    let sealed;
    try {
      sealed = authorised
        ? git('log', '-1', '--format=%H', '--', rel).trim()
        : git('log', '-1', '--format=%H', '-S', '**Status:** CLOSED', '--', rel).trim();
    } catch {
      sealed = '';
    }
    if (!sealed) {
      findings.push(`${rel}: CLOSED but no committed seal — commit the close before relying on it`);
    } else {
      const committed = git('show', `${sealed}:${rel}`);
      if (committed !== text) {
        findings.push(
          `${rel}: edited after its seal at ${sealed.slice(0, 7)} — a closed session is immutable`,
        );
      }
    }
  }

  if (status?.startsWith('REOPENED')) {
    const reopen = section(text, 'Reopen');
    if (!reopen) {
      findings.push(`${rel}: REOPENED without a "## Reopen" block`);
    } else {
      if (!/\*\*Passkey:\*\*\s*\S/.test(reopen)) {
        findings.push(`${rel}: REOPENED without a passkey — the owner must name one`);
      }
      // A passkey is a string, and a string is something anyone can type. Since
      // ADR-0045 a reopen also carries an SSH signature over the reason and the
      // delta; `macp verify` checks that it is genuine, and this checks that it
      // exists at all, so a reopen cannot pass by quoting a key id.
      if (!/\*\*Reopen signature:\*\*\s*\S/.test(reopen)) {
        findings.push(
          `${rel}: REOPENED without a "**Reopen signature:**" — a passkey string alone does not ` +
            'authorise a reopen (ADR-0045)',
        );
      }
    }
  }

  return { id, status: status?.split(/[ (]/)[0] ?? null, rel };
}

/** A row in INDEX.md whose session file no longer exists. */
function checkOrphanRows(rows, findings) {
  if (!fs.existsSync(INDEX)) return;
  const known = new Set(rows.map((row) => row.id));
  for (const line of fs.readFileSync(INDEX, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const id = line.split('|')[1]?.replace(/`/g, '').trim();
    if (!/^[A-Z]{1,4}\d{1,3}$/.test(id ?? '')) continue;
    if (!known.has(id)) {
      findings.push(
        `INDEX.md has a row for ${id} but state/sessions/ holds no such file — the record was deleted, not closed`,
      );
    }
  }
}

/** Every session must appear in INDEX.md with the status its own file claims. */
function checkIndex(rows, findings) {
  if (!fs.existsSync(INDEX)) {
    findings.push('state/INDEX.md is missing');
    return;
  }
  const lines = fs.readFileSync(INDEX, 'utf8').split('\n');
  const header = lines.find((l) => l.startsWith('|') && /\|\s*Status\s*\|/.test(l));
  if (!header) {
    findings.push('INDEX.md has no table with a Status column');
    return;
  }
  // Column positions are read from the header rather than assumed, so adding a
  // column does not silently compare the wrong cell.
  const statusAt = header.split('|').findIndex((c) => c.trim() === 'Status');
  for (const row of rows) {
    const line = lines.find((l) => l.startsWith('|') && l.includes(`\`${row.id}\``));
    if (!line) {
      findings.push(`INDEX.md has no row for ${row.id}`);
      continue;
    }
    const claimed = (line.split('|')[statusAt] ?? '').trim();
    if (row.status && claimed !== row.status) {
      findings.push(
        `INDEX.md says ${row.id} is ${claimed || '(blank)'}, its file says ${row.status}`,
      );
    }
  }
}

/** A sealed session must not be listed as an active agent. */
function checkRegistry(rows, findings) {
  if (!fs.existsSync(REGISTRY)) {
    findings.push('state/REGISTRY.md is missing');
    return;
  }
  const text = fs.readFileSync(REGISTRY, 'utf8');
  const active = text.split('## Active Agents')[1]?.split(/^## /m)[0] ?? '';
  for (const row of rows) {
    if (row.status === 'CLOSED' && active.includes(row.id)) {
      findings.push(`REGISTRY.md lists sealed session ${row.id} as active`);
    }
  }
}

const findings = [];
const rows = sessionFiles().map((f) => checkFile(f, findings));
if (rows.length === 0) findings.push('state/sessions/ holds no session files');
checkIndex(rows, findings);
checkOrphanRows(rows, findings);
checkRegistry(rows, findings);

if (findings.length === 0) {
  const closed = rows.filter((r) => r.status === 'CLOSED').length;
  console.log(`sessions: OK (${rows.length} files · ${closed} sealed · 0 findings)`);
  process.exit(0);
}

for (const f of findings) console.error(`FAIL  ${f}`);
console.error(`\n${findings.length} finding(s) across ${rows.length} session file(s)`);
process.exit(1);
