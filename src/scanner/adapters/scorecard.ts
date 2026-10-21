/**
 * OpenSSF Scorecard — Tier 2.
 *
 * Two modes, because the tool has two natures and they are not interchangeable:
 *
 * - `--local <folder>` reads a checkout and runs the **file-based** checks
 *   offline. Verified here (v5.6.0): SAST, License, Pinned-Dependencies,
 *   Dependency-Update-Tool, Binary-Artifacts, Fuzzing, Packaging.
 * - `--repo <url>` reaches the platform API and runs the **platform** checks
 *   (Branch-Protection, Token-Permissions, Signed-Releases, Code-Review, …).
 *   It needs network and a token.
 *
 * Measured in local mode, the platform checks do not degrade to `?` — they make
 * the whole run fail (`Unsupported RequestType [0] by check: Branch-Protection`).
 * So the check list is explicit in local mode; leaving it off is a crash, not a
 * partial result.
 *
 * The aggregate score is deliberately NOT emitted as evidence. Scorecard's own
 * README says the aggregate "tells you nothing about what individual behaviors a
 * repository is or is not doing"; a per-check reason is evidence, a 7.5/10 is a
 * headline.
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { AdapterProbe, Evidence, ScannerAdapter, ScannerConfig } from '../types.js';
import { buildEvidence } from '../identity.js';
import { DETERMINISTIC_CONFIDENCE, dig, tryParseJson } from '../normalize.js';

/** The file-based checks that survive `--local` (verified against v5.6.0). */
export const LOCAL_CHECKS = [
  'SAST',
  'License',
  'Pinned-Dependencies',
  'Dependency-Update-Tool',
  'Binary-Artifacts',
  'Fuzzing',
  'Packaging',
];

export const scorecardAdapter: ScannerAdapter = {
  id: 'scorecard',
  name: 'OpenSSF Scorecard repository posture probes',
  /** Only the repo mode reaches the network; local mode is fully offline. */
  needsNetwork: false,

  defaultConfig(): ScannerConfig {
    return { mode: 'local', checks: LOCAL_CHECKS };
  },

  probe(): AdapterProbe {
    const executable = which('scorecard');
    if (!executable) {
      return {
        available: false,
        version: '',
        reason: 'scorecard executable not found on PATH (release binary from ossf/scorecard)',
      };
    }
    return { available: true, version: versionOf(executable), executable };
  },

  buildCommand(target, config: ScannerConfig) {
    const mode = String(config.mode ?? 'local');
    const checks = Array.isArray(config.checks) ? (config.checks as string[]) : LOCAL_CHECKS;
    if (mode === 'repo') {
      const repo = String(config.repo ?? '') || deriveRepoSlug(target.path);
      return {
        argv: ['scorecard', '--repo', repo, '--format', 'json', '--show-details'],
        timeoutMs: 300_000,
        network: true,
      };
    }
    return {
      argv: [
        'scorecard',
        '--local',
        target.workdir,
        '--format',
        'json',
        '--checks',
        checks.join(','),
      ],
      timeoutMs: 300_000,
    };
  },

  parse(raw: string, context): Evidence[] {
    const parsed = tryParseJson(raw);
    if (!parsed.ok) {
      return [unknown(context, `scorecard output was not valid JSON: ${parsed.error}`)];
    }
    const checks = dig(parsed.value, ['checks']);
    if (!Array.isArray(checks)) {
      return [unknown(context, 'scorecard JSON carried no checks array')];
    }
    const toolVersion = String(
      dig(parsed.value, ['scorecard', 'version']) ?? context.adapterVersion,
    );
    return checks.flatMap((check, index) => checkToEvidence(check, index, toolVersion));
  },
};

/** One probe → one evidence row carrying the tool's own reason. */
function checkToEvidence(check: unknown, index: number, toolVersion: string): Evidence[] {
  const name = String(dig(check, ['name']) ?? 'unknown-check');
  const score = Number(dig(check, ['score']));
  const reason = String(dig(check, ['reason']) ?? 'no reason given');
  const docUrl = String(dig(check, ['documentation', 'url']) ?? '');
  const source = {
    tool: 'scorecard',
    kind: 'posture-probe',
    version: toolVersion,
    identifier: name,
  };

  // A negative score is scorecard's "could not evaluate" — UNKNOWN, never a fail
  // and never a pass. The reason string says why, and that is the evidence.
  if (!Number.isFinite(score) || score < 0) {
    return [
      buildEvidence({
        source,
        provenance: placeholder(),
        claim: `${name}: could not be evaluated — ${reason}`,
        severity: 'INFO',
        confidence: DETERMINISTIC_CONFIDENCE,
        status: 'UNKNOWN',
        location: null,
        rawReference: { jsonPath: `checks[${index}]`, excerpt: reason.slice(0, 160) },
      }),
    ];
  }

  // Scorecard's 0–10 is a scale, not a verdict, and the same number means
  // different things per probe: License 9 is "detected, not identified" while
  // Binary-Artifacts 6 is "binaries present". Collapsing either to FAIL loses
  // the distinction and collapsing to PASS launders the caveat, so the adapter
  // emits PARTIAL and carries the number in the claim. A rule decides what
  // threshold means a failure — that is a policy question, not a parsing one.
  const status = score >= 10 ? 'PASS' : 'PARTIAL';
  return [
    buildEvidence({
      source,
      provenance: placeholder(),
      claim: `${name} (${score}/10): ${reason}`,
      severity: status === 'PASS' ? 'INFO' : 'MEDIUM',
      confidence: DETERMINISTIC_CONFIDENCE,
      status,
      location: null,
      rawReference: { jsonPath: `checks[${index}]`, excerpt: docUrl.slice(0, 160) },
    }),
  ];
}

function unknown(context: { adapterId: string; adapterVersion: string }, reason: string): Evidence {
  return {
    id: `UNKNOWN-scorecard-${reason}`.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 48),
    source: {
      tool: 'scorecard',
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

/** `git@github.com:org/repo.git` or `https://github.com/org/repo.git` → `org/repo`. */
export function deriveRepoSlug(targetPath: string): string {
  const proc = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: targetPath,
    encoding: 'utf8',
    timeout: 15_000,
  });
  const url = String(proc.stdout ?? '').trim();
  const match = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url);
  return match?.[1] ?? '';
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

/**
 * `scorecard version` prints an ASCII-art banner before the number, so the
 * pattern demands a full semver — a loose `[\d.]+` matches the art instead.
 * The JSON report also carries the version, and the parser prefers that one.
 */
function versionOf(executable: string): string {
  const proc = spawnSync(executable, ['version'], { encoding: 'utf8', timeout: 20_000 });
  const match = /\bv?(\d+\.\d+\.\d+)\b/.exec(String(proc.stdout ?? proc.stderr ?? ''));
  return match?.[1] ?? 'unknown';
}
