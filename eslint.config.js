import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-types/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // The engine must stay deterministic: no source of entropy, no clock.
    // `Math.min`/`Math.imul` remain legitimate; only the random source is
    // banned - shuffling goes through rng.ts and its seed.
    files: ['packages/engine/src/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use nextRandom/nextInt from rng.ts.' },
        { object: 'Date', property: 'now', message: 'The engine must not read the clock.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'The engine must not read the clock.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/test-helpers.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Asserting on a mocked method means passing it unbound to expect(). The
      // rule guards against a lost `this`, which a vi.fn() spy does not have.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // JSX on top of the shared settings. parserOptions must repeat
    // projectService: this block replaces the key rather than merging into it,
    // and dropping it silently strips every type-aware rule of its types.
    // Browser globals need no list here - `lib: DOM` in tsconfig covers them.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    // Config files belong to no TS project, so typed linting has no program to
    // work from for them.
    files: ['**/*.config.ts', '**/*.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
