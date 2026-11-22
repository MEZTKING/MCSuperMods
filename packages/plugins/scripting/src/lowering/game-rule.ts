/**
 * Lowering of `msm:game_rule` (ADR 0111 D5, as amended after the spike): the runtime definition
 * `msm/<ns>/game_rule/<path>.json` (layer `msm`) and, with `display_name` or `description`, the
 * language keys `gamerule.<ns>.<path>` and `gamerule.<ns>.<path>.description` that the game rule
 * screen shows. The element data is the definition with `format` optional plus those two texts.
 */
import type { Element, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { COMMAND_LANG_SCHEMA, COMMAND_LANGUAGE } from './command';
import { isRecord, ScriptingLoweringError, splitResourceLocation } from './paths';

/** The definition format this plugin writes. */
export const GAME_RULE_DEFINITION_FORMAT = 1;

/** Element fields lowering consumes; they never reach the runtime definition. */
const EDITOR_FIELDS = ['display_name', 'description'] as const;

/** The runtime folder `msm/<namespace>/game_rule/<path>.json` (ADR 0111 D5). */
export function gameRulePath(namespace: string, path: string): string {
  return `msm/${namespace}/game_rule/${path}.json`;
}

/**
 * The name key `gamerule.<namespace>.<path>`, every `/` of the path written as `.` (the game's
 * description id style).
 */
export function gameRuleNameKey(namespace: string, path: string): string {
  return `gamerule.${namespace}.${path.replaceAll('/', '.')}`;
}

/** The description key `gamerule.<namespace>.<path>.description`. */
export function gameRuleDescriptionKey(namespace: string, path: string): string {
  return `${gameRuleNameKey(namespace, path)}.description`;
}

function gameRuleData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new ScriptingLoweringError(`Element ${element.id}: game rule data must be an object.`);
  }
  return element.data;
}

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * The runtime game rule definition: the element data without `display_name` and `description`,
 * with `format` set to {@link GAME_RULE_DEFINITION_FORMAT}. `kind`, `default`, `category`, `min`
 * and `max` pass through unchanged (the validators check them).
 *
 * @throws {@link ScriptingLoweringError} If the data is not an object.
 */
export function gameRuleDefinition(element: Element): JsonObject {
  const definition = structuredClone(gameRuleData(element));
  for (const field of EDITOR_FIELDS) delete definition[field];
  definition.format = GAME_RULE_DEFINITION_FORMAT;
  return definition;
}

/**
 * Lowers an `msm:game_rule` element: the definition (schema `msm:game_rule_definition`) and, with
 * `display_name` or `description`, their keys in `en_us` (`merge: 'object'`).
 *
 * @param element - The element.
 * @param target - The target supplying the language folder.
 * @returns The output files.
 * @throws {@link ScriptingLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerGameRule(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = gameRuleData(element);
  const files: OutputFile[] = [
    {
      path: gameRulePath(namespace, path),
      contents: gameRuleDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.gameRuleDefinition,
    },
  ];
  const lang: Record<string, string> = {};
  const name = nonEmpty(data.display_name);
  const description = nonEmpty(data.description);
  if (name !== undefined) lang[gameRuleNameKey(namespace, path)] = name;
  if (description !== undefined) lang[gameRuleDescriptionKey(namespace, path)] = description;
  if (Object.keys(lang).length > 0) {
    files.push({
      path: `assets/${namespace}/${target.folders.resource.lang}/${COMMAND_LANGUAGE}.json`,
      contents: lang,
      layer: 'resourcepack',
      schema: COMMAND_LANG_SCHEMA,
      merge: 'object',
    });
  }
  return files;
}
