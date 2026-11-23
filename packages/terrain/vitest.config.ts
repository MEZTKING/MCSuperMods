import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The engine's tests generate worlds and assemble whole structures over hundreds of seeds
    // (the structures parity town: 5.6 to 6.3 s on a loaded CI runner, 2026-11-23, against
    // Vitest's 5 s default): genuinely heavy, as the library's and the app's tests (30 s, 15 s).
    testTimeout: 30_000,
  },
});
