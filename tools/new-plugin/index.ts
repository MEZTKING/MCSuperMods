/**
 * Scaffolds a built-in MSM plugin package.
 *
 * Usage:
 *   node tools/new-plugin/index.ts <name> [--root <repo-root>]
 *
 * Creates `packages/plugins/<name>/` as the package `@msm/plugin-<name>` with the layout
 * from `packages/plugins/CLAUDE.md` (`src/index.ts`, `src/kinds/`, `src/lowering/`,
 * `test/plugin.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`), refuses to
 * overwrite an existing folder, adds the package to the root `tsconfig.json` references
 * (sorted by path) and prints the next steps. `--root` defaults to this repository; tests
 * pass a temporary directory.
 *
 * Only erasable TypeScript syntax and `node:` imports are allowed here.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** Valid plugin folder names: lower-case, starting with a letter. */
export const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** The plugin API range a freshly scaffolded plugin declares. */
export const SCAFFOLD_API_RANGE = '^0.3.0';

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

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: 'string' } },
  });
  const name = positionals[0];
  if (name === undefined || positionals.length !== 1) {
    console.error('Usage: node tools/new-plugin/index.ts <name> [--root <repo-root>]');
    process.exit(2);
  }
  const root = resolve(values.root ?? fileURLToPath(new URL('../..', import.meta.url)));
  try {
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
