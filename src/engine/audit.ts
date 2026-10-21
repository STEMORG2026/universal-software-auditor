import type { Facts } from '../types.js';
import { Project } from '../util/project.js';
import { detect, loadDetectorFile } from '../detect/index.js';
import { loadRulePacks, applyRuleOverrides } from './loader.js';
import type { EvalContext } from './evaluate.js';
import { attachReviews, buildReviewIndex, resolveActiveReviews } from './review.js';
import { buildSuppressionIndex } from './suppression.js';
import { loadSections } from './sections.js';
import { loadProfiles } from './maturity.js';
import { loadConfig } from '../config.js';
import { score } from './score.js';
import type { AuditOptions, AuditOutcome } from './audit-types.js';
import {
  collectRuleSettings,
  normalizeAuditOptions,
  resolveLimits,
  resolveMaturity,
  resolvePackSets,
  resolveSuppressions,
  selectSections,
} from './audit-config.js';
import { mergeExtraPacks, resolvePackFacts, selectInitialPacks } from './pack-selection.js';
import {
  appendHistoryWarnings,
  appendIndexWarnings,
  appendReviewWarnings,
  appendUnusedSuppressionWarnings,
  assertFoundationFacts,
  assertStageAspiration,
} from './audit-warnings.js';
import { appendDocUniverseFindings, evaluatePacks } from './evaluate-packs.js';
import { buildReport } from './report-build.js';

/**
 * The audit coordinator.
 *
 * This module owns the *order* of an audit and nothing else: resolve options,
 * index the tree, detect facts, choose packs, score, warn about what was not
 * seen, build the report. Each step lives in a sibling module —
 * `audit-config` (validation), `pack-selection` (fixed point), `evaluate-packs`
 * (two-pass scoring), `audit-warnings` (honesty), `report-build` (assembly).
 *
 * The split is not cosmetic: at 840 lines this file was the project's only
 * god file, and these are the seams the pipeline already had.
 */

export type { AuditOptions, AuditOutcome } from './audit-types.js';

export function runAudit(options: AuditOptions): AuditOutcome {
  // The programmatic entry point must be usable with nothing but a target, so
  // every knob the CLI exposes gets a sane default here rather than a crash.
  const config = options.config ?? loadConfig(options.target);
  const opts = normalizeAuditOptions(options, config);
  const warnings: string[] = [];
  const project = new Project(
    opts.target,
    config.ignore ?? [],
    resolveLimits(options, config, warnings),
  );
  const git = project.gitInfo();
  appendHistoryWarnings(git, warnings);
  const detectors = loadDetectorFile(opts.rulesDir);
  const detection = detect(project, detectors, git, config.facts ?? []);

  const { packs, warnings: packWarnings } = loadRulePacks(opts.rulesDir);
  warnings.push(...packWarnings);

  mergeExtraPacks(packs, options.extraPacks);

  const { disabled, overrides } = collectRuleSettings(config, warnings);
  applyRuleOverrides(packs, overrides);

  const suppressions = buildSuppressionIndex(resolveSuppressions(config.suppressions, warnings));
  const reviews = buildReviewIndex(resolveActiveReviews(config.reviews, warnings));
  const { include, exclude } = resolvePackSets(options, config);

  // A pack may assert extra facts simply by applying (e.g. "we are a monorepo").
  const facts: Facts = detection.facts;
  // Declared intent (ADR-0029): `.usa/foundation.yaml` intents[] become
  // `intent:<value>` facts before pack selection, so intent-gated rules
  // (e.g. FND-014 on intent:api) apply exactly where promised. A broken
  // intent file warns loudly and asserts nothing — an audit must never run
  // half an intent, but it must still run.
  assertFoundationFacts(opts.target, facts, warnings);

  const selection = selectInitialPacks(packs, facts, include, exclude);

  // Packs can contribute facts, which can make another pack apply. Resolve to a
  // fixed point (bounded, so a malformed pack cannot hang the audit).
  resolvePackFacts(packs, facts, include, exclude, selection);

  const sections = selectSections(loadSections(opts.rulesDir), config.sections, warnings);
  const profiles = loadProfiles(opts.rulesDir);
  const maturity = resolveMaturity(opts.profile, config.maturity, detection.maturity, warnings);
  const profile = profiles[maturity];
  assertStageAspiration(opts.target, detection.maturity, warnings);

  const ctx: EvalContext = {
    project,
    facts,
    depth: opts.depth,
    allowCommands: opts.allowCommands,
    disabled,
    suppressions,
  };

  const evaluatedAll = evaluatePacks(
    selection.activePacks,
    facts,
    opts.depth,
    include,
    ctx,
    profile,
  );
  // Documentation universe (opt-in): the same computation `usa docs audit`
  // runs standalone, injected as DOCU-* findings so the main report and the
  // docs gate can never disagree (AC-8). Only open findings are appended —
  // the 200+ present artifacts would drown the section in noise.
  if (options.docsUniverse ?? config.docs?.universe ?? false) {
    appendDocUniverseFindings(evaluatedAll, {
      project,
      facts,
      rulesDir: opts.rulesDir,
      profile,
      maturity,
      git,
      warnings,
      usaVersion: opts.usaVersion,
      target: opts.target,
    });
  }
  // A `sections:` restriction narrows both the scored set and the report, so a
  // scoped audit cannot leak findings it promised to exclude.
  const sectionFilter = config.sections ?? [];
  const wanted = new Set(sections.map((s) => s.id));
  const evaluated =
    sectionFilter.length > 0
      ? evaluatedAll.filter((e) => wanted.has(e.finding.section))
      : evaluatedAll;
  // Index warnings go last: content reads happen lazily during rule
  // evaluation, so oversize counts are only complete once scoring is done.
  appendIndexWarnings(project, warnings);
  appendUnusedSuppressionWarnings(suppressions, warnings);
  attachReviews(
    reviews,
    evaluated.map((e) => e.finding),
  );
  appendReviewWarnings(reviews, warnings);
  const card = score(evaluated, sections, profile);
  const report = buildReport(
    opts,
    git,
    detection,
    facts,
    maturity,
    card,
    evaluated,
    selection.packsLoaded,
    selection.packsSkipped,
  );

  return { report, warnings, profile };
}
