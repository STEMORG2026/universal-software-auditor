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

  /**
   * `--config` is passed only when the project supplies a rules file. The
   * alternative — always `--no-config` — would make this adapter a graph
   * printer: a cruise with no rules produces zero violations, and "0
   * violations" is exactly the unfalsifiable result this subsystem refuses to
   * emit. Verified against depcruise 18.7.0: the JSON has no `rules` key, so
   * whether rules ran is a *configuration* fact, not something to detect from
   * the output.
   */

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
    // The rules file has to reach argv, not only the parser. A parser told that
    // rules exist stops guarding an empty violation list (see `parse`), so a
    // cruise that never loaded the rules would report `ok` with no rows — a
    // silent pass on the one thing this adapter exists to detect.
    const rules = String(config.rules ?? '');
    return {
      argv: [
        'depcruise',
        '--output-type',
        'json',
        ...(rules ? ['--config', rules] : ['--no-config']),
        ...args,
      ],
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
    // No rules configured means the cruise produced a graph, not a verdict —
    // and "0 violations" would be indistinguishable from "no problems".
    if (list.length === 0 && !String(context.config.rules ?? '')) {
      return [
        unknown(context, 'dependency-cruiser ran without a rules config — a graph, not a verdict'),
      ];
    }
    return list.map((violation, index) =>
      violationToEvidence(violation, index, context.adapterVersion),
    );
  },
};

/** One edge violation → one evidence row naming both endpoints. */
/**
 * depcruise 18.7.0 emits `from`/`to` as plain strings ("a.js"); some versions
 * and the `--output-type err` family use objects. Accept both rather than
 * guessing, which is how the first version of this adapter produced `? → ?`.
 */
function endpoint(value: unknown): string {
  if (typeof value === 'string') return value;
  return String(dig(value, ['path']) ?? 'unknown');
}

function violationToEvidence(violation: unknown, index: number, adapterVersion: string): Evidence {
  const from = endpoint(dig(violation, ['from']));
  const to = endpoint(dig(violation, ['to']));
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
    claim: `${from} → ${to} breaks rule ${ruleName} (${severityWord})`,
    severity: mapSeverity(severityWord),
    confidence: DETERMINISTIC_CONFIDENCE,
    status: 'FAIL',
    location: { file: from },
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
