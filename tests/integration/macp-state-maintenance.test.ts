import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Integration tests for the post-commit state maintenance (ADR-0045).
 *
 * Each case is one of the three ways the previous version lied: a timestamp
 * stamped over stale prose, commits appended to a finished session, and two
 * copies of the same prose drifting apart. The script is run as a real process
 * because the post-commit hook runs it that way.
 */

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/auto-update-state.mjs');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function git(dir: string, args: string[]) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

function fixture({
  status = 'IN-PROGRESS',
  branch = 'feat/x',
  version = '9.9.9',
}: { status?: string; branch?: string; version?: string } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'usa-auto-update-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));

  git(dir, ['init', '-q', '-b', 'master']);
  git(dir, ['config', 'user.email', 't@t.t']);
  git(dir, ['config', 'user.name', 't']);
  mkdirSync(path.join(dir, 'state/sessions'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/adr'), { recursive: true });

  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'x', version })}\n`);
  writeFileSync(
    path.join(dir, 'state/DASHBOARD.md'),
    '# DASHBOARD\n\n> summary\n\n<!-- macp:generated:begin -->\n<!-- macp:generated:end -->\n\n' +
      '**Owner Reconciled:** a human wrote this\n\nProse that must survive.\n',
  );
  writeFileSync(
    path.join(dir, 'state/sessions/20260101-0000-T01-x.md'),
    `**Agent:** T01 (x)\n**Harness:** vitest\n**History:** not exported\n**Branch:** ${branch}\n` +
      `**Started:** 2026-01-01T00:00:00+05:45\n**Status:** ${status}\n**Base commit:** abc\n`,
  );
  writeFileSync(
    path.join(dir, 'state/REGISTRY.md'),
    '# REG\n\n## Active Agents\n\n### T01\n\n| Agent | T01 |\n\n---\n\n## Sealed\n',
  );
  writeFileSync(
    path.join(dir, 'state/INDEX.md'),
    `# IDX\n\n| ID | Status |\n| -- | -- |\n| \`T01\` | ${status} |\n`,
  );
  writeFileSync(path.join(dir, 'docs/adr/0001-a.md'), '# 1\n');

  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'chore: init']);
  if (branch !== 'master') git(dir, ['checkout', '-q', '-b', branch]);
  return dir;
}

function run(dir: string, env: Record<string, string> = {}) {
  const result = spawnSync('node', [SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('auto-update-state — the dashboard', () => {
  it('regenerates the facts block from live truth', () => {
    const dir = fixture({ version: '9.9.9' });
    expect(run(dir).code).toBe(0);
    const text = readFileSync(path.join(dir, 'state/DASHBOARD.md'), 'utf8');
    expect(text).toContain('**Machine Reconciled:**');
    expect(text).toContain('- **Version:** 9.9.9');
    expect(text).toContain('**Owner Reconciled:** a human wrote this');
    expect(text).toContain('Prose that must survive.');
  });

  it('never writes a human reconciliation timestamp', () => {
    const dir = fixture();
    run(dir);
    const text = readFileSync(path.join(dir, 'state/DASHBOARD.md'), 'utf8');
    expect(text).not.toContain('Last Reconciled');
    expect(text).toContain('**Owner Reconciled:** a human wrote this');
  });

  it('writes nothing on a second run when no fact moved', () => {
    const dir = fixture();
    run(dir);
    const first = readFileSync(path.join(dir, 'state/DASHBOARD.md'), 'utf8');
    run(dir);
    expect(readFileSync(path.join(dir, 'state/DASHBOARD.md'), 'utf8')).toBe(first);
  });

  it('does write when a fact moved', () => {
    const dir = fixture({ version: '9.9.9' });
    run(dir);
    writeFileSync(
      path.join(dir, 'package.json'),
      `${JSON.stringify({ name: 'x', version: '10.0.0' })}\n`,
    );
    run(dir);
    expect(readFileSync(path.join(dir, 'state/DASHBOARD.md'), 'utf8')).toContain(
      '- **Version:** 10.0.0',
    );
  });

  it('skips a bot branch entirely', () => {
    const dir = fixture({ branch: 'dependabot/npm_and_yarn/x' });
    const r = run(dir);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/bot branch/);
    expect(readFileSync(path.join(dir, 'state/DASHBOARD.md'), 'utf8')).not.toContain(
      '**Machine Reconciled:**',
    );
  });
});

describe('auto-update-state — finished sessions', () => {
  for (const status of ['COMPLETED', 'CLOSED']) {
    it(`does not append a commit to a ${status} session`, () => {
      const dir = fixture({ status });
      const before = readFileSync(path.join(dir, 'state/sessions/20260101-0000-T01-x.md'), 'utf8');
      writeFileSync(path.join(dir, 'src.js'), 'x\n');
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-qm', 'feat: more work']);
      run(dir);
      const after = readFileSync(path.join(dir, 'state/sessions/20260101-0000-T01-x.md'), 'utf8');
      expect(after).toBe(before);
      expect(after).not.toContain('— Commit');
    });
  }

  it('does append a commit to a live session', () => {
    const dir = fixture({ status: 'IN-PROGRESS' });
    writeFileSync(path.join(dir, 'src.js'), 'x\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'feat: more work']);
    run(dir);
    const text = readFileSync(path.join(dir, 'state/sessions/20260101-0000-T01-x.md'), 'utf8');
    expect(text).toContain('— Commit');
    expect(text).toContain('feat: more work');
  });

  it('releases the agent from REGISTRY only when the session is finished', () => {
    const live = fixture({ status: 'IN-PROGRESS' });
    run(live);
    expect(readFileSync(path.join(live, 'state/REGISTRY.md'), 'utf8')).toContain('### T01');

    const done = fixture({ status: 'COMPLETED' });
    run(done);
    const registry = readFileSync(path.join(done, 'state/REGISTRY.md'), 'utf8');
    expect(registry).toContain('**None.**');
    expect(registry).not.toContain('### T01');
  });
});

describe('auto-update-state — the bookkeeping commit', () => {
  it('commits only state/, never a change the author left unstaged', () => {
    // The first version ran `git add -A`, so a source file, a changeset or a
    // config edit was swept into a commit titled "chore(state)" — where nobody
    // looks for it, and where it is invisible in review. Measured on this very
    // session: the hook swallowed twenty files into one state commit.
    const dir = fixture({ status: 'IN-PROGRESS' });
    writeFileSync(path.join(dir, 'src.js'), 'x\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'feat: more work']);
    writeFileSync(path.join(dir, 'unrelated.txt'), 'left unstaged on purpose\n');

    run(dir);

    const files = git(dir, ['show', '--name-only', '--format=', 'HEAD'])
      .split('\n')
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.startsWith('state/'))).toBe(true);
    expect(git(dir, ['status', '--porcelain'])).toContain('unrelated.txt');
  });

  it('does not create an empty commit when the previous commit already recorded the state', () => {
    const dir = fixture({ status: 'IN-PROGRESS' });
    writeFileSync(path.join(dir, 'src.js'), 'x\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'feat: more work']);
    run(dir);
    const first = git(dir, ['rev-parse', 'HEAD']);
    run(dir);
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(first);
  });
});
