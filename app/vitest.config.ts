import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Node is the default environment; component tests under `test/components/` opt into
// happy-dom with a `// @vitest-environment happy-dom` comment at the top of the file.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    // The default 5 s timeout failed now and then for session and App tests when the whole
    // monorepo ran under Turborepo (each passed alone). A larger default replaces per-test
    // bumps; tests that need more still pass their own timeout.
    testTimeout: 15_000,
  },
});
