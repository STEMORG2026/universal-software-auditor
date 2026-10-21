import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Depth, Finding, Maturity, Suppression, UsaConfig } from '../types.js';
import type { SectionDef } from './sections.js';
import { SEVERITY_LADDER } from './loader.js';
import type { AuditOptions } from './audit-types.js';

/**
 * Option, config, and policy resolution for an audit run.
 *
 * Everything here turns user input (CLI flags, `.usa.yaml`) into validated
 * values, and every invalid value warns and falls back instead of throwing:
 * a typo in a config file must not brick the audit it configures.
 */
export const DEFAULT_RULES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'rules',
);

/** Version of this build, read from package.json so it never drifts. */
export const DEFAULT_VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'),
        'utf8',
      ),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

export function normalizeAuditOptions(options: AuditOptions, config: UsaConfig) {
  return {
    rulesDir: options.rulesDir ?? DEFAULT_RULES_DIR,
    depth: options.depth ?? ('standard' as Depth),
    profile: options.profile ?? ('auto' as Maturity | 'auto'),
    allowCommands: options.allowCommands ?? false,
    usaVersion: options.usaVersion ?? DEFAULT_VERSION,
    target: options.target,
    config,
  };
}

/**
 * Expired (or undated) waivers fail closed: an `until` date in the past — or
 * one that cannot be parsed — excludes the suppression and raises a warning,
 * so an audit never silently honours dead risk acceptances.
 */
export function resolveSuppressions(
  suppressions: Suppression[] | undefined,
  warnings: string[],
): Suppression[] {
  const active: Suppression[] = [];
  for (const s of suppressions ?? []) {
    if (!s.rule) continue;
    if (s.until && isSuppressionExpired(s.rule, s.until, warnings)) continue;
    active.push(s);
  }
  return active;
}

export function isSuppressionExpired(rule: string, until: string, warnings: string[]): boolean {
  const t = Date.parse(until);
  if (Number.isNaN(t)) {
    warnings.push(
      `suppression for ${rule} has an unparseable "until" date ("${until}") — waiver ignored`,
    );
    return true;
  }
  if (t < Date.now()) {
    warnings.push(`suppression for ${rule} expired on ${until} — treating as an active finding`);
    return true;
  }
  return false;
}

export const MATURITIES: Maturity[] = ['prototype', 'mvp', 'beta', 'production', 'legacy'];

/**
 * CLI --profile wins; otherwise a valid config `maturity` pins the bar;
 * otherwise auto-detection stands. Invalid config values warn and fall back.
 */
export function resolveMaturity(
  cliProfile: Maturity | 'auto',
  configMaturity: Maturity | undefined,
  detected: Maturity,
  warnings: string[],
): Maturity {
  if (cliProfile !== 'auto') return cliProfile;
  if (configMaturity === undefined) return detected;
  if ((MATURITIES as readonly string[]).includes(configMaturity)) return configMaturity;
  warnings.push(
    `.usa.yaml: invalid maturity "${String(configMaturity)}" — using auto-detected ${detected}`,
  );
  return detected;
}

/** Restrict scoring and reporting to the configured sections, if any. */

export function selectSections(
  all: SectionDef[],
  wanted: string[] | undefined,
  warnings: string[],
): SectionDef[] {
  if (!wanted || wanted.length === 0) return all;
  const known = new Set(all.map((s) => s.id));
  for (const id of wanted) {
    if (!known.has(id)) warnings.push(`.usa.yaml: unknown section "${id}" in sections — ignored`);
  }
  return all.filter((s) => wanted.includes(s.id));
}

/**
 * CLI flags win over config file; both are validated with warnings.
 * Invalid values fall back to engine defaults (never zero, never infinite).
 */
export function resolveLimits(
  options: AuditOptions,
  config: UsaConfig,
  warnings: string[],
): { maxFiles?: number; maxBytes?: number } {
  return {
    maxFiles: validatedLimit(
      options.maxFiles ?? config.limits?.max_files,
      'limits.max_files / --max-files',
      warnings,
    ),
    maxBytes: validatedLimit(
      options.maxBytes ?? config.limits?.max_bytes,
      'limits.max_bytes / --max-bytes',
      warnings,
    ),
  };
}

export function validatedLimit(
  v: number | undefined,
  name: string,
  warnings: string[],
): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
  warnings.push(`invalid ${name} "${String(v)}" (must be a positive number) — using defaults`);
  return undefined;
}

export function resolvePackSets(
  options: AuditOptions,
  config: UsaConfig,
): { include: Set<string>; exclude: Set<string> } {
  return {
    include: new Set(options.includePacks ?? config.include ?? []),
    exclude: new Set(options.excludePacks ?? config.exclude ?? []),
  };
}

export type RuleOverride = { severity?: Finding['severity']; weight?: number };

export function collectRuleSettings(
  config: UsaConfig,
  warnings: string[],
): {
  disabled: Set<string>;
  overrides: Record<string, RuleOverride>;
} {
  const disabled = new Set<string>();
  const overrides: Record<string, RuleOverride> = {};
  for (const [id, o] of Object.entries(config.rules ?? {})) {
    if (o.disabled) disabled.add(id);
    const severity = validateOverrideSeverity(id, o.severity, warnings);
    const weight = validateOverrideWeight(id, o.weight, warnings);
    if (severity !== undefined || weight !== undefined) {
      overrides[id] = { severity, weight };
    }
  }
  return { disabled, overrides };
}

/**
 * Config overrides flow straight into scoring arithmetic — an invalid severity
 * yields NaN totals and a negative weight yields scores outside 0–100.
 * Reject loudly rather than corrupt the report.
 */
export function validateOverrideSeverity(
  id: string,
  v: unknown,
  warnings: string[],
): RuleOverride['severity'] {
  if (v === undefined) return undefined;
  if ((SEVERITY_LADDER as readonly string[]).includes(String(v))) {
    return String(v) as RuleOverride['severity'];
  }
  warnings.push(`rules.${id}: invalid severity "${String(v)}" — override ignored`);
  return undefined;
}

export function validateOverrideWeight(
  id: string,
  v: unknown,
  warnings: string[],
): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  warnings.push(
    `rules.${id}: invalid weight "${String(v)}" (must be a finite number ≥ 0) — override ignored`,
  );
  return undefined;
}
