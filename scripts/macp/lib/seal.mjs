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

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
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
    run('ssh-keygen', ['-Y', 'sign', '-f', keyPath, '-n', SIGN_NAMESPACE, messageFile]);
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
