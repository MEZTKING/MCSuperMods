import { readFile } from 'node:fs/promises';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  validateJson,
} from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { FALLBACK_MODELS } from '../../src/renderer/src/preview/fallback-models';

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'fallback parents against %s',
  (_id, bundle) => {
    it('are exactly the seven ADR 0010 parents', () => {
      expect(Object.keys(FALLBACK_MODELS).sort()).toEqual([
        'block/cross',
        'block/cube',
        'block/cube_all',
        'block/cube_bottom_top',
        'block/cube_column',
        'item/generated',
        'item/handheld',
      ]);
    });

    it('validate against the Model schema with zero errors', async () => {
      const symbols = parseVanillaMcdocSymbols(
        await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
      );
      const index = createSchemaIndex(symbols, { mcVersion: bundle.target.mcVersion });
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
        string,
        string[]
      >;
      const node = index.resolveSchemaRef('::java::assets::model::Model');
      const registries = createRegistryIndex({ vanilla });
      for (const [path, json] of Object.entries(FALLBACK_MODELS)) {
        const errors = validateJson(json, node, { registries }).filter(
          (problem) => problem.severity === 'error',
        );
        expect(errors, path).toEqual([]);
      }
    });
  },
);
