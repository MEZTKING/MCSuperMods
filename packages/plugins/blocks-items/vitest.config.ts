import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // The set-up hook loads two targets' vendored indexes: heavy on a busy runner (2026-11-23).
    // An explicit hook timeout, never a retry.
    hookTimeout: 60_000,
  },
});
