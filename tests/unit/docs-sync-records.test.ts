import { describe, it, expect } from 'vitest';
// @ts-expect-error — the docs-sync helpers are plain ESM, shipped without types.
import { claimScannedFiles, docFiles } from '../../scripts/lib/docs-sync.mjs';

/**
 * Sealed session files must be outside every rewriting gate.
 *
 * `scripts/check-sessions.mjs` compares each session file byte for byte against
 * the commit that sealed it. Two docs gates used to walk the same list and
 * rewrite the numbers inside them: `sync-docs` (on write) and the claim scanner
 * (on read). Adding ADR-0045 moved the ADR count from 44 to 45, the sync
 * rewrote four sealed sessions, and the session gate failed all four as
 * "edited after its seal" — a gate fighting a gate, with the record as the
 * casualty.
 *
 * These tests pin the boundary rather than the symptom: session files are
 * visible to `docFiles()` (links and indexes still see them) but excluded from
 * `claimScannedFiles()` (nothing rewrites them).
 */
describe('docs-sync · immutable session records', () => {
  it('docFiles still sees session files, so link and index checks cover them', () => {
    const sessions = docFiles().filter((f: string) => f.startsWith('state/sessions/'));
    expect(sessions.length).toBeGreaterThan(0);
  });

  it('claimScannedFiles excludes every session file', () => {
    const scanned = claimScannedFiles().filter((f: string) => f.startsWith('state/sessions/'));
    expect(scanned).toEqual([]);
  });

  it('still scans the living state documents, where counts must stay current', () => {
    const scanned = claimScannedFiles();
    expect(scanned).toContain('state/CONTINUATION.md');
    expect(scanned).toContain('state/DASHBOARD.md');
  });
});
