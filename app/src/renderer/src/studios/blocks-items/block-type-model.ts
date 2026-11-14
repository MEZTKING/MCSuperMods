/**
 * Pure helpers of the Block Studio's Type picker and Textures section (B268, ADR 0067 D7,
 * ADR 0069 D5): the types in words, which fields belong to which type, changing type in one
 * edit, texture and model slots in words, and the models lowering generates for the slots. No
 * React, no session.
 *
 * The slot names and the generated models come from `@msm/plugin-blocks-items` (the
 * lowering's own tables), so the Studio never restates them.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import type { ContentBundle, ResourceLocation } from '@msm/plugin-api';
import {
  BLOCK_TYPE_LOWERINGS,
  BLOCK_TYPE_MODEL_SLOTS,
  BLOCK_TYPES,
  type BlockTypeName,
  blockItemIdOf,
  blockStateFlag,
  blockTypeModels,
  ITEM_MODEL_SLOT,
  SHAPED_BLOCK_TYPES,
  SHAPED_ONLY_COMPONENTS,
  STATE_MODEL_SLOTS,
} from '@msm/plugin-blocks-items';
import { isJsonObject } from '../../forms/pointer';
import { bundlePreviewProject } from '../../preview/bundle-source';
import { asObject, MODEL_KIND } from './blocks-items-model';

type JsonObject = { [key: string]: Json };

export type { BlockTypeName };

/** The building types the Type picker offers (ADR 0067 D1), in the format's order. */
export const BUILDING_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze(
  BLOCK_TYPES.filter((type) => !['crop', 'sapling', 'leaves'].includes(type)),
);

/** The plant types (ADR 0068 D1); their own fields come with the plant sections (B272). */
export const PLANT_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  'crop',
  'sapling',
  'leaves',
]);

/** Each type in words, as the Type picker shows it. */
export const BLOCK_TYPE_LABELS: Readonly<Record<BlockTypeName, string>> = Object.freeze({
  block: 'Simple block',
  pillar: 'Log or pillar (turns to the clicked face)',
  horizontal: 'Faces the player (four ways, like a furnace)',
  directional: 'Faces any way (six ways, like an observer)',
  slab: 'Slab',
  stairs: 'Stairs',
  wall: 'Wall',
  fence: 'Fence',
  fence_gate: 'Fence gate',
  door: 'Door',
  trapdoor: 'Trapdoor',
  button: 'Button',
  pressure_plate: 'Pressure plate',
  pane: 'Pane or bars',
  crop: 'Crop',
  sapling: 'Sapling',
  leaves: 'Leaves',
});

/** The vanilla set types in words (ADR 0067 D2); unknown names show as written. */
export const SET_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  wood: 'Wood (oak sounds)',
  cherry: 'Cherry wood',
  bamboo: 'Bamboo',
  crimson: 'Crimson',
  warped: 'Warped',
  iron: 'Iron (not opened by hand)',
  copper: 'Copper',
  gold: 'Gold',
  stone: 'Stone',
  polished_blackstone: 'Polished blackstone',
});

/** The vanilla wood types in words (a fence gate's sounds). */
export const WOOD_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  oak: 'Oak',
  spruce: 'Spruce',
  birch: 'Birch',
  acacia: 'Acacia',
  cherry: 'Cherry',
  jungle: 'Jungle',
  dark_oak: 'Dark oak',
  pale_oak: 'Pale oak',
  poplar: 'Poplar',
  crimson: 'Crimson',
  warped: 'Warped',
  mangrove: 'Mangrove',
  bamboo: 'Bamboo',
});

/** The definition fields of each type (the format's `msm:block_type` dispatch, ADR 0067 D2). */
const TYPE_FIELDS: Readonly<Partial<Record<BlockTypeName, readonly string[]>>> = Object.freeze({
  stairs: ['base_block'],
  fence_gate: ['wood_type'],
  door: ['set_type'],
  trapdoor: ['set_type'],
  button: ['set_type', 'press_ticks'],
  pressure_plate: ['set_type', 'weighted_max'],
  crop: ['max_age', 'stage_heights', 'soil', 'bonemeal_growth'],
  sapling: ['tree', 'mega_tree', 'flower_tree', 'soil'],
  leaves: ['tint', 'particle_chance', 'falling_particle'],
});

/** The editor-only fields of each type besides `textures` and `models` (ADR 0067 D7). */
const TYPE_ELEMENT_FIELDS: Readonly<Partial<Record<BlockTypeName, readonly string[]>>> =
  Object.freeze({
    fence: ['wooden'],
    crop: ['crop_drops', 'villager_plantable'],
    leaves: ['leaves_drops'],
  });

/** The loot presets that belong to one type. */
const TYPE_LOOT_PRESETS: Readonly<Partial<Record<BlockTypeName, string>>> = Object.freeze({
  crop: 'crop',
  leaves: 'leaves',
});

/** Every field that belongs to `type` alone (not shared by all blocks). */
export function typeOwnFields(type: BlockTypeName): string[] {
  const appearance = type === 'block' ? [] : ['textures', 'models'];
  return [...(TYPE_FIELDS[type] ?? []), ...appearance, ...(TYPE_ELEMENT_FIELDS[type] ?? [])];
}

/** Whether `value` is a block type. */
export function isBlockType(value: unknown): value is BlockTypeName {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
}

/**
 * The block type of `msm:block` data: `block` when `type` is absent, `undefined` when `type`
 * is not a type (the schema reports it).
 */
export function blockTypeOfData(data: Json | undefined): BlockTypeName | undefined {
  const type = asObject(data).type;
  if (type === undefined) return 'block';
  return isBlockType(type) ? type : undefined;
}

/** Whether `type` takes `msm:shape` and `msm:redstone` (ADR 0067 D3). */
export function isShapedType(type: BlockTypeName): boolean {
  return SHAPED_BLOCK_TYPES.includes(type);
}

/** Whether the element's single `model` field is the appearance of `type`. */
export function acceptsSingleModel(type: BlockTypeName): boolean {
  return type === 'block' || BLOCK_TYPE_LOWERINGS[type].acceptsModel === true;
}

/** One texture slot of a type's `textures`, in words. */
export interface TextureSlot {
  key: string;
  label: string;
}

const ALL_SLOT: TextureSlot = { key: 'all', label: 'Every face' };

/**
 * The texture keys of each type's `textures` (the format's per-type texture structs), `all`
 * first. A crop's textures are the `stages` list instead (no slots here); `block` has none.
 */
export const TEXTURE_SLOTS: Readonly<Record<BlockTypeName, readonly TextureSlot[]>> = Object.freeze(
  {
    block: [],
    pillar: [
      ALL_SLOT,
      { key: 'side', label: 'Sides (bark)' },
      { key: 'end', label: 'Ends (top and bottom)' },
    ],
    horizontal: [
      ALL_SLOT,
      { key: 'front', label: 'Front' },
      { key: 'side', label: 'Sides and back' },
      { key: 'top', label: 'Top and bottom' },
    ],
    directional: [
      ALL_SLOT,
      { key: 'front', label: 'Front' },
      { key: 'side', label: 'Sides and back' },
      { key: 'top', label: 'Top and bottom' },
    ],
    slab: [
      ALL_SLOT,
      { key: 'top', label: 'Top' },
      { key: 'bottom', label: 'Bottom' },
      { key: 'side', label: 'Sides' },
    ],
    stairs: [
      ALL_SLOT,
      { key: 'top', label: 'Top' },
      { key: 'bottom', label: 'Bottom' },
      { key: 'side', label: 'Sides' },
    ],
    wall: [ALL_SLOT, { key: 'texture', label: 'Wall' }],
    fence: [ALL_SLOT, { key: 'texture', label: 'Fence' }],
    fence_gate: [ALL_SLOT, { key: 'texture', label: 'Gate' }],
    door: [
      ALL_SLOT,
      { key: 'top', label: 'Top half' },
      { key: 'bottom', label: 'Bottom half (also the item)' },
    ],
    trapdoor: [ALL_SLOT, { key: 'texture', label: 'Trapdoor' }],
    button: [ALL_SLOT, { key: 'texture', label: 'Button' }],
    pressure_plate: [ALL_SLOT, { key: 'texture', label: 'Plate' }],
    pane: [
      ALL_SLOT,
      { key: 'pane', label: 'Face of the pane' },
      { key: 'edge', label: 'Thin edge' },
    ],
    crop: [],
    sapling: [{ key: 'sapling', label: 'Sapling (also the item)' }],
    leaves: [{ key: 'all', label: 'Leaves (every face)' }],
  },
);

/** Model slots in words (the keys of `BLOCK_TYPE_MODEL_SLOTS`). */
const MODEL_SLOT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  default: 'Block',
  horizontal: 'Lying on its side',
  vertical: 'Facing up or down',
  bottom: 'Bottom',
  top: 'Top',
  double: 'Double slab',
  straight: 'Straight',
  inner: 'Inner corner',
  outer: 'Outer corner',
  post: 'Post',
  side: 'Side',
  side_alt: 'Side (other way)',
  side_tall: 'Tall side',
  noside: 'No side',
  noside_alt: 'No side (other way)',
  inventory: 'In the inventory',
  closed: 'Closed',
  open: 'Open',
  wall: 'In a wall',
  wall_open: 'Open in a wall',
  bottom_left: 'Lower half, hinge left',
  bottom_left_open: 'Lower half, hinge left, open',
  bottom_right: 'Lower half, hinge right',
  bottom_right_open: 'Lower half, hinge right, open',
  top_left: 'Upper half, hinge left',
  top_left_open: 'Upper half, hinge left, open',
  top_right: 'Upper half, hinge right',
  top_right_open: 'Upper half, hinge right, open',
  lit: 'Working',
  pressed: 'Pressed',
  up: 'Up',
  down: 'Pressed down',
  sapling: 'Sapling',
  leaves: 'Leaves',
  [ITEM_MODEL_SLOT]: 'Block item',
});

/**
 * The texture slots of the block states a container (`open`) or machine (`lit`) adds (ADR 0076
 * D1), on the types with a `front` texture.
 */
export const STATE_TEXTURE_SLOTS: Readonly<Record<'open' | 'lit', TextureSlot>> = Object.freeze({
  open: { key: 'front_open', label: 'Front when open' },
  lit: { key: 'front_lit', label: 'Front when working' },
});

/**
 * Whether the state slot `state` (`open` or `lit`) belongs on the block now: its component
 * makes the state, or the element already sets the slot in `holder` (so it can be cleared).
 */
function stateSlotShown(
  type: BlockTypeName,
  data: Json | undefined,
  state: string,
  holder: 'textures' | 'models',
  key: string,
): boolean {
  return (
    blockStateFlag(type, data) === state || asObject(asObject(data)[holder])[key] !== undefined
  );
}

/**
 * The texture slots the Textures section shows for block data: the type's slots, plus "Front
 * when open" or "Front when working" for a facing type with a container or machine (or with
 * that texture already set).
 */
export function textureSlotsOf(type: BlockTypeName, data: Json | undefined): TextureSlot[] {
  const slots = [...TEXTURE_SLOTS[type]];
  if (!slots.some((slot) => slot.key === 'front')) return slots;
  for (const state of STATE_MODEL_SLOTS) {
    const slot = STATE_TEXTURE_SLOTS[state];
    if (stateSlotShown(type, data, state, 'textures', slot.key)) slots.push(slot);
  }
  return slots;
}

/**
 * The model slots shown for block data: {@link modelSlots} without the state slots `open` and
 * `lit` the block does not use (no container or machine, and not set in `models`).
 */
export function shownModelSlots(type: BlockTypeName, data: Json | undefined): string[] {
  return modelSlots(type).filter(
    (slot) => !isStateSlot(type, slot) || stateSlotShown(type, data, slot, 'models', slot),
  );
}

/** The container or machine state slots (`open`, `lit`) {@link shownModelSlots} shows. */
export function shownStateModelSlots(type: BlockTypeName, data: Json | undefined): string[] {
  return shownModelSlots(type, data).filter((slot) => isStateSlot(type, slot));
}

/** Whether `slot` is a container or machine state slot of `type` (not a trapdoor's `open`). */
function isStateSlot(type: BlockTypeName, slot: string): boolean {
  return (
    (STATE_MODEL_SLOTS as readonly string[]).includes(slot) &&
    !BLOCK_TYPE_LOWERINGS[type].slots.includes(slot) &&
    !(BLOCK_TYPE_LOWERINGS[type].optionalSlots ?? []).includes(slot)
  );
}

/** A model slot in words: `stage3` is "Stage 3"; unknown slots show with spaces. */
export function modelSlotLabel(slot: string): string {
  const stage = /^stage(\d+)$/.exec(slot);
  if (stage !== null) return `Stage ${stage[1]}`;
  return MODEL_SLOT_LABELS[slot] ?? slot.replaceAll('_', ' ');
}

/** The model slots of `type` (required, optional, then `item`). */
export function modelSlots(type: BlockTypeName): readonly string[] {
  return BLOCK_TYPE_MODEL_SLOTS[type];
}

/** Whether `slot` is one the block state needs (not optional, not `item`). */
export function isRequiredSlot(type: BlockTypeName, slot: string): boolean {
  return BLOCK_TYPE_LOWERINGS[type].slots.includes(slot);
}

/** The first texture a model names: `all`, `side`, `texture`, `layer0`, then any. */
function firstModelTexture(textures: Json | undefined): string | undefined {
  if (!isJsonObject(textures)) return undefined;
  const preferred = ['all', 'side', 'texture', 'layer0', 'top', 'particle'];
  for (const key of [...preferred, ...Object.keys(textures)]) {
    const value = textures[key];
    if (typeof value === 'string' && value !== '' && !value.startsWith('#')) return value;
  }
  return undefined;
}

/**
 * The one texture that best describes the block's look, carried to the new type when the type
 * changes: `textures.all` (or a crop's first stage, or the first texture), else the first
 * texture of the project model `model` names, else a vanilla `block/` model id read as the
 * texture of the same name (vanilla cube models use their own name). `undefined` when none.
 */
export function appearanceTexture(
  project: Project | null,
  data: Json | undefined,
): string | undefined {
  const object = asObject(data);
  const textures = asObject(object.textures);
  if (typeof textures.all === 'string' && textures.all !== '') return textures.all;
  const stages = textures.stages;
  if (Array.isArray(stages) && typeof stages[0] === 'string' && stages[0] !== '') return stages[0];
  const first = firstModelTexture(textures);
  if (first !== undefined) return first;
  const model = typeof object.model === 'string' ? object.model : '';
  if (model === '') return undefined;
  const own = project?.namespaces
    .flatMap((namespace) => namespace.elements)
    .find((element) => element.kind === MODEL_KIND && element.id === model);
  if (own !== undefined) return firstModelTexture(asObject(own.data).textures);
  const id = model.includes(':') ? model : `minecraft:${model}`;
  return id.slice(id.indexOf(':') + 1).startsWith('block/') ? id : undefined;
}

/** What {@link withBlockType} needs besides the data. */
export interface TypeChangeOptions {
  /** The target's set type names (`Target.blocks.setTypes`); the first is the default. */
  setTypes?: readonly string[] | undefined;
  /** The target's wood type names (`Target.blocks.woodTypes`); the first is the default. */
  woodTypes?: readonly string[] | undefined;
  /** The texture to carry to the new type ({@link appearanceTexture}). */
  texture?: string | undefined;
}

/**
 * The block data after changing its type to `next` (ADR 0069 D5), as one edit: shared fields
 * (name, sounds, mining, light, item, triggers, events) stay; the old type's own fields go
 * (`textures`, `models`, set and wood types, ...); components the new type does not take
 * (`msm:shape`, `msm:redstone`) go; a loot preset of the old type becomes `self`. Required
 * fields of the new type get a default (the target's first set or wood type, the vanilla oak
 * tree for a sapling), and the old look is carried over as the new type's `all` texture (a
 * crop's first stage), or kept as `model` where the new type takes one.
 */
export function withBlockType(
  data: Json | undefined,
  next: BlockTypeName,
  options: TypeChangeOptions = {},
): JsonObject {
  const current = blockTypeOfData(data);
  const source = asObject(data);
  if (current === next) return { ...source };
  const keep = new Set(typeOwnFields(next));
  const drop = new Set(
    BLOCK_TYPES.flatMap((type) => typeOwnFields(type)).filter((field) => !keep.has(field)),
  );
  // Fields shared between the old and new types (a door's set type for a trapdoor) stay, but
  // the old appearance is rebuilt below for the new type's own slots.
  drop.add('textures');
  drop.add('models');
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'type' || drop.has(key)) continue;
    out[key] = value;
  }
  if (next !== 'block') out.type = next;
  if (!acceptsSingleModel(next)) delete out.model;
  if (!isShapedType(next) && isJsonObject(out.components)) {
    const components: JsonObject = { ...out.components };
    for (const id of SHAPED_ONLY_COMPONENTS) delete components[id];
    if (Object.keys(components).length === 0) delete out.components;
    else out.components = components;
  }
  const preset = typeof out.loot === 'string' ? out.loot : undefined;
  const presetType = Object.entries(TYPE_LOOT_PRESETS).find(([, value]) => value === preset)?.[0];
  if (presetType !== undefined && presetType !== next) out.loot = 'self';
  // The new type's required fields.
  const fields = TYPE_FIELDS[next] ?? [];
  if (fields.includes('set_type') && typeof out.set_type !== 'string') {
    out.set_type = options.setTypes?.[0] ?? 'wood';
  }
  if (fields.includes('wood_type') && typeof out.wood_type !== 'string') {
    out.wood_type = options.woodTypes?.[0] ?? 'oak';
  }
  if (next === 'sapling' && typeof out.tree !== 'string') out.tree = 'minecraft:oak';
  // The look, carried over.
  const texture = options.texture;
  const keepsModel = acceptsSingleModel(next) && typeof out.model === 'string' && out.model !== '';
  if (next !== 'block' && texture !== undefined && !keepsModel) {
    if (next === 'crop') out.textures = { stages: [texture] };
    else out.textures = { [TEXTURE_SLOTS[next][0]?.key ?? 'all']: texture };
  }
  return out;
}

/** One model slot of a typed block and where its model comes from. */
export interface SlotModelRow {
  slot: string;
  /** The model id the slot uses, or `undefined` when the block has no appearance yet. */
  model: string | undefined;
  /** `models` (the user's own), `generated` (from `textures`), `model` (the single model) or `first` (a required slot left empty takes the first model). */
  source: 'models' | 'generated' | 'model' | 'first' | 'none';
  /** For a generated model: its vanilla template and textures. */
  parent?: string;
  textures?: Readonly<Record<string, string>>;
}

/** The namespace and path of an element id. */
function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/**
 * Every model slot of a typed block with the model lowering uses for it (through the plugin's
 * own `blockTypeModels`), for the Textures section's list of generated models. `[]` for
 * `block` and for data whose `type` is not a type.
 */
export function slotModelRows(element: Pick<Element, 'id' | 'data'>): SlotModelRow[] {
  const type = blockTypeOfData(element.data);
  if (type === undefined || type === 'block') return [];
  const data = asObject(element.data);
  const { namespace, path } = splitId(element.id);
  let models: ReturnType<typeof blockTypeModels>;
  try {
    models = blockTypeModels(type, {
      blockId: element.id,
      itemId: blockItemIdOf(element.id, data),
      namespace,
      path,
      data,
    });
  } catch {
    return [];
  }
  const given = asObject(data.models);
  const single = acceptsSingleModel(type) && typeof data.model === 'string' ? data.model : '';
  const primary = BLOCK_TYPE_LOWERINGS[type].slots[0] ?? 'default';
  return shownModelSlots(type, data).map((slot): SlotModelRow => {
    const model = models.slots[slot];
    const generated = models.generated.find((entry) => entry.slot === slot);
    if (typeof given[slot] === 'string' && given[slot] !== '') {
      return { slot, model, source: 'models' };
    }
    if (generated !== undefined && generated.id === model) {
      return {
        slot,
        model,
        source: 'generated',
        parent: generated.parent,
        textures: generated.textures,
      };
    }
    if (slot === primary && single !== '') return { slot, model, source: 'model' };
    if (model !== undefined) return { slot, model, source: 'first' };
    return { slot, model: undefined, source: 'none' };
  });
}

/**
 * The generated models of a typed block as an in-memory bundle of `minecraft:model` elements
 * (for a 3D preview over {@link typePreviewProject}); empty for `block`.
 */
export function generatedModelBundle(element: Pick<Element, 'id' | 'data'>): ContentBundle {
  const elements = slotModelRows(element).flatMap((row) =>
    row.source === 'generated' && row.model !== undefined && row.parent !== undefined
      ? [
          {
            id: row.model as ResourceLocation,
            kind: MODEL_KIND,
            data: { parent: row.parent, textures: { ...(row.textures ?? {}) } },
          },
        ]
      : [],
  );
  const unique = elements.filter(
    (entry, index) => elements.findIndex((other) => other.id === entry.id) === index,
  );
  return { elements: unique, assets: [] };
}

/**
 * `project` with the block's generated models laid over it (through
 * `preview/bundle-source.ts`), so the model preview can draw a generated model by its id
 * without applying anything.
 */
export function typePreviewProject(
  project: Project,
  element: Pick<Element, 'id' | 'data'>,
): Project {
  return bundlePreviewProject(project, generatedModelBundle(element));
}

/** The texture asset path of a project texture id under `textures/`, for thumbnails. */
export function textureAssetPath(textureId: string): string | undefined {
  const { namespace, path } = splitId(textureId);
  if (namespace === 'minecraft' || path === '') return undefined;
  return `assets/${namespace}/textures/${path}.png`;
}
