import { readFile } from 'node:fs/promises';
import type { Element, Json, ResourceLocation } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  parseVanillaMcdocSymbols,
  validateJson,
} from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { GAMES_KIND_IDS, gamesKinds } from '../src/index';

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

describe('@msm/plugin-games', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.games');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});

describe('games kinds (B549, B724)', () => {
  it('registers the eight games kinds in order, with their schema refs and folders', () => {
    expect(GAMES_KIND_IDS).toEqual([
      'msm:world_setup',
      'msm:one_block',
      'msm:team',
      'msm:objective',
      'msm:timer',
      'msm:area',
      'msm:game',
      'msm:kit',
    ]);
    const kinds = plugin.contributes.elementKinds ?? [];
    expect(kinds.map((kind) => kind.id)).toEqual([...GAMES_KIND_IDS]);
    expect(kinds).toEqual([...gamesKinds]);
    expect(kinds.map((kind) => [kind.schema, kind.folder])).toEqual([
      [MSM_SCHEMA_REFS.worldSetup, 'world_setup'],
      [MSM_SCHEMA_REFS.oneBlock, 'one_block'],
      [MSM_SCHEMA_REFS.team, 'team'],
      [MSM_SCHEMA_REFS.objective, 'objective'],
      [MSM_SCHEMA_REFS.timer, 'timer'],
      [MSM_SCHEMA_REFS.area, 'area'],
      [MSM_SCHEMA_REFS.game, 'game'],
      [MSM_SCHEMA_REFS.kit, 'kit'],
    ]);
  });

  it('lowers the default data of every kind to files (B551, B552 and B724)', async () => {
    const [target] = builtInTargets;
    if (target === undefined) throw new Error('no built-in target');
    for (const kind of gamesKinds) {
      const element: Element = {
        formatVersion: 1,
        id: 'mygame:thing' as ResourceLocation,
        kind: kind.id,
        data: kind.defaultData as Json,
        meta: { createdAt: '2026-01-01T00:00:00.000Z' },
      };
      expect((await kind.lower(element, target.target)).length, kind.id).toBeGreaterThan(0);
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'default data on %s',
  (_id, bundle) => {
    it.each(gamesKinds.map((kind) => [kind.id, kind] as const))(
      '%s validates with no error and no unknown id',
      async (_kindId, kind) => {
        const symbols = parseVanillaMcdocSymbols(
          await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
        );
        const vanilla = (await readVendoredJson(
          bundle,
          'mcmetaRegistries',
          nodeReadFile,
        )) as Record<string, string[]>;
        const index = createSchemaIndex(symbols, { mcVersion: bundle.target.mcVersion });
        const problems = validateJson(
          kind.defaultData as Json,
          index.resolveSchemaRef(kind.schema),
          { registries: createRegistryIndex({ vanilla }) },
        ).filter((problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id');
        expect(problems).toEqual([]);
        expect(kind.defaultDataFor).toBeUndefined();
      },
    );
  },
);
