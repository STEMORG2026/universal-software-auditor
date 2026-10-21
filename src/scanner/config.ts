import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ScannerConfig } from './types.js';

/** Per-project scanner config, `.usa/scanners.yaml`. */
export function loadScannerConfig(root: string): Record<string, ScannerConfig> {
  const file = path.join(root, '.usa', 'scanners.yaml');
  try {
    const doc = parseYaml(fs.readFileSync(file, 'utf8')) as {
      scanners?: Record<string, ScannerConfig>;
    };
    return doc?.scanners ?? {};
  } catch {
    return {};
  }
}
