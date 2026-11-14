import { defineConfig } from 'vitest/config';

// The typings tests run the TypeScript compiler over whole scripts; under a full parallel
// test run they take several times longer than alone, so the default 5 s timeout flakes.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node', testTimeout: 30_000 },
});
