/**
 * `blocks-items.*` project validators for containers (ADR 0074 D8) and machines (ADR 0075 D9).
 * They read the element data, the target's block facts (`containerSounds`,
 * `machineRecipeTypes`, plugin API 1.12.0; a check that needs an absent fact is skipped) and
 * the registry index. `msm:container` or `msm:machine` on a type that takes neither is
 * `blocks-items.component-not-for-type` (`validators-types.ts`).
 *
 * - `blocks-items.container-layout-fields` (error): `rows` outside the `chest` layout or `size`
 *   outside `none` (the schema reports them too; this names the layout that takes them).
 * - `blocks-items.keep-contents-layout` (error): `keep_contents` without a 3-row `chest`
 *   layout; the runtime turns the option off and drops the contents.
 * - `blocks-items.container-sound-unknown` (warning): an `open_sound` or `close_sound` that is
 *   neither a vanilla sound event nor an event key of the project's `sounds.json` (project keys
 *   count as sound events in MSM elements, ADR 0057 D3).
 * - `blocks-items.container-event-unknown` (error): an `on_open` or `on_close` event the
 *   element does not declare in `events`.
 * - `blocks-items.machine-and-container` (error): both components on one block; the runtime
 *   keeps the machine and drops the container.
 * - `blocks-items.machine-recipe-type-unknown` (error): a `recipe_types` entry that is neither
 *   the machine's own id, another project machine nor a type the target lists.
 * - `blocks-items.machine-recipe-item-unknown` (error): an ingredient or result item of a
 *   machine recipe that is neither vanilla nor a project item (tags are the schema's).
 * - `blocks-items.machine-without-recipes` (warning): a machine that takes its own recipe type
 *   but has no recipe of it in the project (its `recipes`, or a recipe element with that type).
 * - `blocks-items.machine-fuel-unused` (info): a `redstone` or `always` machine with
 *   `hoppers: true` set: it burns no fuel, so the fuel slot and the side hoppers do nothing.
 * - `blocks-items.machine-time-range` (warning): a recipe (or `default_time`) whose time at the
 *   machine's `speed` is above 32767 ticks, which the screen cannot show (16-bit menu data).
 * - `blocks-items.machine-event-unknown` (error): an `on_start` or `on_finish` event the
 *   element does not declare in `events`.
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
import { machineRecipeEntries, machineRecipeResultId } from './lowering/machine-recipes';
import { isRecord, splitResourceLocation } from './lowering/paths';
import {
  BLOCK_TYPES,
  type BlockTypeName,
  CONTAINER_BLOCK_TYPES,
  CONTAINER_COMPONENT,
  containerOf,
  MACHINE_COMPONENT,
  machineOf,
} from './lowering/types';

/** Every code the container and machine validators report. */
export const CONTAINER_PROBLEM_CODES = Object.freeze([
  'blocks-items.container-layout-fields',
  'blocks-items.keep-contents-layout',
  'blocks-items.container-sound-unknown',
  'blocks-items.container-event-unknown',
  'blocks-items.machine-and-container',
  'blocks-items.machine-recipe-type-unknown',
  'blocks-items.machine-recipe-item-unknown',
  'blocks-items.machine-without-recipes',
  'blocks-items.machine-fuel-unused',
  'blocks-items.machine-time-range',
  'blocks-items.machine-event-unknown',
] as const);

/** The largest time a furnace screen can show: menu data are shorts (ADR 0075 D12). */
export const MAX_MACHINE_TICKS = 32767;
/** A machine's `default_time` when absent: a furnace's (ADR 0075 D1). */
const DEFAULT_MACHINE_TIME = 200;
const DEFAULT_CHEST_ROWS = 3;

const SOUNDS_KIND = 'minecraft:sounds';
const RECIPE_KIND = 'minecraft:recipe';
const SOUND_EVENT_REGISTRY = 'sound_event';
const WEIGHED_SOUND_EVENT_REGISTRY = 'weighed_sound_event';

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');
const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
const quoted = (values: readonly string[]): string =>
  values.map((value) => `"${value}"`).join(', ');

/** A project block with the component it is checked for. */
interface ComponentBlock {
  element: Element;
  data: JsonObject;
  component: JsonObject;
}

const blockElements = (elements: readonly Element[]): Element[] =>
  elements.filter((element) => element.kind === BLOCK_KIND);

/** Whether a block's `type` takes containers and machines (absent `type` is `block`). */
function takesComponents(data: JsonObject): boolean {
  const type = data.type ?? 'block';
  return (
    typeof type === 'string' &&
    (BLOCK_TYPES as readonly string[]).includes(type) &&
    CONTAINER_BLOCK_TYPES.includes(type as BlockTypeName)
  );
}

/** Blocks with an `msm:container`, on any type (the type check is its own code). */
const containers = (elements: readonly Element[]): ComponentBlock[] =>
  blockElements(elements).flatMap((element) => {
    const data = dataOf(element);
    const component = containerOf(data);
    return component === undefined ? [] : [{ element, data, component }];
  });

/** Blocks with an `msm:machine`, on any type. */
const machines = (elements: readonly Element[]): ComponentBlock[] =>
  blockElements(elements).flatMap((element) => {
    const data = dataOf(element);
    const component = machineOf(data);
    return component === undefined ? [] : [{ element, data, component }];
  });

const declaredEvents = (data: JsonObject): Set<string> =>
  new Set(Object.keys(isRecord(data.events) ? data.events : {}));

/** The event fields of `component` that name no declared event. */
function unknownEventFields(
  blocks: readonly ComponentBlock[],
  componentId: string,
  fields: readonly string[],
  code: string,
): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data, component } of blocks) {
    const declared = declaredEvents(data);
    for (const field of fields) {
      const event = text(component[field]);
      if (event === undefined || declared.has(event)) continue;
      problems.push({
        severity: 'error',
        code,
        elementId: element.id,
        path: pointer('components', componentId, field),
        message: `Event "${event}" is not declared in this block's "events", so "${field}" does nothing. Add it there or pick an existing event.`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Containers (ADR 0074 D1, D6, D8)

function layoutOf(component: JsonObject): string {
  return typeof component.layout === 'string' ? component.layout : 'chest';
}

function containerLayoutFields(blocks: readonly ComponentBlock[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, component } of blocks) {
    const layout = layoutOf(component);
    const wrong: [string, string][] = [];
    if (component.rows !== undefined && layout !== 'chest') wrong.push(['rows', 'chest']);
    if (component.size !== undefined && layout !== 'none') wrong.push(['size', 'none']);
    for (const [field, owner] of wrong) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.container-layout-fields',
        elementId: element.id,
        path: pointer('components', CONTAINER_COMPONENT, field),
        message: `"${field}" belongs to the "${owner}" layout, but this container's layout is "${layout}". Remove "${field}", or change the layout to "${owner}".`,
      });
    }
  }
  return problems;
}

function keepContentsLayout(blocks: readonly ComponentBlock[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, component } of blocks) {
    if (component.keep_contents !== true) continue;
    const layout = layoutOf(component);
    const rows = component.rows ?? DEFAULT_CHEST_ROWS;
    if (layout === 'chest' && rows === DEFAULT_CHEST_ROWS) continue;
    const shape = layout === 'chest' ? `a chest of ${String(rows)} rows` : `the "${layout}" layout`;
    problems.push({
      severity: 'error',
      code: 'blocks-items.keep-contents-layout',
      elementId: element.id,
      path: pointer('components', CONTAINER_COMPONENT, 'keep_contents'),
      message: `Keeping the contents needs a chest of 3 rows (the shulker box screen), not ${shape}; the game turns the option off and drops the contents. Use the chest layout with 3 rows, or turn "keep_contents" off.`,
    });
  }
  return problems;
}

/** The project's sound event keys: `<ns>:<key>` for every key of a `minecraft:sounds` element. */
function projectSoundKeys(elements: readonly Element[]): Set<string> {
  const keys = new Set<string>();
  for (const element of elements) {
    if (element.kind !== SOUNDS_KIND || !isRecord(element.data)) continue;
    const colon = element.id.indexOf(':');
    const namespace = colon < 0 ? 'minecraft' : element.id.slice(0, colon);
    for (const key of Object.keys(element.data)) {
      if (key !== '') keys.add(`${namespace}:${key}`);
    }
  }
  return keys;
}

function containerSounds(
  blocks: readonly ComponentBlock[],
  elements: readonly Element[],
  registry: ValidationRegistry,
): Problem[] {
  if (registry.ids(SOUND_EVENT_REGISTRY).length === 0) return [];
  const projectKeys = projectSoundKeys(elements);
  const known = (id: string): boolean =>
    projectKeys.has(id) ||
    registry.has(SOUND_EVENT_REGISTRY, id) ||
    registry.has(WEIGHED_SOUND_EVENT_REGISTRY, id);
  const problems: Problem[] = [];
  for (const { element, component } of blocks) {
    for (const field of ['open_sound', 'close_sound']) {
      const sound = text(component[field]);
      if (sound === undefined || known(namespaced(sound))) continue;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.container-sound-unknown',
        elementId: element.id,
        path: pointer('components', CONTAINER_COMPONENT, field),
        message: `Sound "${sound}" is neither a vanilla sound event nor a sound of this project, so the container plays nothing there. Pick an existing sound.`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Machines (ADR 0075 D1, D2, D9)

function machinesAndContainers(blocks: readonly ComponentBlock[]): Problem[] {
  return blocks
    .filter(({ data }) => containerOf(data) !== undefined)
    .map(({ element }) => ({
      severity: 'error' as const,
      code: 'blocks-items.machine-and-container',
      elementId: element.id,
      path: pointer('components', CONTAINER_COMPONENT),
      message:
        'A block cannot be both a machine and a container: the game keeps the machine and drops "msm:container". Remove one of them.',
    }));
}

/** A machine's `recipe_types` strings, or its own id when absent. */
function recipeTypesOf(element: Element, component: JsonObject): string[] {
  const types = component.recipe_types;
  if (!Array.isArray(types)) return [element.id];
  return types.filter((type): type is string => typeof type === 'string');
}

function unknownRecipeTypes(blocks: readonly ComponentBlock[], target: TargetFacts): Problem[] {
  const machineIds = new Set<string>(
    blocks.filter(({ data }) => takesComponents(data)).map(({ element }) => element.id),
  );
  const facts = target.blocks?.machineRecipeTypes;
  const problems: Problem[] = [];
  for (const { element, component } of blocks) {
    const types = component.recipe_types;
    if (!Array.isArray(types)) continue;
    types.forEach((type, index) => {
      if (typeof type !== 'string') return;
      const id = namespaced(type);
      if (id === element.id || machineIds.has(id)) return;
      if (facts === undefined || facts.includes(id)) return;
      problems.push({
        severity: 'error',
        code: 'blocks-items.machine-recipe-type-unknown',
        elementId: element.id,
        path: pointer('components', MACHINE_COMPONENT, 'recipe_types', index),
        message: `Recipe type "${type}" is neither this machine, another machine of this project nor a cooking type the game offers machines (${quoted(facts)}), so the game cannot start. Pick one of those.`,
      });
    });
  }
  return problems;
}

/** The item ids a project defines: items and every block's item. */
function projectItems(elements: readonly Element[]): Set<string> {
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.kind === ITEM_KIND) ids.add(element.id);
    if (element.kind === BLOCK_KIND) {
      const itemId = blockItemId(element);
      if (itemId !== undefined) ids.add(itemId);
    }
  }
  return ids;
}

/** The plain item ids of an ingredient with their JSON pointer keys (tags are skipped). */
function ingredientItems(ingredient: Json | undefined): [string, (string | number)[]][] {
  if (typeof ingredient === 'string') {
    return ingredient.startsWith('#') || ingredient.length === 0 ? [] : [[ingredient, []]];
  }
  if (!Array.isArray(ingredient)) return [];
  return ingredient.flatMap((entry, index): [string, (string | number)[]][] =>
    typeof entry === 'string' && entry.length > 0 && !entry.startsWith('#')
      ? [[entry, [index]]]
      : [],
  );
}

function unknownRecipeItems(
  blocks: readonly ComponentBlock[],
  elements: readonly Element[],
  registry: ValidationRegistry,
): Problem[] {
  if (registry.ids('item').length === 0) return [];
  const project = projectItems(elements);
  const known = (id: string): boolean =>
    project.has(namespaced(id)) || registry.has('item', namespaced(id));
  const problems: Problem[] = [];
  for (const { element, data } of blocks) {
    machineRecipeEntries(data).forEach((entry, index) => {
      const references: [string, (string | number)[]][] = ingredientItems(entry.ingredient).map(
        ([id, keys]) => [id, ['ingredient', ...keys]],
      );
      const result = machineRecipeResultId(entry);
      if (result !== undefined) {
        references.push([result, typeof entry.result === 'string' ? ['result'] : ['result', 'id']]);
      }
      for (const [id, keys] of references) {
        if (known(id)) continue;
        problems.push({
          severity: 'error',
          code: 'blocks-items.machine-recipe-item-unknown',
          elementId: element.id,
          path: pointer('recipes', index, ...keys),
          message: `Item "${id}" is neither a vanilla item nor an item of this project, so the game cannot load this recipe. Pick an existing item.`,
        });
      }
    });
  }
  return problems;
}

function machinesWithoutRecipes(
  blocks: readonly ComponentBlock[],
  elements: readonly Element[],
): Problem[] {
  const recipeTypes = new Set<string>();
  for (const element of elements) {
    if (element.kind !== RECIPE_KIND) continue;
    const type = text(dataOf(element).type);
    if (type !== undefined) recipeTypes.add(namespaced(type));
  }
  for (const { element, data } of blocks) {
    if (machineRecipeEntries(data).length > 0) recipeTypes.add(element.id);
  }
  return blocks
    .filter(({ element, component }) => {
      const types = recipeTypesOf(element, component).map(namespaced);
      return types.includes(element.id) && !recipeTypes.has(element.id);
    })
    .map(({ element }) => ({
      severity: 'warning' as const,
      code: 'blocks-items.machine-without-recipes',
      elementId: element.id,
      path: pointer('components', MACHINE_COMPONENT),
      message:
        'This machine takes its own recipes, but the project has none, so it can only process what its other recipe types offer. Add recipes, or list only vanilla recipe types.',
    }));
}

function fuelUnused(blocks: readonly ComponentBlock[]): Problem[] {
  return blocks
    .filter(
      ({ component }) =>
        (component.power === 'redstone' || component.power === 'always') &&
        component.hoppers === true,
    )
    .map(({ element, component }) => ({
      severity: 'info' as const,
      code: 'blocks-items.machine-fuel-unused',
      elementId: element.id,
      path: pointer('components', MACHINE_COMPONENT, 'hoppers'),
      message: `A machine powered by ${component.power === 'redstone' ? 'a redstone signal' : 'nothing ("always")'} burns no fuel: its fuel slot stays unused, and hoppers at its sides put nothing in. Hoppers above and below still work.`,
    }));
}

function timeRanges(blocks: readonly ComponentBlock[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data, component } of blocks) {
    const speed = typeof component.speed === 'number' && component.speed > 0 ? component.speed : 1;
    const defaultTime =
      typeof component.default_time === 'number' ? component.default_time : DEFAULT_MACHINE_TIME;
    const ticks = (time: number): number => Math.ceil(time / speed);
    const message = (time: number): string =>
      `At speed ${String(speed)} this takes ${String(ticks(time))} ticks, more than the ${String(MAX_MACHINE_TICKS)} a furnace screen can show, so its arrow is drawn wrong. Shorten the time or raise the speed.`;
    if (ticks(defaultTime) > MAX_MACHINE_TICKS) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.machine-time-range',
        elementId: element.id,
        path: pointer('components', MACHINE_COMPONENT, 'default_time'),
        message: message(defaultTime),
      });
    }
    machineRecipeEntries(data).forEach((entry, index) => {
      if (typeof entry.time !== 'number' || ticks(entry.time) <= MAX_MACHINE_TICKS) return;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.machine-time-range',
        elementId: element.id,
        path: pointer('recipes', index, 'time'),
        message: message(entry.time),
      });
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------

/** Whether `id` is a valid resource location (other checks report bad element ids). */
const validId = (id: string): boolean => {
  try {
    splitResourceLocation(id);
    return true;
  } catch {
    return false;
  }
};

export const containerValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.containers',
    kinds: [BLOCK_KIND, SOUNDS_KIND],
    validate: ({ elements, registry }) => {
      const blocks = containers(elements);
      return [
        ...containerLayoutFields(blocks),
        ...keepContentsLayout(blocks),
        ...containerSounds(blocks, elements, registry),
        ...unknownEventFields(
          blocks,
          CONTAINER_COMPONENT,
          ['on_open', 'on_close'],
          'blocks-items.container-event-unknown',
        ),
      ];
    },
  },
  {
    id: 'msm.blocks-items.machines',
    kinds: [BLOCK_KIND, ITEM_KIND, RECIPE_KIND],
    validate: ({ elements, target, registry }) => {
      const blocks = machines(elements).filter(({ element }) => validId(element.id));
      return [
        ...machinesAndContainers(blocks),
        ...unknownRecipeTypes(blocks, target),
        ...unknownRecipeItems(blocks, elements, registry),
        ...machinesWithoutRecipes(blocks, elements),
        ...fuelUnused(blocks),
        ...timeRanges(blocks),
        ...unknownEventFields(
          blocks,
          MACHINE_COMPONENT,
          ['on_start', 'on_finish'],
          'blocks-items.machine-event-unknown',
        ),
      ];
    },
  },
] satisfies ProjectValidator[]);
