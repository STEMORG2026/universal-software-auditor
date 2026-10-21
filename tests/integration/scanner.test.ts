import { describe, it, expect, vi } from 'vitest';
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

/** Options for the shared SARIF normaliser. */
function opts(): { tool: string; kind: string; adapterVersion: string } {
  return { tool: 'codeql', kind: 'dataflow-finding', adapterVersion: '2.27.3' };
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
    expect(row.source.identifier).toBe('no-a-to-b');
    expect(row.status).toBe('FAIL');
    expect(row.claim).toContain('a.js → b.js');
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

  it('parses the real capture (1.182.0, OSS engine)', () => {
    // The capture holds an absolute path, because semgrep was handed an
    // absolute target. The runner always scans a scratch copy, so the context
    // here stands in for that copy: the root the absolute path belongs to.
    const capture = JSON.parse(read('semgrep.json')) as {
      results: { path: string }[];
    };
    const root = path.dirname(capture.results[0]!.path);
    const context = ctx('1.182.0');
    context.target.workdir = root;
    const rows = semgrepAdapter.parse(read('semgrep.json'), context);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.source.kind).toBe('sast-finding');
    expect(row.source.identifier).toBe('sg-rules.js-eval-argv');
    // The evidence row names the file inside the project, not the scratch copy
    // it was found in.
    expect(row.location).toEqual({ file: 'app.js', line: 2 });
    expect(row.status).toBe('FAIL');
  });

  it('an empty results array is a run with no matches, not an unknown', () => {
    const rows = semgrepAdapter.parse(JSON.stringify({ results: [], errors: [] }), ctx());
    expect(rows).toEqual([]);
  });
});

describe('codeql adapter', () => {
  it('records the version without the sentence full stop', () => {
    // Measured: `codeql --version` prints "… release 2.27.3." and a `[\d.]+`
    // class records "2.27.3." in the manifest.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-codeql-'));
    fs.writeFileSync(
      path.join(dir, 'codeql'),
      '#!/bin/sh\necho "CodeQL command-line toolchain release 2.27.3."\n',
      { mode: 0o755 },
    );
    const stub = vi.spyOn(process, 'env', 'get').mockReturnValue({ PATH: dir } as never);
    try {
      expect(codeqlAdapter.probe().version).toBe('2.27.3');
    } finally {
      stub.mockRestore();
    }
  });

  it('the analyze leg is a documented, buildable command', () => {
    const argv = codeqlAnalyzeCommand('/tmp/db', 'codeql/javascript-queries', '/out.sarif');
    expect(argv.slice(0, 3)).toEqual(['codeql', 'database', 'analyze']);
    expect(argv[argv.length - 1]).toBe('--output=/out.sarif');
    expect(argv).toContain('--format=sarif-latest');
  });

  it('runs create then analyze, and reads the SARIF file analyze writes', () => {
    const cmd = codeqlAdapter.buildCommand(
      { path: '/r', workdir: '/r/w', revision: '', executionId: '' },
      codeqlAdapter.defaultConfig(),
    );
    // The adapter used to emit `database create` and parse stdout — a command
    // that writes a database, feeding a parser that expects SARIF. Nothing in
    // the pipeline could ever produce evidence.
    expect(cmd.prepare).toHaveLength(1);
    expect(cmd.prepare![0]!.argv.slice(0, 3)).toEqual(['codeql', 'database', 'create']);
    expect(cmd.argv.slice(0, 3)).toEqual(['codeql', 'database', 'analyze']);
    expect(cmd.artifacts).toEqual(['codeql-results.sarif']);
    // The SARIF must land inside the scan workdir or the runner cannot read it.
    expect(cmd.argv[cmd.argv.length - 1]).toBe('--output=/r/w/codeql-results.sarif');
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

  it('an empty packs setting omits the positional instead of passing one', () => {
    // Measured on 2.27.3: `database analyze <db> ''` is one empty *specifier*
    // and fails the whole run with `Invalid package specification:` and no
    // SARIF. With no specifier at all, CodeQL runs the default suite.
    const argv = codeqlAnalyzeCommand('/tmp/db', '', '/out.sarif');
    expect(argv).not.toContain('');
    expect(argv.slice(0, 4)).toEqual(['codeql', 'database', 'analyze', '/tmp/db']);
    expect(argv[4]).toBe('--format=sarif-latest');
    // A configured pack is passed as one specifier.
    expect(codeqlAnalyzeCommand('/tmp/db', 'codeql/javascript-queries', '/o')[4]).toBe(
      'codeql/javascript-queries',
    );
  });

  it('parses the real capture: two findings, severities from the rule defaults', () => {
    const rows = codeqlAdapter.parse(read('codeql.sarif.json'), ctx('2.27.3'));
    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((r) => [r.source.identifier, r]));
    // CodeQL omits `result.level` for every result; the level lives in the
    // rule's defaultConfiguration. Reading only the result turned an
    // error-severity finding into INFO.
    expect(byId.get('js/disabling-certificate-validation')!.severity).toBe('HIGH');
    expect(byId.get('js/insufficient-key-size')!.severity).toBe('MEDIUM');
    // The claim leads with the rule's human title, not with the id the source
    // field already carries.
    expect(byId.get('js/insufficient-key-size')!.claim).toMatch(
      /^Use of a weak cryptographic key: /,
    );
    // CodeQL reports a start line without a start column here; an absent
    // column stays absent rather than becoming 1.
    expect(byId.get('js/disabling-certificate-validation')!.location).toEqual({
      file: 'app.js',
      line: 1,
    });
    expect(byId.get('js/insufficient-key-size')!.location).toEqual({
      file: 'app.js',
      line: 3,
      column: 23,
    });
    // The CWE tags travel with the evidence: they are the join key to a
    // declared threat model.
    expect(byId.get('js/insufficient-key-size')!.cwes).toEqual(['CWE-326']);
    expect(byId.get('js/disabling-certificate-validation')!.cwes).toEqual(['CWE-295', 'CWE-297']);
  });
});

describe('SARIF normaliser', () => {
  it('maps levels as a policy, not by copying them', () => {
    expect(sarifLevelToSeverity('error')).toBe('HIGH');
    expect(sarifLevelToSeverity('warning')).toBe('MEDIUM');
    expect(sarifLevelToSeverity('note')).toBe('LOW');
    expect(sarifLevelToSeverity('garbage')).toBe('INFO');
  });

  it('a result with no level inherits the rule default (SARIF 3.27.10)', () => {
    // CodeQL omits `level` on every result. Without the fallback every finding
    // is INFO, which reads as "noticed, not important".
    const sarif = {
      runs: [
        {
          tool: {
            driver: {
              name: 't',
              rules: [{ id: 'r/error', defaultConfiguration: { level: 'error' } }],
            },
          },
          results: [{ ruleId: 'r/error', message: { text: 'm' } }],
        },
      ],
    };
    expect(evidenceFromSarif(JSON.stringify(sarif), opts())[0]!.severity).toBe('HIGH');
  });

  it('a result level wins over the rule default', () => {
    const sarif = {
      runs: [
        {
          tool: {
            driver: {
              name: 't',
              rules: [{ id: 'r/error', defaultConfiguration: { level: 'error' } }],
            },
          },
          results: [{ ruleId: 'r/error', level: 'note', message: { text: 'm' } }],
        },
      ],
    };
    expect(evidenceFromSarif(JSON.stringify(sarif), opts())[0]!.severity).toBe('LOW');
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

  it('--scanner selects, and an unknown id is a loud error rather than an empty run', () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-select-'));
    fs.writeFileSync(path.join(target, 'package.json'), '{"name":"t","version":"1.0.0"}');
    const runner = new ScannerRunner(scanners);
    const one = runner.run({ target, adapters: ['scorecard'] });
    expect(one.manifest.adapters.map((a) => a.id)).toEqual(['scorecard']);
    expect(() => runner.run({ target, adapters: ['nope'] })).toThrow(/unknown scanner: nope/);
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
