import { defineConfig, devices } from '@playwright/test'

const PORT = 5099

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 1,
  workers: 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  /* The real server serving the real client build. A dev server would exercise a
     different artefact from the one that ships. */
  webServer: {
    command: 'npm run build && node apps/server/dist/index.js',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      STATIC_ROOT: 'apps/web/dist',
      GRACE_PERIOD_MS: '60000',
      // A scripted game plays far faster than a person; the limiter is exercised
      // by the server's own integration tests.
      MOVE_BURST: '5000',
      MOVE_PER_SECOND: '5000',
    },
  },
})
