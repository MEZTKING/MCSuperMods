/**
 * The id of a block's item (ADR 0068 D2): `item.id` when the block item has its own id (seeds
 * planting a crop), else the block's id. The single source every registry view, name key and
 * item model path uses.
 */
import type { Element, Json } from '@msm/plugin-api';
import { isRecord } from './paths';
import { nonEmptyString } from './shared';

/**
 * The block item id of an `msm:block` element's data: `undefined` for `"item": false` (no
 * block item), `item.id` when set, else `blockId`.
 *
 * @param blockId - The block's id.
 * @param data - The element data (or the runtime definition).
 */
export function blockItemIdOf(blockId: string, data: Json | undefined): string | undefined {
  if (!isRecord(data)) return blockId;
  const item = data.item;
  if (item === false) return undefined;
  return (isRecord(item) ? nonEmptyString(item.id) : undefined) ?? blockId;
}

/**
 * The id of the item an `msm:block` element registers (ADR 0068 D2): `item.id` when set, else
 * the block's own id; `undefined` when the block has no item (`"item": false`).
 *
 * @param element - An `msm:block` element.
 */
export function blockItemId(element: Pick<Element, 'id' | 'data'>): string | undefined {
  return blockItemIdOf(element.id, element.data);
}
