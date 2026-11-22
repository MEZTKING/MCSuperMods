/**
 * Lowering of `msm:stat` (ADR 0111 D6, as amended after the spike): the runtime definition
 * `msm/<ns>/stat/<path>.json` (layer `msm`) and, with `display_name`, the language key
 * `stat.<ns>.<path>` the Statistics screen shows. The element data is the definition with
 * `format` optional plus that text. The statistic's scoreboard criterion is
 * {@link statCriterion}.
 */
import type { Element, JsonObject, OutputFile, Target, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { COMMAND_LANG_SCHEMA, COMMAND_LANGUAGE } from './command';
import { isRecord, ScriptingLoweringError, splitResourceLocation } from './paths';

/** The definition format this plugin writes. */
export const STAT_DEFINITION_FORMAT = 1;

/** The criterion prefix of a custom statistic when the target has no statistic facts. */
export const DEFAULT_STAT_CRITERION_PREFIX = 'minecraft.custom:';

/** Element fields lowering consumes; they never reach the runtime definition. */
const EDITOR_FIELDS = ['display_name'] as const;

/** The runtime folder `msm/<namespace>/stat/<path>.json` (ADR 0111 D6). */
export function statPath(namespace: string, path: string): string {
  return `msm/${namespace}/stat/${path}.json`;
}

/**
 * The name key `stat.<namespace>.<path>`, every `/` of the path written as `.` (the game's
 * description id style).
 */
export function statNameKey(namespace: string, path: string): string {
  return `stat.${namespace}.${path.replaceAll('/', '.')}`;
}

/**
 * The scoreboard criterion of a project statistic, `minecraft.custom:<namespace>.<path>` (the
 * target's `stats.criterionPrefix`, then the id with its colon written as a dot), as
 * `/scoreboard objectives add <name> <criterion>` takes it.
 *
 * @param id - The statistic's id, such as `demo:ores_found`.
 * @param target - The target whose statistic facts give the prefix.
 */
export function statCriterion(id: string, target?: Pick<TargetFacts, 'stats'>): string {
  const { namespace, path } = splitResourceLocation(id);
  const prefix = target?.stats?.criterionPrefix ?? DEFAULT_STAT_CRITERION_PREFIX;
  return `${prefix}${namespace}.${path}`;
}

function statData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new ScriptingLoweringError(`Element ${element.id}: statistic data must be an object.`);
  }
  return element.data;
}

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * The runtime statistic definition: the element data without `display_name`, with `format` set
 * to {@link STAT_DEFINITION_FORMAT}; `formatter` passes through unchanged.
 *
 * @throws {@link ScriptingLoweringError} If the data is not an object.
 */
export function statDefinition(element: Element): JsonObject {
  const definition = structuredClone(statData(element));
  for (const field of EDITOR_FIELDS) delete definition[field];
  definition.format = STAT_DEFINITION_FORMAT;
  return definition;
}

/**
 * Lowers an `msm:stat` element: the definition (schema `msm:stat_definition`) and, with
 * `display_name`, its key in `en_us` (`merge: 'object'`).
 *
 * @param element - The element.
 * @param target - The target supplying the language folder.
 * @returns The output files.
 * @throws {@link ScriptingLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerStat(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = statData(element);
  const files: OutputFile[] = [
    {
      path: statPath(namespace, path),
      contents: statDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.statDefinition,
    },
  ];
  const name = nonEmpty(data.display_name);
  if (name !== undefined) {
    files.push({
      path: `assets/${namespace}/${target.folders.resource.lang}/${COMMAND_LANGUAGE}.json`,
      contents: { [statNameKey(namespace, path)]: name },
      layer: 'resourcepack',
      schema: COMMAND_LANG_SCHEMA,
      merge: 'object',
    });
  }
  return files;
}
