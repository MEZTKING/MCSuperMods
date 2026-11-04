import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

// The renderer CSP keeps style-src 'unsafe-inline' in production: Monaco and Radix inject
// runtime <style> elements without nonce support. Scripts stay 'self' only (DEVLOG 2026-11-04).

/**
 * Copies each built-in target's vendored data into `out/main/vendor/<package folder>/` and
 * rewrites its `new URL('../vendor/…', import.meta.url)` to point there (plan D10). Vite does
 * not emit `new URL` assets in SSR builds, so without this the bundled main process would look
 * for the files next to `out/`.
 */
function bundleVendoredData(): Plugin {
  return {
    name: 'msm:bundle-vendored-data',
    apply: 'build',
    transform(code, id) {
      const match = /[\\/]packages[\\/]targets[\\/]([^\\/]+)[\\/]src[\\/]vendored\.ts$/.exec(id);
      if (match === null) return null;
      const folder = match[1] as string;
      const packageDir = join(dirname(id), '..');
      return code.replace(
        /new URL\((['"])\.\.\/vendor\/([^'"]+)\1, import\.meta\.url\)/g,
        (_whole, _quote, file: string) => {
          const fileName = `vendor/${folder}/${file}`;
          this.emitFile({
            type: 'asset',
            fileName,
            source: readFileSync(join(packageDir, 'vendor', ...file.split('/'))),
          });
          return `new URL(${JSON.stringify(`./${fileName}`)}, import.meta.url)`;
        },
      );
    },
  };
}

export default defineConfig({
  // Main is ESM and bundles every dependency (ADR 0013: the packaged app collects no
  // node_modules). electron-vite still externalises `electron` and Node built-ins when
  // `externalizeDeps` is false. Main imports `@msm/core` only as types (ADR 0007).
  main: {
    build: { externalizeDeps: false },
    plugins: [bundleVendoredData()],
    // fflate's Node build declares `var require = createRequire(...)`, which collides with the
    // `require` shim electron-vite adds to ESM main bundles. MSM uses only fflate's synchronous
    // API, which the browser build provides without workers.
    resolve: { alias: [{ find: /^fflate$/, replacement: 'fflate/browser' }] },
  },
  // A sandboxed preload must be a single CommonJS script. It imports only `electron` and the
  // dependency-free channel names.
  preload: {
    build: {
      externalizeDeps: false,
      rolldownOptions: {
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    build: { minify: true },
    plugins: [react(), tailwindcss()],
    // Monaco's language workers are loaded with Vite `?worker` imports as ES module workers.
    worker: { format: 'es' },
  },
});
