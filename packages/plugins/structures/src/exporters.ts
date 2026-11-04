/**
 * Exporters for structure files (ADR 0021). Both consume the lowered output files: every
 * `data/<ns>/<target.folders.data.structure>/<path>.nbt` file in the `datapack` layer is
 * written into the chosen folder as `<ns>/<path>.nbt` (`structure-nbt`) or converted to a
 * Sponge schematic Version 3 at `<ns>/<path>.schem` (`sponge-schematic`).
 */
import type { Exporter, ExporterInput, OutputFile } from '@msm/plugin-api';
import { readNbt, writeNbt } from './nbt/binary';
import { schemFromStructureTemplate } from './nbt/schem';
import { structureTemplateFromNbt } from './nbt/structure-template';

/** One structure output: the source file and its `<ns>/<path>` without extension. */
export interface StructureOutput {
  file: OutputFile & { contents: Uint8Array };
  name: string;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The structure `.nbt` outputs among `files`, sorted by path.
 *
 * @param files - Lowered output files.
 * @param structureFolder - `target.folders.data.structure`.
 */
export function structureOutputs(
  files: readonly OutputFile[],
  structureFolder: string,
): StructureOutput[] {
  const pattern = new RegExp(`^data/([^/]+)/${escapeRegExp(structureFolder)}/(.+)\\.nbt$`);
  const outputs: StructureOutput[] = [];
  for (const file of files) {
    if (file.layer !== 'datapack' || !(file.contents instanceof Uint8Array)) continue;
    const match = pattern.exec(file.path);
    if (match === null) continue;
    outputs.push({
      file: file as OutputFile & { contents: Uint8Array },
      name: `${match[1]}/${match[2]}`,
    });
  }
  return outputs.sort((a, b) =>
    a.file.path < b.file.path ? -1 : a.file.path > b.file.path ? 1 : 0,
  );
}

function reportEmpty(input: ExporterInput, outputs: readonly StructureOutput[]): boolean {
  if (outputs.length > 0) return false;
  input.problems.report({
    severity: 'info',
    code: 'structures.nothing-to-export',
    message: 'The project has no structure templates to export.',
  });
  return true;
}

/** Writes every structure template as a vanilla `.nbt` file. */
export const structureNbtExporter: Exporter = {
  id: 'structure-nbt',
  displayName: 'Structure templates (.nbt)',
  layers: ['datapack'],
  async run(input) {
    const outputs = structureOutputs(input.files, input.target.folders.data.structure);
    if (reportEmpty(input, outputs)) return;
    for (const output of outputs) {
      await input.sink.writeFile(`${output.name}.nbt`, output.file.contents);
    }
  },
};

/** Converts every structure template to a Sponge schematic Version 3 `.schem` file. */
export const spongeSchematicExporter: Exporter = {
  id: 'sponge-schematic',
  displayName: 'Sponge schematics (.schem)',
  layers: ['datapack'],
  async run(input) {
    const outputs = structureOutputs(input.files, input.target.folders.data.structure);
    if (reportEmpty(input, outputs)) return;
    for (const output of outputs) {
      try {
        const { data } = structureTemplateFromNbt(readNbt(output.file.contents).root);
        const { root, problems } = schemFromStructureTemplate(data, input.target.dataVersion);
        for (const problem of problems)
          input.problems.report({ ...problem, file: output.file.path });
        await input.sink.writeFile(`${output.name}.schem`, writeNbt(root, 'gzip'));
      } catch (error) {
        input.problems.report({
          severity: 'error',
          code: 'structures.export-failed',
          file: output.file.path,
          message: `${output.file.path} could not be converted to a schematic: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  },
};

/** Both exporters. */
export const structureExporters: readonly Exporter[] = Object.freeze([
  structureNbtExporter,
  spongeSchematicExporter,
]);
