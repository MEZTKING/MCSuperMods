/**
 * `leaves` (ADR 0068 D6): leaves that decay away from `#minecraft:logs`. The generated model is
 * vanilla's `minecraft:block/leaves` (tint index 0 on every face) from `textures.all` at
 * `<ns>:block/<path>`, with one block state variant, as vanilla's leaves. The block item shows
 * the block model; with `tint` its item definition carries the tint vanilla's leaf items use: a
 * constant of vanilla's default foliage colour for `foliage` and of the default dry foliage
 * colour for `dry_foliage`, the grass source at temperature 0.5 and downfall 1 (as vanilla's
 * fern item) for `grass`, and a constant of the given colour for a number. The block's own tint
 * is client code in the runtime. The `leaves` loot preset is in `loot-presets.ts`.
 *
 * Tags: block `leaves` and `mineable/hoe`; item `leaves`.
 *
 * Model slots: `leaves`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { variant } from './blockstates';
import type { TypeLowering } from './models';
import type { TypeTags } from './tags';

/** The block tags every leaves block joins. */
export const LEAVES_BLOCK_TAGS: readonly string[] = Object.freeze(['leaves', 'mineable/hoe']);
/** The item tags every leaves block item joins. */
export const LEAVES_ITEM_TAGS: readonly string[] = Object.freeze(['leaves']);

/** Vanilla's default foliage colour (`FoliageColor.FOLIAGE_DEFAULT`), as a signed ARGB int. */
export const DEFAULT_FOLIAGE_COLOR = -12012264;
/** Vanilla's default dry foliage colour (`DryFoliageColor.FOLIAGE_DRY_DEFAULT`), signed ARGB. */
export const DEFAULT_DRY_FOLIAGE_COLOR = -10732494;

/** An RGB colour as the opaque signed ARGB int vanilla's item tints write. */
export const opaqueArgb = (rgb: number): number => 0xff000000 | (rgb & 0xffffff) | 0;

/** The item model tints of a leaves block's `tint`; `[]` without one. */
export function leavesItemTints(data: JsonObject): JsonObject[] {
  const tint = data.tint;
  if (typeof tint === 'number' && Number.isInteger(tint) && tint >= 0 && tint <= 0xffffff) {
    return [{ type: 'minecraft:constant', value: opaqueArgb(tint) }];
  }
  switch (tint) {
    case 'foliage':
      return [{ type: 'minecraft:constant', value: DEFAULT_FOLIAGE_COLOR }];
    case 'dry_foliage':
      return [{ type: 'minecraft:constant', value: DEFAULT_DRY_FOLIAGE_COLOR }];
    case 'grass':
      return [{ type: 'minecraft:grass', downfall: 1, temperature: 0.5 }];
    default:
      return [];
  }
}

export const leavesType: TypeLowering = {
  slots: ['leaves'],
  generate: (texture) => [
    {
      slot: 'leaves',
      suffix: '',
      parent: 'minecraft:block/leaves',
      textures: { all: texture('all') },
    },
  ],
  blockstate: (models) => ({ variants: { '': variant(models.leaves ?? '') } }),
  itemTints: leavesItemTints,
  tags: (): TypeTags => ({ block: LEAVES_BLOCK_TAGS, item: LEAVES_ITEM_TAGS }),
};
