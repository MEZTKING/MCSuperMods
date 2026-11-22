/**
 * Pure helpers of the Block Studio's plant sections (B272, ADR 0068 D3, D4, D6): crop ages,
 * stage textures and heights in words, the stage model an age shows, the bone meal range, the
 * tree a sapling's "New tree" makes, and leaf tints. No React, no session.
 *
 * The crop defaults restate the format's documented defaults (`max_age` 7, at most 15, the
 * stage height ramp), which `@msm/plugin-blocks-items` does not export.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { isJsonObject } from '../../forms/pointer';
import { slotModelRows } from './block-type-model';
import { asObject } from './blocks-items-model';

/** A crop's default last age, as vanilla wheat (eight stages). */
export const DEFAULT_CROP_MAX_AGE = 7;
/** The largest last age the format allows (sixteen stages). */
export const MAX_CROP_MAX_AGE = 15;
/** Bone meal's default growth, as vanilla crops: 2 to 5 stages. */
export const DEFAULT_BONEMEAL_GROWTH = Object.freeze({ min: 2, max: 5 });
/** The soil a crop is planted on when `soil` is empty. */
export const DEFAULT_CROP_SOIL = '#minecraft:supports_crops';
/** The soil a sapling is planted on when `soil` is empty. */
export const DEFAULT_SAPLING_SOIL = '#minecraft:supports_vegetation';
/** Vanilla's falling leaf chance per animation tick. */
export const DEFAULT_PARTICLE_CHANCE = 0.01;
/** The worldgen kind a sapling's tree is (ADR 0068 D5). */
export const FEATURE_KIND = 'minecraft:worldgen/feature';
/** The worldgen plugin's "Tree for a sapling" template (B270). */
export const SAPLING_TREE_TEMPLATE = 'feature_sapling_tree';

/** A crop's last age: `max_age` when it is a whole number from 1 to 15, else 7. */
export function cropMaxAge(data: Json | undefined): number {
  const age = asObject(data).max_age;
  return typeof age === 'number' && Number.isInteger(age) && age >= 1 && age <= MAX_CROP_MAX_AGE
    ? age
    : DEFAULT_CROP_MAX_AGE;
}

/**
 * Vanilla's ramp of outline heights for `maxAge + 1` stages: `2 + 2 * stage * 7 / max_age`
 * pixels, rounded (2, 4, ..., 16 for wheat).
 */
export function defaultStageHeights(maxAge: number): number[] {
  return Array.from({ length: maxAge + 1 }, (_, stage) =>
    Math.min(16, Math.round(2 + (2 * stage * 7) / maxAge)),
  );
}

/** The crop's own `stage_heights` as numbers, or `undefined` when it has none. */
export function ownStageHeights(data: Json | undefined): number[] | undefined {
  const heights = asObject(data).stage_heights;
  if (!Array.isArray(heights)) return undefined;
  return heights.map((value) => (typeof value === 'number' ? value : 1));
}

/**
 * `heights` fitted to `maxAge + 1` stages: cut, or padded with the default ramp's heights, so a
 * change of the last age keeps the heights in step.
 */
export function resizeStageHeights(heights: readonly number[], maxAge: number): number[] {
  const ramp = defaultStageHeights(maxAge);
  return ramp.map((fallback, stage) => heights[stage] ?? fallback);
}

/** The crop's stage textures (`textures.stages`), empty strings kept. */
export function stageTextures(data: Json | undefined): string[] {
  const stages = asObject(asObject(data).textures).stages;
  if (!Array.isArray(stages)) return [];
  return stages.map((value) => (typeof value === 'string' ? value : ''));
}

/**
 * The stage model index age `age` shows when `count` stage models cover `stages` ages: spread
 * evenly, the first age on the first model and the last age on the last (as the lowering).
 */
export const stageModelIndex = (age: number, count: number, stages: number): number =>
  Math.floor((age * count) / stages);

/**
 * The model a crop shows at `age` (through the lowering's own stage models, generated or own),
 * or `undefined` when it has none.
 */
export function cropStageModel(
  element: Pick<Element, 'id' | 'data'>,
  age: number,
): string | undefined {
  const stages = cropMaxAge(element.data) + 1;
  const rows = slotModelRows(element);
  const models: string[] = [];
  for (let index = 0; index < stages; index += 1) {
    // The leading run of filled stage slots is used; a gap ends it (as the lowering).
    const model = rows.find((row) => row.slot === `stage${index}`)?.model;
    if (model === undefined) break;
    models.push(model);
  }
  if (models.length === 0) return undefined;
  const clamped = Math.max(0, Math.min(stages - 1, Math.round(age)));
  return models[stageModelIndex(clamped, models.length, stages)];
}

/** The bone meal range written, or `undefined` when the crop uses vanilla's 2 to 5. */
export function bonemealGrowth(data: Json | undefined): { min: number; max: number } | undefined {
  const growth = asObject(data).bonemeal_growth;
  if (!isJsonObject(growth)) return undefined;
  return {
    min: typeof growth.min === 'number' ? growth.min : DEFAULT_BONEMEAL_GROWTH.min,
    max: typeof growth.max === 'number' ? growth.max : DEFAULT_BONEMEAL_GROWTH.max,
  };
}

/**
 * The bone meal range after setting one bound: both bounds are written (the format needs
 * both), the other from the current value or vanilla's; `undefined` when both bounds are
 * cleared or back at vanilla's.
 */
export function withBonemealBound(
  data: Json | undefined,
  bound: 'min' | 'max',
  value: number | undefined,
): { min: number; max: number } | undefined {
  const current = bonemealGrowth(data) ?? { ...DEFAULT_BONEMEAL_GROWTH };
  const next = { ...current, [bound]: value ?? DEFAULT_BONEMEAL_GROWTH[bound] };
  return next.min === DEFAULT_BONEMEAL_GROWTH.min && next.max === DEFAULT_BONEMEAL_GROWTH.max
    ? undefined
    : next;
}

/** The namespace and path of an id (`minecraft` when it has none). */
function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/**
 * The tree a sapling's "New tree" makes: `<ns>:<base>_tree`, where `<base>` is the sapling's
 * path without `_sapling` (`demo:maple_sapling` makes `demo:maple_tree`). The "Tree for a
 * sapling" template then grows it from `<ns>:<base>_log` and `<ns>:<base>_leaves`.
 */
export function saplingTreeId(saplingId: string): string {
  const { namespace, path } = splitId(saplingId);
  const name = path.slice(path.lastIndexOf('/') + 1);
  const base = name.endsWith('_sapling') && name !== '_sapling' ? name.slice(0, -8) : name;
  return `${namespace}:${base}_tree`;
}

/** The log and leaves ids the "Tree for a sapling" template names for tree `treeId`. */
export function treeBlockIds(
  treeId: string,
  projectNamespace: string,
): { log: string; leaves: string } {
  const { path } = splitId(treeId);
  const trimmed = path.replace(/_tree$/, '');
  const base = trimmed === '' ? path : trimmed;
  return { log: `${projectNamespace}:${base}_log`, leaves: `${projectNamespace}:${base}_leaves` };
}

/** The project's `minecraft:worldgen/feature` element `id`, or `undefined`. */
export function projectFeature(project: Project, id: string): Element | undefined {
  if (id === '') return undefined;
  const wanted = id.includes(':') ? id : `minecraft:${id}`;
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find(
      (element) => element.kind === FEATURE_KIND && element.id === wanted,
    );
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Whether the project has any element `id` (a "New tree" would clash with it). */
export function projectHasId(project: Project, id: string): boolean {
  return project.namespaces.some((namespace) =>
    namespace.elements.some((element) => element.id === id),
  );
}

/** The leaf tint choices of the Leaves section. */
export const LEAF_TINTS = ['foliage', 'grass', 'dry_foliage', 'colour'] as const;
/** A leaf tint choice; `none` is no tint. */
export type LeafTint = (typeof LEAF_TINTS)[number] | 'none';

/** The leaf tints in words. */
export const LEAF_TINT_LABELS: Readonly<Record<LeafTint, string>> = Object.freeze({
  none: 'None (the texture keeps its own colours)',
  foliage: 'Biome foliage colour (like oak leaves)',
  grass: 'Biome grass colour',
  dry_foliage: 'Biome dry foliage colour (like leaf litter)',
  colour: 'One colour everywhere',
});

/** The tint choice of leaves data. */
export function leafTintOf(data: Json | undefined): LeafTint {
  const tint = asObject(data).tint;
  if (typeof tint === 'number') return 'colour';
  if (tint === 'foliage' || tint === 'grass' || tint === 'dry_foliage') return tint;
  return 'none';
}

/** An RGB number as `#rrggbb`. */
export function colourHex(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** `#rrggbb` as an RGB number, or `undefined` when it is not one. */
export function parseColourHex(text: string): number | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  return match?.[1] === undefined ? undefined : Number.parseInt(match[1], 16);
}

/** The `tint` written for a choice; a colour keeps the current one (default oak green). */
export function tintValue(choice: LeafTint, data: Json | undefined): Json | undefined {
  if (choice === 'none') return undefined;
  if (choice !== 'colour') return choice;
  const current = asObject(data).tint;
  return typeof current === 'number' ? current : 0x48b518;
}

// ---------------------------------------------------------------------------------------------
// The growing and climbing plants and the flower pot of ADR 0103 (B516, ADR 0112 D1). The
// defaults restate the format's documented ones (`definition.mcdoc`, frozen at B506).

/** A growing plant's defaults: kelp's starting age and growth chance, cave vines' berry light. */
export const GROWING_PLANT_DEFAULTS = Object.freeze({
  maxAge: 25,
  growthChance: 0.14,
  berryLight: 14,
});

/** A column plant's defaults by shape: the tallest stop and touch damage. */
export const COLUMN_PLANT_DEFAULTS = Object.freeze({
  height: Object.freeze({ cane: 3, cactus: 3, bamboo: 16 }) as Readonly<Record<string, number>>,
  bambooShortest: 12,
  cactusDamage: 1,
});

/** A big dripleaf's tilt timing in ticks, as measured on vanilla's (B503). */
export const DEFAULT_TILT_TICKS: readonly [number, number, number] = Object.freeze([
  2, 10, 10,
]) as readonly [number, number, number];

/** A multiface plant's default light, as glow lichen. */
export const DEFAULT_MULTIFACE_LIGHT = 7;

/** A column plant's shape (`style`): `cane` when absent or unknown. */
export function columnStyleOf(data: Json | undefined): 'cane' | 'cactus' | 'bamboo' {
  const style = asObject(data).style;
  return style === 'cactus' || style === 'bamboo' ? style : 'cane';
}

/** The tallest stop a column plant of `data` has: `max_height`, else its shape's default. */
export function columnMaxHeight(data: Json | undefined): number {
  const max = asObject(data).max_height;
  return typeof max === 'number' ? max : (COLUMN_PLANT_DEFAULTS.height[columnStyleOf(data)] ?? 3);
}

/** The shortest stop's default: the tallest stop, or for bamboo the smaller of 12 and it. */
export function defaultColumnMinHeight(data: Json | undefined): number {
  const max = columnMaxHeight(data);
  return columnStyleOf(data) === 'bamboo'
    ? Math.min(COLUMN_PLANT_DEFAULTS.bambooShortest, max)
    : max;
}

/**
 * The column plant's data after changing its shape: the shape's own textures stay only when they
 * fit the new shape, so `textures` is reset to the first picture carried over; numbers that
 * equal the old shape's defaults are dropped so the new shape's defaults apply.
 */
export function withColumnStyle(
  data: Json | undefined,
  style: 'cane' | 'cactus' | 'bamboo',
): { [key: string]: Json } {
  const source = asObject(data);
  const out: { [key: string]: Json } = { ...source, style };
  const textures = asObject(source.textures);
  const picture = [textures.all, textures.side, textures.stalk, textures.top].find(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  const key = style === 'cane' ? 'all' : style === 'cactus' ? 'side' : 'stalk';
  if (picture === undefined) delete out.textures;
  else out.textures = { [key]: picture };
  delete out.models;
  // The shape's own defaults (touch damage, water) come back with the new shape.
  delete out.touch_damage;
  delete out.needs_water_nearby;
  return out;
}

/**
 * A range field's value after setting one bound (`bonemeal_growth`): both bounds are written
 * once one is given (the format needs both), the other from the current value or `fallback`; a
 * cleared bound takes the other's value; `undefined` when both are cleared.
 */
export function withRangeBound(
  range: Json | undefined,
  bound: 'min' | 'max',
  value: number | undefined,
  fallback: number,
): { min: number; max: number } | undefined {
  const current = asObject(range);
  const other = bound === 'min' ? 'max' : 'min';
  const otherValue = typeof current[other] === 'number' ? (current[other] as number) : undefined;
  if (value === undefined && otherValue === undefined) return undefined;
  const next = {
    min: typeof current.min === 'number' ? current.min : fallback,
    max: typeof current.max === 'number' ? current.max : fallback,
  };
  next[bound] = value ?? next[other];
  return next;
}

/**
 * A big dripleaf's `tilt_ticks` after setting one of its three steps; `undefined` when all three
 * are back at vanilla's.
 */
export function withTiltTicks(
  data: Json | undefined,
  index: 0 | 1 | 2,
  value: number | undefined,
): number[] | undefined {
  const current = asObject(data).tilt_ticks;
  const ticks = DEFAULT_TILT_TICKS.map((fallback, at) =>
    Array.isArray(current) && typeof current[at] === 'number' ? (current[at] as number) : fallback,
  );
  ticks[index] = value ?? (DEFAULT_TILT_TICKS[index] as number);
  return ticks.every((tick, at) => tick === DEFAULT_TILT_TICKS[at]) ? undefined : ticks;
}

/** The block types of a project plant a flower pot can take (one block high, with an item). */
export const POTTABLE_PROJECT_TYPES: readonly string[] = Object.freeze([
  'sapling',
  'berry_bush',
  'vine',
  'growing_plant',
  'column_plant',
  'multiface',
  'dripleaf',
]);

/** Whether a project block can go into a pot: a pottable type with an item, not a small dripleaf. */
function pottable(element: Element): boolean {
  if (element.kind !== 'msm:block') return false;
  const data = asObject(element.data);
  const type = typeof data.type === 'string' ? data.type : 'block';
  if (!POTTABLE_PROJECT_TYPES.includes(type) || data.item === false) return false;
  return !(type === 'dripleaf' && data.size === 'small');
}

/** The project's plants a flower pot can take, by id. */
export function projectPottablePlants(project: Project): string[] {
  return project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter(pottable)
    .map((element) => element.id)
    .sort();
}

/**
 * The vanilla plants Minecraft's own flower pot takes, read from the target's `potted_<plant>`
 * blocks (through `suggest`): `minecraft:potted_poppy` names `minecraft:poppy`; a bush pots the
 * plant without `_bush` when the block with `_bush` does not exist (`potted_azalea_bush` names
 * `azalea`).
 */
export function vanillaPottablePlants(
  suggest: (registry: string, prefix: string) => string[],
): string[] {
  const out = new Set<string>();
  for (const potted of suggest('block', 'minecraft:potted_')) {
    if (!potted.startsWith('minecraft:potted_')) continue;
    const plant = `minecraft:${potted.slice('minecraft:potted_'.length)}`;
    const exists = (id: string) => suggest('block', id).includes(id);
    if (exists(plant)) out.add(plant);
    else if (plant.endsWith('_bush') && exists(plant.slice(0, -'_bush'.length))) {
      out.add(plant.slice(0, -'_bush'.length));
    }
  }
  return [...out].sort();
}

/** A flower pot's listed plants after adding `plant` (once) or removing the entry at `index`. */
export function withPotPlant(plants: readonly string[], plant: string): string[] {
  const id = plant.includes(':') ? plant : `minecraft:${plant}`;
  return plants.includes(id) ? [...plants] : [...plants, id];
}
