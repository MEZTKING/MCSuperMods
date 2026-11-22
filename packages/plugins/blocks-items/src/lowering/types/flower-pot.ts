/**
 * `flower_pot` (ADR 0103 D2 and its amendment): an empty flower pot of the project's own that
 * takes the plants it lists in `plants` (vanilla or project blocks with an item). Vanilla's
 * flower pot and its plant map are not changed; the runtime gives the pot its own map.
 *
 * - The empty pot's generated model is vanilla's `minecraft:block/flower_pot` with the textures
 *   `flowerpot` (`textures.pot`, default vanilla's `minecraft:block/flower_pot`), `dirt`
 *   (`textures.dirt`, default `minecraft:block/dirt`) and `particle` (the pot), at
 *   `<ns>:block/<path>`, with one block state variant, as vanilla's pot. The block item is a
 *   flat picture: `textures.item`, else `textures.pot`, else vanilla's `minecraft:item/flower_pot`
 *   (from the user's client jar; nothing is bundled).
 * - For every listed plant the pot has a potted companion block `<ns>:<path>_<plant path>`
 *   (the runtime registers it; ADR 0094 D3): a model `<ns>:block/<path>_<plant path>` over
 *   vanilla's `minecraft:block/flower_pot_cross` with the pot's `flowerpot`, `dirt` and
 *   `particle` and the plant's picture as `plant` (`<plant ns>:block/<plant path>`: vanilla's
 *   own picture of a vanilla plant, the conventional texture id of a project plant, as
 *   `potted_plant` does), a block state of one variant, the block tag `flower_pots`, and with
 *   `"loot": "self"` a loot table dropping the pot's item and the plant's item, each surviving
 *   explosions, in the shape of vanilla's potted plant tables. The plant's item is the plant's
 *   id unless the project expander wrote the plant block's own item id to the editor-only
 *   `plant_item` map (`{ "<plant id>": "<item id>" }`, B462a's field).
 * - A plant listed twice, or two plants with the same path (the same companion id), give one
 *   companion: the first wins.
 * - Tags: block `flower_pots` (vanilla's list of pots and potted plants) for the pot and each
 *   companion.
 *
 * Model slots: `pot`. The potted models fill the internal slots `potted:<plant id>`, which the
 * companions' block states read; they are not offered in `models`.
 *
 * The companions are data-driven (one per listed plant), so they are given by
 * {@link flowerPotCompanions} rather than the static `TypeLowering.companions`;
 * `companions.ts` adds them to the companion block states, tags, loot and generated ids.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { isRecord, splitResourceLocation } from '../paths';
import { nonEmptyString } from '../shared';
import { variant } from './blockstates';
import type { CompanionLowering } from './companions';
import type { ModelSpec, TypeLowering } from './models';
import { POTTED_PLANT_ITEM_FIELD, pottedLootTable } from './potted-plant';
import type { TypeTags } from './tags';

/** The block tags the pot and each of its potted companions join. */
export const FLOWER_POT_BLOCK_TAGS: readonly string[] = Object.freeze(['flower_pots']);

/** Vanilla's pot picture, the default `flowerpot` texture. */
export const VANILLA_POT_TEXTURE = 'minecraft:block/flower_pot';
/** Vanilla's earth picture, the default `dirt` texture. */
export const VANILLA_POT_DIRT_TEXTURE = 'minecraft:block/dirt';
/** Vanilla's flat pot item picture, the default item picture. */
export const VANILLA_POT_ITEM_TEXTURE = 'minecraft:item/flower_pot';

/** The vanilla model of the empty pot. */
export const FLOWER_POT_MODEL = 'minecraft:block/flower_pot';
/** The vanilla template of a potted plant. */
export const FLOWER_POT_CROSS_MODEL = 'minecraft:block/flower_pot_cross';

/** The slot of the potted model of `plantId`. */
export const pottedSlot = (plantId: string): string => `potted:${plantId}`;

const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** The path of a namespaced id (the part after `:`). */
const pathOf = (id: string): string => id.slice(id.indexOf(':') + 1);

/** The suffix of the potted companion of `plantId`: `_<plant path>`. */
export const pottedCompanionSuffix = (plantId: string): string => `_${pathOf(namespaced(plantId))}`;

/**
 * The plants of a pot, namespaced, in the listed order, one per companion id: a plant listed
 * twice, or a second plant with the same path, is left out (the first wins). Non-string and
 * empty entries are skipped.
 */
export function flowerPotPlantsOf(data: Json | undefined): string[] {
  const plants = isRecord(data) ? data.plants : undefined;
  if (!Array.isArray(plants)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of plants) {
    const plant = nonEmptyString(entry);
    if (plant === undefined) continue;
    const id = namespaced(plant);
    const suffix = pottedCompanionSuffix(id);
    if (seen.has(suffix)) continue;
    seen.add(suffix);
    out.push(id);
  }
  return out;
}

/** The ids of the potted companions of the pot `blockId`, in the order of its plants. */
export function flowerPotCompanionIds(blockId: string, data: Json | undefined): string[] {
  return flowerPotPlantsOf(data).map((plant) => `${blockId}${pottedCompanionSuffix(plant)}`);
}

/** The pot's own textures: `flowerpot`, `dirt` and `particle`, with vanilla's as defaults. */
export function flowerPotTextures(data: JsonObject): Readonly<Record<string, string>> {
  const textures = isRecord(data.textures) ? data.textures : {};
  const pot = nonEmptyString(textures.pot) ?? VANILLA_POT_TEXTURE;
  const dirt = nonEmptyString(textures.dirt) ?? VANILLA_POT_DIRT_TEXTURE;
  return { dirt, flowerpot: pot, particle: pot };
}

/** The picture of `plantId` in a pot: `<plant ns>:block/<plant path>`. */
export function pottedPlantPicture(plantId: string): string {
  const id = namespaced(plantId);
  const colon = id.indexOf(':');
  return `${id.slice(0, colon)}:block/${id.slice(colon + 1)}`;
}

/**
 * The item a potted companion drops with the pot: the `plant_item` map's entry for the plant
 * (written by the project expander), else the plant's id.
 */
export function flowerPotPlantItem(data: JsonObject, plantId: string): string {
  const map = data[POTTED_PLANT_ITEM_FIELD];
  const given = isRecord(map) ? nonEmptyString(map[plantId]) : undefined;
  return given === undefined ? plantId : namespaced(given);
}

/** The generated models: the empty pot, then one potted model per plant. */
function potModels(data: JsonObject): ModelSpec[] {
  const pot = flowerPotTextures(data);
  return [
    { slot: 'pot', suffix: '', parent: FLOWER_POT_MODEL, textures: pot },
    ...flowerPotPlantsOf(data).map((plant) => ({
      slot: pottedSlot(plant),
      suffix: pottedCompanionSuffix(plant),
      parent: FLOWER_POT_CROSS_MODEL,
      textures: { ...pot, plant: pottedPlantPicture(plant) },
    })),
  ];
}

/** The potted companion of `plantId` (ADR 0094 D3, ADR 0103 D2). */
function pottedCompanion(plantId: string): CompanionLowering {
  const suffix = pottedCompanionSuffix(plantId);
  return {
    suffix,
    blockstate: (models, context) => ({
      variants: {
        '': variant(
          models[pottedSlot(plantId)] ?? `${context.namespace}:block/${context.path}${suffix}`,
        ),
      },
    }),
    blockTags: FLOWER_POT_BLOCK_TAGS,
    selfLoot: (context) => {
      const { namespace, path } = splitResourceLocation(context.companionId);
      return pottedLootTable(
        context.itemId,
        flowerPotPlantItem(context.data, plantId),
        namespace,
        path,
      );
    },
  };
}

/** The potted companions of a pot, one per plant of {@link flowerPotPlantsOf}. */
export function flowerPotCompanions(data: Json | undefined): readonly CompanionLowering[] {
  return flowerPotPlantsOf(data).map(pottedCompanion);
}

/** The flower pot's lowering, with its data-driven companions. */
export const flowerPotType: TypeLowering & {
  /** The companions of this pot's data (one per listed plant). */
  companionsFromData(data: Json | undefined): readonly CompanionLowering[];
} = {
  slots: ['pot'],
  generate: () => [],
  generateFromData: potModels,
  itemTextureFromData: (data) => {
    const textures = isRecord(data.textures) ? data.textures : {};
    return (
      nonEmptyString(textures.item) ?? nonEmptyString(textures.pot) ?? VANILLA_POT_ITEM_TEXTURE
    );
  },
  blockstate: (models) => ({ variants: { '': variant(models.pot ?? '') } }),
  tags: (): TypeTags => ({ block: FLOWER_POT_BLOCK_TAGS, item: [] }),
  companionsFromData: flowerPotCompanions,
};
