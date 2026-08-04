import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // Point workspace packages at their SOURCE. Resolving through node_modules
    // would run the tests against dist/, so a stale build could turn a broken
    // change into a green suite.
    alias: {
      '@uno/engine': fromRoot('./packages/engine/src/index.ts'),
      '@uno/protocol': fromRoot('./packages/protocol/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.ts', '**/test-helpers.ts'],
    },
  },
})
