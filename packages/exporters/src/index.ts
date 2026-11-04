/**
 * `@msm/exporters`: turns lowered output into packs, jars and projects.
 *
 * Provides the export pipeline (`runExport`, with an injected `validateText` hook for text
 * outputs such as `mcfunction`), deterministic zips, output sinks and the vanilla pack
 * exporters: `resourcePackExporter` (`vanilla-packs`, alias `vanillaPacksExporter`) and
 * `dataPackExporter` (`vanilla-packs-data`).
 *
 * A combined export is two runs, not a third exporter: the host runs `resourcePackExporter`
 * and `dataPackExporter` into two zip sinks in one folder, named by `combinedFileNames`.
 *
 * @packageDocumentation
 */

export { assetOutputFiles, EXPORTED_ASSET_FOLDERS } from './assets';
export { outputFileBytes } from './contents';
export { EXPORT_MANIFEST_FILE, EXPORT_MANIFEST_FORMAT_VERSION, exportManifest } from './manifest';
export { type ExportProblemCode, ExportProblemCodes } from './problem-codes';
export { type ExportReport, type ExportRequest, runExport } from './run-export';
export { createFileSystemSink, createMemorySink, createZipSink } from './sinks';
export {
  combinedFileNames,
  createVanillaPacksExporter,
  dataPackExporter,
  defaultDataPackMcmeta,
  defaultResourcePackMcmeta,
  PACK_MCMETA_FILE,
  packFileName,
  resourcePackExporter,
  type VanillaPackKind,
  vanillaPacksExporter,
} from './vanilla-packs/index';
export { createZipBytes } from './zip';
