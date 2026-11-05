import { describe, it, expect } from 'vitest';
import { renderHtml, escapeHtml } from '../../src/report/html.js';
import { loadProfiles } from '../../src/engine/maturity.js';
import type { AuditReport, Finding } from '../../src/types.js';

const finding = (over: Partial<Finding>): Finding => ({
  ruleId: 'X-001',
  title: 'A finding',
  section: 'S2',
  sectionTitle: 'Security',
  severity: 'HIGH',
  baseSeverity: 'HIGH',
  status: 'MISSING',
  ruleClass: 'security',
  dampened: false,
  message: 'Not detected.',
  locations: [],
  ...over,
});

const baseReport = (findings: Finding[]): AuditReport => ({
  schema: 'usa-report-v1',
  generatedAt: '2026-09-08T00:00:00.000Z',
  usaVersion: '1.0.0',
  ruleset: 'test-ruleset',
  target: { path: '/tmp/proj', name: 'proj' },
  detection: {
    maturity: 'beta',
    maturitySignals: [],
    projectTypes: [],
    platforms: [],
    languages: [],
    frameworks: [],
    packageManagers: [],
    databases: [],
    flags: [],
    metrics: {},
  },
  options: {
    depth: 'standard',
    profile: 'auto',
    rulesDir: 'rules',
    packsLoaded: [],
    packsSkipped: [],
  },
  score: {
    overall: 71.4,
    sections: [
      {
        id: 'S2',
        title: 'Security',
        score: 6.2,
        weight: 1.7,
        applicable: 4,
        resolved: 3,
        passed: 2,
        failed: 1,
        unknown: 1,
        confidence: 75,
      },
    ],
    counts: {
      PASS: 2,
      FAIL: 0,
      WRONG: 0,
      MISSING: 1,
      DEPRECATED: 0,
      EXPERIMENTAL: 0,
      UNKNOWN: 1,
      NOT_APPLICABLE: 0,
    },
    severityCounts: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0, FUTURE: 0 },
    automationCoverage: 75,
    expectedBand: [60, 85],
  },
  findings,
});

const profile = loadProfiles('rules').beta;

describe('renderHtml (--format html)', () => {
  it('renders a self-contained page with score, sections, and findings', () => {
    const html = renderHtml(
      baseReport([
        finding({ ruleId: 'SEC-001', title: 'No hardcoded credentials' }),
        finding({ ruleId: 'SEC-015', status: 'UNKNOWN', title: 'Needs a human' }),
      ]),
      profile,
    );
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toMatch(/71\.4 \/ 100 · [\d.]+% verified/);
    expect(html).toContain('SEC-001');
    expect(html).toContain('S2 · Security');
    expect(html).toContain('Needs a human');
    expect(html.trimEnd()).toMatch(/<\/html>$/);
  });

  it('has no scripts and escapes hostile finding text', () => {
    const html = renderHtml(
      baseReport([
        finding({
          ruleId: 'X-002',
          title: '<script>alert(1)</script>',
          message: 'See"><img src=x onerror=alert(2)>',
          locations: [{ file: 'a&b"c.js', line: 3 }],
          remediation: "Run 'cleanup' & verify",
        }),
      ]),
      profile,
    );
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a&amp;b&quot;c.js');
    expect(html).toContain('&#39;cleanup&#39; &amp; verify');
  });

  it('is deterministic: two renders are byte-identical', () => {
    const report = baseReport([finding({})]);
    expect(renderHtml(report, profile)).toBe(renderHtml(report, profile));
  });

  it('escapeHtml covers both element and attribute contexts', () => {
    expect(escapeHtml('<a href="x">y&z\'q\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;y&amp;z&#39;q&#39;&lt;/a&gt;',
    );
  });
});
