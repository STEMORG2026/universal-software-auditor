#!/usr/bin/env node
/**
 * Start-of-session gate (ADR-0044) — the missing half of check-protocol.mjs.
 *
 * `check-protocol.mjs` verifies the session CLOSED cleanly (tree clean,
 * session COMPLETED, no active agents, no mergeable PRs). Every one of its
 * checks is end-loaded: an agent can skip the entire 10-step MACP startup,
 * do the work, and only meet friction at push time. This gate checks the
 * START actually happened, so skipping it fails at the first commit rather
 * than after the work is done.
 *
 * Checks (only when `state/` exists — a repo with no MACP state passes,
 * that is the bootstrap case handled by AGENTS.md Section 7):
 *
 * 1. A session file exists (something registered this session).
 * 2. If the latest session file is IN-PROGRESS:
 *    a. it has a matching plan in state/plans/ (STEP 10), and
 *    b. it is listed under Active Agents in REGISTRY.md (STEP 9).
 * 3. If the latest session file is COMPLETED, the gate passes — the close
 *    path is check-protocol.mjs's job, not this one.
 *
 * Exit 0 compliant, 1 violation. Usage: `node scripts/check-session-start.mjs`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const stateDir = resolve(root, 'state');

/** No MACP state at all → bootstrap case, nothing to enforce. */
if (!existsSync(stateDir)) {
  console.log('session start: no state/ directory — bootstrap case, skipping.');
  process.exit(0);
}

const sessionDir = resolve(stateDir, 'sessions');
const plansDir = resolve(stateDir, 'plans');
const registryPath = resolve(stateDir, 'REGISTRY.md');

const failures = [];
const fail = (m) => failures.push(m);

function latestSessionFile() {
  if (!existsSync(sessionDir)) return null;
  const files = readdirSync(sessionDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();
  return files.length > 0 ? files[0] : null;
}

const sessionFile = latestSessionFile();

if (!sessionFile) {
  fail(
    'no session file in state/sessions/ — STEP 9 (register yourself) was skipped. ' +
      'Create state/sessions/YYYYMMDD-HHMM-<AGENT-ID>-<slug>.md before committing.',
  );
} else {
  const sessionPath = resolve(sessionDir, sessionFile);
  const content = readFileSync(sessionPath, 'utf-8');

  const inProgress = content.includes('**Status:** IN-PROGRESS');
  const completed = content.includes('**Status:** COMPLETED');

  if (!inProgress && !completed) {
    fail(
      `${sessionFile} has no '**Status:** IN-PROGRESS' or '**Status:** COMPLETED' header — ` +
        'the session file header schema in STARTUP.md STEP 9 is mandatory.',
    );
  }

  if (inProgress) {
    // STEP 10 — a plan must exist for this session.
    if (!existsSync(plansDir)) {
      fail(
        `${sessionFile} is IN-PROGRESS but state/plans/ does not exist — ` +
          'STEP 10 (create a plan entry) was skipped.',
      );
    } else {
      const plans = readdirSync(plansDir).filter((f) => f.endsWith('.md'));
      const agentMatch = content.match(/\*\*Agent:\*\*\s*([A-Za-z0-9]+)/);
      const agentId = agentMatch ? agentMatch[1] : null;
      const hasPlan = agentId ? plans.some((p) => p.includes(agentId)) : plans.length > 0;
      if (!hasPlan) {
        fail(
          `${sessionFile} is IN-PROGRESS but no plan in state/plans/ references it ` +
            `(agent ${agentId ?? 'unknown'}) — STEP 10 was skipped.`,
        );
      }
    }

    // STEP 9 — the session must be listed as an active agent.
    if (!existsSync(registryPath)) {
      fail(`${sessionFile} is IN-PROGRESS but state/REGISTRY.md is missing.`);
    } else {
      const registry = readFileSync(registryPath, 'utf-8');
      const activeSection = registry.split('## Active Agents')[1]?.split('\n## ')[0] ?? '';
      const agentMatch = content.match(/\*\*Agent:\*\*\s*([A-Za-z0-9]+)/);
      const agentId = agentMatch ? agentMatch[1] : null;
      const registered = agentId
        ? activeSection.includes(agentId)
        : !activeSection.includes('None');
      if (!registered) {
        fail(
          `${sessionFile} is IN-PROGRESS but its agent (${agentId ?? 'unknown'}) is not ` +
            'listed under Active Agents in REGISTRY.md — STEP 9 was skipped.',
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`session start: ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  console.error(
    '\nThis gate exists because the MACP startup is otherwise unenforced until push time.\n' +
      'See AGENTS.md "MACP — Multi-Agent Coordination Protocol" and state/STARTUP.md.',
  );
  process.exit(1);
}
console.log(`session start: OK (${sessionFile})`);
