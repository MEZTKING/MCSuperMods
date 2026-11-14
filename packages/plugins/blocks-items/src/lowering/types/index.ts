/**
 * The block types of `msm:block` (ADR 0067 D1, D5, D7; ADR 0068 D1) and how each lowers: a
 * dispatch table from the `type` field to a {@link TypeLowering}. Absent `type` is `block`,
 * which lowers byte-identically to the blocks made before types existed.
 *
 * Model slots per type (the keys of the element's editor-only `models`; every type also takes
 * `item`, the model the block item shows):
 *
 * | Type | Slots |
 * |---|---|
 * | `block` | `default` (the `model` field) |
 * | `pillar` | `default`, optional `horizontal` |
 * | `horizontal` | `default` |
 * | `directional` | `default`, optional `vertical` |
 * | `slab` | `bottom`, `top`, `double` |
 * | `stairs` | `straight`, `inner`, `outer` |
 * | `wall` | `post`, `side`, `side_tall`, `inventory` |
 * | `fence` | `post`, `side`, `inventory` |
 * | `fence_gate` | `closed`, `open`, `wall`, `wall_open` |
 * | `door` | `bottom_left`, `bottom_left_open`, `bottom_right`, `bottom_right_open`, `top_left`, `top_left_open`, `top_right`, `top_right_open` |
 * | `trapdoor` | `bottom`, `top`, `open` |
 * | `button` | `default`, `pressed`, `inventory` |
 * | `pressure_plate` | `up`, `down` |
 * | `pane` | `post`, `side`, `side_alt`, `noside`, `noside_alt` |
 * | `crop` | `stage0`, optional `stage1` to `stage15` (the stage models in order, spread over the ages) |
 * | `sapling` | `sapling` |
 * | `leaves` | `leaves` |
 *
 * `model` fills the `default` slot of `block`, `pillar`, `horizontal` and `directional`. A slot
 * in `models` wins over the model generated for it from `textures`; a required slot that is
 * still empty takes the first model the block has (the validators report it).
 */
import type { Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { assetPath, BlocksItemsLoweringError, isRecord, splitResourceLocation } from '../paths';
import { BLOCK_STATE_SCHEMA, itemDefinitionFile, nonEmptyString, vanillaTagFile } from '../shared';
import { blockType } from './block';
import { buttonType } from './button';
import { cropType } from './crop';
import { directionalType } from './directional';
import { doorType } from './door';
import { fenceType } from './fence';
import { fenceGateType } from './fence-gate';
import { horizontalType } from './horizontal';
import { leavesType } from './leaves';
import {
  blockModelId,
  GENERATED_ITEM_PARENT,
  type ModelSpec,
  modelFile,
  readTextures,
  type SlotModels,
  type TypeContext,
  type TypeLowering,
  textureLookup,
} from './models';
import { paneType } from './pane';
import { pillarType } from './pillar';
import { pressurePlateType } from './pressure-plate';
import { saplingType } from './sapling';
import { slabType } from './slab';
import { stairsType } from './stairs';
import { trapdoorType } from './trapdoor';
import { wallType } from './wall';

export type { ModelSpec, SlotModels, TypeContext, TypeLowering } from './models';
export {
  STONE_SET_TYPES,
  TYPE_BLOCK_TAGS,
  TYPE_ITEM_TAGS,
  type TypeTags,
  WOOD_SOUND_TYPES,
  WOODEN_SET_TYPES,
} from './tags';

/** The block types, in the order of the format's `BlockType` enum. */
export const BLOCK_TYPES = Object.freeze([
  'block',
  'pillar',
  'horizontal',
  'directional',
  'slab',
  'stairs',
  'wall',
  'fence',
  'fence_gate',
  'door',
  'trapdoor',
  'button',
  'pressure_plate',
  'pane',
  'crop',
  'sapling',
  'leaves',
] as const);

/** A block type name. */
export type BlockTypeName = (typeof BLOCK_TYPES)[number];

/** How each block type lowers. */
export const BLOCK_TYPE_LOWERINGS: Readonly<Record<BlockTypeName, TypeLowering>> = Object.freeze({
  block: blockType,
  pillar: pillarType,
  horizontal: horizontalType,
  directional: directionalType,
  slab: slabType,
  stairs: stairsType,
  wall: wallType,
  fence: fenceType,
  fence_gate: fenceGateType,
  door: doorType,
  trapdoor: trapdoorType,
  button: buttonType,
  pressure_plate: pressurePlateType,
  pane: paneType,
  crop: cropType,
  sapling: saplingType,
  leaves: leavesType,
});

/** The slot that names the block item's model on every type. */
export const ITEM_MODEL_SLOT = 'item';

/**
 * The model slot names each type takes in `models`: its required slots, its optional slots and
 * `item` (for the validators and the Studio).
 */
export const BLOCK_TYPE_MODEL_SLOTS: Readonly<Record<BlockTypeName, readonly string[]>> =
  Object.freeze(
    Object.fromEntries(
      BLOCK_TYPES.map((type) => {
        const lowering = BLOCK_TYPE_LOWERINGS[type];
        return [
          type,
          Object.freeze([...lowering.slots, ...(lowering.optionalSlots ?? []), ITEM_MODEL_SLOT]),
        ];
      }),
    ) as Record<BlockTypeName, readonly string[]>,
  );

const isBlockType = (value: string): value is BlockTypeName =>
  (BLOCK_TYPES as readonly string[]).includes(value);

/**
 * The block type of `msm:block` data: `block` when `type` is absent.
 *
 * @throws {@link BlocksItemsLoweringError} If `type` is set to anything but a block type.
 */
export function blockTypeOf(data: Json | undefined, elementId = 'block'): BlockTypeName {
  const type = isRecord(data) ? data.type : undefined;
  if (type === undefined) return 'block';
  if (typeof type === 'string' && isBlockType(type)) return type;
  throw new BlocksItemsLoweringError(
    `Element ${elementId}: unknown block type ${JSON.stringify(type)}.`,
  );
}

/** A generated model with its id. */
export interface GeneratedModel extends ModelSpec {
  id: string;
}

/** The models of one block: what lowering generates and every slot's model id. */
export interface BlockModels {
  /** Models written from `textures`, minus the slots `models` fills. */
  generated: GeneratedModel[];
  /** Model id by slot; empty when the block has no appearance. */
  slots: SlotModels;
}

/** The element's `models`, as non-empty strings by slot (not read for `block`). */
function givenModels(type: BlockTypeName, data: JsonObject): Record<string, string> {
  const out: Record<string, string> = {};
  if (type !== 'block' && isRecord(data.models)) {
    for (const [slot, value] of Object.entries(data.models)) {
      const model = nonEmptyString(value);
      if (model !== undefined) out[slot] = model;
    }
  }
  return out;
}

/**
 * The models of a block of `type`: the element's `models`, its single `model` for the types
 * that take one, and models generated from `textures` for the slots still empty.
 */
export function blockTypeModels(type: BlockTypeName, context: TypeContext): BlockModels {
  const lowering = BLOCK_TYPE_LOWERINGS[type];
  const { data, namespace, path } = context;
  const given = givenModels(type, data);
  const primary = lowering.slots[0] ?? 'default';
  const single = lowering.acceptsModel === true ? nonEmptyString(data.model) : undefined;
  if (single !== undefined && given[primary] === undefined) given[primary] = single;
  const lookup = textureLookup(readTextures(data));
  const specs =
    lowering.generateFromData?.(data) ?? (lookup === undefined ? [] : lowering.generate(lookup));
  const generated: GeneratedModel[] = specs
    .filter((spec) => given[spec.slot] === undefined)
    .map((spec) => ({ ...spec, id: blockModelId(namespace, path, spec.suffix) }));
  const slots: Record<string, string> = {};
  for (const model of generated) slots[model.slot] = model.id;
  Object.assign(slots, given);
  const known = [...lowering.slots, ...(lowering.optionalSlots ?? [])];
  const fallback =
    known.map((slot) => slots[slot]).find((model) => model !== undefined) ??
    Object.entries(given).find(([slot]) => slot !== ITEM_MODEL_SLOT)?.[1];
  if (fallback === undefined) return { generated, slots: {} };
  for (const slot of lowering.slots) slots[slot] ??= fallback;
  return { generated, slots };
}

/**
 * The appearance files of a block of `type`, in this order: the generated block models, the
 * block state definition, and with a block item its generated flat item model (doors, panes)
 * and its item model definition at the item id (ADR 0068 D2). A block with no model at all
 * (no `model`, `models` or `textures`) gets none of them, as before types.
 */
export function lowerBlockAppearance(
  type: BlockTypeName,
  target: Target,
  context: TypeContext,
): OutputFile[] {
  const lowering = BLOCK_TYPE_LOWERINGS[type];
  const { generated, slots } = blockTypeModels(type, context);
  const primary = lowering.slots[0] ?? 'default';
  if (slots[primary] === undefined) return [];
  const files: OutputFile[] = generated.map((model) =>
    modelFile(target, model.id, model.parent, model.textures),
  );
  files.push({
    path: assetPath(target, 'block_definition', context.namespace, context.path),
    contents: lowering.blockstate(slots, context),
    layer: 'resourcepack',
    schema: BLOCK_STATE_SCHEMA,
  });
  if (context.itemId === undefined) return files;
  const item = splitResourceLocation(context.itemId);
  let itemModel = slots[ITEM_MODEL_SLOT];
  if (itemModel === undefined) {
    const lookup = textureLookup(readTextures(context.data));
    const layer0 =
      lowering.itemTextureFromData?.(context.data) ??
      (lookup === undefined ? undefined : lowering.itemTexture?.(lookup));
    if (layer0 !== undefined) {
      itemModel = `${item.namespace}:item/${item.path}`;
      files.push(modelFile(target, itemModel, GENERATED_ITEM_PARENT, { layer0 }));
    }
  }
  itemModel ??= slots[lowering.itemSlot ?? primary] ?? (slots[primary] as string);
  const definition = itemDefinitionFile(target, item.namespace, item.path, itemModel);
  const tints = lowering.itemTints?.(context.data) ?? [];
  if (tints.length > 0) {
    definition.contents = { model: { type: 'minecraft:model', model: itemModel, tints } };
  }
  files.push(definition);
  return files;
}

/** The vanilla tag files a block of `type` always joins (ADR 0067 D6), block then item tags. */
export function blockTypeTagFiles(
  type: BlockTypeName,
  target: Target,
  context: TypeContext,
): OutputFile[] {
  const tags = BLOCK_TYPE_LOWERINGS[type].tags?.(context.data);
  if (tags === undefined) return [];
  const { itemId } = context;
  return [
    ...tags.block.map((tag) => vanillaTagFile(target, 'block', tag, context.blockId)),
    ...(itemId === undefined
      ? []
      : tags.item.map((tag) => vanillaTagFile(target, 'item', tag, itemId))),
  ];
}

/**
 * The `"loot": "self"` table of a block of `type` when it is not "drops itself": a slab's
 * double drop and a door's lower half.
 */
export function blockTypeSelfLoot(
  type: BlockTypeName,
  context: TypeContext & { itemId: string },
): JsonObject | undefined {
  return BLOCK_TYPE_LOWERINGS[type].selfLoot?.(context);
}
