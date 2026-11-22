/**
 * `blocks-items.*` project validators of the growing and climbing plants (ADR 0103 D1, D4): the
 * rules of the format the mcdoc cannot express, which the runtime enforces by refusing the file
 * (`loader/types/GrowingPlantFields`), and the checks that need other elements. They read the
 * element data (editor fields still present):
 *
 * - `blocks-items.dripleaf-grows-into-missing` (error): a `small` dripleaf without `grows_into`.
 * - `blocks-items.dripleaf-grows-into-big` (error): a `big` dripleaf with `grows_into` (a big one
 *   grows taller instead).
 * - `blocks-items.dripleaf-tilt-small` (error): a `small` dripleaf with `tilt_ticks` (it does not
 *   tilt).
 * - `blocks-items.dripleaf-grows-into-not-big` (error): `grows_into` names a project block that is
 *   not a `big` dripleaf.
 * - `blocks-items.column-min-above-max` (error): a `column_plant` whose `min_height` is above its
 *   `max_height` (as written, or the style's default: 3 for cane and cactus, 16 for bamboo).
 * - `blocks-items.water-plant-feature-dry` (warning): a world generation feature places a water
 *   plant (a `growing_plant` with `needs_water`, or a `column_plant` that needs water beside it)
 *   with no water check in the feature or its placed features (no `minecraft:water` and no
 *   `minecraft:would_survive`), so most of its blocks would break or never be placed.
 *
 * Companion id clashes (`<id>_plant`, `<id>_shoot`, `<id>_stem`) are the furniture validators'
 * `blocks-items.generated-block-clash`, and unknown `soil` ids the schema's `schema.unknown-id`,
 * so neither is repeated here.
 */
import type { Element, Json, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { BLOCK_KIND } from './kinds';
import { isRecord } from './lowering/paths';
import { columnMaxHeight, columnStyleOf } from './lowering/types/column-plant';
import { blockGeneratedBlockIds } from './lowering/types/companions';
import { dripleafSizeOf } from './lowering/types/dripleaf';
import { needsWater } from './lowering/types/growing-plant';

/** Every code these validators report. */
export const PLANT3_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.dripleaf-grows-into-missing',
  'blocks-items.dripleaf-grows-into-big',
  'blocks-items.dripleaf-tilt-small',
  'blocks-items.dripleaf-grows-into-not-big',
  'blocks-items.column-min-above-max',
  'blocks-items.water-plant-feature-dry',
]);

/** Kind ids of other plugins' elements these checks read. */
const FEATURE_KIND = 'minecraft:worldgen/feature';
const PLACED_FEATURE_KIND = 'minecraft:worldgen/placed_feature';

/** Strings that show a feature checks for water. */
const WATER_HINTS: readonly string[] = Object.freeze([
  'minecraft:water',
  'water',
  '#minecraft:water',
  'minecraft:would_survive',
  'would_survive',
]);

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
const typeOf = (data: JsonObject): string => text(data.type) ?? 'block';

const blocksOfType = (elements: readonly Element[], type: string) =>
  elements
    .filter((element) => element.kind === BLOCK_KIND && typeOf(dataOf(element)) === type)
    .map((element) => ({ element, data: dataOf(element) }));

function dripleafProblems(elements: readonly Element[]): Problem[] {
  const leaves = blocksOfType(elements, 'dripleaf');
  if (leaves.length === 0) return [];
  const blocks = new Map<string, JsonObject>();
  for (const element of elements) {
    if (element.kind === BLOCK_KIND) blocks.set(element.id, dataOf(element));
  }
  const problems: Problem[] = [];
  for (const { element, data } of leaves) {
    const size = dripleafSizeOf(data);
    const growsInto = text(data.grows_into);
    const problem = (code: string, path: string, message: string): void => {
      problems.push({ severity: 'error', code, elementId: element.id, path, message });
    };
    if (size === 'small' && growsInto === undefined) {
      problem(
        'blocks-items.dripleaf-grows-into-missing',
        '/grows_into',
        'A small dripleaf grows into a big one with bone meal, but "Grows into" names none, so the game refuses the block. Pick the big dripleaf of this project it grows into.',
      );
    }
    if (size === 'big' && growsInto !== undefined) {
      problem(
        'blocks-items.dripleaf-grows-into-big',
        '/grows_into',
        'A big dripleaf grows taller with bone meal instead of turning into another block, so the game refuses "Grows into" on it. Remove it, or make this a small dripleaf.',
      );
    }
    if (size === 'small' && data.tilt_ticks !== undefined) {
      problem(
        'blocks-items.dripleaf-tilt-small',
        '/tilt_ticks',
        'A small dripleaf does not tilt, so the game refuses tilt timings on it. Remove them, or make this a big dripleaf.',
      );
    }
    if (size === 'small' && growsInto !== undefined) {
      const target = blocks.get(namespaced(growsInto));
      if (
        target !== undefined &&
        (typeOf(target) !== 'dripleaf' || dripleafSizeOf(target) !== 'big')
      ) {
        problem(
          'blocks-items.dripleaf-grows-into-not-big',
          '/grows_into',
          `"${growsInto}" is not a big dripleaf, so bone meal could not grow this small dripleaf into it. Pick a big dripleaf of this project.`,
        );
      }
    }
  }
  return problems;
}

function columnHeightProblems(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data } of blocksOfType(elements, 'column_plant')) {
    if (typeof data.min_height !== 'number') continue;
    const max = columnMaxHeight(data);
    if (data.min_height <= max) continue;
    const written = typeof data.max_height === 'number';
    problems.push({
      severity: 'error',
      code: 'blocks-items.column-min-above-max',
      elementId: element.id,
      path: '/min_height',
      message: `The shortest stop (${data.min_height}) is above the tallest stop (${max}${written ? '' : `, the default for ${columnStyleOf(data)}`}), so the game refuses the block. Lower the shortest stop or raise the tallest.`,
    });
  }
  return problems;
}

/** Every string in `value`, nested lists and objects included. */
function strings(value: Json | undefined): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (isRecord(value)) return Object.values(value).flatMap(strings);
  return [];
}

/** The ids of the project's water plants and their companions (a strand's `<id>_plant`). */
function waterPlantIds(elements: readonly Element[]): Set<string> {
  const ids = new Set<string>();
  const add = (element: Element) => {
    ids.add(element.id);
    for (const companion of blockGeneratedBlockIds(element.id, element.data)) ids.add(companion);
  };
  for (const { element, data } of blocksOfType(elements, 'growing_plant')) {
    if (needsWater(data)) add(element);
  }
  for (const { element, data } of blocksOfType(elements, 'column_plant')) {
    const nearby =
      typeof data.needs_water_nearby === 'boolean'
        ? data.needs_water_nearby
        : columnStyleOf(data) === 'cane';
    if (nearby) add(element);
  }
  return ids;
}

const hasWaterHint = (values: readonly string[]): boolean =>
  values.some((value) => WATER_HINTS.includes(value));

function dryFeatures(elements: readonly Element[]): Problem[] {
  const plants = waterPlantIds(elements);
  if (plants.size === 0) return [];
  const placed = elements.filter((element) => element.kind === PLACED_FEATURE_KIND);
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== FEATURE_KIND && element.kind !== PLACED_FEATURE_KIND) continue;
    const own = strings(element.data);
    const plant = own.find((value) => plants.has(namespaced(value)));
    if (plant === undefined) continue;
    const around =
      element.kind === FEATURE_KIND
        ? placed
            .filter((candidate) => text(dataOf(candidate).feature) === element.id)
            .flatMap((candidate) => strings(candidate.data))
        : [];
    if (hasWaterHint([...own, ...around])) continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.water-plant-feature-dry',
      elementId: element.id,
      message: `This feature places "${plant}", which lives in or beside water, but nothing in it or its placement checks for water, so most of it would break as soon as it is placed. Place it only where there is water (a "matching fluids" check for minecraft:water, or "would survive").`,
    });
  }
  return problems;
}

export const plants3Validators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.plants-3',
    kinds: [BLOCK_KIND, FEATURE_KIND, PLACED_FEATURE_KIND],
    validate: ({ elements }) => [
      ...dripleafProblems(elements),
      ...columnHeightProblems(elements),
      ...dryFeatures(elements),
    ],
  },
] satisfies ProjectValidator[]);
