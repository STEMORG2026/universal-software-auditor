import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The evidence a report carries has to survive the history it was written in.
 *
 * `close` compared the reported commit to `HEAD` and filtered out `state/`. The
 * diff ran with `allowFail`, so when the reported commit no longer existed —
 * rebase, amend, squash, a gc — the command failed, the output was empty, and
 * "nothing changed" was concluded. A rewritten history could close a tree that
 * was never measured, and the record would look complete.
 *
 * Two things now hold: the report records the *tree* the gates ran against, and
 * `close` asks whether the reported commit still exists before it diffs.
 */

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'scripts/macp/cli.mjs');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

type Repo = { dir: string; home: string; run: (args: string[]) => { code: number; out: string } };

function makeRepo(): Repo {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-evidence-'));
  const home = mkdtempSync(path.join(tmpdir(), 'macp-evidence-home-'));
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
  sh(['add', '-A']);
  sh(['commit', '-qm', 'chore: init']);
  sh(['checkout', '-q', '-b', 'feat/one']);

  const keys = path.join(home, 'macp_close');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', keys, '-C', 'macp-close']);
  const blob = readFileSync(`${keys}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
  mkdirSync(path.join(dir, 'state/macp'), { recursive: true });
  writeFileSync(path.join(dir, 'state/macp/allowed_signers'), `macp-close ${blob}\n`);
  sh(['add', '-A']);
  sh(['commit', '-qm', 'chore: authority']);

  const started = run([
    'start',
    '--agent',
    'T01',
    '--harness',
    'vitest',
    '--task',
    'prove the evidence',
    '--authorized-by',
    'the test said so',
    '--no-brief',
  ]);
  expect(started.code, started.out).toBe(0);

  writeFileSync(path.join(dir, 'tool.mjs'), 'export const ok = false;\n');
  sh(['add', '-A']);
  sh(['commit', '-qm', 'feat: work']);
  const submitted = run(['submit', '--outcome', 'COMPLETED', '--completed', 'the change']);
  expect(submitted.code, submitted.out).toBe(0);
  sh(['add', '-A']);
  sh(['commit', '-qm', 'chore(state): report']);
  return { dir, home, run };
}

const handoffPath = (repo: Repo) => path.join(repo.dir, 'state/macp/handoff/T01.json');
const handoff = (repo: Repo) => JSON.parse(readFileSync(handoffPath(repo), 'utf8'));

describe('the reported tree', () => {
  it('is recorded beside the commit, and matches what the gates ran against', () => {
    const repo = makeRepo();
    const h = handoff(repo);
    const tree = execFileSync('git', ['rev-parse', `${h.code_commit_sha}^{tree}`], {
      cwd: repo.dir,
      encoding: 'utf8',
    }).trim();
    expect(h.code_tree_sha).toBe(tree);
  });

  it('is rendered in the handoff block', () => {
    const repo = makeRepo();
    const region = readFileSync(path.join(repo.dir, 'state/CONTINUATION.md'), 'utf8');
    expect(region).toMatch(
      new RegExp(`\\| Code tree \\| \\\`${handoff(repo).code_tree_sha}\\\` \\|`),
    );
  });

  it('still closes when the commit is amended but the tree is identical', () => {
    const repo = makeRepo();
    // Same content, new commit id — the history moved, the measured tree did not.
    execFileSync('git', ['commit', '--amend', '-qm', 'feat: work (message only)'], {
      cwd: repo.dir,
      encoding: 'utf8',
    });
    const r = repo.run(['close', '--ssh-key', path.join(repo.home, 'macp_close')]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/COMPLETED T01/);
  });

  it('refuses when the report names a commit this repository no longer has', () => {
    const repo = makeRepo();
    const h = handoff(repo);
    // What a rebase or a gc leaves behind: a report pointing at a commit that is
    // gone. The old code diffed against it with `allowFail`, got an empty diff,
    // and concluded nothing had changed.
    writeFileSync(
      handoffPath(repo),
      `${JSON.stringify({ ...h, code_commit_sha: '0123456789abcdef0123456789abcdef01234567' }, null, 2)}\n`,
    );
    const r = repo.run(['close', '--ssh-key', path.join(repo.home, 'macp_close')]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/no longer has/);
    expect(r.out).toMatch(/history was rewritten/);
  });

  it('closes a named session from another branch — the merged-PR case', () => {
    const repo = makeRepo();
    // The work is merged into master before the session is closed. `close` used to
    // look only at the current branch and report "no submitted session on master"
    // with the file right there, so a merged PR's session could never be closed.
    execFileSync('git', ['checkout', '-q', 'master'], { cwd: repo.dir, encoding: 'utf8' });
    execFileSync('git', ['merge', '-q', '--no-ff', '-m', 'merge: the work', 'feat/one'], {
      cwd: repo.dir,
      encoding: 'utf8',
    });

    const r = repo.run([
      'close',
      '--session',
      'T01',
      '--ssh-key',
      path.join(repo.home, 'macp_close'),
    ]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/COMPLETED T01/);
  });

  it('still refuses a source change after the report', () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.dir, 'tool.mjs'), 'export const ok = "later";\n');
    execFileSync('git', ['add', '-A'], { cwd: repo.dir, encoding: 'utf8' });
    execFileSync('git', ['commit', '-qm', 'feat: after the report'], {
      cwd: repo.dir,
      encoding: 'utf8',
    });
    const r = repo.run(['close', '--ssh-key', path.join(repo.home, 'macp_close')]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/source changed after the gates ran/);
  });
});
