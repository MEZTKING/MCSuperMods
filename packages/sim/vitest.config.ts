import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The sim-parity fixture's check (`mod/` equals the lowering, B397) runs with the sim tests.
    include: ['test/**/*.test.ts', '../../fixtures/sim-parity/*.test.ts'],
    environment: 'node',
  },
});
