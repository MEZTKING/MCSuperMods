/**
 * `dripleaf` (ADR 0103 D1, D4 and its amendment after the spike): a big leaf on a stem that tilts
 * under a standing entity (`size: "big"`, the stem is the generated companion `<path>_stem`), or
 * a small two-block plant that bone meal grows into the big element `grows_into` (`"small"`).
 *
 * The generated models name vanilla's dripleaf templates, with the element's textures (`top`,
 * `side`, `tip`, `stem`, `stem_top`, `stem_bottom`):
 *
 * - `big`: `minecraft:block/big_dripleaf`, `big_dripleaf_partial_tilt` and
 *   `big_dripleaf_full_tilt` at `<ns>:block/<path>`, `_partial_tilt` and `_full_tilt`, and
 *   `big_dripleaf_stem` at `<ns>:block/<path>_stem`;
 * - `small`: `minecraft:block/small_dripleaf_top` at `<ns>:block/<path>` (its stem from
 *   `stem_top`) and `small_dripleaf_bottom` at `<ns>:block/<path>_bottom` (from `stem_bottom`,
 *   default `stem_top`).
 *
 * The block states are vanilla's: a big leaf by `facing` and `tilt` (`none` and `unstable` flat,
 * `partial`, `full`), its stem by `facing`; a small one by `facing` and `half`; each model faces
 * north and turns about Y. Water is drawn by the game, so `waterlogged` is left out, as in
 * vanilla's files. The block item is a flat `minecraft:item/generated` model of `textures.item`
 * (default `top`).
 *
 * Tags: none (vanilla's soil tags for dripleaf are `TargetFacts.blocks.plantSoils`, read by the
 * runtime, never joined).
 *
 * `"loot": "self"`, as vanilla's tables: a big leaf and its stem drop the item; a small one drops
 * it only to shears.
 *
 * Model slots: `leaf`; optional `partial_tilt`, `full_tilt`, `stem` (big) and `bottom` (small).
 */
import type { JsonObject } from '@msm/plugin-api';
import { nonEmptyString } from '../shared';
import { HORIZONTAL_FACINGS, NORTH_BASED_Y, variant, variants } from './blockstates';
import {
  type ModelSpec,
  readTextures,
  type SlotModels,
  type TypeLowering,
  textureLookup,
} from './models';

/** The suffix of a big dripleaf's stem companion (ADR 0103 D1). */
export const STEM_COMPANION_SUFFIX = '_stem';

/** The sizes of a dripleaf. */
export const DRIPLEAF_SIZES = Object.freeze(['big', 'small'] as const);
export type DripleafSize = (typeof DRIPLEAF_SIZES)[number];

/** Vanilla's tilt timing, in ticks, as measured by B503 (verify at implementation). */
export const DEFAULT_TILT_TICKS: readonly number[] = Object.freeze([2, 10, 10]);

/** The size of a dripleaf; `big` when it is missing or unknown. */
export const dripleafSizeOf = (data: JsonObject): DripleafSize =>
  nonEmptyString(data.size) === 'small' ? 'small' : 'big';

const isBig = (data: JsonObject): boolean => dripleafSizeOf(data) === 'big';

/** The models from the element's textures, by size. */
function dripleafSpecs(data: JsonObject): ModelSpec[] {
  const texture = textureLookup(readTextures(data));
  if (texture === undefined) return [];
  const top = texture('top');
  const side = texture('side', 'top');
  if (isBig(data)) {
    const stem = texture('stem', 'side', 'top');
    const leaf = { particle: top, side, stem, tip: texture('tip', 'side', 'top'), top };
    return [
      { slot: 'leaf', suffix: '', parent: 'minecraft:block/big_dripleaf', textures: leaf },
      {
        slot: 'partial_tilt',
        suffix: '_partial_tilt',
        parent: 'minecraft:block/big_dripleaf_partial_tilt',
        textures: leaf,
      },
      {
        slot: 'full_tilt',
        suffix: '_full_tilt',
        parent: 'minecraft:block/big_dripleaf_full_tilt',
        textures: leaf,
      },
      {
        slot: 'stem',
        suffix: STEM_COMPANION_SUFFIX,
        parent: 'minecraft:block/big_dripleaf_stem',
        textures: { particle: stem, stem },
      },
    ];
  }
  const stemTop = texture('stem_top', 'stem', 'side', 'top');
  const stemBottom = texture('stem_bottom', 'stem_top', 'stem', 'side', 'top');
  return [
    {
      slot: 'leaf',
      suffix: '',
      parent: 'minecraft:block/small_dripleaf_top',
      textures: { particle: top, side, stem: stemTop, top },
    },
    {
      slot: 'bottom',
      suffix: '_bottom',
      parent: 'minecraft:block/small_dripleaf_bottom',
      textures: { particle: stemBottom, stem: stemBottom },
    },
  ];
}

/** Variants of `model` facing each horizontal direction, with `extra` properties. */
const facingVariants = (model: string, extra: Readonly<Record<string, string>> = {}) =>
  HORIZONTAL_FACINGS.map(
    (facing) => [{ ...extra, facing }, variant(model, { y: NORTH_BASED_Y[facing] })] as const,
  );

/** A big leaf's model at each `tilt`, as vanilla's (`unstable` is still flat). */
function bigBlockstate(models: SlotModels): JsonObject {
  const leaf = models.leaf ?? '';
  const partial = models.partial_tilt ?? leaf;
  const full = models.full_tilt ?? partial;
  const tilts: Readonly<Record<string, string>> = {
    full,
    none: leaf,
    partial,
    unstable: leaf,
  };
  return variants(
    Object.entries(tilts).flatMap(([tilt, model]) => facingVariants(model, { tilt })),
  );
}

function smallBlockstate(models: SlotModels): JsonObject {
  const top = models.leaf ?? '';
  return variants([
    ...facingVariants(models.bottom ?? top, { half: 'lower' }),
    ...facingVariants(top, { half: 'upper' }),
  ]);
}

export const dripleafType: TypeLowering = {
  slots: ['leaf'],
  optionalSlots: ['partial_tilt', 'full_tilt', 'stem', 'bottom'],
  generate: () => [],
  generateFromData: dripleafSpecs,
  itemTextureFromData: (data) => textureLookup(readTextures(data))?.('item', 'top'),
  blockstate: (models, { data }) => (isBig(data) ? bigBlockstate(models) : smallBlockstate(models)),
  selfLoot: ({ data, itemId, namespace, path }): JsonObject => ({
    type: 'minecraft:block',
    pools: [
      isBig(data)
        ? {
            bonus_rolls: 0,
            condition: { type: 'minecraft:survives_explosion' },
            entries: [{ type: 'minecraft:item', name: itemId }],
            rolls: 1,
          }
        : {
            condition: 'minecraft:tool/can_shear',
            entries: [{ type: 'minecraft:item', name: itemId }],
            rolls: 1,
          },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  }),
  companions: [
    {
      suffix: STEM_COMPANION_SUFFIX,
      applies: isBig,
      blockstate: (models) => variants(facingVariants(models.stem ?? models.leaf ?? '')),
    },
  ],
};
