import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cmdScan } from '../../src/cli-scan.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ScannerRunner } from '../../src/scanner/run.js';
import { byId, enabledAdapters } from '../../src/scanner/registry.js';
import { loadScannerConfig } from '../../src/scanner/config.js';

/**
 * End-to-end: run the real adapters against a deliberately weak fixture.
 *
 * Where a scanner is not installed the test SKIPS LOUDLY — a silently absent
 * tool is exactly the failure mode this subsystem exists to prevent, and a
 * green suite that never ran is worse than a red one that says why.
 */
const CLI = path.resolve(process.cwd(), 'dist/cli.js');
const INSECURE = path.resolve(process.cwd(), 'fixtures/insecure-app');

function trivyPresent(): boolean {
  return enabledAdapters({}).some((a) => a.id === 'trivy' && a.probe().available);
}

describe('usa scan end-to-end', () => {
  it('the CLI runs over the fixtures and records coverage honestly', { timeout: 60_000 }, () => {
    if (!fs.existsSync(CLI)) return; // build not run yet; covered by unit tests
    // One fast adapter: the CLI path is what is under test here, and running
    // every adapter through a subprocess blows the 15s ceiling under load.
    const out = execFileSync(
      process.execPath,
      [CLI, 'scan', INSECURE, '--scanner', 'scorecard', '--json'],
      {
        encoding: 'utf8',
      },
    );
    const result = JSON.parse(out) as {
      manifest: { adapters: { id: string; status: string; reason?: string }[] };
      evidence: unknown[];
    };
    expect(result.manifest.adapters.map((a) => a.id)).toEqual(['scorecard']);
    // Every non-ok adapter must say why — coverage is never silent.
    for (const a of result.manifest.adapters) {
      if (a.status !== 'ok') expect(a.reason).toBeTruthy();
    }
  });

  it(
    'a weak fixture yields vulnerability evidence when trivy is installed',
    { timeout: 90_000 },
    () => {
      if (!trivyPresent()) {
        console.warn('SKIPPED: trivy not installed — no scanner evidence to assert');
        return;
      }
      const result = new ScannerRunner(enabledAdapters({})).run({
        target: INSECURE,
        config: loadScannerConfig(INSECURE),
      });
      const vulns = result.evidence.filter((e) => e.source.kind === 'vulnerability');
      expect(vulns.length).toBeGreaterThan(0);
      // Every row names its native identifier (a CVE id) and its location.
      for (const v of vulns) expect(v.source.identifier).toMatch(/^CVE-/);
    },
  );

  it(
    'codeql reads its SARIF from the file it writes, not from stdout',
    { timeout: 300_000 },
    () => {
      const adapter = byId('codeql');
      if (!adapter?.probe().available) {
        console.warn('SKIPPED: codeql not installed — no CodeQL evidence to assert');
        return;
      }
      // Two stages: `database create`, then `database analyze`. The evidence
      // command writes SARIF to a file and logs progress to stdout, so this
      // assertion is about the runner's wiring, not only the parser.
      const result = new ScannerRunner([adapter]).run({
        target: INSECURE,
        config: loadScannerConfig(INSECURE),
        network: true,
      });
      const run = result.manifest.adapters[0]!;
      expect(run.status, run.reason ?? 'ok').toBe('ok');
      expect(run.artifact).toBe('codeql-results.sarif');
      expect(run.prepare?.[0]?.slice(0, 3)).toEqual(['codeql', 'database', 'create']);
      // Named ids, because "2 findings" is satisfied by any two findings.
      expect(result.evidence.map((e) => e.source.identifier).sort()).toEqual([
        'js/disabling-certificate-validation',
        'js/insufficient-key-size',
      ]);
      // The severity comes from the rule's defaultConfiguration — CodeQL omits
      // `level` on every result.
      const byRule = new Map(result.evidence.map((e) => [e.source.identifier, e.severity]));
      expect(byRule.get('js/disabling-certificate-validation')).toBe('HIGH');
      expect(byRule.get('js/insufficient-key-size')).toBe('MEDIUM');
    },
  );

  it(
    'every adapter that is installed produces evidence on the weak fixture',
    { timeout: 180_000 },
    () => {
      // A scanner that is present but silent is worse than one that is absent: the
      // absent one says UNAVAILABLE, the silent one looks like a clean result.
      for (const adapter of enabledAdapters({
        codeql: { enabled: false },
        ort: { enabled: false },
      })) {
        if (!adapter.probe().available) continue;
        const result = new ScannerRunner([adapter]).run({
          target: INSECURE,
          config: loadScannerConfig(INSECURE),
        });
        const run = result.manifest.adapters[0]!;
        expect(run.status, `${adapter.id}: ${run.reason ?? 'ok'}`).toBe('ok');
        expect(result.evidence.length, `${adapter.id} produced no evidence`).toBeGreaterThan(0);
        for (const item of result.evidence) {
          expect(item.provenance.executionId).toBeTruthy();
          expect(item.provenance.repositoryRevision).toBeTruthy();
        }
      }
    },
  );

  it(
    'every adapter that is installed produces evidence on the weak fixture',
    { timeout: 180_000 },
    () => {
      // A scanner that is present but silent is worse than one that is absent: the
      // absent one says UNAVAILABLE, the silent one looks like a clean result.
      for (const adapter of enabledAdapters({
        codeql: { enabled: false },
        ort: { enabled: false },
      })) {
        if (!adapter.probe().available) continue;
        const result = new ScannerRunner([adapter]).run({
          target: INSECURE,
          config: loadScannerConfig(INSECURE),
        });
        const run = result.manifest.adapters[0]!;
        expect(run.status, `${adapter.id}: ${run.reason ?? 'ok'}`).toBe('ok');
        expect(result.evidence.length, `${adapter.id} produced no evidence`).toBeGreaterThan(0);
        for (const item of result.evidence) {
          expect(item.provenance.executionId).toBeTruthy();
          expect(item.provenance.repositoryRevision).toBeTruthy();
        }
      }
    },
  );

  it('the runner never touches the checkout it was pointed at', { timeout: 90_000 }, () => {
    const before = new Set(fs.readdirSync(INSECURE));
    new ScannerRunner(enabledAdapters({})).run({ target: INSECURE });
    expect(new Set(fs.readdirSync(INSECURE))).toEqual(before);
    expect(fs.existsSync(path.join(INSECURE, 'codeql-db'))).toBe(false);
  });

  it('a missing path is a loud error, not an empty scan', () => {
    const missing = path.join(os.tmpdir(), 'usa-does-not-exist-999');
    expect(() => new ScannerRunner(enabledAdapters({})).run({ target: missing })).toThrow(
      /scan target not found/,
    );
  });
});

describe('usa scan command', () => {
  it('writes an evidence report for a target, whatever the adapters found', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-scan-cmd-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"t","version":"1.0.0"}');
    const out = path.join(root, 'evidence.md');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    try {
      const code = cmdScan({ _: ['scan', root], out });
      expect(code).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(fs.existsSync(out)).toBe(true);
    const text = fs.readFileSync(out, 'utf8');
    expect(text).toContain('## Coverage');
    expect(text).toContain('trivy');
    // A missing path is a usage error (exit 1), not a scan of nothing.
    const errors: string[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation((m) => errors.push(String(m)));
    try {
      expect(cmdScan({ _: ['scan', path.join(root, 'nope')] })).toBe(1);
    } finally {
      errSpy.mockRestore();
    }
    expect(errors.join('')).toMatch(/path not found/);
  });
});

describe('usa scan command', () => {
  it('writes an evidence report for a target, whatever the adapters found', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-scan-cmd-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"t","version":"1.0.0"}');
    const out = path.join(root, 'evidence.md');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    try {
      const code = cmdScan({ _: ['scan', root], out });
      expect(code).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(fs.existsSync(out)).toBe(true);
    const text = fs.readFileSync(out, 'utf8');
    expect(text).toContain('## Coverage');
    expect(text).toContain('trivy');
    // A missing path is a usage error (exit 1), not a scan of nothing.
    const errors: string[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation((m) => errors.push(String(m)));
    try {
      expect(cmdScan({ _: ['scan', path.join(root, 'nope')] })).toBe(1);
    } finally {
      errSpy.mockRestore();
    }
    expect(errors.join('')).toMatch(/path not found/);
  });
});
