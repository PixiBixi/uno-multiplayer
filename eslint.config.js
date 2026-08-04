import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Le moteur doit rester déterministe : aucune source d'entropie ni
    // d'horloge. `Math.min`/`Math.imul` restent légitimes, seule la source
    // aléatoire est bannie — le mélange passe par rng.ts et sa graine.
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
    },
  },
  {
    // Les fichiers de configuration ne font partie d'aucun projet TS : le
    // linting typé n'a pas de programme sur lequel s'appuyer pour eux.
    files: ['**/*.config.ts', '**/*.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
