/**
 * Lowering of `msm:item` (ADR 0025 D1, D5).
 */
import type { Element, JsonObject, OutputFile, Target, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT } from './block';
import { lowerFuelAndCompostInPlace } from './fuel';
import {
  BlocksItemsLoweringError,
  definitionPath,
  descriptionKey,
  isRecord,
  splitResourceLocation,
} from './paths';
import {
  ITEM_TAG_SCHEMA,
  itemDefinitionFile,
  langFile,
  nonEmptyString,
  type RangedPull,
  rangedItemDefinitionFile,
} from './shared';
import { weaponItemTags } from './weapons';

const ITEM_EDITOR_FIELDS = ['model', 'display_name'] as const;

function itemData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: item data must be an object.`);
  }
  return element.data;
}

/**
 * The runtime item definition: the element data without `model` and `display_name`, with
 * `format` set to the format this plugin writes. Every component passes through unchanged,
 * including `msm:armor` and a custom `msm:tool` material with its attack overrides (ADR 0042),
 * and `msm:consumable`, `msm:ranged_weapon`, `msm:shield`, `msm:death_protection` and the
 * vanilla passthrough `msm:components` (ADR 0044): the runtime derives the vanilla components
 * from them. The element-only `fuel` and `compost` (ADR 0060 D4) become `minecraft:cooking_fuel`
 * and `minecraft:compostable` inside `msm:components`, the compost provider taken from `target`.
 *
 * @throws {@link BlocksItemsLoweringError} If the data is not an object, or `compost` has no
 *   provider on `target`.
 */
export function itemDefinition(
  element: Element,
  target?: Pick<TargetFacts, 'id' | 'items'>,
): JsonObject {
  const definition = structuredClone(itemData(element));
  for (const field of ITEM_EDITOR_FIELDS) delete definition[field];
  lowerFuelAndCompostInPlace(definition, target, element.id);
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/** The bow or crossbow of `msm:ranged_weapon` and its draw speed, or `null`. */
export function rangedPullOf(data: JsonObject): RangedPull | null {
  const components = data.components;
  if (typeof components !== 'object' || components === null || Array.isArray(components))
    return null;
  const ranged = (components as JsonObject)['msm:ranged_weapon'];
  if (typeof ranged !== 'object' || ranged === null || Array.isArray(ranged)) return null;
  const type = (ranged as JsonObject).type;
  if (type !== 'bow' && type !== 'crossbow') return null;
  const speed = (ranged as JsonObject).draw_speed;
  return { type, drawSpeed: typeof speed === 'number' && speed > 0 ? speed : 1 };
}

/** An item tag file under `data/minecraft/tags/item/`, declared `merge: 'tag'`. */
function itemTagFile(target: Target, tag: string, id: string): OutputFile {
  return {
    path: `data/minecraft/${target.folders.data.tags}/item/${tag}.json`,
    contents: { values: [id] },
    layer: 'datapack',
    schema: ITEM_TAG_SCHEMA,
    merge: 'tag',
  };
}

/**
 * Lowers an `msm:item` element: the runtime definition `msm/<ns>/item/<path>.json` (layer
 * `msm`), with `model` the item model definition, with `display_name` the
 * `item.<ns>.<path>` key of `en_us` (`merge: 'object'`), and for a spear, mace, bow, crossbow
 * or shield the vanilla enchanting item tags of {@link weaponItemTags} (layer `datapack`,
 * `merge: 'tag'`; ADR 0044 D3).
 *
 * @param element - The element.
 * @param target - The target supplying the vanilla folder names.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerItem(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = itemData(element);
  const files: OutputFile[] = [
    {
      path: definitionPath('item', namespace, path),
      contents: itemDefinition(element, target),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.itemDefinition,
    },
  ];
  const model = nonEmptyString(data.model);
  const pull = rangedPullOf(data);
  if (model !== undefined) {
    files.push(
      pull === null
        ? itemDefinitionFile(target, namespace, path, model)
        : rangedItemDefinitionFile(target, namespace, path, model, pull),
    );
  }
  const displayName = nonEmptyString(data.display_name);
  if (displayName !== undefined) {
    files.push(langFile(target, namespace, descriptionKey('item', namespace, path), displayName));
  }
  for (const tag of weaponItemTags(data)) files.push(itemTagFile(target, tag, element.id));
  return files;
}
