import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * `macp start --plan <id>` — the session's scope comes from the plan document.
 *
 * The defect this replaces: `start --task "…"` took the objective from the
 * agent, so the record's own statement of what it was authorised to do was
 * written by the party being authorised. A plan item is written and maintained
 * by the owner, and its status column is the one place its state is recorded —
 * so an id that is already delivered cannot become work again by being asked
 * for.
 *
 * Every refusal below is a case where the old code would have produced a
 * plausible-looking session: a wrong id, a delivered phase, a row with no body.
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
};

/**
 * Three tables that are not the phase table, and each is a different way to get
 * the parse wrong:
 *
 *   - `F-02` sits in a table that *has* a Status column, so only the id shape
 *     keeps it out;
 *   - `P6` sits in a table keyed by a phase id that has *no* Status column, so
 *     only the column keeps it out;
 *   - `P4` has a row and no section, so it has a status and nothing behind it.
 */
const PLAN = `# A plan

| Phase | Scope | Findings | Status |
| ----- | ----- | -------- | ------ |
| P1 | Gate integrity | F-04 | pending |
| P3 | Reopen authority | F-09 | delivered · #271 |
| P4 | Row without a section | F-01 | pending |
| P9 | Objective binding | F-06 | pending |

## 1. Detail

| Finding | Impact | Status |
| ------- | ------ | ------ |
| F-02 | the guard is not installed | open |

| Phase | Depends on | Why |
| ----- | ---------- | --- |
| P6 | P3, P4 | signatures must exist first |

### P1 — Gate integrity (F-04)

\`start\` records the required gates; \`close\` may add but never remove.

**Why first:** it closes a false-success path without a new architecture.

### P3 — Reopen authority (F-09)

Compare the signing key to the sealing key before writing \`REOPENED\`.

### P9 — Objective binding (F-06)

Objective from a file, hashed and signed.
`;

function makeRepo(): Repo {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-plan-'));
  const home = mkdtempSync(path.join(tmpdir(), 'macp-plan-home-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));

  const sh = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  sh(['init', '-q', '-b', 'master']);
  sh(['config', 'user.email', 'test@example.com']);
  sh(['config', 'user.name', 'test']);
  writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"fixture","scripts":{"test":"node -e \\"\\""}}\n',
  );
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  writeFileSync(path.join(dir, 'docs', 'remediation-plan.md'), PLAN);
  sh(['add', '-A']);
  sh(['commit', '-qm', 'chore: init']);

  const run = (args: string[]) => {
    const result = spawnSync('node', [CLI, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, MACP_HOME: home },
    });
    return { code: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  };

  run(['init-repo']);
  sh(['checkout', '-q', '-b', 'feat/plan']);
  return { dir, home, run };
}

function sessionFile(repo: Repo, id: string): string {
  const name = readdirSync(path.join(repo.dir, 'state', 'sessions')).find((entry) =>
    entry.includes(`-${id}-`),
  );
  expect(name, `no session file for ${id}`).toBeTruthy();
  return readFileSync(path.join(repo.dir, 'state', 'sessions', name!), 'utf8');
}

function leaseOf(repo: Repo): { leases: Record<string, { plan: unknown }> } {
  const dir = path.join(repo.home, 'leases');
  const name = readdirSync(dir)[0];
  return JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
}

const startWith = (repo: Repo, id: string, extra: string[]) =>
  repo.run(['start', '--agent', id, '--harness', 'node-test', ...extra]);

describe('start --plan', () => {
  it('adopts the item body as the objective and records the binding', () => {
    const repo = makeRepo();
    const started = startWith(repo, 'PL01', ['--plan', 'P1', '--authorized-by', 'owner said: P1']);
    expect(started.code).toBe(0);
    expect(started.out).toMatch(
      /scope:\s+plan item P1 \(pending\) from docs\/remediation-plan\.md/,
    );

    const session = sessionFile(repo, 'PL01');
    expect(session).toMatch(
      /^\*\*Plan:\*\* docs\/remediation-plan\.md · item P1 · status pending/m,
    );
    expect(session).toMatch(/## Objective\n\n\*\*P1 — Gate integrity\*\*/);
    expect(session).toMatch(/records the required gates/);

    expect((Object.values(leaseOf(repo).leases)[0].plan as { id: string }).id).toBe('P1');
  });

  it('refuses a delivered phase and writes no session', () => {
    const repo = makeRepo();
    const started = startWith(repo, 'PL02', ['--plan', 'P3', '--authorized-by', 'owner said: P3']);
    expect(started.code).toBe(1);
    expect(started.out).toMatch(/P3 is "delivered/);
    expect(readdirSync(path.join(repo.dir, 'state', 'sessions'))).toHaveLength(0);
  });

  it('refuses an id that only looks like a plan item', () => {
    const repo = makeRepo();
    // `F-02` is in a status table; `P6` is a phase id in a table without one.
    for (const id of ['F-02', 'P6']) {
      const started = startWith(repo, 'PL03', ['--plan', id, '--authorized-by', 'owner said: it']);
      expect(started.code, id).toBe(1);
      expect(started.out, id).toMatch(new RegExp(`no plan item "${id}"`));
    }
    expect(readdirSync(path.join(repo.dir, 'state', 'sessions'))).toHaveLength(0);
  });

  it('refuses a status row with no section', () => {
    const repo = makeRepo();
    const started = startWith(repo, 'PL04', ['--plan', 'P4', '--authorized-by', 'owner said: P4']);
    expect(started.code).toBe(1);
    expect(started.out).toMatch(/no `### P4` section/);
  });

  it('refuses --task and --plan together rather than merging them', () => {
    const repo = makeRepo();
    const started = startWith(repo, 'PL05', [
      '--plan',
      'P1',
      '--task',
      'and also this',
      '--authorized-by',
      'owner said: both',
    ]);
    expect(started.code).toBe(2);
    expect(started.out).toMatch(/pass --task or --plan, not both/);
  });

  it('leaves a --task session with no plan line at all', () => {
    const repo = makeRepo();
    const started = startWith(repo, 'PL06', [
      '--task',
      'plain prose',
      '--authorized-by',
      'said so',
    ]);
    expect(started.code).toBe(0);
    expect(started.out).toMatch(/scope:\s+from --task/);
    expect(sessionFile(repo, 'PL06')).not.toMatch(/^\*\*Plan:\*\*/m);
    expect(Object.values(leaseOf(repo).leases)[0].plan).toBeNull();
  });
});
