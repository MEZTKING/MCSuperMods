/**
 * The potted plant's project expander (B462a): lowering sees one element only, so it cannot read
 * the plant block's own `item`. For every `potted_plant` block whose `plant` is a project block
 * with a block item of another id (for example a berry bush whose item is `blue_berries`), the
 * expander writes that item id to the copy's `plant_item`, which the pot's loot table drops.
 */
import type { Element, ExpansionInput, ExpansionResult, ProjectExpander } from '@msm/plugin-api';
import { blockItemIdOf } from './lowering/block-item';
import { isRecord } from './lowering/paths';
import { POTTED_PLANT_ITEM_FIELD, pottedPlantOf } from './lowering/types/potted-plant';

/** The id of the expander. */
export const POTTED_PLANT_EXPANDER_ID = 'msm.blocks-items.potted-plant-item';

const BLOCK_KIND = 'msm:block';

const byId = (a: Element, b: Element): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Works out the `plant_item` patches (pure; sorted by element id). */
export function expandPottedPlants({ elements }: ExpansionInput): ExpansionResult {
  const blocks = new Map<string, Element>();
  for (const element of elements) if (element.kind === BLOCK_KIND) blocks.set(element.id, element);
  const patches: ExpansionResult['patches'] = [];
  for (const pot of [...blocks.values()].sort(byId)) {
    if (!isRecord(pot.data) || pot.data.type !== 'potted_plant') continue;
    const plantId = pottedPlantOf(pot.data);
    const plant = plantId === undefined ? undefined : blocks.get(plantId);
    if (plantId === undefined || plant === undefined) continue;
    const item = blockItemIdOf(plant.id, plant.data);
    if (item === undefined || item === plantId) continue;
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
