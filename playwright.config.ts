import { defineConfig } from '@playwright/test'

const releaseNotesSeen = {
  name: 'ab:last-seen-release-notes-version:v1',
  value: '1.1.0-beta.2',
}

export default defineConfig({
  testDir: './tests/e2e', timeout: 30000, expect: { timeout: 7000 },
  fullyParallel: true, workers: 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    storageState: {
      cookies: [],
      origins: [
        { origin: 'http://127.0.0.1:5173', localStorage: [releaseNotesSeen] },
        { origin: 'http://127.0.0.1:5174', localStorage: [releaseNotesSeen] },
      ],
    },
  },
  webServer: [{
    command: 'npm run dev -- --host 127.0.0.1 --port 5173', url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    env: { VITE_DEMO_MODE: 'true', VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
  }, {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI,
    env: { VITE_DEMO_MODE: 'false', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only' },
  }],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
