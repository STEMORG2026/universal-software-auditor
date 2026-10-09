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
import { readFileSync, existsSync } from 'node:fs';
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
  const sessionDir = resolve(root, 'state/sessions');
  if (!existsSync(sessionDir)) return { pass: true, detail: 'no sessions dir' };

  // Find most recent session file
  const files = execSync('ls -t state/sessions/*.md 2>/dev/null || true', {
    cwd: root,
    encoding: 'utf-8',
  })
    .trim()
    .split('\n')
    .filter((f) => f.endsWith('.md'));

  if (files.length === 0) return { pass: true, detail: 'no session files' };

  const latest = files[0];
  const content = readFileSync(latest, 'utf-8');

  if (!content.includes('**Status:** COMPLETED')) {
    return { pass: false, detail: `latest session file not COMPLETED: ${latest}` };
  }

  return { pass: true, detail: 'session file COMPLETED' };
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
  try {
    const result = execSync(
      'gh pr list --head master --state open --json number,title,mergeable,mergeStateStatus,statusCheckRollup',
      { cwd: root, encoding: 'utf-8' },
    );
    const prs = JSON.parse(result);

    if (prs.length === 0) return { pass: true, detail: 'no open PRs' };

    const issues = [];
    for (const pr of prs) {
      if (pr.mergeable === 'MERGEABLE' && pr.mergeStateStatus === 'CLEAN') {
        const ciGreen = pr.statusCheckRollup?.every(
          (c) => c.conclusion === 'SUCCESS' || c.conclusion === 'SKIPPED',
        );
        if (ciGreen) {
          issues.push(
            `PR #${pr.number} is mergeable and CI green — must be merged before session close`,
          );
        }
      }
    }

    if (issues.length > 0) {
      return { pass: false, detail: issues.join('; ') };
    }

    return { pass: true, detail: 'no mergeable PRs pending' };
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
