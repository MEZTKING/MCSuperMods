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
  GameCategory,
  ImageStarterParameter,
  NumberStarterParameter,
  ProjectStarter,
  SetStarterParameter,
  StarterCreatorInfo,
  StarterGameInfo,
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
  PluginSearchData,
  SearchBehaviour,
  SearchBehaviourSubject,
  SearchColour,
  SearchEntryContribution,
  SearchEntryOpensType,
  SearchLimits,
  SearchOwnThings,
  SearchQuestionHint,
  SearchValidation,
  SearchVocabulary,
  SearchWordGroup,
} from './search';
export {
  BUILT_IN_SEARCH_LIMITS,
  searchOwnThingsOf,
  THIRD_PARTY_SEARCH_LIMITS,
  validateSearchContributions,
} from './search';
export type {
  BiomeAttributeFacts,
  BlockFacts,
  CommandArgumentFacts,
  CommandFacts,
  CommandFormName,
  CommandFragmentName,
  ControlFacts,
  DataFolderKey,
  DataFormName,
  DefinitionInput,
  DevFacts,
  DevGameRuleFacts,
  DimensionHeightFacts,
  EntityFacts,
  FabricFacts,
  FixedPlacementShapeFacts,
  FluidTagFacts,
  GameRuleFacts,
  GameRuleKindName,
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
  PlantSoilFacts,
  RangedPullFacts,
  ResourceFolderKey,
  RuntimeKeyFacts,
  ScoreboardFacts,
  SoundSetFacts,
  StatFacts,
  StatFormatName,
  Target,
  TargetChannel,
  TargetFacts,
  TerrainPreviewApproximatePart,
  TerrainPreviewFacts,
  TradeSoundFacts,
  VanillaPairFacts,
  VanillaToolStats,
  VanillaTradeSetFacts,
  VehicleFacts,
  WorldFacts,
  WorldgenFacts,
} from './target';
export { API_VERSION } from './version';
