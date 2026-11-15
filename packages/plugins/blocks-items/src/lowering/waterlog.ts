/**
 * Waterlogging (ADR 0094 D7): `msm:waterloggable` (an empty struct) on the `MsmBlock` types
 * `block`, `pillar`, `horizontal` and `directional`. The runtime gives such a block vanilla's
 * `waterlogged` property; lowering writes every variant of the block state definition twice,
 * `waterlogged=false` and `waterlogged=true`, with the same models (water is drawn by the game
 * around the block, so the model does not change).
 *
 * Containers and machines are not waterloggable (limit Q8): a block with `msm:container` or
 * `msm:machine` keeps its block state without the property, as the runtime builds its own class
 * for it (the validators report the pair as `blocks-items.component-conflict`). The new types
 * that vanilla waterlogs (ladder, lantern, chain, signs, candle, sea pickle, scaffolding) keep
 * vanilla's own waterlogging and need no component; their block states leave the property out,
 * as vanilla's do.
 */
import type { Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { assetPath, isRecord } from './paths';
import { type BlockTypeName, containerOf, machineOf } from './types';
import { withStateProperty } from './types/blockstates';

/** The waterlogging component. */
export const WATERLOGGABLE_COMPONENT = 'msm:waterloggable';
/** The block state property a waterloggable block gains. */
export const WATERLOGGED_PROPERTY = 'waterlogged';

/** The types that take `msm:waterloggable` (ADR 0094 D7): the `MsmBlock` family. */
export const WATERLOGGABLE_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  'block',
  'pillar',
  'horizontal',
  'directional',
]);

/** Whether block data has the `msm:waterloggable` component (an object). */
export function hasWaterloggable(data: Json | undefined): boolean {
  const components = isRecord(data) ? data.components : undefined;
  return isRecord(components) && isRecord(components[WATERLOGGABLE_COMPONENT]);
}

/**
 * Whether a block of `type` with `data` is waterlogged at runtime: the component on one of the
 * {@link WATERLOGGABLE_BLOCK_TYPES}, without `msm:container` or `msm:machine` (limit Q8).
 */
export function isWaterloggable(type: BlockTypeName, data: Json | undefined): boolean {
  if (!WATERLOGGABLE_BLOCK_TYPES.includes(type) || !hasWaterloggable(data)) return false;
  return containerOf(data) === undefined && machineOf(data) === undefined;
}

/**
 * A `variants` block state definition with every variant written for `waterlogged=false` and
 * `waterlogged=true`, both with the same model. A multipart definition is returned as it is.
 */
export function withWaterloggedVariants(blockstate: JsonObject): JsonObject {
  return withStateProperty(blockstate, blockstate, WATERLOGGED_PROPERTY);
}

/**
 * Adds the `waterlogged` variants to the block state definition among `files` (the file at
 * `assets/<ns>/<blockstates>/<path>.json`) when the block is waterloggable; otherwise, or
 * without a block state (a block with no appearance), the files are unchanged.
 *
 * @param files - The block's output files; the block state file's contents are replaced.
 */
export function lowerWaterloggingInPlace(
  files: OutputFile[],
  type: BlockTypeName,
  data: Json | undefined,
  target: Target,
  namespace: string,
  path: string,
): void {
  if (!isWaterloggable(type, data)) return;
  const statePath = assetPath(target, 'block_definition', namespace, path);
  const file = files.find((candidate) => candidate.path === statePath);
  const contents = file?.contents;
  if (file === undefined || contents instanceof Uint8Array || !isRecord(contents)) return;
  file.contents = withWaterloggedVariants(contents);
}
