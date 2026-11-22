/**
 * Lowering of `msm:biome_addition` and `msm:loot_addition` (ADR 0060 D2, D3, D7) and of
 * `msm:vanilla_block_rules` (ADR 0105 D4): the runtime definition only, in the jar's `msm/`
 * layer. None has editor-only fields, and none writes vanilla pack files: world generation,
 * extra drops and tool and burning rules for vanilla blocks need the Fabric mod export.
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

/** The runtime folder of `msm:vanilla_block_rules` (ADR 0105 D4). */
export const VANILLA_BLOCK_RULES_FOLDER = 'vanilla_block_rules';

/** The runtime definition path of a rules file: `msm/<ns>/vanilla_block_rules/<path>.json`. */
export const vanillaBlockRulesPath = (namespace: string, path: string): string =>
  `msm/${namespace}/${VANILLA_BLOCK_RULES_FOLDER}/${path}.json`;

function lowerAddition(
  element: Element,
  folder: Extract<DefinitionFolder, 'biome_addition' | 'loot_addition'> | 'vanilla_block_rules',
  schema: string,
): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  additionData(
    element,
    folder === 'biome_addition'
      ? 'biome addition'
      : folder === 'loot_addition'
        ? 'loot addition'
        : 'vanilla block rules',
  );
  return [
    {
      path:
        folder === VANILLA_BLOCK_RULES_FOLDER
          ? vanillaBlockRulesPath(namespace, path)
          : definitionPath(folder, namespace, path),
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

/**
 * Lowers an `msm:vanilla_block_rules` element to `msm/<ns>/vanilla_block_rules/<path>.json`
 * (layer `msm`, schema `msm:vanilla_block_rules_definition`; ADR 0105 D4): the strip, flatten,
 * till, wax, age and burn rules as written. The runtime applies them on start (Fabric mod jar
 * only, limit N9).
 *
 * @param element - The element.
 * @param _target - Unused: the runtime folder is fixed by ADR 0105 D4.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerVanillaBlockRules(element: Element, _target: Target): OutputFile[] {
  return lowerAddition(
    element,
    VANILLA_BLOCK_RULES_FOLDER,
    MSM_SCHEMA_REFS.vanillaBlockRulesDefinition,
  );
}
