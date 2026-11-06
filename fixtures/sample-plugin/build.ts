// Builds the sample plugin into `dist/`: the same steps as the `scripts/build.mjs` that
// `node tools/new-plugin/index.ts <name> --external <dir>` writes (a test in `tools/new-plugin`
// keeps the two identical below the marker line). Run with `pnpm build`.
// --- build steps (shared with the scaffold) ---
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const run = promisify(execFile);

// The project root is the nearest folder above this script that holds `msm-plugin.json`.
let root = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(root, 'msm-plugin.json'))) {
  const parent = dirname(root);
  if (parent === root) throw new Error('build: no msm-plugin.json found above the build script');
  root = parent;
}
const manifestText = await readFile(join(root, 'msm-plugin.json'), 'utf8');
const manifest = JSON.parse(manifestText);
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 1. The bundle: one classic script with every import (including `@msm/plugin-api`) inlined.
// The app runs it as the top-level script of a sandboxed worker after its bootstrap, which
// provides `defineMsmPlugin` (ADR 0035 D1); the plugin hands itself over once.
await build({
  stdin: {
    contents: [
      "import plugin from './src/index.ts';",
      "if (typeof defineMsmPlugin !== 'function') {",
      "  throw new Error('This bundle runs inside MCSuperMods only: defineMsmPlugin is missing.');",
      '}',
      'defineMsmPlugin(plugin);',
      '',
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'msm-plugin-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'neutral',
  charset: 'utf8',
  legalComments: 'none',
  outfile: join(dist, manifest.main),
  logLevel: 'warning',
});

// 2. The schema export: every `mcdoc/*.mcdoc` file under the module folder named after the
// plugin's namespace (the id up to the first dot), exported with mcdoc-cli. mcdoc-cli 0.1.63
// lists no project-root files without a file watcher, so the temporary project's
// `spyglass.json` names its own source folder as a directory dependency (as
// `tools/sync-mcdoc` and `tools/build-msm-mcdoc` do in the MCSuperMods repository).
const schemas = manifest.schemas ?? [];
if (schemas.length > 0) {
  const namespace = String(manifest.id).replace(/\..*$/, '');
  const names = (await readdir(join(root, 'mcdoc')))
    .filter((name) => name.endsWith('.mcdoc'))
    .sort();
  if (names.length === 0) throw new Error('build: no .mcdoc files in mcdoc/');
  const hash = createHash('sha256');
  const work = await mkdtemp(join(tmpdir(), 'msm-plugin-mcdoc-'));
  try {
    // Spyglass lowercases a Windows drive letter when it normalises a file URI but compares
    // roots case-sensitively, so a folder on `D:` would match no root and export no types;
    // the source path (for `--source`) and its URL use the lowercase form from the start.
    const source = join(work, 'src').replace(/^[A-Z]:/, (drive) => drive.toLowerCase());
    await mkdir(join(source, namespace), { recursive: true });
    for (const name of names) {
      const text = (await readFile(join(root, 'mcdoc', name), 'utf8')).replaceAll('\r\n', '\n');
      hash.update(`${name}\u0000${text}\u0000`);
      await writeFile(join(source, namespace, name), text);
    }
    let sourceUrl = pathToFileURL(source).toString();
    if (!sourceUrl.endsWith('/')) sourceUrl += '/';
    await writeFile(
      join(source, 'spyglass.json'),
      `${JSON.stringify({ env: { dependencies: [sourceUrl] } })}\n`,
    );
    const require = createRequire(join(root, 'package.json'));
    const cliManifest = require.resolve('@spyglassmc/mcdoc-cli/package.json');
    const cli = join(
      dirname(cliManifest),
      JSON.parse(await readFile(cliManifest, 'utf8')).bin.mcdoc,
    );
    const output = join(work, 'symbols.json');
    // mcdoc-cli writes its cache to `<cwd>/.cache`, so cwd is the temporary folder.
    await run(process.execPath, [cli, 'export', output, '--source', source], { cwd: work });
    const exported = JSON.parse(await readFile(output, 'utf8'));
    const types = Object.keys(exported.mcdoc ?? {});
    if (types.length === 0) throw new Error('build: the mcdoc export has no types');
    // The app refuses types and dispatchers outside the plugin's namespace.
    const outside = [
      ...types.filter((path) => !path.startsWith(`::${namespace}::`)),
      ...Object.keys(exported['mcdoc/dispatcher'] ?? {}).filter(
        (registry) => !registry.startsWith(`${namespace}:`),
      ),
    ];
    if (outside.length > 0) {
      throw new Error(`build: outside the namespace ${namespace}: ${outside.join(', ')}`);
    }
    const symbols = {
      ref: `${manifest.id}@${manifest.version}:sha256:${hash.digest('hex')}`,
      mcdoc: exported.mcdoc,
      'mcdoc/dispatcher': exported['mcdoc/dispatcher'] ?? {},
    };
    await writeFile(join(dist, schemas[0]), `${JSON.stringify(symbols, null, 2)}\n`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// 3. The manifest, unchanged: its `main` and `schemas` paths are relative to `dist/`, which is
// the folder a user copies into `~/.msm/plugins/<folder>/`.
await copyFile(join(root, 'msm-plugin.json'), join(dist, 'msm-plugin.json'));
for (const file of ['msm-plugin.json', manifest.main, ...schemas]) {
  if (!existsSync(join(dist, file))) throw new Error(`build: dist/${file} was not written`);
}
console.log(`build: wrote dist/ (${['msm-plugin.json', manifest.main, ...schemas].join(', ')})`);
