/**
 * `@msm/exporters`: turns lowered output into packs, jars and projects.
 *
 * Provides the export pipeline (`runExport`, with an injected `validateText` hook for text
 * outputs such as `mcfunction`), deterministic zips, output sinks and the vanilla pack
 * exporters: `resourcePackExporter` (`vanilla-packs`, alias `vanillaPacksExporter`) and
 * `dataPackExporter` (`vanilla-packs-data`), the Fabric content jar (`fabric-content-jar`,
 * with script transpilation through an injected `transpileScript`) and the Java project eject
 * (`java-project`, whose Java sources come from the target's `javaProject` generator).
 *
 * A combined export is two runs, not a third exporter: the host runs `resourcePackExporter`
 * and `dataPackExporter` into two zip sinks in one folder, named by `combinedFileNames`.
 *
 * @packageDocumentation
 */

export {
  assetOutputFiles,
  EXPORTED_ASSET_FOLDERS,
  isTextureMetaPath,
  TEXTURE_META_SCHEMA,
} from './assets';
export { outputFileBytes } from './contents';
export {
  contentJarFileName,
  createFabricContentJarExporter,
  DEFAULT_MOD_VERSION,
  defaultFabricModJson,
  FABRIC_CONTENT_JAR_EXPORTER_ID,
  FABRIC_MOD_ID_PATTERN,
  FABRIC_MOD_JSON_FILE,
  type FabricContentJarOptions,
  FabricContentJarProblemCodes,
  isScriptFile,
  MSM_RUNTIME_MOD_ID,
  nestedRuntimePath,
  RESERVED_MOD_IDS,
  SEPARATE_RUNTIME_OPTION,
  type ScriptTranspileResult,
  sanitiseModId,
  transpiledScriptPath,
} from './fabric-content-jar/index';
export {
  createJavaProjectExporter,
  type GradleWrapper,
  JAVA_PROJECT_EXPORTER_ID,
  JAVA_PROJECT_MOD_JSON,
  type JavaProjectOptions,
  javaPackageFor,
  modClassNameFor,
} from './java-project/index';
export { EXPORT_MANIFEST_FILE, EXPORT_MANIFEST_FORMAT_VERSION, exportManifest } from './manifest';
export { type ExportProblemCode, ExportProblemCodes } from './problem-codes';
export {
  type ExportReport,
  type ExportRequest,
  resolveExporterOptions,
  runExport,
} from './run-export';
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
