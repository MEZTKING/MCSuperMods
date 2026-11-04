/**
 * `@msm/plugin-api`: the public contract every MCSuperMods plugin uses, built-in or
 * third-party.
 *
 * @packageDocumentation
 */

export type {
  Command,
  EditorContribution,
  ElementKind,
  Exporter,
  ExporterInput,
  ImportedFile,
  Importer,
  ImportResult,
  PluginContributions,
} from './contributions';
export type { Json, JsonObject, ResourceLocation } from './json';
export type { Asset, Element, ElementMeta, Namespace, Project } from './model';
export type { OutputFile, OutputLayer, OutputSink } from './output';
export type { Plugin } from './plugin';
export { definePlugin, PluginDefinitionError } from './plugin';
export type { Problem, ProblemReporter, ProblemSeverity } from './problems';
export type { MigrationChange, MigrationReport, PackFormat, Target } from './target';
export { API_VERSION } from './version';
