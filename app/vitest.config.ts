import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Node is the default environment; component tests under `test/components/` opt into
// happy-dom with a `// @vitest-environment happy-dom` comment at the top of the file.
export default defineConfig({
  plugins: [react()],
  test: { include: ['test/**/*.test.{ts,tsx}'], environment: 'node' },
});
