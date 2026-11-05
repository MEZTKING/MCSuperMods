import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkLayers,
  compareGradleFacts,
  findVersionFacts,
  type LayerMap,
  matchesPattern,
  parseProperties,
  parseWorkspaceGlobs,
  ruleFor,
} from './index.ts';

const layers: LayerMap = {
  '@msm/app': ['*'],
  '@msm/core': ['@msm/plugin-api', '@msm/schemas'],
  '@msm/plugin-*': ['@msm/plugin-api', '@msm/schemas'],
  '@msm/plugin-api': [],
  '@msm/schemas': ['@msm/plugin-api'],
  '@msm/target-*': ['@msm/plugin-api', '@msm/schemas', '@msm/core'],
};

describe('matchesPattern and ruleFor', () => {
  it('matches globs and exact names', () => {
    expect(matchesPattern('@msm/target-mc-x', '@msm/target-*')).toBe(true);
    expect(matchesPattern('@msm/core', '@msm/target-*')).toBe(false);
    expect(matchesPattern('@msm/anything', '*')).toBe(true);
  });

  it('prefers an exact key over a glob', () => {
    expect(ruleFor('@msm/plugin-api', layers)).toEqual([]);
    expect(ruleFor('@msm/plugin-datapack', layers)).toEqual(['@msm/plugin-api', '@msm/schemas']);
    expect(ruleFor('@msm/unknown', layers)).toBeUndefined();
  });
});

describe('@msm/targets aggregator rules', () => {
  const phase1: LayerMap = {
    '@msm/exporters': ['@msm/plugin-api', '@msm/schemas', '@msm/core', '@msm/targets'],
    '@msm/plugin-*': ['@msm/plugin-api', '@msm/schemas', '@msm/targets'],
    '@msm/target-*': ['@msm/plugin-api', '@msm/schemas', '@msm/core'],
    '@msm/targets': ['@msm/plugin-api', '@msm/schemas', '@msm/target-*'],
  };

  it('uses the exact @msm/targets key rather than the @msm/target-* glob', () => {
    expect(ruleFor('@msm/targets', phase1)).toEqual([
      '@msm/plugin-api',
      '@msm/schemas',
      '@msm/target-*',
    ]);
    expect(ruleFor('@msm/target-mc-x', phase1)).toEqual([
      '@msm/plugin-api',
      '@msm/schemas',
      '@msm/core',
    ]);
  });

  it('lets the aggregator depend on version targets but not on core', () => {
    const ok = checkLayers(
      [
        {
          name: '@msm/targets',
          dir: 'packages/targets/all',
          dependencies: ['@msm/plugin-api', '@msm/schemas', '@msm/target-mc-x'],
        },
        { name: '@msm/plugin-x', dir: 'packages/plugins/x', dependencies: ['@msm/targets'] },
        { name: '@msm/exporters', dir: 'packages/exporters', dependencies: ['@msm/targets'] },
      ],
      phase1,
    );
    expect(ok).toEqual([]);
    const bad = checkLayers(
      [{ name: '@msm/targets', dir: 'packages/targets/all', dependencies: ['@msm/core'] }],
      phase1,
    );
    expect(bad.map((v) => v.kind)).toEqual(['layer']);
  });

  it('does not let plugins depend on a version target directly', () => {
    const violations = checkLayers(
      [{ name: '@msm/plugin-x', dir: 'packages/plugins/x', dependencies: ['@msm/target-mc-x'] }],
      phase1,
    );
    expect(violations.map((v) => v.kind)).toEqual(['layer']);
  });
});

describe('checkLayers', () => {
  it('accepts dependencies that follow the layer map', () => {
    const violations = checkLayers(
      [
        { name: '@msm/plugin-api', dir: 'packages/plugin-api', dependencies: ['vitest'] },
        { name: '@msm/schemas', dir: 'packages/schemas', dependencies: ['@msm/plugin-api'] },
        {
          name: '@msm/target-mc-x',
          dir: 'packages/targets/mc-x',
          dependencies: ['@msm/core', '@msm/plugin-api'],
        },
        { name: '@msm/app', dir: 'app', dependencies: ['@msm/core', '@msm/target-mc-x'] },
      ],
      layers,
    );
    expect(violations).toEqual([]);
  });

  it('rejects a reverse dependency', () => {
    const violations = checkLayers(
      [{ name: '@msm/plugin-api', dir: 'packages/plugin-api', dependencies: ['@msm/core'] }],
      layers,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe('layer');
    expect(violations[0]?.message).toContain('@msm/plugin-api must not depend on @msm/core');
  });

  it('rejects a plugin depending on core', () => {
    const violations = checkLayers(
      [{ name: '@msm/plugin-x', dir: 'packages/plugins/x', dependencies: ['@msm/core'] }],
      layers,
    );
    expect(violations.map((v) => v.kind)).toEqual(['layer']);
  });

  it('reports packages missing from the layer map', () => {
    const violations = checkLayers(
      [{ name: '@msm/mystery', dir: 'packages/mystery', dependencies: [] }],
      layers,
    );
    expect(violations.map((v) => v.kind)).toEqual(['unknown-package']);
  });
});

describe('findVersionFacts', () => {
  // Built at runtime so this file never holds the literal itself.
  const literal = ['26', '3'].join('.');

  it('flags version literals in package sources', () => {
    const violations = findVersionFacts([
      { path: 'packages/core/src/a.ts', content: `const ok = 1;\nconst v = '${literal}';\n` },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('packages/core/src/a.ts:2');
  });

  it('honours the escape marker and exempts targets', () => {
    const violations = findVersionFacts([
      {
        path: 'packages/core/test/a.test.ts',
        content: `const v = '${literal}'; // msm-allow-version`,
      },
      { path: 'packages/targets/mc-x/src/target.ts', content: `const v = '${literal}';` },
      { path: 'app/src/main/index.ts', content: `const v = '${literal}.1';` },
      { path: 'docs/notes.ts', content: `const v = '${literal}';` },
    ]);
    expect(violations.map((v) => v.message.split(':')[0])).toEqual(['app/src/main/index.ts']);
  });

  it('does not flag other numbers', () => {
    const violations = findVersionFacts([
      {
        path: 'packages/core/src/a.ts',
        content: "const a = '1.21.9'; const b = 126.3; const c = 2.6;",
      },
    ]);
    expect(violations).toEqual([]);
  });
});

describe('parseWorkspaceGlobs', () => {
  it('reads the packages block list only', () => {
    const yaml = 'packages:\n  - app\n  - \'packages/*\'\n  - "tools"\n\ncatalog:\n  vite: 1.0.0\n';
    expect(parseWorkspaceGlobs(yaml)).toEqual(['app', 'packages/*', 'tools']);
  });
});

describe('Gradle facts of engine-mod and engine-mod/parity', () => {
  const engine = [
    '# Fabric',
    'minecraft_version=1.0',
    'loader_version=0.1.0',
    'loom_version = 2.0.0',
    'fabric_api_version=0.9.0+1.0',
    'mod_version=0.6.0',
  ].join('\n');

  it('parses properties, skipping comments', () => {
    const props = parseProperties(engine);
    expect(props.get('loom_version')).toBe('2.0.0');
    expect(props.has('# Fabric')).toBe(false);
    expect(props.size).toBe(5);
  });

  it('passes when the shared keys agree, whatever else differs', () => {
    expect(
      compareGradleFacts(engine, engine.replace('mod_version=0.6.0', 'mod_version=0.0.0')),
    ).toEqual([]);
  });

  it('reports a differing and a missing key', () => {
    const parity = engine
      .replace('loader_version=0.1.0', 'loader_version=0.2.0')
      .replace('loom_version = 2.0.0', '');
    const violations = compareGradleFacts(engine, parity);
    expect(violations.map((v) => v.kind)).toEqual(['gradle-facts', 'gradle-facts']);
    expect(violations[0]?.message).toContain(
      'loader_version: engine-mod/gradle.properties has 0.1.0',
    );
    expect(violations[1]?.message).toContain('has (missing)');
  });

  it('holds for the repository', () => {
    const read = (path: string): string =>
      readFileSync(new URL(`../../engine-mod/${path}`, import.meta.url), 'utf8');
    expect(compareGradleFacts(read('gradle.properties'), read('parity/gradle.properties'))).toEqual(
      [],
    );
  });
});
