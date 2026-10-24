/**
 * The state machine, as commands.
 *
 * `UNBOUND → ACTIVE → CLOSING → COMPLETED → CLOSED → REOPENED → CLOSING …`
 *
 * The transitions are here rather than in `docs/macp.md` because prose cannot
 * refuse. A document that says "an agent must not start work without a session"
 * is advice; a command that exits 1 is a gate.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  currentBranch,
  commitsAheadOfMaster,
  dirtyPaths,
  ghJson,
  git,
  headSha,
  repoId,
  repoRoot,
  shortSha,
  writeJson,
  writeText,
} from './repo.mjs';
import {
  STATUS,
  activeSessionForBranch,
  appendToSection,
  branchesNamed,
  field,
  looksLikeId,
  nextSessionId,
  renderSession,
  sessionFileName,
  sessionsDir,
  sessionsForBranch,
  slugify,
  statusOf,
  withStatus,
} from './session.mjs';
import {
  conflictingLease,
  dropLease,
  makeLease,
  putLease,
  readLeases,
  leasePath,
} from './lease.mjs';
import {
  removeActiveAgent,
  setIndexStatus,
  ensureQueue,
  upsertActiveAgent,
  upsertIndexRow,
} from './statefiles.mjs';
import { buildBrief } from './brief.mjs';
import { DEFAULT_GATES, failedGates, runGates } from './gates.mjs';
import { handoffPath, renderHandoff, validateHandoff, writeHandoffRegion } from './handoff.mjs';
import {
  keyFingerprint,
  normaliseInstruction,
  reopenPayload,
  sealPayload,
  signPayload,
  verifyPayload,
} from './seal.mjs';
import { macpHome } from './repo.mjs';

/** ISO 8601 with the machine's own offset — the repo writes `+05:45`, not `Z`. */
export function isoLocal(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(date.getTime() + offset * 60_000).toISOString();
  return `${local.slice(0, 19)}${sign}${pad(abs / 60)}:${pad(abs % 60)}`;
}

function today(date = new Date()) {
  return isoLocal(date).slice(0, 10);
}

function sessionPath(root, file) {
  return path.join(sessionsDir(root), file);
}

/** Only the tree outside `state/` counts as source: state churn is state. */
export function dirtySource(root) {
  return dirtyPaths(root).filter((rel) => !rel.startsWith('state/') && !rel.startsWith('.git/'));
}

function openPrsFor(root, branch) {
  const prs = ghJson([
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'open',
    '--json',
    'number,title,mergeStateStatus',
  ]);
  if (!Array.isArray(prs)) return [];
  return prs.map((pr) => `#${pr.number} ${pr.title} (${pr.mergeStateStatus})`);
}

function requireRepo() {
  const root = repoRoot();
  if (!root) return { error: 'not inside a git repository' };
  return { root, id: repoId(root) };
}

/* ------------------------------------------------------------------ start -- */

export function start(options) {
  const context = requireRepo();
  if (context.error) return { code: 2, out: context.error };
  const { root, id } = context;

  const branch = options.branch || currentBranch(root);
  if (branch === 'master') {
    return { code: 1, out: 'a session does not start on master — branch first, then `macp start`' };
  }
  if (branch !== currentBranch(root)) {
    return {
      code: 1,
      out: `--branch ${branch} is not the checked-out branch (${currentBranch(root)}); check it out first`,
    };
  }

  const existing = activeSessionForBranch(root, branch);
  // The `**Agent:**` field is `SA12 (Sathi / WorkBuddy)` — the id, then the
  // name. Compare the id, or every resume looks like a different agent's
  // session and a resumed start fails as a conflict.
  const existingId = existing?.agent?.split(/[\s(]/)[0];
  if (existing && existingId !== options.agent) {
    return {
      code: 1,
      out: `conflict: ${existing.id} (${existing.agent}) already owns ${branch}. One branch, one session.`,
    };
  }

  const lease = makeLease({
    repoId: id,
    repoRoot: root,
    branch,
    session: existing
      ? existing.id
      : options.id || (looksLikeId(options.agent) ? options.agent : nextSessionId(root)),
    agent: options.agent,
    harness: options.harness,
    baseCommit:
      options.baseCommit || git(['merge-base', 'HEAD', 'master'], { cwd: root, allowFail: true }),
  });

  const conflict = conflictingLease(id, lease);
  if (conflict) {
    return {
      code: 1,
      out:
        `conflict: session ${conflict.session} holds an active lease on ${conflict.branch} ` +
        `(${conflict.repoRoot}). Close it with \`macp close\` before starting another.`,
    };
  }

  const id_ = lease.session;
  const at = isoLocal();
  const fileName = existing
    ? path.basename(existing.file)
    : sessionFileName({ id: id_, slug: slugify(options.task), at });
  const filePath = sessionPath(root, fileName);

  if (!existsSync(filePath)) {
    writeText(
      filePath,
      renderSession({
        id: id_,
        agent: options.agent,
        agentName: options.agentName,
        harness: options.harness,
        history: options.history,
        branch,
        started: at,
        baseCommit: lease.baseCommit || shortSha(root),
        title: options.task,
        task: options.task,
        authorizedBy: options.authorizedBy,
      }),
    );
  }

  // One plan per session, not one per task string. The plan already exists if
  // this is a resume, and re-slugging the task would leave two plans for one
  // session — which is how `state/plans/` accumulates dead entries.
  const plansDir = path.join(root, 'state', 'plans');
  const existingPlan = existsSync(plansDir)
    ? readdirSync(plansDir).find((name) => name.startsWith(`agent-${id_}-`) && name.endsWith('.md'))
    : null;
  const planPath = path.join(plansDir, existingPlan ?? `agent-${id_}-${slugify(options.task)}.md`);
  if (!existsSync(planPath)) {
    writeText(
      planPath,
      `# Plan — ${id_}: ${options.task}\n\n**Agent:** ${id_} · **Branch:** \`${branch}\`\n\n` +
        `## Objective\n\n${options.task}\n\n## Scope\n\n` +
        `Authorized by: ${options.authorizedBy}\n\n## Approach\n\n_fill in before the first edit_\n\n` +
        `## Risks and mitigations\n\n## Rollback\n\n## Success criteria\n`,
    );
  }

  ensureQueue(root);
  upsertActiveAgent(root, {
    id: id_,
    agent: existing?.agent ?? `${id_} (${options.agentName})`,
    harness: options.harness,
    branch,
    task: options.task,
    since: at,
    claims: options.claims ?? '—',
  });
  upsertIndexRow(root, {
    id: id_,
    date: today(),
    agent: id_,
    harness: options.harness,
    branch,
    task: options.task,
    status: existing ? existing.status : STATUS.IN_PROGRESS,
    file: fileName,
  });

  putLease(id, lease);

  const brief = options.brief
    ? buildBrief({
        root,
        repo: id,
        branch,
        baseCommit: lease.baseCommit || shortSha(root),
        sessionId: id_,
        task: options.task,
        authorizedBy: options.authorizedBy,
        limit: options.limit,
        machine: {
          branch,
          base: shortSha(root),
          ahead_of_master: commitsAheadOfMaster(root),
          dirty_source_files: dirtySource(root).length,
          open_prs: openPrsFor(root, branch).join('; ') || 'none',
          lease: leasePath(id),
        },
      })
    : '';

  return {
    code: 0,
    out:
      `${existing ? 'resumed' : 'started'} ${id_} on ${branch}\n` +
      `  session: ${path.relative(root, filePath)}\n  plan:    ${path.relative(root, planPath)}\n` +
      `  lease:   ${leasePath(id)} (untracked, local)\n` +
      (brief ? `\n${brief}` : ''),
  };
}

/* ------------------------------------------------------------------- close -- */

function freeze(lease, root, id) {
  const updated = {
    ...lease,
    state: 'CLOSING',
    codeCommitSha: headSha(root),
    closingAt: isoLocal(),
  };
  putLease(id, updated);
  return updated;
}

function closeAbort(out) {
  return { code: 1, out };
}

export function close(options) {
  const context = requireRepo();
  if (context.error) return { code: 2, out: context.error };
  const { root, id } = context;
  const branch = currentBranch(root);

  const session = activeSessionForBranch(root, branch);
  if (!session) {
    return closeAbort(
      `no active session for ${branch} — run \`macp start\` first, or this branch has none`,
    );
  }

  const dirty = dirtySource(root);
  if (dirty.length > 0) {
    return closeAbort(
      `the tree is not clean:\n${dirty.map((rel) => `  ${rel}`).join('\n')}\n` +
        'Commit or revert before closing. A close is not a place to park work.',
    );
  }

  const store = readLeases(id);
  const lease = store.leases[branch];
  if (!lease) {
    return closeAbort(
      `no lease for ${branch}. The session file exists but this machine never ran ` +
        '`macp start` for it — that is the exact gap the lease closes.',
    );
  }

  if (lease.state === 'CLOSING' && lease.codeCommitSha !== headSha(root)) {
    putLease(id, { ...lease, state: 'ACTIVE', codeCommitSha: undefined, closingAt: undefined });
    return closeAbort(
      `HEAD moved from ${String(lease.codeCommitSha).slice(0, 7)} while closing — source changed ` +
        'after the freeze, so the close is void. Back to ACTIVE; commit, then close again.',
    );
  }

  if (options.prepare) {
    const frozen = freeze(lease, root, id);
    return {
      code: 0,
      out:
        `CLOSING — frozen at ${String(frozen.codeCommitSha).slice(0, 7)}.\n` +
        'No source change may follow. Run the gates, then `macp close` to record the handoff.',
    };
  }

  if (lease.state !== 'CLOSING') freeze(lease, root, id);

  const gateNames = options.gates ?? DEFAULT_GATES;
  const results = options.runGates ? runGates(root, gateNames) : [];
  const gateRecord = Object.fromEntries(results.map((result) => [result.name, result]));

  const commits = git(['log', '--format=%h %s', `master..HEAD`], { cwd: root, allowFail: true })
    .split('\n')
    .filter(Boolean);

  const handoff = {
    schema: 'macp-handoff-v1',
    session: session.id,
    agent: field(session.text, 'Agent'),
    harness: field(session.text, 'Harness'),
    branch,
    base_commit_sha: field(session.text, 'Base commit') ?? '',
    code_commit_sha: headSha(root),
    working_tree_clean: dirtySource(root).length === 0,
    commits,
    open_prs: openPrsFor(root, branch),
    gates: gateRecord,
    outcome: options.outcome,
    completed: options.completed,
    remaining: options.remaining,
    discovered_bugs: options.discovered,
    deferred_work: options.deferred,
    traps_learned: options.traps,
    next_recommended_task: options.next,
    required_context: options.requiredContext,
    closed_at: isoLocal(),
  };

  const problems = validateHandoff(handoff);
  if (problems.length > 0) {
    return closeAbort(
      `the close does not satisfy its own contract:\n${problems.map((p) => `  - ${p}`).join('\n')}` +
        (results.length > 0
          ? `\n\nfailing gates: ${failedGates(results).join(', ') || 'none'}\n` +
            results
              .filter((result) => result.exit !== 0)
              .map((result) => `\n--- ${result.name} (exit ${result.exit}) ---\n${result.tail}`)
              .join('\n')
          : '\n\nno gate was run — pass --gates or --no-gates deliberately'),
    );
  }

  writeJson(handoffPath(root, session.id), handoff);
  writeHandoffRegion(root, renderHandoff(handoff));

  const gateTable =
    results.length === 0
      ? '| _none run_ | | |'
      : results
          .map((result) => `| ${result.name} | ${result.exit} | ${Math.round(result.ms / 1000)}s |`)
          .join('\n');

  let text = readFileSync(session.file, 'utf8');
  text = appendToSection(
    text,
    'Close report',
    [
      `**Outcome:** ${handoff.outcome}`,
      '',
      `Machine-stamped at ${handoff.closed_at} from \`macp close\`. Code commit \`${handoff.code_commit_sha.slice(0, 7)}\`.`,
      '',
      '| Gate | Exit | Time |',
      '| ---- | ---- | ---- |',
      gateTable,
      '',
      `Remaining: ${handoff.remaining.length === 0 ? 'none' : `${handoff.remaining.length} item(s)`}`,
      '',
      `Next: ${handoff.next_recommended_task || '—'}`,
    ].join('\n'),
  );
  text = withStatus(text, STATUS.COMPLETED);
  writeText(session.file, text);

  removeActiveAgent(root, session.id);
  setIndexStatus(root, session.id, STATUS.COMPLETED);
  dropLease(id, branch);

  return {
    code: 0,
    out:
      `COMPLETED ${session.id} — ${handoff.outcome}\n` +
      `  handoff: state/macp/handoff/${session.id}.json + the region at the top of state/CONTINUATION.md\n` +
      `  gates:   ${results.length === 0 ? 'none run' : results.map((r) => `${r.name}=${r.exit}`).join(' ')}\n` +
      '  next:    the owner seals it with `macp seal`',
  };
}

/* -------------------------------------------------------------------- seal -- */

/**
 * Quote the instruction so it round-trips: block → parse → payload → signature.
 *
 * Backslashes are escaped before quotes, or a trailing `\` in the owner's words
 * would escape the closing quote and the parsed instruction would differ from
 * the signed one by one character — which verifies as a tamper.
 */
function quoteInstruction(value) {
  const flattened = normaliseInstruction(value);
  return `"${flattened.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function closeBlock({
  instruction,
  closedAt,
  statusAtClose,
  outcome,
  codeCommit,
  fingerprint,
  signature,
}) {
  return [
    '## Close',
    '',
    `- **Closed by:** owner — instruction: ${quoteInstruction(instruction)}`,
    `- **Closed at:** ${closedAt}`,
    `- **Status at close:** ${statusAtClose}`,
    `- **Outcome:** ${outcome}`,
    `- **Code commit:** ${codeCommit}`,
    `- **Passkey:** ssh-ed25519 ${fingerprint}`,
    `- **Seal signature:** ${signature}`,
  ].join('\n');
}

function replaceSection(text, title, body) {
  const pattern = new RegExp(`^## ${title}\\s*$`, 'm');
  const start = text.search(pattern);
  if (start === -1) return `${text.replace(/\s*$/, '')}\n\n${body}\n`;
  const rest = text.slice(start);
  const end = rest.slice(3).search(/^## /m);
  const tail = end === -1 ? '' : rest.slice(end + 3);
  return `${text.slice(0, start)}${body}\n\n${tail}`.replace(/\s*$/, '\n');
}

export function seal(options) {
  const context = requireRepo();
  if (context.error) return { code: 2, out: context.error };
  const { root, id } = context;

  const session = sessionsForBranch(root, currentBranch(root)).find(
    (candidate) => candidate.id === options.session,
  );
  if (!session) {
    const all = sessionsForBranch(root, currentBranch(root));
    return {
      code: 1,
      out:
        `no session ${options.session} on ${currentBranch(root)}` +
        (all.length > 0 ? ` (found: ${all.map((s) => s.id).join(', ')})` : ''),
    };
  }
  if (session.status !== STATUS.COMPLETED) {
    return {
      code: 1,
      out: `${session.id} is ${session.status}; only a COMPLETED session can be sealed`,
    };
  }

  const dirty = dirtySource(root);
  if (dirty.length > 0) {
    return { code: 1, out: `refusing to seal over a dirty tree:\n  ${dirty.join('\n  ')}` };
  }

  const keyPath = options.sshKey;
  if (!existsSync(keyPath)) {
    return {
      code: 1,
      out:
        `no SSH private key at ${keyPath}. The seal is an SSH signature; without the key there is ` +
        'nothing to seal with. Pass --ssh-key <path> (default ~/.ssh/id_ed25519).',
    };
  }

  const codeCommit = headSha(root);
  const closedAt = isoLocal();
  const outcome = options.outcome || 'COMPLETED';
  const instruction = normaliseInstruction(options.instruction);
  const payload = sealPayload({
    repo: id,
    session: session.id,
    agent: field(session.text, 'Agent') ?? '',
    branch: currentBranch(root),
    baseCommit: field(session.text, 'Base commit') ?? '',
    codeCommit,
    outcome,
    closedAt,
    instruction,
  });

  const signed = signPayload(payload, keyPath);
  const block = closeBlock({
    instruction,
    closedAt,
    statusAtClose: outcome,
    outcome: options.summary || outcome,
    codeCommit,
    fingerprint: signed.fingerprint,
    signature: signed.signature,
  });

  let text = readFileSync(session.file, 'utf8');
  text = replaceSection(text, 'Close', block);
  text = withStatus(text, STATUS.CLOSED);
  if (/^\*\*Closed:\*\*/m.test(text)) {
    text = text.replace(/^\*\*Closed:\*\*.*$/m, `**Closed:** ${closedAt} by owner`);
  } else {
    text = text.replace(
      /^\*\*Status:\*\*.*$/m,
      `**Closed:** ${closedAt} by owner\n**Status:** ${STATUS.CLOSED}`,
    );
  }
  writeText(session.file, text);

  writeJson(path.join(macpHome(), 'seals', id, `${session.id}.json`), {
    schema: 'macp-seal-v1',
    repo: id,
    session: session.id,
    fingerprint: signed.fingerprint,
    payload,
    signature: signed.signature,
    sealedAt: closedAt,
  });
  writeText(path.join(root, 'state', 'macp', 'owner.pub'), `${signed.publicKey}\n`);
  setIndexStatus(root, session.id, STATUS.CLOSED);

  return {
    code: 0,
    out:
      `SEALED ${session.id} at ${closedAt}\n` +
      `  key:       ${signed.fingerprint}\n` +
      `  record:    ~/.macp/seals/${id}/${session.id}.json (outside the tree)\n` +
      `  public:    state/macp/owner.pub (committed — it is public, and CI verifies with it)\n` +
      '  reopen:    impossible without the private key',
  };
}

/* ------------------------------------------------------------------ reopen -- */

/** Rebuild the payload a `## Close` block asserts, from the file itself. */
export function sealPayloadFromText(text, { repo, session, branch }) {
  const close = text.slice(text.indexOf('## Close'));
  const grab = (name) =>
    new RegExp(`\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm').exec(close)?.[1]?.trim();
  const quoted =
    /^\s*-\s*\*\*Closed by:\*\*[^\n]*instruction: (".*")\s*$/m.exec(close)?.[1] ?? '""';
  const instruction = quoted.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return sealPayload({
    repo,
    session,
    agent: field(text, 'Agent') ?? '',
    branch,
    baseCommit: field(text, 'Base commit') ?? '',
    codeCommit: grab('Code commit') ?? '',
    outcome: grab('Status at close') ?? '',
    closedAt: grab('Closed at') ?? '',
    instruction,
  });
}

export function reopen(options) {
  const context = requireRepo();
  if (context.error) return { code: 2, out: context.error };
  const { root, id } = context;

  const all = sessionsForBranch(root, currentBranch(root));
  const session = all.find((candidate) => candidate.id === options.session);
  if (!session) return { code: 1, out: `no session ${options.session} on ${currentBranch(root)}` };
  if (session.status !== STATUS.CLOSED) {
    return {
      code: 1,
      out: `${session.id} is ${session.status}; only a CLOSED session can be reopened`,
    };
  }

  const closeBlockText = session.text.slice(session.text.indexOf('## Close'));
  const fingerprint = /\*\*Passkey:\*\*\s*ssh-ed25519\s*(\S+)/.exec(closeBlockText)?.[1];
  const sealSignature = /\*\*Seal signature:\*\*\s*(\S+)/.exec(closeBlockText)?.[1];
  if (!fingerprint || !sealSignature) {
    return {
      code: 1,
      out: `${session.id} was sealed before signatures existed (a legacy seal). It cannot be reopened.`,
    };
  }

  const keyPath = options.sshKey;
  if (!existsSync(keyPath)) {
    return {
      code: 1,
      out:
        `no SSH private key at ${keyPath}. A reopen is signed with the owner's key; without it, ` +
        'the session stays closed — which is the point of the seal.',
    };
  }

  const publicKeyPath = path.join(root, 'state', 'macp', 'owner.pub');
  if (!existsSync(publicKeyPath)) {
    return {
      code: 1,
      out: 'state/macp/owner.pub is missing — cannot verify the seal before reopening',
    };
  }
  const publicKey = readFileSync(publicKeyPath, 'utf8').trim();
  if (keyFingerprint(publicKeyPath) !== fingerprint) {
    return {
      code: 1,
      out:
        `the committed owner key (${keyFingerprint(publicKeyPath)}) is not the key that sealed ` +
        `${session.id} (${fingerprint}). Refusing: the seal has been tampered with.`,
    };
  }

  const branch = currentBranch(root);
  const originalPayload = sealPayloadFromText(session.text, {
    repo: id,
    session: session.id,
    branch,
  });
  if (!verifyPayload(originalPayload, sealSignature, publicKey)) {
    return {
      code: 1,
      out:
        `${session.id}'s seal does not verify. The file was edited after it was sealed, so there ` +
        'is nothing legitimate to reopen. Investigate the diff instead.',
    };
  }

  const reopenedAt = isoLocal();
  const payload = reopenPayload({
    repo: id,
    session: session.id,
    sealFingerprint: fingerprint,
    reason: options.reason,
    delta: options.delta,
    reopenedAt,
  });
  const signed = signPayload(payload, keyPath);

  const block = [
    '## Reopen',
    '',
    `- **Reopened at:** ${reopenedAt}`,
    `- **Passkey:** ssh-ed25519 ${signed.fingerprint}`,
    `- **Reopen signature:** ${signed.signature}`,
    `- **Reason:** ${options.reason}`,
    `- **Delta:** ${options.delta}`,
  ].join('\n');

  let text = replaceSection(readFileSync(session.file, 'utf8'), 'Reopen', block);
  text = withStatus(text, STATUS.REOPENED);
  writeText(session.file, text);
  setIndexStatus(root, session.id, STATUS.REOPENED);

  putLease(id, {
    ...makeLease({
      repoId: id,
      repoRoot: root,
      branch,
      session: session.id,
      agent: session.agent,
      harness: session.harness,
      baseCommit: field(session.text, 'Base commit') ?? '',
    }),
    state: 'ACTIVE',
    reopenedAt,
  });
  upsertActiveAgent(root, {
    id: session.id,
    agent: session.agent ?? session.id,
    harness: session.harness ?? 'unknown',
    branch,
    task: `reopened: ${options.reason}`,
    since: reopenedAt,
    claims: '—',
  });

  return {
    code: 0,
    out:
      `REOPENED ${session.id} at ${reopenedAt}\n` +
      `  signed by: ${signed.fingerprint}\n` +
      '  the full close/seal sequence must run again before it closes',
  };
}

/** True when `branch` is one of the sessions' declared branches. */
export function sessionCoversBranch(session, branch) {
  return branchesNamed(session.text).includes(branch);
}

export function currentStatus(root) {
  const branch = currentBranch(root);
  const session = activeSessionForBranch(root, branch);
  return { branch, status: session ? statusOf(session.text) : 'UNBOUND', session };
}
