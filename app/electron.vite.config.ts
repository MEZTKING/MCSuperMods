import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { minify, type Plugin } from 'vite';

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

/**
 * Renderer-only: neutralises the `new URL('../vendor/…', import.meta.url)` expressions in each
 * target's `vendored.ts`. The renderer imports `@msm/targets` for the target facts but reads the
 * vendored data through main (`platform.targets.readVendored`, plan D10), so without this Vite
 * would copy several megabytes of JSON into `out/renderer/assets` that nothing loads. The URLs
 * become inert `msm-vendored:` URLs that are never fetched.
 */
function dropVendoredDataFromRenderer(): Plugin {
  return {
    name: 'msm:drop-vendored-data-from-renderer',
    enforce: 'pre',
    transform(code, id) {
      const match = /[\\/]packages[\\/]targets[\\/]([^\\/]+)[\\/]src[\\/]vendored\.ts$/.exec(id);
      if (match === null) return null;
      const folder = match[1] as string;
      return code.replace(
        /new URL\((['"])\.\.\/vendor\/([^'"]+)\1, import\.meta\.url\)/g,
        (_whole, _quote, file: string) =>
          `new URL(${JSON.stringify(`msm-vendored:${folder}/${file}`)})`,
      );
    },
  };
}

/**
 * Lazy main chunks that are minified: `scripting-engine-*.js` (ADR 0031 D2) bundles `typescript`
 * (about 8 MB as written, about 3.5 MB minified), and `ai-client-*.js` (ADR 0041 D2) bundles the
 * Claude SDK. Unminified they would push `app.asar` over its budget. The rest of main stays
 * unminified for readable stack traces.
 */
const MINIFIED_CHUNK_PREFIXES = ['scripting-engine', 'ai-client'] as const;

function minifyLazyChunks(prefixes: readonly string[] = MINIFIED_CHUNK_PREFIXES): Plugin {
  return {
    name: 'msm:minify-lazy-chunks',
    apply: 'build',
    enforce: 'post',
    // On the final bundle, after every other plugin has rendered the chunk.
    async generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        if (!prefixes.some((prefix) => output.fileName.startsWith(prefix))) continue;
        const result = await minify(output.fileName, output.code, {
          compress: true,
          mangle: true,
          sourcemap: false,
        });
        output.code = result.code;
      }
    },
  };
}

/** `@msm/ai/sdk` (`packages/ai/src/sdk/index.ts`), loaded with `import()` by main. */
const AI_SDK_ENTRY = /[\\/]packages[\\/]ai[\\/]src[\\/]sdk[\\/]index\.ts$/;

/** Modules of the Claude SDK package. */
const AI_SDK_MODULE =
  /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?@anthropic-ai[\\/]sdk[\\/]/;

/**
 * Main chunk file names: the dynamic import of `@msm/ai/sdk` would be named after its file
 * (`index-*.js`); it is named `ai-client-*.js` so the minifier and the size check find it. The
 * SDK's own lazy chunks (its Node helpers) become `ai-client-<name>-*.js` for the same reason.
 */
function mainChunkFileName(chunk: {
  name: string;
  facadeModuleId: string | null;
  moduleIds: readonly string[];
}): string {
  if (chunk.facadeModuleId !== null && AI_SDK_ENTRY.test(chunk.facadeModuleId)) {
    return 'ai-client-[hash].js';
  }
  if (chunk.moduleIds.length > 0 && chunk.moduleIds.every((id) => AI_SDK_MODULE.test(id))) {
    return 'ai-client-[name]-[hash].js';
  }
  return '[name]-[hash].js';
}

export default defineConfig({
  // Main is ESM and bundles every dependency (ADR 0013: the packaged app collects no
  // node_modules). electron-vite still externalises `electron` and Node built-ins when
  // `externalizeDeps` is false. Main imports `@msm/core` only as types (ADR 0007).
  main: {
    build: {
      externalizeDeps: false,
      // TypeScript only requires `source-map-support` from `tryEnableSourceMapsForHost`, which
      // MSM never calls; left external, the guarded `require` simply fails if ever reached.
      rolldownOptions: {
        external: ['source-map-support'],
        output: { chunkFileNames: mainChunkFileName },
      },
    },
    plugins: [bundleVendoredData(), minifyLazyChunks()],
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
    plugins: [dropVendoredDataFromRenderer(), react(), tailwindcss()],
    // Monaco's language workers are loaded with Vite `?worker` imports as ES module workers.
    worker: { format: 'es' },
  },
});
