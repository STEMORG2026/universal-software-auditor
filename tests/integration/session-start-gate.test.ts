import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Integration tests for the start-of-session gate (ADR-0044).
 *
 * The gate is a standalone script run by the pre-commit hook and CI; these
 * tests drive it exactly as the hook does (a real `node scripts/…` process in
 * a real temp project) rather than importing its internals, because the
 * contract is its exit code and stderr, not its functions.
 */

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/check-session-start.mjs');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function scaffold(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'usa-session-gate-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return root;
}

/** Run the gate in *root*; return {code, stdout, stderr}. */
function runGate(root: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const SESSION_IN_PROGRESS = `**Agent:** TEST (tester)
**Branch:** test/x
**Started:** 2026-10-02T00:00:00+05:45
**Status:** IN-PROGRESS
**Base commit:** abc1234
`;

const SESSION_COMPLETED = SESSION_IN_PROGRESS.replace('IN-PROGRESS', 'COMPLETED');

describe('check-session-start gate', () => {
  it('passes when there is no state/ directory (bootstrap case)', () => {
    const root = scaffold({ 'README.md': '# nothing here\n' });
    const r = runGate(root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('bootstrap case');
  });

  it('passes a properly registered IN-PROGRESS session with a plan', () => {
    const root = scaffold({
      'state/sessions/20261002-0000-TEST-slug.md': SESSION_IN_PROGRESS,
      'state/plans/agent-TEST-slug.md': '# plan\n',
      'state/REGISTRY.md':
        '# REGISTRY\n\n## Active Agents\n\n### TEST\n\n| Agent ID | TEST |\n\n---\n',
    });
    const r = runGate(root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('OK');
  });

  it('passes a COMPLETED session (close path is check-protocol, not this gate)', () => {
    const root = scaffold({
      'state/sessions/20261002-0000-TEST-slug.md': SESSION_COMPLETED,
    });
    const r = runGate(root);
    expect(r.code).toBe(0);
  });

  it('fails when an IN-PROGRESS session has no plan (STEP 10 skipped)', () => {
    const root = scaffold({
      'state/sessions/20261002-0000-TEST-slug.md': SESSION_IN_PROGRESS,
      'state/plans/.gitkeep': '',
      'state/REGISTRY.md': '# REGISTRY\n\n## Active Agents\n\n### TEST\n\n---\n',
    });
    const r = runGate(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/STEP 10/);
  });

  it('fails when an IN-PROGRESS session is not in REGISTRY Active Agents (STEP 9 skipped)', () => {
    const root = scaffold({
      'state/sessions/20261002-0000-TEST-slug.md': SESSION_IN_PROGRESS,
      'state/plans/agent-TEST-slug.md': '# plan\n',
      'state/REGISTRY.md': '# REGISTRY\n\n## Active Agents\n\nNone — no active sessions.\n\n---\n',
    });
    const r = runGate(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/STEP 9/);
  });

  it('fails when no session file exists at all', () => {
    const root = scaffold({
      'state/REGISTRY.md': '# REGISTRY\n\n## Active Agents\n\nNone.\n\n---\n',
    });
    const r = runGate(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/STEP 9/);
  });

  it('fails a session file with no Status header', () => {
    const root = scaffold({
      'state/sessions/20261002-0000-TEST-slug.md': '**Agent:** TEST\n',
    });
    const r = runGate(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Status/);
  });
});
