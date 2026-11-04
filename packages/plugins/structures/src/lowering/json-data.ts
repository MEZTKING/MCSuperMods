/**
 * Lowering for the worldgen JSON kinds: one element to one JSON file under
 * `data/<namespace>/<target.folders.data.worldgen>/<registry folder>/<path>.json`.
 */
import type { Element, OutputFile, Target } from '@msm/plugin-api';
import { dataPath, splitResourceLocation } from './paths';

/**
 * Lowers an element 1:1 into a data pack JSON file below the target's worldgen folder.
 *
 * @param element - The element; its data is the file's contents.
 * @param target - The target supplying the folder name.
 * @param subfolder - The registry folder below `worldgen`, such as `template_pool`.
 * @param schema - The schema reference recorded on the output for the validation gate.
 * @returns Exactly one output file in the `datapack` layer.
 * @throws {@link StructuresLoweringError} If the element id or `subfolder` is unsafe.
 */
export function lowerWorldgenJson(
  element: Element,
  target: Target,
  subfolder: string,
  schema: string,
): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  return [
    {
      path: dataPath(target, 'worldgen', namespace, path, '.json', subfolder),
      contents: structuredClone(element.data),
      layer: 'datapack',
      schema,
    },
  ];
}
