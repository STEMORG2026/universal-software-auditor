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
import type { ScannerAdapter } from './types.js';

/** Tier 1, in execution order. Heavy/opt-in adapters still register here. */
export const scanners: ScannerAdapter[] = [
  trivyAdapter,
  dependencyCruiserAdapter,
  semgrepAdapter,
  codeqlAdapter,
];

/** Default-disabled adapters: too heavy for a plain `usa scan`. */
export const DEFAULT_DISABLED: ReadonlySet<string> = new Set(['codeql']);

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
