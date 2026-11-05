/**
 * Lowering of `msm:item` (ADR 0025 D1, D5).
 */
import type { Element, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT } from './block';
import {
  BlocksItemsLoweringError,
  definitionPath,
  descriptionKey,
  isRecord,
  splitResourceLocation,
} from './paths';
import { itemDefinitionFile, langFile, nonEmptyString } from './shared';

const ITEM_EDITOR_FIELDS = ['model', 'display_name'] as const;

function itemData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: item data must be an object.`);
  }
  return element.data;
}

/**
 * The runtime item definition: the element data without `model` and `display_name`, with
 * `format` set to the format this plugin writes.
 *
 * @throws {@link BlocksItemsLoweringError} If the data is not an object.
 */
export function itemDefinition(element: Element): JsonObject {
  const definition = structuredClone(itemData(element));
  for (const field of ITEM_EDITOR_FIELDS) delete definition[field];
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/**
 * Lowers an `msm:item` element: the runtime definition `msm/<ns>/item/<path>.json` (layer
 * `msm`), with `model` the item model definition, with `display_name` the
 * `item.<ns>.<path>` key of `en_us` (`merge: 'object'`).
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
      contents: itemDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.itemDefinition,
    },
  ];
  const model = nonEmptyString(data.model);
  if (model !== undefined) files.push(itemDefinitionFile(target, namespace, path, model));
  const displayName = nonEmptyString(data.display_name);
  if (displayName !== undefined) {
    files.push(langFile(target, namespace, descriptionKey('item', namespace, path), displayName));
  }
  return files;
}
