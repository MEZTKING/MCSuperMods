/**
 * `layers` (ADR 0094 D1, D10): one to eight layers, as snow layers. The generated models are
 * vanilla's `minecraft:block/snow_height2` to `snow_height14` for one to seven layers (texture
 * variables `texture` and `particle`, as vanilla's) and `minecraft:block/cube_all` for eight,
 * as vanilla's full snow block: `<ns>:block/<path>_height2` to `_height14` and
 * `<ns>:block/<path>_block`, from one texture (`texture` or `all`). The block state is vanilla's
 * `layers` variants. The block item shows the one-layer model, as vanilla's snow item.
 *
 * Tags: none (vanilla's snow tags are about snow itself).
 *
 * `"loot": "self"` drops one item per layer, decaying in explosions (vanilla's snow drops
 * snowballs; a project layer block drops itself).
 *
 * Model slots: `layers1` to `layers8`.
 */
import { countLootTable } from './candle';
import type { ModelSpec, TypeLowering } from './models';

/** The most layers. */
export const MAX_LAYERS = 8;

/** The slot of `count` layers. */
export const layersSlot = (count: number): string => `layers${count}`;

const SLOTS = Array.from({ length: MAX_LAYERS }, (_, index) => layersSlot(index + 1));

/** The vanilla template of `count` layers. */
export const layersTemplate = (count: number): string =>
  count >= MAX_LAYERS ? 'minecraft:block/cube_all' : `minecraft:block/snow_height${count * 2}`;

export const layersType: TypeLowering = {
  slots: SLOTS,
  itemSlot: layersSlot(1),
  generate: (texture) => {
    const picture = texture('texture');
    return SLOTS.map((slot, index): ModelSpec => {
      const count = index + 1;
      const full = count >= MAX_LAYERS;
      return {
        slot,
        suffix: full ? '_block' : `_height${count * 2}`,
        parent: layersTemplate(count),
        textures: full ? { all: picture } : { particle: picture, texture: picture },
      };
    });
  },
  blockstate: (models) => ({
    variants: Object.fromEntries(
      SLOTS.map((slot, index) => [`layers=${index + 1}`, { model: models[slot] ?? '' }]),
    ),
  }),
  selfLoot: (context) => countLootTable(context, 'layers', MAX_LAYERS),
};
