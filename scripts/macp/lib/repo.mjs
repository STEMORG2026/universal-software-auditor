/**
 * Repository facts the MACP runtime needs, and nothing else.
 *
 * Every value here is measured — `git` or `fs` — because the whole point of
 * the runtime is that an agent's claim about the tree is not evidence about
 * the tree. No function in this module trusts a Markdown file.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** `git` in `cwd`, trimmed. Throws on a non-zero exit unless `allowFail`. */
export function git(args, { cwd = process.cwd(), allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFail) return '';
    throw error;
  }
}

/** The work-tree root, or null when `cwd` is not inside a git repository. */
export function repoRoot(cwd = process.cwd()) {
  const top = git(['rev-parse', '--show-toplevel'], { cwd, allowFail: true });
  return top ? path.resolve(top) : null;
}

/** The checked-out branch, or `HEAD` when detached. */
export function currentBranch(root = process.cwd()) {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, allowFail: true }) || 'HEAD';
}

export function headSha(root = process.cwd()) {
  return git(['rev-parse', 'HEAD'], { cwd: root, allowFail: true });
}

export function shortSha(root = process.cwd()) {
  return git(['rev-parse', '--short', 'HEAD'], { cwd: root, allowFail: true });
}

/**
 * A stable identity for this repository, used to key the out-of-tree lease and
 * seal stores.
 *
 * Derived from the `origin` URL when there is one, so two clones of the same
 * repository on one machine share a lease store — which is what "one session
 * per branch" means. Falls back to the absolute path, hashed, for a repo with
 * no remote (this runtime must work before the first push).
 */
export function repoId(root = process.cwd()) {
  const remote = git(['remote', 'get-url', 'origin'], { cwd: root, allowFail: true });
  const identity = remote || path.resolve(root);
  const slug = identity
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .toLowerCase();
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 8);
  return `${slug}-${digest}`;
}

/**
 * `$MACP_HOME`, else `~/.macp` when that is writable, else `~/Projects/.macp-home`.
 *
 * Never inside the repository. The fallback exists because a lease store that
 * cannot be written is a runtime that cannot start a session — on a sandboxed
 * machine where the real home is read-only, a workspace-level store keeps the
 * one-lease-store-per-machine property without the env var. The env var, when
 * set, always wins.
 */
export function macpHome() {
  if (process.env.MACP_HOME) return process.env.MACP_HOME;
  const primary = path.join(homedir(), '.macp');
  // Probe writability, not existence: `mkdirSync(recursive)` is a no-op success
  // on a directory that already exists — even a read-only one — so the first
  // real write crashes with EROFS instead of falling back. Measured on this
  // machine: ~/.macp exists read-only; mkdirSync succeeded; putLease died.
  try {
    mkdirSync(primary, { recursive: true });
    // `accessSync` takes a *mode*, not the `constants` object. Passing the
    // object threw ERR_INVALID_ARG_TYPE on every call, so the catch below always
    // fired and every lease went to the fallback — a silent relocation that made
    // the whole `~/.macp` store invisible. Found by a `submit` refusing with
    // "no lease ... this machine never ran start", while the lease sat in the
    // store the runtime had stopped reading.
    accessSync(primary, constants.W_OK);
    return primary;
  } catch {
    return path.join(homedir(), 'Projects', '.macp-home');
  }
}

export function readJson(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write JSON through a temp file in the same directory, then rename.
 *
 * A crash mid-write leaves the previous file intact rather than a truncated
 * one. The lease is read on every mutating tool call, so a half-written lease
 * would be read far more often than it is written.
 */
export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

export function writeText(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

/**
 * `git status --porcelain`, parsed.
 *
 * NOT through `git()`, because that helper trims its output and the first line
 * of porcelain output *begins with a space* (` M path`). Trimming it and then
 * slicing three characters ate the first letter of the first path — measured:
 * `state/CONTINUATION.md` came back as `ate/CONTINUATION.md`, which then failed
 * the `state/` filter and made `macp seal` refuse over its own close files.
 */
export function dirtyPaths(root = process.cwd()) {
  let raw;
  try {
    raw = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

/** Commits on HEAD that `master` does not have. Zero when `master` is absent. */
export function commitsAheadOfMaster(root = process.cwd()) {
  const count = git(['rev-list', '--count', 'master..HEAD'], { cwd: root, allowFail: true });
  return Number.parseInt(count || '0', 10) || 0;
}

export function remoteUrl(root = process.cwd()) {
  return git(['remote', 'get-url', 'origin'], { cwd: root, allowFail: true });
}

/** `gh` output as JSON, or null when `gh` is missing or unauthenticated. */
export function ghJson(args, { cwd = process.cwd() } = {}) {
  try {
    const out = execFileSync('gh', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}
