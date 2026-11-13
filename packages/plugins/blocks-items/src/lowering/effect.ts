/**
 * Lowering of `msm:effect` (ADR 0055 D2): the runtime definition and the name key. The icon is
 * a project asset at `assets/<ns>/textures/mob_effect/<path>.png`, not a field, so lowering
 * writes no texture.
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
import { langFile, nonEmptyString } from './shared';

const EFFECT_EDITOR_FIELDS = ['display_name'] as const;

function effectData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: effect data must be an object.`);
  }
  return element.data;
}

/**
 * The runtime effect definition: the element data without `display_name`, with `format` set to
 * the format this plugin writes. Category, colour, particle, sound, attribute modifiers,
 * components and events pass through unchanged.
 *
 * @throws {@link BlocksItemsLoweringError} If the data is not an object.
 */
export function effectDefinition(element: Element): JsonObject {
  const definition = structuredClone(effectData(element));
  for (const field of EFFECT_EDITOR_FIELDS) delete definition[field];
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/**
 * Lowers an `msm:effect` element: the runtime definition `msm/<ns>/effect/<path>.json` (layer
 * `msm`, schema `msm:effect_definition`) and, with `display_name`, the `effect.<ns>.<path>` key
 * of `en_us` (`merge: 'object'`).
 *
 * @param element - The element.
 * @param target - The target supplying the vanilla folder names.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerEffect(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = effectData(element);
  const files: OutputFile[] = [
    {
      path: definitionPath('effect', namespace, path),
      contents: effectDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.effectDefinition,
    },
  ];
  const displayName = nonEmptyString(data.display_name);
  if (displayName !== undefined) {
    files.push(langFile(target, namespace, descriptionKey('effect', namespace, path), displayName));
  }
  return files;
}
