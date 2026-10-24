import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // `examples/demo-app` is a deliberately bad CommonJS fixture for the sample
    // report, not source. Linting it would mean "fixing" the findings we planted.
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'examples/demo-app/**',
      // Deliberately defective fixture projects: linting them would mean
      // "fixing" the defects they exist to hold.
      'fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      // CQ-013: complexity is measured (report-only at first per USA remediation).
      complexity: ['warn', 10],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  // ARCH-006: the layers point inward, and the rule is enforced here rather
  // than described in a diagram. `util` is the bottom (it may not know what an
  // audit is); `engine` and `report` may not reach up into the CLI; only the
  // CLI may import `serve`. A cross-layer import fails lint, not review.
  {
    files: ['src/util/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/engine/**', '**/report/**', '**/cli*', '**/serve/**'],
              message: 'util is the bottom layer — it cannot import engine, report, cli, or serve.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/engine/**/*.ts', 'src/report/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/cli*', '**/serve/**'],
              message: 'engine and report are below the CLI — they cannot import it.',
            },
          ],
        },
      ],
    },
  },
  {
    // The mutation harness and CLI entry are the only places allowed to know
    // both halves of the program; they are excluded by not being matched above.
    files: ['src/cli*.ts', 'src/index.ts', 'src/serve/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Node scripts (scripts/*.mjs) run under plain node, which js.configs
    // .recommended does not know about — without this, `process` and `console`
    // are reported as undefined. The fetch/Abort/timeout globals are Node 20+.
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      // Same convention as the TypeScript block above: a leading underscore
      // marks a parameter that exists to fix a signature, not to be read —
      // `MacpBackend`'s abstract methods are exactly that case. Both spellings
      // are set because `tseslint.configs.recommended` applies to `.mjs` too
      // and turns the base rule off in favour of its own.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
