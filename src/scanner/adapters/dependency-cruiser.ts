/**
 * dependency-cruiser — Tier 1.
 *
 * The critical fact driving this adapter: `-T json` **exits 0 regardless of
 * violations** (the CLI docs are explicit; only the err-family reporters exit
 * with the count of error-severity violations). Reading the exit code here
 * would make every architecture violation invisible. The verdict is parsed
 * from the JSON, never from the process status.
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { AdapterProbe, Evidence, ScannerAdapter, ScannerConfig } from '../types.js';
import { buildEvidence } from '../identity.js';
import { DETERMINISTIC_CONFIDENCE, dig, tryParseJson } from '../normalize.js';

export const dependencyCruiserAdapter: ScannerAdapter = {
  id: 'dependency-cruiser',
  name: 'Dependency graph and architecture rules (JS/TS)',

  defaultConfig() {
    return { args: ['src'], rules: '' };
  },

  probe(): AdapterProbe {
    for (const binary of ['depcruise', 'dependency-cruiser']) {
      const executable = which(binary);
      if (executable) {
        return { available: true, version: versionOf(executable), executable };
      }
    }
    return {
      available: false,
      version: '',
      reason: 'depcruise executable not found on PATH (not installed in this environment)',
    };
  },

  buildCommand(target, config: ScannerConfig) {
    const args = (config.args as string[] | undefined) ?? ['src'];
    return {
      argv: ['depcruise', '--output-type', 'json', '--no-config', ...args],
      timeoutMs: 120_000,
    };
  },

  parse(raw: string, context): Evidence[] {
    const parsed = tryParseJson(raw);
    if (!parsed.ok) {
      return [unknown(context, `dependency-cruiser output was not valid JSON: ${parsed.error}`)];
    }
    const modules = dig(parsed.value, ['modules']);
    if (!Array.isArray(modules)) {
      return [
        unknown(context, 'dependency-cruiser report carried no modules array (nothing scanned?)'),
      ];
    }
    const violations = dig(parsed.value, ['summary', 'violations']);
    const list = Array.isArray(violations) ? violations : [];
    const rows = list.map((violation, index) =>
      violationToEvidence(violation, index, context.adapterVersion),
    );
    // A rule-less cruise is not a pass: say so, or "0 violations" is unfalsifiable.
    if (list.length === 0 && !Array.isArray(dig(parsed.value, ['rules']))) {
      return [
        unknown(context, 'dependency-cruiser ran without a rules config — a graph, not a verdict'),
      ];
    }
    return rows;
  },
};

/** One edge violation → one evidence row naming both endpoints. */
function violationToEvidence(violation: unknown, index: number, adapterVersion: string): Evidence {
  const from = dig(violation, ['from']) as { path?: string } | undefined;
  const to = dig(violation, ['to']) as { path?: string } | undefined;
  const ruleName = String(
    dig(violation, ['rule', 'name']) ?? dig(violation, ['rule', 'id']) ?? 'unnamed-rule',
  );
  const severityWord = String(dig(violation, ['rule', 'severity']) ?? 'warn');
  return buildEvidence({
    source: {
      tool: 'dependency-cruiser',
      kind: 'dependency-edge',
      version: adapterVersion,
      identifier: ruleName,
    },
    provenance: placeholder(),
    claim: `${from?.path ?? '?'} → ${to?.path ?? '?'} breaks rule ${ruleName} (${severityWord})`,
    severity: mapSeverity(severityWord),
    confidence: DETERMINISTIC_CONFIDENCE,
    status: 'FAIL',
    location: { file: from?.path ?? 'unknown' },
    rawReference: { jsonPath: `summary.violations[${index}]` },
  });
}

function mapSeverity(word: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
  if (word === 'error') return 'HIGH';
  if (word === 'info') return 'INFO';
  return 'MEDIUM';
}

function unknown(context: { adapterId: string; adapterVersion: string }, reason: string): Evidence {
  return {
    id: `UNKNOWN-dependency-cruiser-${reason}`.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 48),
    source: {
      tool: 'dependency-cruiser',
      version: context.adapterVersion,
      kind: 'check',
      identifier: 'UNKNOWN',
    },
    provenance: placeholder(),
    claim: reason,
    severity: 'INFO',
    severitySource: 'adapter-default',
    confidence: DETERMINISTIC_CONFIDENCE,
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

function which(binary: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binary);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function versionOf(executable: string): string {
  const proc = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 15_000 });
  const match = /([\w.]+)/.exec(String(proc.stdout ?? proc.stderr ?? ''));
  return match?.[1] ?? 'unknown';
}
