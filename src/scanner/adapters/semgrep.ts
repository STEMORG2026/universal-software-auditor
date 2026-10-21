/**
 * Semgrep — Tier 1.
 *
 * Verified by installing semgrep 1.182.0 and running it against
 * `fixtures/insecure-app` with a vendored rule; the committed fixture is a real
 * capture. Two measured details shape this adapter: `path` is absolute when the
 * target is absolute (so it is relativised to the scan root), and
 * `extra.fingerprint` is the literal string "requires login" on the OSS engine
 * without an account (so the evidence id is content-derived, never the
 * fingerprint).
 *
 * Exit-code behaviour is verified from the CLI reference: default `scan`
 * **exits 0 even with findings**; only `--error` exits 1. The runner never
 * infers a verdict from the status code, so this does not affect semantics —
 * but it is why the adapter does not pass `--error`.
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { AdapterProbe, Evidence, ScannerAdapter, ScannerConfig } from '../types.js';
import { buildEvidence } from '../identity.js';
import {
  DETERMINISTIC_CONFIDENCE,
  dig,
  lineNumber,
  relativePath,
  severity,
  tryParseJson,
} from '../normalize.js';

export const semgrepAdapter: ScannerAdapter = {
  id: 'semgrep',
  name: 'Semgrep SAST scanner',
  networkConfigKey: 'scanners.semgrep.rules',

  defaultConfig() {
    return { rules: '', severity: [] };
  },

  probe(): AdapterProbe {
    const executable = which('semgrep');
    if (!executable) {
      return { available: false, version: '', reason: 'semgrep executable not found on PATH' };
    }
    return { available: true, version: versionOf(executable), executable };
  },

  buildCommand(_target, config: ScannerConfig) {
    const rules = String(config.rules ?? '');
    const argv = [
      'semgrep',
      'scan',
      '--json',
      // No --error: exit status is not a verdict, and 1-on-findings would look
      // like a crash to any later naive consumer.
      ...(rules ? ['--config', rules] : ['--config', 'auto']),
      // Network is only needed for --config auto; a vendored rules dir is offline.
      ...(rules ? [] : []),
    ];
    return { argv, timeoutMs: 300_000, network: !rules };
  },

  parse(raw: string, context): Evidence[] {
    const parsed = tryParseJson(raw);
    if (!parsed.ok) {
      return [unknown(context, `semgrep output was not valid JSON: ${parsed.error}`)];
    }
    const results = dig(parsed.value, ['results']);
    if (!Array.isArray(results)) {
      return [unknown(context, 'semgrep JSON had no results array (no rules ran?)')];
    }
    const out: Evidence[] = [];
    for (const [index, result] of results.entries()) {
      out.push(
        buildEvidence({
          source: {
            tool: 'semgrep',
            kind: 'sast-finding',
            version: context.adapterVersion,
            identifier: String(dig(result, ['check_id']) ?? 'unknown-rule'),
          },
          provenance: placeholder(),
          claim: String(dig(result, ['extra', 'message']) ?? 'semgrep match').slice(0, 160),
          severity: severity(dig(result, ['extra', 'severity'])),
          // Heuristic rule engine, registry-dependent; the number is a policy
          // statement from the adapter, not a measurement.
          confidence: 0.9,
          status: 'FAIL',
          location: {
            // The runner scans a scratch copy, so semgrep reports absolute
            // paths there; evidence must name the file in the project.
            file: relativePath(context.target.workdir, String(dig(result, ['path']) ?? 'unknown')),
            line: lineNumber(dig(result, ['start', 'line'])),
          },
          rawReference: { jsonPath: `results[${index}]` },
          cwes: cwesOf(dig(result, ['extra', 'metadata', 'cwe'])),
        }),
      );
    }
    return out;
  },
};

/** `["CWE-94: Improper Control…"]` → `["CWE-94"]`. */
function cwesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const entry of value) {
    const match = /CWE[-_ ]?(\d{1,5})/i.exec(String(entry));
    if (match) out.add(`CWE-${Number(match[1])}`);
  }
  return [...out];
}

function unknown(context: { adapterId: string; adapterVersion: string }, reason: string): Evidence {
  return {
    id: `UNKNOWN-semgrep-${reason}`.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 48),
    source: {
      tool: 'semgrep',
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
  const proc = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 30_000 });
  const match = /([\d.]+)/.exec(String(proc.stdout ?? ''));
  return match?.[1] ?? 'unknown';
}
