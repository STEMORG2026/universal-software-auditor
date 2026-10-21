import type { AuditReport, Depth, Maturity, RulePack, UsaConfig } from '../types.js';
import type { MaturityProfile } from './maturity.js';

/**
 * The public shape of an audit run, in its own module so the audit
 * coordinator and the option/pack/report helpers can all depend on it
 * without importing each other.
 */
export interface AuditOptions {
  target: string;
  rulesDir?: string;
  depth?: Depth;
  profile?: Maturity | 'auto';
  config?: UsaConfig;
  allowCommands?: boolean;
  usaVersion?: string;
  /** Force these pack ids on/off regardless of detection. */
  includePacks?: string[];
  excludePacks?: string[];
  /** Indexing caps for bigger-than-comfortable trees (CLI wins over config). */
  maxFiles?: number;
  maxBytes?: number;
  /**
   * Extra rule packs merged into the loaded set for this run only. This is how
   * the evolution layer injects a *released* capability into a re-audit without
   * mutating the on-disk `rules/` registry — the resolved capability set lives
   * in `capabilitySetId`, not in the filesystem. The CLI never passes this, so
   * `usa audit` behaviour is unchanged.
   */
  extraPacks?: RulePack[];
  /**
   * Include the documentation universe audit (14 categories / 220 artifacts,
   * rules/docs-taxonomy.yaml) in this run: DOCU-* findings join S12. Opt-in
   * (CLI `--docs-universe` or `.usa.yaml` `docs.universe: true`) so existing
   * baselines stay stable; the standalone `usa docs audit` runs the same
   * computation and must agree (AC-8).
   */
  docsUniverse?: boolean;
}

export interface AuditOutcome {
  report: AuditReport;
  warnings: string[];
  profile: MaturityProfile;
}
