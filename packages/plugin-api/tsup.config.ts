import { defineConfig } from 'tsup';

/**
 * The publishable build of `@msm/plugin-api` (ADR 0036 D7): ESM and CommonJS bundles with
 * declarations in `dist/`. Workspace packages keep importing `src/` through TypeScript project
 * references; `publishConfig` points the packed tarball at `dist/`.
 */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
  target: 'es2022',
  platform: 'neutral',
  outDir: 'dist',
  tsconfig: 'tsconfig.build.json',
});
