/**
 * Trivy — Tier 1, and the reference adapter.
 *
 * Verified by running the real binary (v0.75.0) on a fixture package-lock and
 * reading the actual JSON shape, including `PkgIdentifier.PURL`, which gives
 * every finding a stable native identifier.
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { AdapterProbe, Evidence, ScannerAdapter, ScannerConfig } from '../types.js';
import { buildEvidence } from '../identity.js';
import { DETERMINISTIC_CONFIDENCE, dig, lineNumber, severity, tryParseJson } from '../normalize.js';

export const trivyAdapter: ScannerAdapter = {
  id: 'trivy',
  name: 'Trivy vulnerability / secret / misconfiguration scanner',

  defaultConfig() {
    return { scanners: ['vuln', 'secret', 'misconfig'], severity: ['HIGH', 'CRITICAL'] };
  },

  probe(): AdapterProbe {
    const executable = which('trivy');
    if (!executable) {
      return { available: false, version: '', reason: 'trivy executable not found on PATH' };
    }
    return { available: true, version: versionOf(executable), executable };
  },

  buildCommand(target, config: ScannerConfig) {
    return {
      argv: [
        'trivy',
        'fs',
        '--format',
        'json',
        '--quiet',
        '--scanners',
        (config.scanners as string[] | undefined)?.join(',') ?? 'vuln,secret,misconfig',
        // Exit 0 regardless of findings: exit status is never the verdict, so a
        // findings-rich scan must not be smuggled in as a crash.
        '--exit-code',
        '0',
        '--skip-version-check',
        target.workdir,
      ],
      timeoutMs: 300_000,
    };
  },

  parse(raw: string, context): Evidence[] {
    const parsed = tryParseJson(raw);
    if (!parsed.ok) {
      return [unknown(context, `trivy output was not valid JSON: ${parsed.error}`)];
    }
    const results = dig(parsed.value, ['Results']);
    if (!Array.isArray(results)) {
      // An absent Results array means "nothing scanned", which is not
      // "nothing found" — the difference the evidence model exists to keep.
      return [unknown(context, 'trivy report carried no Results array (nothing scanned?)')];
    }
    const out: Evidence[] = [];
    for (const [index, result] of results.entries()) {
      const target = String(dig(result, ['Target']) ?? 'unknown');
      out.push(
        ...evidenceOf(
          result,
          'Vulnerabilities',
          index,
          'vulnerability',
          context.adapterVersion,
          (item) => [
            String(dig(item, ['VulnerabilityID']) ?? 'unknown'),
            `${dig(item, ['PkgName'])} ${dig(item, ['InstalledVersion'])} is vulnerable to ${dig(item, ['VulnerabilityID'])} (fixed in ${dig(item, ['FixedVersion']) ?? 'unfixed'})`,
            { file: target },
          ],
        ),
      );
      out.push(
        ...evidenceOf(result, 'Secrets', index, 'secret', context.adapterVersion, (item) => [
          String(dig(item, ['RuleID']) ?? 'unknown'),
          `${dig(item, ['Title']) ?? 'possible credential'} detected`,
          { file: target, line: lineNumber(dig(item, ['StartLine'])) },
        ]),
      );
      out.push(
        ...evidenceOf(
          result,
          'Misconfigurations',
          index,
          'misconfiguration',
          context.adapterVersion,
          (item) => [
            String(dig(item, ['ID']) ?? 'unknown'),
            `${dig(item, ['Title']) ?? 'misconfiguration'}: ${String(dig(item, ['Message']) ?? '').slice(0, 160)}`,
            { file: target, line: lineNumber(dig(item, ['CauseMetadata', 'StartLine'])) },
          ],
        ),
      );
    }
    return out;
  },
};

/** One trivy result category → evidence rows. */
function evidenceOf(
  result: unknown,
  key: string,
  index: number,
  kind: string,
  adapterVersion: string,
  extract: (item: unknown) => [string, string, { file: string; line?: number }],
): Evidence[] {
  const items = dig(result, [key]);
  if (!Array.isArray(items)) return [];
  const out: Evidence[] = [];
  for (const item of items) {
    const [identifier, claim, location] = extract(item);
    out.push(
      buildEvidence({
        source: {
          tool: 'trivy',
          kind,
          version: adapterVersion,
          identifier,
        },
        provenance: placeholder(),
        claim,
        severity: severity(dig(item, ['Severity'])),
        // Secrets are heuristic engine matches; the others are deterministic
        // record reads. Saying so is a confidence a reviewer can check.
        confidence: kind === 'secret' ? 0.9 : DETERMINISTIC_CONFIDENCE,
        status: 'FAIL',
        location,
        rawReference: { jsonPath: `Results[${index}]`, excerpt: claim.slice(0, 160) },
      }),
    );
  }
  return out;
}

/** The runner stamps real provenance on every row after parsing. */
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

function unknown(context: { adapterId: string; adapterVersion: string }, reason: string): Evidence {
  return {
    id: `UNKNOWN-trivy-${reason}`.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 48),
    source: {
      tool: 'trivy',
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

/* ---------------------------------------------------------------- process */

function which(binary: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binary);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking — a missing entry is not an error */
    }
  }
  return null;
}

function versionOf(executable: string): string {
  const proc = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  const match = /Version:?\s*([\w.]+)/.exec(String(proc.stdout ?? ''));
  return match?.[1] ?? 'unknown';
}
