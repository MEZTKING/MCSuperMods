/**
 * `scaffolding` (ADR 0094 D1, D10): a frame that is climbed, built out sideways up to six
 * blocks from a support and falls beyond. The generated models are vanilla's
 * `minecraft:block/scaffolding_stable` at `<ns>:block/<path>_stable` and `scaffolding_unstable`
 * at `<ns>:block/<path>_unstable`, with the variables `top`, `side`, `bottom` and `particle`
 * (`particle` is the top, as vanilla's). The block state is vanilla's `bottom` variants: stable
 * when standing on its own, unstable when it hangs over a gap (`distance` and `waterlogged`
 * do not change the look). The block item shows the stable model, as vanilla's scaffolding.
 *
 * Tags: block `climbable` (vanilla climbs every member, B440).
 *
 * `"loot": "self"` drops the scaffolding, as vanilla's.
 *
 * Model slots: `stable`, `unstable`.
 */
import { variant, variants } from './blockstates';
import type { TypeLowering } from './models';
import type { TypeTags } from './tags';

/** The block tags all scaffolding joins. */
export const SCAFFOLDING_BLOCK_TAGS: readonly string[] = Object.freeze(['climbable']);

const SLOTS = ['stable', 'unstable'] as const;

export const scaffoldingType: TypeLowering = {
  slots: [...SLOTS],
  generate: (texture) => {
    const textures = {
      bottom: texture('bottom', 'side'),
      particle: texture('top', 'side'),
      side: texture('side', 'top'),
      top: texture('top', 'side'),
    };
    return SLOTS.map((slot) => ({
      slot,
      suffix: `_${slot}`,
      parent: `minecraft:block/scaffolding_${slot}`,
      textures,
    }));
  },
  blockstate: (models) =>
    variants([
      [{ bottom: 'false' }, variant(models.stable ?? '')],
      [{ bottom: 'true' }, variant(models.unstable ?? models.stable ?? '')],
    ]),
  tags: (): TypeTags => ({ block: SCAFFOLDING_BLOCK_TAGS, item: [] }),
};
