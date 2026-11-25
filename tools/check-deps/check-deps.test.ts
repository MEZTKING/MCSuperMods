import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkLayers,
  compareGradleFacts,
  findEngineImports,
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
        content: "const a = '1.21.9'; const b = 126.3; const c = 2.6; const d = '1.26.0';",
      },
    ]);
    expect(violations).toEqual([]);
  });
});

describe('the shared migration engine (ADR 0136 D3)', () => {
  const real = JSON.parse(
    readFileSync(new URL('./layers.json', import.meta.url), 'utf8'),
  ) as LayerMap;
  const literal = ['26', '3'].join('.');

  it('may depend on the plugin API only, and targets may depend on it but not on each other', () => {
    const violations = checkLayers(
      [
        {
          name: '@msm/target-migrate',
          dir: 'packages/targets/migrate',
          dependencies: ['@msm/plugin-api'],
        },
        {
          name: '@msm/target-mc-x',
          dir: 'packages/targets/mc-x',
          dependencies: ['@msm/plugin-api', '@msm/target-migrate'],
        },
      ],
      real,
    );
    expect(violations).toEqual([]);
    const wrong = checkLayers(
      [
        {
          name: '@msm/target-migrate',
          dir: 'packages/targets/migrate',
          dependencies: ['@msm/target-mc-x', '@msm/schemas', '@msm/core', '@msm/targets'],
        },
        {
          name: '@msm/target-mc-x',
          dir: 'packages/targets/mc-x',
          dependencies: ['@msm/target-mc-y'],
        },
      ],
      real,
    );
    expect(wrong.map((v) => v.message.split(' must not depend on ')[1]?.split(' ')[0])).toEqual([
      '@msm/target-mc-x',
      '@msm/schemas',
      '@msm/core',
      '@msm/targets',
      '@msm/target-mc-y',
    ]);
  });

  it('is grepped for version literals, unlike the target packages', () => {
    const violations = findVersionFacts([
      { path: 'packages/targets/migrate/src/engine.ts', content: `const v = '${literal}';` },
      { path: 'packages/targets/migrate/test/a.test.ts', content: `const t = 'mc-${literal}';` },
      { path: 'packages/targets/mc-x/src/target.ts', content: `const v = '${literal}';` },
    ]);
    expect(violations.map((v) => v.message.split(':')[0])).toEqual([
      'packages/targets/migrate/src/engine.ts',
      'packages/targets/migrate/test/a.test.ts',
    ]);
  });

  it('imports no target and no file outside its folder', () => {
    const violations = findEngineImports([
      {
        path: 'packages/targets/migrate/src/engine.ts',
        content: [
          "import type { Json } from '@msm/plugin-api';",
          "import { walk } from './walk';",
          "import { x } from '../../mc-x/src/removed-ids';",
          "export { y } from '@msm/target-mc-x';",
          "const z = await import('@msm/targets');",
        ].join('\n'),
      },
      {
        path: 'packages/targets/migrate/src/steps/ids.ts',
        content: "import type { IdStep } from '../types';",
      },
      {
        path: 'packages/targets/mc-x/src/migrate.ts',
        content: "import { x } from '@msm/target-migrate';",
      },
    ]);
    expect(violations.map((v) => v.message)).toEqual([
      'packages/targets/migrate/src/engine.ts:3: the migration engine must not import ../../mc-x/src/removed-ids',
      'packages/targets/migrate/src/engine.ts:4: the migration engine must not import @msm/target-mc-x',
      'packages/targets/migrate/src/engine.ts:5: the migration engine must not import @msm/targets',
    ]);
  });
});

describe('the version pattern beyond 26', () => {
  it('flags later versions written as strings or target ids, not other numbers', () => {
    const flagged = (content: string) =>
      findVersionFacts([{ path: 'packages/core/src/a.ts', content }]).length;
    for (const line of [
      "const v = '27.1';",
      'const v = "27.1.1";',
      'const v = `30.2-snapshot-3`;',
      'const id = mc-27.1;',
      "const id = 'mc-41.2';",
    ]) {
      expect(flagged(line), line).toBe(1);
    }
    for (const line of [
      "seedJava(fs, 'a-31', '31.0.1');",
      "parse('forge-47.2.0');",
      "const mcVersion = '99.1';",
      'teleport({ x: 30.5, y: 0, z: 30.5 });',
      '// 87.8 % first',
      "const v = '27.0';",
    ]) {
      expect(flagged(line), line).toBe(0);
    }
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
