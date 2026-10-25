/**
 * Offline verification of every signed act in the repository.
 *
 * This is the half that works in CI: it needs only the committed
 * `state/macp/allowed_signers`, so it runs anywhere — including a pull request
 * from a fork, which is exactly where a forged act would be attempted.
 *
 * Since ADR-0046 each act has its own principal, and a signature is verified
 * against the principal that is allowed to make *that* transition — not against
 * "some key that signs". A close signed by the seal key fails here, even though
 * both are the owner's.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { currentBranch, repoId, repoRoot } from './repo.mjs';
import { STATUS, branchesNamed, field, listSessions, section } from './session.mjs';
import {
  ACTS,
  allowedSignersPath,
  closePayload,
  keyFingerprintOfKey,
  readSigners,
  reopenPayload,
  sealPayload,
  verifyPayload,
} from './seal.mjs';

function grab(text, name) {
  return new RegExp(`\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';
}

export function verify() {
  const root = repoRoot();
  if (!root) return { code: 2, out: 'not inside a git repository' };

  const signers = readSigners(allowedSignersPath(root));
  const legacyPath = path.join(root, 'state', 'macp', 'owner.pub');
  const legacyKey = existsSync(legacyPath) ? readFileSync(legacyPath, 'utf8').trim() : null;

  if (signers.size === 0 && !legacyKey) {
    return {
      code: 0,
      out: 'verify: no state/macp/allowed_signers and no owner.pub — nothing was signed yet.',
    };
  }

  const repo = repoId(root);
  const findings = [];
  const notes = [];
  let verified = 0;

  for (const session of listSessions(root)) {
    const close = section(session.text, 'Close');
    const authorisation = section(session.text, 'Close authorization');
    const branch = branchesNamed(session.text)[0] ?? '';

    // 1. The close authorisation (AWAITING-USER -> COMPLETED), signed by macp-close.
    if (authorisation) {
      const signature = grab(authorisation, 'Close signature');
      const closeKey = signers.get(ACTS.close);
      if (!closeKey) {
        findings.push(
          `${session.id}: has a close authorisation but no \`${ACTS.close}\` principal`,
        );
      } else if (!signature) {
        findings.push(`${session.id}: close authorisation carries no signature`);
      } else {
        const payload = closePayload({
          repo,
          session: session.id,
          agent: field(session.text, 'Agent') ?? '',
          branch,
          codeCommit: grab(authorisation, 'Code commit'),
          outcome: grab(authorisation, 'Outcome'),
          closedAt: grab(authorisation, 'Closed at'),
        });
        if (verifyPayload(payload, signature, closeKey)) verified += 1;
        else findings.push(`${session.id}: close signature does not verify — the block was edited`);
      }
    }

    // 2. The seal (COMPLETED -> CLOSED), signed by macp-seal.
    if (session.status === STATUS.CLOSED) {
      const signature = close ? grab(close, 'Seal signature') : '';
      if (!signature) {
        notes.push(`${session.id}: sealed without a signature (legacy seal, before SSH signing)`);
        continue;
      }
      // Which key sealed this session? Both are legitimate: everything before
      // ADR-0046 was sealed by the single legacy key, and adding the principal
      // file must not invalidate those records. Pick the candidate whose
      // fingerprint is the one written into the block, rather than assuming the
      // newest principal is the one that signed an old session.
      const recorded = grab(close, 'Passkey').replace(/^ssh-ed25519\s*/, '');
      const candidates = [signers.get(ACTS.seal), legacyKey].filter(Boolean);
      const sealKey = candidates.find((key) => keyFingerprintOfKey(key) === recorded);
      if (!sealKey) {
        findings.push(
          `${session.id}: sealed by ${recorded}, which is neither the \`${ACTS.seal}\` principal ` +
            'nor the legacy owner key — the seal was made by a key that is not in this repository',
        );
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
      if (verifyPayload(payload, signature, sealKey)) verified += 1;
      else
        findings.push(
          `${session.id}: seal signature does not verify — the file changed after sealing`,
        );
    }

    // 3. The reopen (CLOSED -> REOPENED), signed by macp-reopen.
    if (session.status === STATUS.REOPENED) {
      const reopen = section(session.text, 'Reopen');
      const reopenSignature = reopen ? grab(reopen, 'Reopen signature') : '';
      const reopenKey = signers.get(ACTS.reopen);
      if (!reopenSignature) {
        findings.push(`${session.id}: REOPENED without a verifiable reopen signature`);
        continue;
      }
      if (!reopenKey) {
        findings.push(`${session.id}: REOPENED, but there is no \`${ACTS.reopen}\` principal`);
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
      if (verifyPayload(payload, reopenSignature, reopenKey)) verified += 1;
      else
        findings.push(
          `${session.id}: reopen signature does not verify — reason or delta was edited`,
        );
    }
  }

  const lines = [
    `verify: ${verified} signature(s) checked against ${
      signers.size > 0 ? 'state/macp/allowed_signers' : 'state/macp/owner.pub (legacy)'
    }`,
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
