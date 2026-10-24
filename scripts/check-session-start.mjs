#!/usr/bin/env node
/**
 * Start-of-session gate (ADR-0044, hardened by ADR-0045).
 *
 * WHAT WAS WRONG. The first version of this gate answered one question: "is the
 * newest session file `IN-PROGRESS` with a plan?" If the newest file was
 * `COMPLETED` — the normal state of `master` between sessions — it exited 0
 * without looking at anything else. So an agent could cut a branch, skip the
 * entire startup, edit the tree, and commit: the gate saw a `COMPLETED` session
 * (somebody else's, from last week) and approved. Reproduced before the fix in
 * a scratch repository: feature branch, staged change, no session for that
 * branch, no plan, not in `REGISTRY.md` → exit 0.
 *
 * WHAT IT ASKS NOW. On a branch that is not `master` and is not a bot branch,
 * and that carries work, it requires all five:
 *
 *   1. a session whose `**Branch:**` names THIS branch,
 *   2. that session is `IN-PROGRESS` or `REOPENED`,
 *   3. a plan in `state/plans/` for that agent,
 *   4. an entry under Active Agents in `REGISTRY.md`,
 *   5. a local lease under `~/.macp/leases/` for this repo and branch — proof
 *      that `macp start` ran on this machine, not just that a file exists.
 *
 * `master` and bot branches keep the close-path behaviour: they are where work
 * arrives, so requiring an active session there would fail every merge.
 *
 * THE LEASE AND CI. A fresh CI checkout has no `~/.macp`, so the lease check is
 * skipped when `GITHUB_ACTIONS=true`. That is an audit control, not a security
 * control: an agent can set the variable locally and defeat check 5. Checks 1-4
 * still hold, and they are the ones CI enforces. Do not describe the lease as
 * protection.
 *
 * Exit 0 compliant, 1 violation. Usage: `node scripts/check-session-start.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stateDir = path.resolve(root, 'state');

/** No MACP state at all → bootstrap case, nothing to enforce. */
if (!existsSync(stateDir)) {
  console.log('session start: no state/ directory — bootstrap case, skipping.');
  process.exit(0);
}

const SESSION_DIR = path.join(stateDir, 'sessions');
const PLANS_DIR = path.join(stateDir, 'plans');
const REGISTRY = path.join(stateDir, 'REGISTRY.md');

const ACTIVE = new Set(['IN-PROGRESS', 'REOPENED']);
const TERMINAL = new Set(['COMPLETED', 'CLOSED']);
const BOT_BRANCH = /^(dependabot\/|changeset-release\/|provenance\/|renovate\/)/;

const failures = [];
const fail = (message) => failures.push(message);

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * The branch this run is about.
 *
 * In CI a pull request is checked out detached, so `rev-parse` says `HEAD` and
 * the gate would look for a session on a branch called `HEAD` — failing every
 * PR for a reason that has nothing to do with the PR. GitHub names the real
 * branch in `GITHUB_HEAD_REF`; a push names it in `GITHUB_REF_NAME`.
 */
function currentBranch() {
  const ciBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '';
  return ciBranch || git(['rev-parse', '--abbrev-ref', 'HEAD']);
}

/** `**Field:** value` from a session file. */
/**
 * Read one `**Name:** value` field.
 *
 * The header block writes them flush left; the `## Close` block written by
 * `macp seal` writes them as a bullet list. Both are the same field, so the
 * leading bullet is optional here — reading only the flush-left form made
 * `Code commit` invisible and the sealing commit unreadable to this gate.
 */
function field(text, name) {
  const match = text.match(new RegExp(`^[-*]?[ \\t]*\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * The *last* `**Name:** value` in the text.
 *
 * A reopened session carries one close report and one seal per close, so the
 * first match is the oldest close — using it made the gate compare against a
 * commit three commits behind HEAD and refuse a close it should have allowed.
 */
function lastField(text, name) {
  const matches = [
    ...text.matchAll(new RegExp(`^[-*]?[ \\t]*\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'gm')),
  ];
  return matches.length > 0 ? matches[matches.length - 1][1].trim() : null;
}

function statusOf(text) {
  const raw = field(text, 'Status');
  return raw ? raw.split(/[ (]/)[0] : null;
}

/** Branches a session declares, normalised the same way `macp` does it. */
function branchesNamed(text) {
  const raw = field(text, 'Branch');
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.replace(/`/g, '').split(/[(\s]/)[0].trim())
    .filter((part) => part && part !== 'master');
}

function sessionFiles() {
  if (!existsSync(SESSION_DIR)) return [];
  return readdirSync(SESSION_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => path.join(SESSION_DIR, name));
}

function readAll() {
  return sessionFiles().map((file) => {
    const text = readFileSync(file, 'utf8');
    return {
      file,
      name: path.basename(file),
      id: path.basename(file).split('-')[2] ?? path.basename(file),
      text,
      status: statusOf(text),
      agent: field(text, 'Agent')?.split(/[\s(]/)[0] ?? null,
      branches: branchesNamed(text),
    };
  });
}

/** Staged or unstaged entries, plus commits `master` does not have. */
function hasWork() {
  let status;
  try {
    status = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    status = '';
  }
  if (status.trim()) return true;
  return Number.parseInt(git(['rev-list', '--count', 'master..HEAD']) || '0', 10) > 0;
}

/** The lease `macp start` writes outside the tree. Mirrors lib/repo.mjs. */
function leaseFor(repoIdValue, branch) {
  const home = process.env.MACP_HOME || path.join(process.env.HOME ?? '~', '.macp');
  const file = path.join(home, 'leases', `${repoIdValue}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')).leases?.[branch] ?? null;
  } catch {
    return null;
  }
}

/**
 * The repository identity the lease store is keyed by — the same derivation as
 * `scripts/macp/lib/repo.mjs`, duplicated rather than imported so this gate
 * stays a single file with no internal coupling.
 */
function repoIdValue() {
  const remote = git(['remote', 'get-url', 'origin']);
  const identity = remote || path.resolve(root);
  const slug = identity
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .toLowerCase();
  return `${slug}-${createHash('sha256').update(identity).digest('hex').slice(0, 8)}`;
}

/** 1-4: a session that owns this branch, is live, is planned, is registered. */
function checkActiveSession(sessions, branch) {
  const owned = sessions.filter((session) => session.branches.includes(branch));
  if (owned.length === 0) {
    fail(
      `no session in state/sessions/ names branch "${branch}" — MACP startup was skipped. ` +
        'Run `pnpm run macp -- start --agent <ID> --harness <name> --task "…" ' +
        '--authorized-by "…"` before the first edit.',
    );
    return null;
  }

  const live = owned.filter((session) => ACTIVE.has(session.status));
  if (live.length === 0) {
    const seen = owned.map((session) => `${session.name} is ${session.status ?? 'unlabelled'}`);
    fail(
      `branch "${branch}" has a session, but none is IN-PROGRESS or REOPENED (${seen.join('; ')}). ` +
        'A finished session does not authorise more work on the same branch — that is a new session.',
    );
    return null;
  }

  const session = live[live.length - 1];

  if (!session.agent) {
    fail(
      `${session.name} has no **Agent:** field — the header schema in STARTUP.md STEP 9 is mandatory`,
    );
    return session;
  }

  const plans = existsSync(PLANS_DIR)
    ? readdirSync(PLANS_DIR).filter((n) => n.endsWith('.md'))
    : [];
  if (!plans.some((plan) => plan.includes(session.agent))) {
    fail(
      `${session.name} is ${session.status} but no plan in state/plans/ references ${session.agent} — ` +
        'STEP 10 was skipped.',
    );
  }

  if (!existsSync(REGISTRY)) {
    fail(`${session.name} is ${session.status} but state/REGISTRY.md is missing.`);
    return session;
  }
  const registry = readFileSync(REGISTRY, 'utf8');
  const activeSection = registry.split('## Active Agents')[1]?.split(/^## /m)[0] ?? '';
  if (!activeSection.includes(session.agent)) {
    fail(
      `${session.name} is ${session.status} but ${session.agent} is not under Active Agents in ` +
        'REGISTRY.md — STEP 9 was skipped.',
    );
  }

  return session;
}

/** 5: the local lease, skipped in CI. */
function checkLease(session, branch) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log('session start: CI checkout — local lease not required.');
    return;
  }
  const lease = leaseFor(repoIdValue(), branch);
  if (!lease) {
    fail(
      `no local lease for "${branch}". The session file exists but \`macp start\` never ran on this ` +
        'machine for it — that is exactly the gap a committed file cannot close. Run `macp start`.',
    );
    return;
  }
  if (lease.state !== 'ACTIVE' && lease.state !== 'CLOSING') {
    fail(`the lease for "${branch}" is ${lease.state}; only ACTIVE or CLOSING authorises edits.`);
  }
  if (session && lease.session !== session.id) {
    fail(
      `the lease for "${branch}" belongs to ${lease.session}, but the live session file is ` +
        `${session.id}. Re-run \`macp start\` for the session you are actually working in.`,
    );
  }
}

/**
 * The commit that records a close is not new work.
 *
 * `macp close` writes the handoff, the status and the index; `macp seal` adds
 * the signature. All of it lives under `state/`, all of it happens after the
 * code commit the session froze at. Without this allowance the gate refuses the
 * very commit that closes the session — "a finished session does not authorise
 * more work on the same branch" — which is how this was found: the seal commit
 * was rejected by the gate it was closing against.
 *
 * Two doors:
 *
 *   1. state-only — what may be committed forever on a sealed branch. The
 *      hook keeps regenerating `DASHBOARD.md` after every commit, so a branch
 *      that could never record state again would be wedged by its own
 *      bookkeeping. `state/sessions/` is excluded even here: a sealed session
 *      file is evidence, and the seal gate (`check-sessions.mjs`) pins it.
 *   2. the one-commit window — nothing has been committed since the code commit,
 *      so this is the commit that records the close. It exists because the
 *      runtime cannot yet commit its own bookkeeping, and a defect found *by*
 *      the close (this gate, or the hook that mangled the session prose) has to
 *      be fixable somewhere. The window closes after one commit; any further
 *      source work needs a new session.
 *
 * The first version of door 1 also required everything *already* committed since
 * the seal to be state-only, which wedged the branch the moment door 2 was used
 * to carry a fix. Committed history is already reviewed; this gate judges the
 * change about to be recorded.
 *
 * A future ADR should move the bookkeeping commit into `macp seal` and delete
 * door 2. It is recorded here as a debt, not as a design.
 */
function isSealingCommit(sessions, branch) {
  const owned = sessions.filter((session) => session.branches.includes(branch));
  const session = owned[owned.length - 1];
  if (!session || !TERMINAL.has(session.status)) return false;

  // `macp seal` writes `- **Code commit:** <sha>` in the `## Close` block, but
  // `macp close` writes the same fact as prose in its close report — and the
  // close commit has to be recordable *before* the seal exists. Read both.
  // A reopened session carries one close report per close and one seal per
  // seal, and each states the commit it froze at. The seal sits after the close
  // report in the file, so the last `**Code commit:**` field is the newest fact
  // — the seal's, once one exists. The close report is the fallback for a
  // session that is closed but not yet sealed, which has no field at all.
  const codeCommit =
    lastField(session.text, 'Code commit') ??
    [...session.text.matchAll(/Code commit `([0-9a-f]{7,40})`/g)].pop()?.[1] ??
    null;
  if (!codeCommit) return false;

  const sinceSeal = git(['rev-list', '--count', `${codeCommit}..HEAD`]);
  if (Number.parseInt(sinceSeal, 10) === 0) return true; // door 2: the close commit

  // Porcelain's leading space is data: ` M path` is an unstaged change and
  // `M  path` is a staged one. The `git()` helper trims, so slicing by a fixed
  // offset cut into the filename — `state/…` became `tate/…` and every check
  // against it silently failed. Match the status codes instead.
  const pending = git(['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.replace(/^[ MADRCU?!]{1,2}\s+/, '').trim());
  if (pending.length === 0) return true; // nothing to record; the push is already made
  // Door 1: bookkeeping only. A sealed record (`CLOSED`) is never writable —
  // that is what the seal gate enforces byte for byte. A `COMPLETED` session is
  // closed but not yet sealed, and its own close and seal are what move it to
  // CLOSED, so its file is writable until the seal exists.
  const sealed = session.status === 'CLOSED';
  return pending.every(
    (rel) => rel.startsWith('state/') && (!sealed || !rel.startsWith('state/sessions/')),
  );
}

/* -------------------------------------------------------------------- run -- */

const branch = currentBranch();
const sessions = readAll();

if (!branch || branch === 'HEAD') {
  if (hasWork()) {
    fail(
      'HEAD is detached, so no branch owns this work. Check out a branch before committing — ' +
        'a session is bound to a branch, and a detached commit belongs to none.',
    );
  }
} else if (BOT_BRANCH.test(branch)) {
  console.log(`session start: ${branch} is a bot branch — state belongs on master, skipping.`);
} else if (branch === 'master') {
  // Where work lands. The close gate (check-protocol.mjs) judges this path; here
  // the only requirement is that the newest session is a finished one, so a
  // merge commit is not blocked by the very session it is landing.
  const newest = sessions[sessions.length - 1];
  if (!newest) {
    fail('no session file in state/sessions/ — the repository has state/ but no recorded session.');
  } else if (!TERMINAL.has(newest.status)) {
    fail(
      `${newest.name} is ${newest.status ?? 'unlabelled'} on master. A session reaching master must ` +
        'be COMPLETED or CLOSED first.',
    );
  }
} else if (!hasWork()) {
  console.log(`session start: ${branch} carries no staged change and no commit ahead of master.`);
} else if (isSealingCommit(sessions, branch)) {
  console.log(`session start: OK (${branch}) — recording a finished session, state-only change`);
} else {
  const session = checkActiveSession(sessions, branch);
  checkLease(session, branch);
}

if (failures.length > 0) {
  console.error(`session start: ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  console.error(
    '\nThis gate exists because the MACP startup is otherwise unenforced until push time.\n' +
      'See docs/macp.md §4C-4D and state/STARTUP.md.',
  );
  process.exit(1);
}

console.log(`session start: OK (${branch})`);
