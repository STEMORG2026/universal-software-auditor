/**
 * The local lease: proof that `macp start` ran on THIS machine, for THIS
 * branch, and that nothing has closed it since.
 *
 * It lives outside the working tree (`~/.macp/leases/<repo-id>.json`) on
 * purpose. A receipt committed to the repository would be a receipt an agent
 * could copy from another branch, and the whole defect this replaces is an
 * agent asserting a startup it never performed. An untracked file cannot be
 * copied by `git checkout`, and it does not appear in a diff, so it cannot be
 * mistaken for a record of work.
 *
 * One file per repository, keyed by branch, because two worktrees of one repo
 * legitimately run two sessions on two branches and must not collide.
 */
import path from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { macpHome, readJson, writeJson } from './repo.mjs';

const SCHEMA = 'macp-lease-v1';

export function leasePath(repoIdValue) {
  return path.join(macpHome(), 'leases', `${repoIdValue}.json`);
}

export function readLeases(repoIdValue) {
  const parsed = readJson(leasePath(repoIdValue));
  if (!parsed || parsed.schema !== SCHEMA || typeof parsed.leases !== 'object') {
    return { schema: SCHEMA, leases: {} };
  }
  return parsed;
}

export function getLease(root, repoIdValue, branch) {
  return readLeases(repoIdValue).leases[branch] ?? null;
}

export function putLease(repoIdValue, lease) {
  const store = readLeases(repoIdValue);
  store.leases[lease.branch] = lease;
  writeJson(leasePath(repoIdValue), store);
  return lease;
}

export function dropLease(repoIdValue, branch) {
  const store = readLeases(repoIdValue);
  if (!(branch in store.leases)) return false;
  delete store.leases[branch];
  writeJson(leasePath(repoIdValue), store);
  return true;
}

/** Remove the whole store. Used by `macp init-repo --reset-leases`. */
export function clearAllLeases(repoIdValue) {
  const file = leasePath(repoIdValue);
  if (existsSync(file)) rmSync(file, { force: true });
}

/**
 * A lease that is present, for this branch, and still `ACTIVE` or `CLOSING`.
 *
 * Expiry is deliberately absent. A lease that silently expired would let an
 * agent resume work it never re-authorised; the correct recovery from a stale
 * lease is `macp start` again, which overwrites it.
 */
export function activeLease(root, repoIdValue, branch) {
  const lease = getLease(root, repoIdValue, branch);
  if (!lease) return null;
  return lease.state === 'ACTIVE' || lease.state === 'CLOSING' ? lease : null;
}

/**
 * Another live lease that this one would collide with.
 *
 * Two collisions matter, and they are different:
 *   - the same branch, claimed by a different session — one branch, one session;
 *   - a different branch in the same working tree — the second agent would be
 *     editing files the first believes it owns.
 *
 * Comparing only the session id missed the second case entirely: the same agent
 * id starting a second branch in one checkout is exactly the collision this
 * exists to stop. Measured by a test that expected exit 1 and got 0.
 */
export function conflictingLease(repoIdValue, candidate) {
  const others = Object.values(readLeases(repoIdValue).leases).filter(
    (lease) =>
      lease.state === 'ACTIVE' &&
      ((lease.branch === candidate.branch && lease.session !== candidate.session) ||
        (lease.repoRoot === candidate.repoRoot && lease.branch !== candidate.branch)),
  );
  return others[0] ?? null;
}

export function makeLease({
  repoId: id,
  repoRoot,
  branch,
  session,
  agent,
  harness,
  baseCommit,
  startHeadSha,
  plan,
}) {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA,
    repoId: id,
    repoRoot,
    branch,
    session,
    agent,
    harness,
    state: 'ACTIVE',
    baseCommit,
    // The commit the work actually began from, as opposed to the merge-base. The
    // audit's F-14: attributing commits from `master..HEAD` gave a stacked
    // session credit for the session below it.
    startHeadSha: startHeadSha ?? null,
    // The plan item this session was scoped to, and the plan's sha at the
    // moment it was scoped. `null` for a `--task` session, which is the honest
    // record: that scope came from prose and has no document behind it.
    plan: plan ?? null,
    startedAt: now,
    heartbeatAt: now,
  };
}
