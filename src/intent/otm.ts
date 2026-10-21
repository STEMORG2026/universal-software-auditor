/**
 * OTM (Open Threat Model) parser.
 *
 * Total, like the scanner normalisers: a field the format does not require
 * becomes an empty value, an entity type we do not model is listed in
 * `unrecognised`, and a document that is not OTM at all throws a single named
 * error rather than half-parsing.
 */
import type {
  IntentAsset,
  IntentComponent,
  IntentDataFlow,
  IntentMitigation,
  IntentModel,
  IntentThreat,
  IntentTrustZone,
} from './types.js';

export class IntentFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentFormatError';
  }
}

/** Keys this parser models. Anything else in the document is reported, not dropped. */
const MODELLED = new Set([
  'otmVersion',
  'project',
  'assets',
  'components',
  'dataflows',
  'trustZones',
  'threats',
  'mitigations',
  'representations',
]);

export function parseOtm(raw: string): IntentModel {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new IntentFormatError(`not valid JSON: ${(err as Error).message}`);
  }
  if (typeof doc !== 'object' || doc === null) {
    throw new IntentFormatError('not an object');
  }
  const root = doc as Record<string, unknown>;
  if (typeof root.otmVersion !== 'string') {
    // Threat Dragon also exports its internal diagram format; saying which one
    // this is beats "parse failed".
    throw new IntentFormatError(
      "not an OTM document (no otmVersion). Threat Dragon's internal diagram export is not supported — use its OTM export.",
    );
  }

  const project = asRecord(root.project);
  return {
    format: 'otm',
    version: root.otmVersion,
    project: {
      id: str(project.id),
      name: str(project.name),
      description: str(project.description),
      owner: str(project.owner),
    },
    assets: list(root.assets).map(parseAsset),
    components: list(root.components).map(parseComponent),
    dataFlows: list(root.dataflows).map(parseFlow),
    trustZones: list(root.trustZones).map(parseZone),
    threats: list(root.threats).map(parseThreat),
    mitigations: list(root.mitigations).map(parseMitigation),
    // `$`-prefixed keys are annotations (a fixture note, a schema hint), not
    // model content, so they are not reported as unmodelled entities.
    unrecognised: Object.keys(root).filter((k) => !MODELLED.has(k) && !k.startsWith('$')),
  };
}

function parseAsset(raw: unknown): IntentAsset {
  const o = asRecord(raw);
  const risk = asRecord(o.risk);
  return {
    id: str(o.id),
    name: str(o.name),
    description: str(o.description),
    risk: {
      confidentiality: num(risk.confidentiality),
      integrity: num(risk.integrity),
      availability: num(risk.availability),
    },
  };
}

function parseComponent(raw: unknown): IntentComponent {
  const o = asRecord(raw);
  const parent = asRecord(o.parent);
  return {
    id: str(o.id),
    name: str(o.name),
    type: str(o.type),
    trustZone: parent.trustZone ? str(parent.trustZone) : undefined,
  };
}

function parseFlow(raw: unknown): IntentDataFlow {
  const o = asRecord(raw);
  return {
    id: str(o.id),
    name: str(o.name),
    source: str(o.source),
    destination: str(o.destination),
    bidirectional: o.bidirectional === true,
    assets: list(o.assets).map(str).filter(Boolean),
  };
}

function parseZone(raw: unknown): IntentTrustZone {
  const o = asRecord(raw);
  const risk = asRecord(o.risk);
  return {
    id: str(o.id),
    name: str(o.name),
    type: str(o.type),
    trustRating: num(risk.trustRating),
  };
}

function parseThreat(raw: unknown): IntentThreat {
  const o = asRecord(raw);
  const risk = asRecord(o.risk);
  return {
    id: str(o.id),
    name: str(o.name),
    description: str(o.description),
    categories: list(o.categories).map(str).filter(Boolean),
    cwes: list(o.cwes).map(normaliseCwe).filter(Boolean),
    likelihood: num(risk.likelihood),
    impact: num(risk.impact),
  };
}

function parseMitigation(raw: unknown): IntentMitigation {
  const o = asRecord(raw);
  return {
    id: str(o.id),
    name: str(o.name),
    description: str(o.description),
    riskReduction: num(o.riskReduction),
  };
}

/** `CWE-79`, `cwe-79`, `CWE 79` and `79` all become `CWE-79`. */
export function normaliseCwe(value: unknown): string {
  const text = str(value)
    .toUpperCase()
    .replace(/[^0-9]/g, '');
  return text ? `CWE-${Number(text)}` : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
