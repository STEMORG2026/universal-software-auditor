import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // TAS-008: a stray `.only` fails the build instead of shrinking the
    // suite. Vitest already defaults this way under CI, but the default is
    // invisible (and the rule that checks for it needs something to match):
    // stated explicitly, local focused debugging stays allowed, and the
    // determinism-guard test below pins the CI behavior end to end.
    allowOnly: !process.env.CI,
    // TAS-009: the retry budget is declared, and it is zero. A retry hides a
    // flaky test instead of failing it, and a suite that retries teaches
    // people to ignore red. If a test cannot pass twice in a row, that is the
    // bug — fix it rather than buying a rerun.
    retry: 0,
    // E2E cases spawn the CLI in child processes. Under a full parallel run a
    // 5s ceiling is CPU contention, not a defect — and with retry: 0 a
    // contention timeout is a hard red. 15s still bounds a real hang.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'lcov'],
      // Ratcheted per USA's own TEST guidance: thresholds sit just below
      // today's measured numbers and rise. Measured 2026-09-13 (stable across
      // two runs): 86.5 lines / 76.8 branches / 91.5 functions / 85.0
      // statements. Raise these whenever they go green by a margin (keep
      // >=1pt headroom) — never lower them, never exclude files to pass.
      thresholds: {
        lines: 85,
        functions: 90,
        branches: 75,
        statements: 84,
      },
    },
  },
});
