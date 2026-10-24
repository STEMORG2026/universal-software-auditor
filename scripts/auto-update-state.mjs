#!/usr/bin/env node
/**
 * Post-commit state maintenance — and the three ways the previous version lied.
 *
 * 1. IT FORGED FRESHNESS. It replaced `**Last Reconciled:**` with the current
 *    time on every commit while leaving the body untouched. Measured on
 *    2026-10-24: `state/DASHBOARD.md` carried eight `**Last Reconciled:**`
 *    lines, the newest seven hours old, above a body that still said
 *    `Version: 2.26.0` and PR `#190` while `package.json` said `2.28.7`. The
 *    protocol then told agents "<24h old → trust it", so the stale body was
 *    trusted *because* the hook had stamped it.
 *
 * 2. IT APPENDED TO FINISHED SESSIONS. `SA09` collected 27 commit lines after
 *    it was COMPLETED, which is how #245-#248 ended up in conflict with each
 *    other. Only CLOSED was guarded; COMPLETED was not.
 *
 * 3. IT MAINTAINED TWO COPIES OF THE SAME PROSE. `state.md` and
 *    `DASHBOARD.md` both carried a version, a branch, and a status line, and
 *    both went stale independently. Every feature branch then conflicted on
 *    both.
 *
 * WHAT IT DOES NOW. Regenerates one marked region of `DASHBOARD.md` from facts
 * it measures — and writes nothing at all when the measured facts are
 * unchanged. The timestamp it writes is `**Machine Reconciled:**`, which is
 * what it is; the human field is `**Owner Reconciled:**` and this hook never
 * touches it. `state.md` is a pointer with no facts in it.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { removeActiveAgent, setIndexStatus } from './macp/lib/statefiles.mjs';

const root = process.cwd();
const BEGIN = '<!-- macp:generated:begin -->';
const END = '<!-- macp:generated:end -->';
const BOT_BRANCH = /^(provenance\/|changeset-release\/|dependabot\/|renovate\/)/;

/**
 * `git` with an argv array, never a split string.
 *
 * Splitting a string on spaces looks equivalent and is not: `git('ls-files
 * "*.md"')` passed the quotes through as part of the pathspec and matched
 * nothing, so the dashboard reported zero tracked markdown in a repository full
 * of it.
 */
function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function branch() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']);
}

function trackedMarkdown() {
  return git(['ls-files', '*.md']).split('\n').filter(Boolean).length;
}

function adrCount() {
  const dir = path.join(root, 'docs', 'adr');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((name) => /^\d{4}-.*\.md$/.test(name)).length;
}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Everything in the region is measured here. Nothing is typed by an agent.
 *
 * Deliberately absent: ahead/behind master, and the recent-commit list. Both
 * change on every commit, so including them would rewrite this block on every
 * commit — and a block that rewrites itself is a block nobody diffs. They are
 * also one `git log` away, which is where a reader should get them.
 */
function machineFacts() {
  return {
    version: packageVersion(),
    branch: branch(),
    docs: trackedMarkdown(),
    adrs: adrCount(),
    remote: git(['remote', 'get-url', 'origin']) || '(none)',
  };
}

function renderRegion(facts, stampedAt) {
  return [
    BEGIN,
    `**Machine Reconciled:** ${stampedAt}`,
    '**Reconciled by:** `scripts/auto-update-state.mjs` (post-commit) — every value below is measured',
    `**Repo:** ${path.basename(root)}`,
    `**Remote:** ${facts.remote}`,
    '',
    `- **Version:** ${facts.version}`,
    `- **Branch:** \`${facts.branch}\``,
    `- **Tracked markdown:** ${facts.docs}`,
    `- **ADRs:** <!-- usa:fact adrs -->${facts.adrs}<!-- /usa:fact -->`,
    '',
    '> This block is generated. Edit anything outside it, never inside it: the next',
    '> commit overwrites the block, and `**Owner Reconciled:**` above is the field a',
    '> human sets after actually reading the rest of this file.',
    END,
  ].join('\n');
}

/** Replace the marked region, or put one under the title if there is none. */
function replaceRegion(text, region) {
  const begin = text.indexOf(BEGIN);
  if (begin !== -1) {
    const end = text.indexOf(END, begin);
    if (end !== -1) return `${text.slice(0, begin)}${region}${text.slice(end + END.length)}`;
  }
  const title = text.match(/^# .*$/m);
  if (!title) return `${region}\n\n${text}`;
  const at = title.index + title[0].length;
  return `${text.slice(0, at)}\n\n${region}\n${text.slice(at)}`;
}

/**
 * Rewrite DASHBOARD.md only when a measured fact moved.
 *
 * The timestamp is deliberately part of the comparison, not the trigger: a
 * timestamp that changes every commit is a timestamp that means nothing, which
 * is precisely the defect this replaces.
 */
function updateDashboard() {
  const file = path.join(root, 'state', 'DASHBOARD.md');
  if (!existsSync(file)) return;

  const text = readFileSync(file, 'utf8');
  const facts = machineFacts();
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  // The END marker is part of the region. Comparing a slice that stops *before*
  // it made every run look like a change, which is a churn bug that hides the
  // real one: a region that rewrites itself on every commit cannot be diffed.
  const previous = begin !== -1 && end !== -1 ? text.slice(begin, end + END.length) : '';
  const withoutStamp = (value) => value.replace(/\*\*Machine Reconciled:\*\* .*/, '');
  const candidate = renderRegion(facts, 'STAMP');
  if (previous && withoutStamp(previous) === withoutStamp(candidate)) return;

  const stampedAt = new Date().toISOString().replace('Z', '+05:45');
  writeFileSync(file, replaceRegion(text, renderRegion(facts, stampedAt)));
  console.log('  DASHBOARD.md regenerated');
}

/** The newest session file, by filename — lexical order is chronological. */
function newestSession() {
  const dir = path.join(root, 'state', 'sessions');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  if (files.length === 0) return null;
  const file = path.join(dir, files[files.length - 1]);
  return { file, text: readFileSync(file, 'utf8'), name: files[files.length - 1] };
}

function updateRegistry() {
  const session = newestSession();
  if (!session) return;

  // Only a finished session releases its agent. `IN-PROGRESS` and `REOPENED`
  // are live, and dropping them here is how a running agent vanished from the
  // registry mid-session.
  if (!/\*\*Status:\*\* (COMPLETED|CLOSED)/.test(session.text)) return;

  const id = session.name.split('-')[2];
  if (!id) return;
  const before = readFileSync(path.join(root, 'state', 'REGISTRY.md'), 'utf8');
  removeActiveAgent(root, id);
  if (readFileSync(path.join(root, 'state', 'REGISTRY.md'), 'utf8') !== before) {
    console.log('  REGISTRY.md released the finished session');
  }
}

function updateIndex() {
  const session = newestSession();
  if (!session) return;

  const status = /\*\*Status:\*\*[ \t]*(.*)$/m.exec(session.text)?.[1]?.split(/[ (]/)[0];
  const id = session.name.split('-')[2];
  if (!id || !status) return;

  const file = path.join(root, 'state', 'INDEX.md');
  if (!existsSync(file)) return;
  const before = readFileSync(file, 'utf8');
  setIndexStatus(root, id, status);
  if (readFileSync(file, 'utf8') !== before) console.log('  INDEX.md status updated');
}

function updateSessionFile() {
  const session = newestSession();
  if (!session) return;

  // A finished session is a record, not a log. Appending to COMPLETED is what
  // put 27 commits into SA09 after it was done; appending to CLOSED would break
  // the seal `check-sessions.mjs` compares byte for byte.
  if (/\*\*Status:\*\* (COMPLETED|CLOSED)/m.test(session.text)) {
    console.log('  session is finished — not appending');
    return;
  }

  let commitSha;
  let commitMsg;
  try {
    commitSha = execSync('git log -1 --format=%h', { cwd: root, encoding: 'utf-8' }).trim();
    commitMsg = execSync('git log -1 --format=%s', { cwd: root, encoding: 'utf-8' }).trim();
  } catch {
    return;
  }
  if (session.text.includes(`\`${commitSha}\` ${commitMsg}`)) return;
  // The bookkeeping commit is not part of the work. Recording it would make the
  // trail alternate between real commits and "chore(state)", and each recording
  // would itself need recording.
  if (/^chore\(state\)/.test(commitMsg)) return;

  const timestamp = new Date().toISOString().slice(11, 16);
  const entry = `\n### ${timestamp} — Commit\n\n\`${commitSha}\` ${commitMsg}\n`;
  const text = session.text.includes('## Outcome')
    ? session.text.replace('## Outcome', `${entry}\n---\n\n## Outcome`)
    : `${session.text}${entry}`;
  writeFileSync(session.file, text);
  console.log('  session file updated');
}

if (process.env.USA_AUTO_UPDATE) {
  console.log('Auto-update already in progress, skipping.');
} else if (BOT_BRANCH.test(branch())) {
  console.log(`Auto-update skipped: ${branch()} is a bot branch; state belongs on master.`);
} else {
  console.log('Auto-updating state files...');
  try {
    updateDashboard();
    updateRegistry();
    updateIndex();
    updateSessionFile();
  } catch (error) {
    // Never block a commit for bookkeeping. The gates are where truth is
    // enforced; this hook only keeps the record tidy.
    console.error('State update failed:', error.message);
  }

  try {
    // Scope the bookkeeping commit to `state/`. The first version ran
    // `git add -A`, so any change the author had not staged — a source file, a
    // changeset, a config edit — was swept into a commit titled
    // "chore(state)", where no reviewer would look for it. A commit that says
    // it is state must contain only state.
    const status = execFileSync('git', ['status', '--porcelain', '--', 'state'], {
      cwd: root,
      encoding: 'utf-8',
    }).trim();
    if (!status) {
      console.log('No state changes to record.');
    } else {
      execSync('git add -A -- state', { cwd: root });
      const staged = execFileSync('git', ['diff', '--cached', '--name-only'], {
        cwd: root,
        encoding: 'utf-8',
      }).trim();
      if (staged) {
        execSync('git commit -m "chore(state): auto-update from post-commit hook" -- state', {
          cwd: root,
          stdio: 'pipe',
          env: { ...process.env, USA_AUTO_UPDATE: '1' },
        });
        console.log('State changes auto-committed.');
      } else {
        console.log('State already recorded in the previous commit.');
      }
    }
  } catch (error) {
    console.warn('Auto-commit failed:', error.message);
  }
}
