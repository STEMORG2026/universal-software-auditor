import { describe, it, expect } from 'vitest';
import { evaluateInvariant, invariantLocations } from '../../src/engine/invariants.js';
import { parsePackText } from '../../src/engine/loader.js';
import type { Finding, Status } from '../../src/types.js';

function byId(entries: Array<[string, Status]>): Map<string, Status> {
  return new Map(entries);
}

function stubFinding(ruleId: string, file = 'src/app.ts'): Finding {
  return {
    ruleId,
    title: ruleId,
    section: 'S2',
    sectionTitle: 'Security',
    severity: 'HIGH',
    baseSeverity: 'HIGH',
    status: 'PASS',
    ruleClass: 'security',
    dampened: false,
    message: 'stub',
    locations: [{ file, line: 1 }],
  };
}

/**
 * Invariant evaluation over finding sets (no files involved): the
 * dangerous combination fires, the parts-alone stay quiet, inapplicable
 * stays silent, and missing rules fail closed toward silence.
 */
describe('evaluateInvariant', () => {
  const when = {
    all: [
      { rule: 'SEC-003', status: ['PASS' as Status] },
      { rule: 'SEC-004', status: ['PASS' as Status] },
    ],
  };
  const assert = { rule: 'SEC-018', status: ['PASS' as Status] };

  it('fires when the combination holds but the guard fails', () => {
    const out = evaluateInvariant(
      when,
      assert,
      byId([
        ['SEC-003', 'PASS'],
        ['SEC-004', 'PASS'],
        ['SEC-018', 'MISSING'],
      ]),
    );
    expect(out.applicable).toBe(true);
    expect(out.passed).toBe(false);
    expect(out.detail).toContain('SEC-018');
  });

  it('passes when the combination holds and the guard holds', () => {
    const out = evaluateInvariant(
      when,
      assert,
      byId([
        ['SEC-003', 'PASS'],
        ['SEC-004', 'PASS'],
        ['SEC-018', 'PASS'],
      ]),
    );
    expect(out).toMatchObject({ applicable: true, passed: true });
  });

  it('stays silent when the precondition does not hold', () => {
    const out = evaluateInvariant(
      when,
      assert,
      byId([
        ['SEC-003', 'FAIL'],
        ['SEC-004', 'PASS'],
        ['SEC-018', 'MISSING'],
      ]),
    );
    expect(out.applicable).toBe(false);
  });

  it('fails closed toward silence when a referenced rule never ran', () => {
    const out = evaluateInvariant(when, assert, byId([['SEC-003', 'PASS']]));
    expect(out.applicable).toBe(false);
  });

  it('stays silent when the asserted rule does not apply to this project', () => {
    // Regression: INV-SEC-003 fired HIGH on USA itself because SEC-009
    // (HTML output encoding) is NOT_APPLICABLE for a CLI. A rule with no
    // surface cannot be demanded to pass.
    const out = evaluateInvariant(
      when,
      assert,
      byId([
        ['SEC-003', 'PASS'],
        ['SEC-004', 'PASS'],
        ['SEC-018', 'NOT_APPLICABLE'],
      ]),
    );
    expect(out).toMatchObject({ applicable: false, passed: true });
    expect(out.detail).toContain('not applicable');
  });

  it('stays silent when the asserted rule never ran', () => {
    const out = evaluateInvariant(
      when,
      assert,
      byId([
        ['SEC-003', 'PASS'],
        ['SEC-004', 'PASS'],
      ]),
    );
    expect(out.applicable).toBe(false);
  });

  it('supports any/not clauses', () => {
    const cond = {
      any: [{ rule: 'A', status: ['FAIL' as Status] }],
      not: [{ rule: 'B', status: ['PASS' as Status] }],
    };
    const assertion = { rule: 'C', status: ['PASS' as Status] };
    expect(
      evaluateInvariant(
        cond,
        assertion,
        byId([
          ['A', 'FAIL'],
          ['B', 'MISSING'],
          ['C', 'MISSING'],
        ]),
      ).passed,
    ).toBe(false);
    expect(
      evaluateInvariant(
        cond,
        assertion,
        byId([
          ['A', 'PASS'],
          ['B', 'MISSING'],
          ['C', 'MISSING'],
        ]),
      ).applicable,
    ).toBe(false);
    expect(
      evaluateInvariant(
        cond,
        assertion,
        byId([
          ['A', 'FAIL'],
          ['B', 'PASS'],
          ['C', 'MISSING'],
        ]),
      ).applicable,
    ).toBe(false);
  });

  it('survives the loader: parsed clauses reach the check intact', () => {
    // Regression: parseClauseList once validated clauses without keeping
    // them, so every invariant shipped with an empty precondition — which
    // matches everything. Unit tests bypass the loader, so only a
    // loader round-trip catches it.
    const warnings: string[] = [];
    const pack = parsePackText(
      [
        'id: demo',
        'title: Demo',
        'section: S2',
        'rules:',
        '  - id: INV-T-001',
        '    title: t',
        '    severity: HIGH',
        '    class: security',
        '    check:',
        '      kind: invariant',
        '      when:',
        '        all:',
        '          - { rule: SEC-003, status: [PASS] }',
        '          - { rule: SEC-004, status: [PASS] }',
        '      assert: { rule: SEC-018, status: [PASS] }',
      ].join('\n'),
      'demo.yaml',
      new Map(),
      warnings,
    );
    expect(warnings).toEqual([]);
    const check = pack?.rules[0]?.check;
    expect(check?.kind).toBe('invariant');
    if (check?.kind !== 'invariant') throw new Error('unreachable');
    expect(check.when.all).toHaveLength(2);
    expect(check.assert.rule).toBe('SEC-018');
  });

  it('collects evidence locations from the matched findings', () => {
    const findings = [stubFinding('SEC-003', 'src/tls.ts'), stubFinding('UNRELATED', 'src/x.ts')];
    const locs = invariantLocations(when, findings);
    expect(locs.map((l) => l.file)).toEqual(['src/tls.ts']);
  });
});
