#!/usr/bin/env node
/**
 * Protocol enforcement check — verifies session-close compliance.
 *
 * Checks:
 * 1. Working tree is clean (no uncommitted changes)
 * 2. No untracked files (except gitignored)
 * 3. If a session file exists, it must be marked COMPLETED
 * 4. REGISTRY.md must have no active agents
 *
 * Exits 0 if compliant, 1 if not.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function checkWorkingTreeClean() {
  try {
    const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
    if (status === '') return { pass: true, detail: 'clean' };

    const lines = status.split('\n').filter((l) => l.trim());
    const untracked = lines.filter((l) => l.startsWith('??'));
    const modified = lines.filter((l) => !l.startsWith('??'));

    const issues = [];
    if (modified.length > 0) issues.push(`${modified.length} modified file(s)`);
    if (untracked.length > 0) issues.push(`${untracked.length} untracked file(s)`);

    return { pass: false, detail: issues.join(', ') };
  } catch (e) {
    return { pass: false, detail: e.message };
  }
}

function checkSessionFile() {
  const latest = latestSession();
  if (!latest) return { pass: true, detail: 'no session files' };

  const content = readFileSync(latest, 'utf-8');
  // CLOSED is the stronger state: the owner sealed it. Requiring COMPLETED and
  // nothing else made sealing a session fail the gate that is supposed to
  // reward sealing it.
  if (!/\*\*Status:\*\* (COMPLETED|CLOSED)/.test(content)) {
    return { pass: false, detail: `latest session file not COMPLETED or CLOSED: ${latest}` };
  }

  return { pass: true, detail: 'session file COMPLETED or CLOSED' };
}

/**
 * The newest session, chosen by FILENAME.
 *
 * `ls -t` sorted by mtime, and mtime in a fresh clone is checkout order, not
 * authorship order — so the gate's idea of "the latest session" was whichever
 * file the checkout happened to write last. Demonstrated: touching
 * `20261001-1630-HX01-bootstrap-macp.md` made the gate judge HX01 as the
 * current session and report a violation about a session closed three weeks
 * earlier. Filenames begin `YYYYMMDD-HHMM`, so lexical order is chronological.
 */
function latestSession() {
  const sessionDir = resolve(root, 'state/sessions');
  if (!existsSync(sessionDir)) return null;
  const files = readdirSync(sessionDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  return files.length === 0 ? null : resolve(sessionDir, files[files.length - 1]);
}

function checkRegistry() {
  const registryPath = resolve(root, 'state/REGISTRY.md');
  if (!existsSync(registryPath)) return { pass: true, detail: 'no REGISTRY.md' };

  const content = readFileSync(registryPath, 'utf-8');
  const activeSection = content.split('## Active Agents')[1]?.split('##')[0] || '';

  if (!activeSection.includes('None')) {
    return { pass: false, detail: 'REGISTRY.md has active agents' };
  }

  return { pass: true, detail: 'no active agents' };
}

function checkPRs() {
  // The check used `--head master`, which lists pull requests *from* master —
  // always empty. It had therefore never looked at the one thing it exists to
  // check. The question is narrower than "any open PR": it is whether the
  // branch this session worked on is still open. `--base master` would have
  // failed every master push whenever any unrelated green PR was queued.
  const latest = latestSession();
  if (!latest) return { pass: true, detail: 'no session to check' };
  const content = readFileSync(latest, 'utf-8');
  if (/\*\*Status:\*\* CLOSED/.test(content)) {
    return { pass: true, detail: 'latest session is sealed' };
  }
  const branchLine = content.match(/^\*\*Branch:\*\*[ \t]*(.*)$/m)?.[1] ?? '';
  const branches = branchLine
    .split(',')
    .map((b) => b.trim().split(/[\s(]/)[0])
    .filter((b) => b && b !== 'master');

  if (branches.length === 0) return { pass: true, detail: 'session has no feature branch' };

  try {
    for (const branch of branches) {
      const result = execSync(
        `gh pr list --head ${JSON.stringify(branch)} --state open --json number,title,mergeable,mergeStateStatus,statusCheckRollup`,
        { cwd: root, encoding: 'utf-8' },
      );
      for (const pr of JSON.parse(result)) {
        if (pr.mergeable === 'MERGEABLE' && pr.mergeStateStatus === 'CLEAN') {
          const ciGreen = pr.statusCheckRollup?.every(
            (c) => c.conclusion === 'SUCCESS' || c.conclusion === 'SKIPPED',
          );
          if (ciGreen) {
            return {
              pass: false,
              detail: `PR #${pr.number} on ${branch} is mergeable and CI green — must be merged before session close`,
            };
          }
        }
      }
    }

    return { pass: true, detail: 'no mergeable PR on the session branch' };
  } catch {
    return { pass: true, detail: 'could not check PRs (gh not available)' };
  }
}

// Run checks
const checks = [
  { name: 'Working tree clean', ...checkWorkingTreeClean() },
  { name: 'Session file COMPLETED', ...checkSessionFile() },
  { name: 'No active agents', ...checkRegistry() },
  { name: 'No mergeable PRs pending', ...checkPRs() },
];

console.log('Protocol enforcement check:');
let allPass = true;
for (const check of checks) {
  const status = check.pass ? 'PASS' : 'FAIL';
  console.log(`  ${status}  ${check.name} — ${check.detail}`);
  if (!check.pass) allPass = false;
}

if (!allPass) {
  console.error('\nProtocol violation: session not closed cleanly.');
  console.error('Fix: stash or commit all work, mark session COMPLETED, clear active agents.');
  process.exit(1);
}

console.log('\nAll checks passed.');
