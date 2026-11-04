/**
 * Lowering for `minecraft:structure_template`: the element's JSON becomes a gzip vanilla
 * structure `.nbt` file with the target's `DataVersion` (ADR 0021).
 */
import type { Element, OutputFile, Target } from '@msm/plugin-api';
import { writeNbt } from '../nbt/binary';
import { type StructureTemplateData, structureTemplateToNbt } from '../nbt/structure-template';
import { dataPath, splitResourceLocation } from './paths';

/**
 * Lowers a structure template to `data/<ns>/<target.folders.data.structure>/<path>.nbt`.
 * Binary output: `contents` is a gzip `Uint8Array` and there is no `schema`. The bytes are
 * deterministic for the same element and target.
 *
 * @param element - The structure template element.
 * @param target - The target supplying the folder name and data version.
 * @returns Exactly one output file in the `datapack` layer.
 * @throws {@link StructuresLoweringError} If the id is unsafe.
 * @throws {@link StructureFormatError} If the data is inconsistent (for example a palette
 *   index out of range or invalid SNBT).
 */
export function lowerStructureTemplate(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const root = structureTemplateToNbt(
    element.data as unknown as StructureTemplateData,
    target.dataVersion,
  );
  return [
    {
      path: dataPath(target, 'structure', namespace, path, '.nbt'),
      contents: writeNbt(root, 'gzip'),
      layer: 'datapack',
    },
  ];
}
