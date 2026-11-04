/**
 * `minecraft:structure_template` (ADR 0021): a structure template stored as JSON (schema
 * `msm:structure_template`) and lowered to a gzip vanilla structure `.nbt` file.
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerStructureTemplate } from '../lowering/structure-template';
import type { StructureTemplateData } from '../nbt/structure-template';

/** The kind id. */
export const STRUCTURE_TEMPLATE_KIND = 'minecraft:structure_template';

/** A 3×1×3 stone brick platform with no jigsaws. */
const DEFAULT_DATA: StructureTemplateData = {
  size: [3, 1, 3],
  palette: ['minecraft:stone_bricks'],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0],
    [2, 0, 1, 0],
    [0, 0, 2, 0],
    [1, 0, 2, 0],
    [2, 0, 2, 0],
  ],
};

/**
 * The structure template kind: folder `structure`, registry `structure` (so jigsaw pool
 * pieces and `location` references resolve), preview `structure`.
 */
export const structureTemplateKind: ElementKind = {
  id: STRUCTURE_TEMPLATE_KIND,
  schema: 'msm:structure_template',
  folder: 'structure',
  registry: 'structure',
  previewKind: 'structure',
  defaultData: DEFAULT_DATA,
  lower: lowerStructureTemplate,
};
