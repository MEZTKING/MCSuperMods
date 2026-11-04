/**
 * `@msm/core`: the MCSuperMods project model. IR types (re-exported from
 * `@msm/plugin-api`, ADR 0008), deterministic serialisation, project load/save with an
 * injected file system, the element kind registry and the undoable command stack.
 *
 * @packageDocumentation
 */

export type { CommandEvent, ProjectCommand } from './commands/command-stack';
export { CommandStack } from './commands/command-stack';
export { commands, DuplicateElementError, ElementNotFoundError } from './commands/commands';
export type { JsonPatchOperation } from './commands/json-pointer';
export { immerPatchesToJsonPatch, toJsonPointer } from './commands/json-pointer';
export type { MemoryFileSystem } from './fs/memory-file-system';
export { createMemoryFileSystem } from './fs/memory-file-system';
export { assertProjectRelativePath } from './fs/paths';
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
export { saveProject } from './io/save';
export * from './model/index';
export type { ProblemCode } from './problems/codes';
export { ProblemCodes } from './problems/codes';
export { DuplicateKindError, ElementKindRegistry } from './registry/element-kind-registry';
export { PluginCompatibilityError, registerPlugin } from './registry/register-plugin';
export { parseJson, stableStringify, utf8 } from './serialise/index';
