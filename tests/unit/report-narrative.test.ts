import { describe, it, expect } from 'vitest';
import { renderNarrative } from '../../src/report/narrative.js';
import { parseTrailer } from '../../src/report/markdown.js';
import { loadProfiles } from '../../src/engine/maturity.js';
import type { AuditReport, Finding } from '../../src/types.js';

const profile = loadProfiles('rules').prototype;

const finding = (over: Partial<Finding>): Finding => ({
  ruleId: 'X-001',
  title: 'A finding',
  section: 'S2',
  sectionTitle: 'Security',
  severity: 'HIGH',
  baseSeverity: 'HIGH',
  status: 'FAIL',
  ruleClass: 'security',
  dampened: false,
  message: 'Not detected.',
  locations: [],
  ...over,
});

const baseReport = (
  findings: Finding[],
  sections: AuditReport['score']['sections'] = [],
): AuditReport => ({
  schema: 'usa-report-v1',
  generatedAt: '2026-01-01T00:00:00.000Z',
  usaVersion: '2.6.0',
  ruleset: 'test-ruleset',
  target: { path: '/tmp/demo-app', name: 'demo-app', commit: 'abc123456', ref: 'main' },
  detection: {
    maturity: 'prototype',
    maturitySignals: [],
    projectTypes: ['api'],
    platforms: ['server'],
    languages: ['javascript'],
    frameworks: ['express'],
    packageManagers: ['npm'],
    databases: ['mysql'],
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
    overall: 37.3,
    sections,
    counts: {
      PASS: 0,
      FAIL: 0,
      WRONG: 0,
      MISSING: 0,
      DEPRECATED: 0,
      EXPERIMENTAL: 0,
      UNKNOWN: 0,
      NOT_APPLICABLE: 0,
    },
    severityCounts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, FUTURE: 0 },
    automationCoverage: 73.8,
    expectedBand: [30, 65],
  },
  findings,
});

const section = (id: string, score: number | null, confidence: number) => ({
  id,
  title: id,
  score,
  weight: 1,
  applicable: 4,
  resolved: score === null ? 0 : 2,
  passed: 1,
  failed: 1,
  unknown: 1,
  confidence,
});

describe('narrative renderer', () => {
  it('renders a verdict instead of leading with the score', () => {
    const md = renderNarrative(
      baseReport(
        [finding({ status: 'FAIL', severity: 'CRITICAL', baseSeverity: 'CRITICAL' })],
        [section('S2', 3, 90)],
      ),
      profile,
    );
    expect(md).toContain('## Verdict');
    expect(md).toContain('🔴 RED');
    expect(md).toMatch(/37\.3 \/ 100 · [\d.]+% verified/);
    expect(md.indexOf('## Verdict')).toBeLessThan(md.indexOf('## The foundation'));
  });

  it('declares a pass when nothing is open', () => {
    const md = renderNarrative(
      baseReport([finding({ status: 'PASS' })], [section('S2', 10, 95)]),
      profile,
    );
    expect(md).toContain('PASS');
    expect(md).not.toContain('RED');
  });

  it('groups foundation findings by pillar tag', () => {
    const md = renderNarrative(
      baseReport([
        finding({
          ruleId: 'FND-001',
          title: 'README',
          section: 'S3',
          status: 'PASS',
          severity: 'MEDIUM',
          baseSeverity: 'MEDIUM',
          ruleClass: 'documentation',
          tags: ['pillar:docs'],
        }),
        finding({
          ruleId: 'FND-002',
          title: 'LICENSE',
          section: 'S3',
          status: 'MISSING',
          severity: 'FUTURE',
          baseSeverity: 'MEDIUM',
          ruleClass: 'compliance',
          tags: ['pillar:docs'],
          dampened: true,
        }),
        finding({
          ruleId: 'FND-003',
          title: 'CODEOWNERS',
          section: 'S3',
          status: 'MISSING',
          severity: 'FUTURE',
          baseSeverity: 'MEDIUM',
          ruleClass: 'compliance',
          tags: ['pillar:governance'],
          dampened: true,
        }),
      ]),
      profile,
    );
    expect(md).toContain('| Docs | 1/2 | 🟡 partial |');
    expect(md).toContain('| Governance | 0/1 | 🔴 missing |');
    expect(md).toContain('Foundation readiness:');
  });

  it('marks a null-scored section NOT ASSESSED', () => {
    const md = renderNarrative(baseReport([], [section('S9', null, 0)]), profile);
    expect(md).toContain('NOT ASSESSED');
  });

  it('never prints a perfect score at low confidence', () => {
    const md = renderNarrative(
      baseReport([], [section('S10', 10, 25), section('S12', 10, 25)]),
      profile,
    );
    expect(md).toContain('INSUFFICIENT EVIDENCE');
    expect(md).toContain('~~10/10~~');
    expect(md).toContain('2.5 of an unknown possible 10');
  });

  it('discloses safety downgrades separately from process deferrals', () => {
    const safety = finding({
      ruleId: 'SEC-006',
      title: 'No eval',
      severity: 'MEDIUM',
      baseSeverity: 'HIGH',
      dampened: true,
      ruleClass: 'security',
      status: 'FAIL',
    });
    const process = finding({
      ruleId: 'REPO-005',
      title: 'LICENSE',
      severity: 'LOW',
      baseSeverity: 'HIGH',
      dampened: true,
      ruleClass: 'compliance',
      status: 'MISSING',
    });
    const md = renderNarrative(baseReport([safety, process]), profile);
    expect(md).toContain('Safety findings downgraded');
    expect(md).toContain('SEC-006');
    expect(md).toContain('HIGH → MEDIUM');
    expect(md).toContain('Process findings deferred');
  });

  it('sequences the roadmap by declared severity, not dampened severity', () => {
    const evalFinding = finding({
      ruleId: 'SEC-006',
      title: 'No eval',
      severity: 'MEDIUM',
      baseSeverity: 'HIGH',
      dampened: true,
      ruleClass: 'security',
      status: 'FAIL',
    });
    const md = renderNarrative(baseReport([evalFinding]), profile);
    const today = md.indexOf('Today — stop the bleeding');
    const week = md.indexOf('This week — make it reproducible');
    expect(today).toBeGreaterThan(-1);
    expect(week).toBeGreaterThan(-1);
    // Declared-HIGH security belongs in "today", never hidden by the downgrade.
    expect(md.slice(today, week)).toContain('SEC-006');
  });

  it('embeds a machine-readable trailer that round-trips', () => {
    const md = renderNarrative(
      baseReport(
        [
          finding({
            ruleId: 'SEC-005',
            status: 'WRONG',
            severity: 'CRITICAL',
            baseSeverity: 'CRITICAL',
          }),
        ],
        [section('S2', 4.9, 92.9)],
      ),
      profile,
    );
    const raw = parseTrailer(md);
    expect(raw).toContain('schema: usa-report-v1');
    expect(raw).toContain('"SEC-005": {status: WRONG');
  });

  it('is deterministic', () => {
    const report = baseReport([finding({ status: 'FAIL' })], [section('S2', 3, 90)]);
    expect(renderNarrative(report, profile)).toBe(renderNarrative(report, profile));
  });

  it('lists the tools the engine did not run', () => {
    const md = renderNarrative(baseReport([]), profile);
    expect(md).toContain('What this audit did not check');
    expect(md).toContain('Reachability');
    expect(md).toContain('SBOM');
  });
});
