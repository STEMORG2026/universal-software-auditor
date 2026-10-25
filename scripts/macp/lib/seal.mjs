/**
 * The seal: an SSH signature over the facts a close asserts.
 *
 * WHY SSH AND NOT A WORD. `docs/macp.md` §4C is honest that the old passkey —
 * a string typed into the session file — is an audit control and not a
 * security control, because anyone holding the checkout can type any string.
 * That is correct, and it is not enough: it means an unrequested reopen is
 * indistinguishable from a requested one until a human reads the diff.
 *
 * An SSH signature changes that. The owner already holds an ed25519 key for
 * this machine, `ssh-keygen -Y sign` produces an SSHSIG over arbitrary bytes,
 * and `ssh-keygen -Y verify` checks it against a pinned public key with no
 * network and no daemon. The private key never leaves `~/.ssh`, and a reopen
 * cannot be produced without it.
 *
 * WHAT IT DOES NOT DO. It does not stop a determined agent deleting the seal
 * block and writing a new session. Nothing in a working tree can. What it does
 * is make a forged reopen fail verification in CI, where the committed public
 * key is the only key that counts — so the forgery is visible even if the local
 * gate was bypassed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const SIGN_NAMESPACE = 'macp';
export const SIGN_PRINCIPAL = 'macp-owner';

/**
 * The principals, one per lifecycle act (ADR-0046).
 *
 * A passphrase belongs to a key file, so "a different passphrase for close and
 * seal" means a different key — and therefore a different principal. `legacy` is
 * the single principal that sealed SA01–SA12 and stays verifiable; it is not a
 * principal any new act may use.
 */
export const ACTS = Object.freeze({
  close: 'macp-close',
  seal: 'macp-seal',
  reopen: 'macp-reopen',
  destroy: 'macp-destroy',
  legacy: 'macp-owner',
});

/** The committed authority file: one `principal keytype base64` line per act. */
export function allowedSignersPath(root) {
  return path.join(root, 'state', 'macp', 'allowed_signers');
}

/** `principal → "keytype base64"` for every line in the file. */
export function readSigners(file) {
  if (!existsSync(file)) return new Map();
  const signers = new Map();
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [principal, ...key] = line.split(/\s+/);
    if (principal && key.length >= 2) signers.set(principal, key.slice(0, 2).join(' '));
  }
  return signers;
}

/**
 * The base64 key blob from `<keyPath>.pub`.
 *
 * The public half is read from disk rather than derived with `ssh-keygen -y`,
 * because that command needs the passphrase — and asking for it just to identify
 * a key would prompt twice per command.
 */
export function pubBlobOf(keyPath) {
  const file = `${keyPath}.pub`;
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').trim().split(/\s+/)[1] ?? null;
}

/**
 * Which principal this key belongs to, or null when it belongs to none.
 *
 * This is the check `seal` was missing: it signed with whatever key it was
 * given, then made that key the anchor. Identity is compared here, before the
 * transition, not inferred afterwards from a valid signature.
 */
export function principalFor(keyPath, signers) {
  const blob = pubBlobOf(keyPath);
  if (!blob) return null;
  for (const [principal, key] of signers) {
    if (key.split(/\s+/)[1] === blob) return principal;
  }
  return null;
}

/** `SHA256:…` for a key given as a string, rather than as a file path. */
export function keyFingerprintOfKey(keyLine) {
  return withTempDir((dir) => {
    const file = path.join(dir, 'k.pub');
    writeFileSync(file, `${String(keyLine).trim()}\n`, 'utf8');
    return keyFingerprint(file);
  });
}

/**
 * Fingerprints currently loaded in `ssh-agent`.
 *
 * An agent-loaded key signs with **no passphrase prompt** — measured: the first
 * seal of the audit was produced by the agent itself because the key happened to
 * be in the agent. That is the one path by which a privileged act can happen
 * without the owner typing anything, so every act refuses when its key is there.
 */
export function agentFingerprints() {
  try {
    const out = run('ssh-add', ['-l']);
    return [...out.matchAll(/SHA256:[A-Za-z0-9+/=]+/g)].map((match) => match[0]);
  } catch {
    return [];
  }
}

/** True when `keyPath`'s public half is loaded in the agent. */
export function keyLoadedInAgent(keyPath) {
  const fingerprint = keyFingerprint(`${keyPath}.pub`);
  return fingerprint ? agentFingerprints().includes(fingerprint) : false;
}

/** The refusal every privileged act returns when its key is agent-loaded. */
export function agentLoadedRefusal(keyPath, act) {
  return (
    `the ${act} key at ${keyPath} is loaded in ssh-agent, so it would sign without asking you ` +
    'for the passphrase. Remove it first — `ssh-add -d ' +
    keyPath +
    '` — then run the command again and type the passphrase. ' +
    'A key in the agent is a key any process on this account can use.'
  );
}

/** The bytes a resume signs: the owner letting an unfinished session continue. */
export function resumePayload({ repo, session, agent, branch, codeCommit, reason, resumedAt }) {
  return canonicalPayload({
    kind: 'macp-resume-v1',
    repo,
    session,
    agent,
    branch,
    codeCommit,
    reason,
    resumedAt,
  });
}

/** The bytes an abandon signs: the owner stopping work that was never finished. */
export function abandonPayload({ repo, session, agent, branch, codeCommit, reason, abandonedAt }) {
  return canonicalPayload({
    kind: 'macp-abandon-v1',
    repo,
    session,
    agent,
    branch,
    codeCommit,
    reason,
    abandonedAt,
  });
}

/** The bytes a `close` signs: the owner authorising COMPLETED on a measured tree. */
export function closePayload({ repo, session, agent, branch, codeCommit, outcome, closedAt }) {
  return canonicalPayload({
    kind: 'macp-close-v1',
    repo,
    session,
    agent,
    branch,
    codeCommit,
    outcome,
    closedAt,
  });
}

/**
 * Deterministic bytes for signing: sorted `key=value` lines.
 *
 * Sorted because a signature over a JSON object that reordered its keys would
 * fail for a reason nobody could see. Line-oriented because a diff of two
 * payloads is then readable.
 */
export function canonicalPayload(fields) {
  const keys = Object.keys(fields).sort();
  return `${keys.map((key) => `${key}=${fields[key] ?? ''}`).join('\n')}\n`;
}

/**
 * Run a helper. `interactive` hands the child this process's terminal.
 *
 * Signing must be interactive: a passphrase-protected key — the shape the owner
 * was told to use, and the only shape that stops an agent from sealing on his
 * behalf — needs `ssh-keygen` to prompt. With piped stdio there is no terminal
 * to prompt on, so it falls through to `ssh-askpass`, which does not exist on a
 * headless box, and the seal dies with "incorrect passphrase" even when the
 * passphrase was right.
 */
function run(command, args, { interactive = false, ...options } = {}) {
  // `interactive` must hand ssh-keygen the real stdin, not /dev/null.
  //
  // With stdin ignored it cannot read a passphrase, so it falls back to
  // SSH_ASKPASS — and on this machine DISPLAY is set but no askpass binary is
  // installed, so a passphrase-protected key failed with "incorrect passphrase".
  // Every seal that ever worked used an agent-loaded key, which is the one case
  // that needs no prompt. Measured on `macp resume` with ~/.ssh/macp_close.
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: interactive ? ['inherit', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'],
    ...options,
  });
}

/** `SHA256:…` for a public key file, or null when `ssh-keygen` cannot read it. */
export function keyFingerprint(publicKeyPath) {
  try {
    const out = run('ssh-keygen', ['-l', '-f', publicKeyPath]);
    return /SHA256:[A-Za-z0-9+/=]+/.exec(out)?.[0] ?? null;
  } catch {
    return null;
  }
}

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'macp-sign-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Sign `payload` with the private key at `keyPath`.
 *
 * Returns the SSHSIG as base64 (one line, safe to embed in Markdown) plus the
 * matching public key and its fingerprint, so the record is self-describing.
 */
export function signPayload(payload, keyPath) {
  const publicKeyPath = `${keyPath}.pub`;
  if (!existsSync(keyPath)) throw new Error(`no private key at ${keyPath}`);
  if (!existsSync(publicKeyPath)) throw new Error(`no public key at ${publicKeyPath}`);

  return withTempDir((dir) => {
    const messageFile = path.join(dir, 'payload.txt');
    writeFileSync(messageFile, payload, 'utf8');
    run('ssh-keygen', ['-Y', 'sign', '-f', keyPath, '-n', SIGN_NAMESPACE, messageFile], {
      interactive: true,
    });
    const signature = readFileSync(`${messageFile}.sig`);
    return {
      signature: signature.toString('base64'),
      publicKey: readFileSync(publicKeyPath, 'utf8').trim(),
      fingerprint: keyFingerprint(publicKeyPath),
    };
  });
}

/** `principal [options] keytype base64` — one line, the shape ssh-keygen wants. */
export function allowedSignersLine(publicKey, principal = SIGN_PRINCIPAL) {
  return `${principal} ${publicKey.trim()}\n`;
}

/**
 * Verify a base64 SSHSIG over `payload` against a single public key.
 *
 * The key is passed in, never discovered, so a caller cannot accidentally
 * verify against a key an attacker supplied alongside the signature.
 */
export function verifyPayload(payload, signatureBase64, publicKey, principal = SIGN_PRINCIPAL) {
  if (!signatureBase64 || !publicKey) return false;
  return withTempDir((dir) => {
    const allowed = path.join(dir, 'allowed_signers');
    const signatureFile = path.join(dir, 'payload.sig');
    writeFileSync(allowed, allowedSignersLine(publicKey, principal), 'utf8');
    writeFileSync(signatureFile, Buffer.from(signatureBase64, 'base64'));

    try {
      run(
        'ssh-keygen',
        ['-Y', 'verify', '-f', allowed, '-I', principal, '-n', SIGN_NAMESPACE, '-s', signatureFile],
        { input: payload },
      );
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * The bytes a close signs.
 *
 * Every field is also written into the `## Close` block, so the signature and
 * the claim are the same set of facts: edit one and verification fails. That is
 * the property the seal needs — not that the file is unreadable, but that a
 * changed file cannot pass.
 */
export function sealPayload({
  repo,
  session,
  agent,
  branch,
  baseCommit,
  codeCommit,
  outcome,
  closedAt,
  instruction,
}) {
  return canonicalPayload({
    kind: 'macp-seal-v1',
    repo,
    session,
    agent,
    branch,
    baseCommit,
    codeCommit,
    outcome,
    closedAt,
    instruction,
  });
}

/**
 * The owner's instruction, flattened into one line so it can be quoted in a
 * Markdown bullet and parsed back out of it.
 *
 * The instruction is signed. It is the sentence that authorises the close, so a
 * seal that covers the SHAs but not the words would let anyone rewrite what the
 * owner was recorded as saying — which is the one claim the block exists to
 * preserve.
 */
export function normaliseInstruction(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The bytes a reopen signs. Binds the reopen to the seal it breaks. */
export function reopenPayload({ repo, session, sealFingerprint, reason, delta, reopenedAt }) {
  return canonicalPayload({
    kind: 'macp-reopen-v1',
    repo,
    session,
    sealFingerprint,
    reason,
    delta,
    reopenedAt,
  });
}
