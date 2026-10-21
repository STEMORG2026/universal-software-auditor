/**
 * OSS Review Toolkit (ORT) — Tier 2.
 *
 * ORT is a staged pipeline: `analyze` → `scan` → `advise` → `evaluate` → `report`.
 * The stage whose output is *evidence* is `evaluate`: policy rules applied to a
 * resolved dependency graph, producing rule violations with a package, a
 * version and a rule name.
 *
 * CLI and payload verified against ORT 97.0.0 (run from the project's container
 * image, `ghcr.io/oss-review-toolkit/ort`):
 *
 *     ort analyze --input-dir <dir> --output-dir <dir>        # → analyzer-result.yml
 *     ort evaluate -i <analyzer-result.yml> -o <dir> -f JSON  # → evaluation-result.json
 *
 * Four things measured here that the documentation does not say:
 *
 * 1. `evaluate` does not take `--input-dir`; the input is `-i/--ort-file` and
 *    it takes the result *file*.
 * 2. `evaluate` refuses to run without a rules *script* ("No rules specified.").
 *    The ruleset ORT ships is a classpath resource, and `--rules-resource` needs
 *    a **leading slash** (`/rules/osadl.rules.kts`): the un-prefixed form
 *    resolves against the command's own jar and dies with a NullPointerException.
 * 3. The violations are written to a **file**, not stdout — stdout carries
 *    progress logs. An adapter that parses stdout parses the wrong stream.
 * 4. `evaluate` **exits 2** when it finds violations. That is a successful run
 *    that objects, so exit status is recorded and never interpreted.
 *
 * The payload is `{ evaluator: { violations: [ { rule, pkg, license,
 * license_sources, severity, message, how_to_fix } ] } }` where `pkg` is a
 * coordinate string (`NPM::lodash:4.17.21`) or `null` for a violation that is
 * not attached to a package.
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AdapterProbe, Evidence, ScannerAdapter } from '../types.js';
import { buildEvidence } from '../identity.js';
import { DETERMINISTIC_CONFIDENCE, dig, tryParseJson } from '../normalize.js';

/** The artifact `analyze` writes and `evaluate` reads. */
export const ORT_ANALYZER_RESULT = 'analyzer-result.yml';

/** The artifact `evaluate -f JSON` writes — the one this adapter parses. */
export const ORT_EVALUATION_RESULT = 'evaluation-result.json';

/**
 * The ruleset ORT bundles. Reachable only with the leading slash (measured);
 * `scanners.ort.rulesFile` replaces it with a project's own `.kts` script.
 */
export const ORT_DEFAULT_RULES = '/rules/osadl.rules.kts';

export const ortAdapter: ScannerAdapter = {
  id: 'ort',
  name: 'OSS Review Toolkit dependency policy evaluator',
  // Only `analyze` reaches the network: it resolves the dependency graph from
  // the package registry. `evaluate` reads a file.
  needsNetwork: true,
  networkConfigKey: 'scanners.ort.ortFile',

  defaultConfig() {
    return {
      outputDir: '.ort-results',
      ortFile: '',
      rulesFile: '',
      rulesResource: ORT_DEFAULT_RULES,
    };
  },

  probe(): AdapterProbe {
    const executable = which('ort');
    if (!executable) {
      return {
        available: false,
        version: '',
        reason:
          'ort executable not found on PATH (JVM package from oss-review-toolkit/ort; ' +
          'the container image ghcr.io/oss-review-toolkit/ort is the verified runner)',
      };
    }
    return { available: true, version: versionOf(executable), executable };
  },

  buildCommand(target, config) {
    const outputDir = String(config.outputDir ?? '.ort-results');
    // A pre-computed result file turns this into a single offline stage.
    const ortFile = String(config.ortFile ?? '');
    const rulesFile = String(config.rulesFile ?? '');
    const rulesResource = String(config.rulesResource ?? ORT_DEFAULT_RULES);
    const input = ortFile || path.posix.join(outputDir, ORT_ANALYZER_RESULT);
    const rules = rulesFile ? ['-r', rulesFile] : [`--rules-resource=${rulesResource}`];
    return {
      argv: ['ort', 'evaluate', '-i', input, '-o', outputDir, '-f', 'JSON', ...rules],
      prepare: ortFile
        ? []
        : [
            {
              argv: ['ort', 'analyze', '--input-dir', target.workdir, '--output-dir', outputDir],
              timeoutMs: 900_000,
            },
          ],
      artifacts: [path.posix.join(outputDir, ORT_EVALUATION_RESULT)],
      network: !ortFile,
      timeoutMs: 600_000,
    };
  },

  parse(raw: string, context): Evidence[] {
    // ORT writes YAML by default; `-f JSON` (what the adapter asks for) writes
    // JSON. Accept both so a hand-converted artifact still parses.
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
    // ORT 97 nests the result under `evaluator`; older layouts put it at the
    // top. Accept both, and say so when neither is present rather than
    // reporting a clean scan.
    const violations = dig(doc, ['evaluator', 'violations']) ?? dig(doc, ['violations']);
    if (!Array.isArray(violations)) {
      return [unknown(context, 'ORT evaluation carried no violations array (nothing evaluated?)')];
    }
    if (violations.length === 0) return [cleanRun(doc, context)];
    return violations.map((violation, index) =>
      violationToEvidence(violation, index, context.adapterVersion),
    );
  },
};

/**
 * A clean evaluation is a fact, and its absence is not.
 *
 * With no row, "the policy was applied and nothing violated it" and "the policy
 * never ran" look identical to a rule consuming this evidence.
 */
function cleanRun(
  doc: unknown,
  context: { adapterVersion: string; config: Record<string, unknown> },
): Evidence {
  const packages = dig(doc, ['analyzer', 'result', 'packages']);
  const count = Array.isArray(packages) ? packages.length : null;
  const ruleset = String(
    context.config.rulesFile || context.config.rulesResource || ORT_DEFAULT_RULES,
  );
  return buildEvidence({
    source: {
      tool: 'ort',
      kind: 'policy-evaluation',
      version: context.adapterVersion,
      identifier: 'evaluation',
    },
    provenance: placeholder(),
    claim:
      `ORT evaluated ${count === null ? 'an unrecorded number of' : count} package(s) ` +
      `under ${ruleset}: no rule violations`,
    severity: 'INFO',
    severitySource: 'adapter-default',
    confidence: DETERMINISTIC_CONFIDENCE,
    status: 'PASS',
    location: null,
    rawReference: { jsonPath: 'evaluator.violations' },
  });
}

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

/** A string field, trimmed; anything else is empty rather than "[object Object]". */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function violationToEvidence(violation: unknown, index: number, adapterVersion: string): Evidence {
  const rule = text(dig(violation, ['rule'])) || 'unknown rule';
  // `pkg` is a coordinate string or null. Null is not "unknown package": it is
  // a violation the ruleset attached to the result rather than to a package.
  const pkg = text(dig(violation, ['pkg'])) || null;
  const message = text(dig(violation, ['message']));
  const howToFix = text(dig(violation, ['how_to_fix']));
  const license = text(dig(violation, ['license']));
  const severityWord = text(dig(violation, ['severity'])) || 'ERROR';
  // A licence-policy violation is only actionable if the licence is in the
  // claim: the rule name alone does not say which licence tripped it.
  const about = license ? ` (license ${license})` : '';
  const detail = message ? `: ${message}` : '';
  return buildEvidence({
    source: {
      tool: 'ort',
      kind: 'policy-violation',
      version: adapterVersion,
      identifier: rule,
    },
    provenance: placeholder(),
    claim: `${pkg ?? 'the repository'} violates policy rule ${rule}${about}${detail}`,
    severity: ortSeverity(severityWord),
    confidence: DETERMINISTIC_CONFIDENCE,
    status: 'FAIL',
    location: null,
    rawReference: {
      jsonPath: `evaluator.violations[${index}]`,
      ...(howToFix ? { excerpt: howToFix } : {}),
    },
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
  // Measured: `ort --version` prints JVM warnings first, and one of them names a
  // jar (`jna-5.19.1.jar`) — a loose regex on the whole output reports 5.19.1 as
  // the ORT version. Only a line that *is* a version counts, and the real one is
  // last.
  const lines = String(proc.stdout ?? proc.stderr ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\d+\.\d+/.test(line));
  const last = lines.at(-1);
  return last ? /^(\d+\.\d+\.\d+)/.exec(last)![1]! : 'unknown';
}
