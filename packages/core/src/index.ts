/**
 * `@msm/core`: the MCSuperMods project model. IR types (re-exported from
 * `@msm/plugin-api`, ADR 0008), deterministic serialisation, project load/save with an
 * injected file system, the element kind registry, the undoable command stack, the
 * lowering driver and the reference index.
 *
 * @packageDocumentation
 */

export type {
  CommandEvent,
  CommandStackOptions,
  ProjectCommand,
} from './commands/command-stack';
export { CommandStack } from './commands/command-stack';
export type { EditOptions } from './commands/commands';
export { commands, DuplicateElementError, ElementNotFoundError } from './commands/commands';
export type { JsonPatchOperation } from './commands/json-pointer';
export { immerPatchesToJsonPatch, parseJsonPointer, toJsonPointer } from './commands/json-pointer';
export type { MemoryFileSystem } from './fs/memory-file-system';
export { createMemoryFileSystem } from './fs/memory-file-system';
export { assertProjectRelativePath, isProjectRelativePath } from './fs/paths';
export type { DirEntry, ProjectFileSystem } from './fs/project-file-system';
export {
  ASSETS_DIR,
  CONTENT_DIR,
  elementFilePath,
  mediaTypeForPath,
  PROJECT_FILE,
} from './io/layout';
export type { LoadResult } from './io/load';
export { loadProject } from './io/load';
export type { Migrator } from './io/migrate';
export { migrateDocument, UnsupportedFormatVersionError } from './io/migrate';
export { elementMigrators, projectMigrators } from './io/migrators';
export type { SaveManifest, SaveOptions, SaveResult } from './io/save';
export { createSaveManifest, saveProject } from './io/save';
export type { LowerResult } from './lowering/lower-project';
export { lowerProject } from './lowering/lower-project';
export * from './model/index';
export type { ProblemCode } from './problems/codes';
export { ProblemCodes } from './problems/codes';
export type { Reference, ReferenceIndex } from './refs/reference-index';
export {
  buildReferenceIndex,
  compareReferences,
  normaliseReferenceId,
} from './refs/reference-index';
export { collectTextReferences } from './refs/text-references';
export {
  DuplicateKindError,
  defaultKindRegistry,
  ElementKindRegistry,
} from './registry/element-kind-registry';
export { PluginCompatibilityError, registerPlugin } from './registry/register-plugin';
export { parseJson, stableStringify, utf8 } from './serialise/index';
