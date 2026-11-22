/**
 * The potted plant's project expander (B462a): lowering sees one element only, so it cannot read
 * the plant block's own `item`. For every `potted_plant` block whose `plant` is a project block
 * with a block item of another id (for example a berry bush whose item is `blue_berries`), the
 * expander writes that item id to the copy's `plant_item`, which the pot's loot table drops.
 *
 * Project flower pots (ADR 0103 D2) likewise: for every listed plant of a `flower_pot` block
 * that is a project block with a block item of another id, the expander writes that item id to
 * the copy's `plant_item` map under the plant's id (`plant_item["<plant id>"]`), which the
 * plant's potted companion drops with the pot.
 */
import type { Element, ExpansionInput, ExpansionResult, ProjectExpander } from '@msm/plugin-api';
import { blockItemIdOf } from './lowering/block-item';
import { isRecord } from './lowering/paths';
import { flowerPotPlantsOf } from './lowering/types/flower-pot';
import { POTTED_PLANT_ITEM_FIELD, pottedPlantOf } from './lowering/types/potted-plant';

/** The id of the expander. */
export const POTTED_PLANT_EXPANDER_ID = 'msm.blocks-items.potted-plant-item';

const BLOCK_KIND = 'msm:block';

const byId = (a: Element, b: Element): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The block item of the project block `plantId` when it has another id, else `undefined`. */
function otherItemOf(blocks: ReadonlyMap<string, Element>, plantId: string): string | undefined {
  const plant = blocks.get(plantId);
  if (plant === undefined) return undefined;
  const item = blockItemIdOf(plant.id, plant.data);
  return item === undefined || item === plantId ? undefined : item;
}

/**
 * The `plant_item` patches of a project flower pot: one per listed project plant whose item has
 * another id, in the listed order.
 */
function flowerPotPatches(
  blocks: ReadonlyMap<string, Element>,
  pot: Element,
): ExpansionResult['patches'] {
  const patches: ExpansionResult['patches'] = [];
  const listed = isRecord(pot.data) && Array.isArray(pot.data.plants) ? pot.data.plants : [];
  for (const plantId of flowerPotPlantsOf(pot.data)) {
    const item = otherItemOf(blocks, plantId);
    if (item === undefined) continue;
    const at = listed.indexOf(plantId);
    patches.push({
      elementId: pot.id,
      path: [POTTED_PLANT_ITEM_FIELD, plantId],
      value: item,
      origin: { elementId: pot.id, pointer: `/plants/${Math.max(at, 0)}` },
    });
  }
  return patches;
}

/** Works out the `plant_item` patches (pure; sorted by element id). */
export function expandPottedPlants({ elements }: ExpansionInput): ExpansionResult {
  const blocks = new Map<string, Element>();
  for (const element of elements) if (element.kind === BLOCK_KIND) blocks.set(element.id, element);
  const patches: ExpansionResult['patches'] = [];
  for (const pot of [...blocks.values()].sort(byId)) {
    if (!isRecord(pot.data)) continue;
    if (pot.data.type === 'flower_pot') {
      patches.push(...flowerPotPatches(blocks, pot));
      continue;
    }
    if (pot.data.type !== 'potted_plant') continue;
    const plantId = pottedPlantOf(pot.data);
    const item = plantId === undefined ? undefined : otherItemOf(blocks, plantId);
    if (item === undefined) continue;
    patches.push({
      elementId: pot.id,
      path: [POTTED_PLANT_ITEM_FIELD],
      value: item,
      origin: { elementId: pot.id, pointer: '/plant' },
    });
  }
  return { patches, problems: [] };
}

export const pottedPlantExpander: ProjectExpander = {
  id: POTTED_PLANT_EXPANDER_ID,
  kinds: [BLOCK_KIND],
  expand: expandPottedPlants,
};
