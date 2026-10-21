import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseScanners,
  reportToStdout,
  writeEvidenceReport,
  defaultEnabled,
} from '../../src/cli-scan.js';
import { trivyAdapter } from '../../src/scanner/adapters/trivy.js';
import { dependencyCruiserAdapter } from '../../src/scanner/adapters/dependency-cruiser.js';
import { semgrepAdapter } from '../../src/scanner/adapters/semgrep.js';
import { codeqlAdapter } from '../../src/scanner/adapters/codeql.js';
import { evidenceFromSarif } from '../../src/scanner/sarif.js';
import { byId, enabledAdapters } from '../../src/scanner/registry.js';
import { childEnv, copyTreeForScan, detectRevision } from '../../src/scanner/run.js';

import { loadScannerConfig } from '../../src/scanner/config.js';
import type { ScanResult, ScannerSeverity } from '../../src/scanner/types.js';

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/scanners');
const read = (file: string): string => fs.readFileSync(path.join(FIXTURES, file), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'usa-unit-'));

/**
 * The paths the happy tests do not reach: probe failures, malformed payloads,
 * denied network, and the CLI's rendering. Coverage that only exercises the
 * success case is how an adapter grows a silent failure mode.
 */
describe('scanner command surface', () => {
  it('--scanner accepts a comma list and repeats', () => {
    expect(parseScanners({ _: [], scanner: 'trivy,semgrep' })).toEqual(['trivy', 'semgrep']);
    expect(parseScanners({ _: [], scanner: ['trivy', 'semgrep'] })).toEqual(['trivy', 'semgrep']);
    expect(parseScanners({ _: [] })).toBeUndefined();
  });

  it('the evidence report carries coverage, evidence and findings', () => {
    const out = path.join(tmp(), 'evidence.md');
    writeEvidenceReport(out, result());
    const text = fs.readFileSync(out, 'utf8');
    expect(text).toContain('## Coverage');
    expect(text).toContain('| trivy | 0.75.0 | ok | 1 | 10ms | stdout |');
    // A file-backed adapter says which file, and a non-zero exit is recorded.
    expect(text).toContain('| ort | 97.0.0 | ok | 3 | 20ms | `evaluation-result.json` (exit 2) |');
    expect(text).toContain('(not installed)');
    expect(text).toContain('## Evidence');
    expect(text).toContain('CVE-2019-10744');
    expect(text).toContain('## Findings');
    expect(text).toContain('evidence: EVT-1');
  });

  it('the stdout line distinguishes a ran adapter from a blind spot', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => lines.push(String(m)));
    try {
      reportToStdout(result(), '/out/evidence.md');
    } finally {
      spy.mockRestore();
    }
    expect(lines.some((l) => l.includes('✅ trivy'))).toBe(true);
    expect(lines.some((l) => l.includes('⚠️  ghost unavailable'))).toBe(true);
    expect(lines.some((l) => l.includes('/out/evidence.md'))).toBe(true);
  });

  it('the defaults run everything cheap and skip the heavy opt-ins', () => {
    // scorecard is enabled in its default local mode (offline, file-based);
    // codeql and ort are opt-in because they cost a database build and a JVM.
    expect(defaultEnabled()).toEqual(['trivy', 'dependency-cruiser', 'semgrep', 'scorecard']);
  });

  it('a project config is read from .usa/scanners.yaml, and its absence is not an error', () => {
    const root = tmp();
    expect(loadScannerConfig(root)).toEqual({});
    fs.mkdirSync(path.join(root, '.usa'));
    fs.writeFileSync(
      path.join(root, '.usa', 'scanners.yaml'),
      'scanners:\n  trivy:\n    scanners: [vuln]\n',
    );
    expect(loadScannerConfig(root)).toEqual({ trivy: { scanners: ['vuln'] } });
  });

  it('the config file is malformed → no adapters rather than a crash', () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, '.usa'));
    fs.writeFileSync(path.join(root, '.usa', 'scanners.yaml'), 'this: [is: not: valid');
    expect(loadScannerConfig(root)).toEqual({});
  });
});

describe('probe and availability', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a tool absent from PATH is UNAVAILABLE with a reason', () => {
    const stub = vi.spyOn(process, 'env', 'get').mockReturnValue({ PATH: tmp() } as never);
    try {
      expect(trivyAdapter.probe().available).toBe(false);
      expect(dependencyCruiserAdapter.probe().available).toBe(false);
      expect(semgrepAdapter.probe().available).toBe(false);
      expect(codeqlAdapter.probe().available).toBe(false);
      expect(trivyAdapter.probe().reason).toMatch(/not found on PATH/);
    } finally {
      stub.mockRestore();
    }
  });

  it('an unknown adapter id resolves to nothing', () => {
    expect(byId('nope')).toBeUndefined();
    expect(byId('trivy')).toBe(trivyAdapter);
  });

  it('an explicit false in the config disables an adapter that would run', () => {
    expect(enabledAdapters({ trivy: { enabled: false } }).map((a) => a.id)).not.toContain('trivy');
  });
});

describe('parse failures are UNKNOWN, never exceptions', () => {
  it('trivy: a Result without expected keys yields nothing rather than crashing', () => {
    const rows = trivyAdapter.parse(JSON.stringify({ Results: [{ Target: 'x' }, 3] }), {
      adapterId: 'trivy',
      adapterVersion: '1',
      target: { path: '/', workdir: '/', revision: '', executionId: '' },
      config: {},
    });
    expect(rows).toEqual([]);
  });

  it('trivy: a secret severity the tool invented degrades to LOW instead of dropping', () => {
    const rows = trivyAdapter.parse(
      JSON.stringify({
        Results: [{ Target: 'a.js', Secrets: [{ RuleID: 'r', Severity: 'EXTREME', Title: 'k' }] }],
      }),
      ctx(),
    );
    expect(rows[0]!.severity).toBe('LOW');
    expect(rows[0]!.source.kind).toBe('secret');
  });

  it('trivy: misconfigurations map with their cause line when present', () => {
    const rows = trivyAdapter.parse(
      JSON.stringify({
        Results: [
          {
            Target: 'Dockerfile',
            Misconfigurations: [
              {
                ID: 'DS-1',
                Severity: 'HIGH',
                Message: 'run as root',
                CauseMetadata: { StartLine: 3 },
              },
            ],
          },
        ],
      }),
      ctx(),
    );
    expect(rows[0]!.location).toEqual({ file: 'Dockerfile', line: 3 });
    expect(rows[0]!.source.kind).toBe('misconfiguration');
  });

  it('dependency-cruiser: a report with no modules is UNKNOWN', () => {
    const rows = dependencyCruiserAdapter.parse('{}', ctx('16'));
    expect(rows[0]!.status).toBe('UNKNOWN');
  });

  it('semgrep: a result without check_id still yields an evidence row', () => {
    const rows = semgrepAdapter.parse(
      JSON.stringify({
        results: [{ path: 'a.js', start: { line: 1 }, extra: { severity: 'INFO' } }],
      }),
      ctx('1'),
    );
    expect(rows[0]!.source.identifier).toBe('unknown-rule');
    expect(rows[0]!.severity).toBe('INFO');
  });

  it('codeql: SARIF with no runs is UNKNOWN, not empty', () => {
    const rows = codeqlAdapter.parse(JSON.stringify({ version: '2.1.0' }), ctx('2'));
    expect(rows[0]!.status).toBe('UNKNOWN');
  });

  it('semgrep: rules supplied by config also appear in the command', () => {
    const argv = semgrepAdapter.buildCommand(
      { path: '/', workdir: '/w', revision: '', executionId: '' },
      { rules: 'my-rules/' },
    ).argv;
    expect(argv.slice(0, 2)).toEqual(['semgrep', 'scan']);
    expect(argv).toContain('my-rules/');
  });

  /**
   * A configured rules file that never reaches argv is worse than no rules at
   * all: the parser sees `rules` set, so it stops treating an empty violation
   * list as UNKNOWN, and a cruise that ran no rules reports `ok` with no rows.
   * That is a silent pass on the one thing this adapter exists to detect.
   */
  it('dependency-cruiser: a configured rules file reaches the command', () => {
    const argv = dependencyCruiserAdapter.buildCommand(
      { path: '/', workdir: '/w', revision: '', executionId: '' },
      { rules: '.dependency-cruiser.json' },
    ).argv;
    expect(argv).toContain('--config');
    expect(argv).toContain('.dependency-cruiser.json');
    expect(argv).not.toContain('--no-config');
  });

  it('dependency-cruiser: without rules the cruise is explicitly configless', () => {
    const argv = dependencyCruiserAdapter.buildCommand(
      { path: '/', workdir: '/w', revision: '', executionId: '' },
      {},
    ).argv;
    expect(argv).toContain('--no-config');
    expect(argv).not.toContain('--config');
  });
});

describe('SARIF edge cases', () => {
  it('no runs array → UNKNOWN', () => {
    const rows = evidenceFromSarif('{"version":"2.1.0"}', sarifOpts());
    expect(rows[0]!.status).toBe('UNKNOWN');
  });

  it('garbage → UNKNOWN', () => {
    expect(evidenceFromSarif('nope', sarifOpts())[0]!.status).toBe('UNKNOWN');
  });

  it('a result with no message still produces an evidence row', () => {
    const rows = evidenceFromSarif(
      JSON.stringify({ runs: [{ tool: { driver: { name: 'X' } }, results: [{ ruleId: 'r' }] }] }),
      sarifOpts(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.claim).toContain('no message');
  });

  it('a run with no results contributes nothing', () => {
    expect(
      evidenceFromSarif(
        JSON.stringify({ runs: [{ tool: { driver: {} }, results: [] }] }),
        sarifOpts(),
      ),
    ).toEqual([]);
  });

  it('the driver version is preferred over the adapter-reported one', () => {
    const rows = evidenceFromSarif(
      JSON.stringify({
        runs: [
          {
            tool: { driver: { name: 'X', version: '9.9.9' } },
            results: [{ ruleId: 'r', message: { text: 'm' } }],
          },
        ],
      }),
      sarifOpts(),
    );
    expect(rows[0]!.source.version).toBe('9.9.9');
  });

  it('the adapter version fills in when the tool omits its own', () => {
    // CodeQL 2.27.3 writes no `tool.driver.version`, so the real capture has to
    // fall back to the version the adapter probed.
    const rows = evidenceFromSarif(read('codeql.sarif.json'), sarifOpts());
    expect(rows[0]!.source.version).toBe('2.23.0');
  });

  it('a start column is carried when the region has one', () => {
    const rows = evidenceFromSarif(read('codeql.sarif.json'), sarifOpts());
    expect(rows[0]!.location).toEqual({ file: 'app.js', line: 3, column: 23 });
  });
});

describe('runner helpers', () => {
  it('childEnv hands over PATH and withholds a token', () => {
    const saved = process.env.PATH;
    try {
      process.env.PATH = tmp();
      process.env.GITHUB_TOKEN = 'secret';
      const env = childEnv(['PATH', 'GITHUB_TOKEN', 'HOME']);
      expect(env.PATH).toBeTruthy();
      // The allow-list hands HOME over; the deny-list still withholds tokens.
      expect(env.HOME).toBe(process.env.HOME);
      expect(env.GITHUB_TOKEN).toBeUndefined();
    } finally {
      process.env.PATH = saved;
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('the scratch copy skips git, node_modules and symlinks and copies the rest', () => {
    const from = tmp();
    const into = tmp();
    fs.mkdirSync(path.join(from, '.git'));
    fs.writeFileSync(path.join(from, '.git', 'HEAD'), 'ref: refs/heads/master\n');
    fs.mkdirSync(path.join(from, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(from, 'node_modules', 'a.js'), '//\n');
    fs.mkdirSync(path.join(from, 'src'));
    fs.writeFileSync(path.join(from, 'src', 'a.ts'), 'export const a = 1;\n');
    fs.symlinkSync('/etc/hostname', path.join(from, 'link'));
    copyTreeForScan(from, into);
    expect(fs.existsSync(path.join(into, '.git'))).toBe(false);
    expect(fs.existsSync(path.join(into, 'node_modules'))).toBe(false);
    expect(fs.readFileSync(path.join(into, 'src', 'a.ts'), 'utf8')).toContain('export const a');
    expect(fs.existsSync(path.join(into, 'link'))).toBe(false);
  });

  it('a revision is read from .git or reported as unversioned', () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/master\n');
    fs.mkdirSync(path.join(root, '.git', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(root, '.git', 'refs', 'heads', 'master'), 'abc123\n');
    expect(detectRevision(root)).toBe('abc123');
    expect(detectRevision(tmp())).toBe('unversioned');
  });
});

/* ------------------------------------------------------------------ helpers */

function ctx(adapterVersion = '1'): {
  adapterId: string;
  adapterVersion: string;
  target: { path: string; workdir: string; revision: string; executionId: string };
  config: Record<string, unknown>;
} {
  return {
    adapterId: 'test',
    adapterVersion,
    target: { path: '/x', workdir: '/x/w', revision: 'abc', executionId: 'e' },
    config: {},
  };
}

function sarifOpts() {
  return { tool: 'codeql', kind: 'dataflow-finding', adapterVersion: '2.23.0' };
}

function result(): ScanResult {
  const severity: ScannerSeverity = 'CRITICAL';
  return {
    manifest: {
      executionId: 'run-1',
      target: '/x',
      repositoryRevision: 'abc',
      timestamp: '2026-01-01T00:00:00.000Z',
      adapters: [
        {
          id: 'trivy',
          available: true,
          version: '0.75.0',
          command: [],
          status: 'ok',
          evidenceCount: 1,
          elapsedMs: 10,
          needsNetwork: false,
        },
        {
          id: 'ghost',
          available: false,
          version: '',
          command: [],
          status: 'unavailable',
          reason: 'not installed',
          evidenceCount: 0,
          elapsedMs: 0,
          needsNetwork: false,
        },
        {
          id: 'ort',
          available: true,
          version: '97.0.0',
          command: [],
          status: 'ok',
          artifact: 'evaluation-result.json',
          // ORT exits 2 when it finds violations: a run that succeeded and
          // objected. The report says so without turning it into a failure.
          exitCode: 2,
          evidenceCount: 3,
          elapsedMs: 20,
          needsNetwork: true,
        },
      ],
      environment: { sandbox: 'subprocess-scratch-copy', network: 'denied', outputCapBytes: 20 },
    },
    evidence: [
      {
        id: 'EVT-1',
        source: {
          tool: 'trivy',
          version: '0.75.0',
          kind: 'vulnerability',
          identifier: 'CVE-2019-10744',
        },
        provenance: {
          executionId: 'run-1',
          command: [],
          config: {},
          repositoryRevision: 'abc',
          timestamp: '',
          executable: '',
          timeoutMs: 0,
          elapsedMs: 0,
        },
        claim: 'lodash is vulnerable',
        severity,
        severitySource: 'tool-native',
        confidence: 1,
        status: 'FAIL',
        location: { file: 'package-lock.json' },
        rawReference: {},
      },
    ],
    findings: [
      {
        id: 'FND-1',
        ruleId: 'TRIVY-VULN',
        title: 'Vulnerable dependency',
        claim: 'bump lodash',
        severity,
        confidence: 1,
        status: 'FAIL',
        evidenceIds: ['EVT-1'],
        remediation: 'upgrade',
        locations: [],
      },
    ],
  };
}
