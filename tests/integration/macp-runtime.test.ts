import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

type Repo = {
  dir: string;
  home: string;
  run: (args: string[]) => { code: number; out: string };
  /** One key per act (ADR-0046), created in the fixture home. */
  keys: Record<'close' | 'seal' | 'reopen' | 'destroy', string>;
};

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

  // One key per lifecycle act, and the authority file that lists them. The
  // fixture must model the real shape: a single key cannot stand in for four
  // principals, and the whole point of the change is that it cannot.
  const names = {
    close: 'macp_close',
    seal: 'macp_seal',
    reopen: 'macp_reopen',
    destroy: 'macp_destroy',
  } as const;
  const principals = {
    close: 'macp-close',
    seal: 'macp-seal',
    reopen: 'macp-reopen',
    destroy: 'macp-destroy',
  } as const;
  const keys = {} as Repo['keys'];
  const signerLines: string[] = [];
  for (const act of ['close', 'seal', 'reopen', 'destroy'] as const) {
    const keyPath = path.join(home, names[act]);
    execFileSync('ssh-keygen', [
      '-q',
      '-t',
      'ed25519',
      '-N',
      '',
      '-f',
      keyPath,
      '-C',
      principals[act],
    ]);
    keys[act] = keyPath;
    const blob = readFileSync(`${keyPath}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
    signerLines.push(`${principals[act]} ${blob}`);
  }
  mkdirSync(path.join(dir, 'state/macp'), { recursive: true });
  writeFileSync(path.join(dir, 'state/macp/allowed_signers'), `${signerLines.join('\n')}\n`);

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

/** The two-step finish: the agent submits, the owner closes. */
const finish = (repo: Repo, args: string[]) => {
  const submitted = repo.run(['submit', ...args]);
  if (submitted.code !== 0) return submitted;
  return repo.run(['close', '--ssh-key', repo.keys.close]);
};

describe('macp runtime — submit and close', { timeout: 60_000 }, () => {
  it('refuses a dirty source tree', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    writeFileSync(path.join(repo.dir, 'src.js'), 'x\n');
    const r = repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'nothing']);
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

    const r = repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'x']);
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
      'submit',
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
    const r = repo.run(['submit', '--outcome', 'PARTIAL', '--completed', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/remaining/);
    expect(r.out).toMatch(/next_recommended_task/);
  });

  it('records the output of a red gate, and allows a PARTIAL close on it', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    const pkg = JSON.parse(readFileSync(path.join(repo.dir, 'package.json'), 'utf8'));
    pkg.scripts.test = 'node -e "console.error(\'boom\'); process.exit(1)"';
    writeFileSync(path.join(repo.dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    commit(repo, 'test: fail loudly');

    const r = repo.run([
      'submit',
      '--outcome',
      'PARTIAL',
      '--completed',
      'x',
      '--remaining',
      'y',
      '--next',
      'z',
    ]);
    // Red, but it said why — so the record can carry the reason and a PARTIAL
    // close is honest. The refusal for a gate that said nothing is below.
    expect(r.code).toBe(0);
    const handoff = JSON.parse(
      readFileSync(path.join(repo.dir, 'state/macp/handoff/T01.json'), 'utf8'),
    );
    expect(handoff.gates.test.exit).toBe(1);
    expect(handoff.gates.test.tail.length).toBeGreaterThan(0);
  });

  it('refuses a red gate that recorded no output at all', () => {
    // This used to be unreachable through the CLI: every gate went through a
    // package manager, and the package manager always printed its own failure
    // line. The runtime now runs the gate's own command, so a silent failure is
    // reachable — and a record that says "test exited 1" with no reason is
    // exactly what the rule exists to refuse.
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    const pkg = JSON.parse(readFileSync(path.join(repo.dir, 'package.json'), 'utf8'));
    pkg.scripts.test = 'node -e "process.exit(1)"';
    writeFileSync(path.join(repo.dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    commit(repo, 'test: fail silently');

    const r = repo.run([
      'submit',
      '--outcome',
      'PARTIAL',
      '--completed',
      'x',
      '--remaining',
      'y',
      '--next',
      'z',
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/recorded without its output/);
  });

  it('writes the handoff region into CONTINUATION.md', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: do the thing');
    expect(finish(repo, ['--outcome', 'COMPLETED', '--completed', 'did it']).code).toBe(0);

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
    expect(repo.run(['submit', '--prepare']).code).toBe(0);

    writeFileSync(path.join(repo.dir, 'src.js'), 'late change\n');
    commit(repo, 'feat: two, after the freeze');
    const r = repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/HEAD moved/);
  });
  it('refuses to close when the key is loaded in ssh-agent', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: work');
    repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'x']);

    // A key in the agent signs with no prompt — the path by which an agent can
    // perform the owner's act without the owner typing anything.
    const bin = path.join(repo.home, 'bin');
    mkdirSync(bin, { recursive: true });
    const fingerprint = execFileSync('ssh-keygen', ['-lf', `${repo.keys.close}.pub`], {
      encoding: 'utf8',
    }).split(' ')[1];
    writeFileSync(path.join(bin, 'ssh-add'), `#!/bin/sh\necho "256 ${fingerprint} k (ED25519)"\n`, {
      mode: 0o755,
    });

    const r = spawnSync('node', [CLI, 'close', '--ssh-key', repo.keys.close], {
      cwd: repo.dir,
      encoding: 'utf8',
      env: { ...process.env, MACP_HOME: repo.home, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(r.status).toBe(1);
    expect(`${r.stdout ?? ''}${r.stderr ?? ''}`).toMatch(/loaded in ssh-agent/);
  });

  it('refuses to close when the key is loaded in ssh-agent', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: work');
    repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'x']);

    // A key in the agent signs with no prompt — the path by which an agent can
    // perform the owner's act without the owner typing anything.
    const bin = path.join(repo.home, 'bin');
    mkdirSync(bin, { recursive: true });
    const fingerprint = execFileSync('ssh-keygen', ['-lf', `${repo.keys.close}.pub`], {
      encoding: 'utf8',
    }).split(' ')[1];
    writeFileSync(path.join(bin, 'ssh-add'), `#!/bin/sh\necho "256 ${fingerprint} k (ED25519)"\n`, {
      mode: 0o755,
    });

    const r = spawnSync('node', [CLI, 'close', '--ssh-key', repo.keys.close], {
      cwd: repo.dir,
      encoding: 'utf8',
      env: { ...process.env, MACP_HOME: repo.home, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(r.status).toBe(1);
    expect(`${r.stdout ?? ''}${r.stderr ?? ''}`).toMatch(/loaded in ssh-agent/);
  });

  it('records the objective and the files this session changed', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    writeFileSync(path.join(repo.dir, 'src.js'), 'x\n');
    commit(repo, 'feat: add src');
    expect(repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'x']).code).toBe(0);

    const handoff = JSON.parse(
      readFileSync(path.join(repo.dir, 'state/macp/handoff/T01.json'), 'utf8'),
    );
    expect(handoff.objective).toMatch(/prove the machine/i);
    expect(handoff.files_changed.some((line: string) => line.includes('src.js'))).toBe(true);
    expect(handoff.start_head_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('prints the previous handoff when the next session starts', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: work');
    expect(repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'x']).code).toBe(0);
    // A reported session still owns the repository: the next session may only
    // open once the owner has closed this one. That is the boundary the gate
    // enforces, so the fixture has to walk through it rather than around it.
    expect(repo.run(['close', '--ssh-key', repo.keys.close]).code).toBe(0);
    commit(repo, 'chore(state): close');
    branch(repo, 'feat/two');

    const r = repo.run([
      'start',
      '--agent',
      'T02',
      '--harness',
      'vitest',
      '--task',
      'the next thing',
      '--authorized-by',
      'owner',
    ]);
    expect(r.code).toBe(0);
    // The brief used to read a heading nothing wrote, so the handoff never
    // reached the transcript and a fresh repo printed "Nothing yet" (F-12).
    expect(r.out).toMatch(/previous handoff \(machine-stamped\)/);
    expect(r.out).toMatch(/Handoff — T01/);
  });

  it('refuses to close a session the agent has not submitted', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: work');

    const r = repo.run(['close']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/macp submit/);
  });

  it('submit reports without ending the session — status stays IN-PROGRESS', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: work');

    expect(repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'x']).code).toBe(0);

    const dir = path.join(repo.dir, 'state/sessions');
    const file = path.join(dir, readdirSync(dir)[0]!);
    expect(readFileSync(file, 'utf8')).toMatch(/\*\*Status:\*\* IN-PROGRESS/);

    // The owner may answer the report, so the branch is not parked: it is live,
    // and the guard still permits the agent to act on what he says.
    const status = repo.run(['status']);
    expect(status.out).toMatch(/IN-PROGRESS/);
  });

  it('refuses to close when source changed after the gates ran', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: work');
    expect(repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'x']).code).toBe(0);

    // The tree the gates measured is gone; the report describes a tree that no
    // longer exists. This is the audit's F-08 closed at the other end.
    writeFileSync(path.join(repo.dir, 'src.js'), 'late\n');
    commit(repo, 'feat: late source change');

    const r = repo.run(['close']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/source changed after the gates ran/);
  });
});

describe('macp runtime — seal and reopen', { timeout: 60_000 }, () => {
  const sealed = (repo: Repo) => {
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: do the thing');
    expect(finish(repo, ['--outcome', 'COMPLETED', '--completed', 'did it']).code).toBe(0);
    const r = repo.run([
      'seal',
      '--session',
      'T01',
      '--instruction',
      'close it',
      '--ssh-key',
      repo.keys.seal,
    ]);
    expect(r.code).toBe(0);
    commit(repo, 'docs(session): seal T01');
    return r;
  };

  it('refuses to seal without a private key', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: x');
    finish(repo, ['--outcome', 'COMPLETED', '--completed', 'x']);
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

  it('seals, verifies, and refuses a reopen without the key', () => {
    const repo = makeRepo();
    sealed(repo);

    const sessionFile = path.join(
      repo.dir,
      'state/sessions',
      readdirSync(path.join(repo.dir, 'state/sessions'))[0]!,
    );
    expect(readFileSync(sessionFile, 'utf8')).toContain('**Seal signature:**');
    // The seal must not rewrite the authority: it is written once, by
    // `init-authority`, and a seal that replaced it is the audit's F-20.
    expect(readFileSync(path.join(repo.dir, 'state/macp/allowed_signers'), 'utf8')).toMatch(
      /macp-seal ssh-ed25519/,
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

  it('detects a tampered close block', () => {
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

  it('reopens with the key and re-verifies', () => {
    const repo = makeRepo();
    sealed(repo);

    const r = repo.run([
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
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/REOPENED T01/);
    expect(repo.run(['verify']).code).toBe(0);
    expect(repo.run(['status']).out).toMatch(/REOPENED/);
  });
  it('still verifies a seal made before the principal file existed', () => {
    const repo = makeRepo();
    sealed(repo);

    // Model the migration: the record was signed by the legacy key, and the
    // principal file arrived afterwards. Adding it must not invalidate history.
    const signers = readFileSync(path.join(repo.dir, 'state/macp/allowed_signers'), 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('macp-seal'))
      .join('\n');
    writeFileSync(path.join(repo.dir, 'state/macp/allowed_signers'), `${signers}\n`);
    writeFileSync(
      path.join(repo.dir, 'state/macp/owner.pub'),
      `${readFileSync(`${repo.keys.seal}.pub`, 'utf8').trim()}\n`,
    );

    const r = repo.run(['verify']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/2 signature\(s\) checked/);
  });

  // `macp resume` is gone. It existed because `submit` parked the session at
  // AWAITING-USER and the owner needed a signed way to let the agent back in;
  // `submit` no longer parks, so there is nothing to resume. A legacy session
  // sitting at AWAITING-USER is closed, not resumed.

  it('abandons an active session with the close key', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: half done');

    const r = repo.run(['abandon', '--ssh-key', repo.keys.close, '--reason', '"wrong branch"']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/ABANDONED T01/);
    // `status` reports the branch's live session, and an abandoned one is not
    // live — the durable record is the session file.
    const dir = path.join(repo.dir, 'state/sessions');
    expect(readFileSync(path.join(dir, readdirSync(dir)[0]!), 'utf8')).toMatch(
      /\*\*Status:\*\* ABANDONED/,
    );

    // The branch is free: a new session may start on it.
    const again = repo.run([
      'start',
      '--agent',
      'T02',
      '--harness',
      'vitest',
      '--task',
      'the real work',
      '--authorized-by',
      'owner',
    ]);
    expect(again.code).toBe(0);
  });

  it('refuses to abandon with the seal key', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);

    const r = repo.run(['abandon', '--ssh-key', repo.keys.seal, '--reason', '"r"']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/abandoning requires `macp-close`/);
  });

  it('refuses to close with the seal key — a signature is not enough', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: work');
    expect(repo.run(['submit', '--outcome', 'COMPLETED', '--completed', 'x']).code).toBe(0);

    const r = repo.run(['close', '--ssh-key', repo.keys.seal]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/closing requires `macp-close`/);
  });

  it('refuses to seal with the close key', () => {
    const repo = makeRepo();
    branch(repo, 'feat/one');
    repo.run(START);
    commit(repo, 'feat: work');
    finish(repo, ['--outcome', 'COMPLETED', '--completed', 'x']);

    const r = repo.run([
      'seal',
      '--session',
      'T01',
      '--instruction',
      'x',
      '--ssh-key',
      repo.keys.close,
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/sealing requires `macp-seal`/);
  });

  it('refuses to reopen with the seal key', () => {
    const repo = makeRepo();
    sealed(repo);

    const r = repo.run([
      'reopen',
      '--session',
      'T01',
      '--ssh-key',
      repo.keys.seal,
      '--reason',
      'r',
      '--delta',
      'd',
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/reopening requires `macp-reopen`/);
  });
});

describe('macp runtime — onboarding', () => {
  it('refuses an authority made of keys that have no passphrase', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'macp-authority-'));
    const keys = mkdtempSync(path.join(tmpdir(), 'macp-keys-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    cleanups.push(() => rmSync(keys, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', '-b', 'master', dir], { encoding: 'utf8' });
    spawnSync('node', [CLI, 'init-repo'], { cwd: dir, encoding: 'utf8' });
    for (const name of ['macp_close', 'macp_seal', 'macp_reopen', 'macp_destroy', 'macp_ack']) {
      execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(keys, name)]);
    }

    const r = spawnSync('node', [CLI, 'init-authority', '--dir', keys], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(`${r.stdout ?? ''}${r.stderr ?? ''}`).toMatch(/no passphrase/);
  });

  it('refuses an authority made of keys that have no passphrase', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'macp-authority-'));
    const keys = mkdtempSync(path.join(tmpdir(), 'macp-keys-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    cleanups.push(() => rmSync(keys, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', '-b', 'master', dir], { encoding: 'utf8' });
    spawnSync('node', [CLI, 'init-repo'], { cwd: dir, encoding: 'utf8' });
    for (const name of ['macp_close', 'macp_seal', 'macp_reopen', 'macp_destroy', 'macp_ack']) {
      execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(keys, name)]);
    }

    const r = spawnSync('node', [CLI, 'init-authority', '--dir', keys], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(`${r.stdout ?? ''}${r.stderr ?? ''}`).toMatch(/no passphrase/);
  });

  it('accepts the `--` separator that pnpm forwards', () => {
    const repo = makeRepo();
    // `pnpm run macp -- status` used to fail with `unknown command "--"`.
    const r = spawnSync('node', [CLI, '--', 'status'], {
      cwd: repo.dir,
      encoding: 'utf8',
      env: { ...process.env, MACP_HOME: repo.home },
    });
    expect(r.status).toBe(0);
  });

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
