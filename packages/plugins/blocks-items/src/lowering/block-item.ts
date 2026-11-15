/**
 * The id of a block's item (ADR 0068 D2): `item.id` when the block item has its own id (seeds
 * planting a crop), else the block's id. The single source every registry view, name key and
 * item model path uses. A portal (ADR 0077 D1) and a potted plant (ADR 0094 D2) have no block
 * item unless `item` is given.
 */
import type { Element, Json } from '@msm/plugin-api';
import { isRecord } from './paths';
import { nonEmptyString } from './shared';

/**
 * The block types with no block item unless `item` is given: a portal (ADR 0077 D1) and a
 * potted plant (ADR 0094 D2; it is placed by putting the plant in vanilla's pot).
 */
export const ITEMLESS_TYPES: readonly string[] = Object.freeze(['portal', 'potted_plant']);

/**
 * The block item id of an `msm:block` element's data: `undefined` for `"item": false` (no
 * block item) and for a `portal` or `potted_plant` without `item` ({@link ITEMLESS_TYPES}),
 * `item.id` when set, else
 * `blockId`.
 *
 * @param blockId - The block's id.
 * @param data - The element data (or the runtime definition).
 */
export function blockItemIdOf(blockId: string, data: Json | undefined): string | undefined {
  if (!isRecord(data)) return blockId;
  const item = data.item;
  if (item === false) return undefined;
  if (item === undefined && ITEMLESS_TYPES.includes(data.type as string)) return undefined;
  return (isRecord(item) ? nonEmptyString(item.id) : undefined) ?? blockId;
}

/**
 * The id of the item an `msm:block` element registers (ADR 0068 D2): `item.id` when set, else
 * the block's own id; `undefined` when the block has no item (`"item": false`, or a portal or
 * potted plant without `item`).
 *
 * @param element - An `msm:block` element.
 */
export function blockItemId(element: Pick<Element, 'id' | 'data'>): string | undefined {
  return blockItemIdOf(element.id, element.data);
}
