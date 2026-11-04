import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addTsconfigReference,
  NewPluginError,
  pluginFiles,
  scaffoldPlugin,
  validatePluginName,
} from './index.ts';

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
    expect(files['src/index.ts']).toContain("apiVersion: '^0.2.0'");
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
