import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Integration tests for the harness pre-tool guard (ADR-0045).
 *
 * The guard is the layer that fires *before* an edit, which is the whole point:
 * `pre-commit` runs after the agent has already done the work. It is driven here
 * as a real process reading JSON on stdin, exactly as every adapter drives it,
 * because the contract is the exit code (0 allow, 2 block) and nothing else.
 */

const ROOT = path.resolve(__dirname, '../..');
const GUARD = path.join(ROOT, 'scripts/macp/hooks/pretool.mjs');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function repo({ macp = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-guard-'));
  const home = mkdtempSync(path.join(tmpdir(), 'macp-guard-home-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));

  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.email', 't@t.t']);
  git(['config', 'user.name', 't']);
  if (macp) mkdirSync(path.join(dir, 'state', 'sessions'), { recursive: true });
  writeFileSync(path.join(dir, 'file.txt'), 'x\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'init']);
  git(['checkout', '-q', '-b', 'feat/x']);
  return { dir, home };
}

function guard(dir: string, home: string, input: unknown) {
  const result = spawnSync('node', [GUARD], {
    cwd: dir,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, MACP_HOME: home },
  });
  return { code: result.status ?? 1, err: result.stderr ?? '' };
}

function lease(dir: string, home: string, branch: string, state = 'ACTIVE') {
  // The guard derives the id from the path when there is no remote, so compute
  // the same slug here rather than reaching into the module.
  const identity = path.resolve(dir);
  const slug = identity
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .toLowerCase();
  const id = `${slug}-${createHash('sha256').update(identity).digest('hex').slice(0, 8)}`;
  const dir2 = path.join(home, 'leases');
  mkdirSync(dir2, { recursive: true });
  writeFileSync(
    path.join(dir2, `${id}.json`),
    JSON.stringify({
      schema: 'macp-lease-v1',
      leases: { [branch]: { branch, session: 'T01', state, repoRoot: dir } },
    }),
  );
}

describe('pre-tool guard', () => {
  it('is inert in a repository that does not use MACP', () => {
    const { dir, home } = repo({ macp: false });
    const r = guard(dir, home, { tool: 'Write', args: { file_path: 'a.txt' } });
    expect(r.code).toBe(0);
  });

  it('is inert outside a git repository', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'macp-guard-bare-'));
    const home = mkdtempSync(path.join(tmpdir(), 'macp-guard-home-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    cleanups.push(() => rmSync(home, { recursive: true, force: true }));
    const r = guard(dir, home, { tool: 'Write', args: {} });
    expect(r.code).toBe(0);
  });

  it('allows read-only tools while UNBOUND', () => {
    const { dir, home } = repo();
    for (const tool of ['Read', 'Grep', 'Glob', 'WebFetch']) {
      expect(guard(dir, home, { tool, args: {} }).code).toBe(0);
    }
  });

  it('blocks edits while UNBOUND and explains how to start', () => {
    const { dir, home } = repo();
    for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
      const r = guard(dir, home, { tool, args: {} });
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/UNBOUND/);
      // The refusal must name a command the reader can actually run.
      expect(r.err).toMatch(/macp start --agent/);
    }
  });

  it('blocks a mutating shell command while UNBOUND', () => {
    const { dir, home } = repo();
    for (const command of [
      'rm -rf src',
      'git commit -m x',
      'sed -i s/a/b/ f',
      'echo hi > out.txt',
    ]) {
      expect(guard(dir, home, { tool: 'Bash', args: { command } }).code).toBe(2);
    }
  });

  it('allows a read-only shell command while UNBOUND', () => {
    const { dir, home } = repo();
    for (const command of [
      'git log --oneline -5',
      'cat package.json',
      'ls -la',
      'gh pr list 2>/dev/null',
    ]) {
      expect(guard(dir, home, { tool: 'Bash', args: { command } }).code).toBe(0);
    }
  });

  it('allows edits once a lease is ACTIVE', () => {
    const { dir, home } = repo();
    lease(dir, home, 'feat/x');
    expect(guard(dir, home, { tool: 'Edit', args: {} }).code).toBe(0);
    expect(guard(dir, home, { tool: 'Bash', args: { command: 'git commit -m x' } }).code).toBe(0);
  });

  it('freezes the source while CLOSING', () => {
    const { dir, home } = repo();
    lease(dir, home, 'feat/x', 'CLOSING');
    const r = guard(dir, home, { tool: 'Edit', args: {} });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/CLOSING/);
    expect(r.err).toMatch(/frozen/);

    // The freeze covers shell mutation too, not just the file tools.
    expect(guard(dir, home, { tool: 'Bash', args: { command: 'echo x > f' } }).code).toBe(2);
  });

  it('blocks once the lease is terminal', () => {
    const { dir, home } = repo();
    lease(dir, home, 'feat/x', 'COMPLETED');
    expect(guard(dir, home, { tool: 'Edit', args: {} }).code).toBe(2);
  });

  it('fails closed when stdin is not JSON', () => {
    const { dir, home } = repo();
    const result = spawnSync('node', [GUARD], {
      cwd: dir,
      input: 'not json',
      encoding: 'utf8',
      env: { ...process.env, MACP_HOME: home },
    });
    expect(result.status).toBe(1);
  });

  it('accepts the Claude Code input shape as well as the generic one', () => {
    const { dir, home } = repo();
    const claudeShape = { tool_name: 'Write', tool_input: { file_path: 'a' }, cwd: dir };
    expect(guard(dir, home, claudeShape).code).toBe(2);
  });
});
