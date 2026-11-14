/**
 * Pure helpers of the Block Studio's Inventory section (B318, ADR 0076 D1; format ADR 0074 D1
 * and ADR 0075 D1, D8): what the block holds (nothing, storage or a machine), switching in one
 * edit, the container layouts and their own fields, the machine's recipe types and screen
 * default, seconds shown and ticks saved, and the element's `recipes` table. No React, no
 * session.
 *
 * Which types take the components, the component ids and the recipe entry readers come from
 * `@msm/plugin-blocks-items`; the vanilla recipe types a machine may also take come from the
 * target (`Target.blocks.machineRecipeTypes`), so nothing version-specific is restated here.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import {
  type BlockTypeName,
  CONTAINER_BLOCK_TYPES,
  CONTAINER_COMPONENT,
  MACHINE_COMPONENT,
  MACHINE_RECIPES_FIELD,
  machineRecipeEntries,
} from '@msm/plugin-blocks-items';
import { asObject } from './blocks-items-model';

type JsonObject = { [key: string]: Json };

/** What a block holds: nothing, items in a screen (`msm:container`) or a machine (`msm:machine`). */
export type InventoryKind = 'none' | 'storage' | 'machine';

/** The "Holds items" choices in the picker's order. */
export const INVENTORY_KINDS: readonly InventoryKind[] = Object.freeze([
  'none',
  'storage',
  'machine',
]);

/** Each choice of "Holds items" in words (ADR 0076 D1). */
export const INVENTORY_KIND_LABELS: Readonly<Record<InventoryKind, string>> = Object.freeze({
  none: 'None',
  storage: 'Storage',
  machine: 'Machine',
});

/** The element path of the container component. */
export const CONTAINER_PATH: readonly string[] = Object.freeze(['components', CONTAINER_COMPONENT]);
/** The element path of the machine component. */
export const MACHINE_PATH: readonly string[] = Object.freeze(['components', MACHINE_COMPONENT]);
/** The element path of the machine recipes (editor-only, lowered to recipe files). */
export const RECIPES_PATH: readonly string[] = Object.freeze([MACHINE_RECIPES_FIELD]);

/** Whether blocks of `type` take the Inventory section (the `MsmBlock` family). */
export function takesInventory(type: BlockTypeName | undefined): boolean {
  return type !== undefined && CONTAINER_BLOCK_TYPES.includes(type);
}

/** What block data holds: a machine wins over a container, as the runtime keeps the machine. */
export function inventoryKindOf(data: Json | undefined): InventoryKind {
  const components = asObject(asObject(data).components);
  if (components[MACHINE_COMPONENT] !== undefined) return 'machine';
  if (components[CONTAINER_COMPONENT] !== undefined) return 'storage';
  return 'none';
}

/** The state look slots of each kind: the texture `front_<state>` and the model `<state>`. */
const STATE_OF: Readonly<Record<Exclude<InventoryKind, 'none'>, 'open' | 'lit'>> = {
  storage: 'open',
  machine: 'lit',
};

/** `object` without `key`; `undefined` when nothing is left. */
function without(object: JsonObject, key: string): JsonObject | undefined {
  const { [key]: _gone, ...rest } = object;
  return Object.keys(rest).length === 0 ? undefined : rest;
}

/**
 * The block data after choosing what it holds (ADR 0076 D1), as one edit: the chosen component
 * is added with its defaults (`{}`: a 3-row chest, or a fuel machine of its own recipes) and
 * the other one removed. Leaving a kind also removes what only that kind uses: the state look
 * (`textures.front_open` and `models.open` for storage, `front_lit` and `models.lit` for a
 * machine) and, for a machine, its `recipes`. Choosing the current kind changes nothing.
 */
export function withInventory(data: Json | undefined, kind: InventoryKind): JsonObject {
  const source = asObject(data);
  const current = inventoryKindOf(data);
  if (current === kind) return { ...source };
  const out: JsonObject = { ...source };
  const components: JsonObject = { ...asObject(source.components) };
  delete components[CONTAINER_COMPONENT];
  delete components[MACHINE_COMPONENT];
  if (kind === 'storage') components[CONTAINER_COMPONENT] = {};
  if (kind === 'machine') components[MACHINE_COMPONENT] = {};
  if (Object.keys(components).length === 0) delete out.components;
  else out.components = components;
  for (const left of ['storage', 'machine'] as const) {
    if (left === kind) continue;
    const state = STATE_OF[left];
    for (const [field, key] of [
      ['textures', `front_${state}`],
      ['models', state],
    ] as const) {
      const holder = asObject(out[field]);
      if (holder[key] === undefined) continue;
      const rest = without(holder, key);
      if (rest === undefined) delete out[field];
      else out[field] = rest;
    }
  }
  if (kind !== 'machine') delete out[MACHINE_RECIPES_FIELD];
  return out;
}

// Storage ----------------------------------------------------------------------------------

/** The container layouts (the format's `ContainerLayout`). */
export type ContainerLayoutName = 'chest' | 'hopper' | 'dispenser' | 'none';

/** The layouts in the picker's order. */
export const CONTAINER_LAYOUTS: readonly ContainerLayoutName[] = Object.freeze([
  'chest',
  'hopper',
  'dispenser',
  'none',
]);

/** Each layout in words (ADR 0076 D1). */
export const CONTAINER_LAYOUT_LABELS: Readonly<Record<ContainerLayoutName, string>> = Object.freeze(
  {
    chest: 'Chest',
    hopper: 'Hopper (5 slots)',
    dispenser: 'Dispenser (3 by 3)',
    none: 'No screen (holder)',
  },
);

/** The format's defaults: 3 rows, 1 holder slot. */
export const DEFAULT_ROWS = 3;
export const DEFAULT_HOLDER_SIZE = 1;
/** The rows a keep-contents chest needs (the shulker box screen, limit C12). */
export const KEEP_CONTENTS_ROWS = 3;

/** The layout of a container component: `chest` when absent or unknown. */
export function containerLayoutOf(container: Json | undefined): ContainerLayoutName {
  const layout = asObject(container).layout;
  return typeof layout === 'string' && (CONTAINER_LAYOUTS as readonly string[]).includes(layout)
    ? (layout as ContainerLayoutName)
    : 'chest';
}

/**
 * The container after choosing `layout`: the fields other layouts own go (`rows` and
 * `keep_contents` outside `chest`, `size` outside `none`); `chest` is written as no `layout`.
 */
export function withContainerLayout(
  container: Json | undefined,
  layout: ContainerLayoutName,
): JsonObject {
  const out: JsonObject = { ...asObject(container) };
  if (layout === 'chest') delete out.layout;
  else out.layout = layout;
  if (layout !== 'chest') {
    delete out.rows;
    delete out.keep_contents;
  }
  if (layout !== 'none') delete out.size;
  return out;
}

/** Whether "Keep contents when broken" is offered: a chest of 3 rows. */
export function offersKeepContents(container: Json | undefined): boolean {
  const rows = asObject(container).rows;
  return (
    containerLayoutOf(container) === 'chest' && (rows === undefined || rows === KEEP_CONTENTS_ROWS)
  );
}

/**
 * The container after setting `rows` (`undefined` clears it): `keep_contents` goes when the
 * chest no longer has 3 rows, since only the shulker box screen keeps contents.
 */
export function withRows(container: Json | undefined, rows: number | undefined): JsonObject {
  const out: JsonObject = { ...asObject(container) };
  if (rows === undefined) delete out.rows;
  else out.rows = rows;
  if (!offersKeepContents(out)) delete out.keep_contents;
  return out;
}

/**
 * A boolean field whose default is true (`hoppers`, `comparator`): written only as `false`, so
 * turning it back on removes it.
 */
export function withDefaultOn(component: Json | undefined, key: string, on: boolean): JsonObject {
  const out: JsonObject = { ...asObject(component) };
  if (on) delete out[key];
  else out[key] = false;
  return out;
}

// Machines ---------------------------------------------------------------------------------

/** The vanilla cooking types in words; a type the target lists without a word shows its id. */
export const RECIPE_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'minecraft:smelting': 'Smelting',
  'minecraft:blasting': 'Blasting',
  'minecraft:smoking': 'Smoking',
  'minecraft:campfire_cooking': 'Campfire cooking',
});

/** A recipe type in words. */
export function recipeTypeLabel(type: string): string {
  return RECIPE_TYPE_LABELS[type] ?? type;
}

/** The machine screens (the format's `MachineMenu`). */
export type MachineMenuName = 'furnace' | 'blast_furnace' | 'smoker';

export const MACHINE_MENU_LABELS: Readonly<Record<MachineMenuName, string>> = Object.freeze({
  furnace: 'Furnace',
  blast_furnace: 'Blast furnace',
  smoker: 'Smoker',
});

/** The machine power modes; `fuel` is the default. */
export const MACHINE_POWER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  fuel: 'Fuel',
  redstone: 'Redstone signal',
  always: 'Always',
});

/** What comparators read from a machine; `contents` is the default. */
export const MACHINE_COMPARATOR_LABELS: Readonly<Record<string, string>> = Object.freeze({
  contents: 'Contents',
  progress: 'Progress',
  none: 'Nothing',
});

/** The format's machine defaults. */
export const DEFAULT_MACHINE_TICKS = 200;
export const DEFAULT_LIT_LIGHT = 13;
export const DEFAULT_SPEED = 1;
/** The most recipe types a machine takes. */
export const MAX_RECIPE_TYPES = 5;

/** The recipe types a machine processes: its own id when `recipe_types` is absent. */
export function machineRecipeTypes(machine: Json | undefined, ownId: string): string[] {
  const types = asObject(machine).recipe_types;
  if (!Array.isArray(types)) return [ownId];
  return types.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * The machine after ticking (`on`) or unticking `type` in "Recipes it uses". The last type
 * cannot be unticked and a sixth is not added; the machine's own id alone is written as no
 * `recipe_types` (the default). Order: as listed, a new type at the end.
 */
export function withRecipeType(
  machine: Json | undefined,
  ownId: string,
  type: string,
  on: boolean,
): JsonObject {
  const out: JsonObject = { ...asObject(machine) };
  const current = machineRecipeTypes(machine, ownId);
  let next = current;
  if (on && !current.includes(type)) {
    if (current.length >= MAX_RECIPE_TYPES) return out;
    next = [...current, type];
  }
  if (!on) {
    if (current.length <= 1) return out;
    next = current.filter((entry) => entry !== type);
  }
  if (next.length === 1 && next[0] === ownId) delete out.recipe_types;
  else out.recipe_types = next;
  return out;
}

/**
 * The screen a machine opens without `menu`: the screen of its first vanilla cooking type
 * (blast furnace for blasting, smoker for smoking), otherwise the furnace.
 */
export function defaultMachineMenu(types: readonly string[]): MachineMenuName {
  for (const type of types) {
    if (type === 'minecraft:blasting') return 'blast_furnace';
    if (type === 'minecraft:smoking') return 'smoker';
    if (type in RECIPE_TYPE_LABELS) return 'furnace';
  }
  return 'furnace';
}

/**
 * A field with a default written only when it differs: `value` equal to `fallback` (or
 * `undefined`) removes `key`.
 */
export function withChoice(
  component: Json | undefined,
  key: string,
  value: Json | undefined,
  fallback: Json,
): JsonObject {
  const out: JsonObject = { ...asObject(component) };
  if (value === undefined || value === fallback) delete out[key];
  else out[key] = value;
  return out;
}

/** Seconds shown for `ticks` (20 a second). */
export function ticksToSeconds(ticks: number): number {
  return ticks / 20;
}

/** Ticks saved for `seconds`: rounded, at least 1. */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * 20));
}

// The recipes table ------------------------------------------------------------------------

/** The element's machine recipes, as the plugin reads them. */
export function recipeEntries(data: Json | undefined): JsonObject[] {
  return machineRecipeEntries(data) as JsonObject[];
}

/** A new, empty recipe row: an ingredient and a result to fill in. */
export function newMachineRecipe(): JsonObject {
  return { ingredient: '', result: '' };
}

/** The `recipes` list after adding a new row at the end. */
export function withRecipeAdded(data: Json | undefined): JsonObject[] {
  const recipes = asObject(data)[MACHINE_RECIPES_FIELD];
  return [...(Array.isArray(recipes) ? recipes : []), newMachineRecipe()] as JsonObject[];
}

/** The `recipes` list after removing row `index`; `undefined` when none is left. */
export function withRecipeRemoved(data: Json | undefined, index: number): JsonObject[] | undefined {
  const recipes = asObject(data)[MACHINE_RECIPES_FIELD];
  if (!Array.isArray(recipes)) return undefined;
  const next = recipes.filter((_, i) => i !== index) as JsonObject[];
  return next.length === 0 ? undefined : next;
}

/** An ingredient as text: an id, a `#tag`, or a list of ids joined by commas. */
export function ingredientText(ingredient: Json | undefined): string {
  if (typeof ingredient === 'string') return ingredient;
  if (Array.isArray(ingredient)) {
    return ingredient.filter((entry) => typeof entry === 'string').join(', ');
  }
  return '';
}

/** An ingredient from text: ids separated by commas become a list. */
export function ingredientFromText(text: string): Json {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 1 ? parts : (parts[0] ?? '');
}

/** The result item id of a recipe row (a bare id or `result.id`). */
export function resultIdOf(entry: Json | undefined): string {
  const result = asObject(entry).result;
  if (typeof result === 'string') return result;
  const id = asObject(result).id;
  return typeof id === 'string' ? id : '';
}

/** The result count of a recipe row; 1 when absent. */
export function resultCountOf(entry: Json | undefined): number {
  const count = asObject(asObject(entry).result).count;
  return typeof count === 'number' ? count : 1;
}

/**
 * The `result` of a recipe row after setting its item id or count: a bare id while the count
 * is 1 and there are no components, else `{ id, count?, components? }`.
 */
export function withResult(
  entry: Json | undefined,
  change: { id?: string; count?: number | undefined },
): Json {
  const current = asObject(entry).result;
  const object = asObject(current);
  const id = change.id ?? resultIdOf(entry);
  const count = 'count' in change ? change.count : resultCountOf(entry);
  const rest: JsonObject = { ...object };
  delete rest.id;
  delete rest.count;
  if ((count === undefined || count === 1) && Object.keys(rest).length === 0) return id;
  return { id, ...(count === undefined || count === 1 ? {} : { count }), ...rest };
}
