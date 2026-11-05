import { describe, it, expect } from 'vitest';
import { renderMarkdown, parseTrailer } from '../../src/report/markdown.js';
import { renderJson, toJsonReport } from '../../src/report/json.js';
import { renderSarif, toSarif } from '../../src/report/sarif.js';
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
  target: { path: '/tmp/proj', name: 'proj', commit: 'abc1234567890', ref: 'main' },
  detection: {
    maturity: 'beta',
    maturitySignals: ['+1 CI configured', 'maturity score 5.0/7.5 → beta'],
    projectTypes: ['api'],
    platforms: ['server'],
    languages: ['typescript'],
    frameworks: ['express'],
    packageManagers: ['npm'],
    databases: ['postgres'],
    flags: ['has:ci', 'has:tests'],
    metrics: { commits: 42, contributors: 3, tags: 2, branches: 2, files: 120 },
  },
  options: {
    depth: 'standard',
    profile: 'auto',
    rulesDir: 'rules',
    packsLoaded: ['core/security'],
    packsSkipped: ['stacks/solidity'],
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

describe('markdown report', () => {
  it('renders the headline score and the expected band', () => {
    const md = renderMarkdown(baseReport([finding({})]), profile);
    // Score and coverage are one token by design (USA-AUD-006).
    expect(md).toMatch(/Overall Health Score: \*\*71\.4 \/ 100 · [\d.]+% verified\*\*/);
    expect(md).toContain('Expected band for **Beta / Growing**');
  });

  it('puts CRITICAL findings under Immediate Action Required', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          ruleId: 'SEC-001',
          severity: 'CRITICAL',
          status: 'FAIL',
          title: 'Hardcoded key',
        }),
      ]),
      profile,
    );
    const idx = md.indexOf('Immediate Action Required');
    expect(idx).toBeGreaterThan(-1);
    expect(md.slice(idx, idx + 600)).toContain('SEC-001');
  });

  it('renders locations as file:line', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          status: 'WRONG',
          locations: [{ file: 'src/config.ts', line: 14, excerpt: 'const k = "abc"' }],
        }),
      ]),
      profile,
    );
    expect(md).toContain('`src/config.ts:14`');
  });

  it('shows when a finding was downgraded by the maturity profile', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          severity: 'LOW',
          baseSeverity: 'HIGH',
          dampened: true,
          ruleClass: 'documentation',
        }),
      ]),
      loadProfiles('rules').prototype,
    );
    expect(md).toContain('Downgraded HIGH → LOW');
  });

  it('renders the judgement queue with evidence prompts', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          ruleId: 'SEC-015',
          status: 'UNKNOWN',
          title: 'Authorization per resource',
          why: 'IDOR is invisible to linters.',
          evidenceHint: 'file:line of the ownership check',
        }),
      ]),
      profile,
    );
    expect(md).toContain('Judgement Queue');
    expect(md).toContain('file:line of the ownership check');
  });

  it('splits the judgement queue into assisted and reasoning sections', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          ruleId: 'DEP-002',
          status: 'UNKNOWN',
          automatability: 'assist',
          title: 'Dependency audit',
        }),
        finding({
          ruleId: 'SEC-015',
          status: 'UNKNOWN',
          automatability: 'manual',
          title: 'Authorization per resource',
        }),
      ]),
      profile,
    );
    expect(md).toContain('Assisted — the tool settles these once');
    expect(md).toContain('Judgement — reasoning required');
    expect(md).toContain('**1** the tool can settle once allowed');
    expect(md).toContain('**1** need reasoning');
  });

  it('shows last-reviewed provenance and marks an overdue review', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          ruleId: 'SEC-015',
          status: 'UNKNOWN',
          review: { reviewed: '2020-01-01', until: '2020-02-01' },
        }),
      ]),
      profile,
    );
    expect(md).toContain('Last reviewed');
    expect(md).toContain('2020-01-01');
    expect(md).toContain('overdue');
  });

  it('shows review coverage per section, excluding non-judgement findings', () => {
    const report = baseReport([
      finding({
        ruleId: 'SEC-015',
        section: 'S2',
        status: 'UNKNOWN',
        review: { reviewed: '2026-09-01' },
      }),
      finding({ ruleId: 'SEC-016', section: 'S2', status: 'UNKNOWN' }),
    ]);
    const md = renderMarkdown(report, profile);
    const row = md.split('\n').find((l) => l.includes('S2 · Security'))!;
    expect(row).toContain('1/2 recorded');
  });

  it('lists suppressed findings under Accepted Risk', () => {
    const md = renderMarkdown(
      baseReport([finding({ suppressedReason: 'Accepted: admin-only, 40 rows' })]),
      profile,
    );
    expect(md).toContain('Accepted Risk');
    expect(md).toContain('Accepted: admin-only, 40 rows');
  });

  it('shows a Where column for site-level suppressed findings', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          suppressedReason: 'Vendored legacy script',
          locations: [{ file: 'scripts/legacy/old.js', line: 7 }],
        }),
      ]),
      profile,
    );
    expect(md).toContain('| Where |');
    expect(md).toContain('scripts/legacy/old.js:7');
  });

  it('shows "not verified" for sections nothing could resolve', () => {
    const report = baseReport([]);
    report.score.sections = [
      {
        id: 'S16',
        title: 'Future Readiness',
        score: null,
        weight: 0.4,
        applicable: 3,
        resolved: 0,
        passed: 0,
        failed: 0,
        unknown: 3,
        confidence: 0,
      },
    ];
    const md = renderMarkdown(report, profile);
    expect(md).toContain('— not verified');
  });

  it('embeds a machine-readable trailer that round-trips', () => {
    const report = baseReport([finding({ ruleId: 'SEC-001', status: 'PASS' })]);
    const md = renderMarkdown(report, profile);
    expect(md).toContain('<!-- USA:TRAILER:BEGIN -->');
    const raw = parseTrailer(md);
    expect(raw).not.toBeNull();
    expect(raw).toContain('schema: usa-report-v1');
    expect(raw).toContain('overall: 71.4');
    // Rule IDs are YAML-quoted: pack-author-controlled keys must not corrupt
    // the machine-parsed trailer (colons, hashes, newlines, fences).
    expect(raw).toContain('"SEC-001": {status: PASS');
  });

  it('quotes hostile rule IDs in the trailer so the YAML stays valid', () => {
    const report = baseReport([finding({ ruleId: 'X\n```\nY: #', status: 'FAIL' })]);
    const md = renderMarkdown(report, profile);
    const raw = parseTrailer(md);
    expect(raw).not.toBeNull();
    expect(raw).toContain('"X\\n```\\nY: #": {status: FAIL');
  });

  it('escapes pipes in table cells', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          ruleId: 'X-1',
          status: 'UNKNOWN',
          title: 'A | B',
          why: 'either | or',
          evidenceHint: 'one | two',
        }),
      ]),
      profile,
    );
    expect(md).toContain('A \\| B');
  });

  // Escaping `|` without escaping `\\` first lets an input backslash become an
  // escape for the next character (CodeQL: incomplete multi-character escaping).
  // This runs on the judgement-queue table, where rule text is a cell value.
  it('escapes backslashes before pipes in table cells', () => {
    const md = renderMarkdown(
      baseReport([
        finding({
          status: 'UNKNOWN',
          title: 'Check C:\\temp | hot',
          why: 'a trailing backslash \\',
          evidenceHint: 'output of ls C:\\temp',
        }),
      ]),
      profile,
    );
    const row = md.split('\n').find((l) => l.includes('Check C:'))!;
    // Backslash doubled, then pipe escaped: `C:\\temp \\| hot`
    expect(row).toContain('C:\\\\temp');
    expect(row).toContain('\\| hot');
    // Only the table's own delimiters survive: every `|` that came from the
    // rule text is escaped, so the row still has the header's column count.
    const header = md.split('\n').find((l) => l.includes('| Rule |'))!;
    const delimiters = (line: string) => (line.match(/(?<!\\)\|/g) ?? []).length;
    expect(delimiters(row)).toBe(delimiters(header));
  });

  // The wildcard form /BEGIN([\\s\\S]*?)END/ is polynomial on input with many
  // partial BEGIN markers; parseTrailer walks back from END for that reason.
  it('parses the trailer out of a document full of decoy markers', () => {
    const real = renderMarkdown(baseReport([finding({})]), profile);
    const noise = `${'<!-- USA:TRAILER:BEGIN -->'.repeat(200)}x`;
    const started = Date.now();
    const parsed = parseTrailer(`${noise}\n${real}\n${noise}`);
    expect(parsed).toContain('schema: usa-report-v1');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('trailer is valid YAML', async () => {
    const { parse } = await import('yaml');
    const raw = parseTrailer(renderMarkdown(baseReport([finding({})]), profile))!;
    const doc = parse(raw) as any;
    expect(doc.schema).toBe('usa-report-v1');
    expect(doc.overall).toBe(71.4);
    expect(doc.rules).toBeTypeOf('object');
  });
});

describe('json report', () => {
  it('serializes the report with the stable schema and no loss', () => {
    const doc = toJsonReport(baseReport([finding({}), finding({ ruleId: 'SEC-001' })]));
    expect(doc.schema).toBe('usa-report-json-v1');
    expect(doc.findings).toHaveLength(2);
    expect(doc.findings[0]!.ruleId).toBe('X-001');
    expect(doc.score.overall).toBe(71.4);
    expect(renderJson(baseReport([])).endsWith('\n')).toBe(true);
  });

  it('omits optional finding fields that are unset', () => {
    const doc = toJsonReport(baseReport([finding({})]));
    expect(doc.findings[0]).not.toHaveProperty('remediation');
    expect(doc.findings[0]).not.toHaveProperty('references');
  });

  it('carries optional fields through when present', () => {
    const f = finding({ remediation: 'do X', why: 'because', references: ['OWASP'] });
    const doc = toJsonReport(baseReport([f]));
    expect(doc.findings[0]!.remediation).toBe('do X');
    expect(doc.findings[0]!.why).toBe('because');
    expect(doc.findings[0]!.references).toEqual(['OWASP']);
  });

  it('exposes automatability and review provenance', () => {
    const f = finding({
      automatability: 'assist',
      review: { reviewed: '2026-09-01', until: '2027-01-01', by: 'sajan' },
    });
    const doc = toJsonReport(baseReport([f]));
    expect(doc.findings[0]!.automatability).toBe('assist');
    expect(doc.findings[0]!.review).toEqual({
      reviewed: '2026-09-01',
      until: '2027-01-01',
      by: 'sajan',
    });
  });

  it('is deterministic for identical reports', () => {
    const r = baseReport([finding({}), finding({ ruleId: 'SEC-001', status: 'FAIL' })]);
    expect(renderJson(r)).toBe(renderJson(r));
  });
});

describe('sarif report', () => {
  it('emits a SARIF 2.1.0 log with the driver populated', () => {
    const log = toSarif(baseReport([finding({ status: 'FAIL' })]));
    expect(log.version).toBe('2.1.0');
    expect(log.$schema).toContain('sarif-schema-2.1.0.json');
    expect(log.runs[0]!.tool.driver.name).toContain('USA');
    expect(log.runs[0]!.tool.driver.version).toBe('1.0.0');
  });

  it('reports only actionable findings, not PASS or NOT_APPLICABLE', () => {
    const log = toSarif(
      baseReport([
        finding({ ruleId: 'A-001', status: 'FAIL' }),
        finding({ ruleId: 'A-002', status: 'PASS' }),
        finding({ ruleId: 'A-003', status: 'NOT_APPLICABLE' }),
      ]),
    );
    expect(log.runs[0]!.results.map((r) => r.ruleId)).toEqual(['A-001']);
  });

  it('maps severity to SARIF level and UNKNOWN to informational note', () => {
    const log = toSarif(
      baseReport([
        finding({ ruleId: 'C-001', severity: 'CRITICAL', status: 'FAIL' }),
        finding({ ruleId: 'M-001', severity: 'MEDIUM', status: 'FAIL' }),
        finding({ ruleId: 'L-001', severity: 'LOW', status: 'FAIL' }),
        finding({ ruleId: 'U-001', severity: 'HIGH', status: 'UNKNOWN' }),
      ]),
    );
    const byId = Object.fromEntries(log.runs[0]!.results.map((r) => [r.ruleId, r]));
    expect(byId['C-001']!.level).toBe('error');
    expect(byId['M-001']!.level).toBe('warning');
    expect(byId['L-001']!.level).toBe('note');
    expect(byId['U-001']!.level).toBe('note');
    expect(byId['U-001']!.kind).toBe('informational');
    expect(byId['C-001']!.kind).toBe('fail');
  });

  it('deduplicates rules into the driver and indexes results', () => {
    const log = toSarif(
      baseReport([
        finding({ ruleId: 'A-001', status: 'FAIL' }),
        finding({ ruleId: 'A-001', status: 'WRONG' }),
        finding({ ruleId: 'B-001', status: 'MISSING' }),
      ]),
    );
    const { rules } = log.runs[0]!.tool.driver;
    expect(rules.map((r) => r.id)).toEqual(['A-001', 'B-001']);
    const idx = Object.fromEntries(rules.map((r, i) => [r.id, i]));
    for (const res of log.runs[0]!.results) {
      expect(res.ruleIndex).toBe(idx[res.ruleId]);
    }
  });

  it('emits normalized repo-relative URIs and line regions', () => {
    const log = toSarif(
      baseReport([
        finding({
          status: 'FAIL',
          locations: [{ file: './src/api/routes.ts', line: 42 }],
        }),
      ]),
    );
    const loc = log.runs[0]!.results[0]!.locations[0]!;
    expect(loc.physicalLocation.artifactLocation.uri).toBe('src/api/routes.ts');
    expect(loc.physicalLocation.region).toEqual({ startLine: 42 });
  });

  it('marks suppressed findings with an external suppression', () => {
    const log = toSarif(
      baseReport([finding({ status: 'FAIL', suppressedReason: 'accepted risk' })]),
    );
    expect(log.runs[0]!.results[0]!.suppressions).toEqual([
      { kind: 'external', justification: 'accepted risk' },
    ]);
  });

  it('stamps automatability onto the rule properties when present', () => {
    const log = toSarif(baseReport([finding({ status: 'FAIL', automatability: 'full' })]));
    expect(log.runs[0]!.tool.driver.rules[0]!.properties.automatability).toBe('full');
  });

  it('produces no results for an all-clean report', () => {
    const log = toSarif(baseReport([finding({ status: 'PASS' })]));
    expect(log.runs[0]!.results).toEqual([]);
    expect(log.runs[0]!.tool.driver.rules).toEqual([]);
  });

  it('is deterministic for identical reports', () => {
    const r = baseReport([finding({ ruleId: 'A-001', status: 'FAIL' })]);
    expect(renderSarif(r)).toBe(renderSarif(r));
  });
});

describe('foundation readiness section', () => {
  const fnd = (over: Partial<Finding> & { tags?: string[] }): Finding =>
    ({ ...finding({}), ...over }) as Finding;

  const docsFail = () =>
    fnd({
      ruleId: 'FND-002',
      title: 'Docs gap',
      status: 'MISSING',
      message: 'No vision recorded.',
      tags: ['pillar:docs'],
    });
  const docsPass = () =>
    fnd({
      ruleId: 'FND-001',
      title: 'Docs present',
      status: 'PASS',
      message: 'Vision recorded.',
      tags: ['pillar:docs'],
    });

  it('returns no lines when there are no FND findings', async () => {
    const { renderFoundationSection } = await import('../../src/report/foundation.js');
    expect(renderFoundationSection([])).toEqual([]);
    expect(renderFoundationSection([finding({}), finding({ ruleId: 'SEC-001' })])).toEqual([]);
  });

  it('leaves FND-less reports byte-identical (no foundation section)', () => {
    const md = renderMarkdown(baseReport([finding({ ruleId: 'X-001', status: 'FAIL' })]), profile);
    expect(md).not.toContain('Foundation');
    expect(md).not.toContain('FND-');
    // Stable: the wiring adds nothing when there is nothing to report.
    const again = renderMarkdown(
      baseReport([finding({ ruleId: 'X-001', status: 'FAIL' })]),
      profile,
    );
    expect(md).toBe(again);
  });

  it('grades pillars READY, PARTIAL, and MISSING with passed/applicable counts', () => {
    const md = renderMarkdown(
      baseReport([
        docsPass(),
        docsFail(),
        fnd({
          ruleId: 'FND-010',
          title: 'Gov present',
          status: 'PASS',
          message: 'Owners recorded.',
          tags: ['pillar:governance'],
        }),
        fnd({
          ruleId: 'FND-020',
          title: 'Test gap',
          status: 'FAIL',
          message: 'No test evidence.',
          tags: ['pillar:testing'],
        }),
      ]),
      profile,
    );
    expect(md).toContain('Foundation Readiness');
    expect(md).toContain('Docs — **PARTIAL** · 1 passed / 2 applicable');
    expect(md).toContain('Governance — **READY** · 1 passed / 1 applicable');
    expect(md).toContain('Testing — **MISSING** · 0 passed / 1 applicable');
  });

  it('groups open FND items under their pillar, after the findings and before the queue', () => {
    const md = renderMarkdown(baseReport([docsFail(), docsPass()]), profile);
    const sectionIdx = md.indexOf('Section-by-Section Findings');
    const foundationIdx = md.indexOf('Foundation Readiness');
    const queueIdx = md.indexOf('Judgement Queue');
    expect(foundationIdx).toBeGreaterThan(sectionIdx);
    expect(queueIdx).toBeGreaterThan(foundationIdx);
    const block = md.slice(foundationIdx, queueIdx);
    expect(block).toContain('`FND-002`');
    // Passing FND items are folded into a details block, not the open list.
    expect(block).toContain('<details><summary>1 check(s) passing in Docs</summary>');
    expect(block).toContain('- ✅ Docs present `FND-001`');
  });

  it('lists open items sorted by rule id and renders deterministically', async () => {
    const { renderFoundationSection } = await import('../../src/report/foundation.js');
    const a = renderFoundationSection([docsFail(), docsPass()]);
    const b = renderFoundationSection([docsPass(), docsFail()]);
    expect(a).toEqual(b);
    expect(a.join('\n')).toBe(b.join('\n'));
    const idx1 = a.findIndex((l) => l.includes('FND-001'));
    const idx2 = a.findIndex((l) => l.includes('FND-002'));
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(-1);
  });

  it('excludes suppressed and not-applicable FND findings from pillar counts', () => {
    const md = renderMarkdown(
      baseReport([
        docsFail(),
        fnd({
          ruleId: 'FND-003',
          title: 'Waived gap',
          status: 'FAIL',
          message: 'Waived.',
          suppressedReason: 'Accepted risk',
          tags: ['pillar:docs'],
        }),
        fnd({
          ruleId: 'FND-004',
          title: 'Skipped gap',
          status: 'NOT_APPLICABLE',
          message: 'Skipped.',
          tags: ['pillar:docs'],
        }),
      ]),
      profile,
    );
    expect(md).toContain('Docs — **MISSING** · 0 passed / 1 applicable');
  });
});
