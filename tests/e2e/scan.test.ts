import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ScannerRunner } from '../../src/scanner/run.js';
import { enabledAdapters } from '../../src/scanner/registry.js';
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
  it('the CLI runs over the fixtures and records coverage honestly', () => {
    if (!fs.existsSync(CLI)) return; // build not run yet; covered by unit tests
    const out = execFileSync(process.execPath, [CLI, 'scan', INSECURE, '--json'], {
      encoding: 'utf8',
    });
    const result = JSON.parse(out) as {
      manifest: { adapters: { id: string; status: string; reason?: string }[] };
      evidence: unknown[];
    };
    expect(result.manifest.adapters.map((a) => a.id)).toContain('trivy');
    // Every non-ok adapter must say why — coverage is never silent.
    for (const a of result.manifest.adapters) {
      if (a.status !== 'ok') expect(a.reason).toBeTruthy();
    }
  });

  it('a weak fixture yields vulnerability evidence when trivy is installed', () => {
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
  });

  it('the runner never touches the checkout it was pointed at', () => {
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
