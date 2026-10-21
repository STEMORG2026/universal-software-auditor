import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { trivyAdapter } from '../../src/scanner/adapters/trivy.js';
import { dependencyCruiserAdapter } from '../../src/scanner/adapters/dependency-cruiser.js';
import { semgrepAdapter } from '../../src/scanner/adapters/semgrep.js';
import { codeqlAdapter, codeqlAnalyzeCommand } from '../../src/scanner/adapters/codeql.js';
import { evidenceFromSarif, sarifLevelToSeverity } from '../../src/scanner/sarif.js';
import { evidenceId } from '../../src/scanner/identity.js';
import { ScannerRunner } from '../../src/scanner/run.js';
import { enabledAdapters, scanners, DEFAULT_DISABLED } from '../../src/scanner/registry.js';
import type { ParseContext, ScannerAdapter, ScanTarget } from '../../src/scanner/types.js';

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/scanners');
const read = (file: string): string => fs.readFileSync(path.join(FIXTURES, file), 'utf8');

function ctx(adapterVersion = '0.75.0'): ParseContext {
  return {
    adapterId: 'test',
    adapterVersion,
    target: { path: '/x', workdir: '/x/w', revision: 'abc123', executionId: 'e1' },
    config: {},
  };
}

describe('evidence identity', () => {
  const source = { tool: 'trivy', version: '0.75.0', kind: 'vulnerability', identifier: 'CVE-1' };
  const location = { file: 'package-lock.json' };

  it('is the same claim twice → the same id (dedup and trending)', () => {
    const a = evidenceId(source, location, 'lodash 1.0.0 is vulnerable to CVE-1');
    const b = evidenceId(source, location, 'lodash 1.0.0 is vulnerable to CVE-1');
    expect(a).toBe(b);
  });

  it('a different claim, tool or location → a different id', () => {
    const base = evidenceId(source, location, 'same claim');
    expect(evidenceId({ ...source, identifier: 'CVE-2' }, location, 'same claim')).not.toBe(base);
    expect(evidenceId(source, { file: 'other.json' }, 'same claim')).not.toBe(base);
    expect(evidenceId(source, location, 'other claim')).not.toBe(base);
  });
});

describe('trivy adapter', () => {
  it('buildCommand pins the argv, including --exit-code 0 so findings never look like a crash', () => {
    const target: ScanTarget = {
      path: '/repo',
      workdir: '/repo/w',
      revision: 'abc',
      executionId: 'e',
    };
    const argv = trivyAdapter.buildCommand(target, trivyAdapter.defaultConfig()).argv;
    expect(argv.slice(0, 2)).toEqual(['trivy', 'fs']);
    expect(argv).toContain('--format');
    expect(argv).toContain('json');
    // Exit status is never the verdict: a findings-rich scan must not exit 1.
    const at = argv.indexOf('--exit-code');
    expect(argv[at + 1]).toBe('0');
    expect(argv[argv.length - 1]).toBe('/repo/w');
  });

  it('parses the real fixture into deterministic evidence', () => {
    const rows = trivyAdapter.parse(read('trivy.json'), ctx());
    expect(rows).toHaveLength(2);
    const first = rows[0]!;
    expect(first.source.tool).toBe('trivy');
    expect(first.source.identifier).toBe('CVE-2019-10744');
    expect(first.source.version).toBe('0.75.0');
    expect(first.severity).toBe('CRITICAL');
    expect(first.status).toBe('FAIL');
    expect(first.location).toEqual({ file: 'package-lock.json' });
    expect(first.claim).toContain('fixed in 4.17.12');
    expect(first.confidence).toBe(1.0);
    // Ids are content-derived, so two runs agree.
    expect(first.id).toBe(trivyAdapter.parse(read('trivy.json'), ctx())[0]!.id);
  });

  it('an empty report is UNKNOWN, not "nothing found"', () => {
    const rows = trivyAdapter.parse(JSON.stringify({ SchemaVersion: 2 }), ctx());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('UNKNOWN');
    expect(rows[0]!.claim).toMatch(/nothing scanned/i);
  });

  it('garbage output is UNKNOWN, never a throw', () => {
    const rows = trivyAdapter.parse('<html>not json</html>', ctx());
    expect(rows[0]!.status).toBe('UNKNOWN');
  });
});

describe('dependency-cruiser adapter', () => {
  it('buildCommand asks for JSON (the reporter that exits 0 regardless of violations)', () => {
    const target: ScanTarget = { path: '/r', workdir: '/r/w', revision: '', executionId: '' };
    const argv = dependencyCruiserAdapter.buildCommand(
      target,
      dependencyCruiserAdapter.defaultConfig(),
    ).argv;
    expect(argv.slice(0, 1)).toEqual(['depcruise']);
    expect(argv[argv.indexOf('--output-type') + 1]).toBe('json');
  });

  it('parses violations into edge evidence', () => {
    const rows = dependencyCruiserAdapter.parse(read('dependency-cruiser.json'), ctx('16.0.0'));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.source.kind).toBe('dependency-edge');
    expect(row.source.identifier).toBe('no-bottom-to-top');
    expect(row.status).toBe('FAIL');
    expect(row.claim).toContain('src/util/glob.ts → src/engine/audit.ts');
  });

  it('a rule-less cruise is UNKNOWN — "0 violations" would be unfalsifiable', () => {
    const rows = dependencyCruiserAdapter.parse(
      JSON.stringify({ modules: [{ source: 'a.ts' }] }),
      ctx('16.0.0'),
    );
    expect(rows[0]!.status).toBe('UNKNOWN');
    expect(rows[0]!.claim).toMatch(/rules config/i);
  });
});

describe('semgrep adapter', () => {
  it('vendored rules mean offline; registry default needs network and never passes --error', () => {
    const target: ScanTarget = { path: '/r', workdir: '/r/w', revision: '', executionId: '' };
    const offline = semgrepAdapter.buildCommand(target, { rules: 'rules/' });
    expect(offline.network).toBeFalsy();
    expect(offline.argv).toContain('rules/');
    expect(offline.argv).not.toContain('--error');

    const online = semgrepAdapter.buildCommand(target, { rules: '' });
    expect(online.network).toBe(true);
  });

  it('parses [UNVERIFIED] fixture rows', () => {
    const rows = semgrepAdapter.parse(read('semgrep.json'), ctx('1.90.0'));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.source.kind).toBe('sast-finding');
    expect(row.source.identifier).toContain('detect-eval');
    expect(row.location).toEqual({ file: 'app.js', line: 2 });
    expect(row.status).toBe('FAIL');
  });

  it('an empty results array is a run with no matches, not an unknown', () => {
    const rows = semgrepAdapter.parse(JSON.stringify({ results: [], errors: [] }), ctx());
    expect(rows).toEqual([]);
  });
});

describe('codeql adapter', () => {
  it('the analyze leg is a documented, buildable command', () => {
    const argv = codeqlAnalyzeCommand('/tmp/db', 'codeql/javascript-queries', '/out.sarif');
    expect(argv.slice(0, 3)).toEqual(['codeql', 'database', 'analyze']);
    expect(argv[argv.length - 1]).toBe('--output=/out.sarif');
    expect(argv).toContain('--format=sarif-latest');
  });

  it('refuses to emit a build command on its own authority', () => {
    expect(() =>
      codeqlAdapter.buildCommand(
        { path: '/r', workdir: '/r/w', revision: '', executionId: '' },
        {
          allowBuildCommands: true,
        },
      ),
    ).toThrow(/allowBuildCommands/);
  });

  it('parses its SARIF output into located evidence', () => {
    const rows = codeqlAdapter.parse(read('codeql.sarif.json'), ctx('2.23.0'));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.source.identifier).toBe('js/insecure-eval');
    expect(row.location).toEqual({ file: 'app.js', line: 2, column: 1 });
    expect(row.severity).toBe('HIGH');
    expect(row.status).toBe('FAIL');
  });
});

describe('SARIF normaliser', () => {
  it('maps levels as a policy, not by copying them', () => {
    expect(sarifLevelToSeverity('error')).toBe('HIGH');
    expect(sarifLevelToSeverity('warning')).toBe('MEDIUM');
    expect(sarifLevelToSeverity('note')).toBe('LOW');
    expect(sarifLevelToSeverity('garbage')).toBe('INFO');
  });

  it('a missing region is no location, not a zero location', () => {
    const rows = evidenceFromSarif(
      JSON.stringify({
        runs: [
          {
            tool: { driver: { name: 'X', rules: [] } },
            results: [{ ruleId: 'r1', level: 'note', message: { text: 'm' }, locations: [{}] }],
          },
        ],
      }),
      { tool: 'x', kind: 'k', adapterVersion: '1' },
    );
    expect(rows[0]!.location).toBeNull();
  });
});

describe('registry', () => {
  it('codeql is disabled by default (too heavy for a plain scan)', () => {
    expect(DEFAULT_DISABLED.has('codeql')).toBe(true);
    expect(enabledAdapters({}).map((a) => a.id)).not.toContain('codeql');
  });

  it('a config can switch codeql on', () => {
    expect(enabledAdapters({ codeql: { enabled: true } }).map((a) => a.id)).toContain('codeql');
  });

  it('every registered adapter can probe without throwing', () => {
    for (const adapter of scanners) expect(() => adapter.probe()).not.toThrow();
  });
});

describe('runner policy', () => {
  it('an unavailable tool is recorded as UNAVAILABLE, never as a silent skip', () => {
    const adapter: ScannerAdapter = {
      id: 'ghost',
      name: 'absent on purpose',
      defaultConfig: () => ({}),
      probe: () => ({ available: false, version: '', reason: 'not installed' }),
      buildCommand: () => ({ argv: ['ghost'] }),
      parse: () => [],
    };
    const result = new ScannerRunner([adapter]).run({ target: makeTarget() });
    expect(result.evidence).toEqual([]);
    expect(result.manifest.adapters[0]).toMatchObject({
      status: 'unavailable',
      reason: 'not installed',
    });
  });

  it('a tool that hangs becomes a timeout, not a crash', () => {
    const adapter: ScannerAdapter = {
      id: 'sleeper',
      name: 'sleeps past its budget',
      defaultConfig: () => ({}),
      probe: () => ({ available: true, version: '1' }),
      buildCommand: () => ({
        argv: [process.execPath, '-e', 'setTimeout(()=>{}, 60000)'],
        timeoutMs: 500,
      }),
      parse: () => [],
    };
    const result = new ScannerRunner([adapter]).run({ target: makeTarget() });
    expect(result.manifest.adapters[0]!.status).toBe('timeout');
    expect(result.manifest.adapters[0]!.reason).toMatch(/timed out after 500ms/);
  });
});

function makeTarget(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'usa-scan-test-'));
}
