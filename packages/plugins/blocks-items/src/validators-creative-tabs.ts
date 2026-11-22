/**
 * `blocks-items.*` project validators of `msm:creative_tab` elements (ADR 0096 D2). The check
 * that items name existing tabs (`blocks-items.creative-tab-unknown`) lives with the other
 * reference checks in `validators.ts`. Codes:
 *
 * - `blocks-items.creative-tab-icon-unknown` (warning): a tab whose `icon` is neither a project
 *   item (an `msm:item`, a block's item, an entity's spawn egg or a vehicle) nor a vanilla item.
 *   The vanilla part is skipped when the registry knows no items. The runtime shows an empty
 *   icon.
 *
 * The tab's hand order (ADR 0111 D7, `order` `by_hand` with `items`):
 *
 * - `blocks-items.creative-tab-items-unused` (warning): an `items` list under another order; it
 *   is left out of the definition, so the tab keeps its own order.
 * - `blocks-items.creative-tab-items-missing` (warning): `by_hand` without `items`; the tab shows
 *   its items in the order they are registered.
 * - `blocks-items.creative-tab-item-unknown` (warning): a listed id that is neither a project
 *   item nor a known item of the registry (vanilla ids skipped when the registry knows no items);
 *   the runtime leaves it out.
 * - `blocks-items.creative-tab-item-repeated` (warning): an id listed twice; the tab shows it
 *   once, at its first place.
 */
import type { Element, Problem, ProjectValidator, ValidationRegistry } from '@msm/plugin-api';
import { BLOCK_KIND, ITEM_KIND } from './kinds';
import { CREATIVE_TAB_KIND } from './kinds/creative-tab';
import { blockItemId } from './lowering/block-item';
import { isRecord } from './lowering/paths';

/** Every code these validators report. */
export const CREATIVE_TAB_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.creative-tab-icon-unknown',
  'blocks-items.creative-tab-items-unused',
  'blocks-items.creative-tab-items-missing',
  'blocks-items.creative-tab-item-unknown',
  'blocks-items.creative-tab-item-repeated',
]);

/** The order whose `items` list sets the tab's order (ADR 0111 D7). */
const BY_HAND = 'by_hand';

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

/** RFC 6901 pointer of `items[index]`. */
const itemPointer = (index: number): string => `/items/${index}`;

function handOrder(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  const items = projectItemIds(elements);
  const vanillaKnown = registry.ids('item').length > 0;
  const known = (id: string): boolean =>
    items.has(id) || registry.has('item', id) || (id.startsWith('minecraft:') && !vanillaKnown);
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== CREATIVE_TAB_KIND || !isRecord(element.data)) continue;
    const { order, items: listed } = element.data;
    const byHand = order === BY_HAND;
    if (!byHand) {
      if (listed !== undefined) {
        problems.push({
          severity: 'warning',
          code: 'blocks-items.creative-tab-items-unused',
          elementId: element.id,
          path: '/items',
          message:
            'The tab has a list of items, but its order is not "by hand", so the list is not used. Set the order to "by hand" or remove the list.',
        });
      }
      continue;
    }
    if (!Array.isArray(listed) || listed.length === 0) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.creative-tab-items-missing',
        elementId: element.id,
        path: '/order',
        message:
          'The tab is ordered by hand but lists no items, so it shows its items in the order the game registers them. Add the items in the order you want.',
      });
      continue;
    }
    const seen = new Set<string>();
    listed.forEach((entry, index) => {
      if (typeof entry !== 'string' || entry.length === 0) return;
      const id = namespaced(entry);
      if (seen.has(id)) {
        problems.push({
          severity: 'warning',
          code: 'blocks-items.creative-tab-item-repeated',
          elementId: element.id,
          path: itemPointer(index),
          message: `"${entry}" is listed more than once; the tab shows it once, at its first place.`,
        });
        return;
      }
      seen.add(id);
      if (known(id)) return;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.creative-tab-item-unknown',
        elementId: element.id,
        path: itemPointer(index),
        message: `"${entry}" is not an item of the game or of this project, so the tab leaves it out.`,
      });
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
  {
    id: 'msm.blocks-items.creative-tab-order',
    kinds: [CREATIVE_TAB_KIND, ITEM_KIND, BLOCK_KIND, ENTITY_KIND, VEHICLE_KIND],
    validate: ({ elements, registry }) => handOrder(elements, registry),
  },
] satisfies ProjectValidator[]);
