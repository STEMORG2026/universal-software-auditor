import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gateStatus } from '../../scripts/macp/lib/gates.mjs';

/**
 * A gate has three outcomes, not two.
 *
 * `pass` and `fail` are measurements; `unverified` is the absence of one — the
 * tool is not installed, the gate was never configured, or the command timed out.
 * All three used to collapse into a non-zero exit, so "trivy is not installed on
 * this machine" was recorded as "trivy found something". A record that cannot
 * tell a red gate from an unread one is worse than no record: it reads as
 * evidence.
 *
 * USA's report already draws this line — PASS / UNKNOWN, `automationCoverage`,
 * *"unverified checks are excluded from the score rather than counted as
 * passes"*. These tests are that distinction, in the handoff.
 */

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'scripts/macp/cli.mjs');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

type Repo = { dir: string; home: string; run: (args: string[]) => { code: number; out: string } };

const GATES = {
  gates: [
    { name: 'ok', commands: [['node', '-e', '""']] },
    // A binary that cannot exist on any machine this test runs on.
    { name: 'missing_tool', commands: [['definitely-not-a-real-tool-xyz', '--version']] },
  ],
};

function makeRepo(): Repo {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-unverified-'));
  const home = mkdtempSync(path.join(tmpdir(), 'macp-unverified-home-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));

  const sh = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  sh(['init', '-q', '-b', 'master']);
  sh(['config', 'user.email', 'test@example.com']);
  sh(['config', 'user.name', 'test']);
  mkdirSync(path.join(dir, '.macp'), { recursive: true });
  writeFileSync(path.join(dir, '.macp', 'gates.json'), `${JSON.stringify(GATES, null, 2)}\n`);
  writeFileSync(path.join(dir, 'tool.mjs'), 'export const ok = true;\n');

  const run = (args: string[]) => {
    const result = spawnSync('node', [CLI, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, MACP_HOME: home },
    });
    return { code: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  };

  run(['init-repo']);
  sh(['add', '-A']);
  sh(['commit', '-qm', 'chore: init']);
  sh(['checkout', '-q', '-b', 'feat/one']);
  const started = run([
    'start',
    '--agent',
    'T01',
    '--harness',
    'vitest',
    '--task',
    'prove the verdict',
    '--authorized-by',
    'the test said so',
    '--no-brief',
  ]);
  expect(started.code, started.out).toBe(0);
  writeFileSync(path.join(dir, 'tool.mjs'), 'export const ok = false;\n');
  sh(['add', '-A']);
  sh(['commit', '-qm', 'feat: work']);
  return { dir, home, run };
}

const handoff = (repo: Repo) =>
  JSON.parse(readFileSync(path.join(repo.dir, 'state/macp/handoff/T01.json'), 'utf8')) as {
    gates: Record<string, { status?: string; exit: number; reason?: string }>;
  };

describe('a gate that produced no verdict', () => {
  it('is recorded as unverified, with the reason', () => {
    const repo = makeRepo();
    const r = repo.run([
      'submit',
      '--outcome',
      'PARTIAL',
      '--completed',
      'the change',
      '--remaining',
      'the missing tool',
      '--next',
      'install it',
    ]);
    expect(r.code, r.out).toBe(0);
    const gate = handoff(repo).gates.missing_tool;
    expect(gate.status).toBe('unverified');
    expect(gate.reason).toMatch(/is not installed/);
    // The green gate beside it is still a measurement.
    expect(handoff(repo).gates.ok.status).toBe('pass');
  });

  it('cannot be closed COMPLETED', () => {
    const repo = makeRepo();
    const r = repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'the change']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/requires a verdict from every gate that ran/);
    expect(r.out).toMatch(/missing_tool \(.*not installed/);
    expect(readdirSync(path.join(repo.dir, 'state/macp/handoff')).length).toBe(0);
  });

  it('is distinguished from a gate that genuinely failed', () => {
    const repo = makeRepo();
    const pkg = path.join(repo.dir, '.macp', 'gates.json');
    // Same shape, different meaning: this one runs and returns non-zero.
    writeFileSync(
      pkg,
      JSON.stringify({
        gates: [
          { name: 'ok', commands: [['node', '-e', '""']] },
          { name: 'red', commands: [['node', '-e', 'console.error("boom"); process.exit(1)']] },
        ],
      }),
    );
    execFileSync('git', ['add', '-A'], { cwd: repo.dir, encoding: 'utf8' });
    execFileSync('git', ['commit', '-qm', 'test: a red gate'], { cwd: repo.dir, encoding: 'utf8' });

    const r = repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'the change']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/exited non-zero/);
    expect(r.out).not.toMatch(/requires a verdict from every gate/);
  });

  it('says so in the rendered block', () => {
    const repo = makeRepo();
    repo.run([
      'submit',
      '--outcome',
      'PARTIAL',
      '--completed',
      'the change',
      '--remaining',
      'the missing tool',
      '--next',
      'install it',
    ]);
    const region = readFileSync(path.join(repo.dir, 'state/CONTINUATION.md'), 'utf8');
    expect(region).toMatch(/\| missing_tool \| unverified \|/);
    expect(region).toMatch(/verified: \*\*1\*\*/);
  });
});

describe('gateStatus', () => {
  it('reads a record written before statuses existed from its exit code', () => {
    expect(gateStatus({ exit: 0 })).toBe('pass');
    expect(gateStatus({ exit: 1 })).toBe('fail');
  });

  it('trusts an explicit status over the exit code', () => {
    // A missing tool exits non-zero but is not a failure.
    expect(gateStatus({ status: 'unverified', exit: 127 })).toBe('unverified');
  });

  it('treats an unknown status string as absent rather than passing', () => {
    expect(gateStatus({ status: 'weird', exit: 1 })).toBe('fail');
  });
});
