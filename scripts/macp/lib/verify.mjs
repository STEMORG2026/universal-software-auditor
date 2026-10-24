/**
 * Offline verification of every seal and reopen in the repository.
 *
 * This is the half that works in CI. `macp seal` needs the private key and
 * therefore runs only on the owner's machine; `macp verify` needs only the
 * committed public key, so it runs anywhere — including a pull request from a
 * fork, which is exactly where a forged reopen would be attempted.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { currentBranch, repoId, repoRoot } from './repo.mjs';
import { STATUS, branchesNamed, field, listSessions, section } from './session.mjs';
import { reopenPayload, sealPayload, verifyPayload } from './seal.mjs';

function grab(text, name) {
  return new RegExp(`\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';
}

export function verify() {
  const root = repoRoot();
  if (!root) return { code: 2, out: 'not inside a git repository' };

  const publicKeyPath = path.join(root, 'state', 'macp', 'owner.pub');
  if (!existsSync(publicKeyPath)) {
    return {
      code: 0,
      out: 'verify: no state/macp/owner.pub — no seal in this repository was SSH-signed yet.',
    };
  }
  const publicKey = readFileSync(publicKeyPath, 'utf8').trim();
  const repo = repoId(root);

  const findings = [];
  const notes = [];
  let verified = 0;

  for (const session of listSessions(root)) {
    const close = section(session.text, 'Close');
    const signature = close ? grab(close, 'Seal signature') : '';
    const branch = branchesNamed(session.text)[0] ?? '';

    if (session.status === STATUS.CLOSED) {
      if (!signature) {
        notes.push(`${session.id}: sealed without a signature (legacy seal, before SSH signing)`);
        continue;
      }
      const quoted =
        /^\s*-\s*\*\*Closed by:\*\*[^\n]*instruction: (".*")\s*$/m.exec(close)?.[1] ?? '""';
      const payload = sealPayload({
        repo,
        session: session.id,
        agent: field(session.text, 'Agent') ?? '',
        branch,
        baseCommit: field(session.text, 'Base commit') ?? '',
        codeCommit: grab(close, 'Code commit'),
        outcome: grab(close, 'Status at close'),
        closedAt: grab(close, 'Closed at'),
        instruction: quoted.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
      });
      if (verifyPayload(payload, signature, publicKey)) verified += 1;
      else
        findings.push(
          `${session.id}: seal signature does not verify — the file changed after sealing`,
        );
    }

    if (session.status === STATUS.REOPENED) {
      const reopen = section(session.text, 'Reopen');
      const reopenSignature = reopen ? grab(reopen, 'Reopen signature') : '';
      if (!reopenSignature) {
        findings.push(`${session.id}: REOPENED without a verifiable reopen signature`);
        continue;
      }
      const payload = reopenPayload({
        repo,
        session: session.id,
        sealFingerprint: grab(close ?? '', 'Passkey').replace(/^ssh-ed25519\s*/, ''),
        reason: grab(reopen, 'Reason'),
        delta: grab(reopen, 'Delta'),
        reopenedAt: grab(reopen, 'Reopened at'),
      });
      if (verifyPayload(payload, reopenSignature, publicKey)) verified += 1;
      else
        findings.push(
          `${session.id}: reopen signature does not verify — reason or delta was edited`,
        );
    }
  }

  const lines = [
    `verify: ${verified} signature(s) checked against state/macp/owner.pub`,
    ...notes.map((note) => `  note: ${note}`),
  ];
  if (findings.length === 0) return { code: 0, out: lines.join('\n') };
  return {
    code: 1,
    out: `${lines.join('\n')}\n${findings.map((finding) => `  FAIL: ${finding}`).join('\n')}`,
  };
}

/** Exposed so `macp close` can assert the branch it is closing is the one it is on. */
export function branchOf(root) {
  return currentBranch(root);
}
