/**
 * Tool output → Evidence.
 *
 * Only adapters import this. The functions are total: unknown severity words
 * become `LOW` (never dropped), missing locations become `null` (never
 * invented), and an unparseable payload yields `UNKNOWN` evidence rather than a
 * thrown error — a scanner that breaks must blind the audit, not fail it.
 */
import type { Evidence, ScannerSeverity } from './types.js';

const KNOWN: readonly string[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'UNKNOWN'];

/** The tool's severity word, quoted. Unknown words degrade to LOW. */
export function severity(word: unknown): ScannerSeverity {
  const w = String(word ?? '').toUpperCase();
  return KNOWN.includes(w) ? (w as ScannerSeverity) : 'LOW';
}

/** Confidence for deterministic facts; a param, not a guess, everywhere else. */
export const DETERMINISTIC_CONFIDENCE = 1.0;

export interface UnknownOptions {
  adapterId: string;
  adapterVersion: string;
  reason: string;
  /** Where the failure was detected. */
  location?: Evidence['location'];
}

/** An evidence row that says "this tool could not tell us". */
export function unknownEvidence(o: UnknownOptions): Evidence {
  return {
    id: `UNKNOWN-${o.adapterId}-${o.reason}`.replace(/\s+/g, '-').slice(0, 40),
    source: { tool: o.adapterId, version: o.adapterVersion, kind: 'check', identifier: 'UNKNOWN' },
    provenance: {
      executionId: 'unknown',
      command: [],
      config: {},
      repositoryRevision: 'unknown',
      timestamp: '',
      executable: '',
      timeoutMs: 0,
      elapsedMs: 0,
    },
    claim: o.reason,
    severity: 'INFO',
    severitySource: 'adapter-default',
    confidence: DETERMINISTIC_CONFIDENCE,
    status: 'UNKNOWN',
    location: o.location ?? null,
    rawReference: {},
  };
}

/** Parse a payload once; a malformed one is UNKNOWN, never an exception. */
export function tryParseJson(
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Read a nested key defensively: an absent path yields `undefined`, never
 * throws. Array indices are accepted as numbers so callers can write
 * `dig(x, ['locations', 0])` without stringifying.
 */
export function dig(obj: unknown, path: (string | number)[]): unknown {
  let node: unknown = obj;
  for (const key of path) {
    const k = String(key);
    if (typeof node !== 'object' || node === null || !(k in (node as object))) return undefined;
    node = (node as Record<string, unknown>)[k];
  }
  return node;
}

/** A line number, only when the source actually gave one. */
export function lineNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}
