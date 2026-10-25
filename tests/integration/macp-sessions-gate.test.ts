import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Integration tests for the session lifecycle gate (check-sessions.mjs).
 *
 * The contract is the exit code and stderr, driven as a real process in a real
 * repository — the same way the CI job and the master-push hook run it.
 */
const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/check-sessions.mjs');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const HEADER =
  '**Agent:** TEST (tester)\n**Harness:** vitest\n**History:** not exported\n' +
  '**Branch:** feat/x\n**Started:** 2026-10-02T00:00:00+05:45\n' +
  '**Status:** COMPLETED\n**Base commit:** abc1234\n';

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-sessions-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', '-b', 'master', dir], { encoding: 'utf8' });
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir, encoding: 'utf8' });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir, encoding: 'utf8' });
  mkdirSync(path.join(dir, 'state/sessions'), { recursive: true });
  writeFileSync(
    path.join(dir, 'state/REGISTRY.md'),
    '# REGISTRY\n\n## Active Agents\n\n**None.**\n',
  );
  writeFileSync(path.join(dir, 'file.txt'), 'x\n');
  return dir;
}

const run = (dir: string) => {
  const result = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  return { code: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

const INDEX = (rows: string[]) =>
  [
    '# INDEX.md',
    '',
    '| ID | Date | Agent | Harness | Branch | Task | Status | File |',
    '| -- | ---- | ----- | ------- | ------ | ---- | ------ | ---- |',
    ...rows,
    '',
  ].join('\n');

describe('check-sessions gate', () => {
  it('notices a session whose file was deleted but whose INDEX row remains', () => {
    const dir = repo();
    writeFileSync(path.join(dir, 'state/sessions/20261002-0000-TEST1-one.md'), HEADER);
    writeFileSync(path.join(dir, 'state/sessions/20261003-0000-TEST2-two.md'), HEADER);
    writeFileSync(
      path.join(dir, 'state/INDEX.md'),
      INDEX([
        '| `TEST1` | 2026-10-02 | TEST1 | vitest | `feat/x` | one | COMPLETED | `sessions/20261002-0000-TEST1-one.md` |',
        '| `TEST2` | 2026-10-03 | TEST2 | vitest | `feat/x` | two | COMPLETED | `sessions/20261003-0000-TEST2-two.md` |',
      ]),
    );

    // One record disappears; the index still claims it exists. Deleting a sealed
    // session was invisible before this check (F-11).
    rmSync(path.join(dir, 'state/sessions/20261002-0000-TEST1-one.md'));

    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/row for TEST1/);
    expect(r.out).toMatch(/record was deleted, not closed/);
  });

  it('passes when every INDEX row resolves to a file', () => {
    const dir = repo();
    writeFileSync(path.join(dir, 'state/sessions/20261002-0000-TEST1-one.md'), HEADER);
    writeFileSync(
      path.join(dir, 'state/INDEX.md'),
      INDEX([
        '| `TEST1` | 2026-10-02 | TEST1 | vitest | `feat/x` | one | COMPLETED | `sessions/20261002-0000-TEST1-one.md` |',
      ]),
    );

    expect(run(dir).code).toBe(0);
  });
});
