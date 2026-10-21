import path from 'node:path';
import type { AuditReport, Depth, Facts, Finding, Maturity } from '../types.js';
import type { Project } from '../util/project.js';
import type { detect } from '../detect/index.js';
import { fingerprintRulesDir } from './ruleset.js';
import type { ScoredRule } from './score.js';

/**
 * Assembling the machine-readable report from scored findings.
 *
 * Deterministic by construction: the only non-deterministic field is
 * `generatedAt`, and findings are sorted by a total order (severity, section,
 * rule id) so two runs over the same tree diff cleanly.
 */
export function buildReport(
  opts: {
    target: string;
    depth: Depth;
    profile: Maturity | 'auto';
    rulesDir: string;
    usaVersion: string;
  },
  git: ReturnType<Project['gitInfo']>,
  detection: ReturnType<typeof detect>,
  facts: Facts,
  maturity: Maturity,
  card: AuditReport['score'],
  evaluated: ScoredRule[],
  packsLoaded: string[],
  packsSkipped: string[],
): AuditReport {
  return {
    schema: 'usa-report-v1',
    generatedAt: new Date().toISOString(),
    usaVersion: opts.usaVersion,
    ruleset: fingerprintRulesDir(opts.rulesDir),
    target: {
      path: path.resolve(opts.target),
      name: path.basename(path.resolve(opts.target)) || opts.target,
      commit: git.commit,
      ref: git.ref,
      repoUrl: git.repoUrl,
    },
    detection: {
      maturity,
      maturitySignals: detection.maturitySignals,
      projectTypes: pick(facts, 'project'),
      platforms: pick(facts, 'platform'),
      languages: pick(facts, 'lang'),
      frameworks: pick(facts, 'fw'),
      packageManagers: pick(facts, 'pm'),
      databases: pick(facts, 'db'),
      flags: [...facts.flags].filter((f) => f.startsWith('has:')).sort(),
      metrics: facts.metrics,
    },
    options: {
      depth: opts.depth,
      profile: opts.profile,
      rulesDir: opts.rulesDir,
      packsLoaded,
      packsSkipped,
    },
    score: card,
    findings: evaluated
      .map((e) => e.finding)
      .filter((f) => f.status !== 'NOT_APPLICABLE')
      .sort(bySeverityThenSection),
  };
}

export function pick(facts: Facts, prefix: string): string[] {
  const out: string[] = [];
  for (const f of facts.flags) {
    if (f.startsWith(`${prefix}:`)) out.push(f.slice(prefix.length + 1));
  }
  return out.sort();
}

export const ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, FUTURE: 4 };

export function bySeverityThenSection(a: Finding, b: Finding): number {
  const sa = ORDER[a.severity] ?? 9;
  const sb = ORDER[b.severity] ?? 9;
  if (sa !== sb) return sa - sb;
  if (a.section !== b.section)
    return a.section.localeCompare(b.section, undefined, { numeric: true });
  return a.ruleId.localeCompare(b.ruleId);
}
