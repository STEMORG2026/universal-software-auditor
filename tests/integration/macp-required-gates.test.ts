import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The declared gate set cannot be narrowed after the work.
 *
 * Remediation finding F-04: `submit --gates <subset>` ran whatever the agent
 * named, and `close` then required only that *those* gates be green. So a report
 * could name one gate, close COMPLETED, and nothing in the record said a second
 * one existed. It is not hypothetical: porting the runtime on 2026-10-26 made
 * `detectGates` recognise three of this repository's six gates, and the first
 * submit recorded three and reported COMPLETED.
 *
 * The fix is a pair of facts in the report — `required_gates` (what the
 * repository declares) next to `gates` (what ran) — and a contract that refuses
 * COMPLETED while the second is smaller than the first. PARTIAL is still allowed:
 * naming the omission in `remaining[]` is the honest way to close short.
 */

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'scripts/macp/cli.mjs');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

type Repo = {
  dir: string;
  home: string;
  run: (args: string[]) => { code: number; out: string };
};

/** Three declared gates, all no-ops, so a submit is fast and green. */
const GATES = {
  gates: ['typecheck', 'lint', 'test'].map((name) => ({
    name,
    commands: [['node', '-e', '""']],
  })),
};

function makeRepo(): Repo {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-required-'));
  const home = mkdtempSync(path.join(tmpdir(), 'macp-required-home-'));
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
  execFileSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf8' });
  execFileSync('git', ['commit', '-qm', 'chore: init'], { cwd: dir, encoding: 'utf8' });
  execFileSync('git', ['checkout', '-q', '-b', 'feat/one'], { cwd: dir, encoding: 'utf8' });

  const started = run([
    'start',
    '--agent',
    'T01',
    '--harness',
    'vitest',
    '--task',
    'prove the gate set',
    '--authorized-by',
    'the test said so',
    '--no-brief',
  ]);
  expect(started.code, started.out).toBe(0);

  writeFileSync(path.join(dir, 'tool.mjs'), 'export const ok = false;\n');
  execFileSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf8' });
  execFileSync('git', ['commit', '-qm', 'feat: work'], { cwd: dir, encoding: 'utf8' });
  return { dir, home, run };
}

function handoff(repo: Repo): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(repo.dir, 'state/macp/handoff/T01.json'), 'utf8'));
}

const submit = (repo: Repo, extra: string[] = []) =>
  repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'the change', ...extra]);

describe('the declared gate set', () => {
  it('records what the repository declares next to what ran', () => {
    const repo = makeRepo();
    const r = submit(repo);
    expect(r.code, r.out).toBe(0);
    const h = handoff(repo);
    expect(h.required_gates).toEqual(['typecheck', 'lint', 'test']);
    expect(Object.keys(h.gates as Record<string, unknown>).sort()).toEqual([
      'lint',
      'test',
      'typecheck',
    ]);
  });

  it('refuses COMPLETED when the run narrows the declared set', () => {
    const repo = makeRepo();
    const r = submit(repo, ['--gates', 'test']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/every gate this repository declares/);
    expect(r.out).toMatch(/typecheck/);
    expect(r.out).toMatch(/lint/);
    // Nothing was written: a refused report must not leave a half-record behind.
    expect(readdirSync(path.join(repo.dir, 'state/macp/handoff')).length).toBe(0);
  });

  it('allows PARTIAL to close short, provided the omission is named', () => {
    const repo = makeRepo();
    const r = repo.run([
      'submit',
      '--outcome',
      'PARTIAL',
      '--gates',
      'test',
      '--completed',
      'the change',
      '--remaining',
      'typecheck and lint were not run',
      '--next',
      'run the other two gates',
    ]);
    expect(r.code, r.out).toBe(0);
    const h = handoff(repo);
    expect(h.required_gates).toEqual(['typecheck', 'lint', 'test']);
    expect(Object.keys(h.gates as Record<string, unknown>)).toEqual(['test']);
  });

  it('says so in the rendered block rather than leaving it to the reader', () => {
    const repo = makeRepo();
    repo.run([
      'submit',
      '--outcome',
      'PARTIAL',
      '--gates',
      'test',
      '--completed',
      'the change',
      '--remaining',
      'the other two',
      '--next',
      'run them',
    ]);
    const region = readFileSync(path.join(repo.dir, 'state/CONTINUATION.md'), 'utf8');
    expect(region).toMatch(/Declared by this repository: \*\*3\*\* · run: \*\*1\*\*/);
    expect(region).toMatch(/not run: typecheck, lint/);
  });
});
