import { describe, expect, it } from 'vitest';
import {
  checkLayers,
  findVersionFacts,
  type LayerMap,
  matchesPattern,
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
