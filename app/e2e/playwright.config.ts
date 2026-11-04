import { defineConfig } from 'playwright/test';

/**
 * Playwright-for-Electron end-to-end tests. Run `pnpm --filter @msm/app build` first; the tests
 * launch `out/main/index.js` with the Electron binary from `node_modules`. On Linux without a
 * display, run under `xvfb-run -a`.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: 'output/test-results',
  // One Electron instance at a time: parallel launches from the same folder hung in B21.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  forbidOnly: !!process.env.CI,
});
