import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Integration tests for the MACP runtime (ADR-0045).
 *
 * The contract is the CLI's exit code and output, driven as a real process in a
 * real repository — not the internal functions. Every case below corresponds to
 * a transition or a refusal in the state machine, and each one was watched
 * failing before the code that satisfies it existed.
 */

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'scripts/macp/cli.mjs');
const KEY = path.join(process.env.HOME ?? '', '.ssh/id_ed25519');
const HAS_KEY = existsSync(KEY);

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

type Repo = { dir: string; home: string; run: (args: string[]) => { code: number; out: string } };

/** A throwaway repository with no-op gates, so `close` can run for real. */
function makeRepo(): Repo {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-runtime-'));
  const home = mkdtempSync(path.join(tmpdir(), 'macp-home-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));

  const sh = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  sh(['init', '-q', '-b', 'master']);
  sh(['config', 'user.email', 'test@example.com']);
  sh(['config', 'user.name', 'test']);

  writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\npnpm-lock.yaml\n');
  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'fixture',
        version: '0.0.1',
        private: true,
        scripts: {
          typecheck: 'node -e ""',
          lint: 'node -e ""',
          'format:check': 'node -e ""',
          test: 'node -e ""',
          'docs:all': 'node -e ""',
          'self-audit': 'node -e ""',
        },
      },
      null,
      2,
    )}\n`,
  );

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
  return { dir, home, run };
}

function branch(repo: Repo, name: string) {
  execFileSync('git', ['checkout', '-q', '-b', name], { cwd: repo.dir, encoding: 'utf8' });
}

function commit(repo: Repo, message: string) {
  execFileSync('git', ['add', '-A'], { cwd: repo.dir, encoding: 'utf8' });
  execFileSync('git', ['commit', '-qm', message], { cwd: repo.dir, encoding: 'utf8' });
}

const START = [
  'start',
  '--agent',
  'T01',
  '--harness',
  'vitest',
  '--task',
  'prove the machine',
  '--authorized-by',
  'the test said so',
  '--no-brief',
];

describe('macp runtime — start', () => {
  it('refuses to open a session on master', () => {
    const repo = makeRepo();
    const r = repo.run(START);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/does not start on master/);
  });

  it('registers the session, the plan, the registry row and the lease', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    const r = repo.run(START);
    expect(r.code).toBe(0);

    expect(readdirSync(path.join(repo.dir, 'state/sessions')).join(',')).toContain('T01');
    expect(existsSync(path.join(repo.dir, 'state/plans/agent-T01-prove-the-machine.md'))).toBe(
      true,
    );
    expect(readFileSync(path.join(repo.dir, 'state/REGISTRY.md'), 'utf8')).toContain('### T01');
    expect(readFileSync(path.join(repo.dir, 'state/INDEX.md'), 'utf8')).toContain(
      '| IN-PROGRESS |',
    );

    const leases = readdirSync(path.join(repo.home, 'leases'));
    expect(leases.join(',')).toMatch(/\.json$/);
  });

  it('is idempotent: a second start resumes rather than conflicting', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    expect(repo.run(START).code).toBe(0);
    const second = repo.run(START);
    expect(second.code).toBe(0);
    expect(second.out).toMatch(/resumed T01/);
    const registry = readFileSync(path.join(repo.dir, 'state/REGISTRY.md'), 'utf8');
    expect(registry.match(/### T01/g)).toHaveLength(1);
  });

  it('refuses a second agent on the same branch', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    expect(repo.run(START).code).toBe(0);
    const other = repo.run([...START.slice(0, 2), 'T02', ...START.slice(3)]);
    expect(other.code).toBe(1);
    expect(other.out).toMatch(/conflict/);
  });

  it('refuses a session while another branch holds the lease in the same tree', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    expect(repo.run(START).code).toBe(0);
    branch(repo, 'feat/two');
    const second = repo.run(START);
    expect(second.code).toBe(1);
    expect(second.out).toMatch(/conflict/);
  });
});

describe('macp runtime — log and queue', () => {
  it('refuses to log without a lease, even when a session file exists', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    expect(repo.run(START).code).toBe(0);
    rmSync(path.join(repo.home, 'leases'), { recursive: true, force: true });
    const r = repo.run(['log', '--type', 'DISCOVERY', '--summary', 'no lease here']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/no lease/);
  });

  it('queues BUG_FOUND and DEFERRED, and resolves them', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);

    expect(repo.run(['log', '--type', 'BUG_FOUND', '--summary', 'the widget lies']).code).toBe(0);
    expect(repo.run(['log', '--type', 'DEFERRED', '--summary', 'rewrite the parser']).code).toBe(0);
    expect(repo.run(['log', '--type', 'DISCOVERY', '--summary', 'not queued']).code).toBe(0);

    const listed = repo.run(['queue']);
    expect(listed.out).toContain('the widget lies');
    expect(listed.out).toContain('rewrite the parser');
    expect(listed.out).not.toContain('not queued');

    expect(repo.run(['queue', '--done', 'Q001']).code).toBe(0);
    expect(repo.run(['queue']).out).not.toContain('the widget lies');
  });
});

describe('macp runtime — close', () => {
  it('refuses a dirty source tree', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    writeFileSync(path.join(repo.dir, 'src.js'), 'x\n');
    const r = repo.run(['close', '--outcome', 'COMPLETED', '--completed', 'nothing']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not clean/);
  });

  it('refuses COMPLETED when a gate is red, and names it', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    const pkg = JSON.parse(readFileSync(path.join(repo.dir, 'package.json'), 'utf8'));
    pkg.scripts.test = 'node -e "process.exit(3)"';
    writeFileSync(path.join(repo.dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    commit(repo, 'test: make one gate red');

    const r = repo.run(['close', '--outcome', 'COMPLETED', '--completed', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/test/);
    expect(r.out).toMatch(/PARTIAL or BLOCKED/);
  });

  it('allows PARTIAL to close red when the remainder is named', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    const pkg = JSON.parse(readFileSync(path.join(repo.dir, 'package.json'), 'utf8'));
    pkg.scripts.test = 'node -e "console.error(\'boom\'); process.exit(3)"';
    writeFileSync(path.join(repo.dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    commit(repo, 'test: make one gate red');

    const r = repo.run([
      'close',
      '--outcome',
      'PARTIAL',
      '--completed',
      'the part that works',
      '--remaining',
      'the gate',
      '--next',
      'fix the gate',
    ]);
    expect(r.code).toBe(0);

    const handoff = JSON.parse(
      readFileSync(path.join(repo.dir, 'state/macp/handoff/T01.json'), 'utf8'),
    );
    expect(handoff.outcome).toBe('PARTIAL');
    expect(handoff.gates.test.exit).toBe(3);
    expect(handoff.gates.test.tail).toContain('boom');
    expect(handoff.working_tree_clean).toBe(true);
    expect(handoff.code_commit_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('refuses PARTIAL without a next task, and without a remainder', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    const r = repo.run(['close', '--outcome', 'PARTIAL', '--completed', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/remaining/);
    expect(r.out).toMatch(/next_recommended_task/);
  });

  it('records a tail even when the failing gate itself printed nothing', () => {
    // A red gate that said nothing may not close as PARTIAL — otherwise the next
    // agent inherits "test exited 1" and no idea why. The rule lives in
    // `validateHandoff` and is unit-tested in `tests/unit/macp-handoff.test.ts`:
    // no command run through a package manager fails with a genuinely empty
    // tail, because pnpm prints its own ELIFECYCLE line, so this path cannot be
    // reached through the CLI at all.
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    const pkg = JSON.parse(readFileSync(path.join(repo.dir, 'package.json'), 'utf8'));
    pkg.scripts.test = 'node -e "process.exit(1)"';
    writeFileSync(path.join(repo.dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    commit(repo, 'test: fail silently');

    const r = repo.run([
      'close',
      '--outcome',
      'PARTIAL',
      '--completed',
      'x',
      '--remaining',
      'y',
      '--next',
      'z',
    ]);
    // The gate is red but did print something (pnpm's ELIFECYCLE line), so the
    // close is allowed. The refusal for a truly silent gate is unit-tested.
    expect(r.code).toBe(0);
    const handoff = JSON.parse(
      readFileSync(path.join(repo.dir, 'state/macp/handoff/T01.json'), 'utf8'),
    );
    expect(handoff.gates.test.exit).toBe(1);
    expect(handoff.gates.test.tail.length).toBeGreaterThan(0);
  });

  it('writes the handoff region into CONTINUATION.md', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: do the thing');
    expect(repo.run(['close', '--outcome', 'COMPLETED', '--completed', 'did it']).code).toBe(0);

    const continuation = readFileSync(path.join(repo.dir, 'state/CONTINUATION.md'), 'utf8');
    expect(continuation).toContain('<!-- macp:handoff:begin -->');
    expect(continuation).toContain('Handoff — T01 (COMPLETED)');
    expect(continuation).toContain('| typecheck | 0 |');
  });

  it('aborts the close when HEAD moves after the freeze', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: one');
    expect(repo.run(['close', '--prepare']).code).toBe(0);

    writeFileSync(path.join(repo.dir, 'src.js'), 'late change\n');
    commit(repo, 'feat: two, after the freeze');
    const r = repo.run(['close', '--outcome', 'COMPLETED', '--completed', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/HEAD moved/);
  });
});

describe('macp runtime — seal and reopen', () => {
  const sealed = (repo: Repo) => {
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: do the thing');
    expect(repo.run(['close', '--outcome', 'COMPLETED', '--completed', 'did it']).code).toBe(0);
    const r = repo.run(['seal', '--session', 'T01', '--instruction', 'close it', '--ssh-key', KEY]);
    expect(r.code).toBe(0);
    commit(repo, 'docs(session): seal T01');
    return r;
  };

  it.skipIf(!HAS_KEY)('refuses to seal without a private key', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: x');
    repo.run(['close', '--outcome', 'COMPLETED', '--completed', 'x']);
    const r = repo.run([
      'seal',
      '--session',
      'T01',
      '--instruction',
      'close it',
      '--ssh-key',
      '/nonexistent/key',
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/no SSH private key/);
  });

  it.skipIf(!HAS_KEY)('seals, verifies, and refuses a reopen without the key', () => {
    const repo = makeRepo();
    sealed(repo);

    const sessionFile = path.join(
      repo.dir,
      'state/sessions',
      readdirSync(path.join(repo.dir, 'state/sessions'))[0]!,
    );
    expect(readFileSync(sessionFile, 'utf8')).toContain('**Seal signature:**');
    expect(readFileSync(path.join(repo.dir, 'state/macp/owner.pub'), 'utf8')).toContain(
      'ssh-ed25519',
    );

    expect(repo.run(['verify']).code).toBe(0);

    const noKey = repo.run([
      'reopen',
      '--session',
      'T01',
      '--ssh-key',
      '/nonexistent/key',
      '--reason',
      'r',
      '--delta',
      'd',
    ]);
    expect(noKey.code).toBe(1);
    expect(noKey.out).toMatch(/no SSH private key/);
  });

  it.skipIf(!HAS_KEY)('detects a tampered close block', () => {
    const repo = makeRepo();
    sealed(repo);

    const dir = path.join(repo.dir, 'state/sessions');
    const file = path.join(dir, readdirSync(dir)[0]!);
    const original = readFileSync(file, 'utf8');
    writeFileSync(file, original.replace('close it', 'close it now'));

    const r = repo.run(['verify']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/does not verify/);
  });

  it.skipIf(!HAS_KEY)('reopens with the key and re-verifies', () => {
    const repo = makeRepo();
    sealed(repo);

    const r = repo.run([
      'reopen',
      '--session',
      'T01',
      '--ssh-key',
      KEY,
      '--reason',
      'one more line',
      '--delta',
      'records the trap',
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/REOPENED T01/);
    expect(repo.run(['verify']).code).toBe(0);
    expect(repo.run(['status']).out).toMatch(/REOPENED/);
  });
});

describe('macp runtime — onboarding', () => {
  it('init-repo scaffolds state/ and installs the guard', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'macp-init-'));
    const home = mkdtempSync(path.join(tmpdir(), 'macp-init-home-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    cleanups.push(() => rmSync(home, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', '-b', 'master', dir], { encoding: 'utf8' });

    const r = spawnSync('node', [CLI, 'init-repo'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, MACP_HOME: home },
    });
    expect(r.status).toBe(0);
    for (const rel of [
      'state/sessions',
      'state/plans',
      'state/macp/handoff',
      'state/REGISTRY.md',
      'state/INDEX.md',
      'state/CONTINUATION.md',
      'state/macp/queue.md',
    ]) {
      expect(existsSync(path.join(dir, rel))).toBe(true);
    }
    expect(existsSync(path.join(home, 'hooks/pretool.mjs'))).toBe(true);
  });

  it('install-hooks writes the adapter for each harness it claims', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'macp-hooks-'));
    cleanups.push(() => rmSync(home, { recursive: true, force: true }));

    for (const harness of ['opencode', 'hermes', 'dsh']) {
      const r = spawnSync('node', [CLI, 'install-hooks', '--harness', harness, '--home', home], {
        encoding: 'utf8',
        env: { ...process.env, MACP_HOME: home },
      });
      expect(r.status).toBe(0);
    }
    expect(existsSync(path.join(home, '.config/opencode/plugins/macp-guard.ts'))).toBe(true);
    expect(existsSync(path.join(home, '.hermes/plugins/macp-guard/__init__.py'))).toBe(true);
    expect(existsSync(path.join(home, 'hooks/dsh-guard.sh'))).toBe(true);
  });

  it('rejects an unknown harness', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'macp-hooks-bad-'));
    cleanups.push(() => rmSync(home, { recursive: true, force: true }));
    const r = spawnSync('node', [CLI, 'install-hooks', '--harness', 'vim'], {
      encoding: 'utf8',
      env: { ...process.env, MACP_HOME: home },
    });
    expect(r.status).toBe(2);
  });
});

describe('macp runtime — backend boundary', () => {
  it('the JARVIS backend refuses rather than pretending to work', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    const r = spawnSync('node', [CLI, 'status'], {
      cwd: repo.dir,
      encoding: 'utf8',
      env: { ...process.env, MACP_HOME: repo.home, MACP_BACKEND: 'jarvis' },
    });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toMatch(/MACP_JARVIS_URL is unset/);
  });
});
