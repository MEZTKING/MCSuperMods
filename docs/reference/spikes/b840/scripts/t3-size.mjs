// B840 T3: the kit renderer's size as a lazy chunk. Two builds of spike-src/kit-renderer.tsx
// with esbuild (minified, the app's own minifier differs a little): (a) the app's modules,
// React, Radix and lucide external, as they are already in the app's chunks: the kit's own
// glue; (b) only React, React DOM, Radix and lucide external: the upper bound if none of the
// app's parts were shared. Run from the repository root: node docs/reference/spikes/b840/scripts/t3-size.mjs
import { createRequire } from 'node:module';
const { build } = createRequire(resolve('fixtures/sample-plugin/package.json'))('esbuild');
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const entry = resolve('docs/reference/spikes/b840/spike-src/kit-renderer.tsx');
const appSrc = resolve('app/src/renderer/src');
const shared = ['react', 'react-dom', 'react/jsx-runtime', '@radix-ui/*', 'lucide-react'];
const appExternal = {
  name: 'app-external',
  setup(b) {
    b.onResolve({ filter: /app\/src\/renderer\/src\// }, (args) => ({ path: args.path, external: true }));
  },
};
const out = {};
// BundleLiveView is an existing lazy chunk of the app in every build.
const liveViewExternal = {
  name: 'live-view-external',
  setup(b) {
    b.onResolve({ filter: /liveviews\/BundleLiveView$/ }, (args) => ({ path: args.path, external: true }));
  },
};
const ui = {
  name: 'only-ui-bundled',
  setup(b) {
    b.onResolve({ filter: /app\/src\/renderer\/src\/studios\// }, (args) => ({ path: args.path, external: true }));
  },
};
for (const [name, plugins] of [
  ['glue (app parts shared)', [appExternal]],
  ['with components/ui bundled, Studio parts shared', [liveViewExternal, ui]],
  ['with every app part it imports bundled', [liveViewExternal]],
]) {
  const r = await build({ entryPoints: [entry], bundle: true, write: false, metafile: true, minify: true, format: 'esm', jsx: 'automatic', external: shared, plugins, absWorkingDir: resolve('app'), logLevel: 'error', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.svg': 'text', '.png': 'empty', '.css': 'empty' } });
  const js = r.outputFiles.map((f) => f.contents);
  const bytes = js.reduce((n, b) => n + b.byteLength, 0);
  const gz = js.reduce((n, b) => n + gzipSync(b).byteLength, 0);
  const top = Object.entries(r.metafile.inputs).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 5).map(([p, i]) => `${p.split('/src/').pop()} ${Math.round(i.bytes / 1024)} KB`);
  out[name] = { inputs: Object.keys(r.metafile.inputs).length, largestInputs: top, rawKB: +(bytes / 1024).toFixed(1), gzipKB: +(gz / 1024).toFixed(1) };
}
console.log(JSON.stringify(out, null, 1));
