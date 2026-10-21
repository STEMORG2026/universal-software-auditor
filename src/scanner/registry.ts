/**
 * Registry — the only place that knows which adapters exist.
 *
 * Adding an adapter must not require touching the runner, the CLI, or the rule
 * packs; appending to this list is the whole integration.
 */
import { trivyAdapter } from './adapters/trivy.js';
import { dependencyCruiserAdapter } from './adapters/dependency-cruiser.js';
import { semgrepAdapter } from './adapters/semgrep.js';
import { codeqlAdapter } from './adapters/codeql.js';
import { scorecardAdapter } from './adapters/scorecard.js';
import { ortAdapter } from './adapters/ort.js';
import type { ScannerAdapter } from './types.js';

/**
 * Every registered adapter. Tier 1 first (cheap, local), then Tier 2.
 * Adding an adapter means appending here — nothing else in the system changes.
 */
export const scanners: ScannerAdapter[] = [
  trivyAdapter,
  dependencyCruiserAdapter,
  semgrepAdapter,
  codeqlAdapter,
  scorecardAdapter,
  ortAdapter,
];

/**
 * Default-disabled adapters, and why:
 *  - codeql  needs a database build and hundreds of MB of disk.
 *  - ort     needs a JVM and a full dependency resolution per package manager.
 *  - scorecard is enabled in its default `local` mode (offline, file-based);
 *    `mode: repo` opts into network and a token.
 */
export const DEFAULT_DISABLED: ReadonlySet<string> = new Set(['codeql', 'ort']);

export function enabledAdapters(
  config: Record<string, { enabled?: boolean }> | undefined,
): ScannerAdapter[] {
  return scanners.filter((a) => {
    if (config && typeof config[a.id]?.enabled === 'boolean') return config[a.id]!.enabled!;
    return !DEFAULT_DISABLED.has(a.id);
  });
}

export function byId(id: string): ScannerAdapter | undefined {
  return scanners.find((a) => a.id === id);
}
