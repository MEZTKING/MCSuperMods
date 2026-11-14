/**
 * Cross-element checks of blocks, items and mod metadata (ADR 0025 D8). Every validator is
 * pure and reads only the project's elements, the target and the registry ids. Codes:
 *
 * - `blocks-items.missing-model` (warning): a block or item without `model`; it renders as the
 *   missing-model cube and gets no block state or item model definition.
 * - `blocks-items.unknown-event` (error): an `event` field of a trigger component
 *   (`msm:on_interact`, `msm:on_step`, `msm:on_use`, the `on_powered` and `on_unpowered` of
 *   `msm:redstone`, the `on_hit_entity` and `on_hit_block` of `msm:throwable` (ADR 0056), an
 *   effect's `msm:on_start`, `msm:on_tick` and `msm:on_end` (ADR 0055 D12), the block triggers
 *   `msm:on_break`, `msm:on_place`, `msm:on_random_tick`, `msm:on_entity_inside` and the item
 *   triggers `msm:on_hit`, `msm:on_use_on_block`, `msm:while_held`, `msm:while_worn` (ADR 0061
 *   D1, D2; the entity triggers are `entities.unknown-event`'s)) or a
 *   `trigger_event` action naming an event the element does not declare.
 *   A `run_script` action (ADR 0032 D4) names a script handler, not an event, so it is never
 *   an event reference; `scripting.unknown-handler` of `@msm/plugin-scripting` checks it.
 * - `blocks-items.event-cycle` (error): events of a block, item or effect whose `trigger_event`
 *   actions call each other in a loop; the runtime would stop the chain at 16 levels with a
 *   logged error.
 * - `blocks-items.bad-mod-id` (error): an `msm:mod` whose `mod_id` breaks Fabric's rule
 *   `^[a-z][a-z0-9_-]{1,63}$` (the schema checks the length only).
 * - `blocks-items.reserved-mod-id` (error): an `msm:mod` whose `mod_id` is one of
 *   {@link RESERVED_MOD_IDS} (ADR 0026 D2): the game, Java, Fabric Loader, Fabric API or the
 *   MSM runtime itself.
 * - `blocks-items.unknown-tool-tier` (error): a `min_tier` of `msm:breakable` or a `tier` of
 *   `msm:tool` that the target has no tool material for (no
 *   `minecraft:incorrect_for_<tier>_tool` block tag). Skipped when the registry has no block
 *   tags at all. A custom tool material (an object `tier`, ADR 0042 D3) is not checked.
 * - `blocks-items.unknown-armor-material` (error): an `msm:armor` `material` given by name that
 *   is not one of the target's `items.armorMaterials` (ADR 0042 D4). Skipped for a target
 *   without that fact; a custom material (an object) is not checked.
 * - `blocks-items.unknown-equipment-asset` (warning): a custom armour material whose
 *   `equipment_asset` names neither a `minecraft:equipment` element of the project nor a
 *   vanilla equipment asset of the target, so the piece is invisible when worn (ADR 0042 D2).
 *   Skipped when the registry knows no equipment assets and the project has none.
 *   For horse and wolf armour (ADR 0044 D5) whose asset is a project equipment element, the
 *   element must also have the `horse_body` or `wolf_body` layer.
 * - `blocks-items.component-conflict` (error): an `msm:item` with two of the mutually
 *   exclusive components {@link EXCLUSIVE_ITEM_COMPONENTS} (ADR 0042 D1, ADR 0044 D3; the
 *   runtime registers none of them), or an `msm:components` entry for a vanilla component that
 *   an MSM component or field of the same item already sets ({@link MSM_VANILLA_COMPONENTS};
 *   ADR 0044 D1: MSM's own component wins), or an `msm:throwable` together with one of
 *   {@link THROWABLE_CONFLICTS} or an `msm:tool` of type `mace` (ADR 0056 D2: the runtime
 *   applies none of them). The message names the two components.
 * - `blocks-items.item-collision` (error): an `msm:item` with the id of an `msm:block` that
 *   registers its own block item (`item` is not `false`).
 * - `blocks-items.passthrough-needs-data-pack` (warning): an `msm:components` entry for a
 *   vanilla component whose value names a data pack registry entry (the target's
 *   `items.dataPackComponents`) that the runtime cannot apply late ({@link
 *   DELAYED_PASSTHROUGH_COMPONENTS}): the game logs an error at load and the item has no such
 *   component (ADR 0050). Only when the target has `items.dataPackComponents`.
 * - `blocks-items.missing-pull-model` (warning): a bow or crossbow whose own (non-vanilla)
 *   model has no `<model>_pulling_0`…`_2` (and for a crossbow `_arrow`, `_firework`) model
 *   element, which its item definition shows while it is drawn. Only when the target has
 *   `items.rangedPull`.
 * - `blocks-items.model-not-cube` (warning, ADR 0059 D4): a block without `msm:shape` whose
 *   model is a project model that is not a full cube: it has its own `elements`, or its parent
 *   chain (followed through project models) ends in a vanilla model outside the cube families
 *   {@link isCubeModel}. Vanilla models named directly are not checked.
 * - `blocks-items.transparent-texture-on-solid-block` (warning, ADR 0059 D4): reported by the
 *   app, which knows texture pixels; this package only owns the code and the problem's wording
 *   ({@link transparentTextureProblem}) and {@link isSeeThroughBlock}.
 * - `blocks-items.while-worn-without-armor` (error, ADR 0061 D1): an item with `msm:while_worn`
 *   but no `msm:armor`, so it is never worn in an armour slot and the trigger never fires.
 * - `blocks-items.entity-inside-solid-block` (warning, ADR 0061 D2): a block with
 *   `msm:on_entity_inside` whose shape is the full solid cube (no `msm:shape`, or one whose
 *   boxes are the single full cube and whose `collision` is not `false`): no entity can be
 *   inside it, so the trigger never fires.
 * - `blocks-items.fast-tick-trigger` (info, ADR 0061 D4): a repeating trigger (`msm:while_held`,
 *   `msm:while_worn`, `msm:on_entity_inside`, an entity's `msm:on_tick`) with an interval under
 *   20 ticks whose event, or an event it triggers, runs `run_function` or `run_script`.
 * - `blocks-items.spawn-group-size` (error, ADR 0060 D2): a biome addition spawn whose
 *   `max_group` is below its `min_group`; the game rejects the spawn entry.
 * - `blocks-items.duplicate-biome-feature` (warning, ADR 0060 D2): a placed feature that a
 *   project biome lists and that a biome addition naming that biome by id adds again, so it
 *   generates twice.
 * - `blocks-items.bad-loot-pool` (error, ADR 0060 D3): a loot addition pool that is not an
 *   object with `rolls` (a number or a number provider object) and a non-empty `entries` list
 *   of objects with a string `type`; the runtime skips such a pool with a logged error. The
 *   format types pools as `any` (an mcdoc limit), so this is the plugin's structural check;
 *   the full check against the target's vanilla pool schema needs the host's schema index,
 *   which validators do not receive.
 * - `blocks-items.unknown-loot-item` (warning, ADR 0060 D3): a loot addition pool entry of
 *   type `minecraft:item` whose `name` is neither a vanilla nor a project item. The schema
 *   checks the `tables` ids and a biome addition's `biomes`, `feature` and `entity` ids
 *   (`schema.unknown-id`), so no validator repeats them.
 * - `blocks-items.component-conflict` also covers the element-only `fuel` and `compost` of an
 *   item or a block item (ADR 0060 D4) against `msm:components` entries for
 *   `cooking_fuel` and `compostable`.
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  ValidationRegistry,
} from '@msm/plugin-api';
import {
  BIOME_ADDITION_KIND,
  BLOCK_KIND,
  EFFECT_KIND,
  ITEM_KIND,
  LOOT_ADDITION_KIND,
  MOD_KIND,
  POTION_KIND,
} from './kinds';
import { rangedPullOf } from './lowering/item';
import { isRecord } from './lowering/paths';
import { type BrewingStep, potionBrewingSteps, potionVariantIds } from './lowering/potion';
import { FULL_CUBE, lowerShapeInPlace, SHAPE_COMPONENT, shapeOf } from './lowering/shape';
import { rangedPullModels } from './lowering/shared';
import { incorrectForTierTag, toolTierName } from './lowering/tools';
import { SHAPED_BLOCK_TYPES } from './validators-types';

/** Kind id of equipment assets, contributed by `@msm/plugin-resourcepack` (ADR 0042 D2). */
export const EQUIPMENT_KIND = 'minecraft:equipment';

/** The Fabric mod id rule (ADR 0025 D6). */
export const MOD_ID_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;

/**
 * Mod ids a project's mod may not use (ADR 0026 D2): they name the game, Java, Fabric Loader,
 * Fabric API and the MSM runtime, which the exported jar depends on.
 */
export const RESERVED_MOD_IDS: readonly string[] = Object.freeze([
  'minecraft',
  'java',
  'fabricloader',
  'fabric-api',
  'msm_runtime',
]);

/** Every code the validators report. */
export const BLOCKS_ITEMS_PROBLEM_CODES = Object.freeze([
  'blocks-items.missing-model',
  'blocks-items.unknown-event',
  'blocks-items.event-cycle',
  'blocks-items.bad-mod-id',
  'blocks-items.reserved-mod-id',
  'blocks-items.unknown-tool-tier',
  'blocks-items.item-collision',
  'blocks-items.unknown-armor-material',
  'blocks-items.unknown-equipment-asset',
  'blocks-items.component-conflict',
  'blocks-items.missing-pull-model',
  'blocks-items.passthrough-needs-data-pack',
  'blocks-items.model-not-cube',
  'blocks-items.transparent-texture-on-solid-block',
  'blocks-items.while-worn-without-armor',
  'blocks-items.entity-inside-solid-block',
  'blocks-items.fast-tick-trigger',
  'blocks-items.spawn-group-size',
  'blocks-items.duplicate-biome-feature',
  'blocks-items.bad-loot-pool',
  'blocks-items.unknown-loot-item',
  'blocks-items.potion-effect-missing',
  'blocks-items.potion-duplicate-brewing',
  'blocks-items.potion-id-collision',
  'blocks-items.potion-needs-jar',
] as const);

/** The code of the app-side texture warning (ADR 0059 D4). */
export const TRANSPARENT_TEXTURE_CODE = 'blocks-items.transparent-texture-on-solid-block';

/**
 * The warning the app reports when a block's model textures have transparent pixels and the
 * block is not see-through ({@link isSeeThroughBlock} is false): the holes show into the world.
 *
 * @param elementId - The `msm:block` element.
 * @param texture - The texture id with transparent pixels.
 */
export function transparentTextureProblem(elementId: Element['id'], texture: string): Problem {
  return {
    severity: 'warning',
    code: TRANSPARENT_TEXTURE_CODE,
    elementId,
    path: '/model',
    message: `Texture "${texture}" has transparent pixels, but this block is solid, so you see through it into the world. Turn on "See-through" in the block's shape, or use a texture without transparent pixels.`,
  };
}

/** The code of the vanilla pack export's potion warning (ADR 0063 D6). */
export const POTION_NEEDS_JAR_CODE = 'blocks-items.potion-needs-jar';

/**
 * The warning the vanilla pack export reports, once per export, when the project has potions
 * (ADR 0063 D6): a data pack cannot add a potion, so the brewing recipes name potions the game
 * does not know. Like `blocks-items.passthrough-needs-data-pack` (ADR 0050), a warning: the
 * packs still export.
 *
 * @param elementId - The first `msm:potion` element, if the caller wants to point at one.
 */
export function potionNeedsJarProblem(elementId?: Element['id']): Problem {
  return {
    severity: 'warning',
    code: POTION_NEEDS_JAR_CODE,
    ...(elementId === undefined ? {} : { elementId }),
    message:
      'Potions need the Fabric mod export: a vanilla data pack cannot add a potion to the game, so these packs leave the potions out and their brewing recipes do nothing. Export the project as a Fabric mod to brew them.',
  };
}

/**
 * The `msm:components` entries the runtime decodes once data packs are loaded (ADR 0044 D1;
 * `ComponentPassthrough.DELAYED` in `engine-mod`), so they may name data pack registry entries.
 */
export const DELAYED_PASSTHROUGH_COMPONENTS: readonly string[] = Object.freeze([
  'blocks_attacks',
  'damage_resistant',
  'damage_type',
  'jukebox_playable',
  'provides_trim_material',
  'trim',
]);

/**
 * Item components of which an item may have at most one (ADR 0044 D3): the runtime builds a
 * different item class or base properties for each.
 */
export const EXCLUSIVE_ITEM_COMPONENTS: readonly string[] = Object.freeze([
  'msm:tool',
  'msm:armor',
  'msm:ranged_weapon',
  'msm:shield',
]);

/**
 * Item components an `msm:throwable` cannot share an item with (ADR 0056 D2): each owns the
 * use action or the item class. An `msm:tool` of type `mace` conflicts too; other tools,
 * `msm:durability` and `msm:on_use` combine with it.
 */
export const THROWABLE_CONFLICTS: readonly string[] = Object.freeze([
  'msm:armor',
  'msm:ranged_weapon',
  'msm:shield',
  'msm:consumable',
  'msm:food',
]);

/**
 * The vanilla data components (unprefixed ids) each MSM item component sets, so an
 * `msm:components` entry for one of them clashes (ADR 0044 D1). Keys are component ids under
 * `components`, or the top-level fields `max_stack_size`, `rarity` and the element-only `fuel`
 * and `compost` (ADR 0060 D4; also on a block's `item`). Every id is checked
 * against each built-in target's `data_component_type` registry in the tests.
 */
export const MSM_VANILLA_COMPONENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  max_stack_size: ['max_stack_size'],
  rarity: ['rarity'],
  'msm:food': ['food', 'consumable'],
  'msm:consumable': ['consumable', 'use_cooldown', 'use_remainder'],
  'msm:tool': ['tool', 'weapon', 'attribute_modifiers', 'max_damage', 'enchantable', 'repairable'],
  'msm:armor': ['equippable', 'attribute_modifiers', 'max_damage', 'enchantable', 'repairable'],
  'msm:durability': ['max_damage'],
  'msm:shield': ['blocks_attacks'],
  'msm:death_protection': ['death_protection'],
  fuel: ['cooking_fuel'],
  compost: ['compostable'],
});

/** Extra vanilla components an `msm:tool` of type spear sets (vanilla's spear attack). */
export const SPEAR_VANILLA_COMPONENTS: readonly string[] = Object.freeze([
  'kinetic_weapon',
  'piercing_weapon',
  'attack_range',
  'minimum_attack_charge',
]);

/** RFC 6901 escaping of one reference token. */
const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;

const definitions = (elements: readonly Element[]): Element[] =>
  elements.filter((element) => element.kind === BLOCK_KIND || element.kind === ITEM_KIND);

/** The elements whose definitions declare events: blocks, items and effects. */
const eventOwners = (elements: readonly Element[]): Element[] =>
  elements.filter(
    (element) =>
      element.kind === BLOCK_KIND || element.kind === ITEM_KIND || element.kind === EFFECT_KIND,
  );

/**
 * The trigger component fields that name an event, per kind: the keys from `components` down
 * to the string, `[component, ...fields]`.
 */
const EVENT_FIELDS: Readonly<Record<string, readonly (readonly string[])[]>> = {
  [BLOCK_KIND]: [
    ['msm:on_interact', 'event'],
    ['msm:on_step', 'event'],
    ['msm:redstone', 'on_powered'],
    ['msm:redstone', 'on_unpowered'],
    ['msm:on_break', 'event'],
    ['msm:on_place', 'event'],
    ['msm:on_random_tick', 'event'],
    ['msm:on_entity_inside', 'event'],
  ],
  [ITEM_KIND]: [
    ['msm:on_use', 'event'],
    ['msm:throwable', 'on_hit_entity', 'event'],
    ['msm:throwable', 'on_hit_block', 'event'],
    ['msm:on_hit', 'event'],
    ['msm:on_use_on_block', 'event'],
    ['msm:while_held', 'event'],
    ['msm:while_worn', 'event'],
  ],
  [EFFECT_KIND]: [
    ['msm:on_start', 'event'],
    ['msm:on_tick', 'event'],
    ['msm:on_end', 'event'],
  ],
};

/** The value at `keys` below `root`, or `undefined` when a step is not an object. */
function valueAt(root: JsonObject | undefined, keys: readonly string[]): Json | undefined {
  let value: Json | undefined = root;
  for (const key of keys) value = record(value)?.[key];
  return value;
}

/** One event reference inside an element. */
interface EventReference {
  event: string;
  path: string;
  /** The event whose action makes the reference, for `trigger_event`; absent for components. */
  from?: string;
}

function eventReferences(element: Element): EventReference[] {
  const data = dataOf(element);
  const references: EventReference[] = [];
  const components = record(data.components);
  for (const keys of EVENT_FIELDS[element.kind] ?? []) {
    const value = valueAt(components, keys);
    if (typeof value === 'string') {
      references.push({ event: value, path: pointer('components', ...keys) });
    }
  }
  const events = record(data.events) ?? {};
  for (const [name, event] of Object.entries(events)) {
    const actions = record(event)?.actions;
    if (!Array.isArray(actions)) continue;
    actions.forEach((action, index) => {
      const fields = record(action);
      if (fields?.type === 'trigger_event' && typeof fields.event === 'string') {
        references.push({
          event: fields.event,
          path: pointer('events', name, 'actions', index, 'event'),
          from: name,
        });
      }
    });
  }
  return references;
}

const declaredEvents = (element: Element): Set<string> =>
  new Set(Object.keys(record(dataOf(element).events) ?? {}));

function unknownEvents(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of eventOwners(elements)) {
    const declared = declaredEvents(element);
    for (const reference of eventReferences(element)) {
      if (declared.has(reference.event)) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.unknown-event',
        elementId: element.id,
        path: reference.path,
        message: `Event "${reference.event}" is not declared in this element's "events". Add it there or pick an existing event.`,
      });
    }
  }
  return problems;
}

/** Strongly connected components with more than one node or a self-loop, each sorted. */
function cycles(
  nodes: readonly string[],
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of [...(edges.get(node) ?? [])].sort()) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) as number, low.get(next) as number));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) as number, index.get(next) as number));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop() as string;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || edges.get(node)?.has(node) === true) found.push(component.sort());
    }
  };
  for (const node of nodes) if (!index.has(node)) visit(node);
  return found;
}

function eventCycles(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of eventOwners(elements)) {
    const declared = declaredEvents(element);
    const edges = new Map<string, Set<string>>();
    for (const reference of eventReferences(element)) {
      if (reference.from === undefined || !declared.has(reference.event)) continue;
      const targets = edges.get(reference.from) ?? new Set<string>();
      targets.add(reference.event);
      edges.set(reference.from, targets);
    }
    for (const cycle of cycles([...declared].sort(), edges)) {
      const names = cycle.map((name) => `"${name}"`).join(', ');
      problems.push({
        severity: 'error',
        code: 'blocks-items.event-cycle',
        elementId: element.id,
        path: pointer('events', cycle[0] as string),
        message: `Events ${names} trigger each other in a loop. The game stops such a chain after 16 steps and logs an error; remove one of the "trigger_event" actions.`,
      });
    }
  }
  return problems;
}

function badModIds(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== MOD_KIND) continue;
    const modId = dataOf(element).mod_id;
    if (typeof modId !== 'string') continue;
    if (RESERVED_MOD_IDS.includes(modId)) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.reserved-mod-id',
        elementId: element.id,
        path: '/mod_id',
        message: `Mod id "${modId}" is reserved for ${modId === 'msm_runtime' ? 'the MSM runtime' : 'the game or Fabric'}: choose another id, for example "mod_${modId}".`,
      });
      continue;
    }
    if (MOD_ID_PATTERN.test(modId)) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.bad-mod-id',
      elementId: element.id,
      path: '/mod_id',
      message: `Mod id "${modId}" is not valid for Fabric: use a lower-case letter, then 1 to 63 lower-case letters, digits, "_" or "-".`,
    });
  }
  return problems;
}

function unknownToolTiers(
  elements: readonly Element[],
  registry: ValidationRegistry,
  targetId: string,
): Problem[] {
  if (registry.ids('tag/block').length === 0) return [];
  const problems: Problem[] = [];
  const check = (element: Element, tier: Json | undefined, path: string): void => {
    const name = toolTierName(tier);
    if (name === undefined || registry.has('tag/block', incorrectForTierTag(name))) return;
    problems.push({
      severity: 'error',
      code: 'blocks-items.unknown-tool-tier',
      elementId: element.id,
      path,
      message: `Tool tier "${name}" does not exist in ${targetId}: the target has no "${incorrectForTierTag(name)}" block tag.`,
    });
  };
  for (const element of definitions(elements)) {
    const components = record(dataOf(element).components);
    if (element.kind === BLOCK_KIND) {
      const breakable = record(components?.['msm:breakable']);
      check(element, breakable?.min_tier, pointer('components', 'msm:breakable', 'min_tier'));
    } else {
      const tool = record(components?.['msm:tool']);
      check(element, tool?.tier, pointer('components', 'msm:tool', 'tier'));
    }
  }
  return problems;
}

/** The `msm:armor` component of an item element, if any. */
const armorOf = (element: Element): JsonObject | undefined =>
  element.kind === ITEM_KIND
    ? record(record(dataOf(element).components)?.['msm:armor'])
    : undefined;

const ARMOR_MATERIAL_PATH = pointer('components', 'msm:armor', 'material');

function unknownArmorMaterials(
  elements: readonly Element[],
  materials: readonly string[] | undefined,
  targetId: string,
): Problem[] {
  if (materials === undefined) return [];
  const problems: Problem[] = [];
  for (const element of elements) {
    const material = armorOf(element)?.material;
    if (typeof material !== 'string' || materials.includes(material)) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.unknown-armor-material',
      elementId: element.id,
      path: ARMOR_MATERIAL_PATH,
      message: `Armour material "${material}" does not exist in ${targetId}. Use one of ${materials.map((name) => `"${name}"`).join(', ')}, or a custom material.`,
    });
  }
  return problems;
}

/** `ns:path` for a written id; an id without a namespace is `minecraft:`. */
const namespacedId = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** The equipment layer horse and wolf armour draw (ADR 0044 D5). */
const BODY_LAYERS: Readonly<Record<string, string>> = Object.freeze({
  horse: 'horse_body',
  wolf: 'wolf_body',
});

function unknownEquipmentAssets(
  elements: readonly Element[],
  registry: ValidationRegistry,
): Problem[] {
  const project = new Map<string, Element>(
    elements
      .filter((element) => element.kind === EQUIPMENT_KIND)
      .map((element) => [element.id, element]),
  );
  if (project.size === 0 && registry.ids('equipment').length === 0) return [];
  const problems: Problem[] = [];
  const assetPath = pointer('components', 'msm:armor', 'material', 'equipment_asset');
  for (const element of elements) {
    const armor = armorOf(element);
    const asset = record(armor?.material)?.equipment_asset;
    if (typeof asset !== 'string') continue;
    const id = namespacedId(asset);
    const equipment = project.get(id);
    if (equipment === undefined && !registry.has('equipment', id)) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.unknown-equipment-asset',
        elementId: element.id,
        path: assetPath,
        message: `Equipment asset "${asset}" is neither an equipment element of this project nor a vanilla one, so the armour is invisible when worn. Add a "${id}" equipment element or pick an existing one.`,
      });
      continue;
    }
    const layer = typeof armor?.slot === 'string' ? BODY_LAYERS[armor.slot] : undefined;
    if (equipment === undefined || layer === undefined) continue;
    if (record(dataOf(equipment).layers)?.[layer] !== undefined) continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.unknown-equipment-asset',
      elementId: element.id,
      path: assetPath,
      message: `Equipment asset "${asset}" has no "${layer}" layer, so this ${armor?.slot} armour is invisible when worn. Add a "${layer}" layer to the "${id}" equipment element.`,
    });
  }
  return problems;
}

/** An `msm:components` key without its `minecraft:` prefix. */
const vanillaComponentId = (key: string): string =>
  key.startsWith('minecraft:') ? key.slice('minecraft:'.length) : key;

/** `msm:x` or the top-level field `x`, as written in a message. */
const describeSetter = (setter: string): string =>
  setter.startsWith('msm:') ? `"${setter}"` : `the "${setter}" field`;

/** ADR 0056 D2: what an `msm:throwable` cannot share an item with. */
function throwableConflicts(element: Element, components: JsonObject): Problem[] {
  if (components['msm:throwable'] === undefined) return [];
  const path = pointer('components', 'msm:throwable');
  const problems: Problem[] = THROWABLE_CONFLICTS.filter((id) => components[id] !== undefined).map(
    (other) => ({
      severity: 'error',
      code: 'blocks-items.component-conflict',
      elementId: element.id,
      path,
      message: `An item cannot have both "msm:throwable" and "${other}": both decide what using the item does, so the game would apply neither. Remove one of them.`,
    }),
  );
  if (record(components['msm:tool'])?.type === 'mace') {
    problems.push({
      severity: 'error',
      code: 'blocks-items.component-conflict',
      elementId: element.id,
      path,
      message:
        'A mace cannot be thrown: "msm:throwable" and an "msm:tool" of type "mace" both decide how the item works, so the game would apply neither. Remove "msm:throwable" or pick another tool type.',
    });
  }
  return problems;
}

/** The top-level fields of a block item that set vanilla components (ADR 0060 D4). */
const BLOCK_ITEM_SETTERS: readonly string[] = ['max_stack_size', 'rarity', 'fuel', 'compost'];

/** A block item's `msm:components` entries that its own fields already set. */
function blockItemConflicts(element: Element): Problem[] {
  const item = record(dataOf(element).item);
  const passthrough = record(record(item?.components)?.['msm:components']);
  if (item === undefined || passthrough === undefined) return [];
  const setters = new Map<string, string>();
  for (const setter of BLOCK_ITEM_SETTERS) {
    if (item[setter] === undefined) continue;
    for (const id of MSM_VANILLA_COMPONENTS[setter] ?? []) setters.set(id, setter);
  }
  const problems: Problem[] = [];
  for (const key of Object.keys(passthrough).sort()) {
    const setter = setters.get(vanillaComponentId(key));
    if (setter === undefined) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.component-conflict',
      elementId: element.id,
      path: pointer('item', 'components', 'msm:components', key),
      message: `The block item's "${setter}" field and the "msm:components" entry "${key}" both set the vanilla "${vanillaComponentId(key)}" component; the "${setter}" field wins. Remove "${key}" from "msm:components" or remove the "${setter}" field.`,
    });
  }
  return problems;
}

function componentConflicts(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind === BLOCK_KIND) problems.push(...blockItemConflicts(element));
    if (element.kind !== ITEM_KIND) continue;
    const data = dataOf(element);
    const components = record(data.components) ?? {};
    const present = EXCLUSIVE_ITEM_COMPONENTS.filter((id) => components[id] !== undefined);
    for (const second of present.slice(1)) {
      const first = present[0] as string;
      problems.push({
        severity: 'error',
        code: 'blocks-items.component-conflict',
        elementId: element.id,
        path: pointer('components', second),
        message: `An item cannot have both "${first}" and "${second}": the game would register neither. Remove one of them.`,
      });
    }
    problems.push(...throwableConflicts(element, components));
    const passthrough = record(components['msm:components']);
    if (passthrough === undefined) continue;
    const setters = new Map<string, string>();
    for (const [setter, vanilla] of Object.entries(MSM_VANILLA_COMPONENTS)) {
      const isSet = setter.startsWith('msm:')
        ? components[setter] !== undefined
        : data[setter] !== undefined;
      if (!isSet) continue;
      for (const id of vanilla) if (!setters.has(id)) setters.set(id, setter);
    }
    if (record(components['msm:tool'])?.type === 'spear') {
      for (const id of SPEAR_VANILLA_COMPONENTS) if (!setters.has(id)) setters.set(id, 'msm:tool');
    }
    for (const key of Object.keys(passthrough).sort()) {
      const setter = setters.get(vanillaComponentId(key));
      if (setter === undefined) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.component-conflict',
        elementId: element.id,
        path: pointer('components', 'msm:components', key),
        message: `${describeSetter(setter)} and the "msm:components" entry "${key}" both set the vanilla "${vanillaComponentId(key)}" component; ${describeSetter(setter)} wins. Remove "${key}" from "msm:components" or remove ${describeSetter(setter)}.`,
      });
    }
  }
  return problems;
}

function passthroughNeedsDataPack(
  elements: readonly Element[],
  dataPackComponents: readonly string[],
): Problem[] {
  const needs = new Set(dataPackComponents);
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== ITEM_KIND) continue;
    const passthrough = record(record(dataOf(element).components)?.['msm:components']);
    if (passthrough === undefined) continue;
    for (const key of Object.keys(passthrough).sort()) {
      const id = vanillaComponentId(key);
      if (!needs.has(id) || DELAYED_PASSTHROUGH_COMPONENTS.includes(id)) continue;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.passthrough-needs-data-pack',
        elementId: element.id,
        path: pointer('components', 'msm:components', key),
        message: `"${key}" names an entry of a data pack registry (an enchantment, a variant or a pattern), which the game does not know yet when it registers items: the runtime logs an error and the item gets no "${id}". Only ${DELAYED_PASSTHROUGH_COMPONENTS.map((entry) => `"${entry}"`).join(', ')} can wait for the data packs. Give the item this through a loot table, a recipe result or a command instead.`,
      });
    }
  }
  return problems;
}

function missingModels(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of definitions(elements)) {
    const data = dataOf(element);
    // A block type other than `block` is checked by `type-needs-appearance` (ADR 0067 D7).
    if (element.kind === BLOCK_KIND && data.type !== undefined && data.type !== 'block') continue;
    const model = data.model;
    if (typeof model === 'string' && model.length > 0) continue;
    const what = element.kind === BLOCK_KIND ? 'block' : 'item';
    problems.push({
      severity: 'warning',
      code: 'blocks-items.missing-model',
      elementId: element.id,
      path: '/model',
      message: `This ${what} has no model, so it shows as the purple and black missing-model cube. Pick a model.`,
    });
  }
  return problems;
}

function itemCollisions(elements: readonly Element[]): Problem[] {
  const blocksWithItems = new Set(
    elements
      .filter((element) => element.kind === BLOCK_KIND && dataOf(element).item !== false)
      .map((element) => element.id),
  );
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== ITEM_KIND || !blocksWithItems.has(element.id)) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.item-collision',
      elementId: element.id,
      message: `Block "${element.id}" already registers an item with this id. Rename the item, or set "item": false on the block.`,
    });
  }
  return problems;
}

/** Kind id of models, contributed by `@msm/plugin-resourcepack`. */
const MODEL_KIND = 'minecraft:model';

function missingPullModels(elements: readonly Element[]): Problem[] {
  const models = new Set<string>(
    elements.filter((element) => element.kind === MODEL_KIND).map((element) => element.id),
  );
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== ITEM_KIND) continue;
    const data = dataOf(element);
    const model = data.model;
    const pull = rangedPullOf(data);
    if (pull === null || typeof model !== 'string' || model.startsWith('minecraft:')) continue;
    const missing = rangedPullModels(model, pull.type).filter((id) => !models.has(id));
    if (missing.length === 0) continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.missing-pull-model',
      elementId: element.id,
      path: '/model',
      message: `This ${pull.type} shows ${missing.join(', ')} while it is ${pull.type === 'bow' ? 'drawn' : 'charged or loaded'}, but the project has no such model, so it would show the missing-model cube. Add those models (for example copies of "${model}" with pulled-string textures), or use a vanilla ${pull.type} model.`,
    });
  }
  return problems;
}

/**
 * Whether a vanilla model id is a full cube: `block/cube` and its `cube_*` children, and the
 * `orientable*` models that extend `block/cube`.
 */
export function isCubeModel(id: string): boolean {
  const path = id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id;
  return /^block\/(cube(_[a-z_]+)?|orientable(_[a-z_]+)?)$/.test(path);
}

/**
 * Why a project model is not a full cube, or `undefined` when it is one (or cannot be told).
 * Follows project parents, stopping at a cycle.
 */
function notCubeReason(model: string, models: ReadonlyMap<string, JsonObject>): string | undefined {
  const seen = new Set<string>();
  let current = model;
  for (;;) {
    const data = models.get(current);
    if (data === undefined) {
      return current === model || isCubeModel(current)
        ? undefined
        : `its parent "${current}" is not a cube`;
    }
    if (seen.has(current)) return undefined;
    seen.add(current);
    if (Array.isArray(data.elements) && data.elements.length > 0) {
      return current === model
        ? 'it has its own elements'
        : `its parent "${current}" has its own elements`;
    }
    const parent = data.parent;
    if (typeof parent !== 'string' || parent.length === 0) return undefined;
    current = parent.includes(':') ? parent : `minecraft:${parent}`;
  }
}

function modelsNotCube(elements: readonly Element[]): Problem[] {
  const models = new Map<string, JsonObject>(
    elements
      .filter((element) => element.kind === MODEL_KIND)
      .map((element) => [element.id, dataOf(element)]),
  );
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== BLOCK_KIND) continue;
    const data = dataOf(element);
    // Family and plant types keep vanilla's own shapes (ADR 0067 D8): only the types that take
    // `msm:shape` can collide as a wrong full cube.
    if (data.type !== undefined && !(SHAPED_BLOCK_TYPES as readonly Json[]).includes(data.type)) {
      continue;
    }
    if (record(data.components)?.[SHAPE_COMPONENT] !== undefined) continue;
    const model = data.model;
    if (typeof model !== 'string' || !models.has(model)) continue;
    const reason = notCubeReason(model, models);
    if (reason === undefined) continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.model-not-cube',
      elementId: element.id,
      path: '/model',
      message: `Model "${model}" is not a full cube (${reason}), but this block has no shape, so it collides and hides its neighbours' faces as a full cube. Give the block a shape (a preset, or "From model"), or use a cube model.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Triggers (ADR 0061)

/** Kind id of mobs, contributed by `@msm/plugin-entities`: its `msm:on_tick` repeats too. */
const ENTITY_KIND = 'msm:entity';

function whileWornWithoutArmor(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== ITEM_KIND) continue;
    const components = record(dataOf(element).components);
    if (components?.['msm:while_worn'] === undefined || components['msm:armor'] !== undefined) {
      continue;
    }
    problems.push({
      severity: 'error',
      code: 'blocks-items.while-worn-without-armor',
      elementId: element.id,
      path: pointer('components', 'msm:while_worn'),
      message:
        '"msm:while_worn" fires while the item is worn in its armour slot, but this item has no "msm:armor", so it can never be worn. Add "msm:armor" or use "msm:while_held" instead.',
    });
  }
  return problems;
}

const isFullCubeBox = (box: Json | undefined): boolean =>
  Array.isArray(box) && box.length === 6 && box.every((value, i) => value === FULL_CUBE[i]);

/**
 * Whether an entity can be inside a block once lowered (ADR 0061 D2): its shape is not the
 * single full cube, or it is walk-through (`collision: false`).
 */
export function canContainEntities(data: Json | undefined): boolean {
  const shape = shapeOf(data);
  if (shape === undefined) return false;
  const lowered = structuredClone(shape);
  lowerShapeInPlace(lowered);
  if (lowered.collision === false) return true;
  const boxes = lowered.boxes;
  if (!Array.isArray(boxes) || boxes.length === 0) return false;
  return !(boxes.length === 1 && isFullCubeBox(boxes[0]));
}

function entityInsideSolidBlocks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== BLOCK_KIND) continue;
    const data = dataOf(element);
    if (record(data.components)?.['msm:on_entity_inside'] === undefined) continue;
    if (canContainEntities(data)) continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.entity-inside-solid-block',
      elementId: element.id,
      path: pointer('components', 'msm:on_entity_inside'),
      message:
        'This block is a full solid cube, so no entity can be inside it and "msm:on_entity_inside" never fires. Give the block a smaller shape (for example the "carpet" or "slab_bottom" preset) or make it walk-through.',
    });
  }
  return problems;
}

/** The repeating triggers with an interval, per kind: `[component, interval field]`. */
const TICK_TRIGGERS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  [ITEM_KIND]: [
    ['msm:while_held', 'interval_ticks'],
    ['msm:while_worn', 'interval_ticks'],
  ],
  [BLOCK_KIND]: [['msm:on_entity_inside', 'cooldown_ticks']],
  [ENTITY_KIND]: [['msm:on_tick', 'interval_ticks']],
};

/** The interval a repeating trigger defaults to (ADR 0061 D4). */
const DEFAULT_TICK_INTERVAL = 20;
/** Actions whose cost makes a fast trigger worth an info (ADR 0061 D4). */
const COSTLY_ACTIONS: ReadonlySet<string> = new Set(['run_function', 'run_script']);

/**
 * The first costly action type that `event` runs, following `trigger_event` actions within
 * the element, or `undefined`.
 */
function costlyAction(events: JsonObject, event: string): string | undefined {
  const seen = new Set<string>();
  const queue = [event];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    const actions = record(events[name])?.actions;
    if (!Array.isArray(actions)) continue;
    for (const action of actions) {
      const type = record(action)?.type;
      if (typeof type !== 'string') continue;
      const bare = type.startsWith('msm:') ? type.slice('msm:'.length) : type;
      if (COSTLY_ACTIONS.has(bare)) return bare;
      const next = record(action)?.event;
      if (bare === 'trigger_event' && typeof next === 'string') queue.push(next);
    }
  }
  return undefined;
}

function fastTickTriggers(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    const triggers = TICK_TRIGGERS[element.kind];
    if (triggers === undefined) continue;
    const data = dataOf(element);
    const components = record(data.components);
    const events = record(data.events) ?? {};
    for (const [component, field] of triggers) {
      const trigger = record(components?.[component]);
      const interval = trigger?.[field];
      const event = trigger?.event;
      if (typeof interval !== 'number' || interval >= DEFAULT_TICK_INTERVAL) continue;
      if (typeof event !== 'string') continue;
      const action = costlyAction(events, event);
      if (action === undefined) continue;
      problems.push({
        severity: 'info',
        code: 'blocks-items.fast-tick-trigger',
        elementId: element.id,
        path: pointer('components', component, field),
        message: `"${component}" fires every ${interval} ticks and its event runs "${action}", which costs more than other actions. With many of these in the world the game can slow down; consider ${DEFAULT_TICK_INTERVAL} ticks or more.`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Additions to vanilla content (ADR 0060)

/** Kind id of biomes, contributed by `@msm/plugin-worldgen`. */
const BIOME_KIND = 'minecraft:worldgen/biome';

function spawnGroupSizes(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== BIOME_ADDITION_KIND) continue;
    const spawns = dataOf(element).spawns;
    if (!Array.isArray(spawns)) continue;
    spawns.forEach((spawn, index) => {
      const min = record(spawn)?.min_group;
      const max = record(spawn)?.max_group;
      if (typeof min !== 'number' || typeof max !== 'number' || max >= min) return;
      problems.push({
        severity: 'error',
        code: 'blocks-items.spawn-group-size',
        elementId: element.id,
        path: pointer('spawns', index, 'max_group'),
        message: `The largest group (${max}) is smaller than the smallest group (${min}), so the game rejects this spawn. Make "max_group" at least ${min}.`,
      });
    });
  }
  return problems;
}

/** Every placed feature id a project biome lists, in any step (tags and inline ones skipped). */
function biomeFeatureIds(biome: Element): Set<string> {
  const ids = new Set<string>();
  const steps = dataOf(biome).features;
  if (!Array.isArray(steps)) return ids;
  for (const step of steps) {
    if (!Array.isArray(step)) continue;
    for (const entry of step) {
      if (typeof entry === 'string' && !entry.startsWith('#')) ids.add(namespacedId(entry));
    }
  }
  return ids;
}

function duplicateBiomeFeatures(elements: readonly Element[]): Problem[] {
  const biomes = new Map<string, Set<string>>(
    elements
      .filter((element) => element.kind === BIOME_KIND)
      .map((element) => [element.id, biomeFeatureIds(element)]),
  );
  if (biomes.size === 0) return [];
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== BIOME_ADDITION_KIND) continue;
    const data = dataOf(element);
    const named = Array.isArray(data.biomes)
      ? data.biomes.filter(
          (biome): biome is string => typeof biome === 'string' && !biome.startsWith('#'),
        )
      : [];
    const features = Array.isArray(data.features) ? data.features : [];
    features.forEach((entry, index) => {
      const feature = record(entry)?.feature;
      if (typeof feature !== 'string') return;
      const id = namespacedId(feature);
      for (const biome of named) {
        if (biomes.get(namespacedId(biome))?.has(id) !== true) continue;
        problems.push({
          severity: 'warning',
          code: 'blocks-items.duplicate-biome-feature',
          elementId: element.id,
          path: pointer('features', index, 'feature'),
          message: `Biome "${namespacedId(biome)}" of this project already lists "${id}", and this addition adds it to that biome again, so it generates twice. Remove it from the biome or from this addition.`,
        });
      }
    });
  }
  return problems;
}

/** Why a loot pool cannot be decoded, or `undefined` when its outline is sound. */
function badPoolReason(pool: Json): { path: (string | number)[]; reason: string } | undefined {
  const fields = record(pool);
  if (fields === undefined) return { path: [], reason: 'a pool must be an object' };
  const rolls = fields.rolls;
  if (rolls === undefined) return { path: [], reason: 'the pool has no "rolls"' };
  if (typeof rolls !== 'number' && record(rolls) === undefined) {
    return { path: ['rolls'], reason: '"rolls" must be a number or a number provider' };
  }
  const entries = fields.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return { path: ['entries'], reason: '"entries" must be a list with at least one entry' };
  }
  for (const [index, entry] of entries.entries()) {
    if (typeof record(entry)?.type !== 'string') {
      return { path: ['entries', index], reason: 'every entry needs a "type"' };
    }
  }
  return undefined;
}

const ITEM_ENTRY_TYPES: ReadonlySet<string> = new Set(['item', 'minecraft:item']);

function lootAdditionPools(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  const checkItems = registry.ids('item').length > 0;
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== LOOT_ADDITION_KIND) continue;
    const pools = dataOf(element).pools;
    if (!Array.isArray(pools)) continue;
    pools.forEach((pool, index) => {
      const bad = badPoolReason(pool);
      if (bad !== undefined) {
        problems.push({
          severity: 'error',
          code: 'blocks-items.bad-loot-pool',
          elementId: element.id,
          path: pointer('pools', index, ...bad.path),
          message: `This pool cannot be added: ${bad.reason}. The game skips it and logs an error.`,
        });
        return;
      }
      if (!checkItems) return;
      const entries = record(pool)?.entries as Json[];
      entries.forEach((entry, entryIndex) => {
        const fields = record(entry);
        const name = fields?.name;
        if (!ITEM_ENTRY_TYPES.has(fields?.type as string) || typeof name !== 'string') return;
        if (registry.has('item', namespacedId(name))) return;
        problems.push({
          severity: 'warning',
          code: 'blocks-items.unknown-loot-item',
          elementId: element.id,
          path: pointer('pools', index, 'entries', entryIndex, 'name'),
          message: `Item "${name}" is neither a vanilla item nor an item of this project, so this entry drops nothing. Pick an existing item.`,
        });
      });
    });
  }
  return problems;
}

const potions = (elements: readonly Element[]): Element[] =>
  elements.filter((element) => element.kind === POTION_KIND && isRecord(element.data));

/** Ids written without a namespace mean `minecraft:`. */
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

function potionEffectsMissing(
  elements: readonly Element[],
  registry: ValidationRegistry,
): Problem[] {
  if (registry.ids('mob_effect').length === 0) return [];
  const projectEffects = new Set(
    elements.filter((element) => element.kind === EFFECT_KIND).map((element) => element.id),
  );
  const problems: Problem[] = [];
  for (const element of potions(elements)) {
    const effects = dataOf(element).effects;
    if (!Array.isArray(effects)) continue;
    effects.forEach((effect, index) => {
      const id = record(effect)?.id;
      if (typeof id !== 'string' || id.length === 0) return;
      const full = namespaced(id);
      if (projectEffects.has(full as Element['id']) || registry.has('mob_effect', full)) return;
      problems.push({
        severity: 'error',
        code: 'blocks-items.potion-effect-missing',
        elementId: element.id,
        path: pointer('effects', index, 'id'),
        message: `The effect "${id}" is neither a vanilla effect nor one of this project's effects. The game skips the whole potion. Pick an existing effect or make "${id}" as a status effect.`,
      });
    });
  }
  return problems;
}

const STEP_PATHS: Readonly<Record<BrewingStep['source'], string>> = {
  brewing: pointer('brewing', 'reagent'),
  long: pointer('long'),
  strong: pointer('strong'),
  splash: pointer('splash'),
  lingering: pointer('lingering'),
};

const BOTTLE_NAMES: Readonly<Record<BrewingStep['inputBottle'], string>> = {
  potion: 'potion',
  splash_potion: 'splash potion',
  lingering_potion: 'lingering potion',
};

function potionDuplicateBrewing(elements: readonly Element[]): Problem[] {
  const seen = new Map<string, { element: Element; step: BrewingStep }>();
  const reported = new Set<string>();
  const problems: Problem[] = [];
  for (const element of potions(elements)) {
    let steps: BrewingStep[];
    try {
      steps = potionBrewingSteps(element);
    } catch {
      continue;
    }
    for (const step of steps) {
      // Conversions clash only when version ids do: `potion-id-collision` reports that.
      if (step.source === 'splash' || step.source === 'lingering') continue;
      const key = `${step.inputBottle}|${namespaced(step.input)}|${namespaced(step.reagent)}`;
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, { element, step });
        continue;
      }
      const path = STEP_PATHS[step.source];
      if (reported.has(`${element.id}|${path}`)) continue;
      reported.add(`${element.id}|${path}`);
      const other =
        first.element.id === element.id
          ? `its own ${first.step.source} step`
          : `"${first.element.id}"`;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.potion-duplicate-brewing',
        elementId: element.id,
        path,
        message: `Adding "${step.reagent}" to a ${BOTTLE_NAMES[step.inputBottle]} of "${step.input}" already brews ${other}, so the brewing stand makes only one of them. Use a different ingredient or base potion.`,
      });
    }
  }
  return problems;
}

function potionIdCollisions(elements: readonly Element[]): Problem[] {
  const ids = new Set<string>(potions(elements).map((element) => element.id));
  const problems: Problem[] = [];
  for (const element of potions(elements)) {
    let variants: string[];
    try {
      variants = potionVariantIds(element).slice(1);
    } catch {
      continue;
    }
    for (const id of variants) {
      if (!ids.has(id)) continue;
      const field = id.slice(id.indexOf(':') + 1).startsWith('long_') ? 'long' : 'strong';
      problems.push({
        severity: 'error',
        code: 'blocks-items.potion-id-collision',
        elementId: element.id,
        path: pointer(field),
        message: `The ${field === 'long' ? 'longer' : 'stronger'} version of this potion gets the id "${id}", which another potion already has. Rename one of the two potions.`,
      });
    }
  }
  return problems;
}

const DEFINITION_KINDS = [BLOCK_KIND, ITEM_KIND] as const;
const EVENT_KINDS = [BLOCK_KIND, ITEM_KIND, EFFECT_KIND] as const;

export const blocksItemsValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.missing-model',
    kinds: DEFINITION_KINDS,
    validate: ({ elements }) => missingModels(elements),
  },
  {
    id: 'msm.blocks-items.missing-pull-model',
    kinds: [ITEM_KIND, MODEL_KIND],
    validate: ({ elements, target }) =>
      target.items?.rangedPull === undefined ? [] : missingPullModels(elements),
  },
  {
    id: 'msm.blocks-items.passthrough-needs-data-pack',
    kinds: [ITEM_KIND],
    validate: ({ elements, target }) => {
      const facts = target.items?.dataPackComponents;
      return facts === undefined ? [] : passthroughNeedsDataPack(elements, facts);
    },
  },
  {
    id: 'msm.blocks-items.model-not-cube',
    kinds: [BLOCK_KIND, MODEL_KIND],
    validate: ({ elements }) => modelsNotCube(elements),
  },
  {
    id: 'msm.blocks-items.unknown-event',
    kinds: EVENT_KINDS,
    validate: ({ elements }) => unknownEvents(elements),
  },
  {
    id: 'msm.blocks-items.event-cycle',
    kinds: EVENT_KINDS,
    validate: ({ elements }) => eventCycles(elements),
  },
  {
    id: 'msm.blocks-items.mod-id',
    kinds: [MOD_KIND],
    validate: ({ elements }) => badModIds(elements),
  },
  {
    id: 'msm.blocks-items.tool-tier',
    kinds: DEFINITION_KINDS,
    validate: ({ elements, registry, target }) => unknownToolTiers(elements, registry, target.id),
  },
  {
    id: 'msm.blocks-items.item-collision',
    kinds: DEFINITION_KINDS,
    validate: ({ elements }) => itemCollisions(elements),
  },
  {
    id: 'msm.blocks-items.armor-material',
    kinds: [ITEM_KIND],
    validate: ({ elements, target }) =>
      unknownArmorMaterials(elements, target.items?.armorMaterials, target.id),
  },
  {
    id: 'msm.blocks-items.equipment-asset',
    kinds: [ITEM_KIND, EQUIPMENT_KIND],
    validate: ({ elements, registry }) => unknownEquipmentAssets(elements, registry),
  },
  {
    id: 'msm.blocks-items.component-conflict',
    kinds: DEFINITION_KINDS,
    validate: ({ elements }) => componentConflicts(elements),
  },
  {
    id: 'msm.blocks-items.while-worn',
    kinds: [ITEM_KIND],
    validate: ({ elements }) => whileWornWithoutArmor(elements),
  },
  {
    id: 'msm.blocks-items.entity-inside',
    kinds: [BLOCK_KIND],
    validate: ({ elements }) => entityInsideSolidBlocks(elements),
  },
  {
    id: 'msm.blocks-items.fast-tick-trigger',
    kinds: [BLOCK_KIND, ITEM_KIND, ENTITY_KIND],
    validate: ({ elements }) => fastTickTriggers(elements),
  },
  {
    id: 'msm.blocks-items.spawn-group-size',
    kinds: [BIOME_ADDITION_KIND],
    validate: ({ elements }) => spawnGroupSizes(elements),
  },
  {
    id: 'msm.blocks-items.duplicate-biome-feature',
    kinds: [BIOME_ADDITION_KIND, BIOME_KIND],
    validate: ({ elements }) => duplicateBiomeFeatures(elements),
  },
  {
    id: 'msm.blocks-items.loot-pool',
    kinds: [LOOT_ADDITION_KIND],
    validate: ({ elements, registry }) => lootAdditionPools(elements, registry),
  },
  {
    id: 'msm.blocks-items.potion-effect',
    kinds: [POTION_KIND, EFFECT_KIND],
    validate: ({ elements, registry }) => potionEffectsMissing(elements, registry),
  },
  {
    id: 'msm.blocks-items.potion-brewing',
    kinds: [POTION_KIND],
    validate: ({ elements }) => potionDuplicateBrewing(elements),
  },
  {
    id: 'msm.blocks-items.potion-id',
    kinds: [POTION_KIND],
    validate: ({ elements }) => potionIdCollisions(elements),
  },
] satisfies ProjectValidator[]);
