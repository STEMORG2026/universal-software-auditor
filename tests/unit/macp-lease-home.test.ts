import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { macpHome } from '../../scripts/macp/lib/repo.mjs';

/**
 * The lease store must not move on its own.
 *
 * `macpHome()` prefers `~/.macp`, falls back to `~/Projects/.macp-home` when the
 * first is not writable, and honours `$MACP_HOME`. The fallback exists for a
 * sandboxed machine where the real home is read-only — but it must only fire
 * when the primary is genuinely unwritable.
 *
 * It fired on every call: the writability probe passed the whole `fs.constants`
 * object to `accessSync`, which takes a *mode number*, so it threw
 * `ERR_INVALID_ARG_TYPE` and the catch took the fallback. The effect was silent
 * and total — every lease written before the change became invisible, and a
 * `submit` refused with "no lease … this machine never ran start" while the
 * lease sat in the store the runtime had stopped reading.
 *
 * `homedir()` is read inside the function, so pointing `$HOME` at a temp
 * directory is enough; no module cache-busting and no stubbing.
 */

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** Run `body` with `$HOME` (and `$MACP_HOME` cleared) pointing at a temp dir. */
function withHome(prepare: (home: string) => void, body: (home: string) => void) {
  const home = mkdtempSync(path.join(tmpdir(), 'macp-home-unit-'));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));
  prepare(home);

  const savedHome = process.env.HOME;
  const savedMacp = process.env.MACP_HOME;
  process.env.HOME = home;
  delete process.env.MACP_HOME;
  try {
    body(home);
  } finally {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedMacp !== undefined) process.env.MACP_HOME = savedMacp;
  }
}

describe('macpHome', () => {
  it('uses ~/.macp when it is writable, and does not relocate to the fallback', () => {
    withHome(
      () => {},
      (home) => {
        expect(macpHome()).toBe(path.join(home, '.macp'));
      },
    );
  });

  it('creates ~/.macp rather than falling back when it does not exist yet', () => {
    withHome(
      () => {},
      (home) => {
        const first = macpHome();
        expect(first).toBe(path.join(home, '.macp'));
        // Stable across calls: a store that resolves differently per call is a
        // store that loses leases.
        expect(macpHome()).toBe(first);
      },
    );
  });

  it('falls back only when ~/.macp cannot be a directory', () => {
    withHome(
      (home) => {
        // A file where the store should be: `mkdirSync` fails with EEXIST, the
        // one condition the fallback is actually for.
        writeFileSync(path.join(home, '.macp'), 'not a directory\n');
      },
      (home) => {
        expect(macpHome()).toBe(path.join(home, 'Projects', '.macp-home'));
      },
    );
  });

  it('honours $MACP_HOME above both', () => {
    const chosen = mkdtempSync(path.join(tmpdir(), 'macp-home-explicit-'));
    cleanups.push(() => rmSync(chosen, { recursive: true, force: true }));
    const saved = process.env.MACP_HOME;
    process.env.MACP_HOME = chosen;
    try {
      expect(macpHome()).toBe(chosen);
    } finally {
      if (saved === undefined) delete process.env.MACP_HOME;
      else process.env.MACP_HOME = saved;
    }
  });

  it('never resolves inside the repository it is running in', () => {
    withHome(
      () => {},
      () => {
        // A lease store inside the tree would be committed, audited, and
        // shared between checkouts — the opposite of a per-machine lease.
        expect(macpHome().startsWith(path.resolve(__dirname, '../..'))).toBe(false);
      },
    );
  });
});
