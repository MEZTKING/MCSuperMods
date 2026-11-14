/**
 * Generated block models of the block types (ADR 0067 D7): each type names its model slots,
 * and from the element's editor-only `textures` lowering writes one model per slot at
 * `<ns>:block/<path><suffix>`, parented on the vanilla template of that slot (F14). The user's
 * client jar supplies the templates; nothing is bundled.
 */
import type { JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { assetPath, isRecord, splitResourceLocation } from '../paths';
import { MODEL_SCHEMA, nonEmptyString } from '../shared';
import type { TypeTags } from './tags';

/** One generated model: the slot it fills, its id suffix, vanilla parent and textures. */
export interface ModelSpec {
  /** The model slot (also a key of the element's `models`). */
  slot: string;
  /** Appended to `<ns>:block/<path>` to form the model id; `''` for the type's base model. */
  suffix: string;
  /** The vanilla template model, such as `minecraft:block/stairs`. */
  parent: string;
  /** The template's texture variables. */
  textures: Readonly<Record<string, string>>;
}

/**
 * Looks up a texture by the first key that is set, then `all`, then the first texture the
 * element gives. Only built over non-empty textures, so it always finds one.
 */
export type TextureLookup = (...keys: string[]) => string;

/** The element's `textures` as a map of non-empty strings (other values are skipped). */
export function readTextures(data: JsonObject): Readonly<Record<string, string>> {
  const textures = data.textures;
  if (!isRecord(textures)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(textures)) {
    const texture = nonEmptyString(value);
    if (texture !== undefined) out[key] = texture;
  }
  return out;
}

/** A {@link TextureLookup} over `textures`, or `undefined` when there are none. */
export function textureLookup(
  textures: Readonly<Record<string, string>>,
): TextureLookup | undefined {
  const first = Object.values(textures)[0];
  if (first === undefined) return undefined;
  return (...keys) => {
    for (const key of keys) {
      const texture = textures[key];
      if (texture !== undefined) return texture;
    }
    return textures.all ?? first;
  };
}

/**
 * The model specs of `slots` with the same textures, each parented on `parent(slot)` and named
 * with the suffix `suffix(slot)` (default `_<slot>`).
 */
export function slotSpecs(
  slots: readonly string[],
  parent: (slot: string) => string,
  textures: Readonly<Record<string, string>>,
  suffix: (slot: string) => string = (slot) => `_${slot}`,
): ModelSpec[] {
  return slots.map((slot) => ({ slot, suffix: suffix(slot), parent: parent(slot), textures }));
}

/** The model id `<ns>:block/<path><suffix>`. */
export const blockModelId = (namespace: string, path: string, suffix: string): string =>
  `${namespace}:block/${path}${suffix}`;

/** The model file `assets/<ns>/models/<path>.json` of the model id `<ns>:<path>`. */
export function modelFile(
  target: Target,
  id: string,
  parent: string,
  textures: Readonly<Record<string, string>>,
): OutputFile {
  const { namespace, path } = splitResourceLocation(id);
  const contents: JsonObject = { parent, textures: { ...textures } };
  return {
    path: assetPath(target, 'model', namespace, path),
    contents,
    layer: 'resourcepack',
    schema: MODEL_SCHEMA,
  };
}

/** The flat item model `minecraft:item/generated` that a door or pane item shows. */
export const GENERATED_ITEM_PARENT = 'minecraft:item/generated';

/** The models of a block by slot, after `models`, `model` and generated models are merged. */
export type SlotModels = Readonly<Record<string, string>>;

/** What a {@link TypeLowering} gets besides the slot models. */
export interface TypeContext {
  /** The block id. */
  blockId: string;
  /** The block item id, or `undefined` without a block item. */
  itemId: string | undefined;
  namespace: string;
  path: string;
  /** The element data (editor fields still present). */
  data: JsonObject;
}

/**
 * How one block type lowers its appearance, tags and `self` loot (ADR 0067 D5). The model slots
 * are the keys of the element's `models` for the type; every type also takes the slot `item`,
 * the model the block item shows.
 */
export interface TypeLowering {
  /** The slots the block state needs, the primary slot first. */
  readonly slots: readonly string[];
  /** Slots the block state uses when given and otherwise replaces by rotating another slot. */
  readonly optionalSlots?: readonly string[];
  /** Whether the element's single `model` field fills the primary slot. */
  readonly acceptsModel?: boolean;
  /**
   * Whether a block with neither `models` nor `textures` still points its block state at
   * `<ns>:block/<path>` (the plant stubs until B264).
   */
  readonly ownModelFallback?: boolean;
  /** The slot the block item shows when `models.item` is absent; default the primary slot. */
  readonly itemSlot?: string;
  /** The models generated from the element's textures, one per slot; `[]` without textures. */
  generate(texture: TextureLookup): ModelSpec[];
  /**
   * The texture of a flat `minecraft:item/generated` item model at `<item ns>:item/<item path>`
   * (doors and panes, as vanilla), used when `models.item` is absent and the textures give one.
   */
  itemTexture?(texture: TextureLookup): string;
  /** The block state definition from the slot models (every slot of `slots` is present). */
  blockstate(models: SlotModels, context: TypeContext): JsonObject;
  /** Vanilla tags the type always joins (ADR 0067 D6). */
  tags?(data: JsonObject): TypeTags;
  /** The `"loot": "self"` table when it is not "drops itself" (slab double, door lower half). */
  selfLoot?(context: TypeContext & { itemId: string }): JsonObject;
}
