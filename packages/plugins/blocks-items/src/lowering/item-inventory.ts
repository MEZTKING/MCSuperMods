/**
 * Item inventories (ADR 0095 D1, D4): `msm:item_inventory` makes an item a bag with its own
 * slots (`layout` chest, hopper or dispenser; `rows` 1 to 6 with the chest, 3 by default), and
 * `msm:bundle` makes it a vanilla-like bundle. Either way the item holds its things in one
 * stack, so lowering writes `max_stack_size: 1` into the definition (the validators report a
 * larger value the element sets as `blocks-items.max-stack-size`), and drops a bag's `rows`
 * when the layout is not the chest (they mean nothing there; the validators warn with
 * `blocks-items.container-layout-fields`). The bundle's pictures are lowered by `bundle.ts`.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { isRecord } from './paths';

/** The bag component. */
export const ITEM_INVENTORY_COMPONENT = 'msm:item_inventory';
/** The bundle component. */
export const BUNDLE_COMPONENT = 'msm:bundle';
/** The bag layouts; the first is the default. */
export const ITEM_INVENTORY_LAYOUTS = Object.freeze(['chest', 'hopper', 'dispenser'] as const);
/** Rows of a chest bag without `rows` (27 slots). */
export const DEFAULT_BAG_ROWS = 3;

const componentsOf = (data: Json | undefined): JsonObject | undefined => {
  const components = isRecord(data) ? data.components : undefined;
  return isRecord(components) ? components : undefined;
};

/** The `msm:item_inventory` component of item data, or `undefined` without one. */
export function itemInventoryOf(data: Json | undefined): JsonObject | undefined {
  const bag = componentsOf(data)?.[ITEM_INVENTORY_COMPONENT];
  return isRecord(bag) ? bag : undefined;
}

/** Whether item data has the `msm:bundle` component. */
export function isBundle(data: Json | undefined): boolean {
  return isRecord(componentsOf(data)?.[BUNDLE_COMPONENT]);
}

/** The layout of a bag: its `layout`, `chest` when absent. */
export function bagLayoutOf(bag: JsonObject): string {
  return typeof bag.layout === 'string' ? bag.layout : 'chest';
}

/**
 * Forces `max_stack_size` to 1 for a bag or a bundle and drops a non-chest bag's `rows`, in
 * place. An item that is neither is unchanged.
 *
 * @param definition - The item definition (or a block's item; the components are read from it).
 */
export function lowerItemInventoryInPlace(definition: JsonObject): void {
  const bag = itemInventoryOf(definition);
  if (bag === undefined && !isBundle(definition)) return;
  definition.max_stack_size = 1;
  if (bag !== undefined && bagLayoutOf(bag) !== 'chest') delete bag.rows;
}
