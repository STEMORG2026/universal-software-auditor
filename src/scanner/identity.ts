/**
 * Content-addressed ids for evidence and findings.
 *
 * Ids are a hash over the fields that make a claim *the same claim*: the tool
 * that made it, its native category and identifier, the location, and the claim
 * text. Timestamps and execution ids are deliberately excluded, so the same
 * observation made in two runs, or by two adapters, shares one id. That is what
 * makes deduplication and two-run trending work without similarity heuristics.
 */
import { createHash } from 'node:crypto';
import type { Evidence, EvidenceSource, EvidenceLocation, RawReference } from './types.js';

/** Short, stable, non-reversible id. Collisions are theoretical at 20 hex chars. */
function hash(parts: (string | number | undefined | null)[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(`${p ?? ''}\u0000`);
  return h.digest('hex').slice(0, 20);
}

export function evidenceId(
  source: EvidenceSource,
  location: EvidenceLocation | null,
  claim: string,
): string {
  return hash([
    'evidence-v1',
    source.tool,
    source.kind,
    source.identifier,
    location?.file,
    location?.line,
    claim,
  ]);
}

export function buildEvidence(args: {
  source: Omit<EvidenceSource, 'version'> & { version?: string };
  provenance: Evidence['provenance'];
  claim: string;
  severity: Evidence['severity'];
  severitySource?: Evidence['severitySource'];
  confidence: number;
  status: Evidence['status'];
  location: EvidenceLocation | null;
  rawReference?: RawReference;
  cwes?: string[];
}): Evidence {
  const source: EvidenceSource = {
    tool: args.source.tool,
    version: args.source.version ?? 'unknown',
    kind: args.source.kind,
    identifier: args.source.identifier,
  };
  return {
    id: evidenceId(source, args.location, args.claim),
    source,
    provenance: args.provenance,
    claim: args.claim,
    severity: args.severity,
    severitySource: args.severitySource ?? 'tool-native',
    confidence: args.confidence,
    status: args.status,
    location: args.location,
    rawReference: args.rawReference ?? {},
    ...(args.cwes && args.cwes.length > 0 ? { cwes: args.cwes } : {}),
  };
}
