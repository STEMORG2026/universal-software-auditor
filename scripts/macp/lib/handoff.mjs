/**
 * The continuation object: two halves that must never be confused.
 *
 * MACHINE-STAMPED — measured at close, never typed: the SHAs, the branch, the
 * tree state, the commit list, the open PRs, and the exit code of every gate.
 *
 * AGENT-AUTHORED — semantic, schema-validated: what was completed, what
 * remains, what was discovered, what should happen next.
 *
 * The split exists because a model will write "all tests pass" whether or not
 * it ran them, and a handoff that records the claim instead of the measurement
 * is worse than no handoff: the next agent trusts it.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeText } from './repo.mjs';

export const OUTCOMES = Object.freeze(['COMPLETED', 'PARTIAL', 'BLOCKED']);

export const REGION_BEGIN = '<!-- macp:handoff:begin -->';
export const REGION_END = '<!-- macp:handoff:end -->';

/**
 * Validate the agent-authored half against the measured half.
 *
 * Returns a list of violations; empty means the close may proceed. The rules
 * are the ones in the owner's instruction, and each exists because the
 * alternative is a handoff that looks complete and is not.
 */
export function validateHandoff(handoff) {
  const problems = [];

  if (!OUTCOMES.includes(handoff.outcome)) {
    problems.push(`outcome must be one of ${OUTCOMES.join(', ')} (got "${handoff.outcome}")`);
  }
  if (!handoff.working_tree_clean) {
    problems.push('the working tree is not clean — commit or revert before closing');
  }

  const gateEntries = Object.entries(handoff.gates ?? {});
  const failed = gateEntries.filter(([, gate]) => gate.exit !== 0).map(([name]) => name);

  // What the repository declared, as opposed to what this run chose to run.
  // Without it a report can name one gate and close COMPLETED, and nothing in
  // the record says a second one existed — the audit's F-04, and the reason a
  // ported runtime could record three gates for a repository that enforces six.
  const required = Array.isArray(handoff.required_gates) ? handoff.required_gates : [];
  const recorded = new Set(gateEntries.map(([name]) => name));
  const notRun = required.filter((name) => !recorded.has(name));

  if (handoff.outcome === 'COMPLETED') {
    if (gateEntries.length === 0) {
      problems.push('COMPLETED requires at least one gate to have been run and recorded');
    }
    if (notRun.length > 0) {
      problems.push(
        `COMPLETED requires every gate this repository declares; ${notRun.join(', ')} ` +
          'was not run. The declared set is recorded at submit so it cannot be narrowed after ' +
          'the work — run them, or close as PARTIAL and name the omission in remaining[].',
      );
    }
    if (failed.length > 0) {
      problems.push(
        `COMPLETED requires every recorded gate green; ${failed.join(', ')} exited non-zero. ` +
          'Close as PARTIAL or BLOCKED, or fix the gate.',
      );
    }
  } else {
    // PARTIAL and BLOCKED are legitimate closes. They are allowed to be red —
    // that is what "blocked" means — but only with the unfinished work named,
    // or the next agent inherits a red tree and no explanation.
    if (!Array.isArray(handoff.remaining) || handoff.remaining.length === 0) {
      problems.push(`${handoff.outcome} requires at least one entry in remaining[]`);
    }
    if (!handoff.next_recommended_task) {
      problems.push(`${handoff.outcome} requires a next_recommended_task`);
    }
    // Only the *failing* gates owe an explanation. A green gate that printed
    // nothing has no tail, and demanding one would make every quiet gate a
    // violation — the rule is about the gate that broke, not the ones that did not.
    if (failed.some((name) => !handoff.gates[name]?.tail)) {
      problems.push('a failing gate was recorded without its output — record the tail');
    }
  }

  if (!Array.isArray(handoff.completed)) problems.push('completed[] must be an array');
  return problems;
}

function bullets(items, empty = '_none_') {
  return items.length === 0 ? empty : items.map((item) => `- ${item}`).join('\n');
}

/** Render the handoff as the block that goes at the top of CONTINUATION.md. */
export function renderHandoff(handoff) {
  const gates = Object.entries(handoff.gates ?? {});
  const gateRows = gates
    .map(([name, gate]) => `| ${name} | ${gate.exit} | ${Math.round(gate.ms / 1000)}s |`)
    .join('\n');
  const required = Array.isArray(handoff.required_gates) ? handoff.required_gates : [];
  const notRun = required.filter((name) => !(name in (handoff.gates ?? {})));

  const lines = [
    REGION_BEGIN,
    `## Handoff — ${handoff.session} (${handoff.outcome})`,
    '',
    `Machine-stamped by \`macp close\` at ${handoff.closed_at}. The table and the gate`,
    'results below were measured; the prose below them was written by the agent and',
    'is a claim, not a measurement.',
    '',
    '| Fact | Value |',
    '| ---- | ----- |',
    `| Session | \`${handoff.session}\` (${handoff.agent} on ${handoff.harness}) |`,
    `| Branch | \`${handoff.branch}\` |`,
    // Present only when the session was scoped by `--plan`. Its absence is
    // information: the objective below was typed by the agent, not read.
    ...(handoff.plan
      ? [
          `| Plan item | \`${handoff.plan.id}\` · ${handoff.plan.status} · \`${handoff.plan.file}\` · sha \`${handoff.plan.sha}\` |`,
        ]
      : []),
    `| Base commit | \`${handoff.base_commit_sha}\` |`,
    `| Code commit | \`${handoff.code_commit_sha}\` |`,
    `| Working tree clean | ${handoff.working_tree_clean ? 'yes' : '**no**'} |`,
    `| Commits | ${handoff.commits.length === 0 ? 'none' : handoff.commits.length} |`,
    `| Open PRs | ${handoff.open_prs.length === 0 ? 'none' : handoff.open_prs.join(', ')} |`,
    '',
    '### Gates (exit code, measured)',
    '',
    gateRows.length > 0
      ? `| Gate | Exit | Time |\n| ---- | ---- | ---- |\n${gateRows}` +
        (required.length > 0
          ? `\n\nDeclared by this repository: **${required.length}** · run: **${gates.length}**` +
            (notRun.length > 0 ? ` · **not run: ${notRun.join(', ')}**` : ' · all run')
          : '')
      : '_none run_',
    '',
    '### Objective',

    `${handoff.objective || '_not stated_'}`,

    '### Files changed',

    `${(handoff.files_changed ?? []).length === 0 ? '_none_' : handoff.files_changed.map((f) => `- \`${f}\``).join('\n')}`,

    '### Completed',
    '',
    bullets(handoff.completed),
    '',
    '### Remaining',
    '',
    bullets(handoff.remaining),
    '',
    '### Discovered, not fixed',
    '',
    bullets(handoff.discovered_bugs),
    '',
    '### Deferred work',
    '',
    bullets(handoff.deferred_work),
    '',
    '### Traps learned',
    '',
    bullets(handoff.traps_learned),
    '',
    '### Next recommended task',
    '',
    handoff.next_recommended_task || '_not stated_',
    '',
    '### Required context for the next session',
    '',
    bullets(handoff.required_context),
    '',
    REGION_END,
  ];
  return lines.join('\n');
}

/**
 * Put the rendered handoff at the top of CONTINUATION.md, under the title.
 *
 * Replacing a marked region rather than appending keeps the file readable
 * across sessions: the handoff is always the first thing under the heading, and
 * an old one is replaced rather than buried.
 */
export function writeHandoffRegion(root, rendered) {
  const target = path.join(root, 'state', 'CONTINUATION.md');
  if (!existsSync(target)) return false;
  const text = readFileSync(target, 'utf8');

  const begin = text.indexOf(REGION_BEGIN);
  if (begin !== -1) {
    const end = text.indexOf(REGION_END, begin);
    if (end !== -1) {
      writeText(target, `${text.slice(0, begin)}${rendered}${text.slice(end + REGION_END.length)}`);
      return true;
    }
  }

  const titleLine = text.match(/^# .*$/m);
  if (!titleLine) return false;
  const at = titleLine.index + titleLine[0].length;
  writeText(target, `${text.slice(0, at)}\n\n${rendered}\n${text.slice(at)}`);
  return true;
}

/** The handoff file `macp close` leaves behind, for machines rather than readers. */
export function handoffPath(root, session) {
  return path.join(root, 'state', 'macp', 'handoff', `${session}.json`);
}
