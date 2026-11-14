/**
 * Machine recipes of `msm:block` (ADR 0075 D2, D8): the element's editor-only `recipes` list,
 * lowered to data pack files `data/<ns>/recipe/<machine path>/<name>.json` whose `type` is the
 * machine's own id (the recipe type and serialiser the runtime registers for it). The files
 * are checked against MSM's `::msm::recipe::MachineRecipe`, not vanilla's recipe dispatch,
 * which does not know the type. Vanilla data packs leave them out (ADR 0066, ADR 0075 D10).
 */
import type { Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { BlocksItemsLoweringError, dataPath, isRecord, splitResourceLocation } from './paths';
import { type BlockTypeName, blockStateFlag } from './types';

/** The element field holding the machine recipes. */
export const MACHINE_RECIPES_FIELD = 'recipes';

/** The fields of a recipe entry copied into the file as they are, in the format's order. */
const COPIED_FIELDS = ['ingredient', 'count', 'time', 'experience'] as const;

/** The recipe entries of block data: the objects of `recipes`, others skipped. */
export function machineRecipeEntries(data: Json | undefined): JsonObject[] {
  const recipes = isRecord(data) ? data[MACHINE_RECIPES_FIELD] : undefined;
  return Array.isArray(recipes) ? recipes.filter((entry) => isRecord(entry)) : [];
}

/** The result item id of a recipe entry: a bare id or `result.id`. */
export function machineRecipeResultId(entry: JsonObject): string | undefined {
  const result = entry.result;
  if (typeof result === 'string') return result.length > 0 ? result : undefined;
  if (isRecord(result) && typeof result.id === 'string' && result.id.length > 0) return result.id;
  return undefined;
}

/** The result in vanilla's `ItemStackTemplate` form: a bare id becomes `{ "id": ... }`. */
function resultTemplate(entry: JsonObject): JsonObject | undefined {
  const result = entry.result;
  if (typeof result === 'string') return result.length > 0 ? { id: result } : undefined;
  return isRecord(result) ? structuredClone(result) : undefined;
}

/**
 * The file names of `entries`, without `.json`: `name` when set, else the result's path
 * (`minecraft:iron_ingot` gives `iron_ingot`), with `_2`, `_3` added to the second and later
 * uses of a name, in list order.
 *
 * @throws {@link BlocksItemsLoweringError} If an entry has neither a name nor a result.
 */
export function machineRecipeNames(entries: readonly JsonObject[], elementId = 'block'): string[] {
  const used = new Set<string>();
  return entries.map((entry, index) => {
    const named = typeof entry.name === 'string' && entry.name.length > 0 ? entry.name : undefined;
    const resultId = machineRecipeResultId(entry);
    const base =
      named ??
      (resultId === undefined
        ? undefined
        : splitResourceLocation(resultId.includes(':') ? resultId : `minecraft:${resultId}`).path);
    if (base === undefined) {
      throw new BlocksItemsLoweringError(
        `Element ${elementId}: machine recipe ${index + 1} has no name and no result.`,
      );
    }
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base}_${n}`;
    used.add(name);
    return name;
  });
}

/**
 * The machine recipe files of a block of `type` (ADR 0075 D8): one per entry of `recipes`, at
 * `data/<ns>/recipe/<path>/<name>.json` (layer `datapack`, schema `msm:machine_recipe`), with
 * `type` the block's id and the entry's fields; a bare-id `result` becomes `{ "id": ... }`.
 * None unless the block is a machine on a type that takes one (elsewhere the runtime has no
 * recipe type for it, so the files could not load).
 *
 * @throws {@link BlocksItemsLoweringError} If a file name is not a valid resource path.
 */
export function lowerMachineRecipes(
  type: BlockTypeName,
  blockId: string,
  data: JsonObject,
  target: Target,
): OutputFile[] {
  if (blockStateFlag(type, data) !== 'lit') return [];
  const entries = machineRecipeEntries(data);
  if (entries.length === 0) return [];
  const { namespace, path } = splitResourceLocation(blockId);
  const names = machineRecipeNames(entries, blockId);
  return entries.map((entry, index) => {
    const name = names[index] as string;
    // Checks the name forms a safe resource path.
    splitResourceLocation(`${namespace}:${path}/${name}`);
    const contents: JsonObject = { type: blockId };
    for (const field of COPIED_FIELDS) {
      const value = entry[field];
      if (value !== undefined) contents[field] = structuredClone(value);
    }
    const result = resultTemplate(entry);
    if (result !== undefined) contents.result = result;
    return {
      path: dataPath(target, 'recipe', namespace, `${path}/${name}`),
      contents,
      layer: 'datapack',
      schema: MSM_SCHEMA_REFS.machineRecipe,
    };
  });
}
