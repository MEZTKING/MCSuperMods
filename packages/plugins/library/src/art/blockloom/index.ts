/**
 * Blockloom's block pictures in MSM (ADR 0135): the block picture style over the vendored
 * `@blockloom/core` (https://github.com/MEZTKING/blockloom, MIT Licence, Copyright (c) 2026
 * Lelouch; `vendor/blockloom-core/`, tag `core-v1.1.0`).
 *
 * @packageDocumentation
 */

export {
  BLOCK_PICTURE_STYLE_LABELS,
  BLOCK_PICTURE_STYLES,
  BLOCKLOOM_ENGINE_VERSION,
  BLOCKLOOM_RECIPE_IDS,
  type BlockloomDrawing,
  type BlockloomLook,
  type BlockPictureStyle,
  blockloomDrawing,
  blockloomDraws,
  blockloomMaterials,
  blockloomOptions,
  blockloomPictureNote,
  blockPictureCacheKey,
  blockPictureStyle,
  colourTint,
  nearestOre,
  parseBlockDescription,
  setBlockPictureStyle,
} from './style';
