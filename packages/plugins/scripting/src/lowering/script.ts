/**
 * Lowering for `msm:script`: `{ "lines": string[] }` becomes a TypeScript source under the
 * runtime folder (ADR 0032 D3). The content jar exporter transpiles it to JavaScript (ADR 0031
 * D5); the vanilla pack exporters skip the `msm` layer.
 */
import type { Element, Json, OutputFile, Target } from '@msm/plugin-api';
import { isRecord, ScriptingLoweringError, scriptPath, splitResourceLocation } from './paths';

/** The text language id recorded on lowered script files. */
export const SCRIPT_LANGUAGE = 'typescript';

const isStringArray = (value: Json | undefined): value is string[] =>
  Array.isArray(value) && value.every((line) => typeof line === 'string');

/**
 * The source text of a script element: its lines joined with `\n` plus a trailing newline.
 *
 * @param element - The element; `data.lines` must be an array of strings.
 * @throws {@link ScriptingLoweringError} If `data.lines` is not a string array.
 */
export function scriptText(element: Element): string {
  const lines = isRecord(element.data) ? element.data.lines : undefined;
  if (!isStringArray(lines)) {
    throw new ScriptingLoweringError(`Element ${element.id}: "lines" must be an array of strings.`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Lowers a script element to `msm/<ns>/script/<path>.ts`: the source text as UTF-8 bytes in
 * the `msm` layer, with `language: 'typescript'` and no schema.
 *
 * @param element - The element; `data.lines` must be an array of strings.
 * @param _target - Unused: the runtime folder does not depend on the target.
 * @returns Exactly one output file.
 * @throws {@link ScriptingLoweringError} If the id is unsafe or `data.lines` is not a string
 *   array.
 */
export function lowerScript(element: Element, _target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  return [
    {
      path: scriptPath(namespace, path),
      contents: new TextEncoder().encode(scriptText(element)),
      layer: 'msm',
      language: SCRIPT_LANGUAGE,
    },
  ];
}
