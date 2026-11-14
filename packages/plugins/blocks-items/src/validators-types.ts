/**
 * `blocks-items.*` project validators for the block types (ADR 0067 D8) and the plants
 * (ADR 0068 D7). They read the element data (editor fields still present), the target's block
 * facts and the vanilla ids of the registry index:
 *
 * - `blocks-items.component-not-for-type` (error): `msm:shape` or `msm:redstone` on a type other
 *   than `block`, `pillar`, `horizontal` and `directional` (ADR 0067 D3).
 * - `blocks-items.type-needs-appearance` (error): a type other than `block` with neither
 *   `textures` nor `models` (nor `model` on the types that take one).
 * - `blocks-items.generated-model-clash` (error): a project model with the id of a model that
 *   lowering generates from `textures`.
 * - `blocks-items.unknown-model-slot` (error): a `models` key the type has no slot for (the slot
 *   names are `BLOCK_TYPE_MODEL_SLOTS`).
 * - `blocks-items.missing-model-slot` (warning): `models` leaves a slot the block state needs
 *   empty and `textures` does not generate it, so it takes the block's first model.
 * - `blocks-items.unknown-set-type` and `blocks-items.unknown-wood-type` (error): a `set_type`
 *   or `wood_type` the target's block facts do not list.
 * - `blocks-items.stairs-base-unknown` (error): a `base_block` that is neither a project block
 *   nor a vanilla block.
 * - `blocks-items.stairs-base-cycle` (error): stairs whose `base_block` chain comes back to
 *   them.
 * - `blocks-items.strippable-target-unknown` (error): `msm:strippable` `into` naming neither a
 *   project block nor a vanilla block.
 * - `blocks-items.crop-stage-heights-length` (warning): `stage_heights` whose length is not
 *   `max_age + 1` (the runtime then uses vanilla's ramp).
 * - `blocks-items.crop-bonemeal-range` (error): `bonemeal_growth.min` above `max`.
 * - `blocks-items.crop-without-produce` (error): the `crop` loot preset without
 *   `crop_drops.produce`.
 * - `blocks-items.sapling-tree-unknown` (error): a `tree`, `mega_tree` or `flower_tree` that is
 *   neither a project `worldgen/feature` nor a vanilla configured feature of the target.
 * - `blocks-items.sapling-tree-not-tree` (warning): a project feature of a type other than
 *   `minecraft:tree`.
 * - `blocks-items.leaves-will-decay` (warning): a sapling's project tree whose foliage is project
 *   leaves and whose trunk is a project block that no project tag puts in `#minecraft:logs`.
 * - `blocks-items.block-item-id-clash` (error): a block item's own `item.id` that is the id of
 *   an item or of another block's item.
 * - `blocks-items.particle-on-tinted-leaves` (warning): `falling_particle` on leaves with a
 *   `tint` (the particle is only used without one).
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  TargetFacts,
  ValidationRegistry,
} from '@msm/plugin-api';
import { BLOCK_KIND, ITEM_KIND } from './kinds';
import { blockItemId } from './lowering/block-item';
import { isRecord, splitResourceLocation } from './lowering/paths';
import {
  BLOCK_TYPE_LOWERINGS,
  BLOCK_TYPE_MODEL_SLOTS,
  BLOCK_TYPES,
  type BlockTypeName,
  blockTypeModels,
  ITEM_MODEL_SLOT,
} from './lowering/types';
import { readTextures } from './lowering/types/models';

/** Every code the type and plant validators report. */
export const BLOCK_TYPE_PROBLEM_CODES = Object.freeze([
  'blocks-items.component-not-for-type',
  'blocks-items.type-needs-appearance',
  'blocks-items.generated-model-clash',
  'blocks-items.unknown-model-slot',
  'blocks-items.missing-model-slot',
  'blocks-items.unknown-set-type',
  'blocks-items.unknown-wood-type',
  'blocks-items.stairs-base-unknown',
  'blocks-items.stairs-base-cycle',
  'blocks-items.strippable-target-unknown',
  'blocks-items.crop-stage-heights-length',
  'blocks-items.crop-bonemeal-range',
  'blocks-items.crop-without-produce',
  'blocks-items.sapling-tree-unknown',
  'blocks-items.sapling-tree-not-tree',
  'blocks-items.leaves-will-decay',
  'blocks-items.block-item-id-clash',
  'blocks-items.particle-on-tinted-leaves',
] as const);

/** The types that take `msm:shape` and `msm:redstone` (ADR 0067 D3). */
export const SHAPED_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  'block',
  'pillar',
  'horizontal',
  'directional',
]);

/** Components allowed only on the {@link SHAPED_BLOCK_TYPES}. */
export const SHAPED_ONLY_COMPONENTS: readonly string[] = Object.freeze([
  'msm:shape',
  'msm:redstone',
]);

/** Kind ids of other plugins' elements these checks read. */
const MODEL_KIND = 'minecraft:model';
const FEATURE_KIND = 'minecraft:worldgen/feature';
const BLOCK_TAG_KIND = 'minecraft:tag/block';
const TREE_FEATURE = 'minecraft:tree';
const LOGS_TAG = 'minecraft:logs';
const DEFAULT_MAX_AGE = 7;
const DEFAULT_STAIRS_BASE = 'minecraft:stone';

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');
const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** The block type of a block element, or `undefined` when `type` is not a type (the schema says). */
function typeOf(element: Element): BlockTypeName | undefined {
  const type = dataOf(element).type;
  if (type === undefined) return 'block';
  return typeof type === 'string' && (BLOCK_TYPES as readonly string[]).includes(type)
    ? (type as BlockTypeName)
    : undefined;
}

interface TypedBlock {
  element: Element;
  data: JsonObject;
  type: BlockTypeName;
}

const typedBlocks = (elements: readonly Element[]): TypedBlock[] =>
  elements.flatMap((element) => {
    if (element.kind !== BLOCK_KIND) return [];
    const type = typeOf(element);
    return type === undefined ? [] : [{ element, data: dataOf(element), type }];
  });

/** Whether `id` is a project block or (when the registry knows blocks) a vanilla block. */
function blockKnown(id: string, projectBlocks: ReadonlySet<string>, registry: ValidationRegistry) {
  const full = namespaced(id);
  if (projectBlocks.has(full)) return true;
  if (registry.ids('block').length === 0) return true;
  return registry.has('block', full);
}

// ---------------------------------------------------------------------------------------------
// Components and appearance (ADR 0067 D3, D7)

function componentsNotForType(blocks: readonly TypedBlock[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data, type } of blocks) {
    if (SHAPED_BLOCK_TYPES.includes(type)) continue;
    const components = record(data.components);
    for (const key of SHAPED_ONLY_COMPONENTS) {
      if (components?.[key] === undefined) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.component-not-for-type',
        elementId: element.id,
        path: pointer('components', key),
        message: `A ${type} block cannot have "${key}": it keeps vanilla's own ${key === 'msm:shape' ? 'shape' : 'redstone behaviour'}. Remove the component, or change the type to block, pillar, horizontal or directional.`,
      });
    }
  }
  return problems;
}

const givenModelSlots = (data: JsonObject): string[] =>
  Object.entries(record(data.models) ?? {})
    .filter(([, value]) => text(value) !== undefined)
    .map(([slot]) => slot);

function hasAppearance(type: BlockTypeName, data: JsonObject): boolean {
  if (Object.keys(readTextures(data)).length > 0) return true;
  if (givenModelSlots(data).length > 0) return true;
  return BLOCK_TYPE_LOWERINGS[type].acceptsModel === true && text(data.model) !== undefined;
}

function typesNeedAppearance(blocks: readonly TypedBlock[]): Problem[] {
  return blocks
    .filter(({ type, data }) => type !== 'block' && !hasAppearance(type, data))
    .map(({ element, type }) => ({
      severity: 'error' as const,
      code: 'blocks-items.type-needs-appearance',
      elementId: element.id,
      message: `This ${type} block has no textures and no models, so it would show as the missing-model cube. Pick its textures (or its own models).`,
    }));
}

function modelSlotProblems(blocks: readonly TypedBlock[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data, type } of blocks) {
    if (type === 'block') continue;
    const given = givenModelSlots(data);
    const allowed = BLOCK_TYPE_MODEL_SLOTS[type];
    for (const slot of Object.keys(record(data.models) ?? {})) {
      if (allowed.includes(slot)) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.unknown-model-slot',
        elementId: element.id,
        path: pointer('models', slot),
        message: `A ${type} block has no model slot "${slot}", so this model is never used. Its slots are ${allowed.map((name) => `"${name}"`).join(', ')}.`,
      });
    }
    if (given.filter((slot) => slot !== ITEM_MODEL_SLOT).length === 0) continue;
    const covered = new Set(given);
    const lowering = BLOCK_TYPE_LOWERINGS[type];
    const primary = lowering.slots[0];
    if (lowering.acceptsModel === true && primary !== undefined && text(data.model) !== undefined) {
      covered.add(primary);
    }
    const context = contextOf(element, data);
    if (context !== undefined) {
      for (const model of blockTypeModels(type, context).generated) covered.add(model.slot);
    }
    const missing = lowering.slots.filter((slot) => !covered.has(slot));
    if (missing.length === 0) continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.missing-model-slot',
      elementId: element.id,
      path: '/models',
      message: `The models leave ${missing.map((slot) => `"${slot}"`).join(', ')} empty, so ${missing.length === 1 ? 'that state shows' : 'those states show'} the block's first model. Give a model for each slot, or textures to generate them.`,
    });
  }
  return problems;
}

function contextOf(element: Element, data: JsonObject) {
  try {
    const { namespace, path } = splitResourceLocation(element.id);
    return { blockId: element.id, itemId: blockItemId(element), namespace, path, data };
  } catch {
    return undefined;
  }
}

function generatedModelClashes(blocks: readonly TypedBlock[], elements: readonly Element[]) {
  const projectModels = new Set<string>(
    elements.filter((element) => element.kind === MODEL_KIND).map((element) => element.id),
  );
  if (projectModels.size === 0) return [];
  const problems: Problem[] = [];
  for (const { element, data, type } of blocks) {
    if (type === 'block') continue;
    const context = contextOf(element, data);
    if (context === undefined) continue;
    const lowering = BLOCK_TYPE_LOWERINGS[type];
    const ids = blockTypeModels(type, context).generated.map((model) => model.id);
    const textures = readTextures(data);
    if (
      lowering.itemTexture !== undefined &&
      context.itemId !== undefined &&
      text(record(data.models)?.[ITEM_MODEL_SLOT]) === undefined &&
      Object.keys(textures).length > 0
    ) {
      const item = splitResourceLocation(context.itemId);
      ids.push(`${item.namespace}:item/${item.path}`);
    }
    for (const id of ids) {
      if (!projectModels.has(id)) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.generated-model-clash',
        elementId: element.id,
        path: '/textures',
        message: `This block generates the model "${id}" from its textures, but the project already has a model with that id. Rename that model, or use it through "models" instead of textures.`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Set types, wood types, stairs and stripping (ADR 0067 D2, D3)

const SET_TYPE_TYPES: ReadonlySet<BlockTypeName> = new Set([
  'door',
  'trapdoor',
  'button',
  'pressure_plate',
]);

function unknownSetAndWoodTypes(blocks: readonly TypedBlock[], target: TargetFacts): Problem[] {
  const facts = target.blocks;
  if (facts === undefined) return [];
  const problems: Problem[] = [];
  const list = (names: readonly string[]) => names.map((name) => `"${name}"`).join(', ');
  for (const { element, data, type } of blocks) {
    const setType = text(data.set_type);
    if (SET_TYPE_TYPES.has(type) && setType !== undefined && !facts.setTypes.includes(setType)) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.unknown-set-type',
        elementId: element.id,
        path: '/set_type',
        message: `Set type "${setType}" does not exist in ${target.id}. Use one of ${list(facts.setTypes)}.`,
      });
    }
    const woodType = text(data.wood_type);
    if (type === 'fence_gate' && woodType !== undefined && !facts.woodTypes.includes(woodType)) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.unknown-wood-type',
        elementId: element.id,
        path: '/wood_type',
        message: `Wood type "${woodType}" does not exist in ${target.id}. Use one of ${list(facts.woodTypes)}.`,
      });
    }
  }
  return problems;
}

const stairsBase = (data: JsonObject): string =>
  namespaced(text(data.base_block) ?? DEFAULT_STAIRS_BASE);

function stairsBases(blocks: readonly TypedBlock[], registry: ValidationRegistry): Problem[] {
  const projectBlocks = new Set(blocks.map(({ element }) => element.id as string));
  const stairs = new Map(
    blocks
      .filter(({ type }) => type === 'stairs')
      .map(({ element, data }) => [element.id as string, stairsBase(data)]),
  );
  const problems: Problem[] = [];
  for (const [id, base] of stairs) {
    if (!blockKnown(base, projectBlocks, registry)) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.stairs-base-unknown',
        elementId: id as Element['id'],
        path: '/base_block',
        message: `Base block "${base}" is neither a block of this project nor a vanilla block, so the stairs cannot be registered. Pick an existing block.`,
      });
      continue;
    }
    const chain = [id];
    let next: string | undefined = base;
    while (next !== undefined && stairs.has(next) && !chain.includes(next)) {
      chain.push(next);
      next = stairs.get(next);
    }
    if (next !== id) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.stairs-base-cycle',
      elementId: id as Element['id'],
      path: '/base_block',
      message: `These stairs are their own base through ${[...chain, id].map((step) => `"${step}"`).join(' -> ')}, so none of them can be registered. Base one of them on a block that is not stairs.`,
    });
  }
  return problems;
}

function strippableTargets(blocks: readonly TypedBlock[], registry: ValidationRegistry) {
  const projectBlocks = new Set(blocks.map(({ element }) => element.id as string));
  const problems: Problem[] = [];
  for (const { element, data } of blocks) {
    const into = text(record(record(data.components)?.['msm:strippable'])?.into);
    if (into === undefined || blockKnown(into, projectBlocks, registry)) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.strippable-target-unknown',
      elementId: element.id,
      path: pointer('components', 'msm:strippable', 'into'),
      message: `Stripped block "${into}" is neither a block of this project nor a vanilla block. Pick an existing block, such as the stripped log.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Crops (ADR 0068 D3)

function cropProblems(blocks: readonly TypedBlock[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data, type } of blocks) {
    if (type !== 'crop') continue;
    const maxAge = typeof data.max_age === 'number' ? data.max_age : DEFAULT_MAX_AGE;
    const heights = data.stage_heights;
    if (Array.isArray(heights) && heights.length !== maxAge + 1) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.crop-stage-heights-length',
        elementId: element.id,
        path: '/stage_heights',
        message: `The crop has ${maxAge + 1} stages (max age ${maxAge}) but ${heights.length} stage heights, so the game uses vanilla's heights instead. Give one height per stage.`,
      });
    }
    const growth = record(data.bonemeal_growth);
    if (
      typeof growth?.min === 'number' &&
      typeof growth.max === 'number' &&
      growth.min > growth.max
    ) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.crop-bonemeal-range',
        elementId: element.id,
        path: pointer('bonemeal_growth', 'min'),
        message: `Bone meal growth goes from ${growth.min} to ${growth.max}: the smallest growth is larger than the largest. Swap the two numbers.`,
      });
    }
    if (data.loot === 'crop' && text(record(data.crop_drops)?.produce) === undefined) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.crop-without-produce',
        elementId: element.id,
        path: '/crop_drops',
        message:
          'The crop loot needs the item harvested when the crop is fully grown. Pick the produce, or the seed item itself for a crop planted from its produce.',
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Saplings and trees (ADR 0068 D4, D6)

const TREE_FIELDS = ['tree', 'mega_tree', 'flower_tree'] as const;

/** The block ids a block state provider names (`state` strings and `Name` fields). */
function providerBlocks(provider: Json | undefined, out = new Set<string>()): Set<string> {
  if (Array.isArray(provider)) {
    for (const entry of provider) providerBlocks(entry, out);
  } else if (isRecord(provider)) {
    for (const [key, value] of Object.entries(provider)) {
      if ((key === 'state' || key === 'Name') && typeof value === 'string') {
        out.add(namespaced(value));
      } else {
        providerBlocks(value, out);
      }
    }
  }
  return out;
}

/** The members of a project block tag, following project tags it includes. */
function projectTagMembers(
  tag: string,
  tags: ReadonlyMap<string, JsonObject>,
  seen = new Set<string>(),
): Set<string> {
  const members = new Set<string>();
  if (seen.has(tag)) return members;
  seen.add(tag);
  const values = tags.get(tag)?.values;
  if (!Array.isArray(values)) return members;
  for (const value of values) {
    const id = typeof value === 'string' ? value : text(record(value)?.id);
    if (id === undefined) continue;
    if (id.startsWith('#')) {
      for (const member of projectTagMembers(namespaced(id.slice(1)), tags, seen)) {
        members.add(member);
      }
    } else {
      members.add(namespaced(id));
    }
  }
  return members;
}

function saplingProblems(
  blocks: readonly TypedBlock[],
  elements: readonly Element[],
  registry: ValidationRegistry,
): Problem[] {
  const features = new Map(
    elements
      .filter((element) => element.kind === FEATURE_KIND)
      .map((element) => [element.id as string, dataOf(element)]),
  );
  const tags = new Map(
    elements
      .filter((element) => element.kind === BLOCK_TAG_KIND)
      .map((element) => [element.id as string, dataOf(element)]),
  );
  const leaves = new Set(
    blocks.filter(({ type }) => type === 'leaves').map(({ element }) => element.id as string),
  );
  const projectBlocks = new Set(blocks.map(({ element }) => element.id as string));
  const vanillaFeatures = registry.ids('worldgen/feature').length > 0;
  let logs: Set<string> | undefined;
  const problems: Problem[] = [];
  for (const { element, data, type } of blocks) {
    if (type !== 'sapling') continue;
    for (const field of TREE_FIELDS) {
      const written = text(data[field]);
      if (written === undefined) continue;
      const id = namespaced(written);
      const feature = features.get(id);
      if (feature === undefined) {
        if (!vanillaFeatures || registry.has('worldgen/feature', id)) continue;
        problems.push({
          severity: 'error',
          code: 'blocks-items.sapling-tree-unknown',
          elementId: element.id,
          path: pointer(field),
          message: `Tree "${id}" is neither a feature of this project nor a vanilla feature, so the sapling would never grow. Pick a tree feature, or add one to the project.`,
        });
        continue;
      }
      const config = record(feature.config) ?? feature;
      const featureType = text(feature.type);
      if (featureType !== undefined && namespaced(featureType) !== TREE_FEATURE) {
        problems.push({
          severity: 'warning',
          code: 'blocks-items.sapling-tree-not-tree',
          elementId: element.id,
          path: pointer(field),
          message: `Feature "${id}" is a ${featureType} feature, not a tree. The sapling still grows it, but saplings are meant for tree features.`,
        });
        continue;
      }
      const foliage = providerBlocks(config.foliage_provider);
      if (![...foliage].some((block) => leaves.has(block))) continue;
      logs ??= projectTagMembers(LOGS_TAG, tags);
      const trunks = [...providerBlocks(config.trunk_provider)].filter(
        (block) => projectBlocks.has(block) && !(logs as Set<string>).has(block),
      );
      if (trunks.length === 0) continue;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.leaves-will-decay',
        elementId: element.id,
        path: pointer(field),
        message: `The leaves of tree "${id}" will decay: leaves stay only next to blocks in #minecraft:logs, and no project tag puts ${trunks.map((block) => `"${block}"`).join(', ')} there. Add the trunk to the minecraft:logs block tag.`,
      });
    }
  }
  return problems;
}

function tintedLeavesParticles(blocks: readonly TypedBlock[]): Problem[] {
  return blocks
    .filter(
      ({ type, data }) =>
        type === 'leaves' && data.tint !== undefined && text(data.falling_particle) !== undefined,
    )
    .map(({ element }) => ({
      severity: 'warning' as const,
      code: 'blocks-items.particle-on-tinted-leaves',
      elementId: element.id,
      path: '/falling_particle',
      message:
        'Tinted leaves drop falling leaf particles in their tint colour, so this particle is never used. Remove it, or remove the tint.',
    }));
}

// ---------------------------------------------------------------------------------------------
// Block item ids (ADR 0068 D2)

function blockItemIdClashes(blocks: readonly TypedBlock[], elements: readonly Element[]) {
  const owners = new Map<string, string[]>();
  const own = (id: string, owner: string): void => {
    owners.set(id, [...(owners.get(id) ?? []), owner]);
  };
  for (const element of elements) {
    if (element.kind === ITEM_KIND) own(element.id, `item "${element.id}"`);
  }
  for (const { element } of blocks) {
    const itemId = blockItemId(element);
    if (itemId !== undefined) own(itemId, `block "${element.id}"`);
  }
  const problems: Problem[] = [];
  for (const { element } of blocks) {
    const itemId = blockItemId(element);
    if (itemId === undefined || itemId === element.id) continue;
    const others = (owners.get(itemId) ?? []).filter((owner) => owner !== `block "${element.id}"`);
    if (others.length === 0) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.block-item-id-clash',
      elementId: element.id,
      path: pointer('item', 'id'),
      message: `Block item id "${itemId}" is already used by ${others.join(', ')}. Pick another id for this block's item.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------

export const blockTypeValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.type-components',
    kinds: [BLOCK_KIND],
    validate: ({ elements }) => componentsNotForType(typedBlocks(elements)),
  },
  {
    id: 'msm.blocks-items.type-appearance',
    kinds: [BLOCK_KIND, MODEL_KIND],
    validate: ({ elements }) => {
      const blocks = typedBlocks(elements);
      return [
        ...typesNeedAppearance(blocks),
        ...modelSlotProblems(blocks),
        ...generatedModelClashes(blocks, elements),
      ];
    },
  },
  {
    id: 'msm.blocks-items.type-facts',
    kinds: [BLOCK_KIND],
    validate: ({ elements, target }) => unknownSetAndWoodTypes(typedBlocks(elements), target),
  },
  {
    id: 'msm.blocks-items.type-references',
    kinds: [BLOCK_KIND],
    validate: ({ elements, registry }) => {
      const blocks = typedBlocks(elements);
      return [...stairsBases(blocks, registry), ...strippableTargets(blocks, registry)];
    },
  },
  {
    id: 'msm.blocks-items.crop',
    kinds: [BLOCK_KIND],
    validate: ({ elements }) => cropProblems(typedBlocks(elements)),
  },
  {
    id: 'msm.blocks-items.sapling',
    kinds: [BLOCK_KIND, FEATURE_KIND, BLOCK_TAG_KIND],
    validate: ({ elements, registry }) =>
      saplingProblems(typedBlocks(elements), elements, registry),
  },
  {
    id: 'msm.blocks-items.leaves-particle',
    kinds: [BLOCK_KIND],
    validate: ({ elements }) => tintedLeavesParticles(typedBlocks(elements)),
  },
  {
    id: 'msm.blocks-items.block-item-id',
    kinds: [BLOCK_KIND, ITEM_KIND],
    validate: ({ elements }) => blockItemIdClashes(typedBlocks(elements), elements),
  },
] satisfies ProjectValidator[]);
