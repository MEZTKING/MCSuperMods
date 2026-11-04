/**
 * Lowering for kinds that map one element to one JSON file under `data/<namespace>/`.
 */
import type { DataFolderKey, Element, OutputFile, Target } from '@msm/plugin-api';
import { dataPath, splitResourceLocation } from './paths';

/**
 * Lowers an element 1:1 into a data pack JSON file at
 * `data/<ns>/<target.folders.data[key]>[/<subfolder>]/<path>.json`.
 *
 * @param element - The element; its data is the file's contents.
 * @param target - The target supplying the folder name.
 * @param key - The data folder the file goes into.
 * @param schema - The schema reference recorded on the output for the validation gate.
 * @param subfolder - An optional folder below the target's folder, such as `biome` below
 *   `worldgen`.
 * @returns Exactly one output file in the `datapack` layer.
 * @throws {@link WorldgenLoweringError} If the element id or `subfolder` is unsafe.
 */
export function lowerJsonData(
  element: Element,
  target: Target,
  key: DataFolderKey,
  schema: string,
  subfolder?: string,
): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  return [
    {
      path: dataPath(target, key, namespace, path, subfolder),
      contents: structuredClone(element.data),
      layer: 'datapack',
      schema,
    },
  ];
}
