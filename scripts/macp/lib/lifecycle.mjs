/**
 * The state machine, as commands.
 *
 * `UNBOUND → ACTIVE → CLOSING → COMPLETED → CLOSED → REOPENED → CLOSING …`
 *
 * The transitions are here rather than in `docs/PROTOCOL.md` because prose cannot
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
  readJson,
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
  section,
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
import { failedGates, resolveGateNames, runGates } from './gates.mjs';
import { handoffPath, renderHandoff, validateHandoff, writeHandoffRegion } from './handoff.mjs';
import { unackedCheckpoints } from './checkpoint.mjs';
import { resolvePlanItem } from './plan.mjs';
import {
  ACTS,
  abandonPayload,
  agentLoadedRefusal,
  allowedSignersPath,
  closePayload,
  keyFingerprint,
  keyFingerprintOfKey,
  keyLoadedInAgent,
  normaliseInstruction,
  principalFor,
  readSigners,
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

/**
 * The objective a plan item produces: the item's own words, with its id and the
 * plan's sha above them. Copied, not summarised — a summary would be a second
 * version of the scope written by the party the scope constrains.
 */
function planObjective(item) {
  return `**${item.id} — ${item.title}** · from \`${item.file}\` (sha \`${item.sha}\`)\n\n${item.body}`;
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

  // The scope: an item in the plan document, or a sentence someone typed.
  // Resolved before anything is written, because a session opened against a
  // delivered phase cannot be undone by editing a session file afterwards.
  if (options.plan && options.task) {
    return { code: 1, out: 'pass --task or --plan, not both — the plan item is the scope' };
  }
  let planItem = null;
  if (options.plan) {
    const resolved = resolvePlanItem(root, options.plan, { file: options.planFile });
    if (resolved.error) return { code: 1, out: resolved.error };
    planItem = resolved.item;
  }
  const task = planItem ? planItem.title : options.task;

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
    startHeadSha: headSha(root),
    plan: planItem
      ? { id: planItem.id, file: planItem.file, status: planItem.status, sha: planItem.sha }
      : null,
  });

  const conflict = conflictingLease(id, lease);
  if (conflict) {
    return {
      code: 1,
      out:
        `conflict: session ${conflict.session} holds a ${conflict.state} lease on ` +
        `${conflict.branch} (${conflict.repoRoot}). One physical harness session, one MACP ` +
        'session: continue that one, or have the owner close it, before starting another.',
    };
  }

  const id_ = lease.session;
  const at = isoLocal();
  const fileName = existing
    ? path.basename(existing.file)
    : sessionFileName({ id: id_, slug: slugify(task), at });
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
        title: task,
        task: planItem ? planObjective(planItem) : options.task,
        plan: planItem
          ? `${planItem.file} · item ${planItem.id} · status ${planItem.status} · sha ${planItem.sha}`
          : null,
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
  const planPath = path.join(plansDir, existingPlan ?? `agent-${id_}-${slugify(task)}.md`);
  if (!existsSync(planPath)) {
    writeText(
      planPath,
      `# Plan — ${id_}: ${task}\n\n**Agent:** ${id_} · **Branch:** \`${branch}\`\n\n` +
        `## Objective\n\n${planItem ? planObjective(planItem) : task}\n\n## Scope\n\n` +
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
    task,
    since: at,
    claims: options.claims ?? '—',
  });
  upsertIndexRow(root, {
    id: id_,
    date: today(),
    agent: id_,
    harness: options.harness,
    branch,
    task,
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
        task,
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
      `  scope:   ${planItem ? `plan item ${planItem.id} (${planItem.status}) from ${planItem.file}` : 'from --task'}\n` +
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

/**
 * The agent's terminal act: freeze, run the gates, record the report, and stop.
 *
 * This used to be `close`, and `close` wrote `COMPLETED` with no key at all.
 * That conflated two different claims — "I am finished" (the agent's, unsigned)
 * and "this session is closed" (the owner's) — and let an agent reach a terminal
 * state alone. `submit` produces `AWAITING-USER`: work over, report written, and
 * nothing further permitted until the owner acts.
 */
export function submit(options) {
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

  // The submit gate: every task checkpoint must have been acked by the owner
  // before the session itself may be submitted. This is what makes "you don't
  // close on half work" structural — an objective with five tasks produces
  // five owner acks along the way, not one surprise at the end.
  const unacked = unackedCheckpoints(readFileSync(session.file, 'utf8'));
  if (unacked.length > 0) {
    return closeAbort(
      `the session has ${unacked.length} unacked task checkpoint(s):\n` +
        `${unacked.map((e) => `  ${e.number}. ${e.title} (submitted ${e.submittedAt})`).join('\n')}\n` +
        'A submit is the session-level report; each task inside it was supposed to be ' +
        'checked as it finished. The owner acks with `macp ack <n> --ssh-key <key>`; ' +
        'then this submit will pass.',
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

  const gateNames = resolveGateNames(root, options.gates);
  const results = options.runGates ? runGates(root, gateNames) : [];
  const gateRecord = Object.fromEntries(results.map((result) => [result.name, result]));

  // Attribute only what this session did. `master..HEAD` credited a stacked
  // session with the commits of the session it was cut from (F-14).
  const startHead = lease.startHeadSha ?? field(session.text, 'Base commit') ?? '';
  const range = startHead ? `${startHead}..HEAD` : 'master..HEAD';
  const commits = git(['log', '--format=%h %s', range], { cwd: root, allowFail: true })
    .split('\n')
    .filter(Boolean);
  const filesChanged = startHead
    ? git(['diff', '--name-status', startHead, 'HEAD'], { cwd: root, allowFail: true })
        .split('\n')
        .filter(Boolean)
    : [];

  const handoff = {
    schema: 'macp-handoff-v1',
    session: session.id,
    agent: field(session.text, 'Agent'),
    harness: field(session.text, 'Harness'),
    branch,
    base_commit_sha: field(session.text, 'Base commit') ?? '',
    start_head_sha: startHead,
    code_commit_sha: headSha(root),
    // The tree, not just the commit. A commit id identifies a *history*; a tree id
    // identifies the content the gates actually ran against, and it survives a
    // rewrite of that history in a way the commit id does not.
    code_tree_sha: git(['rev-parse', `${headSha(root)}^{tree}`], { cwd: root, allowFail: true }),
    working_tree_clean: dirtySource(root).length === 0,
    // Read from the lease, not the session file: the lease is what `start`
    // wrote on this machine, and the plan's sha is what makes a later edit to
    // the plan document visible as a difference.
    plan: lease.plan ?? null,
    commits,
    files_changed: filesChanged,
    objective: (section(session.text, 'Objective') ?? '').replace(/^## Objective\s*/, '').trim(),
    open_prs: openPrsFor(root, branch),
    gates: gateRecord,
    // What the repository declares, recorded next to what this run chose to run.
    // The pair is the point: a report that names one gate while six exist is now
    // visible as an omission instead of reading as a complete run.
    required_gates: resolveGateNames(root),
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
          .map(
            (result) =>
              `| ${result.name} | ${result.status} | ${result.exit} | ${Math.round(result.ms / 1000)}s |`,
          )
          .join('\n');

  let text = readFileSync(session.file, 'utf8');
  // Replaced, not appended: a session may be submitted several times as the
  // owner answers each report, and a pile of stale reports is a record that
  // argues with itself about which tree the gates measured.
  text = replaceSection(
    text,
    'Submit report',
    [
      '## Submit report',
      '',
      `**Outcome:** ${handoff.outcome}`,
      '',
      `Machine-stamped at ${handoff.closed_at} from \`macp submit\`. Code commit \`${handoff.code_commit_sha.slice(0, 7)}\`.`,
      '',
      '| Gate | Verdict | Exit | Time |',
      '| ---- | ------- | ---- | ---- |',
      gateTable,
      '',
      `Remaining: ${handoff.remaining.length === 0 ? 'none' : `${handoff.remaining.length} item(s)`}`,
      '',
      `Next: ${handoff.next_recommended_task || '—'}`,
    ].join('\n'),
  );
  // A report is not an ending. The session returns to IN-PROGRESS so the owner
  // can answer it — "also do X" — and the agent can act without a signed resume
  // between every round. Closing is the owner's decision, made when he is
  // satisfied, not a state the agent's report forces him into.
  text = withStatus(text, STATUS.IN_PROGRESS);
  writeText(session.file, text);

  // The lease stays live, so the second-session guard still sees a session
  // owning this branch. `submittedAt` is what `close` acts on.
  putLease(id, {
    ...lease,
    state: 'ACTIVE',
    codeCommitSha: handoff.code_commit_sha,
    submittedAt: handoff.closed_at,
  });
  setIndexStatus(root, session.id, STATUS.IN_PROGRESS);

  return {
    code: 0,
    out:
      `reported ${session.id} — ${handoff.outcome} (session still IN-PROGRESS)\n` +
      `  report:  state/macp/handoff/${session.id}.json + the region at the top of state/CONTINUATION.md\n` +
      `  gates:   ${results.length === 0 ? 'none run' : results.map((r) => `${r.name}=${r.exit}`).join(' ')}\n` +
      `  tree:    ${handoff.code_commit_sha.slice(0, 7)} — the owner closes this exact tree\n` +
      '  next:    the owner runs `macp close`, then `macp seal`',
  };
}

/* ------------------------------------------------------------------- close -- */

/**
 * The owner's act: `AWAITING-USER → COMPLETED`.
 *
 * It runs no gates — they ran at submit — but it refuses when any non-`state/`
 * file changed after the commit those gates measured. That is what makes a gate
 * result evidence rather than a claim: the tree being closed is the tree that
 * was verified. It is also the check that closes the audit's F-08, where a
 * source change could ride in on the commit that recorded the close.
 */
export function close(options) {
  const context = requireRepo();
  if (context.error) return { code: 2, out: context.error };
  const { root, id } = context;
  const branch = currentBranch(root);

  // A reported session, not a state: `submit` returns the session to
  // IN-PROGRESS so the owner can answer it, so the proof that this session was
  // reported is the handoff it left. Sessions written before the change are
  // still AWAITING-USER and still carry a handoff, so they close the same way.
  const session = sessionsForBranch(root, branch).find(
    (candidate) =>
      candidate.status !== STATUS.COMPLETED &&
      candidate.status !== STATUS.CLOSED &&
      existsSync(handoffPath(root, candidate.id)),
  );
  if (!session) {
    const active = activeSessionForBranch(root, branch);
    return closeAbort(
      active
        ? `${active.id} is ${active.status} and has no report. The agent reports with ` +
            '`macp submit` first — a close acts on a reported session, not on work in progress.'
        : `no reported session on ${branch} — nothing to close.`,
    );
  }

  const handoff = readJson(handoffPath(root, session.id));
  if (!handoff) {
    return closeAbort(
      `${session.id} is ${session.status} but state/macp/handoff/${session.id}.json is missing — ` +
        'there is no report to close on.',
    );
  }

  // `git diff` against a commit that no longer exists fails, and the failure used
  // to be swallowed by `allowFail` — an empty diff, read as "nothing changed", so
  // a rewritten history closed a tree that was never measured. Ask first.
  const reported = String(handoff.code_commit_sha ?? '');
  const stillThere = git(['rev-parse', '--verify', '--quiet', `${reported}^{commit}`], {
    cwd: root,
    allowFail: true,
  });
  if (reported && !stillThere) {
    return closeAbort(
      `the report names commit ${reported.slice(0, 7)}, which this repository no longer has.\n` +
        'The history was rewritten after the gates ran, so the tree they measured cannot be ' +
        'identified any more. Nothing here can be verified — submit again from the current history.',
    );
  }

  const changed = git(['diff', '--name-only', reported, 'HEAD'], {
    cwd: root,
    allowFail: true,
  })
    .split('\n')
    .filter(Boolean);
  const source = changed.filter((rel) => !rel.startsWith('state/'));
  if (source.length > 0) {
    return closeAbort(
      `source changed after the gates ran at ${String(handoff.code_commit_sha).slice(0, 7)}:\n` +
        `${source.map((rel) => `  ${rel}`).join('\n')}\n` +
        'The report describes a tree that no longer exists. Return to work and submit again.',
    );
  }

  const dirty = dirtySource(root);
  if (dirty.length > 0) {
    return closeAbort(
      `the tree is not clean:\n${dirty.map((rel) => `  ${rel}`).join('\n')}\n` +
        'Commit or revert before closing.',
    );
  }

  // The owner's act, so it needs the owner's key — the close principal, not the
  // seal key and not the reopen key (one key per act).
  const signers = readSigners(allowedSignersPath(root));
  if (signers.size === 0) {
    return closeAbort(
      "no authority file at state/macp/allowed_signers. A close is the owner's act and needs " +
        `the \`${ACTS.close}\` key. Run \`macp init-authority\` once with the four public keys.`,
    );
  }
  if (!options.sshKey || !existsSync(options.sshKey)) {
    return closeAbort(
      `no SSH private key at ${options.sshKey ?? '(none given)'}. Closing requires the ` +
        `\`${ACTS.close}\` key: pass --ssh-key <path>.`,
    );
  }
  const principal = principalFor(options.sshKey, signers);
  if (principal !== ACTS.close) {
    return closeAbort(
      `the key at ${options.sshKey} is ${principal ? `\`${principal}\`` : 'not in allowed_signers'}; ` +
        `closing requires \`${ACTS.close}\`. A valid signature is not enough — it must be the ` +
        'principal this act is reserved for.',
    );
  }

  if (keyLoadedInAgent(options.sshKey)) {
    return closeAbort(agentLoadedRefusal(options.sshKey, ACTS.close));
  }

  if (keyLoadedInAgent(options.sshKey)) {
    return closeAbort(agentLoadedRefusal(options.sshKey, ACTS.close));
  }

  const closedAt = isoLocal();
  const signed = signPayload(
    closePayload({
      repo: id,
      session: session.id,
      agent: field(session.text, 'Agent') ?? '',
      branch,
      codeCommit: handoff.code_commit_sha,
      outcome: handoff.outcome,
      closedAt,
    }),
    options.sshKey,
  );

  let text = readFileSync(session.file, 'utf8');
  text = appendToSection(
    text,
    'Close authorization',
    [
      `- **Closed by:** owner — principal \`${ACTS.close}\``,
      `- **Closed at:** ${closedAt}`,
      `- **Outcome:** ${handoff.outcome}`,
      `- **Code commit:** ${handoff.code_commit_sha}`,
      `- **Close signature:** ${signed.signature}`,
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
      `  verified tree: ${String(handoff.code_commit_sha).slice(0, 7)} (unchanged since submit)\n` +
      '  next:    the owner seals it with `macp seal`',
  };
}

/* ----------------------------------------------------------------- abandon -- */

/**
 * The owner stopping work that was never finished.
 *
 * Before this existed, a mistaken or mis-scoped session had no lawful exit: it
 * could be closed (which asserts the work is done) or hand-edited back to
 * `IN-PROGRESS` (F-23). `abandon` is the third path, and it is signed like every
 * other owner act.
 */
export function abandon(options) {
  const context = requireRepo();
  if (context.error) return { code: 2, out: context.error };
  const { root, id } = context;
  const branch = currentBranch(root);

  const session = activeSessionForBranch(root, branch);
  if (!session) {
    return { code: 1, out: `no active session on ${branch} — nothing to abandon.` };
  }

  const signers = readSigners(allowedSignersPath(root));
  if (signers.size === 0) {
    return {
      code: 1,
      out: 'no authority file at state/macp/allowed_signers — an abandon is an owner act.',
    };
  }
  if (!options.sshKey || !existsSync(options.sshKey)) {
    return { code: 1, out: 'abandoning requires the owner key: pass --ssh-key <path>.' };
  }
  const principal = principalFor(options.sshKey, signers);
  if (principal !== ACTS.close) {
    return {
      code: 1,
      out: `the key at ${options.sshKey} is ${principal ? `\`${principal}\`` : 'not in allowed_signers'}; abandoning requires \`${ACTS.close}\`.`,
    };
  }
  if (keyLoadedInAgent(options.sshKey)) {
    return { code: 1, out: agentLoadedRefusal(options.sshKey, ACTS.close) };
  }

  const abandonedAt = isoLocal();
  const reason = normaliseInstruction(options.reason);
  const codeCommit = headSha(root);
  const signed = signPayload(
    abandonPayload({
      repo: id,
      session: session.id,
      agent: field(session.text, 'Agent') ?? '',
      branch,
      codeCommit,
      reason,
      abandonedAt,
    }),
    options.sshKey,
  );

  let text = readFileSync(session.file, 'utf8');
  text = appendToSection(
    text,
    'Abandon',
    [
      `- **Abandoned by:** owner — principal \`${ACTS.close}\``,
      `- **Abandoned at:** ${abandonedAt}`,
      `- **Reason:** ${reason}`,
      `- **Code commit:** ${codeCommit}`,
      `- **Abandon signature:** ${signed.signature}`,
    ].join('\n'),
  );
  text = withStatus(text, STATUS.ABANDONED);
  writeText(session.file, text);

  removeActiveAgent(root, session.id);
  setIndexStatus(root, session.id, STATUS.ABANDONED);
  dropLease(id, branch);

  return {
    code: 0,
    out:
      `ABANDONED ${session.id} — ${reason}\n` +
      '  the branch is free again; new work is a new session on a new branch',
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
        'nothing to seal with. Pass --ssh-key <path>.',
    };
  }

  // A seal is the `macp-seal` principal's act. Checking identity here is what
  // stops the audit's F-20: this command used to sign with whatever key it was
  // given and then overwrite owner.pub with it, so one wrong key invalidated
  // every prior seal.
  const signers = readSigners(allowedSignersPath(root));
  if (signers.size === 0) {
    return {
      code: 1,
      out:
        'no authority file at state/macp/allowed_signers. Run `macp init-authority` once with ' +
        `the four public keys; a seal needs the \`${ACTS.seal}\` principal.`,
    };
  }
  const principal = principalFor(keyPath, signers);
  if (principal !== ACTS.seal) {
    return {
      code: 1,
      out:
        `the key at ${keyPath} is ${principal ? `\`${principal}\`` : 'not in allowed_signers'}; ` +
        `sealing requires \`${ACTS.seal}\`.`,
    };
  }

  if (keyLoadedInAgent(keyPath)) {
    return { code: 1, out: agentLoadedRefusal(keyPath, ACTS.seal) };
  }

  if (keyLoadedInAgent(keyPath)) {
    return { code: 1, out: agentLoadedRefusal(keyPath, ACTS.seal) };
  }

  const codeCommit = headSha(root);
  const closedAt = isoLocal();
  const outcome = options.outcome || 'COMPLETED';
  const instruction = normaliseInstruction(options.instruction);

  // Build the block first, then sign the payload *reconstructed from the file a
  // verifier will read* — never from the values this process happens to hold.
  //
  // It used to sign `sealPayload({...})` built from in-memory values, while
  // `reopen` rebuilds the payload with `sealPayloadFromText(text)`. The two agree
  // only when every field coincides, and `closedAt` is `isoLocal()`: a clock tick
  // between `close` and `seal` made the signature cover a timestamp that was
  // never written. The result was a seal that failed verification about one run
  // in four, on an unchanged file — the worst possible failure for the one
  // guarantee this system exists to provide.
  const draft = closeBlock({
    instruction,
    closedAt,
    statusAtClose: outcome,
    outcome: options.summary || outcome,
    codeCommit,
    fingerprint: '',
    signature: '',
  });

  let text = readFileSync(session.file, 'utf8');
  text = replaceSection(text, 'Close', draft);
  text = withStatus(text, STATUS.CLOSED);
  if (/^\*\*Closed:\*\*/m.test(text)) {
    text = text.replace(/^\*\*Closed:\*\*.*$/m, `**Closed:** ${closedAt} by owner`);
  } else {
    text = text.replace(
      /^\*\*Status:\*\*.*$/m,
      `**Closed:** ${closedAt} by owner\n**Status:** ${STATUS.CLOSED}`,
    );
  }

  // The signature is not part of the payload, so signing after the block is in
  // place cannot be circular: a second `replaceSection` with the real signature
  // leaves every field the payload covers untouched.
  const payload = sealPayloadFromText(text, {
    repo: id,
    session: session.id,
    branch: currentBranch(root),
  });
  const signed = signPayload(payload, keyPath);
  text = replaceSection(
    text,
    'Close',
    closeBlock({
      instruction,
      closedAt,
      statusAtClose: outcome,
      outcome: options.summary || outcome,
      codeCommit,
      fingerprint: signed.fingerprint,
      signature: signed.signature,
    }),
  );
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
  setIndexStatus(root, session.id, STATUS.CLOSED);

  return {
    code: 0,
    out:
      `SEALED ${session.id} at ${closedAt}\n` +
      `  key:       ${signed.fingerprint}\n` +
      `  record:    ~/.macp/seals/${id}/${session.id}.json (outside the tree)\n` +
      `  authority: state/macp/allowed_signers (unchanged — a seal never rewrites it)\n` +
      '  reopen:    impossible without the private key',
  };
}

/* ------------------------------------------------------------------ reopen -- */

/** Rebuild the payload a `## Close` block asserts, from the file itself. */
/**
 * The close block, from the heading a *verifier* reads.
 *
 * There are two headings in play and they are not the same block: `close` writes
 * `## Close authorization`, `seal` writes `## Close`. Slicing from the first
 * occurrence of `## Close` therefore picked up `close`'s block while `verify`
 * matched `## Close` exactly — two readers, two blocks, one signature. That is
 * how a seal came to fail verification on an unchanged file.
 *
 * Exact heading first, and the older `Close authorization` heading only as a
 * fallback so seals written before the split still verify.
 */
export function closeSection(text) {
  return section(text, 'Close') ?? section(text, 'Close authorization') ?? '';
}

export function sealPayloadFromText(text, { repo, session, branch }) {
  const close = closeSection(text);
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

  const closeBlockText = closeSection(session.text);
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

  const reopenSigners = readSigners(allowedSignersPath(root));
  const reopening = principalFor(keyPath, reopenSigners);
  if (reopening !== ACTS.reopen) {
    return {
      code: 1,
      out:
        `the key at ${keyPath} is ${reopening ? `\`${reopening}\`` : 'not in allowed_signers'}; ` +
        `reopening requires \`${ACTS.reopen}\`. This is checked before the transition, not after.`,
    };
  }

  // The seal is verified against the *seal* principal, and the reopen is signed
  // by the *reopen* principal. They are different keys on purpose: a
  // key leaked for one act must not be able to perform another.
  const signers = readSigners(allowedSignersPath(root));
  const sealKeyLine = signers.get(ACTS.seal);
  const legacyPath = path.join(root, 'state', 'macp', 'owner.pub');
  const publicKey =
    sealKeyLine ?? (existsSync(legacyPath) ? readFileSync(legacyPath, 'utf8').trim() : null);
  if (!publicKey) {
    return {
      code: 1,
      out:
        'no seal authority: state/macp/allowed_signers has no `macp-seal` principal and ' +
        'state/macp/owner.pub is missing. Nothing can verify this seal.',
    };
  }
  const sealedFingerprint = sealKeyLine
    ? keyFingerprintOfKey(sealKeyLine)
    : keyFingerprint(legacyPath);
  if (sealedFingerprint !== fingerprint) {
    return {
      code: 1,
      out:
        `the committed seal key (${sealedFingerprint}) is not the key that sealed ${session.id} ` +
        `(${fingerprint}). Refusing: the seal has been tampered with.`,
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

  if (keyLoadedInAgent(keyPath)) {
    return { code: 1, out: agentLoadedRefusal(keyPath, ACTS.reopen) };
  }

  if (keyLoadedInAgent(keyPath)) {
    return { code: 1, out: agentLoadedRefusal(keyPath, ACTS.reopen) };
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
