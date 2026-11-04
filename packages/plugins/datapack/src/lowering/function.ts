/**
 * Lowering for `minecraft:function`: `{ "lines": string[] }` becomes an `.mcfunction` file.
 */
import type { Element, Json, OutputFile, Target } from '@msm/plugin-api';
import { DataPackLoweringError, dataPath, splitResourceLocation } from './paths';

/** The text language id recorded on lowered function files. */
export const MCFUNCTION_LANGUAGE = 'mcfunction';

const isStringArray = (value: Json | undefined): value is string[] =>
  Array.isArray(value) && value.every((line) => typeof line === 'string');

/**
 * Lowers a function element to `data/<ns>/<target.folders.data.function>/<path>.mcfunction`:
 * the lines joined with `\n` plus a trailing newline, as UTF-8 bytes, with
 * `language: 'mcfunction'` and no schema.
 *
 * @param element - The element; `data.lines` must be an array of strings.
 * @param target - The target supplying the folder name.
 * @returns Exactly one output file in the `datapack` layer.
 * @throws {@link DataPackLoweringError} If the id is unsafe or `data.lines` is not a string
 *   array.
 */
export function lowerFunction(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = element.data;
  const lines =
    typeof data === 'object' && data !== null && !Array.isArray(data) ? data.lines : undefined;
  if (!isStringArray(lines)) {
    throw new DataPackLoweringError(`Element ${element.id}: "lines" must be an array of strings.`);
  }
  const text = lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  return [
    {
      path: dataPath(target, 'function', namespace, path, '.mcfunction'),
      contents: new TextEncoder().encode(text),
      layer: 'datapack',
      language: MCFUNCTION_LANGUAGE,
    },
  ];
}
