/**
 * `potted_plant` (ADR 0094 D1, D10): a plant in vanilla's flower pot. The generated model is
 * vanilla's `minecraft:block/flower_pot_cross` with the `plant` texture, at `<ns>:block/<path>`,
 * with one block state variant, as vanilla's potted plants. The texture is `textures.plant`, or
 * else `<plant ns>:block/<plant path>`: vanilla's own picture of a vanilla plant, and the
 * conventional texture id of a project plant (lowering sees one element only, so it cannot read
 * the plant element's own textures).
 *
 * Tags: block `flower_pots` (vanilla's list of potted blocks).
 *
 * `"loot": "self"` drops vanilla's empty flower pot and the plant (the item with the plant's
 * id), each surviving explosions, in the shape of vanilla's potted plant tables (B440, S3).
 *
 * The block has no item of its own in the game (ADR 0094 D2); the plugin's block item helpers
 * still treat it as having one unless `"item": false`, which also turns `self` loot off, so
 * leave `item` out.
 *
 * Model slots: `potted`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { isRecord } from '../paths';
import { nonEmptyString } from '../shared';
import { variant } from './blockstates';
import type { TypeLowering } from './models';
import type { TypeTags } from './tags';

/** The block tags every potted plant joins. */
export const POTTED_PLANT_BLOCK_TAGS: readonly string[] = Object.freeze(['flower_pots']);

/** Vanilla's empty flower pot, dropped with the plant. */
export const FLOWER_POT = 'minecraft:flower_pot';

/** The namespaced id of `id` (`minecraft:` when it has none). */
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** The potted plant's `plant`, namespaced, or `undefined`. */
export function pottedPlantOf(data: JsonObject): string | undefined {
  const plant = nonEmptyString(data.plant);
  return plant === undefined ? undefined : namespaced(plant);
}

/** The texture of the plant: `textures.plant`, else the plant's own `block/` texture id. */
export function pottedPlantTexture(data: JsonObject): string | undefined {
  const given = isRecord(data.textures) ? nonEmptyString(data.textures.plant) : undefined;
  if (given !== undefined) return given;
  const plant = pottedPlantOf(data);
  if (plant === undefined) return undefined;
  const colon = plant.indexOf(':');
  return `${plant.slice(0, colon)}:block/${plant.slice(colon + 1)}`;
}

const survives = { type: 'minecraft:survives_explosion' };

export const pottedPlantType: TypeLowering = {
  slots: ['potted'],
  generate: () => [],
  generateFromData: (data) => {
    const texture = pottedPlantTexture(data);
    return texture === undefined
      ? []
      : [
          {
            slot: 'potted',
            suffix: '',
            parent: 'minecraft:block/flower_pot_cross',
            textures: { plant: texture },
          },
        ];
  },
  blockstate: (models) => ({ variants: { '': variant(models.potted ?? '') } }),
  tags: (): TypeTags => ({ block: POTTED_PLANT_BLOCK_TAGS, item: [] }),
  selfLoot: ({ data, namespace, path }): JsonObject => {
    const pools: JsonObject[] = [
      { condition: survives, entries: [{ type: 'minecraft:item', name: FLOWER_POT }], rolls: 1 },
    ];
    const plant = pottedPlantOf(data);
    if (plant !== undefined) {
      pools.push({
        condition: survives,
        entries: [{ type: 'minecraft:item', name: plant }],
        rolls: 1,
      });
    }
    return { type: 'minecraft:block', pools, random_sequence: `${namespace}:blocks/${path}` };
  },
};
