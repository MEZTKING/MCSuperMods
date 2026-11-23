import { readFile } from 'node:fs/promises';
import type { Json } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  parseVanillaMcdocSymbols,
  validateJson,
} from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index';
import { GAME_KIND_LISTED, gameKind, KIT_KIND_LISTED, kitKind } from '../src/kinds/index';

/**
 * The kinds `msm:game` and `msm:kit` (ADR 0132 D1 to D3): B722 gave them their schema and
 * default data; B724 made them lower to files and turned their flags on.
 */
const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

describe('msm:game and msm:kit (B722)', () => {
  it('point at their games.mcdoc types', () => {
    expect(gameKind.schema).toBe(MSM_SCHEMA_REFS.game);
    expect(kitKind.schema).toBe(MSM_SCHEMA_REFS.kit);
    expect([gameKind.folder, kitKind.folder]).toEqual(['game', 'kit']);
  });

  it('are listed by the plugin now that they lower to files (B724)', () => {
    expect(GAME_KIND_LISTED).toBe(true);
    expect(KIT_KIND_LISTED).toBe(true);
    const ids = (plugin.contributes.elementKinds ?? []).map((kind) => kind.id);
    expect(ids).toContain('msm:game');
    expect(ids).toContain('msm:kit');
    const templates = (plugin.contributes.elementTemplates ?? []).map((template) => template.id);
    expect(templates).toContain('msm_games_game_empty');
    expect(templates).toContain('msm_games_kit_empty');
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'game and kit default data on %s',
  (_id, bundle) => {
    it.each([
      ['msm:game', gameKind],
      ['msm:kit', kitKind],
    ] as const)('%s validates with no error and no unknown id', async (_kindId, kind) => {
      const symbols = parseVanillaMcdocSymbols(
        await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
      );
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
        string,
        string[]
      >;
      const index = createSchemaIndex(symbols, { mcVersion: bundle.target.mcVersion });
      const node = index.resolveSchemaRef(kind.schema);
      expect(node.kind).toBe('struct');
      const problems = validateJson(kind.defaultData as Json, node, {
        registries: createRegistryIndex({ vanilla }),
      }).filter((problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id');
      expect(problems).toEqual([]);
      expect(kind.defaultDataFor).toBeUndefined();
    });
  },
);
