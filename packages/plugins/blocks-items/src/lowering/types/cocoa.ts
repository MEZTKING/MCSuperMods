/**
 * `cocoa` (ADR 0094 D1, D10): a pod on the side of a block that grows through three ages. The
 * generated models are vanilla's `minecraft:block/cocoa_stage0` to `cocoa_stage2` (the pod grows
 * with the age), one per age at `<ns>:block/<path>_stage<i>`, with the variables `cocoa` and
 * `particle` from `textures.stages`: fewer textures than ages are spread over them as a crop's
 * are. The block state is vanilla's `age` by `facing` variants, the model facing south turned
 * about Y. The block item shows the last age's model unless `models.item` names one.
 *
 * Tags: none (vanilla's support tag, `#minecraft:supports_cocoa`, is read through `support`).
 *
 * `"loot": "self"` is vanilla's cocoa table with the block item: one item, three at age 2,
 * decaying in explosions.
 *
 * Model slots: `stage0` (required), optional `stage1` and `stage2`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { ageModels, ageTextures } from './berry-bush';
import { HORIZONTAL_FACINGS, SOUTH_BASED_Y, variant, variants } from './blockstates';
import { cropStageSlot, stageModelIndex } from './crop';
import type { ModelSpec, TypeLowering } from './models';

/** The ages of a cocoa pod: 0 to 2. */
export const COCOA_AGES = 3;

/** Items a ripe pod drops, as vanilla's cocoa. */
export const RIPE_COCOA_COUNT = 3;

const STAGE_SLOTS = Array.from({ length: COCOA_AGES }, (_, index) => cropStageSlot(index));

export const cocoaType: TypeLowering = {
  slots: [cropStageSlot(0)],
  optionalSlots: STAGE_SLOTS.slice(1),
  itemSlot: cropStageSlot(COCOA_AGES - 1),
  generate: () => [],
  generateFromData: (data) => {
    const textures = ageTextures(data, COCOA_AGES);
    if (textures.length === 0) return [];
    return STAGE_SLOTS.map((slot, age): ModelSpec => {
      const texture = textures[stageModelIndex(age, textures.length, COCOA_AGES)] as string;
      return {
        slot,
        suffix: `_${slot}`,
        parent: `minecraft:block/cocoa_stage${age}`,
        textures: { cocoa: texture, particle: texture },
      };
    });
  },
  blockstate: (models) => {
    const byAge = ageModels(models, COCOA_AGES);
    return variants(
      byAge.flatMap((model, age) =>
        HORIZONTAL_FACINGS.map(
          (facing) =>
            [{ age: String(age), facing }, variant(model, { y: SOUTH_BASED_Y[facing] })] as const,
        ),
      ),
    );
  },
  selfLoot: ({ blockId, itemId, namespace, path }): JsonObject => ({
    type: 'minecraft:block',
    pools: [
      {
        entries: [
          {
            type: 'minecraft:item',
            modifier: [
              {
                type: 'minecraft:set_count',
                condition: {
                  type: 'minecraft:match_block',
                  blocks: blockId,
                  state: { age: String(COCOA_AGES - 1) },
                },
                count: RIPE_COCOA_COUNT,
              },
              { type: 'minecraft:explosion_decay' },
            ],
            name: itemId,
          },
        ],
        rolls: 1,
      },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  }),
};
