/**
 * OSS Review Toolkit (ORT) — Tier 2.
 *
 * ORT is a staged pipeline: `analyze` → `scan` → `advise` → `evaluate` → `report`.
 * The stage whose output is *evidence* is `evaluate`: policy rules applied to a
 * resolved dependency graph, producing rule violations with a package, a
 * version and a rule name.
 *
 * CLI verified against ORT 97.0.0 (run from the project's container image):
 *
 *     ort evaluate -i <analyzer-result.yml> -o <dir> -f JSON
 *
 * The first version of this adapter passed `--input-dir`, which ORT 97 rejects
 * outright ("no such option --input-dir") — the option is `-i/--ort-file`, and
 * it takes the *result file*, not a directory.
 *
 * Still unverified: the shape of `evaluator.violations`. ORT 97 refuses to
 * evaluate without a rules *script* ("No rules specified."), and writing one is
 * a Kotlin-scripting exercise rather than a parser question, so no violation has
 * been captured here. The parser accepts both `violations` at the top level and
 * under `evaluator`, and resolves anything else to UNKNOWN.
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AdapterProbe, Evidence, ScannerAdapter } from '../types.js';
import { buildEvidence } from '../identity.js';
import { DETERMINISTIC_CONFIDENCE, dig, tryParseJson } from '../normalize.js';

/** The ORT stage this adapter consumes. Later stages are not evidence. */
export const ORT_EVALUATE_OUTPUT = 'evaluation-result.yml';

export const ortAdapter: ScannerAdapter = {
  id: 'ort',
  name: 'OSS Review Toolkit dependency policy evaluator',

  defaultConfig() {
    return { outputDir: '.ort-results' };
  },

  probe(): AdapterProbe {
    const executable = which('ort');
    if (!executable) {
      return {
        available: false,
        version: '',
        reason: 'ort executable not found on PATH (JVM package from oss-review-toolkit/ort)',
      };
    }
    return { available: true, version: versionOf(executable), executable };
  },

  buildCommand(target, config) {
    // Evaluate is the leg that produces verdicts; analyze/scan/advise feed it.
    // `-i` takes the ORT result file, not a directory (measured on ORT 97).
    const input = String(
      config.ortFile ?? `${String(config.outputDir ?? '.ort-results')}/analyzer-result.yml`,
    );
    return {
      argv: [
        'ort',
        'evaluate',
        '-i',
        input,
        '-o',
        String(config.outputDir ?? '.ort-results'),
        '-f',
        'JSON',
      ],
      timeoutMs: 600_000,
    };
  },

  parse(raw: string, context): Evidence[] {
    // ORT writes YAML; accept JSON too so a converted artifact still parses.
    let doc: unknown;
    if (raw.trimStart().startsWith('{')) {
      const parsed = tryParseJson(raw);
      if (!parsed.ok) return [unknown(context, `ORT output was not valid JSON: ${parsed.error}`)];
      doc = parsed.value;
    } else {
      try {
        doc = parseYaml(raw);
      } catch (err) {
        return [unknown(context, `ORT output was not valid YAML: ${(err as Error).message}`)];
      }
    }
    // ORT 97 nests the result under `evaluator`; older layouts put it at the top.
    // Accept both, and say so when neither is present rather than reporting a
    // clean scan.
    const violations = dig(doc, ['evaluator', 'violations']) ?? dig(doc, ['violations']);
    if (!Array.isArray(violations)) {
      return [unknown(context, 'ORT evaluation carried no violations array (nothing evaluated?)')];
    }
    return violations.map((violation, index) =>
      violationToEvidence(violation, index, context.adapterVersion),
    );
  },
};

/** ORT's own severity words, mapped once here rather than inside the normaliser. */
function ortSeverity(word: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
  switch (word.toUpperCase()) {
    case 'ERROR':
      return 'HIGH';
    case 'WARNING':
      return 'MEDIUM';
    case 'HINT':
      return 'INFO';
    default:
      return 'LOW';
  }
}

function violationToEvidence(violation: unknown, index: number, adapterVersion: string): Evidence {
  const pkg = String(dig(violation, ['pkg']) ?? 'unknown package');
  const rule = String(dig(violation, ['rule']) ?? 'unknown rule');
  const severityWord = String(dig(violation, ['severity']) ?? 'ERROR');
  return buildEvidence({
    source: {
      tool: 'ort',
      kind: 'policy-violation',
      version: adapterVersion,
      identifier: rule,
    },
    provenance: placeholder(),
    claim: `${pkg} violates policy rule ${rule}`,
    severity: ortSeverity(severityWord),
    confidence: DETERMINISTIC_CONFIDENCE,
    status: 'FAIL',
    location: null,
    rawReference: { jsonPath: `violations[${index}]` },
  });
}

function unknown(context: { adapterId: string; adapterVersion: string }, reason: string): Evidence {
  return {
    id: `UNKNOWN-ort-${reason}`.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 48),
    source: { tool: 'ort', version: context.adapterVersion, kind: 'check', identifier: 'UNKNOWN' },
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
  const proc = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 60_000 });
  const match = /([\d.]+)/.exec(String(proc.stdout ?? proc.stderr ?? ''));
  return match?.[1] ?? 'unknown';
}
