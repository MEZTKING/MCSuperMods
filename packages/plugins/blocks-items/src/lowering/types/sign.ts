/**
 * `sign` (ADR 0094 D1, D3, D6, D10): a standing sign that turns in sixteen steps, with its
 * generated wall companion `<path>_wall`. In 26.x the board is a block model (B440, S1), so the
 * project's own block states and models give the sign its look: vanilla's
 * `minecraft:block/template_sign_rot_0` to `_rot_3` at `<ns>:block/<path>_rot_0` to `_rot_3`,
 * and `template_wall_sign` at `<ns>:block/<path>_wall`, each with the variables `all` and
 * `particle` from `textures.all` (else the first texture). The standing block state is
 * vanilla's sixteen `rotation` variants: rotation `r` shows `_rot_{r % 4}` turned
 * `90 * floor(r / 4)` degrees about Y; the wall sign's is vanilla's `facing` variants, the
 * model facing south turned about Y. The block item is a flat `minecraft:item/generated` model
 * of `textures.item` (default `all`); it places the sign on a floor and the wall sign on a wall.
 *
 * The edit screen shows `<ns>:textures/gui/signs/<path>.png` (24 by 26 pixels; B440): the
 * picture `textures.sign` (default `all`) is meant to be there. Lowering writes JSON only, so it
 * cannot copy a picture: {@link signGuiTextureId} names the texture id the picture must have
 * and {@link signGuiTexturePath} its path in the resource pack.
 *
 * Tags: block `standing_signs`, the wall sign `wall_signs`, item `signs`.
 *
 * `"loot": "self"` drops the item from both blocks (ADR 0094 D10).
 *
 * Model slots: `rot0` to `rot3`, `wall`.
 */
import type { JsonObject, Target } from '@msm/plugin-api';
import { isRecord, splitResourceLocation } from '../paths';
import { nonEmptyString } from '../shared';
import { HORIZONTAL_FACINGS, SOUTH_BASED_Y, variant, variants } from './blockstates';
import {
  type ModelSpec,
  type SlotModels,
  type TextureLookup,
  type TypeLowering,
  WALL_COMPANION_SUFFIX,
} from './models';
import type { TypeTags } from './tags';

/** The four standing models of a sign (and the free hanging sign), one per quarter step. */
export const SIGN_ROTATION_SLOTS = Object.freeze(['rot0', 'rot1', 'rot2', 'rot3'] as const);

/** The sign tags: the standing sign's and the wall sign's block tags and the item tag. */
export const SIGN_TAGS = Object.freeze({
  standing: ['standing_signs'],
  wall: ['wall_signs'],
  item: ['signs'],
} as const);

/** Where the client reads the edit screen's picture of each sign type, under `textures/`. */
export const SIGN_GUI_FOLDERS: Readonly<Record<'sign' | 'hanging_sign', string>> = Object.freeze({
  sign: 'gui/signs',
  hanging_sign: 'gui/hanging_signs',
});

/** The element texture slot of the edit screen's picture of each sign type. */
const GUI_SLOTS: Readonly<Record<'sign' | 'hanging_sign', string>> = {
  sign: 'sign',
  hanging_sign: 'hanging_gui',
};

/**
 * The texture id of the edit screen's picture of a sign or hanging sign: `<ns>:gui/signs/<path>`
 * or `<ns>:gui/hanging_signs/<path>` (the wood type's name is the element id; B440).
 */
export function signGuiTextureId(blockId: string, type: 'sign' | 'hanging_sign'): string {
  const { namespace, path } = splitResourceLocation(blockId);
  return `${namespace}:${SIGN_GUI_FOLDERS[type]}/${path}`;
}

/** The resource pack path of {@link signGuiTextureId}: `assets/<ns>/textures/gui/.../<path>.png`. */
export function signGuiTexturePath(
  target: Pick<Target, 'folders'>,
  blockId: string,
  type: 'sign' | 'hanging_sign',
): string {
  const { namespace, path } = splitResourceLocation(blockId);
  return `assets/${namespace}/${target.folders.resource.textures}/${SIGN_GUI_FOLDERS[type]}/${path}.png`;
}

/**
 * The picture the edit screen should show: `textures.sign` (`textures.hanging_gui` for a hanging
 * sign), else `textures.all`; `undefined` without either.
 */
export function signGuiPicture(
  data: JsonObject,
  type: 'sign' | 'hanging_sign',
): string | undefined {
  const textures = isRecord(data.textures) ? data.textures : {};
  return nonEmptyString(textures[GUI_SLOTS[type]]) ?? nonEmptyString(textures.all);
}

/** The model specs of `slots` on `parent(index)`, each with `all` and `particle`. */
export function signModelSpecs(
  texture: TextureLookup,
  slots: readonly string[],
  parent: (index: number) => string,
  suffix: (index: number) => string,
): ModelSpec[] {
  const all = texture('all');
  return slots.map((slot, index) => ({
    slot,
    suffix: suffix(index),
    parent: parent(index),
    textures: { all, particle: all },
  }));
}

/**
 * The sixteen `rotation` variants of a standing sign (or of a hanging sign with `extra`
 * properties): rotation `r` shows `models[slots[r % 4]]` turned `90 * floor(r / 4)` about Y.
 */
export function rotationVariants(
  models: SlotModels,
  slots: readonly string[],
  extra: Readonly<Record<string, string>> = {},
): [Readonly<Record<string, string>>, JsonObject][] {
  const fallback = models[slots[0] ?? ''] ?? '';
  return Array.from({ length: 16 }, (_, rotation) => [
    { ...extra, rotation: String(rotation) },
    variant(models[slots[rotation % 4] ?? ''] ?? fallback, { y: 90 * Math.floor(rotation / 4) }),
  ]);
}

/** The `facing` variants of a wall sign or wall hanging sign: the model facing south, turned. */
export function wallSignBlockstate(model: string): JsonObject {
  return variants(
    HORIZONTAL_FACINGS.map(
      (facing) => [{ facing }, variant(model, { y: SOUTH_BASED_Y[facing] })] as const,
    ),
  );
}

export const signType: TypeLowering = {
  slots: [...SIGN_ROTATION_SLOTS, 'wall'],
  generate: (texture) => [
    ...signModelSpecs(
      texture,
      SIGN_ROTATION_SLOTS,
      (index) => `minecraft:block/template_sign_rot_${index}`,
      (index) => `_rot_${index}`,
    ),
    ...signModelSpecs(
      texture,
      ['wall'],
      () => 'minecraft:block/template_wall_sign',
      () => WALL_COMPANION_SUFFIX,
    ),
  ],
  itemTexture: (texture) => texture('item'),
  blockstate: (models) => variants(rotationVariants(models, SIGN_ROTATION_SLOTS)),
  tags: (): TypeTags => ({ block: SIGN_TAGS.standing, item: SIGN_TAGS.item }),
  companions: [
    {
      suffix: WALL_COMPANION_SUFFIX,
      blockstate: (models) => wallSignBlockstate(models.wall ?? ''),
      blockTags: SIGN_TAGS.wall,
    },
  ],
};
