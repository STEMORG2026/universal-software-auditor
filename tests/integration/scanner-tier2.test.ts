import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  scorecardAdapter,
  LOCAL_CHECKS,
  deriveRepoSlug,
} from '../../src/scanner/adapters/scorecard.js';
import { ortAdapter } from '../../src/scanner/adapters/ort.js';
import type { ParseContext } from '../../src/scanner/types.js';

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/scanners');
const read = (file: string): string => fs.readFileSync(path.join(FIXTURES, file), 'utf8');

function ctx(adapterVersion = 'v5.6.0'): ParseContext {
  return {
    adapterId: 'test',
    adapterVersion,
    target: { path: '/x', workdir: '/x/w', revision: 'abc123', executionId: 'e1' },
    config: {},
  };
}

/**
 * Scorecard is the one Tier-2 adapter that can be verified end-to-end here: the
 * release binary is a single file, and `--local` mode runs offline against a
 * checkout. The fixture is a real capture, so these assertions are about
 * measured behaviour, not remembered behaviour.
 */
describe('scorecard adapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('local mode runs offline with an explicit check list', () => {
    const cmd = scorecardAdapter.buildCommand(
      { path: '/r', workdir: '/r/w', revision: '', executionId: '' },
      scorecardAdapter.defaultConfig(),
    );
    expect(cmd.argv.slice(0, 4)).toEqual(['scorecard', '--local', '/r/w', '--format']);
    expect(cmd.argv[cmd.argv.indexOf('--checks') + 1]!.split(',')).toEqual(LOCAL_CHECKS);
    // Local mode is file-based and must not need the network.
    expect(cmd.network).toBeFalsy();
  });

  it('repo mode reaches the platform API and is marked as needing network', () => {
    const cmd = scorecardAdapter.buildCommand(
      { path: '/r', workdir: '/r/w', revision: '', executionId: '' },
      { mode: 'repo', repo: 'ossf/scorecard' },
    );
    expect(cmd.argv).toContain('ossf/scorecard');
    expect(cmd.network).toBe(true);
  });

  it('repo mode derives the slug from origin when none is configured', () => {
    const root = path.resolve(process.cwd());
    expect(deriveRepoSlug(root)).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(deriveRepoSlug('/tmp/definitely-not-a-repo-xyz')).toBe('');
  });

  it('parses the real capture, one evidence row per probe', () => {
    const rows = scorecardAdapter.parse(read('scorecard.json'), ctx());
    expect(rows).toHaveLength(7);
    const byName = new Map(rows.map((r) => [r.source.identifier, r]));
    // License scored 9 and Binary-Artifacts 6: two partials whose *reasons*
    // differ ("license file detected" vs "binaries present in source code").
    // The adapter must not collapse both into one verdict — the number and the
    // reason travel together in the claim, and a rule sets the threshold.
    expect(byName.get('License')!.status).toBe('PARTIAL');
    expect(byName.get('License')!.claim).toContain('(9/10)');
    expect(byName.get('Binary-Artifacts')!.status).toBe('PARTIAL');
    expect(byName.get('Binary-Artifacts')!.claim).toContain('(6/10)');
    expect(byName.get('Binary-Artifacts')!.claim).toContain('binaries present in source code');
    // Every row carries the tool's own version, not the adapter's guess.
    expect(rows[0]!.source.version).toBe('v5.6.0');
  });

  it('the aggregate score is never evidence', () => {
    const rows = scorecardAdapter.parse(read('scorecard.json'), ctx());
    expect(rows.some((r) => r.claim.includes('7.5'))).toBe(false);
    expect(rows.every((r) => r.source.identifier !== 'Aggregate')).toBe(true);
  });

  it('a probe that could not evaluate is UNKNOWN, not a failure', () => {
    const rows = scorecardAdapter.parse(
      JSON.stringify({ checks: [{ name: 'Maintained', score: -1, reason: 'internal error' }] }),
      ctx(),
    );
    expect(rows[0]!.status).toBe('UNKNOWN');
    expect(rows[0]!.claim).toContain('could not be evaluated');
  });

  it('garbage is UNKNOWN', () => {
    expect(scorecardAdapter.parse('<html>', ctx())[0]!.status).toBe('UNKNOWN');
  });

  it('probe reports UNAVAILABLE with an install hint when absent', () => {
    const stub = vi.spyOn(process, 'env', 'get').mockReturnValue({ PATH: '/nonexistent' } as never);
    try {
      const probe = scorecardAdapter.probe();
      expect(probe.available).toBe(false);
      expect(probe.reason).toMatch(/release binary/);
    } finally {
      stub.mockRestore();
    }
  });
});

describe('ort adapter', () => {
  it('builds the evaluate leg, not the whole pipeline', () => {
    const cmd = ortAdapter.buildCommand(
      { path: '/r', workdir: '/r/w', revision: '', executionId: '' },
      ortAdapter.defaultConfig(),
    );
    expect(cmd.argv.slice(0, 3)).toEqual(['ort', 'evaluate', '--input-dir']);
    expect(cmd.argv[cmd.argv.indexOf('--output-dir') + 1]).toBe('.ort-results');
  });

  it('parses the [UNVERIFIED] fixture into policy violations', () => {
    const rows = ortAdapter.parse(read('ort-evaluate.yml'), ctx('unknown'));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.source.kind).toBe('policy-violation');
    expect(rows[0]!.source.identifier).toBe('DEPRECATED_LICENSE');
    expect(rows[0]!.claim).toContain('lodash@4.17.4');
    expect(rows[0]!.severity).toBe('HIGH');
    expect(rows[1]!.severity).toBe('MEDIUM');
  });

  it('accepts the same document as JSON', () => {
    const rows = ortAdapter.parse(
      JSON.stringify({ violations: [{ pkg: 'a@1.0.0', rule: 'R', severity: 'ERROR' }] }),
      ctx('unknown'),
    );
    expect(rows).toHaveLength(1);
  });

  it('a payload with no violations array is UNKNOWN, not clean', () => {
    expect(ortAdapter.parse('repository:\n  vcs: git\n', ctx('unknown'))[0]!.status).toBe(
      'UNKNOWN',
    );
  });

  it('malformed YAML is UNKNOWN', () => {
    expect(ortAdapter.parse('a: [unclosed', ctx('unknown'))[0]!.status).toBe('UNKNOWN');
  });

  it('probe reports UNAVAILABLE when the JVM package is absent', () => {
    expect(ortAdapter.probe().available).toBe(false);
    expect(ortAdapter.probe().reason).toMatch(/JVM package/);
  });
});
