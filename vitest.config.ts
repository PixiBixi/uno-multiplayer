import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * Workspace packages resolve to their SOURCE. Going through node_modules would
 * run the tests against dist/, so a stale build could turn a broken change into
 * a green suite.
 */
const alias = {
  '@uno/engine': fromRoot('./packages/engine/src/index.ts'),
  '@uno/protocol': fromRoot('./packages/protocol/src/index.ts'),
}

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/test-helpers.ts', '**/main.tsx'],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./apps/web/src/test-setup.ts'],
        },
      },
    ],
  },
})
