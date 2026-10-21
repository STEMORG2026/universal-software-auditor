import type { Facts } from '../types.js';
import { MAX_FILE_BYTES, MAX_FILES, type Project } from '../util/project.js';
import { buildSuppressionIndex, describeSuppression, unusedSuppressions } from './suppression.js';
import { describeReview, reviewOverdueDays, type ReviewIndex } from './review.js';
import { loadFoundationFacts, loadFoundationStage } from '../foundation/loader.js';

/**
 * Warnings that keep an audit honest about what it could not see.
 *
 * A warning is not a finding: it moves no score. It exists because a PASS
 * computed over a truncated index, a single-commit history, or an ignored
 * intent file is a weaker claim than it looks, and the report must say so.
 */
/**
 * A waiver that matched nothing is dead weight — usually a rule that no longer
 * fires there, a renamed file, or a passing rule. Report it so suppressions
 * decay instead of accumulating (ADR-0022, the ESLint model).
 */
export function appendUnusedSuppressionWarnings(
  suppressions: ReturnType<typeof buildSuppressionIndex>,
  warnings: string[],
): void {
  for (const s of unusedSuppressions(suppressions)) {
    warnings.push(
      `suppression for ${describeSuppression(s)} matched no finding — remove it or fix the target`,
    );
  }
}

/**
 * Rank for the declared-vs-detected check (ADR-0041). Legacy is unranked:
 * a retiring system plays a different game and gets no aspiration warning.
 */
export const STAGE_RANK: Record<string, number> = { prototype: 0, mvp: 1, beta: 2, production: 3 };

/**
 * ADR-0041: declared stage above detected maturity is aspiration beyond
 * evidence — one loud line, zero moved bars. Severity keeps following
 * detected maturity (never the declaration), so claiming `prototype` buys
 * no leniency and claiming `production` buys no strictness.
 */
export function assertStageAspiration(target: string, detected: string, warnings: string[]): void {
  const declared = loadFoundationStage(target);
  if (declared === undefined) return;
  const want = STAGE_RANK[declared];
  const have = STAGE_RANK[detected];
  if (want === undefined || have === undefined || want <= have) return;
  warnings.push(
    `declared stage ${declared} exceeds detected maturity ${detected} — grading follows detected; ` +
      `pass --profile ${declared} to be held to the declared bar explicitly`,
  );
}

/**
 * Declared intent becomes detection facts. The loader throws on a broken
 * file (fail closed); the audit converts that into a warning and proceeds
 * without intent facts — a malformed promise must be loud, but it must not
 * brick the audit it was meant to guide.
 */
export function assertFoundationFacts(target: string, facts: Facts, warnings: string[]): void {
  try {
    for (const flag of loadFoundationFacts(target)) facts.flags.add(flag);
  } catch (err) {
    warnings.push(`foundation intent ignored: ${(err as Error).message}`);
  }
}

/**
 * A review that matched nothing is dead provenance — the finding was fixed, the
 * rule renamed, the file moved. A review whose `until` has passed is a decision
 * nobody has revisited. Both are reported so the ledger decays instead of
 * accumulating (ADR-0023, the ESLint model applied to attention).
 */
export function appendReviewWarnings(reviews: ReviewIndex, warnings: string[]): void {
  const nowMs = Date.now();
  for (const entries of reviews.values()) {
    for (const entry of entries) {
      if (!entry.used) {
        warnings.push(
          `review for ${describeReview(entry.review)} matched no finding — remove it or re-target it`,
        );
        continue;
      }
      const overdue = reviewOverdueDays(entry.review, nowMs);
      if (overdue !== null) {
        warnings.push(
          `review for ${describeReview(entry.review)} was due ${entry.review.until} — ` +
            `overdue by ${overdue} day(s); re-review`,
        );
      }
    }
  }
}

/**
 * Scale honesty: a truncated index or skipped oversize files means PASS
 * verdicts may rest on unseen files. Loud warning, never silent absorption.
 */
export function appendIndexWarnings(project: Project, warnings: string[]): void {
  if (project.truncated) {
    warnings.push(
      `index truncated at ${MAX_FILES} files — the tree is bigger than the audit can see; ` +
        'treat PASS verdicts as partial and split the target (e.g. per-package audits)',
    );
  }
  if (project.skippedLarge > 0) {
    warnings.push(
      `${project.skippedLarge} file(s) skipped for exceeding ${MAX_FILE_BYTES} bytes — ` +
        'content checks could not see them',
    );
  }
  if (project.skippedSymlinks > 0) {
    warnings.push(
      `${project.skippedSymlinks} symlink(s) skipped without traversal — ` +
        'linked source is invisible to every check; materialize it to audit it',
    );
  }
}

/**
 * History-thin targets blind the history-dependent rules (REPO-003 scans
 * `git log`, REL-002 needs tags, maturity signals need commits). The
 * negation in REPO-003 even turns git errors into PASS — true only in the
 * vacuous sense. Say so loudly instead of scoring blind confidence.
 */
export function appendHistoryWarnings(
  git: ReturnType<Project['gitInfo']>,
  warnings: string[],
): void {
  if (!git.isRepo) {
    warnings.push(
      'not a git repository — history and provenance checks cannot verify anything; ' +
        'treat history-dependent findings as vacuous',
    );
    return;
  }
  if (git.commits <= 1) {
    warnings.push(
      'single-commit history (shallow clone?) — maturity signals, tag checks, and ' +
        'history scans are under-verified; prefer a full clone for release-grade audits',
    );
  }
}
