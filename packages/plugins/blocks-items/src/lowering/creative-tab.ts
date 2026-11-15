/**
 * Lowering of `msm:creative_tab` (ADR 0096 D2): the runtime definition
 * `msm/<ns>/creative_tab/<path>.json` and, with `display_name`, the language key the tab's
 * `title` names (default `itemGroup.<ns>.<path>`). Items and blocks join the tab through their
 * own `creative_tab` field, so the tab lists no items.
 */
import type { Element, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT } from './block';
import { BlocksItemsLoweringError, isRecord, splitResourceLocation } from './paths';
import { langFile, nonEmptyString } from './shared';

const CREATIVE_TAB_EDITOR_FIELDS = ['display_name'] as const;

/** The runtime folder `msm/<namespace>/creative_tab/<path>.json` (ADR 0096 D2). */
export function creativeTabPath(namespace: string, path: string): string {
  return `msm/${namespace}/creative_tab/${path}.json`;
}

/**
 * The default title key `itemGroup.<namespace>.<path>`, every `/` of the path written as `.`
 * (the game's description id style); the runtime uses the same key when `title` is absent.
 */
export function creativeTabTitleKey(namespace: string, path: string): string {
  return `itemGroup.${namespace}.${path.replaceAll('/', '.')}`;
}

function creativeTabData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(
      `Element ${element.id}: creative tab data must be an object.`,
    );
  }
  return element.data;
}

/**
 * The runtime creative tab definition: the element data without `display_name`, with `format`
 * set to the format this plugin writes. `icon`, `title` and `order` pass through unchanged.
 *
 * @throws {@link BlocksItemsLoweringError} If the data is not an object.
 */
export function creativeTabDefinition(element: Element): JsonObject {
  const definition = structuredClone(creativeTabData(element));
  for (const field of CREATIVE_TAB_EDITOR_FIELDS) delete definition[field];
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/**
 * Lowers an `msm:creative_tab` element: the definition (layer `msm`, schema
 * `msm:creative_tab_definition`) and, with `display_name`, the title key in `en_us`
 * (`merge: 'object'`): the tab's own `title` key, else `itemGroup.<ns>.<path>`.
 *
 * @param element - The element.
 * @param target - The target supplying the language folder.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerCreativeTab(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = creativeTabData(element);
  const files: OutputFile[] = [
    {
      path: creativeTabPath(namespace, path),
      contents: creativeTabDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.creativeTabDefinition,
    },
  ];
  const displayName = nonEmptyString(data.display_name);
  if (displayName !== undefined) {
    const key = nonEmptyString(data.title) ?? creativeTabTitleKey(namespace, path);
    files.push(langFile(target, namespace, key, displayName));
  }
  return files;
}
