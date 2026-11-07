/**
 * IPC channel names, kept free of runtime dependencies so that the sandboxed preload can
 * import them without bundling zod. Every channel is versioned: `msm:v<IPC_VERSION>:...`.
 *
 * @packageDocumentation
 */

/** The IPC contract version. Bump it, and every channel prefix, on a breaking change. */
export const IPC_VERSION = 1;

/** Request/response channels, handled with `ipcMain.handle` and called with `invoke`. */
export const InvokeChannels = {
  projectPickDirectory: 'msm:v1:project:pickDirectory',
  projectOpenRoot: 'msm:v1:project:openRoot',
  projectCreateRoot: 'msm:v1:project:createRoot',
  projectCloseRoot: 'msm:v1:project:closeRoot',
  projectCurrentRoot: 'msm:v1:project:currentRoot',
  projectRecent: 'msm:v1:project:recent',
  projectOpenRecent: 'msm:v1:project:openRecent',
  projectRemoveRecent: 'msm:v1:project:removeRecent',
  projectClearRecent: 'msm:v1:project:clearRecent',
  fsReadFile: 'msm:v1:fs:readFile',
  fsWriteFile: 'msm:v1:fs:writeFile',
  fsReadDir: 'msm:v1:fs:readDir',
  fsExists: 'msm:v1:fs:exists',
  fsMkdirp: 'msm:v1:fs:mkdirp',
  fsRemove: 'msm:v1:fs:remove',
  appInfo: 'msm:v1:app:info',
  dialogConfirmDiscard: 'msm:v1:dialog:confirmDiscard',
  dialogPickFiles: 'msm:v1:dialog:pickFiles',
  dialogSaveFile: 'msm:v1:dialog:saveFile',
  shellShowItemInFolder: 'msm:v1:shell:showItemInFolder',
  targetsReadVendored: 'msm:v1:targets:readVendored',
  settingsGet: 'msm:v1:settings:get',
  settingsSet: 'msm:v1:settings:set',
  minecraftStatus: 'msm:v1:minecraft:status',
  minecraftListLocations: 'msm:v1:minecraft:listLocations',
  minecraftExtract: 'msm:v1:minecraft:extract',
  minecraftReadAsset: 'msm:v1:minecraft:readAsset',
  minecraftListAssets: 'msm:v1:minecraft:listAssets',
  minecraftInstallResourcePack: 'msm:v1:minecraft:installResourcePack',
  minecraftListWorlds: 'msm:v1:minecraft:listWorlds',
  minecraftInstallDataPack: 'msm:v1:minecraft:installDataPack',
  mcfunctionCheck: 'msm:v1:mcfunction:check',
  mcfunctionComplete: 'msm:v1:mcfunction:complete',
  exportsPickFolder: 'msm:v1:exports:pickFolder',
  exportsWriteFiles: 'msm:v1:exports:writeFiles',
  exportsRuntimeJar: 'msm:v1:exports:runtimeJar',
  exportsGeckolibJar: 'msm:v1:exports:geckolibJar',
  exportsWriteTree: 'msm:v1:exports:writeTree',
  exportsGradleWrapper: 'msm:v1:exports:gradleWrapper',
  scriptingTranspile: 'msm:v1:scripting:transpile',
  scriptingCheck: 'msm:v1:scripting:check',
  testInMinecraftStatus: 'msm:v1:testInMinecraft:status',
  testInMinecraftCreateInstance: 'msm:v1:testInMinecraft:createInstance',
  testInMinecraftRun: 'msm:v1:testInMinecraft:run',
  testInMinecraftRunModpack: 'msm:v1:testInMinecraft:runModpack',
  modpacksList: 'msm:v1:modpacks:list',
  modpacksCreate: 'msm:v1:modpacks:create',
  modpacksAddExisting: 'msm:v1:modpacks:addExisting',
  modpacksForget: 'msm:v1:modpacks:forget',
  modpacksRead: 'msm:v1:modpacks:read',
  modpacksWrite: 'msm:v1:modpacks:write',
  modpacksAddProject: 'msm:v1:modpacks:addProject',
  modpacksReadProject: 'msm:v1:modpacks:readProject',
  modpacksLookupMod: 'msm:v1:modpacks:lookupMod',
  testInMinecraftPickLauncherProgram: 'msm:v1:testInMinecraft:pickLauncherProgram',
  thumbnailsGet: 'msm:v1:thumbnails:get',
  updatesCheck: 'msm:v1:updates:check',
  updatesInstall: 'msm:v1:updates:install',
  updatesCurrent: 'msm:v1:updates:current',
  appLaunchNotice: 'msm:v1:app:launchNotice',
  pluginsList: 'msm:v1:plugins:list',
  pluginsRead: 'msm:v1:plugins:read',
  pluginsOpenFolder: 'msm:v1:plugins:openFolder',
  aiKeyStatus: 'msm:v1:ai:keyStatus',
  aiSetKey: 'msm:v1:ai:setKey',
  aiClearKey: 'msm:v1:ai:clearKey',
  aiTestKey: 'msm:v1:ai:testKey',
  aiStart: 'msm:v1:ai:start',
  aiCancel: 'msm:v1:ai:cancel',
  aiToolResult: 'msm:v1:ai:toolResult',
  aiNewConversation: 'msm:v1:ai:newConversation',
  aiDropConversation: 'msm:v1:ai:dropConversation',
} as const;

/**
 * One-way channels: main to renderer (`menu`, `minecraftProgress`, `updatesStatus`) and
 * renderer to main (the others).
 */
export const EventChannels = {
  /** Main to renderer: a menu command, payload {@link MenuCommand}. */
  menu: 'msm:v1:menu',
  /** Main to renderer: "Open Recent" in the application menu, payload {@link MenuOpenRecent}. */
  menuOpenRecent: 'msm:v1:menu:openRecent',
  /** Main to renderer: asset extraction progress, payload {@link MinecraftProgress}. */
  minecraftProgress: 'msm:v1:minecraft:progress',
  /** Renderer to main: the renderer has rendered its first frame (used by smoke mode). */
  smokeReady: 'msm:v1:app:smokeReady',
  /** Renderer to main: whether the open project has unsaved changes, payload `boolean`. */
  setDirty: 'msm:v1:app:setDirty',
  /** Main to renderer: the auto-updater's state changed, payload {@link UpdateStatus}. */
  updatesStatus: 'msm:v1:updates:status',
  /** Main to renderer: an event of an AI helper run, payload {@link AiEventPayload}. */
  aiEvent: 'msm:v1:ai:event',
} as const;

/** The name of an invoke channel. */
export type InvokeChannel = (typeof InvokeChannels)[keyof typeof InvokeChannels];

/** Commands the application menu sends to the renderer. */
export const MENU_COMMANDS = [
  'new',
  'newProjectFromStarter',
  'open',
  'save',
  'undo',
  'redo',
  'importAssets',
  'importStructure',
  'importBlockbench',
  'exportResourcePack',
  'exportDataPack',
  'exportCombined',
  'installResourcePack',
  'installDataPack',
  'exportStructures',
  'exportSchematics',
  'exportFabricJar',
  'exportJavaProject',
  'testInMinecraft',
  'settings',
  'renameElement',
  'commandPalette',
  'checkForUpdates',
  'whatsNew',
  'firstMod',
  'modpacks',
  'toggleMode',
  'newWithAi',
  'pictureToTexture',
  'examples',
  'clearRecentProjects',
  'upgradeTarget',
  // ADR 0041 D8: View > "AI Helper".
  'toggleAiHelper',
  // ADR 0043: File > "Create…" opens the Creator.
  'creator',
] as const;

/** A command the application menu sends to the renderer. */
export type MenuCommand = (typeof MENU_COMMANDS)[number];

/** Whether a value is a known menu command. */
export function isMenuCommand(value: unknown): value is MenuCommand {
  return typeof value === 'string' && (MENU_COMMANDS as readonly string[]).includes(value);
}

/** The payload of {@link EventChannels.menuOpenRecent}: the recent project's root. */
export interface MenuOpenRecent {
  root: string;
}

/** Whether a value is a well-formed {@link MenuOpenRecent} payload. */
export function isMenuOpenRecent(value: unknown): value is MenuOpenRecent {
  if (typeof value !== 'object' || value === null) return false;
  const root = (value as Record<string, unknown>).root;
  return typeof root === 'string' && root.length > 0 && root.length <= 4096;
}

/** The `type` of every AI helper run event (`AiEvent` in `@msm/ai`, ADR 0041 D3). */
export const AI_EVENT_TYPES = [
  'turn_start',
  'text_delta',
  'thinking_delta',
  'tool_request',
  'tool_done',
  'usage',
  'fallback',
  'done',
] as const;

/**
 * The payload of {@link EventChannels.aiEvent}: one event of the run `runId`. `event` is an
 * `AiEvent` of `@msm/ai`; this file stays free of that dependency for the preload.
 */
export interface AiEventPayload<E extends { type: string } = { type: string }> {
  runId: string;
  event: E;
}

/**
 * A cheap shape check of an {@link AiEventPayload} for the preload: a run id and an event
 * whose `type` is known. Main builds the events itself, so the full schema is not repeated.
 */
export function isAiEventPayload(value: unknown): value is AiEventPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.runId !== 'string' || record.runId === '') return false;
  const event = record.event;
  if (typeof event !== 'object' || event === null) return false;
  const type = (event as Record<string, unknown>).type;
  return typeof type === 'string' && (AI_EVENT_TYPES as readonly string[]).includes(type);
}

/** The vendored data files of a target that the renderer may read. */
export const VENDORED_KEYS = [
  'vanillaMcdocSymbols',
  'mcmetaRegistries',
  'mcmetaVersion',
  'mcmetaCommands',
  'mcmetaBlocks',
] as const;

/** A vendored data file key. */
export type VendoredKeyName = (typeof VENDORED_KEYS)[number];

/** The phases of client-jar asset extraction, in order. */
export const MINECRAFT_PROGRESS_PHASES = ['reading', 'extracting', 'writing', 'done'] as const;

/** Asset extraction progress, sent on {@link EventChannels.minecraftProgress}. */
export interface MinecraftProgress {
  /** The Minecraft version being extracted. */
  mcVersion: string;
  phase: (typeof MINECRAFT_PROGRESS_PHASES)[number];
  /** Units done so far in this phase (files written in `writing`, otherwise 0 or 1). */
  done: number;
  /** Units in this phase. */
  total: number;
}

/** Whether a value is a well-formed {@link MinecraftProgress} payload. */
export function isMinecraftProgress(value: unknown): value is MinecraftProgress {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.mcVersion === 'string' &&
    typeof record.phase === 'string' &&
    (MINECRAFT_PROGRESS_PHASES as readonly string[]).includes(record.phase) &&
    typeof record.done === 'number' &&
    typeof record.total === 'number'
  );
}

/** Why the auto-updater is inactive in this run. */
export const UPDATE_DISABLED_REASONS = [
  /** Running from source (`app.isPackaged` is false). */
  'not-packaged',
  /** Only the Windows installer updates itself (releases are Windows only, ADR 0013). */
  'unsupported-platform',
  /** Smoke and end-to-end runs (`MSM_SMOKE`, `MSM_E2E_*`). */
  'test-run',
] as const;

/** Why the auto-updater is inactive. */
export type UpdateDisabledReason = (typeof UPDATE_DISABLED_REASONS)[number];

/**
 * The longest `error` status message that may cross IPC. Main sends short, sanitised text
 * only; the full error goes to the updater log file.
 */
export const UPDATE_STATUS_MESSAGE_MAX = 300;

/**
 * The longest release notes text that may cross IPC (Markdown made in main from the update
 * feed; longer notes are cut).
 */
export const UPDATE_NOTES_MAX = 20_000;

/** The auto-updater's state (ADR 0018), sent on {@link EventChannels.updatesStatus}. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'not-available'; reason?: UpdateNotAvailableReason }
  | { state: 'downloading'; percent: number; version?: string }
  | { state: 'downloaded'; version: string; notes?: string }
  | { state: 'error'; message: string }
  | { state: 'disabled'; reason: UpdateDisabledReason };

/**
 * Why a check found nothing newer, when it is not simply "up to date":
 * `no-published-release` means the update feed has no published (non-draft) release at all.
 */
export type UpdateNotAvailableReason = 'no-published-release';

/** Whether a value is a well-formed {@link UpdateStatus} payload. */
export function isUpdateStatus(value: unknown): value is UpdateStatus {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  switch (record.state) {
    case 'idle':
    case 'checking':
      return true;
    case 'not-available':
      return record.reason === undefined || record.reason === 'no-published-release';
    case 'available':
    case 'downloaded':
      return (
        typeof record.version === 'string' &&
        (record.notes === undefined ||
          (typeof record.notes === 'string' && record.notes.length <= UPDATE_NOTES_MAX))
      );
    case 'downloading':
      return (
        typeof record.percent === 'number' &&
        Number.isFinite(record.percent) &&
        (record.version === undefined || typeof record.version === 'string')
      );
    case 'error':
      return (
        typeof record.message === 'string' && record.message.length <= UPDATE_STATUS_MESSAGE_MAX
      );
    case 'disabled':
      return (
        typeof record.reason === 'string' &&
        (UPDATE_DISABLED_REASONS as readonly string[]).includes(record.reason)
      );
    default:
      return false;
  }
}

/**
 * The contribution points an external plugin may declare in `msm-plugin.json`
 * (`capabilities`, ADR 0035 D2).
 */
export const PLUGIN_CAPABILITIES = [
  'elementKinds',
  'elementTemplates',
  'projectStarters',
  'examples',
  'validators',
  'exporters',
  'importers',
] as const;

/** A capability an external plugin may declare. */
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

/**
 * Contribution points external plugins cannot use in 1.0 (ADR 0035 D2): they are host-side
 * (`editors`, `commands`) or carry vendored data (`targets`). The host ignores them with a
 * `plugin.capability-unsupported` warning.
 */
export const UNSUPPORTED_PLUGIN_CAPABILITIES = ['editors', 'commands', 'targets'] as const;

/** The largest plugin bundle (`main`) main reads, in bytes (ADR 0035 D1). */
export const PLUGIN_MAIN_MAX_BYTES = 4 * 1024 * 1024;

/** The largest schema file (`schemas[]`) main reads, in bytes (ADR 0035 D1). */
export const PLUGIN_SCHEMA_MAX_BYTES = 8 * 1024 * 1024;

/** The most schema files one manifest may list. */
export const PLUGIN_SCHEMAS_MAX = 16;

/** The most plugin folders main lists. */
export const PLUGINS_MAX = 64;

/** Problem codes of external plugin loading and calls (ADR 0035; Phase 7 plan). */
export const PluginProblemCodes = {
  /** `msm-plugin.json` is missing, not JSON, or breaks the manifest rules. */
  manifestInvalid: 'plugin.manifest-invalid',
  /** The manifest's `apiVersion` range excludes this build's plugin API version. */
  apiIncompatible: 'plugin.api-incompatible',
  /** The bundle or a schema file is over its size limit. */
  tooLarge: 'plugin.too-large',
  /** An id of the plugin uses the `minecraft` or `msm` namespace. */
  reservedNamespace: 'plugin.reserved-namespace',
  /** The bundle contributes a point the manifest does not declare. */
  capabilityMissing: 'plugin.capability-missing',
  /** The bundle contributes `editors`, `commands` or `targets` (ignored; a warning). */
  capabilityUnsupported: 'plugin.capability-unsupported',
  /** The plugin was not loaded: an id clashes, its schemas leave its namespace, or similar. */
  refused: 'plugin.refused',
  /** The plugin's worker threw, failed to start, or a call threw. */
  crashed: 'plugin.crashed',
  /** The plugin did not start or answer within its deadline. */
  timeout: 'plugin.timeout',
  /** An element's kind belongs to a plugin that is not running (blocks export). */
  unavailable: 'plugin.unavailable',
  /** A plugin function returned something other than JSON or `Uint8Array`. */
  badResult: 'plugin.bad-result',
} as const;

/** One of the `plugin.*` problem codes. */
export type PluginProblemCode = (typeof PluginProblemCodes)[keyof typeof PluginProblemCodes];
