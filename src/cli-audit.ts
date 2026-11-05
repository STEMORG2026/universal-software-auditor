import fs from 'node:fs';
import path from 'node:path';
import type { AuditReport, Depth, Maturity } from './types.js';
import type { MaturityProfile } from './engine/maturity.js';
import { runAudit } from './engine/audit.js';
import { loadConfig } from './config.js';
import { renderMarkdown, parseTrailer } from './report/markdown.js';
import { renderJson } from './report/json.js';
import { renderSarif } from './report/sarif.js';
import { renderNarrative } from './report/narrative.js';
import { renderHtml } from './report/html.js';
import { evaluateGate, evaluateNewCodeGate, parseBaselineTrailer } from './engine/gate.js';
import {
  VERSION,
  DEFAULT_RULES_DIR,
  DEPTHS,
  MATURITIES,
  SEVERITY_ORDER,
  bool,
  dryRunWrites,
  list,
  str,
  type Args,
} from './cli-args.js';
import { writeTextFile } from './util/files.js';

/** The `audit` command driver: options, gating, and report writing. */
/* ------------------------------------------------------------------ audit -- */

type OutputFormat = 'md' | 'json' | 'sarif' | 'narrative' | 'html';

const FORMATS: OutputFormat[] = ['md', 'json', 'sarif', 'narrative', 'html'];

interface AuditCliOptions {
  target: string;
  rulesDir: string;
  depth: Depth;
  profileArg: string;
  out: string;
  format: OutputFormat;
  failOn: string;
  baseline?: string;
  quiet: boolean;
  maxFiles?: number;
  maxBytes?: number;
}

/** Resolves the report format from an explicit flag, else the --out suffix. */
function resolveFormat(flag: string | undefined, out: string): OutputFormat {
  if (flag) return flag.toLowerCase() as OutputFormat;
  const ext = path.extname(out).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.sarif') return 'sarif';
  if (ext === '.html' || ext === '.htm') return 'html';
  return 'md';
}

function parseCountFlag(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** CLI flag wins; otherwise `.usa.yaml` `docs.universe: true` stands. */
function resolveDocsUniverse(
  args: Args,
  config: { docs?: { universe?: boolean } },
): boolean | undefined {
  const flag = bool(args, 'docs-universe');
  return flag || config.docs?.universe || undefined;
}

function readAuditOptions(args: Args): AuditCliOptions {
  const out = str(args, 'out', 'AUDIT.md') ?? 'AUDIT.md';
  return {
    target: (args._[1] as string | undefined) ?? '.',
    rulesDir: path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR),
    depth: (str(args, 'depth', 'standard') as Depth) ?? 'standard',
    profileArg: str(args, 'profile', 'auto') ?? 'auto',
    out,
    format: resolveFormat(str(args, 'format'), out),
    failOn: (str(args, 'fail-on', 'none') ?? 'none').toLowerCase(),
    baseline: str(args, 'baseline'),
    quiet: bool(args, 'quiet'),
    maxFiles: parseCountFlag(str(args, 'max-files')),
    maxBytes: parseCountFlag(str(args, 'max-bytes')),
  };
}

function validateAuditOptions(o: AuditCliOptions): string | null {
  if (!DEPTHS.includes(o.depth)) return `--depth must be one of ${DEPTHS.join('|')}`;
  if (o.profileArg !== 'auto' && !MATURITIES.includes(o.profileArg as Maturity)) {
    return `--profile must be auto or one of ${MATURITIES.join('|')}`;
  }
  if (!FORMATS.includes(o.format)) return `--format must be one of ${FORMATS.join('|')}`;
  if (o.maxFiles !== undefined && !(o.maxFiles > 0)) return '--max-files must be a positive number';
  if (o.maxBytes !== undefined && !(o.maxBytes > 0)) return '--max-bytes must be a positive number';
  return null;
}

export function cmdAudit(args: Args): number {
  const o = readAuditOptions(args);
  const invalid = validateAuditOptions(o);
  if (invalid) {
    console.error(invalid);
    return 2;
  }

  if (!fs.existsSync(o.target)) {
    console.error(`Target path does not exist: ${o.target}`);
    return 2;
  }

  // CLI-003: preview the write before the (expensive) audit runs.
  if (!dryRunWrites(args, [o.out])) return 0;

  let config;
  try {
    config = loadConfig(o.target, str(args, 'config'));
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  if (config.facts) config.facts = [...config.facts, ...list(args, 'fact')];

  const { report, warnings, profile } = runAudit({
    target: o.target,
    rulesDir: o.rulesDir,
    depth: o.depth,
    profile: o.profileArg as Maturity | 'auto',
    config,
    allowCommands: bool(args, 'allow-commands'),
    usaVersion: VERSION,
    includePacks: list(args, 'include'),
    excludePacks: list(args, 'exclude'),
    maxFiles: o.maxFiles,
    maxBytes: o.maxBytes,
    docsUniverse: resolveDocsUniverse(args, config),
  });

  for (const w of warnings) console.error(`warning: ${w}`);

  const rendered = renderReport(report, profile, o.format);
  try {
    writeTextFile(o.out, rendered);
  } catch (err) {
    // CLI-004: an unwritable --out is a usage error (exit 2), not a crash.
    console.error((err as Error).message);
    return 2;
  }

  if (!o.quiet) {
    console.log(summaryLine(report));
    console.log(`  report → ${o.out}`);
  }

  // Without --baseline the absolute gate below is byte-identical to before:
  // same function, same arguments, same exit codes.
  if (!o.baseline) return evaluateGate(report, o.failOn, o.quiet);
  return runBaselineGate(report, o.baseline, o.failOn, o.quiet, args);
}

/**
 * New-code gate: fail only on findings this change introduced or regressed,
 * compared against a previous report's trailer. Every baseline failure mode
 * exits 2 loudly — a gate that cannot read its baseline must never pass.
 */
function runBaselineGate(
  report: AuditReport,
  baselinePath: string,
  failOn: string,
  quiet: boolean,
  args: Args,
): number {
  let text: string;
  try {
    text = fs.readFileSync(baselinePath, 'utf8');
  } catch {
    console.error(`--baseline file not found or unreadable: ${baselinePath}`);
    return 2;
  }
  // Tolerate a raw YAML trailer file, mirroring `usa diff`.
  const trailerYaml = parseTrailer(text) ?? text;
  if (!trailerYaml.trim()) {
    console.error(`--baseline has no report trailer and no YAML content: ${baselinePath}`);
    return 2;
  }
  try {
    const baseline = parseBaselineTrailer(trailerYaml);
    // An explicit --fail-on (even none) wins; otherwise the new-code gate
    // defaults to HIGH so legacy MEDIUM/LOW debt never blocks adoption.
    const threshold =
      failOn === 'none' && args['baseline'] !== undefined && args['fail-on'] === undefined
        ? 'high'
        : failOn;
    return evaluateNewCodeGate(report, baseline, threshold, quiet);
  } catch (err) {
    console.error(`--baseline is malformed (${baselinePath}): ${(err as Error).message}`);
    return 2;
  }
}

function renderReport(report: AuditReport, profile: MaturityProfile, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return renderJson(report);
    case 'sarif':
      return renderSarif(report);
    case 'narrative':
      return renderNarrative(report, profile);
    case 'html':
      return renderHtml(report, profile);
    default:
      return renderMarkdown(report, profile);
  }
}

function summaryLine(report: AuditReport): string {
  const s = report.score.severityCounts;
  const parts = SEVERITY_ORDER.filter((k) => s[k] > 0)
    .map((k) => `${k.toLowerCase()} ${s[k]}`)
    .join(' · ');
  return (
    `usa ${report.score.overall === null ? 'insufficient evidence' : `${report.score.overall}/100`} ` +
    `(${report.detection.maturity}) — ` +
    `${report.score.counts.PASS} passed, ` +
    (parts ? `open: ${parts}` : 'no open findings') +
    `, ${report.score.counts.UNKNOWN} to review` +
    ` (${report.score.automationCoverage}% verified automatically)`
  );
}
