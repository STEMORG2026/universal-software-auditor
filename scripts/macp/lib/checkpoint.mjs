/**
 * Task checkpoints: the submit gate *inside* a session.
 *
 * An objective is rarely one task. The old model had exactly one review point
 * — the session submit — which meant an agent could do three tasks in the
 * wrong direction and present them all at once, or close on half-finished
 * work. Both are the same defect: too much unreviewed distance between the
 * owner and the agent.
 *
 * A checkpoint is the agent stopping on purpose:
 *
 *   - `macp checkpoint --task "<title>" [--note "..."]` after finishing a task.
 *     The lease flips to `AWAITING-CHECKPOINT`, which the pre-tool guard
 *     treats as a full stop — no edits, no commits, nothing until the owner
 *     acks. The stop is ONE-WAY: there is no `--force`, no self-ack, and the
 *     session file records the exact commit the agent stood at.
 *   - `macp ack <N> --ssh-key <key>` is the owner's act, signed with the
 *     `macp-ack` principal. It releases the freeze and appends the signature
 *     to the checkpoint entry, so "the owner let this through" is a fact in
 *     the record, not a claim.
 *
 * `macp submit` refuses while any checkpoint is unacked, and `macp verify`
 * re-checks every ack signature offline — the same authority model as close,
 * seal and reopen, one principal per act.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { appendToSection, field, section, sessionsDir } from './session.mjs';
import {
  ACTS,
  ackPayload,
  agentLoadedRefusal,
  keyLoadedInAgent,
  principalFor,
  readSigners,
  allowedSignersPath,
  signPayload,
} from './seal.mjs';
import { getLease, putLease } from './lease.mjs';
import { currentBranch, headSha, repoId, repoRoot, writeText } from './repo.mjs';
import { isoLocal } from './lifecycle.mjs';

export const LEASE_AWAITING_CHECKPOINT = 'AWAITING-CHECKPOINT';

/** Parse the `## Checkpoints` section into entries. */
export function parseCheckpoints(text) {
  const body = section(text, 'Checkpoints');
  if (!body) return [];
  const entries = [];
  for (const rawLine of body.split('\n')) {
    // `1. [ ] Title` — open; `1. [x] Title` — acked by the owner.
    const match = /^(\d+)\.\s+\[( |x)\]\s+(.*)$/.exec(rawLine.trim());
    if (!match) continue;
    const [, number, done, rest] = match;
    const submittedAt = /\(submitted ([^)]+)\)/.exec(rest)?.[1] ?? '';
    const at = /\(at ([0-9a-f]{7,})\)/.exec(rest)?.[1] ?? '';
    const ackedAt = /\(acked ([^)]+)\)/.exec(rest)?.[1] ?? '';
    const sigMatch = /\*\*Ack signature:\*\*\s*(\S+)/.exec(rest);
    // The signature marker is part of the rendered line, not of the title the
    // owner acked: strip it before the parentheticals, or the rebuilt payload
    // would include the signature text in the title and never verify.
    const title = rest
      .replace(/\s*\*\*Ack signature:\*\*\s*\S+/, '')
      .replace(/\s*\(submitted [^)]+\)/, '')
      .replace(/\s*\(at [0-9a-f]{7,}\)/, '')
      .replace(/\s*\(acked [^)]+\)/, '')
      .trim();
    entries.push({
      number: Number.parseInt(number, 10),
      done: done === 'x',
      title,
      submittedAt,
      codeCommit: at,
      ackedAt,
      signature: sigMatch?.[1] ?? '',
    });
  }
  return entries.sort((a, b) => a.number - b.number);
}

/** The entries that still await the owner. */
export function unackedCheckpoints(text) {
  return parseCheckpoints(text).filter((entry) => !entry.done);
}

/** Render the whole section from entries — the single writer of the block. */
export function renderCheckpoints(entries) {
  if (entries.length === 0) return '';
  const lines = entries.map((entry) =>
    [
      `${entry.number}. [${entry.done ? 'x' : ' '}] ${entry.title}`,
      `(submitted ${entry.submittedAt})`,
      entry.codeCommit ? `(at ${entry.codeCommit})` : '',
      entry.ackedAt ? `(acked ${entry.ackedAt})` : '',
      entry.signature ? `**Ack signature:** ${entry.signature}` : '',
    ]
      .filter(Boolean)
      .join(' ')
      .trim(),
  );
  return lines.join('\n');
}

function checkpointsSection(text) {
  return section(text, 'Checkpoints');
}

/** Replace the section body, preserving position (created at end if absent). */
function rewriteCheckpoints(text, entries) {
  const body = renderCheckpoints(entries);
  const existing = checkpointsSection(text);
  if (!existing) {
    return appendToSection(text, 'Checkpoints', body);
  }
  // Replace the whole section in place: keep everything before its `## ` line,
  // drop the old body, insert the new one, keep whatever followed.
  const start = text.search(new RegExp('^## Checkpoints\\s*$', 'm'));
  const after = text.slice(start);
  const end = after.slice(3).search(/^## /m);
  const sectionEnd = end === -1 ? text.length : start + end + 3;
  const head = text.slice(0, start).replace(/\s*$/, '');
  const tail = text.slice(sectionEnd);
  return `${head}\n\n## Checkpoints\n\n${body}\n${tail.replace(/^\n+/, '\n')}`;
}

/**
 * `macp checkpoint` — the agent stops after finishing a task and asks for
 * direction. One-way: the freeze cannot be lifted by the agent.
 */
export function checkpoint(options) {
  const root = repoRoot();
  if (!root) return { code: 2, out: 'not inside a git repository' };
  const id = repoId(root);
  const branch = currentBranch(root);

  const lease = getLease(root, id, branch);
  if (!lease) {
    return {
      code: 1,
      out: `no lease for ${branch} — checkpoints belong to a session started with \`macp start\`.`,
    };
  }
  if (lease.state === LEASE_AWAITING_CHECKPOINT) {
    const open = unackedCheckpoints(readFileSync(sessionFileOf(root, lease.session), 'utf8'));
    const waiting = open.map((e) => `  ${e.number}. ${e.title}`).join('\n');
    return {
      code: 1,
      out:
        `already waiting on checkpoint ${open[open.length - 1]?.number}: the owner has not acked yet.\n` +
        (waiting || ''),
    };
  }
  if (lease.state !== 'ACTIVE') {
    return {
      code: 1,
      out:
        `the lease is ${lease.state}, not ACTIVE — a checkpoint is submitted mid-task from an active ` +
        'session. Submit the session instead if the work is finished.',
    };
  }

  const file = sessionFileOf(root, lease.session);
  const text = readFileSync(file, 'utf8');
  const entries = parseCheckpoints(text);
  const number = entries.length + 1;
  const at = isoLocal();
  const codeCommit = headSha(root);

  entries.push({
    number,
    done: false,
    title: options.task,
    submittedAt: at,
    codeCommit: codeCommit.slice(0, 7),
    ackedAt: '',
    signature: '',
  });
  writeText(file, rewriteCheckpoints(text, entries));

  putLease(id, {
    ...lease,
    state: LEASE_AWAITING_CHECKPOINT,
    checkpointNumber: number,
    checkpointAt: at,
    checkpointCommit: codeCommit,
  });

  const noteLine = options.note ? `\n  note:    ${options.note}` : '';
  return {
    code: 0,
    out:
      `CHECKPOINT ${number} — waiting for the owner\n` +
      `  task:    ${options.task}\n` +
      `  commit:  ${codeCommit.slice(0, 7)} (the owner acks this exact position)\n` +
      `  freeze:  no edits, no commits, until \`macp ack ${number} --ssh-key <key>\` releases the branch${noteLine}\n` +
      '  this stop is one-way: the agent cannot lift it, only the owner can.',
  };
}

/** Locate the session file for a session id. */
function sessionFileOf(root, sessionId) {
  const dir = sessionsDir(root);
  const name = readdirSync(dir).find((n) => n.includes(sessionId));
  return path.join(dir, name);
}

/**
 * `macp ack` — the owner's act. Signs the checkpoint entry with the
 * `macp-ack` principal and releases the freeze.
 *
 * The ack is bound to the exact commit the agent stood at, so an ack cannot be
 * replayed onto work the owner never saw.
 */
export function ack(options) {
  const root = repoRoot();
  if (!root) return { code: 2, out: 'not inside a git repository' };
  const id = repoId(root);
  const branch = currentBranch(root);

  const lease = getLease(root, id, branch);
  if (!lease) return { code: 1, out: `no lease for ${branch} — nothing to ack.` };

  const file = sessionFileOf(root, lease.session);
  const text = readFileSync(file, 'utf8');
  const entries = parseCheckpoints(text);
  const wanted = Number.parseInt(options.number, 10);
  const entry = entries.find((e) => e.number === wanted);
  if (!entry) {
    return { code: 1, out: `no checkpoint ${wanted} in ${lease.session}.` };
  }
  if (entry.done) {
    return { code: 0, out: `checkpoint ${wanted} is already acked.` };
  }

  // The owner's act: the ack principal, checked before the transition.
  const signers = readSigners(allowedSignersPath(root));
  if (signers.size === 0) {
    return {
      code: 1,
      out: "no authority file at state/macp/allowed_signers — an ack is the owner's act.",
    };
  }
  if (!options.sshKey) {
    return { code: 1, out: 'acking requires the owner key: pass --ssh-key <path>.' };
  }
  const principal = principalFor(options.sshKey, signers);
  if (principal !== ACTS.ack) {
    return {
      code: 1,
      out:
        `the key at ${options.sshKey} is ${principal ? `\`${principal}\`` : 'not in allowed_signers'}; ` +
        `acking requires \`${ACTS.ack}\`. The ack is the direction check — it gets its own key.`,
    };
  }
  if (keyLoadedInAgent(options.sshKey)) {
    return { code: 1, out: agentLoadedRefusal(options.sshKey, ACTS.ack) };
  }

  const ackedAt = isoLocal();
  const fullCommit = entry.codeCommit ? headShaOf(root, entry.codeCommit) : headSha(root);
  const signed = signPayload(
    ackPayload({
      repo: id,
      session: lease.session,
      agent: field(text, 'Agent') ?? '',
      branch,
      number: String(entry.number),
      title: entry.title,
      codeCommit: fullCommit,
      note: options.note ?? '',
      ackedAt,
    }),
    options.sshKey,
  );

  entry.done = true;
  entry.ackedAt = ackedAt;
  entry.signature = signed.signature;
  writeText(file, rewriteCheckpoints(text, entries));

  // Release the freeze — but only when every checkpoint so far is acked. Acking
  // an older entry while a newer one waits keeps the freeze on: the owner has
  // seen task 2, not task 3.
  const stillWaiting = unackedCheckpoints(readFileSync(file, 'utf8'));
  const released =
    stillWaiting.length === 0
      ? putLease(id, {
          ...lease,
          state: 'ACTIVE',
          checkpointNumber: undefined,
          checkpointAt: undefined,
          checkpointCommit: undefined,
        })
      : lease;

  const still =
    stillWaiting.length > 0
      ? `\n  waiting: ${stillWaiting.map((e) => e.number).join(', ')} — the freeze stays on.`
      : '';
  return {
    code: 0,
    out:
      `ACKED checkpoint ${wanted} — ${entry.title}\n` +
      `  by:      owner, principal \`${ACTS.ack}\`, at ${ackedAt}\n` +
      `  bound:   commit ${String(fullCommit).slice(0, 7)}${still}` +
      (released.state === 'ACTIVE' ? '\n  branch:  released — continue with the next task.' : ''),
  };
}

/** The full commit a short sha refers to, or HEAD. */
function headShaOf(root, short) {
  try {
    return execFileSync('git', ['rev-parse', short], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return headSha(root);
  }
}

/** What `macp status` and the guard need: is this branch frozen at a checkpoint? */
export function awaitingCheckpoint(lease) {
  return lease?.state === LEASE_AWAITING_CHECKPOINT;
}
