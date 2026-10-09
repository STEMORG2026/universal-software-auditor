#!/usr/bin/env node
/**
 * Auto-update state files after commit.
 *
 * Runs as a post-commit hook. Updates:
 * - DASHBOARD.md — reconciliation timestamp, recent commits
 * - REGISTRY.md — session status if session file exists
 * - INDEX.md — new session entry if needed
 * - Session file — commit log entry
 *
 * This is automatic. The agent verifies afterwards, does NOT manually update.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function getRecentCommits(count = 10) {
  try {
    return execSync(`git log --oneline -${count}`, { cwd: root, encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter((l) => l.trim());
  } catch (e) {
    console.warn('Failed to get recent commits:', e.message);
    return [];
  }
}

function updateDashboard() {
  const path = resolve(root, 'state/DASHBOARD.md');
  if (!existsSync(path)) return;

  let content = readFileSync(path, 'utf-8');
  const now = new Date().toISOString().replace('Z', '+05:45');

  // Update reconciliation timestamp
  content = content.replace(/\*\*Last Reconciled:\*\* .*/, `**Last Reconciled:** ${now}`);
  content = content.replace(
    /\*\*Reconciled by:\*\* .*/,
    `**Reconciled by:** auto-update (post-commit)`,
  );

  // Update recent commits section
  const commits = getRecentCommits(10);
  const commitSection = commits.map((c, i) => `${i + 1}. \`${c}\``).join('\n');

  content = content.replace(
    /## Recently Completed \(last 10 commits\)\n\n([\s\S]*?)(?=\n---)/,
    `## Recently Completed (last 10 commits)\n\n${commitSection}\n`,
  );

  writeFileSync(path, content);
  console.log('  DASHBOARD.md updated');
}

function updateRegistry() {
  const path = resolve(root, 'state/REGISTRY.md');
  if (!existsSync(path)) return;

  let content = readFileSync(path, 'utf-8');

  // Check if there's an active session that should be marked completed
  const sessionDir = resolve(root, 'state/sessions');
  if (!existsSync(sessionDir)) return;

  const sessions = readdirSync(sessionDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();

  if (sessions.length === 0) return;

  const latestSession = resolve(sessionDir, sessions[0]);
  const sessionContent = readFileSync(latestSession, 'utf-8');

  // If session is COMPLETED but still listed as active in REGISTRY, move it
  if (sessionContent.includes('**Status:** COMPLETED')) {
    const activeSection = content.split('## Active Agents')[1]?.split('##')[0] || '';
    if (!activeSection.includes('None')) {
      // Move active agents to inactive
      const agentBlocks = activeSection.split(/### /).filter((b) => b.trim());
      let newContent = content.replace(
        /## Active Agents\n\n([\s\S]*?)(?=\n---)/,
        '## Active Agents\n\nNone — no active sessions.\n',
      );

      // Add to inactive section
      for (const block of agentBlocks) {
        if (block.trim()) {
          newContent = newContent.replace(
            '## Inactive Agents',
            `## Inactive Agents\n\n### ${block}`,
          );
        }
      }

      writeFileSync(path, newContent);
      console.log('  REGISTRY.md updated');
    }
  }
}

function updateIndex() {
  const path = resolve(root, 'state/INDEX.md');
  if (!existsSync(path)) return;

  let content = readFileSync(path, 'utf-8');
  const sessionDir = resolve(root, 'state/sessions');
  if (!existsSync(sessionDir)) return;

  const sessions = readdirSync(sessionDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();

  if (sessions.length === 0) return;

  const latestFile = sessions[0];
  const latestSession = resolve(sessionDir, latestFile);
  const sessionContent = readFileSync(latestSession, 'utf-8');

  // Extract session info
  const agentMatch = sessionContent.match(/\*\*Agent:\*\* (.+)/);
  const branchMatch = sessionContent.match(/\*\*Branch:\*\* (.+)/);
  const taskMatch = sessionContent.match(/\*\*Task:\*\* (.+)/);
  const statusMatch = sessionContent.match(/\*\*Status:\*\* (.+)/);

  if (!agentMatch) return;

  const agent = agentMatch[1];
  const branch = branchMatch?.[1] || 'unknown';
  const task = taskMatch?.[1] || 'unknown';
  const status = statusMatch?.[1] || 'unknown';

  // Check if already in INDEX
  if (content.includes(latestFile)) return;

  // Add new entry
  const entry = `
### ${new Date().toISOString().slice(0, 10)} — ${agent}

| Field        | Value                     |
| ------------ | ------------------------- |
| Session file | \`sessions/${latestFile}\` |
| Agent        | ${agent}                  |
| Branch       | ${branch}                 |
| Task         | ${task}                    |
| Status       | ${status}                  |
`;

  content = content.replace(
    /\n---\n\n## Search by Keyword/,
    `${entry}\n---\n\n## Search by Keyword`,
  );

  writeFileSync(path, content);
  console.log('  INDEX.md updated');
}

function updateSessionFile() {
  const sessionDir = resolve(root, 'state/sessions');
  if (!existsSync(sessionDir)) return;

  const sessions = readdirSync(sessionDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();

  if (sessions.length === 0) return;

  const latestFile = sessions[0];
  const latestSession = resolve(sessionDir, latestFile);
  let content = readFileSync(latestSession, 'utf-8');

  // Get the commit that just happened
  let commitMsg = 'unknown';
  let commitSha = 'unknown';
  try {
    commitSha = execSync('git log -1 --format=%h', { cwd: root, encoding: 'utf-8' }).trim();
    commitMsg = execSync('git log -1 --format=%s', { cwd: root, encoding: 'utf-8' }).trim();
  } catch (e) {
    console.warn('Failed to get commit info:', e.message);
  }

  // Add commit to session log
  const timestamp = new Date().toISOString().slice(11, 16);
  const logEntry = `\n### ${timestamp} — Commit\n\n\`${commitSha}\` ${commitMsg}\n`;

  // Insert before the outcome section if it exists, otherwise append
  if (content.includes('## Outcome')) {
    content = content.replace('## Outcome', `${logEntry}\n---\n\n## Outcome`);
  } else {
    content += logEntry;
  }

  writeFileSync(latestSession, content);
  console.log('  Session file updated');
}

// Guard against recursion: if we're already in the auto-update hook, skip everything
if (process.env.USA_AUTO_UPDATE) {
  console.log('Auto-update already in progress, skipping.');
} else {
  // Run updates
  console.log('Auto-updating state files...');
  try {
    updateDashboard();
    updateRegistry();
    updateIndex();
    updateSessionFile();
    console.log('State update complete.');
  } catch (e) {
    console.error('State update failed:', e.message);
    // Don't block the commit
  }

  // Auto-commit state changes so the tree stays clean
  try {
    const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
    if (status) {
      execSync('git add -A', { cwd: root });
      execSync('git commit -m "chore(state): auto-update from post-commit hook"', {
        cwd: root,
        stdio: 'pipe',
        env: { ...process.env, USA_AUTO_UPDATE: '1' },
      });
      console.log('State changes auto-committed.');
    }
  } catch (e) {
    console.warn('Auto-commit failed:', e.message);
  }
}
