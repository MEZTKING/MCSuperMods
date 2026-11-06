/**
 * Scaffolds a built-in MSM plugin package, or a standalone external plugin project.
 *
 * Usage:
 *   node tools/new-plugin/index.ts <name> [--root <repo-root>]
 *   node tools/new-plugin/index.ts <name> --external <dir>
 *
 * Creates `packages/plugins/<name>/` as the package `@msm/plugin-<name>` with the layout
 * from `packages/plugins/CLAUDE.md` (`src/index.ts`, `src/kinds/`, `src/lowering/`,
 * `test/plugin.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`), refuses to
 * overwrite an existing folder, adds the package to the root `tsconfig.json` references
 * (sorted by path) and prints the next steps. `--root` defaults to this repository; tests
 * pass a temporary directory.
 *
 * With `--external <dir>` it instead writes a standalone third-party plugin project into
 * `<dir>` (which must not exist): `msm-plugin-<name>` with the manifest of ADR 0035 D2, one
 * element kind `<name>:example` and one template, an mcdoc type, an esbuild build that writes
 * the installable `dist/` folder, a test and a README. See {@link scaffoldExternalPlugin}.
 *
 * Only erasable TypeScript syntax and `node:` imports are allowed here.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** The `@msm/plugin-api` package version, which names the release tarball. */
const PLUGIN_API_PACKAGE_VERSION = (
  JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        'packages',
        'plugin-api',
        'package.json',
      ),
      'utf8',
    ),
  ) as { version: string }
).version;

/** Valid plugin folder names: lower-case, starting with a letter. */
export const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** The plugin API range a freshly scaffolded plugin declares. */
export const SCAFFOLD_API_RANGE = '^1.0.0';

export class NewPluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NewPluginError';
  }
}

export interface ScaffoldResult {
  /** Package name, e.g. `@msm/plugin-resourcepack`. */
  packageName: string;
  /** Plugin directory relative to the root, POSIX separators. */
  dir: string;
  /** Every file written, relative to the root, POSIX separators, sorted. */
  files: string[];
  /** Whether the root `tsconfig.json` gained a reference (false when it has none to edit). */
  tsconfigUpdated: boolean;
}

/** Throws a {@link NewPluginError} unless `name` is a valid plugin folder name. */
export function validatePluginName(name: string): void {
  if (!PLUGIN_NAME_PATTERN.test(name)) {
    throw new NewPluginError(
      `Invalid plugin name ${JSON.stringify(name)}: it must match ${PLUGIN_NAME_PATTERN}.`,
    );
  }
}

const VITEST_CONFIG = `import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } });
`;

/** The files of a new plugin, keyed by path relative to the plugin folder. */
export function pluginFiles(name: string): Record<string, string> {
  const packageName = `@msm/plugin-${name}`;
  const id = `msm.${name}`;
  const packageJson = {
    name: packageName,
    version: '0.0.0',
    private: true,
    license: 'MIT',
    type: 'module',
    exports: { '.': { types: './src/index.ts', default: './src/index.ts' } },
    scripts: { test: 'vitest run' },
    dependencies: { '@msm/plugin-api': 'workspace:*', '@msm/schemas': 'workspace:*' },
    devDependencies: {
      '@msm/targets': 'workspace:*',
      '@types/node': 'catalog:',
      vitest: 'catalog:',
    },
  };
  const tsconfig = `{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist-types",
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"],
  "references": [
    { "path": "../../plugin-api" },
    { "path": "../../schemas" },
    { "path": "../../targets/all" }
  ]
}
`;
  return {
    'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
    'tsconfig.json': tsconfig,
    'vitest.config.ts': VITEST_CONFIG,
    'src/index.ts': `/**
 * \`${packageName}\`: built-in MSM plugin.
 */
import { definePlugin } from '@msm/plugin-api';

export default definePlugin({
  id: '${id}',
  apiVersion: '${SCAFFOLD_API_RANGE}',
  contributes: {},
});
`,
    'src/kinds/index.ts': `/**
 * Element kinds contributed by \`${packageName}\`. One module per kind; none yet.
 */
export {};
`,
    'src/lowering/index.ts': `/**
 * Pure lowering functions (\`lower(element, target) -> OutputFile[]\`) for
 * \`${packageName}\`. None yet.
 */
export {};
`,
    'test/plugin.test.ts': `import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('${packageName}', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('${id}');
    expect(plugin.apiVersion).toBe('${SCAFFOLD_API_RANGE}');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});
`,
  };
}

interface TsconfigReference {
  path: string;
  [key: string]: unknown;
}

/**
 * Returns the root `tsconfig.json` text with `path` added to `references`, sorted by path,
 * or `undefined` when the reference is already present.
 */
export function addTsconfigReference(text: string, path: string): string | undefined {
  const config = JSON.parse(text) as { references?: TsconfigReference[] } & Record<string, unknown>;
  const references = config.references ?? [];
  if (references.some((reference) => reference.path === path)) return undefined;
  config.references = [...references, { path }].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  // Keep `{ "path": "…" }` entries on one line, as Biome formats them.
  return `${JSON.stringify(config, null, 2).replace(/\{\n\s+"path": ("[^"\n]*")\n\s+\}/g, '{ "path": $1 }')}\n`;
}

/** Creates the plugin package under `root`. */
export function scaffoldPlugin(root: string, name: string): ScaffoldResult {
  validatePluginName(name);
  const dir = `packages/plugins/${name}`;
  const absoluteDir = join(root, dir);
  if (existsSync(absoluteDir)) {
    throw new NewPluginError(`${dir} already exists; refusing to overwrite it.`);
  }
  const files = pluginFiles(name);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(absoluteDir, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, { flag: 'wx' });
  }
  let tsconfigUpdated = false;
  const tsconfigPath = join(root, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    const updated = addTsconfigReference(readFileSync(tsconfigPath, 'utf8'), dir);
    if (updated !== undefined) {
      writeFileSync(tsconfigPath, updated);
      tsconfigUpdated = true;
    }
  }
  return {
    packageName: `@msm/plugin-${name}`,
    dir,
    files: Object.keys(files)
      .map((file) => `${dir}/${file}`)
      .sort(),
    tsconfigUpdated,
  };
}

// --- External plugins (`--external <dir>`) -------------------------------------------------

/** Names an external plugin may not take: the reserved namespaces of ADR 0035 D2. */
export const RESERVED_EXTERNAL_NAMES: readonly string[] = ['minecraft', 'msm'];

/**
 * The devDependencies of a scaffolded external plugin. The versions follow the repository's
 * pnpm catalog (a test compares them); `@spyglassmc/mcdoc-cli` is pinned exactly because the
 * build's `spyglass.json` workaround depends on its behaviour.
 */
export const EXTERNAL_DEV_DEPENDENCIES: Readonly<Record<string, string>> = {
  '@msm/plugin-api': SCAFFOLD_API_RANGE,
  '@spyglassmc/mcdoc-cli': '0.1.63',
  esbuild: '^0.28.2',
  typescript: '^6.0.3',
  vitest: '^5.1.0',
};

/** The contribution points a manifest may declare (ADR 0035 D2). */
export const MANIFEST_CAPABILITIES: readonly string[] = [
  'elementKinds',
  'elementTemplates',
  'projectStarters',
  'examples',
  'validators',
  'exporters',
  'importers',
];

// The rules below are copied from the app's manifest schema (`pluginManifestSchema` in
// `app/src/shared/ipc-contract.ts`, constants in `app/src/shared/ipc-channels.ts`), which
// `tools/` cannot import. Keep them in step.

/** Plugin ids (ADR 0035 D2). */
export const MANIFEST_ID_PATTERN = /^[a-z][a-z0-9.-]*$/;
/** A plugin's own version: semver `x.y.z` with optional pre-release and build parts. */
export const MANIFEST_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
/** The characters of a semver range; the app evaluates the range itself with `semver`. */
export const MANIFEST_RANGE_PATTERN = /^[0-9A-Za-z.^~<>=|*+ -]+$/;
/** The most schema files a manifest may list. */
export const MANIFEST_SCHEMAS_MAX = 16;
/** Every field a manifest may have; the app refuses unknown fields. */
export const MANIFEST_FIELDS: readonly string[] = [
  'manifestVersion',
  'id',
  'name',
  'version',
  'apiVersion',
  'main',
  'schemas',
  'capabilities',
  'description',
  'author',
  'licence',
  'homepage',
];

/** The namespace of a plugin id: its first `.`-separated segment. */
export function manifestNamespace(id: string): string {
  return id.split('.')[0] ?? id;
}

/**
 * Whether `path` is a relative POSIX path that stays inside the plugin folder: not empty, no
 * leading `/`, no drive letter, no backslash, no empty, `.` or `..` segment (the rule of the
 * app's `isProjectRelativePath`).
 */
export function isPluginRelativePath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\') || /^[A-Za-z]:/.test(path)) {
    return false;
  }
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * Checks a parsed `msm-plugin.json` against the rules of the app's manifest schema
 * (ADR 0035 D2) and returns the problems, empty when it is valid.
 */
export function validateManifest(manifest: unknown): string[] {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    return ['the manifest must be a JSON object'];
  }
  const m = manifest as Record<string, unknown>;
  const problems: string[] = [];
  const text = (key: string, max: number, required: boolean): string | undefined => {
    const value = m[key];
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'string' || value.length > max || (required && value.trim() === '')) {
      problems.push(
        `${key}: must be a${required ? ' non-empty' : ''} string of at most ${max} characters`,
      );
      return undefined;
    }
    return value;
  };
  const relativePath = (value: unknown, where: string): void => {
    if (typeof value !== 'string' || value.length > 512 || !isPluginRelativePath(value)) {
      problems.push(`${where}: must be a relative path inside the plugin folder`);
    }
  };
  for (const key of Object.keys(m)) {
    if (!MANIFEST_FIELDS.includes(key)) problems.push(`${key}: unknown field`);
  }
  if (m.manifestVersion !== 1) problems.push('manifestVersion: must be 1');
  const id = text('id', 64, true);
  if (id !== undefined) {
    if (!MANIFEST_ID_PATTERN.test(id)) problems.push(`id: must match ${MANIFEST_ID_PATTERN}`);
    else if (id.startsWith('msm.')) problems.push('id: must not start with "msm."');
    else if (RESERVED_EXTERNAL_NAMES.includes(manifestNamespace(id))) {
      problems.push('id: must not use the minecraft or msm namespace');
    }
  }
  text('name', 80, true);
  const version = text('version', 64, true);
  if (version !== undefined && !MANIFEST_VERSION_PATTERN.test(version)) {
    problems.push('version: must be semver');
  }
  const apiVersion = text('apiVersion', 64, true);
  if (apiVersion !== undefined && !MANIFEST_RANGE_PATTERN.test(apiVersion.trim())) {
    problems.push('apiVersion: must be a semver range');
  }
  relativePath(m.main, 'main');
  if (m.schemas !== undefined) {
    if (!Array.isArray(m.schemas) || m.schemas.length > MANIFEST_SCHEMAS_MAX) {
      problems.push(`schemas: must be an array of at most ${MANIFEST_SCHEMAS_MAX} paths`);
    } else {
      m.schemas.forEach((schema, index) => {
        relativePath(schema, `schemas/${index}`);
      });
    }
  }
  if (!Array.isArray(m.capabilities) || m.capabilities.length > MANIFEST_CAPABILITIES.length) {
    problems.push('capabilities: must be an array of capabilities');
  } else {
    m.capabilities.forEach((capability, index) => {
      if (typeof capability !== 'string' || !MANIFEST_CAPABILITIES.includes(capability)) {
        problems.push(`capabilities/${index}: must be one of ${MANIFEST_CAPABILITIES.join(', ')}`);
      }
    });
  }
  text('description', 1000, false);
  text('author', 200, false);
  text('licence', 100, false);
  const homepage = text('homepage', 512, false);
  if (homepage !== undefined && !/^https:\/\/\S+$/.test(homepage)) {
    problems.push('homepage: must be an https: URL');
  }
  return problems;
}

/** Throws a {@link NewPluginError} unless `name` is a valid external plugin name. */
export function validateExternalPluginName(name: string): void {
  validatePluginName(name);
  if (RESERVED_EXTERNAL_NAMES.includes(name)) {
    throw new NewPluginError(
      `Invalid plugin name ${JSON.stringify(name)}: the namespaces ${RESERVED_EXTERNAL_NAMES.join(' and ')} are reserved.`,
    );
  }
}

/** `my-thing` → `My thing`. */
function displayName(name: string): string {
  const words = name.replaceAll('-', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/**
 * The build steps of `scripts/build.mjs`, below its marker line. The sample plugin's
 * `fixtures/sample-plugin/build.ts` holds the same text below the same line (a test compares
 * them), so change both together.
 */
export const EXTERNAL_BUILD_STEPS = `import { execFile } from 'node:child_process';
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

// The project root is the nearest folder above this script that holds \`msm-plugin.json\`.
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

// 1. The bundle: one classic script with every import (including \`@msm/plugin-api\`) inlined.
// The app runs it as the top-level script of a sandboxed worker after its bootstrap, which
// provides \`defineMsmPlugin\` (ADR 0035 D1); the plugin hands itself over once.
await build({
  stdin: {
    contents: [
      "import plugin from './src/index.ts';",
      "if (typeof defineMsmPlugin !== 'function') {",
      "  throw new Error('This bundle runs inside MCSuperMods only: defineMsmPlugin is missing.');",
      '}',
      'defineMsmPlugin(plugin);',
      '',
    ].join('\\n'),
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

// 2. The schema export: every \`mcdoc/*.mcdoc\` file under the module folder named after the
// plugin's namespace (the id up to the first dot), exported with mcdoc-cli. mcdoc-cli 0.1.63
// lists no project-root files without a file watcher, so the temporary project's
// \`spyglass.json\` names its own source folder as a directory dependency (as
// \`tools/sync-mcdoc\` and \`tools/build-msm-mcdoc\` do in the MCSuperMods repository).
const schemas = manifest.schemas ?? [];
if (schemas.length > 0) {
  const namespace = String(manifest.id).replace(/\\..*$/, '');
  const names = (await readdir(join(root, 'mcdoc')))
    .filter((name) => name.endsWith('.mcdoc'))
    .sort();
  if (names.length === 0) throw new Error('build: no .mcdoc files in mcdoc/');
  const hash = createHash('sha256');
  const work = await mkdtemp(join(tmpdir(), 'msm-plugin-mcdoc-'));
  try {
    const source = join(work, 'src');
    await mkdir(join(source, namespace), { recursive: true });
    for (const name of names) {
      const text = (await readFile(join(root, 'mcdoc', name), 'utf8')).replaceAll('\\r\\n', '\\n');
      hash.update(\`\${name}\\u0000\${text}\\u0000\`);
      await writeFile(join(source, namespace, name), text);
    }
    let sourceUrl = pathToFileURL(source).toString();
    if (!sourceUrl.endsWith('/')) sourceUrl += '/';
    await writeFile(
      join(source, 'spyglass.json'),
      \`\${JSON.stringify({ env: { dependencies: [sourceUrl] } })}\\n\`,
    );
    const require = createRequire(join(root, 'package.json'));
    const cliManifest = require.resolve('@spyglassmc/mcdoc-cli/package.json');
    const cli = join(
      dirname(cliManifest),
      JSON.parse(await readFile(cliManifest, 'utf8')).bin.mcdoc,
    );
    const output = join(work, 'symbols.json');
    // mcdoc-cli writes its cache to \`<cwd>/.cache\`, so cwd is the temporary folder.
    await run(process.execPath, [cli, 'export', output, '--source', source], { cwd: work });
    const exported = JSON.parse(await readFile(output, 'utf8'));
    const types = Object.keys(exported.mcdoc ?? {});
    if (types.length === 0) throw new Error('build: the mcdoc export has no types');
    // The app refuses types and dispatchers outside the plugin's namespace.
    const outside = [
      ...types.filter((path) => !path.startsWith(\`::\${namespace}::\`)),
      ...Object.keys(exported['mcdoc/dispatcher'] ?? {}).filter(
        (registry) => !registry.startsWith(\`\${namespace}:\`),
      ),
    ];
    if (outside.length > 0) {
      throw new Error(\`build: outside the namespace \${namespace}: \${outside.join(', ')}\`);
    }
    const symbols = {
      ref: \`\${manifest.id}@\${manifest.version}:sha256:\${hash.digest('hex')}\`,
      mcdoc: exported.mcdoc,
      'mcdoc/dispatcher': exported['mcdoc/dispatcher'] ?? {},
    };
    await writeFile(join(dist, schemas[0]), \`\${JSON.stringify(symbols, null, 2)}\\n\`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// 3. The manifest, unchanged: its \`main\` and \`schemas\` paths are relative to \`dist/\`, which is
// the folder a user copies into \`~/.msm/plugins/<folder>/\`.
await copyFile(join(root, 'msm-plugin.json'), join(dist, 'msm-plugin.json'));
for (const file of ['msm-plugin.json', manifest.main, ...schemas]) {
  if (!existsSync(join(dist, file))) throw new Error(\`build: dist/\${file} was not written\`);
}
console.log(\`build: wrote dist/ (\${['msm-plugin.json', manifest.main, ...schemas].join(', ')})\`);
`;

/** The marker line between a build script's header comment and {@link EXTERNAL_BUILD_STEPS}. */
export const BUILD_STEPS_MARKER = '// --- build steps (shared with the scaffold) ---';

/** The files of a new external plugin project, keyed by path relative to its folder. */
export function externalPluginFiles(name: string): Record<string, string> {
  validateExternalPluginName(name);
  const packageName = `msm-plugin-${name}`;
  const title = displayName(name);
  const kind = `${name}:example`;
  const schema = `::${name}::${name}::Example`;
  const packageJson = {
    name: packageName,
    version: '0.1.0',
    description: `${title}: a plugin for MCSuperMods.`,
    license: 'MIT',
    private: false,
    type: 'module',
    scripts: {
      build: 'node scripts/build.mjs',
      check: 'tsc --noEmit',
      test: 'vitest run',
    },
    devDependencies: { ...EXTERNAL_DEV_DEPENDENCIES },
  };
  const manifest = {
    apiVersion: SCAFFOLD_API_RANGE,
    capabilities: ['elementKinds', 'elementTemplates'],
    description: `${title}: a plugin for MCSuperMods.`,
    id: name,
    licence: 'MIT',
    main: 'main.js',
    manifestVersion: 1,
    name: title,
    schemas: ['symbols.json'],
    version: '0.1.0',
  };
  const tsconfig = {
    compilerOptions: {
      strict: true,
      target: 'es2022',
      lib: ['ES2022'],
      module: 'esnext',
      moduleResolution: 'bundler',
      types: [],
      noEmit: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      skipLibCheck: true,
    },
    include: ['src', 'test'],
  };
  return {
    '.gitignore': 'node_modules/\ndist/\n',
    // pnpm refuses unreviewed install scripts; esbuild's only fetches a binary that its
    // platform package already provides.
    'pnpm-workspace.yaml': 'allowBuilds:\n  esbuild: false\n',
    'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
    'tsconfig.json': `${JSON.stringify(tsconfig, null, 2)}\n`,
    'msm-plugin.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'src/index.ts': `/**
 * \`${name}\`: a plugin for MCSuperMods.
 *
 * The app runs the bundle (\`dist/main.js\`) in a sandboxed worker: no Node, DOM, network or
 * storage APIs, and every function must return plain data. Import nothing but
 * \`@msm/plugin-api\`; the build inlines it.
 */
import {
  definePlugin,
  type Element,
  type ElementKind,
  type ElementTemplate,
  type OutputFile,
  type TargetFacts,
} from '@msm/plugin-api';

/** The kind id: the namespace must be neither \`minecraft\` nor \`msm\`. */
export const EXAMPLE_KIND = '${kind}';

/** The mcdoc type of the kind's data, exported to \`dist/symbols.json\` from \`mcdoc/${name}.mcdoc\`. */
export const EXAMPLE_SCHEMA = '${schema}';

/**
 * Lowers an example element to one language key, \`<ns>.example.<path>\`, in
 * \`assets/<ns>/lang/en_us.json\` (declared \`merge: 'object'\`, so several elements share the
 * file). Folder names come from the target, never from a version literal.
 */
export function lowerExample(element: Element, target: TargetFacts): OutputFile[] {
  const colon = element.id.indexOf(':');
  const namespace = element.id.slice(0, colon);
  const path = element.id.slice(colon + 1);
  const data = element.data;
  const text =
    typeof data === 'object' && data !== null && !Array.isArray(data) && typeof data.text === 'string'
      ? data.text
      : '';
  return [
    {
      path: \`assets/\${namespace}/\${target.folders.resource.lang}/en_us.json\`,
      contents: { [\`\${namespace}.example.\${path.replaceAll('/', '.')}\`]: text },
      layer: 'resourcepack',
      schema: '::java::assets::lang::Lang',
      merge: 'object',
    },
  ];
}

const exampleKind: ElementKind = {
  id: EXAMPLE_KIND,
  schema: EXAMPLE_SCHEMA,
  folder: '${name}_example',
  defaultData: { text: '' },
  lower: lowerExample,
};

const exampleTemplate: ElementTemplate = {
  id: '${name}-example',
  kind: EXAMPLE_KIND,
  title: 'Example',
  description: 'One language key with a short text.',
  category: '${title}',
  data: ({ path }) => ({ text: \`Hello from \${path}\` }),
};

export default definePlugin({
  id: '${name}',
  apiVersion: '${SCAFFOLD_API_RANGE}',
  contributes: {
    elementKinds: [exampleKind],
    elementTemplates: [exampleTemplate],
  },
});
`,
    [`mcdoc/${name}.mcdoc`]: `// The data of a \`${kind}\` element. The build exports this folder to \`dist/symbols.json\`
// under the module folder \`${name}\` (the plugin id up to the first dot), so the type is
// \`${schema}\`.

/// One language key.
struct Example {
	/// The text of the key.
	text: string,
}
`,
    'scripts/build.mjs': `// Builds the plugin into \`dist/\`, the folder a user copies into
// \`~/.msm/plugins/<folder>/\`: \`main.js\` (esbuild, one classic script with every import
// inlined), \`symbols.json\` (the mcdoc export of \`mcdoc/\`) and \`msm-plugin.json\`.
// Run with \`npm run build\` or \`pnpm build\`.
${BUILD_STEPS_MARKER}
${EXTERNAL_BUILD_STEPS}`,
    'test/plugin.test.ts': `import type { Element, TargetFacts } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

/** A hand-written target: only the facts the plugin reads need realistic values. */
const target = {
  id: 'mc-test',
  mcVersion: 'test',
  channel: 'release',
  java: 25,
  packFormats: { resource: { major: 1, minor: 0 }, data: { major: 1, minor: 0 } },
  mcdocRef: 'test',
  mcmetaRef: 'test',
  folders: { resource: { lang: 'lang' }, data: { function: 'function', tags: 'tags' } },
  dataVersion: 1,
  worldgen: { featureSteps: [] },
} as unknown as TargetFacts;

const element: Element = {
  formatVersion: 1,
  id: 'demo:greeting',
  kind: '${kind}',
  data: { text: 'Hello' },
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
};

describe('${name}', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('${name}');
    expect(plugin.apiVersion).toBe('${SCAFFOLD_API_RANGE}');
  });

  it('lowers an element to a language key', async () => {
    const kind = plugin.contributes.elementKinds?.[0];
    if (kind === undefined) throw new Error('no element kind');
    const files = await kind.lower(element, target);
    expect(files.map((file) => file.path)).toEqual(['assets/demo/lang/en_us.json']);
    const parsed: unknown = JSON.parse(JSON.stringify(files[0]?.contents));
    expect(parsed).toEqual({ 'demo.example.greeting': 'Hello' });
  });
});
`,
    'README.md': `# ${title}

A plugin for [MCSuperMods](https://github.com/MEZTKING/MCSuperMods), made with \`tools/new-plugin --external\`. It adds the element kind \`${kind}\` (one language key) and the template "Example" in the "${title}" group of Add element.

## Files

- \`msm-plugin.json\`: the manifest. \`main\` and \`schemas\` are relative to the installed folder (the contents of \`dist/\`); \`capabilities\` lists every contribution point \`src/index.ts\` uses (\`elementKinds\`, \`elementTemplates\`, \`projectStarters\`, \`examples\`, \`validators\`, \`exporters\`, \`importers\`). The app refuses a plugin that contributes a point it did not declare. Custom editors, commands and targets are not available to external plugins.
- \`src/index.ts\`: the plugin. Ids must start with your own namespace (\`${name}\`), never \`minecraft\` or \`msm\`.
- \`mcdoc/${name}.mcdoc\`: the data types; the app draws the element form from them. Types live under \`::${name}\`.
- \`scripts/build.mjs\`: the build. \`test/plugin.test.ts\`: the tests.

## Set up

\`@msm/plugin-api\` is not on npm yet. Until it is, download \`msm-plugin-api-<version>.tgz\` from the MCSuperMods Releases page, put it next to this folder and point the dependency at it:

\`\`\`sh
pnpm add -D ../msm-plugin-api-${PLUGIN_API_PACKAGE_VERSION}.tgz   # or: npm install -D ../msm-plugin-api-${PLUGIN_API_PACKAGE_VERSION}.tgz
\`\`\`

Then install the rest with \`pnpm install\` (or \`npm install\`).

## Build, test, check

\`\`\`sh
pnpm build   # writes dist/main.js, dist/symbols.json, dist/msm-plugin.json
pnpm test    # vitest
pnpm check   # tsc --noEmit
\`\`\`

## Install into MCSuperMods

1. Run \`pnpm build\`.
2. Copy the contents of \`dist/\` into \`~/.msm/plugins/${name}/\` (or \`$MSM_HOME/plugins/${name}/\` when \`MSM_HOME\` is set).
3. Restart MCSuperMods. Settings, Plugins lists "${title}" with its state (loaded, or refused or failed with the reason); Add element offers "Example" under "${title}".

Plugins run in a sandboxed worker with time limits per call; a plugin that is too slow or crashes is marked failed until the next restart.
`,
  };
}

export interface ExternalScaffoldResult {
  /** Package name, e.g. `msm-plugin-greetings`. */
  packageName: string;
  /** The absolute project folder. */
  dir: string;
  /** Every file written, relative to {@link ExternalScaffoldResult.dir}, POSIX separators, sorted. */
  files: string[];
}

/** Creates a standalone external plugin project in `dir`, which must not exist. */
export function scaffoldExternalPlugin(dir: string, name: string): ExternalScaffoldResult {
  validateExternalPluginName(name);
  const absoluteDir = resolve(dir);
  if (existsSync(absoluteDir)) {
    throw new NewPluginError(`${absoluteDir} already exists; refusing to overwrite it.`);
  }
  const files = externalPluginFiles(name);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(absoluteDir, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, { flag: 'wx' });
  }
  return { packageName: `msm-plugin-${name}`, dir: absoluteDir, files: Object.keys(files).sort() };
}

const USAGE =
  'Usage: node tools/new-plugin/index.ts <name> [--root <repo-root>]\n' +
  '       node tools/new-plugin/index.ts <name> --external <dir>';

function mainExternal(name: string, dir: string): void {
  const result = scaffoldExternalPlugin(dir, name);
  console.log(`new-plugin: created the external plugin ${result.packageName} in ${result.dir}`);
  for (const file of result.files) console.log(`  ${file}`);
  console.log('Next steps (in that folder):');
  console.log(
    '  1. Add @msm/plugin-api: pnpm add -D <path to msm-plugin-api-<version>.tgz> (see README.md)',
  );
  console.log('  2. pnpm install');
  console.log('  3. pnpm test && pnpm check && pnpm build');
  console.log(
    `  4. Copy the contents of dist/ into ~/.msm/plugins/${name}/ and restart MCSuperMods.`,
  );
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: 'string' }, external: { type: 'string' } },
  });
  const name = positionals[0];
  if (name === undefined || positionals.length !== 1) {
    console.error(USAGE);
    process.exit(2);
  }
  if (values.external !== undefined && values.root !== undefined) {
    console.error(`new-plugin: --root and --external cannot be combined.\n${USAGE}`);
    process.exit(2);
  }
  try {
    if (values.external !== undefined) {
      mainExternal(name, values.external);
      return;
    }
    const root = resolve(values.root ?? fileURLToPath(new URL('../..', import.meta.url)));
    const result = scaffoldPlugin(root, name);
    console.log(`new-plugin: created ${result.packageName} in ${result.dir}`);
    for (const file of result.files) console.log(`  ${file}`);
    console.log(
      result.tsconfigUpdated
        ? '  tsconfig.json (reference added)'
        : '  tsconfig.json not changed (missing, or reference already present)',
    );
    console.log('Next steps:');
    console.log('  1. pnpm install');
    console.log(`  2. pnpm --filter ${result.packageName} test`);
    console.log('  3. pnpm typecheck && pnpm lint');
    console.log('  4. Add element kinds under src/kinds/ and lowering under src/lowering/.');
  } catch (error) {
    if (error instanceof NewPluginError) {
      console.error(`new-plugin: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main();
}
