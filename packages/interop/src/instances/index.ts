/**
 * Instances for anything (ADR 0133): run recipes, the names and marker of the instances MSM
 * makes, the MultiMC-format writer (Prism Launcher, MultiMC, PolyMC) and `ensureInstance`.
 * Pure over an injected file system and hasher; nothing here starts a program or downloads.
 */

export {
  type EnsuredInstance,
  type EnsureInstanceDeps,
  ensureInstance,
} from './install';
export {
  INSTANCE_MARKER_FORMAT,
  type InstanceMarker,
  instanceMarkerText,
  listManaged,
  type ManagedInstanceEntry,
  type MarkerFile,
  parseInstanceMarker,
  readInstanceMarker,
} from './marker';
export {
  assertLoaderSupported,
  type InstancePlacement,
  LOADER_COMPONENTS,
  type LoaderComponent,
  markerMatches,
  placeInstance,
  recipeInstanceCfg,
  recipeMmcPack,
} from './mmc-writer';
export {
  candidateName,
  candidateSuffix,
  instanceBaseName,
  isMadeName,
  isSafeOwner,
  MAX_NAME_SUFFIX,
  MAX_OWNER_LABEL,
  ownerLabel,
  serverBaseName,
} from './names';
export {
  describeRecipe,
  InstanceError,
  type InstanceErrorCode,
  type InstanceRole,
  isPackFileName,
  isServerAddress,
  isWorldFolderName,
  type RecipeDescription,
  type RecipeExtraMod,
  type RecipeLauncher,
  type RecipeLoader,
  type RecipeLoaderKind,
  type RecipeMod,
  type RecipePack,
  type RecipePlace,
  type RecipeProjectFacts,
  type RecipeTargetFacts,
  type RecipeWorld,
  type RecipeWorldSource,
  RUN_RECIPE_FORMAT,
  type RunAction,
  type RunPurpose,
  type RunRecipe,
  recipeFor,
  type ServerAddress,
} from './recipe';
export {
  buildStaged,
  clearStaleStaging,
  newStagingId,
  STAGING_FOLDER,
  STAGING_STAMP,
  type StagingFileSystem,
  StagingTakenError,
} from './staging';
