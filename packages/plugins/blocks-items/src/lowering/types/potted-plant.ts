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
 * `pot` (ADR 0103 D2): the empty pot the plant sits in, vanilla's `minecraft:flower_pot` by
 * default or a project `flower_pot`; the runtime adds the plant to that pot's own map. The
 * definition keeps `pot` as written. The generated model keeps the template's own pot picture
 * (lowering sees one element only, so it cannot read a project pot's `textures`); give
 * `models.potted` for a pot of another look, or list the plant in the pot's `plants` instead.
 *
 * `"loot": "self"` drops the empty pot (`pot`, else vanilla's flower pot) and the plant (the
 * item with the plant's id), each surviving explosions, in the shape of vanilla's potted plant
 * tables (B440, S3).
 *
 * The block has no item of its own (ADR 0094 D2): `blockItemIdOf` gives none unless `item` is
 * given, as for a portal, and `"loot": "self"` still writes the pot-and-plant table (B448).
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

/** The potted plant's empty pot: `pot`, namespaced, else vanilla's flower pot. */
export function pottedPlantPotOf(data: JsonObject): string {
  const pot = nonEmptyString(data.pot);
  return pot === undefined ? FLOWER_POT : namespaced(pot);
}

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

/** The editor-only field the project expander fills with the plant block's item id. */
export const POTTED_PLANT_ITEM_FIELD = 'plant_item';

/**
 * The item the pot drops with the pot: `plant_item` (written by the project expander from the
 * plant block's own `item`, B462a), else the plant's id (a vanilla plant, or a project plant
 * whose item has its block's id).
 */
export function pottedPlantItemOf(data: JsonObject): string | undefined {
  const given = nonEmptyString(data[POTTED_PLANT_ITEM_FIELD]);
  return given === undefined ? pottedPlantOf(data) : namespaced(given);
}

const survives = { type: 'minecraft:survives_explosion' };

/**
 * A potted plant's loot table in the shape of vanilla's: one pool of the empty pot and, when
 * given, one of the plant, each surviving explosions (also the potted companions of a project
 * `flower_pot`).
 *
 * @param pot - The empty pot's item.
 * @param plant - The plant's item, or `undefined` for none.
 */
export function pottedLootTable(
  pot: string,
  plant: string | undefined,
  namespace: string,
  path: string,
): JsonObject {
  const pools: JsonObject[] = [
    { condition: survives, entries: [{ type: 'minecraft:item', name: pot }], rolls: 1 },
  ];
  if (plant !== undefined) {
    pools.push({
      condition: survives,
      entries: [{ type: 'minecraft:item', name: plant }],
      rolls: 1,
    });
  }
  return { type: 'minecraft:block', pools, random_sequence: `${namespace}:blocks/${path}` };
}

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
  selfLoot: ({ data, namespace, path }): JsonObject =>
    pottedLootTable(pottedPlantPotOf(data), pottedPlantItemOf(data), namespace, path),
};
