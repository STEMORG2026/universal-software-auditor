import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The session boundary: a report is not an ending, and one physical harness
 * session holds one MACP session.
 *
 * Two defects motivate this file, both lived through on 2026-10-26:
 *
 *   1. `submit` froze the session at `AWAITING-USER`, so answering a report
 *      needed `macp resume` with the owner's key between every round — and the
 *      agent could not act on "also do X" without him.
 *   2. Because the session was frozen, `conflictingLease` — which only looked at
 *      `ACTIVE` — saw nothing live, and a second session opened beside the first
 *      in the same checkout. `SA18` and `SA19` existed at once, in one
 *      conversation.
 *
 * The contract is the CLI's exit code and output, as in the rest of this suite.
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
  keys: { close: string; seal: string };
};

/**
 * This repository's gates are the six named in `scripts/macp/lib/gates.mjs`, and
 * each resolves to a package script in a consumer repo. The fixture supplies all
 * six as no-ops so a submit measures something real without running a suite
 * inside a suite.
 */
const SCRIPTS = {
  typecheck: 'node -e ""',
  lint: 'node -e ""',
  'format:check': 'node -e ""',
  test: 'node -e ""',
  'docs:all': 'node -e ""',
  'self-audit': 'node -e ""',
};

function makeRepo(): Repo {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-boundary-'));
  const home = mkdtempSync(path.join(tmpdir(), 'macp-boundary-home-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));

  const sh = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  sh(['init', '-q', '-b', 'master']);
  sh(['config', 'user.email', 'test@example.com']);
  sh(['config', 'user.name', 'test']);

  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: 'fixture', version: '0.0.1', private: true, scripts: SCRIPTS }, null, 2)}\n`,
  );
  // A gate that resolves to a package script makes the package manager write a
  // lockfile and a `node_modules/`. Neither is a source change, and the close
  // contract measures source — so they are ignored, as they are in the real repo.
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\npnpm-lock.yaml\n');
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

  const keys = {} as Repo['keys'];
  const lines: string[] = [];
  for (const [act, principal] of [
    ['close', 'macp-close'],
    ['seal', 'macp-seal'],
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
  return { dir, home, run, keys };
}

function branch(repo: Repo, name: string) {
  execFileSync('git', ['checkout', '-q', '-b', name], { cwd: repo.dir, encoding: 'utf8' });
}

function commit(repo: Repo, message: string) {
  execFileSync('git', ['add', '-A'], { cwd: repo.dir, encoding: 'utf8' });
  execFileSync('git', ['commit', '-qm', message], { cwd: repo.dir, encoding: 'utf8' });
}

function start(repo: Repo, id = 'T01', task = 'prove the boundary') {
  return repo.run([
    'start',
    '--agent',
    id,
    '--harness',
    'vitest',
    '--task',
    task,
    '--authorized-by',
    'the test said so',
    '--no-brief',
  ]);
}

function submit(repo: Repo, extra: string[] = []) {
  return repo.run([
    'submit',
    '--outcome',
    'COMPLETED',
    '--completed',
    'the change',
    '--next',
    'nothing',
    ...extra,
  ]);
}

/** The single lease file the fixture's home holds. */
function leaseFile(repo: Repo): string {
  const dir = path.join(repo.home, 'leases');
  return path.join(dir, readdirSync(dir)[0]);
}

function readLease(repo: Repo): Record<string, unknown> {
  return JSON.parse(readFileSync(leaseFile(repo), 'utf8')).leases as Record<string, unknown>;
}

function writeLeaseState(repo: Repo, state: string) {
  const store = JSON.parse(readFileSync(leaseFile(repo), 'utf8'));
  for (const lease of Object.values(store.leases) as Record<string, unknown>[]) lease.state = state;
  writeFileSync(leaseFile(repo), JSON.stringify(store, null, 2));
}

function sessionFile(repo: Repo, id: string): string {
  const name = readdirSync(path.join(repo.dir, 'state', 'sessions')).find((entry) =>
    entry.includes(`-${id}-`),
  );
  expect(name, `no session file for ${id}`).toBeTruthy();
  return path.join(repo.dir, 'state', 'sessions', name!);
}

function started(repo: Repo, id = 'T01') {
  branch(repo, 'feat/one');
  expect(start(repo, id).code).toBe(0);
  writeFileSync(path.join(repo.dir, 'tool.mjs'), 'export const ok = false;\n');
  commit(repo, 'feat: one line of work');
}

describe('a report is not an ending', () => {
  it('leaves the session IN-PROGRESS with a live lease', () => {
    const repo = makeRepo();
    started(repo);
    const r = submit(repo);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/session still IN-PROGRESS/);
    expect(repo.run(['status']).out).toMatch(/T01 \(IN-PROGRESS\)/);
    expect(Object.values(readLease(repo))[0].state).toBe('ACTIVE');
  });

  it('lets the agent act on feedback with no owner key', () => {
    const repo = makeRepo();
    started(repo);
    expect(submit(repo).code).toBe(0);

    // The owner said "also do X". No resume, no signature.
    writeFileSync(path.join(repo.dir, 'tool.mjs'), 'export const ok = "answered";\n');
    commit(repo, 'feat: the owner answered');
    expect(repo.run(['status']).out).toMatch(/IN-PROGRESS/);
  });

  it('replaces the report rather than piling one on top of another', () => {
    const repo = makeRepo();
    started(repo);
    expect(submit(repo).code).toBe(0);
    writeFileSync(path.join(repo.dir, 'tool.mjs'), 'export const ok = "second";\n');
    commit(repo, 'feat: second round');
    expect(submit(repo).code).toBe(0);

    const text = readFileSync(sessionFile(repo, 'T01'), 'utf8');
    const reports = text.match(/^## Submit report$/gm) ?? [];
    expect(reports).toHaveLength(1);
  });
});

describe('close acts on a report, not on a state', () => {
  it('refuses a session that was never reported', () => {
    const repo = makeRepo();
    started(repo);
    const r = repo.run(['close', '--ssh-key', repo.keys.close]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/has no report|nothing to close/);
  });

  it('refuses when a source file changed after the report', () => {
    const repo = makeRepo();
    started(repo);
    expect(submit(repo).code).toBe(0);
    writeFileSync(path.join(repo.dir, 'tool.mjs'), 'export const ok = "after";\n');
    commit(repo, 'feat: work after the report');

    const r = repo.run(['close', '--ssh-key', repo.keys.close]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/source changed after the gates ran/);
    expect(r.out).toMatch(/tool\.mjs/);
  });

  it('closes the reported tree with the owner key', () => {
    const repo = makeRepo();
    started(repo);
    expect(submit(repo).code).toBe(0);
    const r = repo.run(['close', '--ssh-key', repo.keys.close]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/COMPLETED T01/);
  });

  it('still closes a session the old code left in AWAITING-USER', () => {
    const repo = makeRepo();
    started(repo);
    expect(submit(repo).code).toBe(0);

    // What the previous release would have written.
    const file = sessionFile(repo, 'T01');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(/^\*\*Status:\*\*.*$/m, '**Status:** AWAITING-USER'),
    );
    writeLeaseState(repo, 'AWAITING-USER');

    const r = repo.run(['close', '--ssh-key', repo.keys.close]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/COMPLETED T01/);
  });
});

describe('one live session per repository', () => {
  it('refuses a second start while the first is ACTIVE', () => {
    const repo = makeRepo();
    started(repo);
    execFileSync('git', ['checkout', '-q', 'master'], { cwd: repo.dir, encoding: 'utf8' });
    branch(repo, 'feat/two');

    const r = start(repo, 'T02');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/conflict: session T01 holds a ACTIVE lease/);
    expect(r.out).toMatch(/one physical harness session, one MACP session/i);
  });

  it('refuses a second start after the first has only been REPORTED', () => {
    // The defect that produced SA18 and SA19 in one conversation: a submitted
    // session is not a closed one, and the guard used to see nothing live.
    const repo = makeRepo();
    started(repo);
    expect(submit(repo).code).toBe(0);
    writeLeaseState(repo, 'AWAITING-USER');
    // The report is a state change; commit it, or the branch switch is refused.
    commit(repo, 'chore(state): report');
    execFileSync('git', ['checkout', '-q', 'master'], { cwd: repo.dir, encoding: 'utf8' });
    branch(repo, 'feat/two');

    const r = start(repo, 'T02');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/holds a AWAITING-USER lease/);
  });

  it('allows a new start once the previous session is closed', () => {
    const repo = makeRepo();
    started(repo);
    expect(submit(repo).code).toBe(0);
    expect(repo.run(['close', '--ssh-key', repo.keys.close]).code).toBe(0);
    commit(repo, 'chore(state): close');

    execFileSync('git', ['checkout', '-q', 'master'], { cwd: repo.dir, encoding: 'utf8' });
    branch(repo, 'feat/two');
    const r = start(repo, 'T02');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/started T02/);
  });
});
