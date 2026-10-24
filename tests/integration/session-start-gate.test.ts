import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Integration tests for the start-of-session gate (ADR-0044, hardened by
 * ADR-0045).
 *
 * The gate is a standalone script run by the pre-commit hook and CI; these tests
 * drive it exactly as the hook does — a real `node scripts/…` process in a real
 * git repository — because the contract is its exit code and stderr, not its
 * functions.
 *
 * Every fixture here is a git repository. The first version of this suite used
 * bare directories, which is why it could not see the defect that mattered: the
 * gate decided nothing about a branch it could not read, and passed. A test
 * that cannot express the failure cannot catch it.
 */

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/check-session-start.mjs');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

type Fixture = { dir: string; home: string };

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

/**
 * A repository with a `master` commit, checked out on `branch`.
 *
 * `state/` is optional so the bootstrap case can be expressed, and `work` adds a
 * staged change — the condition under which the gate must demand a session.
 */
function fixture({
  branch = 'feat/x',
  state = true,
  work = true,
}: { branch?: string; state?: boolean; work?: boolean } = {}): Fixture {
  const dir = mkdtempSync(path.join(tmpdir(), 'usa-session-gate-'));
  const home = mkdtempSync(path.join(tmpdir(), 'usa-session-home-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));

  git(dir, ['init', '-q', '-b', 'master']);
  git(dir, ['config', 'user.email', 't@t.t']);
  git(dir, ['config', 'user.name', 't']);
  writeFileSync(path.join(dir, 'file.txt'), 'x\n');
  if (state) mkdirSync(path.join(dir, 'state', 'sessions'), { recursive: true });
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'init']);
  if (branch !== 'master') git(dir, ['checkout', '-q', '-b', branch]);
  if (work) {
    writeFileSync(path.join(dir, 'file.txt'), 'changed\n');
    git(dir, ['add', 'file.txt']);
  }
  return { dir, home };
}

function session(
  dir: string,
  {
    name,
    branch,
    status,
    agent = 'TEST',
  }: {
    name: string;
    branch: string;
    status: string;
    agent?: string;
  },
) {
  mkdirSync(path.join(dir, 'state/sessions'), { recursive: true });
  writeFileSync(
    path.join(dir, 'state/sessions', name),
    `**Agent:** ${agent} (tester)\n**Harness:** vitest\n**History:** not exported\n` +
      `**Branch:** ${branch}\n**Started:** 2026-10-02T00:00:00+05:45\n` +
      `**Status:** ${status}\n**Base commit:** abc1234\n`,
  );
}

function plan(dir: string, agent = 'TEST') {
  mkdirSync(path.join(dir, 'state/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'state/plans', `agent-${agent}-slug.md`), '# plan\n');
}

function registry(dir: string, body: string) {
  writeFileSync(
    path.join(dir, 'state/REGISTRY.md'),
    `# REGISTRY\n\n## Active Agents\n\n${body}\n\n---\n`,
  );
}

/** The lease `macp start` writes, keyed exactly as the gate derives it. */
function lease(home: string, dir: string, branch: string) {
  const identity = path.resolve(dir);
  const slug = identity
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .toLowerCase();
  const id = `${slug}-${createHash('sha256').update(identity).digest('hex').slice(0, 8)}`;
  mkdirSync(path.join(home, 'leases'), { recursive: true });
  writeFileSync(
    path.join(home, 'leases', `${id}.json`),
    JSON.stringify({
      schema: 'macp-lease-v1',
      leases: { [branch]: { branch, session: 'TEST', state: 'ACTIVE', repoRoot: dir } },
    }),
  );
}

function run(f: Fixture, env: Record<string, string> = {}) {
  const result = spawnSync('node', [SCRIPT], {
    cwd: f.dir,
    encoding: 'utf8',
    env: { ...process.env, MACP_HOME: f.home, GITHUB_ACTIONS: '', ...env },
  });
  return { code: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('check-session-start gate — shape', () => {
  it('passes when there is no state/ directory (bootstrap case)', () => {
    const f = fixture({ state: false });
    const r = run(f);
    expect(r.code).toBe(0);
    expect(r.out).toContain('bootstrap case');
  });

  it('passes a branch that carries no work', () => {
    const f = fixture({ work: false });
    const r = run(f);
    expect(r.code).toBe(0);
    expect(r.out).toContain('no staged change');
  });

  it('passes on master when the newest session is COMPLETED', () => {
    const f = fixture({ branch: 'master', work: false });
    session(f.dir, { name: '20261001-0000-TEST-old.md', branch: 'docs/old', status: 'COMPLETED' });
    expect(run(f).code).toBe(0);
  });

  it('passes on master when the newest session is CLOSED', () => {
    const f = fixture({ branch: 'master', work: false });
    session(f.dir, { name: '20261001-0000-TEST-old.md', branch: 'docs/old', status: 'CLOSED' });
    expect(run(f).code).toBe(0);
  });

  it('fails on master when the newest session is still IN-PROGRESS', () => {
    const f = fixture({ branch: 'master', work: false });
    session(f.dir, {
      name: '20261001-0000-TEST-old.md',
      branch: 'docs/old',
      status: 'IN-PROGRESS',
    });
    const r = run(f);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/must be COMPLETED or CLOSED/);
  });

  it('passes on a bot branch even with work staged', () => {
    const f = fixture({ branch: 'dependabot/npm_and_yarn/x' });
    expect(run(f).code).toBe(0);
    expect(run(f).out).toMatch(/bot branch/);
  });

  it('fails a detached HEAD that carries work', () => {
    const f = fixture({ branch: 'master', work: false });
    session(f.dir, { name: '20261001-0000-TEST-old.md', branch: 'docs/old', status: 'COMPLETED' });
    git(f.dir, ['checkout', '-q', '--detach']);
    writeFileSync(path.join(f.dir, 'file.txt'), 'detached\n');
    git(f.dir, ['add', 'file.txt']);
    const r = run(f);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/detached/);
  });
});

describe('check-session-start gate — the skipped-startup defect', () => {
  it('fails a feature branch with work and no session for that branch', () => {
    const f = fixture();
    // The newest session belongs to somebody else's finished branch — the exact
    // state of master between sessions, which the old gate read as approval.
    session(f.dir, { name: '20261001-0000-OLD1-old.md', branch: 'docs/old', status: 'COMPLETED' });
    const r = run(f);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/no session in state\/sessions\/ names branch "feat\/x"/);
  });

  it('fails when the session names the branch but is finished', () => {
    const f = fixture();
    session(f.dir, { name: '20261001-0000-TEST-x.md', branch: 'feat/x', status: 'COMPLETED' });
    plan(f.dir);
    registry(f.dir, '### TEST\n');
    lease(f.home, f.dir, 'feat/x');
    const r = run(f);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/none is IN-PROGRESS or REOPENED/);
  });

  it('fails a live session with no plan', () => {
    const f = fixture();
    session(f.dir, { name: '20261001-0000-TEST-x.md', branch: 'feat/x', status: 'IN-PROGRESS' });
    registry(f.dir, '### TEST\n');
    lease(f.home, f.dir, 'feat/x');
    const r = run(f);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/STEP 10/);
  });

  it('fails a live session that is not in REGISTRY', () => {
    const f = fixture();
    session(f.dir, { name: '20261001-0000-TEST-x.md', branch: 'feat/x', status: 'IN-PROGRESS' });
    plan(f.dir);
    registry(f.dir, '**None.** No session is open.\n');
    lease(f.home, f.dir, 'feat/x');
    const r = run(f);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/STEP 9/);
  });

  it('fails when everything is registered but no lease proves the startup ran', () => {
    const f = fixture();
    session(f.dir, { name: '20261001-0000-TEST-x.md', branch: 'feat/x', status: 'IN-PROGRESS' });
    plan(f.dir);
    registry(f.dir, '### TEST\n');
    const r = run(f);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/no local lease/);
  });

  it('passes when the session, the plan, the registry row and the lease all exist', () => {
    const f = fixture();
    session(f.dir, { name: '20261001-0000-TEST-x.md', branch: 'feat/x', status: 'IN-PROGRESS' });
    plan(f.dir);
    registry(f.dir, '### TEST\n');
    lease(f.home, f.dir, 'feat/x');
    const r = run(f);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/OK \(feat\/x\)/);
  });

  it('accepts REOPENED as a live status', () => {
    const f = fixture();
    session(f.dir, { name: '20261001-0000-TEST-x.md', branch: 'feat/x', status: 'REOPENED' });
    plan(f.dir);
    registry(f.dir, '### TEST\n');
    lease(f.home, f.dir, 'feat/x');
    expect(run(f).code).toBe(0);
  });

  it('fails when the lease belongs to a different session than the live file', () => {
    const f = fixture();
    session(f.dir, { name: '20261001-0000-TEST-x.md', branch: 'feat/x', status: 'IN-PROGRESS' });
    plan(f.dir);
    registry(f.dir, '### TEST\n');
    lease(f.home, f.dir, 'feat/x');
    const leases = JSON.parse(
      execFileSync(
        'cat',
        [
          path.join(
            f.home,
            'leases',
            execFileSync('ls', [path.join(f.home, 'leases')], { encoding: 'utf8' }).trim(),
          ),
        ],
        {
          encoding: 'utf8',
        },
      ),
    );
    leases.leases['feat/x'].session = 'OTHER9';
    writeFileSync(
      path.join(
        f.home,
        'leases',
        execFileSync('ls', [path.join(f.home, 'leases')], { encoding: 'utf8' }).trim(),
      ),
      JSON.stringify(leases),
    );
    const r = run(f);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/belongs to OTHER9/);
  });
});

describe('check-session-start gate — CI', () => {
  it('skips the lease requirement in GitHub Actions but still demands the session', () => {
    const f = fixture();
    session(f.dir, { name: '20261001-0000-TEST-x.md', branch: 'feat/x', status: 'IN-PROGRESS' });
    plan(f.dir);
    registry(f.dir, '### TEST\n');

    const withoutSession = fixture();
    const ci = run(withoutSession, { GITHUB_ACTIONS: 'true' });
    expect(ci.code).toBe(1);
    expect(ci.out).toMatch(/no session/);

    const ok = run(f, { GITHUB_ACTIONS: 'true' });
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/local lease not required/);
  });

  it('reads the branch from GITHUB_HEAD_REF, because a PR checkout is detached', () => {
    const f = fixture({ branch: 'master', work: false });
    git(f.dir, ['checkout', '-q', '--detach']);
    writeFileSync(path.join(f.dir, 'file.txt'), 'pr work\n');
    git(f.dir, ['add', 'file.txt']);
    session(f.dir, { name: '20261001-0000-TEST-x.md', branch: 'feat/x', status: 'IN-PROGRESS' });
    plan(f.dir);
    registry(f.dir, '### TEST\n');

    const r = run(f, { GITHUB_ACTIONS: 'true', GITHUB_HEAD_REF: 'feat/x' });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/OK \(feat\/x\)/);
  });
});

/**
 * The close has to be recordable, or the protocol cannot close.
 *
 * `macp seal` runs after the session is already CLOSED, so the commit that
 * records it lands on a branch with no live session and no lease — and the gate
 * refused exactly that commit while this feature was being built. The allowance
 * is what these tests pin: bookkeeping forever, the close commit once, and
 * nothing else.
 */
describe('check-session-start gate — recording a closed session', () => {
  /** A branch whose newest session is CLOSED, sealed at the given commit. */
  function sealed({ branch = 'feat/x', at }: { branch?: string; at?: string } = {}) {
    const f = fixture({ branch });
    session(f.dir, { name: '20261024-0000-TEST-x.md', branch, status: 'IN-PROGRESS' });
    git(f.dir, ['add', '-A']);
    git(f.dir, ['commit', '-qm', 'chore: register the session']);
    const code = git(f.dir, ['rev-parse', 'HEAD']);
    writeFileSync(
      path.join(f.dir, 'state/sessions', '20261024-0000-TEST-x.md'),
      `**Agent:** TEST (tester)\n**Harness:** vitest\n**History:** not exported\n` +
        `**Branch:** ${branch}\n**Started:** 2026-10-24T00:00:00+05:45\n` +
        `**Status:** CLOSED\n**Base commit:** abc1234\n\n## Close\n\n` +
        `- **Closed by:** owner — instruction: "test"\n- **Closed at:** 2026-10-24T00:00:00+05:45\n` +
        `- **Status at close:** COMPLETED\n- **Code commit:** ${at ?? code}\n`,
    );
    return f;
  }

  it('allows the one commit that records the close, whatever it must carry', () => {
    const f = sealed();
    writeFileSync(path.join(f.dir, 'state/INDEX.md'), '# IDX\n');
    writeFileSync(path.join(f.dir, 'file.txt'), 'the fix the close found\n');
    const r = run(f);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/recording a finished session/);
  });

  it('allows state bookkeeping forever, because the hook keeps regenerating it', () => {
    const f = sealed();
    git(f.dir, ['add', '-A']);
    git(f.dir, ['commit', '-qm', 'chore(state): auto-update from post-commit hook']);
    writeFileSync(path.join(f.dir, 'state/DASHBOARD.md'), '# DASHBOARD\n\nregenerated\n');
    const r = run(f);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/state-only change/);
  });

  it('refuses a sealed session file, which is evidence rather than a workspace', () => {
    const f = sealed();
    git(f.dir, ['add', '-A']);
    git(f.dir, ['commit', '-qm', 'chore(state): auto-update from post-commit hook']);
    const file = path.join(f.dir, 'state/sessions', '20261024-0000-TEST-x.md');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\none more thing\n`);
    const r = run(f);
    expect(r.code).toBe(1);
  });

  it('refuses source work after the seal — that is a new session', () => {
    const f = sealed();
    git(f.dir, ['add', '-A']);
    git(f.dir, ['commit', '-qm', 'chore(state): auto-update from post-commit hook']);
    writeFileSync(path.join(f.dir, 'file.txt'), 'new work, no session\n');
    const r = run(f);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/none is IN-PROGRESS or REOPENED/);
  });

  it('allows the push, where nothing is pending but the branch is ahead', () => {
    // The pre-push hook runs this gate after the close commit exists. Nothing is
    // pending then, and the branch is ahead of master — which `hasWork()` counts
    // as work, so without this door the close could be committed and never pushed.
    const f = sealed();
    git(f.dir, ['add', '-A']);
    git(f.dir, ['commit', '-qm', 'chore(state): auto-update from post-commit hook']);
    const r = run(f);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/state-only change/);
  });
});
