/**
 * `hanging_sign` (ADR 0094 D1, D3, D6, D10): a sign hanging under a block, either free (on two
 * chains, turning in sixteen steps) or attached (on one bar, for a ceiling too narrow), with
 * its generated wall companion `<path>_wall` hanging from a bracket. The models are vanilla's
 * `minecraft:block/template_hanging_sign_rot_0` to `_rot_3` at `<ns>:block/<path>_rot_0` to
 * `_rot_3`, `template_attached_hanging_sign_rot_0` to `_rot_3` at
 * `<ns>:block/<path>_attached_rot_0` to `_rot_3`, and `template_wall_hanging_sign` at
 * `<ns>:block/<path>_wall`, each with `all` and `particle` from `textures.all` (else the first
 * texture). The block state is vanilla's `attached` by `rotation` variants (rotation `r` shows
 * `_rot_{r % 4}` turned `90 * floor(r / 4)` about Y); the wall hanging sign's is vanilla's
 * `facing` variants, the model facing south turned about Y. The block item is a flat
 * `minecraft:item/generated` model of `textures.item` (default `all`).
 *
 * The edit screen shows `<ns>:textures/gui/hanging_signs/<path>.png` (16 by 16 pixels; B440):
 * the picture `textures.hanging_gui` (default `all`) is meant to be there; see
 * `signGuiTextureId` (lowering cannot copy a picture).
 *
 * Tags: block `ceiling_hanging_signs`, the wall hanging sign `wall_hanging_signs`, item
 * `hanging_signs`.
 *
 * `"loot": "self"` drops the item from both blocks (ADR 0094 D10).
 *
 * Model slots: `rot0` to `rot3`, `attached_rot0` to `attached_rot3`, `wall`.
 */
import { variants } from './blockstates';
import { type TypeLowering, WALL_COMPANION_SUFFIX } from './models';
import { rotationVariants, SIGN_ROTATION_SLOTS, signModelSpecs, wallSignBlockstate } from './sign';
import type { TypeTags } from './tags';

/** The attached models of a hanging sign, one per quarter step. */
export const ATTACHED_ROTATION_SLOTS = Object.freeze(
  SIGN_ROTATION_SLOTS.map((slot) => `attached_${slot}`),
);

/** The hanging sign tags: the hanging block's and the wall block's block tags and the item tag. */
export const HANGING_SIGN_TAGS = Object.freeze({
  ceiling: ['ceiling_hanging_signs'],
  wall: ['wall_hanging_signs'],
  item: ['hanging_signs'],
} as const);

export const hangingSignType: TypeLowering = {
  slots: [...SIGN_ROTATION_SLOTS, ...ATTACHED_ROTATION_SLOTS, 'wall'],
  generate: (texture) => [
    ...signModelSpecs(
      texture,
      SIGN_ROTATION_SLOTS,
      (index) => `minecraft:block/template_hanging_sign_rot_${index}`,
      (index) => `_rot_${index}`,
    ),
    ...signModelSpecs(
      texture,
      ATTACHED_ROTATION_SLOTS,
      (index) => `minecraft:block/template_attached_hanging_sign_rot_${index}`,
      (index) => `_attached_rot_${index}`,
    ),
    ...signModelSpecs(
      texture,
      ['wall'],
      () => 'minecraft:block/template_wall_hanging_sign',
      () => WALL_COMPANION_SUFFIX,
    ),
  ],
  itemTexture: (texture) => texture('item'),
  blockstate: (models) =>
    variants([
      ...rotationVariants(models, SIGN_ROTATION_SLOTS, { attached: 'false' }),
      ...rotationVariants(models, ATTACHED_ROTATION_SLOTS, { attached: 'true' }),
    ]),
  tags: (): TypeTags => ({ block: HANGING_SIGN_TAGS.ceiling, item: HANGING_SIGN_TAGS.item }),
  companions: [
    {
      suffix: WALL_COMPANION_SUFFIX,
      blockstate: (models) => wallSignBlockstate(models.wall ?? ''),
      blockTags: HANGING_SIGN_TAGS.wall,
    },
  ],
};
