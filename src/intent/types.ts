/**
 * The intent model — what the project says it is, as distinct from what the
 * scanners observe.
 *
 * Shapes come from the **Open Threat Model** format (OTM 0.2.0) that Threat
 * Dragon exports, verified against the project's own example model rather than
 * from memory:
 *
 *   { otmVersion, project, assets[], components[], dataflows[],
 *     trustZones[], threats[], mitigations[] }
 *
 * We import the *concepts*, not the application: no Threat Dragon process runs,
 * no diagram is rendered, and the model is a plain file under version control.
 */

export interface IntentModel {
  format: 'otm';
  version: string;
  project: IntentProject;
  assets: IntentAsset[];
  components: IntentComponent[];
  dataFlows: IntentDataFlow[];
  trustZones: IntentTrustZone[];
  threats: IntentThreat[];
  mitigations: IntentMitigation[];
  /** Anything the parser recognised but does not model. Never dropped silently. */
  unrecognised: string[];
}

export interface IntentProject {
  id: string;
  name: string;
  description: string;
  owner: string;
}

export interface IntentAsset {
  id: string;
  name: string;
  description: string;
  /** Confidentiality / integrity / availability, 0–100, when declared. */
  risk?: { confidentiality?: number; integrity?: number; availability?: number };
}

export interface IntentComponent {
  id: string;
  name: string;
  type: string;
  /** The trust zone this component sits in, when declared. */
  trustZone?: string;
}

export interface IntentDataFlow {
  id: string;
  name: string;
  source: string;
  destination: string;
  bidirectional: boolean;
  /** Asset ids carried across this flow. */
  assets: string[];
}

export interface IntentTrustZone {
  id: string;
  name: string;
  type: string;
  /** 0–100; lower means less trusted. */
  trustRating?: number;
}

export interface IntentThreat {
  id: string;
  name: string;
  description: string;
  /** STRIDE categories, e.g. ["Spoofing", "Tampering"]. */
  categories: string[];
  /** CWE ids this threat is about — the join key to scanner evidence. */
  cwes: string[];
  likelihood?: number;
  impact?: number;
}

export interface IntentMitigation {
  id: string;
  name: string;
  description: string;
  riskReduction?: number;
}

/**
 * What the model claims vs what the evidence shows, per threat.
 *
 * `UNKNOWN` is the default and the honest answer when nothing was observed: a
 * threat with no matching evidence is not "mitigated", it is *unexamined*.
 */
export type ThreatVerdict = 'OBSERVED' | 'NOT_OBSERVED' | 'UNKNOWN';

export interface ThreatMatch {
  threat: IntentThreat;
  verdict: ThreatVerdict;
  /** Evidence ids that cite one of the threat's CWEs. */
  evidenceIds: string[];
  /** Why the verdict is what it is — mandatory, never blank. */
  reason: string;
}

export interface IntentReport {
  model: IntentModel;
  matches: ThreatMatch[];
  /** CWE ids seen in evidence that no declared threat mentions. */
  unmodeled: { cwe: string; evidenceIds: string[] }[];
  /** Declared trust zones with no component inside them. */
  emptyTrustZones: IntentTrustZone[];
}
