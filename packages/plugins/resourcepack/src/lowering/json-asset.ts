/**
 * Lowering for kinds that map one element to one JSON file under `assets/<namespace>/`.
 */
import type { Element, OutputFile, ResourceFolderKey, Target } from '@msm/plugin-api';
import { assetPath, splitResourceLocation } from './paths';

/**
 * Lowers an element 1:1 into a resource pack JSON file.
 *
 * @param element - The element; its data is the file's contents.
 * @param target - The target supplying the folder name.
 * @param key - The resource folder the file goes into.
 * @param schema - The mcdoc type path recorded on the output for the validation gate.
 * @returns Exactly one output file.
 */
export function lowerJsonAsset(
  element: Element,
  target: Target,
  key: ResourceFolderKey,
  schema: string,
): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  return [
    {
      path: assetPath(target, key, namespace, path),
      contents: structuredClone(element.data),
      layer: 'resourcepack',
      schema,
    },
  ];
}
