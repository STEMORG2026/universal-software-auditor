/**
 * Intended vs observed.
 *
 * The join key is the CWE id: a threat declares `cwes: ["CWE-79"]`, and scanner
 * evidence that names the same CWE is the observation. That is deterministic and
 * auditable — no similarity scoring, no LLM.
 *
 * What it deliberately does NOT do: treat "no evidence" as "mitigated". A threat
 * with no matching observation is `UNKNOWN` and says so, because the scanners
 * that ran may simply not cover it.
 */
import { normaliseCwe } from './otm.js';
import type { IntentModel, IntentReport, ThreatMatch } from './types.js';

/**
 * The shape this module needs from evidence. Structural, not imported, so the
 * intent layer does not depend on the scanner subsystem — the JSON that
 * `usa scan --json` emits satisfies it as-is.
 */
export interface EvidenceLike {
  id: string;
  claim: string;
  source?: { tool?: string; identifier?: string };
  /** Structured CWEs from the tool itself — preferred over text scanning. */
  cwes?: string[];
}

/** Every CWE token in a piece of evidence, with where it was found. */
export function cwesOf(evidence: EvidenceLike): { cwe: string; field: string }[] {
  // A tool that stated its CWE is authoritative; only fall back to scanning the
  // text when it did not, and never invent a relationship from a substring.
  if (Array.isArray(evidence.cwes) && evidence.cwes.length > 0) {
    return evidence.cwes.map((cwe) => ({ cwe: normaliseCwe(cwe), field: 'cwes' }));
  }
  const found: { cwe: string; field: string }[] = [];
  const scan = (text: string | undefined, field: string): void => {
    if (!text) return;
    for (const match of text.matchAll(/\bCWE[-_ ]?(\d{1,5})\b/gi)) {
      found.push({ cwe: `CWE-${Number(match[1])}`, field });
    }
  };
  scan(evidence.source?.identifier, 'source.identifier');
  scan(evidence.claim, 'claim');
  return found;
}

export function matchThreats(model: IntentModel, evidence: EvidenceLike[]): IntentReport {
  const byCwe = indexEvidence(evidence);
  const matches: ThreatMatch[] = model.threats.map((threat) => {
    const hits = new Set<string>();
    const seenCwes: string[] = [];
    for (const cwe of threat.cwes) {
      const ids = byCwe.get(cwe);
      if (!ids) continue;
      seenCwes.push(cwe);
      for (const id of ids) hits.add(id);
    }
    if (threat.cwes.length === 0) {
      return {
        threat,
        verdict: 'UNKNOWN',
        evidenceIds: [],
        reason: 'the threat declares no CWE, so no scanner observation can be joined to it',
      };
    }
    if (hits.size === 0) {
      return {
        threat,
        verdict: 'NOT_OBSERVED',
        evidenceIds: [],
        reason: `no evidence mentions ${threat.cwes.join(', ')} — this does not prove the threat is mitigated`,
      };
    }
    return {
      threat,
      verdict: 'OBSERVED',
      evidenceIds: [...hits].sort(),
      reason: `evidence cites ${seenCwes.join(', ')}`,
    };
  });

  const declared = new Set(model.threats.flatMap((t) => t.cwes));
  const unmodeled = [...byCwe.entries()]
    .filter(([cwe]) => !declared.has(cwe))
    .map(([cwe, ids]) => ({ cwe, evidenceIds: [...ids].sort() }))
    .sort((a, b) => a.cwe.localeCompare(b.cwe));

  const usedZones = new Set(model.components.map((c) => c.trustZone).filter(Boolean));
  return {
    model,
    matches,
    unmodeled,
    emptyTrustZones: model.trustZones.filter((z) => !usedZones.has(z.id)),
  };
}

function indexEvidence(evidence: EvidenceLike[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const item of evidence) {
    for (const { cwe } of cwesOf(item)) {
      const set = index.get(cwe) ?? new Set<string>();
      set.add(item.id);
      index.set(cwe, set);
    }
  }
  return index;
}

/** Convenience for a caller holding an untyped `usa scan --json` payload. */
export function evidenceFromScanJson(payload: unknown): EvidenceLike[] {
  const list = (payload as { evidence?: unknown[] } | null)?.evidence;
  if (!Array.isArray(list)) return [];
  return list.map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    return {
      id: typeof o.id === 'string' ? o.id : '',
      claim: typeof o.claim === 'string' ? o.claim : '',
      source: (o.source ?? {}) as EvidenceLike['source'],
      cwes: Array.isArray(o.cwes) ? (o.cwes as string[]) : undefined,
    };
  });
}

export { normaliseCwe };
