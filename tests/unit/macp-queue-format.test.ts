import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error — the MACP runtime is plain ESM, shipped without types.
import { appendQueue, ensureQueue, resolveQueue } from '../../scripts/macp/lib/statefiles.mjs';

/**
 * `state/macp/queue.md` is machine-written, so it must be written in the shape
 * the gates accept. The first version appended an entry directly beneath the
 * `## Open` heading, which is valid Markdown but not what `prettier --check`
 * wants — so every `macp queue` left the working tree failing `format:check`,
 * and the close refused over a file the runtime had just written itself.
 */

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'macp-queue-'));
  mkdirSync(path.join(root, 'state', 'macp'), { recursive: true });
  return { root, read: () => readFileSync(path.join(root, 'state/macp/queue.md'), 'utf8') };
}

const entry = {
  type: 'BUG_FOUND',
  summary: 'a thing that broke',
  files: [],
  session: 'T01',
  date: '2026-10-24',
};

describe('macp queue file shape', () => {
  it('a fresh queue has a blank line under each heading', () => {
    const { root, read } = fixture();
    ensureQueue(root);
    const text = read();
    expect(text).toContain('## Open\n\n## Done\n');
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('an appended entry sits under the heading with one blank line above it', () => {
    const { root, read } = fixture();
    const { id } = appendQueue(root, entry);
    expect(id).toBe('Q001');
    const text = read();
    expect(text).toContain(
      '## Open\n\n- [ ] `Q001` a thing that broke (BUG_FOUND, T01, 2026-10-24)',
    );
    expect(text).toContain('\n\n## Done\n');
  });

  it('resolving moves the entry to Done and leaves no stray blank lines', () => {
    const { root, read } = fixture();
    appendQueue(root, entry);
    expect(resolveQueue(root, 'Q001')).toBe(true);
    const text = read();
    expect(text).not.toContain('- [ ]');
    expect(text).toContain('## Open\n\n## Done\n\n- [x] `Q001` a thing that broke');
    expect(text).not.toMatch(/\n{3,}/);
  });

  it('is idempotent: re-rendering the same state changes nothing', () => {
    const { root, read } = fixture();
    appendQueue(root, entry);
    const first = read();
    // A duplicate append must not write at all.
    const second = appendQueue(root, entry);
    expect(second.duplicate).toBe(true);
    expect(read()).toBe(first);
  });
});
