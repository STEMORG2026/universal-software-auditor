/**
 * Scanner subsystem types.
 *
 * These are the only types the adapter layer owns, and nothing in `src/engine/`
 * imports them: a rule consumes scanner *artifacts* through the existing
 * `oracle` check (ADR-0011) instead of importing evidence objects. That keeps
 * the dependency direction one-way and keeps the rule engine free of any
 * scanner-specific schema.
 */

/** The tool's own severity word, quoted verbatim and never re-mapped. */
export type ScannerSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/**
 * A scanner's verdict about its own observation — NOT a rule status.
 * `UNAVAILABLE` exists so that "no evidence found" can never be read as
 * "the feature does not exist" (Phase 5's hard requirement).
 */
export type ScannerVerdict =
  | 'PASS' // the check ran and the asserted condition held
  | 'FAIL' // the check ran and it was violated
  | 'PARTIAL' // some instances hold, others do not
  | 'UNKNOWN' // the check ran and could not conclude (malformed output)
  | 'NOT_APPLICABLE' // the tool cannot apply to this target
  | 'UNAVAILABLE'; // the tool is absent / timed out / had no input

export type ScannerStatus = 'ok' | 'unavailable' | 'timeout' | 'error' | 'skipped';

/**
 * One fact, observed by a tool, with enough provenance to re-find it.
 *
 * The `id` is a content hash over source + identifier + location + claim, so the
 * same observation deduplicates across tools and across runs.
 */
export interface Evidence {
  /** Stable content hash (EVT-<hex>). */
  id: string;
  source: EvidenceSource;
  provenance: EvidenceProvenance;
  claim: string;
  severity: ScannerSeverity;
  severitySource: 'tool-native' | 'adapter-default';
  confidence: number;
  status: ScannerVerdict;
  /** Where to look. `null` means the tool does not locate — never "everywhere". */
  location: EvidenceLocation | null;
  /** Pointer back into the raw tool output, for re-reading. */
  rawReference: RawReference;
}

export interface EvidenceSource {
  /** Adapter id, e.g. `trivy`. */
  tool: string;
  /** Tool version, as reported by `tool --version`. */
  version: string;
  /** Tool-native category (e.g. `vulnerability`, `secret`, `dependency-edge`). */
  kind: string;
  /** Tool-native identifier, preserved verbatim (CVE id, rule id, …). */
  identifier: string;
}

export interface EvidenceProvenance {
  executionId: string;
  /** argv actually executed, for a re-run. */
  command: string[];
  /** Adapter config in effect, including rule-pack versions. */
  config: Record<string, unknown>;
  /** The commit the target pointed at, or `unversioned`. */
  repositoryRevision: string;
  timestamp: string;
  executable: string;
  /** Command timeout in milliseconds. */
  timeoutMs: number;
  /** Seconds the tool ran. */
  elapsedMs: number;
}

export interface EvidenceLocation {
  file: string;
  line?: number;
  column?: number;
}

export interface RawReference {
  /** Byte offset into the artifact the claim came from. */
  artifactOffset?: number;
  jsonPath?: string;
  excerpt?: string;
}

/** A finding produced directly from scanner evidence (path 2). */
export interface ScannerFinding {
  id: string;
  ruleId: string;
  title: string;
  claim: string;
  severity: ScannerSeverity;
  confidence: number;
  status: ScannerVerdict;
  evidenceIds: string[];
  remediation: string;
  locations: EvidenceLocation[];
}

/** One adapter's record in the run manifest — coverage as a first-class fact. */
export interface AdapterRun {
  id: string;
  available: boolean;
  version: string;
  command: string[];
  status: ScannerStatus;
  /** Why an adapter did not produce evidence. Mandatory unless ok. */
  reason?: string;
  evidenceCount: number;
  elapsedMs: number;
  needsNetwork: boolean;
}

export interface RunManifest {
  executionId: string;
  target: string;
  repositoryRevision: string;
  timestamp: string;
  adapters: AdapterRun[];
  environment: {
    sandbox: string;
    network: 'denied' | 'allowed';
    outputCapBytes: number;
  };
}

/** Everything an adapter needs to describe how it should run. */
export interface ScanTarget {
  /** Absolute path to the audited project. */
  path: string;
  /** Scratch copy working directory; adapters run here, never in `path`. */
  workdir: string;
  revision: string;
  executionId: string;
}

export interface ScannerCommand {
  argv: string[];
  network?: boolean;
  /** Extra wall-time for slow tools (database builds). */
  timeoutMs?: number;
}

export interface ScannerConfig {
  [key: string]: unknown;
}

export interface AdapterProbe {
  available: boolean;
  version: string;
  /** Why it is unavailable, when it is. */
  reason?: string;
  executable?: string;
}

/**
 * The contract every scanner lives behind.
 *
 * `buildCommand` and `parse` are pure functions of their inputs — that is what
 * makes a scanner testable without being installed.
 */
export interface ScannerAdapter {
  readonly id: string;
  readonly name: string;
  /** True when a run may need network access (declared in the manifest). */
  readonly needsNetwork?: boolean;
  /**
   * The `.usa/scanners.yaml` key that removes this adapter's network need, e.g.
   * `scanners.semgrep.rules`. Named in the refusal message, because "needs
   * network" is only actionable if the reader knows what to change.
   */
  readonly networkConfigKey?: string;
  defaultConfig(): ScannerConfig;
  probe(): AdapterProbe;
  buildCommand(target: ScanTarget, config: ScannerConfig): ScannerCommand;
  parse(raw: string, context: ParseContext): Evidence[];
  findings?(evidence: Evidence[]): ScannerFinding[];
}

export interface ParseContext {
  adapterId: string;
  adapterVersion: string;
  target: ScanTarget;
  config: ScannerConfig;
}

export interface ScanOptions {
  target: string;
  /** Adapter ids to run; default = all enabled in config. */
  adapters?: string[];
  config?: Record<string, ScannerConfig>;
  /** Refuse to run anything that needs a build step (default true). */
  allowBuildCommands?: boolean;
  network?: boolean;
  timeoutMs?: number;
  now?: () => Date;
}

export interface ScanResult {
  manifest: RunManifest;
  evidence: Evidence[];
  findings: ScannerFinding[];
}
