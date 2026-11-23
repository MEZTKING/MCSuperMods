import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The library's tests draw every art recipe in every colour and build all 265 starters and
    // examples: genuinely heavy work that ran 5.6 to 5.9 s per test on a loaded CI runner
    // (2026-11-23), past Vitest's 5 s default, while taking 1 to 2 s here. As the app does (15 s).
    testTimeout: 30_000,
  },
});
