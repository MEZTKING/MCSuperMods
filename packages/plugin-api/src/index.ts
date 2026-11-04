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
  ProjectValidator,
  ValidationInput,
  ValidationRegistry,
} from './contributions';
export type { Json, JsonObject, ResourceLocation } from './json';
export type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  ElementTemplate,
  ExampleProject,
  ProjectStarter,
  TemplateContext,
} from './library';
export type { Asset, Element, ElementMeta, Namespace, Project } from './model';
export type { OutputFile, OutputLayer, OutputSink } from './output';
export { assertProjectRelativePath, isProjectRelativePath } from './paths';
export type { Plugin } from './plugin';
export { definePlugin, PluginDefinitionError } from './plugin';
export type { Problem, ProblemReporter, ProblemSeverity } from './problems';
export type {
  DataFolderKey,
  MigrationChange,
  MigrationReport,
  PackFormat,
  ResourceFolderKey,
  Target,
  WorldgenFacts,
} from './target';
export { API_VERSION } from './version';
