import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addTsconfigReference,
  BUILD_STEPS_MARKER,
  EXTERNAL_BUILD_STEPS,
  EXTERNAL_DEV_DEPENDENCIES,
  externalPluginFiles,
  isPluginRelativePath,
  NewPluginError,
  pluginFiles,
  scaffoldExternalPlugin,
  scaffoldPlugin,
  validateExternalPluginName,
  validateManifest,
  validatePluginName,
} from './index.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const ROOT_TSCONFIG = `{
  "files": [],
  "references": [
    { "path": "packages/plugin-api" },
    { "path": "packages/plugins/zeta" },
    { "path": "tools" }
  ]
}
`;

describe('validatePluginName', () => {
  it.each(['resourcepack', 'blocks-items', 'a1'])('accepts %j', (name) => {
    expect(() => validatePluginName(name)).not.toThrow();
  });

  it.each(['', 'Bad', '1x', '-x', 'a_b', 'a/b', '../x'])('rejects %j', (name) => {
    expect(() => validatePluginName(name)).toThrow(NewPluginError);
  });
});

describe('addTsconfigReference', () => {
  it('inserts the reference in sorted order and keeps one-line entries', () => {
    const result = addTsconfigReference(ROOT_TSCONFIG, 'packages/plugins/alpha');
    expect(result).toBe(`{
  "files": [],
  "references": [
    { "path": "packages/plugin-api" },
    { "path": "packages/plugins/alpha" },
    { "path": "packages/plugins/zeta" },
    { "path": "tools" }
  ]
}
`);
  });

  it('returns undefined when the reference already exists', () => {
    expect(addTsconfigReference(ROOT_TSCONFIG, 'tools')).toBeUndefined();
  });
});

describe('pluginFiles', () => {
  it('declares the package, id and API range', () => {
    const files = pluginFiles('demo');
    const pkg = JSON.parse(files['package.json'] ?? '{}') as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('@msm/plugin-demo');
    expect(Object.keys(pkg.dependencies)).toEqual(['@msm/plugin-api', '@msm/schemas']);
    expect(Object.keys(pkg.devDependencies)).toEqual(['@msm/targets', '@types/node', 'vitest']);
    expect(files['src/index.ts']).toContain("id: 'msm.demo'");
    expect(files['src/index.ts']).toContain("apiVersion: '^1.0.0'");
    expect(files['src/index.ts']).toContain('contributes: {}');
  });
});

describe('scaffoldPlugin', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'msm-new-plugin-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the layout and adds the root tsconfig reference', () => {
    writeFileSync(join(root, 'tsconfig.json'), ROOT_TSCONFIG);
    const result = scaffoldPlugin(root, 'demo');
    expect(result.packageName).toBe('@msm/plugin-demo');
    expect(result.dir).toBe('packages/plugins/demo');
    expect(result.tsconfigUpdated).toBe(true);
    expect(result.files).toEqual([
      'packages/plugins/demo/package.json',
      'packages/plugins/demo/src/index.ts',
      'packages/plugins/demo/src/kinds/index.ts',
      'packages/plugins/demo/src/lowering/index.ts',
      'packages/plugins/demo/test/plugin.test.ts',
      'packages/plugins/demo/tsconfig.json',
      'packages/plugins/demo/vitest.config.ts',
    ]);
    for (const file of result.files) expect(existsSync(join(root, file))).toBe(true);
    expect(readFileSync(join(root, 'tsconfig.json'), 'utf8')).toContain(
      '{ "path": "packages/plugins/demo" },\n    { "path": "packages/plugins/zeta" }',
    );
  });

  it('works without a root tsconfig', () => {
    const result = scaffoldPlugin(root, 'demo');
    expect(result.tsconfigUpdated).toBe(false);
    expect(existsSync(join(root, 'packages/plugins/demo/src/index.ts'))).toBe(true);
  });

  it('refuses to overwrite an existing plugin', () => {
    scaffoldPlugin(root, 'demo');
    expect(() => scaffoldPlugin(root, 'demo')).toThrow(/refusing to overwrite/);
  });

  it('rejects an invalid name before writing anything', () => {
    expect(() => scaffoldPlugin(root, '../escape')).toThrow(NewPluginError);
    expect(existsSync(join(root, 'packages'))).toBe(false);
  });
});

describe('validateExternalPluginName', () => {
  it('accepts a plugin name that is not a reserved namespace', () => {
    expect(() => validateExternalPluginName('greetings')).not.toThrow();
  });

  it.each(['minecraft', 'msm', 'Bad', '../x'])('rejects %j', (name) => {
    expect(() => validateExternalPluginName(name)).toThrow(NewPluginError);
  });
});

describe('validateManifest', () => {
  const valid = {
    manifestVersion: 1,
    id: 'example.greetings',
    name: 'Greetings',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    main: 'main.js',
    schemas: ['symbols.json'],
    capabilities: ['elementKinds', 'elementTemplates', 'examples', 'validators'],
    licence: 'MIT',
  };

  it("accepts a valid manifest and the sample plugin's", () => {
    expect(validateManifest(valid)).toEqual([]);
    const sample = JSON.parse(
      readFileSync(join(REPO_ROOT, 'fixtures/sample-plugin/msm-plugin.json'), 'utf8'),
    ) as unknown;
    expect(validateManifest(sample)).toEqual([]);
  });

  it.each([
    ['a bad id', { id: 'Bad_Id' }, 'id:'],
    ['an msm. id', { id: 'msm.greetings' }, 'id: must not start with "msm."'],
    ['another manifest version', { manifestVersion: 2 }, 'manifestVersion:'],
    ['a bad version', { version: '1.0' }, 'version:'],
    ['a bad range', { apiVersion: '^1.0.0; rm' }, 'apiVersion:'],
    ['an absolute main', { main: '/tmp/main.js' }, 'main:'],
    ['a main outside the folder', { main: '../main.js' }, 'main:'],
    ['a schema outside the folder', { schemas: ['a/../../b.json'] }, 'schemas/0:'],
    ['an unknown capability', { capabilities: ['editors'] }, 'capabilities/0:'],
    ['an empty name', { name: ' ' }, 'name:'],
    ['a reserved namespace', { id: 'minecraft.extra' }, 'id: must not use'],
    ['an unknown field', { extra: true }, 'extra: unknown field'],
    ['an http homepage', { homepage: 'http://example.com' }, 'homepage:'],
    [
      'too many schemas',
      { schemas: Array.from({ length: 17 }, (_, i) => `s${i}.json`) },
      'schemas:',
    ],
  ])('rejects %s', (_label, change, problem) => {
    const problems = validateManifest({ ...valid, ...change });
    expect(problems.some((entry) => entry.startsWith(problem))).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(validateManifest([])).toEqual(['the manifest must be a JSON object']);
  });

  it('checks relative paths like the app', () => {
    expect(isPluginRelativePath('dist/main.js')).toBe(true);
    for (const path of ['', '/a', 'C:/a', 'a\\b', './a', 'a//b', 'a/..']) {
      expect(isPluginRelativePath(path)).toBe(false);
    }
  });
});

describe('externalPluginFiles', () => {
  const files = externalPluginFiles('greetings');

  it('writes a manifest the app accepts, with the capabilities the scaffold uses', () => {
    const manifest = JSON.parse(files['msm-plugin.json'] ?? '{}') as Record<string, unknown>;
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.id).toBe('greetings');
    expect(manifest.apiVersion).toBe('^1.0.0');
    expect(manifest.capabilities).toEqual(['elementKinds', 'elementTemplates']);
    expect(Object.keys(manifest)).toEqual([...Object.keys(manifest)].sort());
  });

  it('declares a public module package with the build, test and check scripts', () => {
    const pkg = JSON.parse(files['package.json'] ?? '{}') as {
      name: string;
      private: boolean;
      type: string;
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('msm-plugin-greetings');
    expect(pkg.private).toBe(false);
    expect(pkg.type).toBe('module');
    expect(Object.keys(pkg.scripts).sort()).toEqual(['build', 'check', 'test']);
    expect(pkg.scripts.build).toBe('node scripts/build.mjs');
    expect(Object.keys(pkg.devDependencies).sort()).toEqual([
      '@msm/plugin-api',
      '@spyglassmc/mcdoc-cli',
      'esbuild',
      'typescript',
      'vitest',
    ]);
    expect(pkg.devDependencies['@msm/plugin-api']).toBe('^1.0.0');
  });

  it('follows the repository catalog for its tool versions', () => {
    const workspace = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    const catalog = (name: string): string | undefined =>
      new RegExp(`^  "?${name.replace(/[/.@]/g, '\\$&')}"?: (\\S+)$`, 'm').exec(workspace)?.[1];
    expect(EXTERNAL_DEV_DEPENDENCIES['@spyglassmc/mcdoc-cli']).toBe(
      catalog('@spyglassmc/mcdoc-cli'),
    );
    for (const name of ['esbuild', 'typescript', 'vitest']) {
      expect(EXTERNAL_DEV_DEPENDENCIES[name]).toBe(`^${catalog(name) ?? '?'}`);
    }
  });

  it('compiles strictly without DOM or Node types', () => {
    const tsconfig = JSON.parse(files['tsconfig.json'] ?? '{}') as {
      compilerOptions: Record<string, unknown>;
    };
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.moduleResolution).toBe('bundler');
    expect(tsconfig.compilerOptions.lib).toEqual(['ES2022']);
    expect(tsconfig.compilerOptions.types).toEqual([]);
  });

  it('contributes one kind and one template under its own namespace', () => {
    const source = files['src/index.ts'] ?? '';
    expect(source).toContain("export const EXAMPLE_KIND = 'greetings:example';");
    expect(source).toContain("export const EXAMPLE_SCHEMA = '::greetings::greetings::Example';");
    expect(source).toContain("id: 'greetings-example'");
    expect(source).toContain("apiVersion: '^1.0.0'");
    expect(source).not.toContain('\\`');
    expect(files['mcdoc/greetings.mcdoc']).toContain('struct Example {');
  });

  it('bundles as an IIFE for the neutral platform and exports the mcdoc folder', () => {
    const build = files['scripts/build.mjs'] ?? '';
    expect(build).toContain("format: 'iife'");
    expect(build).toContain("target: 'es2022'");
    expect(build).toContain("platform: 'neutral'");
    expect(build).toContain("'export', output, '--source', source");
    expect(build).toContain(
      "copyFile(join(root, 'msm-plugin.json'), join(dist, 'msm-plugin.json'))",
    );
  });

  it('shares its build steps with the sample plugin', () => {
    const sample = readFileSync(join(REPO_ROOT, 'fixtures/sample-plugin/build.ts'), 'utf8');
    const [, steps] = sample.split(`${BUILD_STEPS_MARKER}\n`);
    expect(steps).toBe(EXTERNAL_BUILD_STEPS);
    expect(
      files['scripts/build.mjs']?.endsWith(`${BUILD_STEPS_MARKER}\n${EXTERNAL_BUILD_STEPS}`),
    ).toBe(true);
  });
});

describe('scaffoldExternalPlugin', () => {
  let parent: string;

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'msm-new-plugin-external-'));
  });

  afterEach(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  it('writes the project into a new folder', () => {
    const dir = join(parent, 'msm-plugin-greetings');
    const result = scaffoldExternalPlugin(dir, 'greetings');
    expect(result.packageName).toBe('msm-plugin-greetings');
    expect(result.dir).toBe(dir);
    expect(result.files).toEqual([
      '.gitignore',
      'README.md',
      'mcdoc/greetings.mcdoc',
      'msm-plugin.json',
      'package.json',
      'pnpm-workspace.yaml',
      'scripts/build.mjs',
      'src/index.ts',
      'test/plugin.test.ts',
      'tsconfig.json',
    ]);
    for (const file of result.files) expect(existsSync(join(dir, file))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, 'msm-plugin.json'), 'utf8')) as unknown;
    expect(validateManifest(manifest)).toEqual([]);
  });

  it('refuses a folder that exists', () => {
    expect(() => scaffoldExternalPlugin(parent, 'greetings')).toThrow(/refusing to overwrite/);
  });

  it('rejects a reserved name before writing anything', () => {
    const dir = join(parent, 'x');
    expect(() => scaffoldExternalPlugin(dir, 'minecraft')).toThrow(NewPluginError);
    expect(existsSync(dir)).toBe(false);
  });
});
