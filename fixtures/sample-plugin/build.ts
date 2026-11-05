/**
 * Placeholder build of the sample external plugin: bundles `src/main.ts` into `dist/main.js`
 * with esbuild. B157 extends it with `dist/symbols.json` and `dist/msm-plugin.json`.
 */

import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: 'dist/main.js',
  logLevel: 'warning',
});
