/**
 * Lowering of `msm:fluid` (ADR 0099 D1, D4 and its amendment after the spike, B470): one element
 * is a fluid, its liquid block under the element id and its bucket `<ns>:<path>_bucket`.
 *
 * - The runtime definition `msm/<ns>/fluid/<path>.json` (layer `msm`): the element data without
 *   the editor-only `display_name`, `bucket_display_name`, `bottle_display_name`,
 *   `cauldron_display_name` and `textures`, with `format` set.
 *   `tint` passes through as a plain RGB number (no alpha).
 * - The liquid block's block state: a single `""` variant (the game draws the liquid itself, so
 *   the block state has no `level` variants) naming `<ns>:block/<path>`, a model without
 *   elements whose `particle` is the still picture, as vanilla water's model is. The same model
 *   carries the fluid's pictures as the texture variables `still`, `flowing` and, when set,
 *   `overlay`: the runtime's client reads them from there to register the fluid's renderer
 *   (ADR 0099 D1: the pictures are editor-only fields that lower to assets).
 * - The bucket: the item model definition `assets/<ns>/items/<path>_bucket.json` and the flat
 *   `minecraft:item/generated` model `<ns>:item/<path>_bucket` showing `textures.bucket`.
 * - With `display_name`: `block.<ns>.<path>` and the bucket's `item.<ns>.<path>_bucket`
 *   (`bucket_display_name`, else the display name followed by " Bucket"). Vanilla's language
 *   file has no key for a fluid itself (checked against the client jar), so none is written.
 * - The fluid tags of `behaves_like` from `target.blocks.fluidTags` (`merge: 'tag'`), holding the
 *   fluid and, where the target registers a liquid as two fluids (`fluidModel: 'two_fluids'`),
 *   `<ns>:flowing_<path>` too.
 *
 * - With `cauldron` or `bottle` (ADR 0108 D2, D3): the cauldron block `<ns>:<path>_cauldron` and
 *   the bottle item `<ns>:<path>_bottle`, lowered by `lowerCauldron` (`cauldron.ts`). `mixing`
 *   (ADR 0108 D1) is a runtime field and passes through in the definition; it writes no file.
 *
 * Pictures left out fall back to vanilla's water pictures (lava's for `behaves_like: lava`),
 * named, never bundled; `blocks-items.fluid-texture-missing` reports the still and flowing ones.
 * Animated pictures carry their own `.png.mcmeta` beside the project's PNG, as vanilla water's
 * do: the element has no animation field, so lowering writes none.
 */
import type { Element, Json, JsonObject, OutputFile, Target, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT } from './block';
import { lowerCauldron } from './cauldron';
import {
  assetPath,
  BlocksItemsLoweringError,
  definitionPath,
  descriptionKey,
  isRecord,
  splitResourceLocation,
} from './paths';
import {
  BLOCK_STATE_SCHEMA,
  itemDefinitionFile,
  langFile,
  MODEL_SCHEMA,
  nonEmptyString,
} from './shared';

/** The element-only fields of a fluid, stripped from the runtime definition. */
export const FLUID_EDITOR_FIELDS = Object.freeze([
  'display_name',
  'bucket_display_name',
  'bottle_display_name',
  'cauldron_display_name',
  'textures',
] as const);

/** The suffix of a fluid's generated bucket item id: `<ns>:<path>_bucket` (ADR 0099 D1). */
export const FLUID_BUCKET_SUFFIX = '_bucket';

/** The prefix of the flowing fluid's path on targets that register two fluids per liquid. */
export const FLOWING_FLUID_PREFIX = 'flowing_';

/** Schema reference of fluid tags. */
export const FLUID_TAG_SCHEMA = 'tag:fluid';

/** What a fluid behaves like for entities (ADR 0099 D1). */
export type FluidBehaviour = 'water' | 'lava' | 'none';

/** The flow numbers of a fluid, with the defaults of its `behaves_like` filled in. */
export interface FluidFlowNumbers {
  tickDelay: number;
  slopeDistance: number;
  dropOff: number;
  infinite: boolean;
}

/**
 * The flow defaults per `behaves_like` (ADR 0099 D1): water's 5, 4, 1 and infinite, lava's 30, 2,
 * 2 and not infinite; `none` takes water's.
 */
export const FLUID_FLOW_DEFAULTS: Readonly<Record<FluidBehaviour, Readonly<FluidFlowNumbers>>> =
  Object.freeze({
    water: Object.freeze({ tickDelay: 5, slopeDistance: 4, dropOff: 1, infinite: true }),
    lava: Object.freeze({ tickDelay: 30, slopeDistance: 2, dropOff: 2, infinite: false }),
    none: Object.freeze({ tickDelay: 5, slopeDistance: 4, dropOff: 1, infinite: true }),
  });

/** The texture slots of a fluid element (`textures.<slot>`). */
export type FluidTextureSlot = 'still' | 'flowing' | 'overlay' | 'bucket' | 'bottle';

/**
 * The vanilla pictures a fluid without its own falls back to, per `behaves_like` (named, never
 * bundled; the user's client jar supplies them). `none` takes water's. Lava has no overlay.
 */
export const FLUID_FALLBACK_TEXTURES: Readonly<
  Record<'water' | 'lava', Readonly<{ still: string; flowing: string; bucket: string }>>
> = Object.freeze({
  water: Object.freeze({
    still: 'minecraft:block/water_still',
    flowing: 'minecraft:block/water_flow',
    bucket: 'minecraft:item/water_bucket',
  }),
  lava: Object.freeze({
    still: 'minecraft:block/lava_still',
    flowing: 'minecraft:block/lava_flow',
    bucket: 'minecraft:item/lava_bucket',
  }),
});

function fluidData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: fluid data must be an object.`);
  }
  return element.data;
}

/** The fluid's `behaves_like`, `water` when absent or not one of the three values. */
export function fluidBehaviourOf(data: Json | undefined): FluidBehaviour {
  const value = isRecord(data) ? data.behaves_like : undefined;
  return value === 'lava' || value === 'none' ? value : 'water';
}

const wholeNumber = (value: Json | undefined): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) ? value : undefined;

/** The fluid's flow numbers: its own `flow` fields over the defaults of its `behaves_like`. */
export function fluidFlowOf(data: Json | undefined): FluidFlowNumbers {
  const defaults = FLUID_FLOW_DEFAULTS[fluidBehaviourOf(data)];
  const flow = isRecord(data) && isRecord(data.flow) ? data.flow : {};
  return {
    tickDelay: wholeNumber(flow.tick_delay) ?? defaults.tickDelay,
    slopeDistance: wholeNumber(flow.slope_distance) ?? defaults.slopeDistance,
    dropOff: wholeNumber(flow.drop_off) ?? defaults.dropOff,
    infinite: typeof flow.infinite === 'boolean' ? flow.infinite : defaults.infinite,
  };
}

/**
 * How many blocks a fluid spreads sideways from its source on flat ground: a source is level 8
 * and every block of spreading takes `drop_off` away, so it reaches `floor(7 / drop_off)`
 * blocks (7 for water, 3 for lava).
 */
export function fluidSpreadDistance(dropOff: number): number {
  return Math.floor(7 / Math.max(1, dropOff));
}

/** The picture an element names in `textures.<slot>`, or `undefined`. */
export function fluidTextureOf(data: Json | undefined, slot: FluidTextureSlot): string | undefined {
  const textures = isRecord(data) && isRecord(data.textures) ? data.textures : {};
  return nonEmptyString(textures[slot]);
}

/**
 * The pictures lowering writes: the element's own, else vanilla water's (lava's for
 * `behaves_like: lava`); the overlay only when the element sets one.
 */
export function fluidTextures(data: Json | undefined): {
  still: string;
  flowing: string;
  overlay: string | undefined;
  bucket: string;
} {
  const fallback = FLUID_FALLBACK_TEXTURES[fluidBehaviourOf(data) === 'lava' ? 'lava' : 'water'];
  return {
    still: fluidTextureOf(data, 'still') ?? fallback.still,
    flowing: fluidTextureOf(data, 'flowing') ?? fallback.flowing,
    overlay: fluidTextureOf(data, 'overlay'),
    bucket: fluidTextureOf(data, 'bucket') ?? fallback.bucket,
  };
}

/** The generated bucket item id of a fluid: `<ns>:<path>_bucket` (ADR 0099 D1). */
export function fluidBucketId(fluidId: string): string {
  const { namespace, path } = splitResourceLocation(fluidId);
  return `${namespace}:${path}${FLUID_BUCKET_SUFFIX}`;
}

/**
 * The flowing fluid's id `<ns>:flowing_<path>` (the last path segment prefixed) on a target that
 * registers a liquid as two fluids (`fluidModel: 'two_fluids'`); `undefined` on any other.
 */
export function flowingFluidId(
  target: Pick<TargetFacts, 'blocks'>,
  fluidId: string,
): string | undefined {
  if (target.blocks?.fluidModel !== 'two_fluids') return undefined;
  const { namespace, path } = splitResourceLocation(fluidId);
  const slash = path.lastIndexOf('/');
  return `${namespace}:${path.slice(0, slash + 1)}${FLOWING_FLUID_PREFIX}${path.slice(slash + 1)}`;
}

/**
 * Every fluid id one element registers on `target`: its own and, on a two-fluid target, the
 * flowing one.
 */
export function fluidRegistryIds(target: Pick<TargetFacts, 'blocks'>, fluidId: string): string[] {
  const flowing = flowingFluidId(target, fluidId);
  return flowing === undefined ? [fluidId] : [fluidId, flowing];
}

/**
 * The runtime fluid definition: the element data without {@link FLUID_EDITOR_FIELDS}, with
 * `format` set to the format this plugin writes. Every other field passes through unchanged.
 *
 * @throws {@link BlocksItemsLoweringError} If the data is not an object.
 */
export function fluidDefinition(element: Element): JsonObject {
  const definition = structuredClone(fluidData(element));
  for (const field of FLUID_EDITOR_FIELDS) delete definition[field];
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/**
 * The liquid block's model `<ns>:block/<path>`: no elements, `particle` the still picture (as
 * vanilla water's model), plus the texture variables `still`, `flowing` and, when set, `overlay`
 * the runtime's client registers the fluid's renderer from.
 */
export function fluidBlockModel(data: Json | undefined): JsonObject {
  const textures = fluidTextures(data);
  const variables: JsonObject = {
    particle: textures.still,
    still: textures.still,
    flowing: textures.flowing,
  };
  if (textures.overlay !== undefined) variables.overlay = textures.overlay;
  return { textures: variables };
}

/**
 * Lowers an `msm:fluid` element, in this order: the runtime definition, the liquid block's block
 * state and model, the bucket's item model definition and model, the language keys (with
 * `display_name`), the fluid tags of `behaves_like`, then the cauldron's and the bottle's files
 * (`lowerCauldron`, with `cauldron` or `bottle`).
 *
 * @param element - The element.
 * @param target - The target supplying the folders, the fluid model and the fluid tags.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerFluid(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = fluidData(element);
  const textures = fluidTextures(data);
  const blockModel = `${namespace}:block/${path}`;
  const bucketPath = `${path}${FLUID_BUCKET_SUFFIX}`;
  const bucketModel = `${namespace}:item/${bucketPath}`;
  const files: OutputFile[] = [
    {
      path: definitionPath('fluid', namespace, path),
      contents: fluidDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.fluidDefinition,
    },
    {
      path: assetPath(target, 'block_definition', namespace, path),
      contents: { variants: { '': { model: blockModel } } },
      layer: 'resourcepack',
      schema: BLOCK_STATE_SCHEMA,
    },
    {
      path: assetPath(target, 'model', namespace, `block/${path}`),
      contents: fluidBlockModel(data),
      layer: 'resourcepack',
      schema: MODEL_SCHEMA,
    },
    itemDefinitionFile(target, namespace, bucketPath, bucketModel),
    {
      path: assetPath(target, 'model', namespace, `item/${bucketPath}`),
      contents: { parent: 'minecraft:item/generated', textures: { layer0: textures.bucket } },
      layer: 'resourcepack',
      schema: MODEL_SCHEMA,
    },
  ];
  const displayName = nonEmptyString(data.display_name);
  if (displayName !== undefined) {
    files.push(langFile(target, namespace, descriptionKey('block', namespace, path), displayName));
  }
  const bucketName =
    nonEmptyString(data.bucket_display_name) ??
    (displayName === undefined ? undefined : `${displayName} Bucket`);
  if (bucketName !== undefined) {
    files.push(
      langFile(target, namespace, descriptionKey('item', namespace, bucketPath), bucketName),
    );
  }
  const behaviour = fluidBehaviourOf(data);
  const tags = behaviour === 'none' ? [] : (target.blocks?.fluidTags?.[behaviour] ?? []);
  const values = fluidRegistryIds(target, element.id);
  for (const tag of tags) {
    const { namespace: tagNamespace, path: tagPath } = splitResourceLocation(tag);
    files.push({
      path: `data/${tagNamespace}/${target.folders.data.tags}/fluid/${tagPath}.json`,
      contents: { values: [...values] },
      layer: 'datapack',
      schema: FLUID_TAG_SCHEMA,
      merge: 'tag',
    });
  }
  files.push(...lowerCauldron(element, target));
  return files;
}
