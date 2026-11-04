/**
 * Importers for structure files (ADR 0021): vanilla structure templates (`.nbt`) and Sponge
 * schematics (`.schem`, Version 2 and 3) become `minecraft:structure_template` elements. The
 * original file is not kept as an asset; the element represents it fully.
 */
import type {
  Element,
  ImportedFile,
  Importer,
  ImportResult,
  Json,
  Problem,
  ResourceLocation,
} from '@msm/plugin-api';
import { STRUCTURE_TEMPLATE_KIND } from './kinds/structure-template';
import { NbtCodecError, readNbt } from './nbt/binary';
import { BlockStateError } from './nbt/block-state';
import { structureTemplateFromSchem } from './nbt/schem';
import {
  StructureFormatError,
  type StructureTemplateData,
  structureTemplateFromNbt,
} from './nbt/structure-template';

/** Which format a structure file is in. */
export type StructureFileFormat = 'nbt' | 'schem';

/** Options for {@link importStructureFile}. */
export interface StructureImportOptions {
  /** The target's data version; a newer file gets `structures.newer-data-version`. */
  targetDataVersion?: number;
  /** The `meta.createdAt` timestamp; the current time by default. */
  createdAt?: string;
}

/**
 * The element path for a file name: the base name without its extension, lower-cased, with
 * every character outside `a-z0-9_.-` replaced by `_`; `structure` when nothing is left.
 *
 * @param fileName - For example `My Hut (1).nbt`.
 * @returns For example `my_hut_1_`.
 */
export function elementPathFor(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
  const cleaned = stem
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/^[.]+/, '')
    .replace(/_+/g, '_');
  return cleaned === '' || /^[.]+$/.test(cleaned) ? 'structure' : cleaned;
}

/**
 * Imports one `.nbt` or `.schem` file. Never throws: an unreadable file gives an error
 * problem (`structures.import-failed`) and no element.
 *
 * @param file - The file.
 * @param namespace - The namespace of the new element.
 * @param format - The file's format.
 * @param options - See {@link StructureImportOptions}.
 * @returns One element (on success), no assets, and the problems found.
 */
export function importStructureFile(
  file: ImportedFile,
  namespace: string,
  format: StructureFileFormat,
  options: StructureImportOptions = {},
): ImportResult {
  const id = `${namespace}:${elementPathFor(file.name)}` as ResourceLocation;
  const convertOptions =
    options.targetDataVersion === undefined ? {} : { targetDataVersion: options.targetDataVersion };
  let data: StructureTemplateData;
  let problems: Problem[];
  try {
    const { root } = readNbt(file.bytes);
    const result =
      format === 'nbt'
        ? structureTemplateFromNbt(root, convertOptions)
        : structureTemplateFromSchem(root, convertOptions);
    data = result.data;
    problems = result.problems;
  } catch (error) {
    if (
      !(error instanceof NbtCodecError) &&
      !(error instanceof StructureFormatError) &&
      !(error instanceof BlockStateError)
    ) {
      throw error;
    }
    return {
      elements: [],
      assets: [],
      problems: [
        {
          severity: 'error',
          code: 'structures.import-failed',
          file: file.name,
          message: `${file.name} could not be imported: ${error.message}`,
        },
      ],
    };
  }
  const element: Element = {
    formatVersion: 1,
    id,
    kind: STRUCTURE_TEMPLATE_KIND,
    data: data as unknown as Json,
    meta: { createdAt: options.createdAt ?? new Date().toISOString() },
  };
  return {
    elements: [element],
    assets: [],
    problems: problems.map((problem) => ({ ...problem, elementId: id, file: file.name })),
  };
}

/** Imports vanilla structure template files (`.nbt`). */
export const structureNbtImporter: Importer = {
  id: 'structure-nbt',
  displayName: 'Structure template (.nbt)',
  extensions: ['nbt'],
  import: async (file, namespace) => importStructureFile(file, namespace, 'nbt'),
};

/** Imports Sponge schematics (`.schem`, Version 2 and 3). */
export const spongeSchematicImporter: Importer = {
  id: 'sponge-schematic',
  displayName: 'Sponge schematic (.schem)',
  extensions: ['schem'],
  import: async (file, namespace) => importStructureFile(file, namespace, 'schem'),
};

/** Both importers, in menu order. */
export const structureImporters: readonly Importer[] = Object.freeze([
  structureNbtImporter,
  spongeSchematicImporter,
]);
