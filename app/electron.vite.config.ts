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
  // Main is ESM and keeps `dependencies` external (default `build.externalizeDeps`); it only
  // imports `@msm/core` as types (ADR 0007).
  main: {},
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
    plugins: [react(), strictCspInBuild()],
  },
});
