/**
 * SARIF → Evidence.
 *
 * SARIF is the interchange format for three of our four Tier-1 tools, so the
 * parser is shared and lives here rather than inside any one adapter. It is
 * deliberately conservative: only the fields the spec defines are read, and a
 * missing region becomes `null` (no location) rather than a zero.
 */
import type { Evidence, ScannerSeverity } from './types.js';
import { buildEvidence } from './identity.js';
import { dig, tryParseJson } from './normalize.js';

/** SARIF level → our severity scale. A level is not a severity; the mapping is a policy. */
export function sarifLevelToSeverity(level: unknown): ScannerSeverity {
  switch (String(level ?? '').toLowerCase()) {
    case 'error':
      return 'HIGH';
    case 'warning':
      return 'MEDIUM';
    case 'note':
      return 'LOW';
    default:
      return 'INFO';
  }
}

export interface SarifEvidenceOptions {
  tool: string;
  kind: string;
  adapterVersion: string;
  /** Confidence for this tool's SARIF results. */
  confidence?: number;
}

/** Parse a SARIF log into evidence rows, one per result (plus one per run failure). */
export function evidenceFromSarif(raw: string, options: SarifEvidenceOptions): Evidence[] {
  const parsed = tryParseJson(raw);
  if (!parsed.ok)
    return [unknown(options.tool, options.adapterVersion, `not valid JSON: ${parsed.error}`)];
  const runs = dig(parsed.value, ['runs']);
  if (!Array.isArray(runs)) {
    return [unknown(options.tool, options.adapterVersion, 'SARIF log had no runs array')];
  }
  return runs.flatMap((run, runIndex) => runEvidence(run, runIndex, options));
}

/** One SARIF run → evidence rows. A run with no results contributes nothing. */
function runEvidence(run: unknown, runIndex: number, options: SarifEvidenceOptions): Evidence[] {
  const driver = dig(run, ['tool', 'driver']);
  const toolVersion = String(dig(driver, ['version']) ?? options.adapterVersion);
  const rules = ruleIndex(dig(driver, ['rules']));
  const results = dig(run, ['results']);
  if (!Array.isArray(results)) return [];
  return results.map((result, index) =>
    resultToEvidence(result, { index, runIndex, toolVersion, rules, options }),
  );
}

type RuleIndex = Map<string, { text?: string }>;

function ruleIndex(rules: unknown): RuleIndex {
  const index: RuleIndex = new Map();
  if (!Array.isArray(rules)) return index;
  for (const rule of rules) {
    const id = String(dig(rule, ['id']) ?? '');
    if (id) index.set(id, { text: dig(rule, ['name']) as string | undefined });
  }
  return index;
}

function resultToEvidence(
  result: unknown,
  run: {
    index: number;
    runIndex: number;
    toolVersion: string;
    rules: RuleIndex;
    options: SarifEvidenceOptions;
  },
): Evidence {
  const { index, runIndex, toolVersion, rules, options } = run;
  const ruleId = String(dig(result, ['ruleId']) ?? 'unknown-rule');
  const message = firstMessage(result);
  return buildEvidence({
    source: {
      tool: options.tool,
      kind: options.kind,
      version: toolVersion,
      identifier: ruleId,
    },
    provenance: placeholder(),
    claim: `${rules.get(ruleId)?.text ?? ruleId}: ${message}`,
    severity: sarifLevelToSeverity(dig(result, ['level'])),
    confidence: options.confidence ?? 1.0,
    status: 'FAIL',
    location: locationOf(dig(result, ['locations', 0])),
    rawReference: {
      jsonPath: `runs[${runIndex}].results[${index}]`,
      excerpt: message.slice(0, 160),
    },
  });
}

function firstMessage(result: unknown): string {
  const direct = dig(result, ['message', 'text']);
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const parts = dig(result, ['message', 'arguments']);
  if (Array.isArray(parts))
    return parts
      .map((p) => String(p))
      .join(' ')
      .slice(0, 160);
  return 'no message';
}

function locationOf(loc: unknown): Evidence['location'] {
  const file = dig(loc, ['physicalLocation', 'artifactLocation', 'uri']);
  if (typeof file !== 'string' || file.length === 0) return null;
  const line = Number(dig(loc, ['physicalLocation', 'region', 'startLine']));
  const column = Number(dig(loc, ['physicalLocation', 'region', 'startColumn']));
  return {
    file,
    line: Number.isFinite(line) && line > 0 ? line : undefined,
    column: Number.isFinite(column) && column > 0 ? column : undefined,
  };
}

function unknown(tool: string, version: string, reason: string): Evidence {
  return {
    id: `UNKNOWN-${tool}-${reason}`.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 48),
    source: { tool, version, kind: 'check', identifier: 'UNKNOWN' },
    provenance: placeholder(),
    claim: reason,
    severity: 'INFO',
    severitySource: 'adapter-default',
    confidence: 1.0,
    status: 'UNKNOWN',
    location: null,
    rawReference: {},
  };
}

function placeholder(): Evidence['provenance'] {
  return {
    executionId: '',
    command: [],
    config: {},
    repositoryRevision: '',
    timestamp: '',
    executable: '',
    timeoutMs: 0,
    elapsedMs: 0,
  };
}
