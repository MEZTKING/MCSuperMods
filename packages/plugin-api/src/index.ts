/**
 * `@msm/plugin-api`: the public contract every MCSuperMods plugin uses, built-in or
 * third-party.
 *
 * @packageDocumentation
 */

export type { MaybePromise } from './async';
export type {
  Command,
  EditorContribution,
  ElementKind,
  ElementPatch,
  ElementPatchOrigin,
  ExpansionInput,
  ExpansionResult,
  Exporter,
  ExporterInput,
  ExporterOption,
  ImportedFile,
  Importer,
  ImportResult,
  PluginContributions,
  ProjectExpander,
  ProjectValidator,
  ValidationInput,
  ValidationRegistry,
} from './contributions';
export type { Json, JsonObject, ResourceLocation } from './json';
export type {
  AudioStarterParameter,
  BooleanStarterParameter,
  BundleContext,
  ChoiceStarterParameter,
  ColourStarterParameter,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  CreatorGroup,
  ElementTemplate,
  ExampleProject,
  ImageStarterParameter,
  NumberStarterParameter,
  ProjectStarter,
  SetStarterParameter,
  StarterCreatorInfo,
  StarterParameter,
  StarterParameterBase,
  StringStarterParameter,
  TemplateContext,
} from './library';
export type {
  Asset,
  Element,
  ElementCreatorMeta,
  ElementMeta,
  Namespace,
  Project,
} from './model';
export type { OutputFile, OutputLayer, OutputMergeMode, OutputSink } from './output';
export { assertProjectRelativePath, isProjectRelativePath } from './paths';
export type { Plugin } from './plugin';
export { definePlugin, PluginDefinitionError } from './plugin';
export type { Problem, ProblemReporter, ProblemSeverity } from './problems';
export type {
  BiomeAttributeFacts,
  BlockFacts,
  ControlFacts,
  DataFolderKey,
  DefinitionInput,
  DevFacts,
  DevGameRuleFacts,
  EntityFacts,
  FabricFacts,
  GeckolibFacts,
  GeneratedFile,
  ItemFacts,
  JavaProjectGenerator,
  JavaProjectInput,
  MigrationChange,
  MigrationReport,
  ModrinthFileFacts,
  PackFormat,
  ParticleFacts,
  RangedPullFacts,
  ResourceFolderKey,
  RuntimeKeyFacts,
  Target,
  TargetChannel,
  TargetFacts,
  VanillaToolStats,
  VehicleFacts,
  WorldgenFacts,
} from './target';
export { API_VERSION } from './version';
