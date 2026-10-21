import type { Depth, Facts, Finding, Maturity, Rule, RulePack } from '../types.js';
import {
  applySuppressionToFinding,
  evaluateRule,
  ruleApplies,
  type EvalContext,
} from './evaluate.js';
import { evaluateInvariant, invariantLocations } from './invariants.js';
import { ruleAutomatability } from './automatability.js';
import { dampen, type MaturityProfile } from './maturity.js';
import type { ScoredRule } from './score.js';
import { docFindings, runDocAudit } from './docs-audit.js';
import { loadDocTaxonomy } from './docs-taxonomy.js';
import type { Project } from '../util/project.js';

/**
 * Scoring a pack set into findings.
 *
 * Two passes: file rules first, then invariants over the conclusions those
 * rules reached. Invariants cannot run in the first pass — they have nothing
 * to read until every file rule has reported.
 */
export function evaluatePacks(
  activePacks: RulePack[],
  facts: Facts,
  depth: Depth,
  include: Set<string>,
  ctx: EvalContext,
  profile: MaturityProfile,
): ScoredRule[] {
  const evaluated: ScoredRule[] = [];
  const invariants: RulePack['rules'][number][] = [];
  for (const pack of activePacks) {
    for (const rule of pack.rules) {
      if (!ruleApplies(rule, facts, depth, include.has(pack.id))) continue;
      // Invariants read conclusions, not files: second pass, after every
      // file rule has reported. Collect now, evaluate below.
      if (rule.check.kind === 'invariant') {
        invariants.push(rule);
        continue;
      }
      evaluated.push(scoreFinding(rule, ctx, profile));
    }
  }
  for (const rule of invariants) {
    evaluated.push(scoreInvariant(rule, ctx, profile, evaluated));
  }
  return evaluated;
}

/**
 * Appends the documentation-universe findings to the evaluated set. The
 * findings come from `docFindings` — the exact function the standalone
 * `usa docs audit` report uses — with the main audit's maturity profile for
 * dampening and the already-evaluated rule ids for alias suppression (an
 * absence an existing rule already reports, e.g. DOC-006 vs the getting
 * started artifact, is scored once, not twice).
 */
export function appendDocUniverseFindings(
  evaluated: ScoredRule[],
  ctx: {
    project: Project;
    facts: Facts;
    rulesDir: string;
    profile: MaturityProfile;
    maturity: Maturity;
    git: ReturnType<Project['gitInfo']>;
    warnings: string[];
    usaVersion: string;
    target: string;
  },
): void {
  const { taxonomy, warnings: taxWarnings } = loadDocTaxonomy(ctx.rulesDir);
  ctx.warnings.push(...taxWarnings);
  if (!taxonomy) return; // already warned: universe unavailable, audit continues
  const result = runDocAudit({
    project: ctx.project,
    facts: ctx.facts,
    taxonomy,
    maturity: ctx.maturity,
    usaVersion: ctx.usaVersion,
    target: ctx.target,
    commit: ctx.git.commit,
    gitTags: ctx.project.gitTags(),
  });
  const knownRules = new Set(evaluated.map((e) => e.finding.ruleId));
  for (const f of docFindings(result, {
    suppressAliasedRules: knownRules,
    dampen: (base) => dampen(base, 'documentation', ctx.profile),
  })) {
    evaluated.push({ rule: syntheticDocRule(f), finding: f });
  }
}

/** DOCU findings have no YAML rule; the minimal Rule shape keeps scoring intact. */
export function syntheticDocRule(f: Finding): Rule {
  return {
    id: f.ruleId,
    title: f.title,
    section: f.section,
    sectionTitle: f.sectionTitle,
    severity: f.baseSeverity,
    ruleClass: f.ruleClass,
    check: { kind: 'info' },
    tags: f.tags,
  };
}

export function scoreInvariant(
  rule: RulePack['rules'][number],
  ctx: EvalContext,
  profile: MaturityProfile,
  evaluated: ScoredRule[],
): ScoredRule {
  const check = rule.check;
  if (check.kind !== 'invariant') {
    throw new Error(`scoreInvariant called on non-invariant rule ${rule.id}`);
  }
  const byId = new Map(evaluated.map((e) => [e.finding.ruleId, e.finding.status]));
  const findings = evaluated.map((e) => e.finding);
  const outcome = evaluateInvariant(check.when, check.assert, byId);
  const base = {
    ruleId: rule.id,
    title: rule.title,
    section: rule.section,
    sectionTitle: rule.sectionTitle ?? rule.section,
    baseSeverity: rule.severity,
    ruleClass: rule.ruleClass,
    why: rule.why,
    evidenceHint: rule.evidence,
    remediation: rule.remediation,
    references: rule.references,
    automatability: ruleAutomatability(rule),
    tags: rule.tags,
  };
  if (!outcome.applicable) {
    return {
      rule,
      finding: {
        ...base,
        status: 'NOT_APPLICABLE',
        severity: rule.severity,
        dampened: false,
        message: `Invariant inapplicable — ${outcome.detail}.`,
        locations: [],
      },
    };
  }
  const finding: Finding = {
    ...base,
    status: outcome.passed ? 'PASS' : 'FAIL',
    severity: rule.severity,
    dampened: false,
    message: outcome.passed
      ? `Combination holds and ${check.assert.rule} agrees — ${outcome.detail}.`
      : `Dangerous combination: ${outcome.detail}.`,
    locations: outcome.passed ? [] : invariantLocations(check.when, findings),
  };
  if (!outcome.passed) {
    applySuppressionToFinding(ctx.suppressions, rule.id, finding);
    if (finding.status !== 'PASS') {
      const { severity, dampened } = dampen(rule.severity, rule.ruleClass, profile);
      finding.severity = severity;
      finding.dampened = dampened;
    }
  }
  return { rule, finding };
}

export function scoreFinding(
  rule: RulePack['rules'][number],
  ctx: EvalContext,
  profile: MaturityProfile,
): ScoredRule {
  const finding = evaluateRule(rule, ctx);
  if (finding.status === 'PASS' || finding.status === 'NOT_APPLICABLE') {
    return { rule, finding };
  }
  const { severity, dampened } = dampen(rule.severity, rule.ruleClass, profile);
  finding.severity = severity;
  finding.dampened = dampened;
  return { rule, finding };
}
