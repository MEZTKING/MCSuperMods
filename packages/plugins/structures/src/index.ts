/**
 * `@msm/plugin-structures` (plugin id `msm.structures`): structure templates stored as JSON
 * and lowered to `.nbt` (ADR 0021), template pools, jigsaw structures, structure sets and
 * processor lists (ADR 0022), the `.nbt` and Sponge `.schem` importers and exporters, the
 * `structures.*` project validators and the "New element" templates.
 */
import { definePlugin } from '@msm/plugin-api';
import { structureExporters } from './exporters';
import { structureImporters } from './importers';
import { structureKinds } from './kinds';
import { structureTemplates } from './templates';
import { structureValidators } from './validators';

export * from './exporters';
export * from './importers';
export * from './kinds';
export * from './lowering';
export {
  NbtCodecError,
  type NbtCompression,
  parseSnbt,
  printSnbt,
  readNbt,
  writeNbt,
} from './nbt/binary';
export {
  type BlockState,
  BlockStateError,
  canonicalBlockState,
  parseBlockState,
  printBlockState,
} from './nbt/block-state';
export {
  decodeVarints,
  encodeVarints,
  SCHEM_WRITE_VERSION,
  STRUCTURE_VOID,
  schemFromStructureTemplate,
  structureTemplateFromSchem,
} from './nbt/schem';
export {
  type BlockEntityData,
  type EntityData,
  JIGSAW_BLOCK,
  type JigsawData,
  MAX_RECOMMENDED_SIZE,
  StructureFormatError,
  type StructureTemplateData,
  structureTemplateFromNbt,
  structureTemplateToNbt,
  type Vec3d,
  type Vec3i,
} from './nbt/structure-template';
export { structureTemplates } from './templates';
export * from './validators';

export default definePlugin({
  id: 'msm.structures',
  apiVersion: '^0.7.0',
  contributes: {
    elementKinds: [...structureKinds],
    elementTemplates: [...structureTemplates],
    importers: [...structureImporters],
    exporters: [...structureExporters],
    validators: [...structureValidators],
  },
});
