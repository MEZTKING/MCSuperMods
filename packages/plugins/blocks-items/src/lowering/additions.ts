/**
 * Lowering of `msm:biome_addition` and `msm:loot_addition` (ADR 0060 D2, D3, D7): the runtime
 * definition only, in the jar's `msm/` layer. Neither has editor-only fields, and neither
 * writes vanilla pack files: world generation and extra drops need the Fabric mod export.
 */
import type { Element, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT } from './block';
import {
  BlocksItemsLoweringError,
  type DefinitionFolder,
  definitionPath,
  isRecord,
  splitResourceLocation,
} from './paths';

function additionData(element: Element, what: string): JsonObject {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: ${what} data must be an object.`);
  }
  return element.data;
}

/**
 * The runtime definition of a biome or loot addition: the element data as written, with
 * `format` set to the format this plugin writes.
 *
 * @throws {@link BlocksItemsLoweringError} If the data is not an object.
 */
export function additionDefinition(element: Element): JsonObject {
  const definition = structuredClone(additionData(element, 'addition'));
  definition.format = DEFINITION_FORMAT;
  return definition;
}

function lowerAddition(
  element: Element,
  folder: Extract<DefinitionFolder, 'biome_addition' | 'loot_addition'>,
  schema: string,
): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  additionData(element, folder === 'biome_addition' ? 'biome addition' : 'loot addition');
  return [
    {
      path: definitionPath(folder, namespace, path),
      contents: additionDefinition(element),
      layer: 'msm',
      schema,
    },
  ];
}

/**
 * Lowers an `msm:biome_addition` element to `msm/<ns>/biome_addition/<path>.json` (layer
 * `msm`, schema `msm:biome_addition_definition`; ADR 0060 D2).
 *
 * @param element - The element.
 * @param _target - Unused: the runtime folder is fixed by ADR 0060 D2.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerBiomeAddition(element: Element, _target: Target): OutputFile[] {
  return lowerAddition(element, 'biome_addition', MSM_SCHEMA_REFS.biomeAdditionDefinition);
}

/**
 * Lowers an `msm:loot_addition` element to `msm/<ns>/loot_addition/<path>.json` (layer `msm`,
 * schema `msm:loot_addition_definition`; ADR 0060 D3). The pools pass through as written; the
 * runtime decodes them with the game's own pool Codec on every data pack load.
 *
 * @param element - The element.
 * @param _target - Unused: the runtime folder is fixed by ADR 0060 D3.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerLootAddition(element: Element, _target: Target): OutputFile[] {
  return lowerAddition(element, 'loot_addition', MSM_SCHEMA_REFS.lootAdditionDefinition);
}
