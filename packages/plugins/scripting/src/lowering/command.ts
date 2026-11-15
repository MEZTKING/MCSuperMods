/**
 * Lowering of `msm:command` (ADR 0096 D1): the runtime definition `msm/<ns>/command/<path>.json`
 * and, with `feedback_text`, the language key the definition's `feedback` names. The element
 * data is the definition with `format` optional plus the editor-only `feedback_text`.
 */
import type { Element, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { isRecord, ScriptingLoweringError, splitResourceLocation } from './paths';

/** The definition format this plugin writes. */
export const COMMAND_DEFINITION_FORMAT = 1;
/** The language file the feedback text is written to. */
export const COMMAND_LANGUAGE = 'en_us';
/** Schema of vanilla language files. */
export const COMMAND_LANG_SCHEMA = '::java::assets::lang::Lang';

/** Element fields lowering consumes; they never reach the runtime definition. */
const EDITOR_FIELDS = ['feedback_text'] as const;

/** The runtime folder `msm/<namespace>/command/<path>.json` (ADR 0096 D1). */
export function commandPath(namespace: string, path: string): string {
  return `msm/${namespace}/command/${path}.json`;
}

/**
 * The default feedback key `command.<namespace>.<path>.feedback`, every `/` of the path written
 * as `.` (the game's description id style).
 */
export function commandFeedbackKey(namespace: string, path: string): string {
  return `command.${namespace}.${path.replaceAll('/', '.')}.feedback`;
}

function commandData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new ScriptingLoweringError(`Element ${element.id}: command data must be an object.`);
  }
  return element.data;
}

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * The runtime command definition: the element data without `feedback_text`, `format` set to
 * {@link COMMAND_DEFINITION_FORMAT}, and `feedback` set to the default key when the element has
 * `feedback_text` but names no key of its own.
 *
 * @throws {@link ScriptingLoweringError} If the id is unsafe or the data is not an object.
 */
export function commandDefinition(element: Element): JsonObject {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = commandData(element);
  const definition = structuredClone(data);
  for (const field of EDITOR_FIELDS) delete definition[field];
  definition.format = COMMAND_DEFINITION_FORMAT;
  if (nonEmpty(data.feedback_text) !== undefined && nonEmpty(data.feedback) === undefined) {
    definition.feedback = commandFeedbackKey(namespace, path);
  }
  return definition;
}

/**
 * Lowers an `msm:command` element: the definition (layer `msm`, schema
 * `msm:command_definition`) and, with `feedback_text`, its key in `en_us` (`merge: 'object'`).
 *
 * @param element - The element.
 * @param target - The target supplying the language folder.
 * @returns The output files.
 * @throws {@link ScriptingLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerCommand(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const definition = commandDefinition(element);
  const files: OutputFile[] = [
    {
      path: commandPath(namespace, path),
      contents: definition,
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.commandDefinition,
    },
  ];
  const text = nonEmpty(commandData(element).feedback_text);
  const key = nonEmpty(definition.feedback);
  if (text !== undefined && key !== undefined) {
    files.push({
      path: `assets/${namespace}/${target.folders.resource.lang}/${COMMAND_LANGUAGE}.json`,
      contents: { [key]: text },
      layer: 'resourcepack',
      schema: COMMAND_LANG_SCHEMA,
      merge: 'object',
    });
  }
  return files;
}
