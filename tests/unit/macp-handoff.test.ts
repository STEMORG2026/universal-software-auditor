import { describe, it, expect } from 'vitest';
// @ts-expect-error — the MACP runtime is plain ESM, shipped without types.
import { validateHandoff } from '../../scripts/macp/lib/handoff.mjs';

/**
 * The rules `macp close` enforces on the agent-authored half of a handoff.
 *
 * These are unit tests because two of the branches are unreachable through the
 * CLI: a package manager always prints its own failure line, so a gate can
 * never record a genuinely empty tail, and `working_tree_clean` is measured
 * from git. The integration suite covers the flows that can be driven as a
 * process; this covers the rules themselves.
 */

const green = { exit: 0, ms: 10, tail: '' };
const red = { exit: 1, ms: 10, tail: 'boom' };
const silentRed = { exit: 1, ms: 10, tail: '' };

function handoff(overrides: Record<string, unknown> = {}) {
  return {
    outcome: 'PARTIAL',
    working_tree_clean: true,
    gates: { test: red },
    remaining: ['the rest'],
    next_recommended_task: 'finish it',
    completed: ['the part that works'],
    ...overrides,
  };
}

describe('validateHandoff', () => {
  it('accepts a PARTIAL close with a red gate that has output', () => {
    expect(validateHandoff(handoff())).toEqual([]);
  });

  it('accepts green gates with no tail at all', () => {
    // The defect this pins: the first version of the rule demanded a tail from
    // *every* gate, so a suite of quiet green gates made a valid close invalid.
    expect(validateHandoff(handoff({ gates: { lint: green, test: green } }))).toEqual([]);
  });

  it('refuses a failing gate that recorded no output', () => {
    expect(validateHandoff(handoff({ gates: { test: silentRed } }))).toContain(
      'a failing gate was recorded without its output — record the tail',
    );
  });

  it('refuses PARTIAL without a remainder or a next task', () => {
    const problems = validateHandoff(handoff({ remaining: [], next_recommended_task: '' }));
    expect(problems).toContain('PARTIAL requires at least one entry in remaining[]');
    expect(problems).toContain('PARTIAL requires a next_recommended_task');
  });

  it('refuses COMPLETED with any red gate, and names it', () => {
    const problems = validateHandoff(
      handoff({ outcome: 'COMPLETED', gates: { lint: green, test: red } }),
    );
    expect(problems.join('\n')).toMatch(/COMPLETED requires every recorded gate green; test/);
  });

  it('refuses COMPLETED with no gate recorded at all', () => {
    expect(validateHandoff(handoff({ outcome: 'COMPLETED', gates: {} }))).toContain(
      'COMPLETED requires at least one gate to have been run and recorded',
    );
  });

  it('refuses a dirty tree for every outcome', () => {
    expect(validateHandoff(handoff({ working_tree_clean: false }))).toContain(
      'the working tree is not clean — commit or revert before closing',
    );
  });

  it('refuses an outcome outside the vocabulary', () => {
    expect(validateHandoff(handoff({ outcome: 'OPEN' })).join('\n')).toMatch(/outcome must be/);
  });
});
