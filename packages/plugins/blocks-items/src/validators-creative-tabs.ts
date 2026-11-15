/**
 * `blocks-items.*` project validators of `msm:creative_tab` elements (ADR 0096 D2). The check
 * that items name existing tabs (`blocks-items.creative-tab-unknown`) lives with the other
 * reference checks in `validators.ts`. Codes:
 *
 * - `blocks-items.creative-tab-icon-unknown` (warning): a tab whose `icon` is neither a project
 *   item (an `msm:item`, a block's item, an entity's spawn egg or a vehicle) nor a vanilla item.
 *   The vanilla part is skipped when the registry knows no items. The runtime shows an empty
 *   icon.
 */
import type { Element, Problem, ProjectValidator, ValidationRegistry } from '@msm/plugin-api';
import { BLOCK_KIND, ITEM_KIND } from './kinds';
import { CREATIVE_TAB_KIND } from './kinds/creative-tab';
import { blockItemId } from './lowering/block-item';
import { isRecord } from './lowering/paths';

/** Every code these validators report. */
export const CREATIVE_TAB_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.creative-tab-icon-unknown',
]);

/** Kind ids of other plugins whose elements register items, read by kind string only. */
const ENTITY_KIND = 'msm:entity';
const VEHICLE_KIND = 'msm:vehicle';

const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/**
 * The item ids the project registers: `msm:item` elements, the items of `msm:block` elements,
 * the `<id>_spawn_egg` of `msm:entity` elements (unless `spawn_egg` is `false`) and `msm:vehicle`
 * elements (a vehicle is also an item under its own id).
 */
export function projectItemIds(elements: readonly Element[]): Set<string> {
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.kind === ITEM_KIND || element.kind === VEHICLE_KIND) ids.add(element.id);
    if (element.kind === BLOCK_KIND) {
      const itemId = blockItemId(element);
      if (itemId !== undefined) ids.add(namespaced(itemId));
    }
    if (element.kind === ENTITY_KIND) {
      const data = isRecord(element.data) ? element.data : {};
      if (data.spawn_egg !== false) ids.add(`${element.id}_spawn_egg`);
    }
  }
  return ids;
}

function unknownIcons(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  const items = projectItemIds(elements);
  const vanillaKnown = registry.ids('item').length > 0;
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== CREATIVE_TAB_KIND || !isRecord(element.data)) continue;
    const icon = element.data.icon;
    if (typeof icon !== 'string' || icon.length === 0) continue;
    const id = namespaced(icon);
    if (items.has(id)) continue;
    if (id.startsWith('minecraft:') && (!vanillaKnown || registry.has('item', id))) continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.creative-tab-icon-unknown',
      elementId: element.id,
      path: '/icon',
      message: `The tab's icon "${icon}" is not an item of the game or of this project, so the tab shows no picture. Pick an item for the icon.`,
    });
  }
  return problems;
}

export const creativeTabValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.creative-tab-icon',
    kinds: [CREATIVE_TAB_KIND, ITEM_KIND, BLOCK_KIND, ENTITY_KIND, VEHICLE_KIND],
    validate: ({ elements, registry }) => unknownIcons(elements, registry),
  },
] satisfies ProjectValidator[]);
