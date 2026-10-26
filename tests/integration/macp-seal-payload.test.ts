import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * A seal must sign what a verifier will read.
 *
 * `seal` built its payload from values held in memory — `headSha(root)` and
 * `isoLocal()` — while `reopen` rebuilds the payload from the session file with
 * `sealPayloadFromText`. The two agree only while every field coincides, and one
 * of them is a timestamp taken at seal time that `close` had already written a
 * moment earlier. When the clock ticked between the two, the signature covered a
 * `closedAt` that is nowhere in the file, and verification failed with
 * "the file was edited after it was sealed" — on a file nobody had touched.
 *
 * Measured before the fix: 2 failures in 8 consecutive runs of the reopen test.
 * The test below removes the luck: it sleeps past a second boundary, which is
 * exactly the condition that used to break it, so the defect fails every time.
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
  keys: Record<string, string>;
  run: (a: string[]) => { code: number; out: string };
};

function makeRepo(): Repo {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-seal-'));
  const home = mkdtempSync(path.join(tmpdir(), 'macp-seal-home-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));

  const sh = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  sh(['init', '-q', '-b', 'master']);
  sh(['config', 'user.email', 'test@example.com']);
  sh(['config', 'user.name', 'test']);
  mkdirSync(path.join(dir, '.macp'), { recursive: true });
  writeFileSync(
    path.join(dir, '.macp', 'gates.json'),
    `${JSON.stringify({ gates: [{ name: 'ok', commands: [['node', '-e', '""']] }] }, null, 2)}\n`,
  );
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

  const keys: Record<string, string> = {};
  const lines: string[] = [];
  for (const [act, principal] of [
    ['close', 'macp-close'],
    ['seal', 'macp-seal'],
    ['reopen', 'macp-reopen'],
  ] as const) {
    const keyPath = path.join(home, `macp_${act}`);
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', keyPath, '-C', principal]);
    keys[act] = keyPath;
    const blob = readFileSync(`${keyPath}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
    lines.push(`${principal} ${blob}`);
  }
  mkdirSync(path.join(dir, 'state/macp'), { recursive: true });
  writeFileSync(path.join(dir, 'state/macp/allowed_signers'), `${lines.join('\n')}\n`);

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
    'prove the seal',
    '--authorized-by',
    'the test said so',
    '--no-brief',
  ]);
  expect(started.code, started.out).toBe(0);

  writeFileSync(path.join(dir, 'tool.mjs'), 'export const ok = false;\n');
  sh(['add', '-A']);
  sh(['commit', '-qm', 'feat: work']);
  expect(run(['submit', '--outcome', 'COMPLETED', '--completed', 'the change']).code).toBe(0);
  sh(['add', '-A']);
  sh(['commit', '-qm', 'chore(state): report']);
  expect(run(['close', '--ssh-key', keys.close]).code).toBe(0);
  sh(['add', '-A']);
  sh(['commit', '-qm', 'chore(state): close']);
  return { dir, home, keys, run };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('the seal payload', () => {
  it('survives a clock tick between close and seal', async () => {
    const repo = makeRepo();
    // `closedAt` is written by `close` and `isoLocal()` is taken again by `seal`.
    // Crossing a second boundary is the condition that used to invalidate the
    // signature; sleeping past one makes the defect deterministic.
    await sleep(1100);

    const sealed = repo.run([
      'seal',
      '--session',
      'T01',
      '--ssh-key',
      repo.keys.seal,
      '--instruction',
      'ship it',
    ]);
    expect(sealed.code, sealed.out).toBe(0);

    const reopened = repo.run([
      'reopen',
      '--session',
      'T01',
      '--ssh-key',
      repo.keys.reopen,
      '--reason',
      'one more line',
      '--delta',
      'records the trap',
    ]);
    expect(reopened.code, reopened.out).toBe(0);
    expect(reopened.out).toMatch(/REOPENED T01/);
  });

  it('verifies offline after the seal, and after a reopen', async () => {
    const repo = makeRepo();
    await sleep(1100);
    expect(
      repo.run(['seal', '--session', 'T01', '--ssh-key', repo.keys.seal, '--instruction', 'x'])
        .code,
    ).toBe(0);
    expect(repo.run(['verify']).code, repo.run(['verify']).out).toBe(0);

    repo.run([
      'reopen',
      '--session',
      'T01',
      '--ssh-key',
      repo.keys.reopen,
      '--reason',
      'more',
      '--delta',
      'a line',
    ]);
    expect(repo.run(['verify']).code).toBe(0);
  });
});
