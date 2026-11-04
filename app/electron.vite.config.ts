import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

/** Drops `'unsafe-inline'` from the CSP in production builds; dev needs it for injected styles. */
function strictCspInBuild(): Plugin {
  return {
    name: 'msm:strict-csp-in-build',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(" style-src 'self' 'unsafe-inline'", " style-src 'self'");
    },
  };
}

export default defineConfig({
  // Main is ESM and bundles every dependency (ADR 0013: the packaged app collects no
  // node_modules). electron-vite still externalises `electron` and Node built-ins when
  // `externalizeDeps` is false. Main imports `@msm/core` only as types (ADR 0007).
  main: {
    build: { externalizeDeps: false },
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
    plugins: [react(), tailwindcss(), strictCspInBuild()],
    // Monaco's language workers are loaded with Vite `?worker` imports as ES module workers.
    worker: { format: 'es' },
  },
});
