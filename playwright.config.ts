import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const isCi = Boolean(process.env.CI);
const base = process.env.BASE_PATH ?? '/hotshoe/';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}${base}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // WebKit with an iPhone viewport. Not the same as iOS Safari; see the on-device checklist.
      // Runs in CI. Needs Ubuntu or Debian system libraries to run locally.
      name: 'iphone-webkit',
      use: { ...devices['iPhone 17'] },
    },
    {
      // Local stand-in for hosts that cannot run Playwright's WebKit build.
      name: 'iphone-chromium',
      use: { ...devices['iPhone 17'], browserName: 'chromium' },
    },
  ],
  webServer: {
    // Test the production build so the Content Security Policy is in force.
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: `http://localhost:${port}${base}`,
    reuseExistingServer: !isCi,
  },
});
