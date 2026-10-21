import type {
  Finding,
  InvariantAssertion,
  InvariantClause,
  InvariantCondition,
  Status,
} from '../types.js';

/**
 * Multi-rule invariants: findings about findings.
 *
 * Every other check kind reads files. Invariants read the already-computed
 * finding set instead — they catch dangerous *combinations* no single rule
 * can see (auth passes + caching passes + composition fails). Evaluated in
 * a second pass after all file rules, over statuses only: no file I/O, no
 * network, fully deterministic.
 *
 * The `when` language is deliberately tiny (all/any/not over rule+status
 * pairs). If a future invariant needs scripting, the design has failed —
 * encode the pattern as file rules and compose their conclusions instead.
 */

export type FindingStatusById = Map<string, Status>;

function clauseHolds(clause: InvariantClause, byId: FindingStatusById): boolean {
  return clause.status.includes(byId.get(clause.rule) ?? 'NOT_APPLICABLE');
}

function whenMatches(when: InvariantCondition, byId: FindingStatusById): boolean {
  if (when.all !== undefined && !when.all.every((c) => clauseHolds(c, byId))) return false;
  if (when.any !== undefined && !when.any.some((c) => clauseHolds(c, byId))) return false;
  if (when.not !== undefined && when.not.some((c) => clauseHolds(c, byId))) return false;
  return true;
}

function assertHolds(assert: InvariantAssertion, byId: FindingStatusById): boolean {
  return assert.status.includes(byId.get(assert.rule) ?? 'NOT_APPLICABLE');
}

export interface InvariantOutcome {
  /** False when `when` did not match: silent, not even UNKNOWN. */
  applicable: boolean;
  passed: boolean;
  detail: string;
}

/**
 * Evaluate one invariant against the finding set. Pure: no I/O, no
 * project access. Missing rule ids read as NOT_APPLICABLE (a rule that
 * did not run cannot satisfy a precondition — fail closed toward silent,
 * never toward firing on absent evidence).
 *
 * The same rule governs the assertion. An asserted rule that is
 * NOT_APPLICABLE has no surface to judge: demanding PASS from it turns
 * every project without that surface into a false positive (INV-SEC-003
 * fired HIGH on this CLI because SEC-009 — output encoding for a web
 * frontend — does not apply to a program that renders no HTML). An
 * invariant is a claim about a *combination*; when one half of the
 * combination does not exist, there is no claim to make.
 */
export function evaluateInvariant(
  when: InvariantCondition,
  assert: InvariantAssertion,
  byId: FindingStatusById,
): InvariantOutcome {
  if (!whenMatches(when, byId)) {
    return { applicable: false, passed: true, detail: 'precondition not met' };
  }
  const actual = byId.get(assert.rule) ?? 'NOT_APPLICABLE';
  if (actual === 'NOT_APPLICABLE') {
    return { applicable: false, passed: true, detail: `${assert.rule} is not applicable` };
  }
  if (assertHolds(assert, byId)) {
    return { applicable: true, passed: true, detail: `${assert.rule} is ${actual}` };
  }
  return {
    applicable: true,
    passed: false,
    detail:
      `combination holds but ${assert.rule} is ${actual} ` +
      `(expected ${assert.status.join('/')})`,
  };
}

/** Evidence locations for a fired invariant: the matched findings' locations. */
export function invariantLocations(
  when: InvariantCondition,
  findings: Finding[],
): Finding['locations'] {
  const ids = new Set<string>();
  for (const group of [when.all ?? [], when.any ?? []] as InvariantClause[][]) {
    for (const c of group) ids.add(c.rule);
  }
  return findings
    .filter((f) => ids.has(f.ruleId))
    .flatMap((f) => f.locations)
    .slice(0, 8);
}
