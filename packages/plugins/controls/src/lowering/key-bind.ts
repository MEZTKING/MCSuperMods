/**
 * Lowering of `msm:key_bind` (ADR 0088 D3, D8): the runtime definition
 * `msm/<ns>/key_bind/<path>.json` and the language keys of the key's name and of its Controls
 * group. The element-only fields `display_name` and `category_name` are stripped from the
 * definition and become language entries:
 *
 * - `display_name` is written under the definition's `name`, or `key.<ns>.<path>` when it has
 *   none (every `/` of the path written as `.`, vanilla's description id rule);
 * - `category_name` is written under `key.category.<ns>.<category>` of the category id the
 *   runtime registers (`<ns>:<category>`, default `keys`; vanilla's rule, B406), again with
 *   `/` written as `.`.
 */
import type { Element, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import {
  ControlsLoweringError,
  definitionPath,
  isRecord,
  langFile,
  nonEmptyString,
  splitResourceLocation,
} from './paths';

/** The definition format this plugin writes. */
export const DEFINITION_FORMAT = 1;

/** The Controls group of a key bind without `category` (B409). */
export const DEFAULT_KEY_CATEGORY = 'keys';

/** Element fields that lowering turns into language keys and strips from the definition. */
export const KEY_BIND_ELEMENT_FIELDS = ['display_name', 'category_name'] as const;

const dotted = (path: string): string => path.replaceAll('/', '.');

function keyBindData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new ControlsLoweringError(`Element ${element.id}: key bind data must be an object.`);
  }
  return element.data;
}

/**
 * The translation key of a key bind's name: its `name`, or `key.<ns>.<path>` (with `/` written
 * as `.`) when it has none.
 *
 * @param id - The key bind's id, such as `demo:abilities/dash`.
 * @param name - The data's `name`, if any.
 * @throws {@link ControlsLoweringError} If `id` is unsafe.
 */
export function keyBindNameKey(id: string, name?: string): string {
  if (name !== undefined && name.length > 0) return name;
  const { namespace, path } = splitResourceLocation(id);
  return `key.${namespace}.${dotted(path)}`;
}

/**
 * The translation key of a key bind's Controls group: `key.category.<ns>.<category>` (with `/`
 * written as `.`), the category defaulting to `keys`.
 *
 * @param namespace - The key bind's namespace.
 * @param category - The data's `category`, if any.
 */
export function keyCategoryKey(namespace: string, category?: string): string {
  const path = category !== undefined && category.length > 0 ? category : DEFAULT_KEY_CATEGORY;
  return `key.category.${namespace}.${dotted(path)}`;
}

/**
 * The language entries a key bind writes: its name under {@link keyBindNameKey} when it has a
 * `display_name`, and its group's name under {@link keyCategoryKey} when it has a
 * `category_name`.
 *
 * @throws {@link ControlsLoweringError} If the id is unsafe or the data is not an object.
 */
export function keyBindLangEntries(element: Element): Record<string, string> {
  const { namespace } = splitResourceLocation(element.id);
  const data = keyBindData(element);
  const entries: Record<string, string> = {};
  const displayName = nonEmptyString(data.display_name);
  if (displayName !== undefined) {
    entries[keyBindNameKey(element.id, nonEmptyString(data.name))] = displayName;
  }
  const categoryName = nonEmptyString(data.category_name);
  if (categoryName !== undefined) {
    entries[keyCategoryKey(namespace, nonEmptyString(data.category))] = categoryName;
  }
  return entries;
}

/**
 * The runtime key bind definition: the element data without `display_name` and
 * `category_name`, with `format` set to the format this plugin writes. Every other field passes
 * through unchanged.
 *
 * @throws {@link ControlsLoweringError} If the data is not an object.
 */
export function keyBindDefinition(element: Element): JsonObject {
  const definition = structuredClone(keyBindData(element));
  for (const field of KEY_BIND_ELEMENT_FIELDS) delete definition[field];
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/**
 * Lowers an `msm:key_bind` element: the runtime definition `msm/<ns>/key_bind/<path>.json`
 * (layer `msm`, schema `msm:key_bind_definition`) and, when it has a `display_name` or a
 * `category_name`, their keys in `en_us` (`merge: 'object'`).
 *
 * @param element - The element.
 * @param target - The target supplying the language folder.
 * @returns The output files.
 * @throws {@link ControlsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerKeyBind(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const files: OutputFile[] = [
    {
      path: definitionPath('key_bind', namespace, path),
      contents: keyBindDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.keyBindDefinition,
    },
  ];
  const entries = keyBindLangEntries(element);
  if (Object.keys(entries).length > 0) files.push(langFile(target, namespace, entries));
  return files;
}
