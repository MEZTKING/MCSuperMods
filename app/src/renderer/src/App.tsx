import {
  createEmptyProject,
  type Json,
  type Problem,
  type Project,
  type Element as ProjectElement,
  type Reference,
  type ResourceLocation,
} from '@msm/core';
import { structureSaveFileName } from '@msm/interop';
import type { ExampleProject, Plugin, Target } from '@msm/plugin-api';
import { RULES_KIND } from '@msm/plugin-rules';
import type { SearchHit } from '@msm/search';
import { targetFacts } from '@msm/targets';
import { Dialog, Toast, Tooltip } from 'radix-ui';
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MenuCommand } from '../../shared/ipc-channels';
import type {
  AppSettingsPatch,
  LaunchableLauncher,
  LauncherSettings,
  MapsPlatform,
  MinecraftStatus,
  MsmBridge,
  RecentProjectView,
  WorldInfo,
} from '../../shared/platform';
import { elementChipLabel } from './ai/context-blocks';
import { SoundPlayerProvider, type SoundSources, SoundSourcesProvider } from './audio/provider';
import { createVanillaSoundReader } from './audio/vanilla-sounds';
import { namespaceOfId } from './changeset/creator-sets';
import {
  BUILT_IN_COMMAND_IDS,
  BUILT_IN_COMMANDS,
  type BuiltInCommandId,
  type CommandHandlers,
  definitionOf,
  type FocusedLocation,
  paletteCommands,
  referenceAt,
} from './commands/built-in-commands';
import { AiStartDialog } from './components/AiStartDialog';
import { AiPanel } from './components/ai/AiPanel';
import { AiController, useAiPanelStore } from './components/ai/ai-controller';
import type { AiPicture } from './components/ai/ai-pictures';
import { AiPicturesContext } from './components/ai-pictures/ai-pictures-host';
import { useAiPicturesHost } from './components/ai-pictures/use-ai-pictures-host';
import { type Choice, ChoiceDialog } from './components/ChoiceDialog';
import { CommandPalette, type PaletteCommand } from './components/CommandPalette';
import { ConfirmDialog } from './components/ConfirmDialog';
import { CreatorDialog, type CreatorEditRequest } from './components/creator/CreatorDialog';
import { type CreatorStart, creatorFlows } from './components/creator/creator-model';
import { EditorArea, type UsedByEntry } from './components/EditorArea';
import { ElementSidebar, GROUP_LABELS, TECHNICAL_GROUPS } from './components/ElementSidebar';
import { ExamplesDialog, mergedPhrase } from './components/ExamplesDialog';
import {
  defaultOptionValues,
  ExportFabricJarDialog,
  GECKOLIB_DOWNLOAD_MESSAGE,
  GECKOLIB_MISSING_CODE,
  GECKOLIB_TEST_DOWNLOAD_MESSAGE,
  projectNeedsGeckolib,
} from './components/ExportFabricJarDialog';
import {
  ExportJavaProjectDialog,
  FOLDER_NOT_EMPTY_CODE,
  JAVA_PROJECT_REVEAL_LABEL,
  javaProjectWrittenMessage,
  rulesNotInEject,
} from './components/ExportJavaProjectDialog';
import {
  type FunctionCaret,
  GO_TO_DEFINITION_EVENT,
  monacoCaret,
} from './components/function-editor/caret';
import { lineOffset } from './components/function-editor/source-text';
import { exampleForStarter } from './components/home/gallery/flow-examples';
import {
  type GalleryCard,
  galleryGroups,
  galleryModName,
} from './components/home/gallery/gallery-model';
import { HeroPicture } from './components/home/gallery/HeroPicture';
import { HomeGallery } from './components/home/gallery/HomeGallery';
import { Home } from './components/home/Home';
import { type MakeChoice, MakeChooser } from './components/home/MakeChooser';
import { MoreIdeas } from './components/home/MoreIdeas';
import { RenameThingDialog } from './components/home/MyThings';
import { copyData, copyId, type ThingCard, thingCards } from './components/home/things';
import { type MakeTile, type ShownTile, shownTiles } from './components/home/tiles';
import {
  ImportAssetsDialog,
  importFileFilters,
  importPickerTitle,
} from './components/ImportAssetsDialog';
import {
  BLOCKBENCH_IMPORT_NOTE,
  ImportFilesDialog,
  type TestWorldBuilds,
} from './components/ImportFilesDialog';
import {
  describeJarSource,
  type InstallTargetOption,
  installTargetName,
  type ManualLauncher,
  type ManualLauncherRoot,
} from './components/install-target';
import { ModpacksDialog } from './components/ModpacksDialog';
import { MC_TEXTURES_PREFIX } from './components/mc-textures/catalogue';
import {
  type McTexturePick,
  MinecraftTexturesContext,
  type MinecraftTexturesHost,
} from './components/mc-textures/host';
import {
  hasOverride,
  metaChange,
  overrideOf,
  pictureChange,
} from './components/mc-textures/picture-change';
import { LazyMinecraftTexturePicker } from './components/mc-textures/StartFromMinecraftButton';
import { NewElementDialog, NewNamespaceDialog } from './components/NewElementDialog';
import { modFolder, NewModDialog, NewProjectDialog } from './components/NewProjectDialog';
import { PluginExportDialog } from './components/PluginExportDialog';
import { RenameElementDialog } from './components/RenameElementDialog';
import { RightDock } from './components/RightDock';
import { SettingsDialog } from './components/SettingsDialog';
import { StatusBar } from './components/StatusBar';
import { StatusToast } from './components/StatusToast';
import { SETTINGS_CATALOGUE } from './components/settings-catalogue';
import { SurpriseDialog, type SurprisePrepare } from './components/surprise/SurpriseDialog';
import { TestInMinecraftDialog, testInMinecraftMessage } from './components/TestInMinecraftDialog';
import { ThingsToFix } from './components/ThingsToFix';
import { modKey, SearchDoorField, Toolbar, type ToolbarPluginExport } from './components/Toolbar';
import { NewTextureDialog } from './components/texture-editor/NewTextureDialog';
import { PictureToTextureDialog } from './components/texture-editor/PictureToTextureDialog';
import { TextureEditorDialog } from './components/texture-editor/TextureEditorDialog';
import { UpdateBanner, updateCheckMessage } from './components/UpdateBanner';
import { UpgradeTargetDialog } from './components/UpgradeTargetDialog';
import { UsagesDialog } from './components/UsagesDialog';
import { WelcomeDialog } from './components/WelcomeDialog';
import { WhatsNewDialog } from './components/WhatsNewDialog';
import { WishlistDialog } from './components/WishlistDialog';
import { WorldPickerDialog } from './components/WorldPickerDialog';
import type { ChangeOptions } from './forms';
import type { Idea, IdeaInput, IdeaSpec } from './ideas/ideas';
import { builtInPlugins } from './plugins/built-in';
import { PreviewPanel, type VanillaAssetReader } from './preview';
import type { SearchActionHost, SearchStartMod } from './search/actions';
import { type AskAiDraft, askAi, NO_KEY_LINE } from './search/ask-ai';
import type { SearchClient } from './search/client';
import type { ResultPreviewHost } from './search/ResultPreview';
import type { SearchActionOptions } from './search/SearchPanel';
import type { AppLists, SearchFeed, VanillaSort } from './search/sources';
import { SEARCH_MODE, type SearchActionKey, type SearchDoor, searchWords } from './search/wording';
import { closeRequestHandlers } from './session/close-requests';
import { namespaceFromFolderName } from './session/element-defaults';
import {
  DELETE_ANYWAY_LABEL,
  exportedIdsWarningText,
  REMOVE_ANYWAY_LABEL,
} from './session/exported-ids';
import { importerFileFilters, isBlockbenchImporter } from './session/importers';
import { backupNote, takeInstallBackup } from './session/install-backups';
import {
  FUNCTION_KIND,
  functionElementUri,
  mcfunctionProjectIds,
} from './session/mcfunction-problems';
import { flushPendingEdits } from './session/pending-edits';
import {
  displayNameOf,
  findProjectElement,
  missingPictureOf,
  type PlainFix,
  plainProblemWords,
  removeAtPointer,
  stepPointerOf,
} from './session/plain-problems';
import {
  APPLY_CHANGESET_LABEL,
  type ExportResult,
  type NewProjectOptions,
  type OpenOutcome,
  type PackDelivery,
  type PackKind,
  type ProjectSession,
} from './session/project-session';
import { createRenderLowering } from './session/render-lowering';
import { kindRegistry } from './session/schema-context';
import { type CommandSource, createCommandDeduper, shortcutFor } from './shortcuts';
import type { ShowcaseClip } from './showcase/clip';
import { ShowcaseGallery } from './showcase/ShowcaseGallery';
import { showcaseModName, showcasesFor } from './showcase/showcases';
import type { AiAppliedStep } from './store/ai-store';
import { connectPlay, usePlayStore } from './store/play-store';
import { usePreferences } from './store/preferences';
import { useUiStore } from './store/ui-store';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from './studios/blocks-items/host';
import { ElementForm } from './studios/ElementForm';
import {
  dataExportDisabledReason,
  dataInstallDisabledReason,
  elementLayers,
  errorCount,
  exportDisabledReason,
  exporterProblems,
  fabricJarExportDisabledReason,
  hasLayerOutput,
  hasMsmOutput,
  installDisabledReason,
  installTargetOption,
  layerProblems,
  MSM_CONTENT_NOTE,
  userFacingExportProblems,
} from './studios/export-state';
import type { CompleteFunction } from './studios/FunctionEditor';
import type { VeryEasyPick } from './studios/plain';
import { type PlainProblemWords, PlainProblemWordsContext } from './studios/rules/problem-words';
import { ScriptStudioHostContext } from './studios/scripting/host';
import { projectScripts } from './studios/scripting/script-model';
import { type StructureStudioHost, StructureStudioHostContext } from './studios/structures/host';
import { templateContext, templatesFor } from './studios/templates';
import { useSchemaContext } from './studios/use-schema-context';
import { rollSurprise, type SurpriseMod, themeById, themeOfSeed } from './surprise/surprise';
import { retexture, textureIdOf } from './textures/retexture';
import { TextureDropContext, type TextureDropHandler } from './textures/texture-drop';
import { useTryItStore } from './tryit/tryit-store';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isEditableTarget(element: Element | null): boolean {
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLInputElement &&
      element.type !== 'checkbox' &&
      element.type !== 'radio') ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/** Joins a project-relative path onto the absolute project root with the root's separator. */
export function joinProjectPath(root: string, relative: string): string {
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  const trimmed = root.endsWith(separator) ? root.slice(0, -1) : root;
  return `${trimmed}${separator}${relative.split('/').join(separator)}`;
}

/** Try it's view (ADR 0085), a lazy chunk with the simulation and the renderer. */
const TryItView = lazy(() => import('./tryit/TryItView'));
/** "Export as a map…" (ADR 0116 D2), a lazy chunk loaded when it opens. */
const ExportMapDialog = lazy(() => import('./components/ExportMapDialog'));

/** The search's actions (`run-action.ts`), loaded with the panel (ADR 0124 D9; B664). */
let searchActions: typeof import('./search/run-action') | null = null;
/** The search panel (ADR 0124 D6, D10; B663), a lazy chunk with the actions. */
const SearchPanel = lazy(async () => {
  const [panel, actions] = await Promise.all([
    import('./search/SearchPanel'),
    import('./search/run-action'),
  ]);
  searchActions = actions;
  return panel;
});
/** The selected result's live picture (ADR 0124 D9; B665). */
const ResultPreview = lazy(() => import('./search/ResultPreview'));
/** The user guide read inside the app (ADR 0124 D14; B661). */
const GuideDialog = lazy(() => import('./components/GuideDialog'));

/** The app's own lists the search reads (ADR 0124 D3; B660, B662). */
const SEARCH_LISTS: AppLists = {
  commands: BUILT_IN_COMMAND_IDS.map((id) => {
    const { title, sentence, words } = BUILT_IN_COMMANDS[id];
    return { id, title, sentence, words };
  }),
  settings: SETTINGS_CATALOGUE,
  kinds: {
    label: (kind) => GROUP_LABELS[kind],
    technical: (kind) => TECHNICAL_GROUPS.has(kind),
  },
};

/** The sorts of the vanilla layer, in the order a bare id is looked up (**Make something with it**). */
const VANILLA_SORTS: readonly VanillaSort[] = [
  'thing',
  'mob',
  'biome',
  'effect',
  'enchantment',
  'potion',
  'particle',
  'sound',
];

/** The search's engine side once loaded: the client and the feed that keeps its layers. */
interface SearchRuntime {
  readonly client: SearchClient;
  readonly feed: SearchFeed;
}

/** The command ids of an engine answer, best first (the palette door, ADR 0124 D10). */
function commandIdsOf(answer: {
  readonly best: readonly SearchHit[];
  readonly sections: readonly { readonly hits: readonly SearchHit[] }[];
}): string[] {
  const hits = [...answer.best, ...answer.sections.flatMap((section) => section.hits)];
  return hits.flatMap((hit) =>
    hit.entry.id.startsWith('command:') ? [hit.entry.id.slice('command:'.length)] : [],
  );
}

/** The menu command bound to the same accelerator as each keyboard shortcut. */
const menuEquivalent = {
  save: 'save',
  undo: 'undo',
  redo: 'redo',
  renameElement: 'renameElement',
  commandPalette: 'commandPalette',
  search: 'search',
  toggleAiHelper: 'toggleAiHelper',
  play: 'play',
  reloadGame: 'reloadGame',
  tryIt: 'tryIt',
} as const satisfies Record<string, MenuCommand>;

/**
 * The templates with the asked one (else those of the asked kind) first, so the New element
 * dialog opens on it (the search's **Make a new one**, ADR 0124 D9); unchanged without either.
 */
export function templatesFirst<T extends { readonly id: string; readonly kind: string }>(
  templates: readonly T[],
  kind?: string,
  template?: string,
): readonly T[] {
  if (kind === undefined && template === undefined) return templates;
  const wanted = (entry: T): boolean =>
    template !== undefined ? entry.id === template : entry.kind === kind;
  const first = templates.filter(wanted);
  if (first.length === 0) return templates;
  return [...first, ...templates.filter((entry) => !wanted(entry))];
}

/** Whether an export report was blocked because the GeckoLib jar could not be had. */
function hasGeckolibMissing(problems: readonly { code: string }[]): boolean {
  return problems.some((problem) => problem.code === GECKOLIB_MISSING_CODE);
}

/** Which importers the import dialog offers: structure files, or Blockbench models. */
type ImportMode = 'structure' | 'blockbench';

/** The dialog currently open, if any. */
type DialogState =
  | { type: 'namespace' }
  | {
      type: 'element';
      /** The kind or template to offer first (the search's **Make a new one**). */
      kind?: string;
      template?: string;
    }
  | {
      type: 'new-project';
      /** Flow starters to choose at once (a showcase card's **Make this**, ADR 0118 D10). */
      startWith?: readonly string[];
    }
  | { type: 'examples' }
  | {
      type: 'creator';
      edit?: CreatorEditRequest;
      flowIds?: readonly string[];
      picks?: readonly VeryEasyPick[];
      /** A new set of a flow with answers (the search's **Make this**, ADR 0124 D9). */
      start?: CreatorStart;
    }
  | {
      type: 'new-mod';
      parent: string;
      /** The name to start with (a showcase card's, "Elm Mod"). */
      name?: string;
      /** What to open once the mod is made (a showcase card's **Make this**, ADR 0118 D10). */
      afterwards?: ShownTile;
      /** The idea card to make in the new mod (its **Make this**, ADR 0128 D1, ADR 0129 D3). */
      surpriseIdea?: IdeaSpec;
      /** The search's new mod (ADR 0124 D9): what it is made from, and the answer. */
      search?: {
        options(folder: string): NewProjectOptions;
        resolve(made: boolean): void;
      };
    }
  | { type: 'surprise' }
  | { type: 'make-choice'; title: string; choices: readonly MakeChoice[] }
  | { type: 'rename-thing'; id: ResourceLocation; name: string }
  | { type: 'import'; namespace?: string }
  | { type: 'import-files'; mode: ImportMode }
  | { type: 'settings'; focus?: 'ai'; focusSetting?: string }
  | { type: 'remove-asset'; namespace: string; path: string }
  | {
      /** A delete that removes exported ids (ADR 0102 D5): confirm first. */
      type: 'delete-exported';
      title: string;
      message: string;
      confirmLabel: string;
      onConfirm(): void;
    }
  | { type: 'rename'; id: ResourceLocation; references: number }
  | { type: 'usages'; id: ResourceLocation; usages: readonly Reference[] }
  | { type: 'worlds'; worlds: readonly WorldInfo[] }
  | { type: 'fabric-jar' }
  | { type: 'export-map' }
  | { type: 'plugin-export'; exporterId: string }
  | { type: 'java-project' }
  | { type: 'test-in-minecraft' }
  | { type: 'upgrade-target' }
  | { type: 'whats-new'; version: string; notes?: string }
  | { type: 'welcome' }
  | { type: 'modpacks' }
  | { type: 'ai-start'; parent?: string; draft?: AskAiDraft }
  | {
      type: 'paint';
      namespace: string;
      path: string;
      bytes: Uint8Array | null;
      size?: { width: number; height: number };
      /** The texture does not exist yet: Save adds it as a project asset. */
      isNew?: boolean;
      /** MSM's animation sidecar of a picture started from an animated Minecraft texture. */
      mcmeta?: Uint8Array | null;
      /** The painter's title in place of "Paint <namespace>:<path>". */
      title?: string;
    }
  /** Change a Minecraft texture (ADR 0129 D4): the picker, then the painter on the pick. */
  | { type: 'minecraft-texture' }
  | { type: 'new-texture'; namespace: string }
  | {
      type: 'picture';
      namespace: string;
      /** Pictures dropped on the window, put in the tray (ADR 0054). */
      pictures?: { name: string; data: Uint8Array }[];
    }
  | { type: 'wishlist' }
  | { type: 'no-minecraft'; message: string }
  | {
      /** A question of the search's actions (ADR 0124 D9): one of a few named choices. */
      type: 'choice';
      title: string;
      lead?: string;
      choices: readonly Choice[];
      resolve(id: string | null): void;
    }
  | { type: 'guide'; page: string; anchor?: string };

/**
 * Where the caret is: the `data-pointer` of the focused form field, or `/lines/<n>` and the
 * column in the function editor (its text area, or Monaco's caret read through the editor
 * instance). `null` elsewhere.
 */
export function focusedLocation(active: Element | null): FocusedLocation | null {
  const caret = monacoCaret(active);
  if (caret !== null) return { pointer: `/lines/${caret.line}`, column: caret.column };
  if (
    active instanceof HTMLTextAreaElement &&
    active.dataset.testid === 'function-editor-fallback'
  ) {
    const before = active.value.slice(0, active.selectionStart);
    const line = before.split('\n').length - 1;
    const column = active.selectionStart - lineOffset(active.value, line);
    return { pointer: `/lines/${line}`, column };
  }
  const holder = active?.closest('[data-pointer]');
  const pointer = holder?.getAttribute('data-pointer');
  return pointer === null || pointer === undefined ? null : { pointer };
}

/**
 * Where **Show me** after adding goes (ADR 0125 D4): one thing opens it (its Studio, or in Very
 * easy the Creator set it belongs to); several open Home's My things in Very easy and select the
 * first in the sidebar otherwise. Things taken out or no longer in the project are left out;
 * `null` when none is left.
 */
export type ShowMeTarget =
  | { type: 'creator'; element: ProjectElement }
  | { type: 'open'; id: ResourceLocation }
  | { type: 'my-things' }
  | { type: 'select'; id: ResourceLocation };

/** Where Show me goes for `step`, by the project as it is now. */
export function showMeTarget(step: AiAppliedStep, project: Project | null): ShowMeTarget | null {
  const present = step.things.flatMap((thing) => {
    if (thing.op === 'removed') return [];
    const element = findProjectElement(project, thing.id);
    return element === undefined ? [] : [element];
  });
  const first = present[0];
  if (first === undefined) return null;
  if (present.length > 1) return { type: 'my-things' };
  if (first.meta.creator !== undefined) {
    return { type: 'creator', element: first };
  }
  return { type: 'open', id: first.id };
}

/** What the helpers below need of the AI controller. */
type AiAttach = Pick<AiController, 'askAboutElement' | 'draft' | 'setDraft'>;

/** Gives the waiting context chip its plain label (ADR 0125 D11). */
function relabelAiContext(controller: AiAttach, label: string): void {
  const draft = controller.draft();
  if (draft.context === null) return;
  controller.setDraft({ ...draft, context: { ...draft.context, label } });
}

/** Ask AI on an element: opens the helper with the element attached, and sends nothing. */
export function attachElementToAi(
  controller: AiAttach,
  id: ResourceLocation,
  project: Project | null,
): void {
  const element = findProjectElement(project, id);
  controller.askAboutElement(id);
  if (element !== undefined) relabelAiContext(controller, elementChipLabel(element));
}

/** What Undo and Put back of the helper's step need of the session. */
type AiStack = Pick<ProjectSession, 'undo' | 'redo'> & {
  readonly snapshot: {
    readonly undoLabel: string | undefined;
    readonly redoLabel: string | undefined;
  };
};

/** The helper's Undo: only while its Apply is the top of the stack (ADR 0125 D4). */
export function undoAiStep(session: AiStack): boolean {
  if (session.snapshot.undoLabel !== APPLY_CHANGESET_LABEL) return false;
  session.undo();
  return true;
}

/** The helper's Put back: only while its Apply is the top of the redo stack. */
export function redoAiStep(session: AiStack): boolean {
  if (session.snapshot.redoLabel !== APPLY_CHANGESET_LABEL) return false;
  session.redo();
  return true;
}

const NO_WORLDS: readonly WorldInfo[] = [];

const NO_LAUNCHERS: LauncherSettings = { prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] };

/** The settings list holding the manually added folders of each launcher. */
const LAUNCHER_LISTS = {
  prism: 'prismDataDirs',
  multimc: 'multimcRoots',
  curseforge: 'curseForgeRoots',
} as const satisfies Record<ManualLauncher, keyof LauncherSettings>;

const FOLDER_PICKER_TITLES: Record<ManualLauncher, string> = {
  prism: 'Choose your Prism Launcher folder',
  multimc: 'Choose your MultiMC or PolyMC folder',
  curseforge: 'Choose your CurseForge Minecraft folder',
};

/**
 * A path as a comparison key: forward slashes, no trailing separator, and case-folded for
 * Windows drive paths (which are case-insensitive).
 */
export function launcherPathKey(path: string): string {
  let key = path.replaceAll('\\', '/');
  while (key.length > 1 && key.endsWith('/') && !/^[A-Za-z]:\/$/.test(key)) {
    key = key.slice(0, -1);
  }
  return /^[A-Za-z]:/.test(key) ? key.toLowerCase() : key;
}

/** The launcher folders the user added, with how many locations were found under each. */
export function manualLauncherRoots(
  launchers: LauncherSettings | null,
  locations: readonly { ref: { launcher: string; root: string } }[] | null,
): ManualLauncherRoot[] {
  if (launchers === null) return [];
  const roots: ManualLauncherRoot[] = [];
  for (const kind of Object.keys(LAUNCHER_LISTS) as ManualLauncher[]) {
    for (const path of launchers[LAUNCHER_LISTS[kind]]) {
      const root: ManualLauncherRoot = { kind, path };
      if (locations !== null) {
        const key = launcherPathKey(path);
        root.found = locations.filter(
          (location) =>
            location.ref.launcher === kind && launcherPathKey(location.ref.root) === key,
        ).length;
      }
      roots.push(root);
    }
  }
  return roots;
}

/** The selected target's warnings (such as a version mismatch), repeated after an install. */
function targetWarnings(status: MinecraftStatus | null): string[] {
  if (status === null) return [];
  const warnings = status.warnings ?? status.target?.warnings ?? [];
  return warnings.map((warning) => warning.message);
}

/** The structure exporters, which the Export menu lists under their own labels. */
const STRUCTURE_EXPORTER_IDS: ReadonlySet<string> = new Set(['structure-nbt', 'sponge-schematic']);

/** A zero-argument action that also reports its own errors. */
type Action = () => void;

/** The application shell: toolbar, sidebar, editor (Form and Raw JSON), Preview and Problems. */
/** The contexts around the shell: texture drops and the plain-language problem words. */
function ShellProviders(props: {
  textureDrop: TextureDropHandler | null;
  plainWords: PlainProblemWords;
  sounds: SoundSources;
  children: ReactNode;
}) {
  return (
    <TextureDropContext.Provider value={props.textureDrop}>
      <PlainProblemWordsContext.Provider value={props.plainWords}>
        {/* The one sound player and what every Play button reads (ADR 0121 D2, B622). */}
        <SoundPlayerProvider>
          <SoundSourcesProvider value={props.sounds}>{props.children}</SoundSourcesProvider>
        </SoundPlayerProvider>
      </PlainProblemWordsContext.Provider>
    </TextureDropContext.Provider>
  );
}

export function App({
  session,
  bridge,
  externalPlugins,
}: {
  session: ProjectSession;
  bridge: MsmBridge;
  /** The third-party plugins' facades (registered after the built-ins), for the search's data. */
  externalPlugins?: readonly Plugin[];
}) {
  const snapshot = useUiStore((state) => state.snapshot) ?? session.snapshot;
  const selectedId = useUiStore((state) => state.selectedId);
  const selectedPointer = useUiStore((state) => state.selectedPointer);
  const selectedRange = useUiStore((state) => state.selectedRange);
  const activeTab = useUiStore((state) => state.activeTab);
  const rightDock = useUiStore((state) => state.rightDock);
  const minecraft = useUiStore((state) => state.minecraft);
  const exportProblems = useUiStore((state) => state.exportProblems);
  const { select, setMessage, setActiveTab, setRightDock, navigateTo, setExportProblems } =
    useUiStore.getState();
  const clearPointer = useCallback(() => useUiStore.getState().selectPointer(null), []);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [exporting, setExporting] = useState(false);
  /** Where "Share my mod" last saved the jar, for "Where is it?" (ADR 0083 D4). */
  const [sharedJar, setSharedJar] = useState<string | null>(null);
  const [assetRevision, setAssetRevision] = useState(0);
  const [recentProjects, setRecentProjects] = useState<readonly RecentProjectView[]>([]);
  const [recentPickerOpen, setRecentPickerOpen] = useState(false);
  const deduper = useRef(createCommandDeduper()).current;

  useEffect(() => {
    const { setSnapshot } = useUiStore.getState();
    setSnapshot(session.snapshot);
    return session.subscribe(setSnapshot);
  }, [session]);

  useEffect(() => {
    bridge.setDirty(snapshot.dirty);
    const name = snapshot.project?.name;
    document.title = name === undefined ? 'MSM' : `MSM — ${name}${snapshot.dirty ? '*' : ''}`;
  }, [bridge, snapshot]);

  // Report readiness after the first frame has been painted.
  useEffect(() => {
    const frame = requestAnimationFrame(() => bridge.smokeReady());
    return () => cancelAnimationFrame(frame);
  }, [bridge]);

  // Asset extraction progress from main (plan D3); the settings dialog reads it.
  useEffect(
    () =>
      bridge.onMinecraftProgress((progress) => {
        useUiStore.getState().setMinecraftProgress(progress.phase === 'done' ? null : progress);
      }),
    [bridge],
  );

  /**
   * Reads the Minecraft status and the game locations (ADR 0019) for the open project's
   * target into the store. Resolves once both have been read, successfully or not.
   */
  const refreshMinecraftStatus = useCallback(async (): Promise<void> => {
    const store = useUiStore.getState();
    await Promise.all([
      session.minecraftStatus().then(
        (status) => store.setMinecraftStatus(status),
        () => store.setMinecraftStatus(null),
      ),
      session.listLocations().then(
        (locations) => store.setMinecraftLocations(locations),
        () => store.setMinecraftLocations(null),
      ),
    ]);
  }, [session]);

  /** Reads the manually added launcher folders into the store. */
  const refreshLaunchers = useCallback(async (): Promise<LauncherSettings> => {
    const settings = await session.getSettings();
    const launchers = settings.launchers ?? NO_LAUNCHERS;
    useUiStore.getState().setLauncherSettings(launchers);
    return launchers;
  }, [session]);

  useEffect(() => {
    void refreshMinecraftStatus();
    refreshLaunchers().catch(() => useUiStore.getState().setLauncherSettings(null));
  }, [refreshMinecraftStatus, refreshLaunchers]);

  /** Reads the recent projects (with their `exists` flags) into state. */
  const refreshRecent = useCallback(async (): Promise<void> => {
    try {
      setRecentProjects(await session.recentProjects());
    } catch {
      setRecentProjects([]);
    }
  }, [session]);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  const run = useCallback(
    (label: string, action: () => void) => {
      try {
        action();
        setMessage(null);
      } catch (error) {
        setMessage({ kind: 'error', text: `${label}: ${messageOf(error)}` });
      }
    },
    [setMessage],
  );

  const openWith = useCallback(
    async (label: string, action: () => Promise<OpenOutcome>) => {
      try {
        const outcome = await action();
        if (outcome.ok) {
          select(null);
          setExportProblems([]);
          const skipped = session.skippedFileCount;
          setMessage(
            skipped > 0
              ? {
                  kind: 'error',
                  text: `${skipped} file(s) could not be loaded and were left untouched (see Problems).`,
                }
              : { kind: 'info', text: `${label}: ${session.snapshot.root ?? ''}` },
          );
          void refreshMinecraftStatus();
        } else if ('reason' in outcome) {
          setMessage({ kind: 'error', text: `${label} failed: ${outcome.reason}` });
        }
      } catch (error) {
        setMessage({ kind: 'error', text: `${label} failed: ${messageOf(error)}` });
      }
      // Main records every successful open or create in the recent list.
      void refreshRecent();
    },
    [select, session, setMessage, setExportProblems, refreshMinecraftStatus, refreshRecent],
  );

  const previewUpgrade = useCallback(
    (targetId: string) => session.upgradeTargetPreview(targetId),
    [session],
  );

  const openRecent = useCallback(
    (root: string) => void openWith('Open project', () => session.openRecent(root)),
    [openWith, session],
  );

  const removeRecent = useCallback(
    (root: string) => {
      session
        .removeRecentProject(root)
        .catch((error: unknown) =>
          setMessage({ kind: 'error', text: `Remove recent project: ${messageOf(error)}` }),
        )
        .finally(() => void refreshRecent());
    },
    [session, setMessage, refreshRecent],
  );

  const clearRecent = useCallback(() => {
    session
      .clearRecentProjects()
      .then(
        () => setMessage({ kind: 'info', text: 'Cleared the recent projects list.' }),
        (error: unknown) =>
          setMessage({ kind: 'error', text: `Clear recent projects: ${messageOf(error)}` }),
      )
      .finally(() => void refreshRecent());
  }, [session, setMessage, refreshRecent]);

  const save = useCallback(async () => {
    try {
      await session.save();
      setMessage({ kind: 'info', text: 'Saved.' });
    } catch (error) {
      setMessage({ kind: 'error', text: messageOf(error) });
    }
  }, [session, setMessage]);

  const project = snapshot.project;
  const namespaces = useMemo(
    () => project?.namespaces.map((namespace) => namespace.name) ?? [],
    [project],
  );
  const canAddElement = namespaces.length > 0;
  // Saving is never blocked by problems (ADR 0012); errors block export only.
  const saveDisabledReason = project === null ? 'No project is open.' : null;

  let target: Target | null = null;
  try {
    target = session.target;
  } catch {
    target = null;
  }
  const schema = useSchemaContext(session, project === null || target === null ? null : target.id);

  // Selection ---------------------------------------------------------------------------

  const selected =
    project?.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((e) => e.id === selectedId) ?? null;
  const selectedKind = selected === null ? undefined : session.registry.get(selected.kind);
  const selectedProblems = useMemo(
    () =>
      selected === null
        ? []
        : snapshot.problems.filter((problem) => problem.elementId === selected.id),
    [snapshot.problems, selected],
  );

  // AI helper (ADR 0041) ------------------------------------------------------------------

  const aiController = useMemo(
    () =>
      bridge.ai === undefined
        ? null
        : new AiController({ session, ai: bridge.ai, loadSettings: () => session.getSettings() }),
    [session, bridge],
  );
  useEffect(() => {
    if (aiController === null) return undefined;
    const detach = aiController.attach();
    void aiController.refresh();
    return detach;
  }, [aiController]);
  const aiKeySet = useAiPanelStore((state) => state.keyStatus?.set === true);
  const aiModel = useAiPanelStore((state) => state.settings?.model);
  // AI pictures (ADR 0093): the status of main's image services, for "Make with AI".
  const aiPicturesHost = useAiPicturesHost(bridge.aiPictures, () =>
    setDialog({ type: 'settings' }),
  );
  // View preferences (ADR 0047): the collapsed sidebar groups.
  const collapsedGroups = usePreferences((state) => state.collapsed);
  const flowTitles = useMemo(
    () =>
      Object.fromEntries(
        session.library.starters
          .filter((starter) => starter.creator !== undefined)
          .map((starter) => [starter.id, starter.title]),
      ),
    [session],
  );
  // Play (ADR 0084): the controls read the store; blocking problems show in "Things to fix"
  // (ADR 0083 D5, ADR 0130 D5).
  useEffect(
    () =>
      connectPlay(session, bridge, {
        notify(message) {
          useUiStore.getState().setMessage({
            ...message,
            text: message.text.replace('See Problems.', 'See Things to fix.'),
          });
        },
        showProblems(problems) {
          useUiStore.getState().setExportProblems(problems);
        },
      }),
    [session, bridge],
  );
  const playConnected = usePlayStore((state) => state.host !== null);
  const tryItOpen = useTryItStore((state) => state.open);
  // Try it's area belongs to one project (ADR 0085 D13): a new root, or none, resets it.
  const projectRoot = snapshot.root;
  useEffect(() => {
    const store = useTryItStore.getState();
    if (store.areaRoot !== null && store.areaRoot !== projectRoot) store.reset();
    if (projectRoot === null) store.reset();
  }, [projectRoot]);
  // Choosing an element leaves Try it (it keeps its area for the way back).
  useEffect(() => {
    if (selectedId !== null) useTryItStore.getState().close();
  }, [selectedId]);
  const canReloadGame = usePlayStore((state) => state.status?.canReload === true);
  // The plain-language words for Rule cards and "Things to fix" (ADR 0083 D5).
  const plainWords = useMemo(() => plainProblemWords(project), [project]);
  const tileAvailability = useMemo(() => {
    if (target === null) return null;
    const available = new Set(
      creatorFlows(session.library.starters, target)
        .filter((flow) => flow.unavailable === null)
        .map((flow) => flow.starter.id),
    );
    const starters = new Set(
      session.library.starters
        .filter(
          (starter) =>
            starter.creator === undefined &&
            (starter.supports === undefined || starter.supports(target)),
        )
        .map((starter) => starter.id),
    );
    return {
      flowAvailable: (id: string) => available.has(id),
      starterAvailable: (id: string) => starters.has(id),
      rules: session.registry.get(RULES_KIND) !== undefined,
      ai: aiController !== null,
    };
  }, [session, target, aiController]);
  const homeTiles = useMemo(
    () => (tileAvailability === null ? [] : shownTiles(tileAvailability)),
    [tileAvailability],
  );
  const homeCards = useMemo(() => thingCards(project, flowTitles), [project, flowTitles]);
  const aiConversationModel = useAiPanelStore((state) =>
    snapshot.root === null ? null : (state.models[snapshot.root] ?? null),
  );
  // The problem the user last went to from Problems; "Explain this problem" uses it while it
  // belongs to the selected element, else the selected element's first problem.
  const [lastProblem, setLastProblem] = useState<Problem | null>(null);
  const selectedProblem =
    (lastProblem !== null &&
    lastProblem.elementId === selected?.id &&
    selectedProblems.some(
      (problem) =>
        problem.code === lastProblem.code &&
        problem.path === lastProblem.path &&
        problem.message === lastProblem.message,
    )
      ? lastProblem
      : selectedProblems[0]) ?? null;

  // Export and install --------------------------------------------------------------------

  // A kind that lowers asynchronously (a sandboxed plugin, ADR 0035) is lowered once per
  // element version; the checks below run again when it settles. Export lowers everything
  // with the asynchronous driver.
  const [renderLoweringRound, setRenderLoweringRound] = useState(0);
  const renderLowering = useMemo(
    // A new session (registry) or target starts a fresh cache.
    () =>
      session !== null && target !== null
        ? createRenderLowering(() => setRenderLoweringRound((n) => n + 1))
        : null,
    [session, target],
  );
  // renderLoweringRound: a settled asynchronous lowering re-runs the checks that use this.
  const lowerForTarget = useCallback(
    (element: ProjectElement) => {
      const kind = session.registry.get(element.kind);
      if (kind === undefined || target === null || renderLowering === null) return [];
      return renderLowering(element, () => kind.lower(element, target));
    },
    [session, target, renderLowering, renderLoweringRound],
  );
  const layers = useMemo(
    () => (project === null ? null : elementLayers(project, lowerForTarget)),
    [project, lowerForTarget],
  );
  const hasDataPack = useMemo(
    () => project !== null && hasLayerOutput(project, 'datapack', lowerForTarget),
    [project, lowerForTarget],
  );
  const hasResourcePack = useMemo(
    () =>
      project !== null &&
      (project.namespaces.some((namespace) => namespace.assets.length > 0) ||
        hasLayerOutput(project, 'resourcepack', lowerForTarget)),
    [project, lowerForTarget],
  );
  // Blocks, items and the mod element lower to the `msm` layer, which only the jar carries.
  const hasMsmContent = useMemo(
    () => project !== null && hasMsmOutput(project, lowerForTarget),
    [project, lowerForTarget],
  );
  // Errors block per pack: an error in an element that lowers only to the data pack leaves
  // the resource pack exportable, and the other way round.
  const resourceProblems = useMemo(
    () =>
      layers === null
        ? snapshot.problems
        : layerProblems(snapshot.problems, layers, 'resourcepack'),
    [snapshot.problems, layers],
  );
  const dataProblems = useMemo(
    () =>
      layers === null ? snapshot.problems : layerProblems(snapshot.problems, layers, 'datapack'),
    [snapshot.problems, layers],
  );
  const combinedProblems = useMemo(
    () => [...new Set([...resourceProblems, ...dataProblems])],
    [resourceProblems, dataProblems],
  );

  const exportReason = exportDisabledReason(project !== null, resourceProblems);
  const installReason = installDisabledReason(project !== null, resourceProblems, minecraft.status);
  const dataExportReason = dataExportDisabledReason(project !== null, dataProblems, hasDataPack);
  const combinedReason = dataExportDisabledReason(project !== null, combinedProblems, hasDataPack);
  const dataInstallReason = dataInstallDisabledReason(
    project !== null,
    dataProblems,
    minecraft.status,
    hasDataPack,
  );
  // The jar packages every layer, so every error blocks it.
  const fabricJarReason = fabricJarExportDisabledReason(project !== null, snapshot.problems);
  // Structure files come from the data pack layer, so its errors block them.
  const structureExportReason = exportDisabledReason(project !== null, dataProblems);

  /** Runs one export or install and reports the outcome. */
  const runPackExport = async (
    pack: PackKind,
    mode: PackDelivery,
    action: () => Promise<ExportResult>,
  ): Promise<void> => {
    setExporting(true);
    const verb = mode === 'install' ? 'Install' : 'Export';
    try {
      const result = await action();
      setExportProblems(userFacingExportProblems(result.problems));
      if (!result.ok) {
        setRightDock('problems');
        const errors = errorCount(result.problems);
        setMessage({
          kind: 'error',
          text: `${verb} blocked by ${errors} error(s); nothing was written. See Problems.`,
        });
        return;
      }
      if (result.cancelled === true) return;
      const warnings = result.problems.filter((problem) => problem.severity === 'warning').length;
      const suffix = warnings > 0 ? ` ${warnings} warning(s), see Problems.` : '';
      let text: string;
      if (mode === 'combined') {
        text = `Exported the resource pack and the data pack to ${result.location ?? 'the chosen folder'}.`;
      } else if (mode === 'install' && pack === 'data') {
        text = `Installed to ${result.location ?? 'the world'}.${backupNote(takeInstallBackup())} In Minecraft, open the world (or run /reload in it), then check /datapack list.`;
      } else if (mode === 'install') {
        text = `Installed to ${result.location ?? 'the resourcepacks folder'}. In Minecraft, open Options, then Resource Packs, and move the pack to the selected side.`;
      } else {
        text = `Exported to ${result.location ?? 'the chosen file'}.`;
      }
      if (hasMsmContent) text = `${text} ${MSM_CONTENT_NOTE}`;
      // Version mismatches never block an install (ADR 0019), so say it again afterwards.
      const notes =
        mode === 'install'
          ? targetWarnings(useUiStore.getState().minecraft.status)
              .map((warning) => ` ${warning}`)
              .join('')
          : '';
      setMessage({ kind: 'info', text: `${text}${notes}${suffix}` });
    } catch (error) {
      setMessage({ kind: 'error', text: `${verb} failed: ${messageOf(error)}` });
    } finally {
      setExporting(false);
    }
  };

  /** Runs the Fabric mod jar export with the dialog's option values and reports the outcome. */
  const runFabricJarExport = async (values: Record<string, Json>, share = false): Promise<void> => {
    setExporting(true);
    try {
      const result = await session.exportFabricJar(values);
      setExportProblems(userFacingExportProblems(result.problems));
      if (!result.ok) {
        if (!share) setRightDock('problems');
        const errors = errorCount(result.problems);
        setMessage({
          kind: 'error',
          text: hasGeckolibMissing(result.problems)
            ? GECKOLIB_DOWNLOAD_MESSAGE
            : share
              ? `Your mod could not be made: ${errors} thing(s) to fix first. See Things to fix.`
              : `Export blocked by ${errors} error(s); nothing was written. See Problems.`,
        });
        return;
      }
      if (result.cancelled === true) return;
      if (share && result.location !== undefined) {
        // "Share my mod" (ADR 0083 D4): say where the file is, with "Where is it?".
        setSharedJar(result.location);
        setMessage({
          kind: 'info',
          text: 'Your mod is saved as one file. Friends put it in their mods folder, next to Fabric API.',
        });
        return;
      }
      const warnings = result.problems.filter((problem) => problem.severity === 'warning').length;
      const suffix = warnings > 0 ? ` ${warnings} warning(s), see Problems.` : '';
      setMessage({
        kind: 'info',
        text: `Exported the Fabric mod jar to ${result.location ?? 'the chosen file'}. Put it in the mods folder with Fabric API.${suffix}`,
      });
    } catch (error) {
      setMessage({ kind: 'error', text: `Export failed: ${messageOf(error)}` });
    } finally {
      setExporting(false);
    }
  };

  /** Runs the Java project export (ADR 0033), which asks for the folder, and reports it. */
  const runJavaProjectExport = async (): Promise<void> => {
    setExporting(true);
    try {
      const result = await session.exportJavaProject();
      setExportProblems(userFacingExportProblems(result.problems));
      if (!result.ok) {
        setRightDock('problems');
        const errors = errorCount(result.problems);
        const notEmpty = result.problems.find((problem) => problem.code === FOLDER_NOT_EMPTY_CODE);
        setMessage({
          kind: 'error',
          text:
            notEmpty?.message ??
            `Export blocked by ${errors} error(s); nothing was written. See Problems.`,
        });
        return;
      }
      if (result.cancelled === true || result.location === undefined) return;
      const location = result.location;
      const warnings = result.problems.filter((problem) => problem.severity === 'warning').length;
      const suffix = warnings > 0 ? ` ${warnings} warning(s), see Problems.` : '';
      setMessage({
        kind: 'info',
        text: `${javaProjectWrittenMessage(location)}.${suffix}`,
        action: {
          label: JAVA_PROJECT_REVEAL_LABEL,
          run: () => {
            bridge.shell.showItemInFolder(location).catch((error: unknown) => {
              setMessage({ kind: 'error', text: `Reveal failed: ${messageOf(error)}` });
            });
          },
        },
      });
    } catch (error) {
      setMessage({ kind: 'error', text: `Export failed: ${messageOf(error)}` });
    } finally {
      setExporting(false);
    }
  };

  /** Runs Test in Minecraft (ADR 0026 D5) and reports the outcome. */
  const runTestInMinecraft = async (): Promise<void> => {
    setExporting(true);
    try {
      const result = await session.testInMinecraft();
      setExportProblems(userFacingExportProblems(result.problems));
      if (!result.ok || result.test === undefined) {
        setRightDock('problems');
        const errors = errorCount(result.problems);
        setMessage({
          kind: 'error',
          text: hasGeckolibMissing(result.problems)
            ? GECKOLIB_TEST_DOWNLOAD_MESSAGE
            : `Test in Minecraft blocked by ${errors} error(s); nothing was installed. See Problems.`,
        });
        return;
      }
      setMessage({ kind: 'info', text: testInMinecraftMessage(result.test) });
    } catch (error) {
      setMessage({ kind: 'error', text: `Test in Minecraft failed: ${messageOf(error)}` });
    } finally {
      setExporting(false);
    }
  };

  /** Runs a plugin exporter (structure files) into a folder and reports the outcome. */
  const runFolderExport = async (
    exporterId: string,
    what: string,
    options?: Record<string, Json>,
  ): Promise<void> => {
    setExporting(true);
    try {
      const result = await session.runPluginExporter(exporterId, undefined, options);
      setExportProblems(userFacingExportProblems(result.problems));
      if (!result.ok) {
        setRightDock('problems');
        const errors = errorCount(result.problems);
        setMessage({
          kind: 'error',
          text: `Export blocked by ${errors} error(s); nothing was written. See Problems.`,
        });
        return;
      }
      if (result.cancelled === true) return;
      if (result.location === undefined) {
        const note = result.problems.find((problem) => problem.severity === 'info');
        setMessage({ kind: 'info', text: note?.message ?? `There were no ${what} to export.` });
        return;
      }
      const warnings = result.problems.filter((problem) => problem.severity === 'warning').length;
      const suffix = warnings > 0 ? ` ${warnings} warning(s), see Problems.` : '';
      setMessage({
        kind: 'info',
        text: `Exported ${result.files.length} ${what} to ${result.location}.${suffix}`,
      });
    } catch (error) {
      setMessage({ kind: 'error', text: `Export failed: ${messageOf(error)}` });
    } finally {
      setExporting(false);
    }
  };

  /** Runs `action` when `reason` is `null`; otherwise says why it is unavailable. */
  const guarded =
    (reason: string | null, action: Action): Action =>
    () => {
      if (exporting) return;
      if (reason === null) action();
      else setMessage({ kind: 'error', text: reason });
    };

  const exportResourceZip = guarded(
    exportReason,
    () => void runPackExport('resource', 'zip', () => session.exportPack('resource', 'zip')),
  );
  const exportDataZip = guarded(
    dataExportReason,
    () => void runPackExport('data', 'zip', () => session.exportPack('data', 'zip')),
  );
  const exportCombined = guarded(
    combinedReason,
    () =>
      void runPackExport('resource', 'combined', () => session.exportPack('resource', 'combined')),
  );
  const installResource = guarded(
    installReason,
    () =>
      void runPackExport('resource', 'install', () => session.exportPack('resource', 'install')),
  );
  const exportFabricJar = guarded(fabricJarReason, () => setDialog({ type: 'fabric-jar' }));
  // Very easy's "Share my mod": the jar export with the dialog's defaults (ADR 0083 D4).
  const shareMyMod = guarded(
    fabricJarReason,
    () => void runFabricJarExport(defaultOptionValues(session.fabricJarOptions), true),
  );
  // The eject generates code from every layer, so every error blocks it, as for the jar.
  const exportJavaProject = guarded(fabricJarReason, () => setDialog({ type: 'java-project' }));
  const testInMinecraft = guarded(fabricJarReason, () => setDialog({ type: 'test-in-minecraft' }));
  const exportStructures = guarded(
    structureExportReason,
    () => void runFolderExport('structure-nbt', 'structure file(s)'),
  );
  const exportSchematics = guarded(
    structureExportReason,
    () => void runFolderExport('sponge-schematic', 'schematic(s)'),
  );
  // The other plugin exporters (an external plugin's, say) under "More exports"; the
  // structure exporters have their own entries above. Errors in the layers an exporter
  // packages block it.
  const pluginExports: ToolbarPluginExport[] = session.pluginExporters
    .filter((exporter) => !STRUCTURE_EXPORTER_IDS.has(exporter.id))
    .map((exporter) => {
      const reason = exportDisabledReason(
        project !== null,
        layers === null
          ? snapshot.problems
          : exporterProblems(snapshot.problems, layers, exporter.layers),
      );
      return {
        id: exporter.id,
        label: `${exporter.displayName} into a folder…`,
        reason,
        // Declared options are asked first; otherwise the export runs at once.
        onSelect: guarded(reason, () =>
          (exporter.options ?? []).length > 0
            ? setDialog({ type: 'plugin-export', exporterId: exporter.id })
            : void runFolderExport(exporter.id, 'file(s)'),
        ),
      };
    });
  const installData = guarded(dataInstallReason, () => {
    session.listWorlds().then(
      (worlds) => setDialog({ type: 'worlds', worlds }),
      (error: unknown) => setDialog({ type: 'no-minecraft', message: messageOf(error) }),
    );
  });

  // Assets --------------------------------------------------------------------------------

  /** A texture asset dropped on an element: its model draws with it (ADR 0054), one undo step. */
  const dropTexture = (elementId: string, asset: string): void => {
    if (project === null) return;
    const colon = asset.indexOf(':');
    const texture = textureIdOf(asset.slice(0, colon), asset.slice(colon + 1));
    const element = project.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((entry) => entry.id === elementId);
    if (texture === null || element === undefined) return;
    const change = retexture(project, element, texture);
    if (!change.ok) {
      setMessage({ kind: 'error', text: change.reason });
      return;
    }
    session.setElementData(change.modelId as ResourceLocation, change.data);
    setMessage({
      kind: 'info',
      text: `${elementId} now draws with ${texture} (${change.slot} of ${change.modelId}). Undo puts ${change.previous ?? 'the old texture'} back.`,
    });
  };

  /** Adds a new texture as a project asset in one undo step (Undo moves it to the trash). */
  const addNewTexture = async (
    namespace: string,
    path: string,
    bytes: Uint8Array,
    mcmeta: Uint8Array | null = null,
  ): Promise<void> => {
    // A strip started from an animated Minecraft texture brings MSM's sidecar (ADR 0129 D4).
    const meta = metaChange(null, namespace, path, bytes, mcmeta).items;
    const result = await session.applyChangeset(
      [
        {
          itemId: 'new-texture',
          op: 'asset',
          asset: { namespace, path, bytes },
          accepted: true,
          problems: [],
        },
        ...meta,
      ],
      `New texture ${path}`,
    );
    if (result.applied.length === 0) throw new Error(`${path} already exists: pick another name.`);
    setAssetRevision((revision) => revision + 1);
  };

  const importAssets = async (namespace: string, subfolder: string): Promise<string | null> => {
    let files: Awaited<ReturnType<MsmBridge['dialogs']['pickFiles']>>;
    try {
      files = await bridge.dialogs.pickFiles({
        title: importPickerTitle(subfolder),
        filters: importFileFilters(subfolder),
      });
    } catch (error) {
      return messageOf(error);
    }
    if (files.length === 0) return null;
    try {
      const result = await session.importAssets(
        namespace,
        files.map((file) => ({ name: file.name, data: file.data })),
        subfolder,
      );
      setAssetRevision((revision) => revision + 1);
      if (result.rejected.length > 0) {
        if (result.imported.length > 0) {
          setMessage({ kind: 'info', text: `Imported ${result.imported.length} file(s).` });
        }
        return `Not imported:\n${result.rejected.map((entry) => `${entry.name}: ${entry.reason}`).join('\n')}`;
      }
      setDialog(null);
      setMessage({
        kind: 'info',
        text: `Imported ${result.imported.length} file(s) into ${namespace}:${subfolder}.`,
      });
      return null;
    } catch (error) {
      return messageOf(error);
    }
  };

  /** The registered importers the import dialog offers in `mode`. */
  const importersFor = (mode: ImportMode) =>
    session.importers.filter((entry) =>
      mode === 'blockbench' ? isBlockbenchImporter(entry) : !isBlockbenchImporter(entry),
    );

  /** "Bring builds from my test worlds" (ADR 0116 D3): structure saves through the .nbt importer. */
  const testWorldBuilds = (maps: MapsPlatform, targetId: string): TestWorldBuilds => ({
    list: () => maps.listStructureSaves(targetId),
    importSaves: async (namespace, saves) => {
      try {
        const files = [];
        for (const save of saves) {
          files.push({
            name: structureSaveFileName(save.id),
            data: await maps.readStructureSave(targetId, save.world, save.id),
          });
        }
        const result = await session.importFiles(files, namespace);
        const count = result.imported.length;
        const first = result.imported[0];
        if (first !== undefined) select(first);
        const notes = result.problems.filter((problem) => problem.severity !== 'info');
        if (notes.length > 0) {
          return `${count > 0 ? 'Some builds were not fully imported' : 'Nothing was imported'}:\n${notes.map((problem) => problem.message).join('\n')}`;
        }
        setDialog(null);
        setMessage({ kind: 'info', text: `Brought ${count} build(s) into ${namespace}.` });
        return null;
      } catch (error) {
        return messageOf(error);
      }
    },
  });

  /** Picks files for the `mode` importers and imports them into `namespace`. */
  const importFiles = async (namespace: string, mode: ImportMode): Promise<string | null> => {
    let files: Awaited<ReturnType<MsmBridge['dialogs']['pickFiles']>>;
    try {
      files = await bridge.dialogs.pickFiles({
        title: mode === 'blockbench' ? 'Import Blockbench models' : 'Import structures',
        filters: importerFileFilters(importersFor(mode)),
      });
    } catch (error) {
      return messageOf(error);
    }
    if (files.length === 0) return null;
    try {
      const result = await session.importFiles(
        files.map((file) => ({ name: file.name, data: file.data })),
        namespace,
      );
      const count = result.imported.length;
      const first = result.imported[0];
      if (first !== undefined) select(first);
      const notes = result.problems.filter((problem) => problem.severity !== 'info');
      if (notes.length > 0) {
        if (count > 0) setMessage({ kind: 'info', text: `Imported ${count} element(s).` });
        return `${count > 0 ? 'Some files were not fully imported' : 'Nothing was imported'}:\n${notes.map((problem) => problem.message).join('\n')}`;
      }
      setDialog(null);
      const infos = result.problems.map((problem) => ` ${problem.message}`).join('');
      setMessage({
        kind: 'info',
        text: `Imported ${count} element(s) into ${namespace}.${infos}`,
      });
      return null;
    } catch (error) {
      return messageOf(error);
    }
  };

  /** Picks one file for the registered importers and replaces element `id` with it. */
  const replaceFromFile = async (id: ResourceLocation): Promise<void> => {
    let files: Awaited<ReturnType<MsmBridge['dialogs']['pickFiles']>>;
    try {
      files = await bridge.dialogs.pickFiles({
        title: `Replace ${id} from a file`,
        filters: importerFileFilters(session.importers),
      });
    } catch (error) {
      setMessage({ kind: 'error', text: messageOf(error) });
      return;
    }
    const file = files[0];
    if (file === undefined) return;
    try {
      const result = await session.replaceElementFromFile(id, {
        name: file.name,
        data: file.data,
      });
      const notes = result.problems.map((problem) => ` ${problem.message}`).join('');
      setMessage(
        result.replaced
          ? { kind: 'info', text: `Replaced ${id} from ${file.name}.${notes}` }
          : { kind: 'error', text: `${id} was not replaced.${notes}` },
      );
    } catch (error) {
      setMessage({ kind: 'error', text: `Replace failed: ${messageOf(error)}` });
    }
  };

  const reveal = (relative: string): void => {
    const root = snapshot.root;
    if (root === null) return;
    bridge.shell.showItemInFolder(joinProjectPath(root, relative)).catch((error: unknown) => {
      setMessage({ kind: 'error', text: `Reveal failed: ${messageOf(error)}` });
    });
  };

  const thumbnail = useCallback(
    (assetPath: string, size: number) => bridge.thumbnails.get(assetPath, size),
    [bridge],
  );

  // Settings ------------------------------------------------------------------------------

  const loadSettings = useCallback(() => session.getSettings(), [session]);
  const loadTestStatus = useCallback(() => session.testInMinecraftStatus(), [session]);
  const createTestInstance = useCallback(async () => {
    const status = await session.createTestInstance();
    // The managed instance is now the install target; the toolbar shows it.
    void refreshMinecraftStatus();
    return status;
  }, [session, refreshMinecraftStatus]);
  const pickLauncherProgram = useCallback(
    (launcher: LaunchableLauncher) => bridge.testInMinecraft.pickLauncherProgram(launcher),
    [bridge],
  );
  const saveSettings = useCallback(
    async (settings: AppSettingsPatch) => {
      await bridge.settings.set(settings);
      if (settings.minecraftDir !== undefined) void refreshMinecraftStatus();
    },
    [bridge, refreshMinecraftStatus],
  );

  // Install targets (ADR 0019) -------------------------------------------------------------

  const locationList = minecraft.locations ?? null;
  const installTargets = useMemo<InstallTargetOption[]>(
    () => locationList?.locations.map(installTargetOption) ?? [],
    [locationList],
  );
  const statusTarget = minecraft.status?.target ?? null;
  const installTarget = useMemo<InstallTargetOption | null>(
    () => (statusTarget === null ? null : installTargetOption(statusTarget)),
    [statusTarget],
  );
  const selectedTargetId = locationList?.selected ?? statusTarget?.id ?? null;
  const launchers = minecraft.launchers ?? null;
  const manualRoots = useMemo(
    () => manualLauncherRoots(launchers, locationList?.locations ?? null),
    [launchers, locationList],
  );
  const statusJar = minecraft.status?.jar ?? null;
  const jarSource =
    statusJar === null ? null : describeJarSource(statusJar.launcher, statusJar.versionId);

  /** Makes the location with `id` the install target, then reads the status again. */
  const chooseInstallTarget = useCallback(
    async (id: string): Promise<void> => {
      const location = useUiStore
        .getState()
        .minecraft.locations?.locations.find((entry) => entry.id === id);
      if (location === undefined) {
        setMessage({ kind: 'error', text: 'That install target is no longer available.' });
        return;
      }
      try {
        await session.setInstallTarget(location.ref);
      } catch (error) {
        setMessage({ kind: 'error', text: `Choose install target: ${messageOf(error)}` });
        return;
      }
      await refreshMinecraftStatus();
      setMessage({
        kind: 'info',
        text: `Packs now install to ${installTargetName(installTargetOption(location))}.`,
      });
    },
    [session, setMessage, refreshMinecraftStatus],
  );

  /** Replaces one launcher's list of added folders; errors reach the Settings dialog. */
  const updateLauncherRoots = useCallback(
    async (kind: ManualLauncher, change: (paths: readonly string[]) => string[]) => {
      const current = await refreshLaunchers();
      const list = LAUNCHER_LISTS[kind];
      const next: LauncherSettings = { ...current, [list]: change(current[list]) };
      await session.setSettings({ launchers: next });
      useUiStore.getState().setLauncherSettings(next);
      await refreshMinecraftStatus();
    },
    [session, refreshLaunchers, refreshMinecraftStatus],
  );

  const addLauncherRoot = useCallback(
    async (kind: ManualLauncher): Promise<void> => {
      const path = await bridge.dialogs.pickDirectory({ title: FOLDER_PICKER_TITLES[kind] });
      if (path === null) return;
      const key = launcherPathKey(path);
      await updateLauncherRoots(kind, (paths) =>
        paths.some((entry) => launcherPathKey(entry) === key) ? [...paths] : [...paths, path],
      );
    },
    [bridge, updateLauncherRoots],
  );

  const removeLauncherRoot = useCallback(
    (kind: ManualLauncher, path: string): Promise<void> =>
      updateLauncherRoots(kind, (paths) => paths.filter((entry) => entry !== path)),
    [updateLauncherRoots],
  );

  // Updates (ADR 0018) --------------------------------------------------------------------

  const checkForUpdates = (): void => {
    setMessage({ kind: 'info', text: 'Checking for updates…' });
    const version = bridge.app.info().then(
      (info) => info.version,
      () => null,
    );
    bridge.updates.check().then(
      async (status) => setMessage(updateCheckMessage(status, await version)),
      // Main never rejects; an IPC failure gets the generic text (details stay out of the UI).
      () => setMessage({ kind: 'error', text: 'Could not check for updates.' }),
    );
  };
  // "Restart to update" closes the window through main's unsaved-changes prompt. Report
  // typing an editor still holds back and the unsaved state first, synchronously, so the
  // prompt sees it (the effect that normally reports `dirty` runs only after a render).
  const reportUnsavedBeforeUpdate = useCallback((): void => {
    // Edits that land later are caught by the close request's own report.
    void flushPendingEdits();
    bridge.setDirty(session.snapshot.dirty);
  }, [bridge, session]);
  // Every window close asks first: held-back typing and the unsaved state, and the prompt's Save.
  useEffect(
    () =>
      bridge.onCloseRequest?.(
        closeRequestHandlers(session, {
          failed: (error) => setMessage({ kind: 'error', text: messageOf(error) }),
        }),
      ),
    [bridge, session, setMessage],
  );
  // What's new (B145) ------------------------------------------------------------------------

  const openWhatsNew = useCallback((version: string, notes?: string): void => {
    setDialog(
      notes === undefined ? { type: 'whats-new', version } : { type: 'whats-new', version, notes },
    );
  }, []);
  const whatsNew = (): void => {
    bridge.app.info().then(
      (info) => openWhatsNew(info.version),
      () => setMessage({ kind: 'error', text: 'Could not read the app version.' }),
    );
  };
  // The Welcome on a brand-new install, or What's new once after the app version changed
  // (main decides and records the version), unless another dialog is already open.
  useEffect(() => {
    let live = true;
    bridge.app
      .launchNotice()
      .then(async (notice) => {
        if (notice === null || !live) return;
        if (notice === 'welcome') {
          setDialog((current) => current ?? { type: 'welcome' });
          return;
        }
        const { version } = await bridge.app.info();
        if (live) setDialog((current) => current ?? { type: 'whats-new', version });
      })
      .catch(() => {
        // Not shown; Help > What's New… still works.
      });
    return () => {
      live = false;
    };
  }, [bridge]);

  const browseMinecraft = useCallback(
    () => bridge.dialogs.pickDirectory({ title: 'Choose your Minecraft folder' }),
    [bridge],
  );
  const extractAssets = useCallback(async (): Promise<string | null> => {
    try {
      await session.extractVanillaAssets();
      return null;
    } catch (error) {
      return messageOf(error);
    } finally {
      useUiStore.getState().setMinecraftProgress(null);
      void refreshMinecraftStatus();
    }
  }, [session, refreshMinecraftStatus]);
  // ADR 0119 D4: a cache from before the worldgen files (schema 4) is extracted again by
  // itself, once per version, when the jar it came from is still there; otherwise the set-up
  // banner shows as before.
  const reextracted = useRef(new Set<string>());
  const outdatedVersion =
    minecraft.status?.cacheOutdated === true ? (minecraft.status.jar?.versionId ?? null) : null;
  useEffect(() => {
    if (outdatedVersion === null || reextracted.current.has(outdatedVersion)) return;
    reextracted.current.add(outdatedVersion);
    void extractAssets();
  }, [outdatedVersion, extractAssets]);

  // Commands and shortcuts ----------------------------------------------------------------

  const [paletteOpen, setPaletteOpen] = useState(false);
  /** The open search panel (ADR 0124 D10): its door and the letters typed on the door. */
  const [searchDoor, setSearchDoor] = useState<{ door: SearchDoor; text: string } | null>(null);
  /** The panel's one quiet line after Ask the AI helper opened nothing (B669's `askAi`). */
  const [searchAiLine, setSearchAiLine] = useState<string | null>(null);
  /** Where focus was when the search opened; it goes back there on close (D11). */
  const searchReturn = useRef<HTMLElement | null>(null);
  /** The caret's location when the palette opened (for "Go to definition"). */
  const paletteFocus = useRef<FocusedLocation | null>(null);

  const openPalette = (): void => {
    if (paletteOpen) return;
    paletteFocus.current = focusedLocation(document.activeElement);
    setPaletteOpen(true);
  };

  const needsNamespace =
    (action: Action): Action =>
    () => {
      if (canAddElement) action();
      else setMessage({ kind: 'error', text: 'Open a project with a namespace first.' });
    };

  /** Change id (the Name section's More options, F2): the id rename, rewriting what uses it. */
  const renameById = (id: ResourceLocation): void => {
    const element = findProjectElement(session.snapshot.project, id);
    if (element === undefined) return;
    const registry = kindRegistry(element.kind, session.registry);
    const references = session.references
      .to(id)
      .filter((reference) => reference.registry === '' || reference.registry === registry).length;
    setDialog({ type: 'rename', id, references });
  };
  const renameSelected = (): void => {
    if (selected === null) {
      setMessage({ kind: 'error', text: 'Select an element to rename.' });
      return;
    }
    renameById(selected.id);
  };
  /** What uses `id` (Where it goes, ADR 0130 D4): each other element once, by name. */
  const usedByOf = (id: ResourceLocation): UsedByEntry[] => {
    const seen = new Set<string>();
    const out: UsedByEntry[] = [];
    for (const reference of session.references.to(id)) {
      if (reference.from === id || seen.has(reference.from)) continue;
      seen.add(reference.from);
      const element = findProjectElement(session.snapshot.project, reference.from);
      out.push({
        id: reference.from,
        name: element === undefined ? reference.from : displayNameOf(element),
      });
    }
    return out;
  };

  const findUsages = (): void => {
    if (selected === null) {
      setMessage({ kind: 'error', text: 'Select an element to find its usages.' });
      return;
    }
    setDialog({ type: 'usages', id: selected.id, usages: session.references.to(selected.id) });
  };

  const goToDefinition = (at?: FocusedLocation): void => {
    const focus = at ?? paletteFocus.current ?? focusedLocation(document.activeElement);
    if (selected === null || project === null || focus === null) {
      setMessage({
        kind: 'error',
        text: 'Place the cursor in a field that refers to another element first.',
      });
      return;
    }
    const reference = referenceAt(session.references.from(selected.id), focus);
    if (reference === undefined) {
      setMessage({ kind: 'error', text: 'The focused field does not refer to an element.' });
      return;
    }
    const definition = definitionOf(project, reference);
    if (definition === undefined) {
      setMessage({
        kind: 'info',
        text: `${reference.to} is not defined in this project (it may be a vanilla id).`,
      });
      return;
    }
    navigateTo(definition.id, null);
  };
  const goToDefinitionRef = useRef(goToDefinition);
  goToDefinitionRef.current = goToDefinition;
  // F12 and Ctrl/Cmd+Click in the function editor ask for the definition at their caret.
  useEffect(() => {
    const onRequest = (event: Event): void => {
      const caret = (event as CustomEvent<FunctionCaret>).detail;
      goToDefinitionRef.current({ pointer: `/lines/${caret.line}`, column: caret.column });
    };
    document.addEventListener(GO_TO_DEFINITION_EVENT, onRequest);
    return () => document.removeEventListener(GO_TO_DEFINITION_EVENT, onRequest);
  }, []);

  const editInCreator = (element: ProjectElement): void => {
    const meta = element.meta.creator;
    if (meta === undefined) return;
    const flow = session.library.starters.find(
      (starter) => starter.id === meta.flowId && starter.creator !== undefined,
    );
    if (flow === undefined) {
      setMessage({
        kind: 'error',
        text: `The Creator flow ${meta.flowId} is not available, so this set cannot be reopened.`,
      });
      return;
    }
    setDialog({
      type: 'creator',
      edit: {
        flowId: meta.flowId,
        setId: meta.setId,
        values: meta.values,
        namespace: namespaceOfId(meta.generatedId),
      },
    });
  };

  /**
   * The AI helper for the open project (the panel on its empty state or its conversation), or
   * with no mod open New project with the AI helper (ADR 0047 D3, ADR 0125 D2). There is no mode
   * to set: the run's size comes from what the user sends.
   */
  const buildWithAi = (): void => {
    if (aiController === null) {
      setMessage({ kind: 'error', text: 'The AI helper is not available.' });
      return;
    }
    if (project !== null) {
      aiController.open();
      return;
    }
    newProjectWithAi();
  };
  /**
   * New project with the AI helper; `draft` (the search's Ask the AI helper, B669) fills the
   * description and keeps its context block for the first message.
   */
  const newProjectWithAi = (draft?: AskAiDraft): void => {
    const start = draft === undefined ? {} : { draft };
    // Only the mod's name, in the folder New uses (ADR 0125 D5, ADR 0130 D5).
    const ask = bridge.project.defaultParent;
    if (ask === undefined) {
      setDialog({ type: 'ai-start', ...start });
      return;
    }
    ask().then(
      (parent) =>
        setDialog(
          parent === '' ? { type: 'ai-start', ...start } : { type: 'ai-start', parent, ...start },
        ),
      () => setDialog({ type: 'ai-start', ...start }),
    );
  };
  /** Starts the new project (in `folder` when the dialog asked a name); a text is a failure. */
  const startWithAi = async (
    description: string,
    pictures: readonly AiPicture[] = [],
    folder?: string,
    contextBlock?: string,
  ): Promise<string | null> => {
    if (aiController === null) {
      setDialog(null);
      return null;
    }
    if (folder === undefined) {
      setDialog(null);
      await openWith('New project', () => session.newProject());
    } else {
      const outcome = await session.newProject({ folder });
      if (!outcome.ok) return 'cancelled' in outcome ? null : outcome.reason;
      setDialog(null);
      await openWith('New mod', async () => outcome);
    }
    if (session.snapshot.project === null) return null;
    aiController.open();
    // A whole new mod runs as a build (ADR 0125 D2).
    void aiController.send(
      description,
      contextBlock === undefined ? [] : [contextBlock],
      pictures,
      {
        size: 'build',
      },
    );
    return null;
  };
  /** The helper's tab: opened or closed with a mod open, New project with the AI helper without. */
  const toggleAiHelper = (): void => {
    if (aiController === null) {
      setMessage({ kind: 'error', text: 'The AI helper is not available.' });
      return;
    }
    if (project === null) buildWithAi();
    else aiController.toggle();
  };
  /** Explain (Problems) and Ask the helper (Things to fix): the problem attached, nothing sent. */
  const explainWithAi = (problem: Problem): void => {
    if (aiController === null) return;
    aiController.explainProblem(problem);
  };
  /** Ask AI on an element: the element attached, nothing sent. */
  const askAiAbout = (id: ResourceLocation): void => {
    if (aiController === null) return;
    attachElementToAi(aiController, id, session.snapshot.project);
  };
  /** Show me after adding (ADR 0125 D4). */
  const showAiStep = (step: AiAppliedStep): void => {
    const where = showMeTarget(step, session.snapshot.project);
    if (where === null) return;
    switch (where.type) {
      case 'creator':
        editInCreator(where.element);
        return;
      case 'open':
        useTryItStore.getState().close();
        navigateTo(where.id, null);
        return;
      case 'select':
        useTryItStore.getState().close();
        select(where.id);
        return;
      case 'my-things':
        useTryItStore.getState().close();
        select(null);
        // Home draws My things once nothing is selected.
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLElement>('[data-testid="my-things"]')
            ?.scrollIntoView({ block: 'start' }),
        );
        return;
    }
  };

  const goHome = (): void => {
    useTryItStore.getState().close();
    select(null);
  };
  const playNow = (): void => {
    if (usePlayStore.getState().host === null) {
      setMessage({ kind: 'error', text: 'Play is not available here.' });
      return;
    }
    if (project === null) {
      setMessage({ kind: 'error', text: 'Open a project to play it.' });
      return;
    }
    void usePlayStore.getState().play();
  };
  const reloadGame = (): void => {
    // A no-op unless the game is in the test world (the store checks `canReload`).
    if (project !== null) void usePlayStore.getState().reload();
  };
  /** Very easy's New: a name only, in `<Documents>/MCSuperMods` (ADR 0083 D6). */
  const newMod = (): void => {
    const fallback = (): void => void openWith('New project', () => session.newProject());
    const ask = bridge.project.defaultParent;
    if (ask === undefined) {
      fallback();
      return;
    }
    ask().then(
      (parent) => (parent === '' ? fallback() : setDialog({ type: 'new-mod', parent })),
      fallback,
    );
  };

  // Home (ADR 0083 D2) ----------------------------------------------------------------------

  const ownNamespace = project?.namespaces.find((entry) => entry.name !== 'minecraft')?.name;
  /** Opens the project's first rule book, or makes `<namespace>:rules` (ADR 0082 D2). */
  const openRuleBook = (): void => {
    if (project === null || ownNamespace === undefined) return;
    const book = project.namespaces
      .flatMap((namespace) => namespace.elements)
      .filter((element) => element.kind === RULES_KIND)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (book !== undefined) {
      navigateTo(book.id, null);
      return;
    }
    const id: ResourceLocation = `${ownNamespace}:rules`;
    try {
      session.addElement({ id, kind: RULES_KIND });
      navigateTo(id, null);
    } catch (error) {
      setMessage({ kind: 'error', text: `Make things happen: ${messageOf(error)}` });
    }
  };
  /** The choices of a tile with starters (ADR 0086 D8): its flows, then its starters. */
  const tileChoices = (shown: ShownTile): MakeChoice[] =>
    makeChoicesOf(shown.flowIds, shown.starterIds);
  /** The chooser's cards of some flows, then some starters. */
  const makeChoicesOf = (
    flowIds: readonly string[],
    starterIds: readonly string[],
  ): MakeChoice[] => {
    const starters = session.library.starters;
    const flows = flowIds.flatMap((id): MakeChoice[] => {
      const starter = starters.find((entry) => entry.id === id);
      return starter === undefined
        ? []
        : [{ type: 'flow', id, title: starter.title, sentence: starter.creator?.blurb ?? '' }];
    });
    const others = starterIds.flatMap((id): MakeChoice[] => {
      const starter = starters.find((entry) => entry.id === id);
      return starter === undefined
        ? []
        : [{ type: 'starter', id, title: starter.title, sentence: starter.description }];
    });
    return [...flows, ...others];
  };
  /** Adds a library starter's things to the mod as one undo step (ADR 0086 D8). */
  const addStarter = (starterId: string): void => {
    const starter = session.library.starters.find((entry) => entry.id === starterId);
    if (starter === undefined || ownNamespace === undefined) return;
    session.addBundle(starter, { namespace: ownNamespace, label: `Add ${starter.title}` }).then(
      (result) => {
        setAssetRevision((revision) => revision + 1);
        setMessage({
          kind: 'info',
          text: `Added ${starter.title}: ${result.added.length} thing(s) and ${result.assets.length} picture(s) or file(s). Undo takes it back.`,
        });
      },
      (error: unknown) =>
        setMessage({ kind: 'error', text: `Add ${starter.title}: ${messageOf(error)}` }),
    );
  };
  /**
   * Rolls "Surprise me" for the open mod, or for a new mod named after the theme (ADR 0086);
   * with `lead`, an idea card's mod, led by that flow (ADR 0129 D3).
   */
  const rollSurpriseFor = useCallback(
    (seed: number, themeId: string | null, lead?: string): Promise<SurpriseMod> => {
      const isKnownKind = (kind: string) => session.registry.get(kind) !== undefined;
      const common = {
        seed,
        themeId,
        starters: session.library.starters,
        target: session.target,
        isKnownKind,
        rules: session.registry.get(RULES_KIND) !== undefined,
        newSetId: () => crypto.randomUUID(),
        ...(lead === undefined ? {} : { lead }),
      };
      const current = session.snapshot.project;
      if (current !== null) {
        const namespace = current.namespaces.find((entry) => entry.name !== 'minecraft')?.name;
        if (namespace === undefined) {
          return Promise.reject(new Error('The mod has no namespace of its own; add one first.'));
        }
        return rollSurprise({ ...common, namespace, project: current });
      }
      const theme = themeById(themeId) ?? themeOfSeed(seed);
      const name = `${theme.word} Mod`;
      const namespace = namespaceFromFolderName(name);
      const empty = createEmptyProject(name, {
        targets: session.defaultTargetId === undefined ? [] : [session.defaultTargetId],
      });
      empty.namespaces.push({ name: namespace, elements: [], assets: [] });
      return rollSurprise({ ...common, namespace, project: empty });
    },
    [session],
  );
  /**
   * "Make it": adds the things to the open mod, or first starts a new mod named after the theme
   * in the default folder (`Ruby Mod`, then `Ruby Mod 2`…) and rolls the same seed for it.
   */
  const makeSurprise = async (mod: SurpriseMod, prepare?: SurprisePrepare): Promise<void> => {
    let made = mod;
    if (session.snapshot.project === null) {
      const parent = (await bridge.project.defaultParent?.().catch(() => '')) ?? '';
      let outcome: OpenOutcome = { ok: false, cancelled: true };
      if (parent === '') {
        outcome = await session.newProject();
      } else {
        for (let number = 1; number <= 20; number += 1) {
          const name = number === 1 ? mod.modName : `${mod.modName} ${number}`;
          outcome = await session.newProject({ folder: modFolder(parent, name) });
          if (outcome.ok || 'cancelled' in outcome) break;
        }
      }
      if (!outcome.ok) {
        if ('reason' in outcome) throw new Error(outcome.reason);
        return;
      }
      const opened = outcome;
      await openWith('New mod', async () => opened);
      made = await rollSurpriseFor(mod.seed, mod.theme.id, mod.lead);
    }
    // "Use AI pictures" (ADR 0093 D7): the textures are made just before the one undo step.
    const prepared = prepare === undefined ? null : await prepare(made.items);
    const result = await session.applyChangeset(prepared?.items ?? made.items, made.label);
    setDialog(null);
    select(null);
    setAssetRevision((revision) => revision + 1);
    const rule = made.rule === null ? '' : ' and a rule';
    const skipped =
      result.skipped.length > 0 ? ` ${result.skipped.length} part(s) no longer fitted.` : '';
    setMessage({
      kind: 'info',
      text: `Made ${made.modName}: ${made.things.length} things${rule}. Undo takes it all back in one step.${skipped}${prepared === null || prepared.note === null ? '' : ` ${prepared.note}`}`,
    });
  };
  const openTile = (shown: ShownTile): void => {
    const action = shown.tile.action;
    if (project === null) {
      setMessage({ kind: 'error', text: 'Start or open a mod first.' });
      return;
    }
    switch (action.type) {
      case 'flows':
        if (shown.starterIds.length === 0) {
          setDialog({
            type: 'creator',
            flowIds: shown.flowIds,
            ...(action.picks === undefined ? {} : { picks: action.picks }),
          });
          return;
        }
        setDialog({ type: 'make-choice', title: shown.tile.label, choices: tileChoices(shown) });
        return;
      case 'surprise':
        setDialog({ type: 'surprise' });
        return;
      case 'rules':
        openRuleBook();
        return;
      case 'paint':
        if (ownNamespace !== undefined) setDialog({ type: 'new-texture', namespace: ownNamespace });
        return;
      case 'minecraft-texture':
        setDialog({ type: 'minecraft-texture' });
        return;
      default:
        buildWithAi();
    }
  };
  // Showcase (ADR 0118 D1, D10; B569) ----------------------------------------------------

  const showcaseClips = usePreferences((state) => state.showcaseClips);
  const showcaseOpen = usePreferences((state) => state.showcaseOpen);
  const showcaseList = useMemo(
    () => (target === null ? [] : showcasesFor(target, session.library.examples)),
    [session, target],
  );
  /** Each showcased example's card, as a one-card list kept between renders. */
  const showcaseByExample = useMemo(
    () => new Map(showcaseList.map((clip) => [clip.exampleId, [clip]] as const)),
    [showcaseList],
  );
  // The library's examples are the built-in plugins', so they lower with the built-in plugins.
  const showcaseDeps = useMemo(
    () => ({ registry: session.registry, plugins: builtInPlugins }),
    [session],
  );
  /** A card's **Make this** as a Home tile, or `null` when nothing of it is offered here. */
  const showcaseTile = (clip: ShowcaseClip): ShownTile | null => {
    if (clip.make.type === 'example' || tileAvailability === null) return null;
    const tile: MakeTile = {
      id: `showcase-${clip.id}`,
      label: clip.title,
      sentence: clip.sentence,
      group: 'start',
      action: clip.make,
    };
    return shownTiles(tileAvailability, [tile])[0] ?? null;
  };
  // A tile to open once the mod a card's Make this started is open (ADR 0118 D10).
  const [pendingTile, setPendingTile] = useState<ShownTile | null>(null);
  const openTileRef = useRef(openTile);
  openTileRef.current = openTile;
  useEffect(() => {
    if (pendingTile === null || project === null) return;
    setPendingTile(null);
    openTileRef.current(pendingTile);
  }, [pendingTile, project]);
  /**
   * **Make this** (ADR 0118 D10): in the open mod, the card's flow as its Home tile would open
   * it; with no mod, Very easy asks for the mod's name (prefilled from the card) and opens the
   * flow once it is made, as Surprise me does; Easy and Advanced open New project on the
   * flow's starter.
   */
  const makeShowcase = (clip: ShowcaseClip): void => {
    const shown = showcaseTile(clip);
    if (shown === null) {
      seeShowcaseExample(clip);
      return;
    }
    makeShownTile(shown, showcaseModName(clip));
  };
  /**
   * Opens a card's tile (a Showcase or gallery card's **Make this**): in the open mod as its Home
   * tile; with no mod, Very easy asks for the mod's name and opens the tile once it is made, and
   * Easy and Advanced open New project on the tile's flows and starters.
   */
  const makeShownTile = (shown: ShownTile, name: string): void => {
    if (project !== null) {
      setDialog(null);
      openTile(shown);
      return;
    }
    const ask = bridge.project.defaultParent;
    const fallback = (): void => {
      setDialog(null);
      void openWith('New mod', () => session.newProject()).then(() => {
        if (session.snapshot.project !== null) setPendingTile(shown);
      });
    };
    if (ask === undefined) {
      fallback();
      return;
    }
    ask().then(
      (parent) =>
        parent === ''
          ? fallback()
          : setDialog({ type: 'new-mod', parent, name, afterwards: shown }),
      fallback,
    );
  };
  /** Copies an example into the open mod (the Examples gallery's Copy into my project). */
  const copyExample = async (example: ExampleProject, namespace: string) => {
    const result = await session.addBundle(example, {
      namespace,
      label: `Copy example ${example.title}`,
    });
    if (result.assets.length > 0) setAssetRevision((revision) => revision + 1);
    const skipped = result.duplicates.length + result.skippedAssets.length;
    const merged = mergedPhrase(result.merged);
    setMessage({
      kind: 'info',
      text:
        `Copied "${example.title}" into ${namespace}: ${result.added.length} element(s), ${result.assets.length} asset(s)` +
        (merged === '' ? '' : `; merged into ${merged}`) +
        (skipped > 0 ? `; ${skipped} already in the project and skipped.` : '.'),
    });
    return result;
  };
  /**
   * **See the example** (ADR 0118 D10): a new mod made from it when none is open, else a copy in
   * the open mod, showing its Rule book when it has one (the Rules card).
   */
  const seeShowcaseExample = (clip: ShowcaseClip): void => seeExample(clip.exampleId);
  /** **See the example** of a card or a search result, by the example's id. */
  const seeExample = (exampleId: string): void => {
    const example = session.library.examples.find((entry) => entry.id === exampleId);
    if (example === undefined) return;
    setDialog(null);
    if (project === null) {
      void openWith(`New project from example "${example.title}"`, () =>
        session.newProject({ bundle: example }),
      );
      return;
    }
    if (ownNamespace === undefined) {
      setMessage({ kind: 'error', text: 'The mod has no namespace of its own; add one first.' });
      return;
    }
    copyExample(example, ownNamespace).then(
      (result) => {
        const added = new Set(result.added);
        const book = session.snapshot.project?.namespaces
          .flatMap((entry) => entry.elements)
          .find((element) => element.kind === RULES_KIND && added.has(element.id));
        const first = book?.id ?? result.added[0];
        if (first !== undefined) navigateTo(first, null);
      },
      (error: unknown) =>
        setMessage({ kind: 'error', text: `Copy example ${example.title}: ${messageOf(error)}` }),
    );
  };
  /** The showcase gallery with its heading, for Home, New project and the Examples gallery. */
  const showcaseGallery = (
    clips: readonly ShowcaseClip[],
    visible: boolean,
    onMake: (clip: ShowcaseClip) => void,
    onSeeExample: (clip: ShowcaseClip) => void,
    heading = 'See what you can make',
  ) =>
    target === null || clips.length === 0 ? null : (
      <ShowcaseGallery
        heading={heading}
        clips={clips}
        examples={session.library.examples}
        target={target}
        deps={showcaseDeps}
        vanilla={vanilla}
        playClips={showcaseClips}
        visible={visible}
        onMake={onMake}
        onSeeExample={onSeeExample}
      />
    );
  /** The palette's "Showcase": Home's gallery. */
  const showShowcase = (): void => {
    goHome();
    usePreferences.getState().setShowcaseOpen(true);
  };

  // The gallery of everything (ADR 0129 D1, D5) ------------------------------------------

  const galleryList = useMemo(
    () =>
      target === null
        ? []
        : galleryGroups({
            starters: session.library.starters,
            examples: session.library.examples,
            target,
            exampleFor: exampleForStarter,
          }),
    [session, target],
  );
  /** A gallery card's **Make this**: its flow or starter, as its Home tile would open it. */
  const makeGalleryCard = (card: GalleryCard): void => {
    if (tileAvailability === null) return;
    const tile: MakeTile = {
      id: `gallery-${card.id}`,
      label: card.title,
      sentence: card.sentence,
      group: 'start',
      action: card.action,
    };
    const shown = shownTiles(tileAvailability, [tile])[0];
    if (shown === undefined) return;
    makeShownTile(shown, galleryModName(card));
  };
  /** The first Showcase card's example, for the hero's picture. */
  const heroExample = useMemo(() => {
    const first = showcaseList[0];
    if (first === undefined) return null;
    const example = session.library.examples.find((entry) => entry.id === first.exampleId);
    return example === undefined ? null : { example, label: first.title };
  }, [showcaseList, session]);
  /**
   * Home's gallery: Featured (the Showcase) first, then every group, then More ideas as the last
   * row when `ideasVisible` is given (Home without a mod), or nothing.
   */
  const homeGallery = (visible: boolean, ideasVisible?: boolean) =>
    target === null || galleryList.length === 0 ? (
      <>
        {showcaseGallery(showcaseList, visible, makeShowcase, seeShowcaseExample)}
        {ideasVisible === undefined ? null : moreIdeas(ideasVisible)}
      </>
    ) : (
      <HomeGallery
        groups={galleryList}
        deps={showcaseDeps}
        vanilla={vanilla}
        playClips={showcaseClips}
        visible={visible}
        {...(ideasVisible === undefined || ideaInput === null
          ? {}
          : {
              ideas: (variant: 'row' | 'grid', headerEnd: ReactNode) =>
                moreIdeas(ideasVisible, variant, headerEnd),
            })}
        featuredCount={showcaseList.length}
        featured={
          showcaseList.length === 0
            ? null
            : (variant, headerEnd) => (
                <ShowcaseGallery
                  heading="Featured"
                  clips={showcaseList}
                  examples={session.library.examples}
                  target={target}
                  deps={showcaseDeps}
                  vanilla={vanilla}
                  playClips={showcaseClips}
                  visible={visible}
                  onMake={makeShowcase}
                  onSeeExample={seeShowcaseExample}
                  variant={variant}
                  tag="Featured"
                  headerEnd={headerEnd}
                />
              )
        }
        starters={session.library.starters}
        examples={session.library.examples}
        target={target}
        onMake={makeGalleryCard}
        onSeeExample={(card) => {
          if (card.exampleId !== undefined) seeExample(card.exampleId);
        }}
      />
    );

  // More ideas (ADR 0128 D1, D2) -----------------------------------------------------------

  const ideasSeed = usePreferences((state) => state.ideasSeed);
  const ideaInput = useMemo<IdeaInput | null>(
    () =>
      target === null
        ? null
        : {
            starters: session.library.starters,
            target,
            isKnownKind: (kind) => session.registry.get(kind) !== undefined,
            rules: session.registry.get(RULES_KIND) !== undefined,
          },
    [session, target],
  );
  // The idea card playing a clip, so the Showcase stops: one clip on Home (ADR 0128 D2).
  const [ideaLive, setIdeaLive] = useState<string | null>(null);
  /** Makes the mod of an idea card in the open mod (just made for it). */
  const makeIdeaIn = async (spec: IdeaSpec): Promise<void> => {
    try {
      await makeSurprise(await rollSurpriseFor(spec.seed, spec.themeId, spec.lead));
    } catch (error) {
      setMessage({ kind: 'error', text: `Make this: ${messageOf(error)}` });
    }
  };
  /**
   * An idea card's **Make this** (ADR 0128 D1): the name-only New prefilled with the idea's name,
   * then the mod of exactly that card (its seed, lead and theme) in it.
   */
  const makeIdea = (idea: Idea): void => {
    const fallback = (): void => {
      setDialog(null);
      void rollSurpriseFor(idea.seed, idea.themeId, idea.lead)
        .then((made) => makeSurprise(made))
        .catch((error: unknown) =>
          setMessage({ kind: 'error', text: `Make this: ${messageOf(error)}` }),
        );
    };
    const ask = bridge.project.defaultParent;
    if (ask === undefined || project !== null) {
      fallback();
      return;
    }
    ask().then(
      (parent) =>
        parent === ''
          ? fallback()
          : setDialog({
              type: 'new-mod',
              parent,
              name: idea.name,
              surpriseIdea: {
                seed: idea.seed,
                lead: idea.lead,
                group: idea.group,
                themeId: idea.themeId,
              },
            }),
      fallback,
    );
  };
  /** Home's **More ideas** (the gallery's last row, or its Show all grid), or nothing. */
  function moreIdeas(visible: boolean, variant: 'row' | 'grid' = 'grid', headerEnd?: ReactNode) {
    return ideaInput === null ? null : (
      <MoreIdeas
        variant={variant}
        headerEnd={headerEnd}
        baseSeed={ideasSeed}
        input={ideaInput}
        deps={showcaseDeps}
        vanilla={vanilla}
        playClips={showcaseClips}
        visible={visible}
        onMake={makeIdea}
        onLiveChange={setIdeaLive}
        onShuffle={() => usePreferences.getState().shuffleIdeas()}
      />
    );
  }
  /** Goes to Home in Very easy and scrolls to one of its sections (the palette, ADR 0128 D6). */
  const showHomeSection = (id: 'home-more-ideas' | 'home-your-mods'): void => {
    goHome();
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 50);
  };
  const showMoreIdeas = (): void => {
    if (project === null) {
      showHomeSection('home-more-ideas');
      return;
    }
    setDialog({ type: 'surprise' });
  };
  const showYourMods = (): void => {
    if (project === null) {
      showHomeSection('home-your-mods');
      return;
    }
    void refreshRecent();
    setRecentPickerOpen(true);
  };

  const renameThing = (card: ThingCard): void => {
    if (card.main.kind === RULES_KIND) {
      // A rule book has no shown name of its own: the id rename.
      const references = session.references.to(card.main.id).length;
      setDialog({ type: 'rename', id: card.main.id, references });
      return;
    }
    setDialog({ type: 'rename-thing', id: card.main.id, name: displayNameOf(card.main) });
  };
  const duplicateThing = (card: ThingCard): void => {
    if (project === null) return;
    const id = copyId(project, card.main.id);
    session
      .applyChangeset(
        [
          {
            itemId: 'duplicate',
            op: 'create',
            elementId: id,
            kind: card.main.kind,
            after: copyData(card.main.data),
            accepted: true,
            problems: [],
          },
        ],
        `Duplicate ${card.name}`,
      )
      .then(
        () => setMessage({ kind: 'info', text: `Made a copy of ${card.name}.` }),
        (error: unknown) => setMessage({ kind: 'error', text: `Duplicate: ${messageOf(error)}` }),
      );
  };
  const deleteThing = (card: ThingCard): void => {
    const warning = session.deleteExportedIdsWarning(card.elements.map((element) => element.id));
    if (warning !== null) {
      setDialog({
        type: 'delete-exported',
        title: `Delete ${card.name}`,
        message: exportedIdsWarningText('delete', warning, true, card.name),
        confirmLabel: DELETE_ANYWAY_LABEL,
        onConfirm: () => deleteThingNow(card),
      });
      return;
    }
    deleteThingNow(card);
  };
  const deleteThingNow = (card: ThingCard): void => {
    session
      .applyChangeset(
        card.elements.map((element, index) => ({
          itemId: `delete-${index}`,
          op: 'delete' as const,
          elementId: element.id,
          kind: element.kind,
          before: element.data,
          accepted: true,
          problems: [],
        })),
        `Delete ${card.name}`,
      )
      .then(
        () => {
          if (card.elements.some((element) => element.id === selectedId)) select(null);
          setMessage({ kind: 'info', text: `Deleted ${card.name}. Undo brings it back.` });
        },
        (error: unknown) => setMessage({ kind: 'error', text: `Delete: ${messageOf(error)}` }),
      );
  };
  /** "Fix it" in Things to fix (ADR 0083 D5). */
  const fixProblem = (problem: Problem, fix: PlainFix): void => {
    if (problem.elementId === undefined || project === null) return;
    const element = project.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((entry) => entry.id === problem.elementId);
    if (element === undefined) return;
    if (fix === 'remove-step') {
      const pointer = stepPointerOf(problem.path);
      const next = pointer === null ? null : removeAtPointer(element.data, pointer);
      if (next === null) {
        setMessage({ kind: 'error', text: 'That step could not be found any more.' });
        return;
      }
      run('Remove this step', () => session.setElementData(element.id, next));
      return;
    }
    const picture = missingPictureOf(project, problem, target?.folders.resource.textures);
    if (picture === null) {
      setMessage({ kind: 'error', text: 'The missing picture could not be found.' });
      return;
    }
    setDialog({
      type: 'paint',
      namespace: picture.namespace,
      path: picture.path,
      bytes: null,
      size: { width: 16, height: 16 },
      isNew: true,
    });
  };

  /**
   * Opens Settings; `'ai'` lands on the AI helper's section with its key field (ADR 0125 D5), and
   * `focusSetting` on one line of the settings catalogue (the search, ADR 0124 D9; B662).
   */
  const openSettings = (focus?: 'ai', focusSetting?: string): void => {
    setDialog({
      type: 'settings',
      ...(focus === undefined ? {} : { focus }),
      ...(focusSetting === undefined ? {} : { focusSetting }),
    });
    // Launchers may have gained instances since the last read; look again.
    void refreshMinecraftStatus();
    refreshLaunchers().catch(() => useUiStore.getState().setLauncherSettings(null));
  };
  /** Every "Open Settings" of the AI helper. */
  const openAiSettings = (): void => openSettings('ai');
  const handlers: Record<MenuCommand, Action> = {
    new: newMod,
    newProjectFromStarter: () => setDialog({ type: 'new-project' }),
    examples: () => setDialog({ type: 'examples' }),
    open: () => void openWith('Open project', () => session.openProject()),
    save: () => void save(),
    undo: () => {
      if (isEditableTarget(document.activeElement)) document.execCommand('undo');
      else session.undo();
    },
    redo: () => {
      if (isEditableTarget(document.activeElement)) document.execCommand('redo');
      else session.redo();
    },
    importAssets: needsNamespace(() => setDialog({ type: 'import' })),
    importStructure: needsNamespace(() => setDialog({ type: 'import-files', mode: 'structure' })),
    importBlockbench: needsNamespace(() => setDialog({ type: 'import-files', mode: 'blockbench' })),
    exportResourcePack: exportResourceZip,
    exportDataPack: exportDataZip,
    exportCombined,
    installResourcePack: installResource,
    installDataPack: installData,
    exportStructures,
    exportSchematics,
    exportFabricJar,
    exportJavaProject,
    exportMap: () => {
      if (project === null) {
        setMessage({ kind: 'error', text: 'Open a project to export it as a map.' });
        return;
      }
      if (bridge.maps === undefined) {
        setMessage({ kind: 'error', text: 'Export as a map is not available.' });
        return;
      }
      setDialog({ type: 'export-map' });
    },
    testInMinecraft,
    settings: () => openSettings(),
    renameElement: renameSelected,
    commandPalette: openPalette,
    search: () => openSearch('toolbar'),
    checkForUpdates,
    whatsNew,
    firstMod: () => setDialog({ type: 'welcome' }),
    newWithAi: buildWithAi,
    wishlist: () => {
      if (project === null) {
        setMessage({ kind: 'error', text: 'Open a project to see its Wishlist.' });
        return;
      }
      setDialog({ type: 'wishlist' });
    },
    pictureToTexture: needsNamespace(() => {
      const namespace = selected?.id.split(':')[0] ?? project?.namespaces[0]?.name;
      if (namespace !== undefined) setDialog({ type: 'picture', namespace });
    }),
    modpacks: () => {
      if (bridge.modpacks === undefined) {
        setMessage({ kind: 'error', text: 'Modpacks are not available.' });
        return;
      }
      setDialog({ type: 'modpacks' });
    },
    clearRecentProjects: clearRecent,
    upgradeTarget: () => {
      if (project === null) {
        setMessage({ kind: 'error', text: 'Open a project first.' });
        return;
      }
      setDialog({ type: 'upgrade-target' });
    },
    toggleAiHelper,
    creator: () => {
      if (project === null) {
        setMessage({ kind: 'error', text: 'Open a project to use the Creator.' });
        return;
      }
      setDialog({ type: 'creator' });
    },
    surpriseMe: () => setDialog({ type: 'surprise' }),
    play: playNow,
    reloadGame,
    tryIt: () => {
      if (project === null) {
        setMessage({ kind: 'error', text: 'Open a project to try it.' });
        return;
      }
      if (useTryItStore.getState().open) {
        useTryItStore.getState().close();
        return;
      }
      select(null);
      useTryItStore.getState().openView();
    },
    home: goHome,
  };

  const commandHandlers: CommandHandlers = {
    newProject: handlers.new,
    newProjectFromStarter: handlers.newProjectFromStarter,
    examples: handlers.examples,
    openProject: handlers.open,
    openRecent: () => {
      void refreshRecent();
      setRecentPickerOpen(true);
    },
    upgradeTarget: project === null || target === null ? null : handlers.upgradeTarget,
    save: saveDisabledReason === null ? handlers.save : null,
    undo: snapshot.canUndo ? () => session.undo() : null,
    redo: snapshot.canRedo ? () => session.redo() : null,
    newElement: canAddElement ? () => setDialog({ type: 'element' }) : null,
    addNamespace: project === null ? null : () => setDialog({ type: 'namespace' }),
    importAssets: canAddElement ? handlers.importAssets : null,
    importStructure:
      canAddElement && importersFor('structure').length > 0 ? handlers.importStructure : null,
    importBlockbench:
      canAddElement && importersFor('blockbench').length > 0 ? handlers.importBlockbench : null,
    exportResourcePack: exportReason === null ? exportResourceZip : null,
    exportDataPack: dataExportReason === null ? exportDataZip : null,
    exportCombined: combinedReason === null ? exportCombined : null,
    installResourcePack: installReason === null ? installResource : null,
    installDataPack: dataInstallReason === null ? installData : null,
    exportStructures: structureExportReason === null ? exportStructures : null,
    exportSchematics: structureExportReason === null ? exportSchematics : null,
    exportFabricJar: fabricJarReason === null ? exportFabricJar : null,
    exportJavaProject: fabricJarReason === null ? exportJavaProject : null,
    exportMap: project === null || bridge.maps === undefined ? null : handlers.exportMap,
    testInMinecraft: fabricJarReason === null ? testInMinecraft : null,
    renameElement: selected === null ? null : renameSelected,
    goToDefinition: selected === null ? null : () => goToDefinition(),
    findUsages: selected === null ? null : findUsages,
    toggleRawJson:
      selected === null ? null : () => setActiveTab(activeTab === 'json' ? 'form' : 'json'),
    settings: handlers.settings,
    // Settings opens with the Game locations list first; it holds the install target.
    chooseInstallTarget: handlers.settings,
    checkForUpdates,
    whatsNew,
    firstMod: handlers.firstMod,
    modpacks: handlers.modpacks,
    newWithAi: aiController === null ? null : buildWithAi,
    pictureToTexture: canAddElement ? handlers.pictureToTexture : null,
    changeMinecraftTexture:
      project === null ? null : () => setDialog({ type: 'minecraft-texture' }),
    wishlist: project === null ? null : handlers.wishlist,
    aiHelper: aiController === null ? null : buildWithAi,
    aiExplainProblem:
      aiController === null || !aiKeySet || selectedProblem === null
        ? null
        : () => explainWithAi(selectedProblem),
    aiAskElement: aiController === null || selected === null ? null : () => askAiAbout(selected.id),
    creator: project === null ? null : handlers.creator,
    surpriseMe: handlers.surpriseMe,
    play: project === null || !playConnected ? null : playNow,
    reloadGame: project === null || !canReloadGame ? null : reloadGame,
    tryIt: project === null ? null : () => handlers.tryIt(),
    home: goHome,
    showcase: showShowcase,
    moreIdeas: target === null ? null : showMoreIdeas,
    yourMods: showYourMods,
    searchEverything: handlers.search,
  } satisfies Record<BuiltInCommandId, Action | null>;

  const palette = [
    ...paletteCommands(commandHandlers, session.pluginCommands, {
      modKey,
      onError: (title, error) =>
        setMessage({ kind: 'error', text: `${title}: ${messageOf(error)}` }),
    }),
    // The available plugin exporters of "More exports", as for the structure exports.
    ...pluginExports
      .filter((entry) => entry.reason === null)
      .map((entry) => ({
        id: `export-plugin:${entry.id}`,
        title: `Export ${entry.label}`,
        run: entry.onSelect,
      })),
  ];

  // Search (ADR 0124 D3, D9, D10; B667) ----------------------------------------------------

  /** The plugins the search reads: the built-ins, then the third-party facades. */
  const searchPlugins = useMemo(
    () => [...builtInPlugins, ...(externalPlugins ?? [])],
    [externalPlugins],
  );
  const searchRuntime = useRef<Promise<SearchRuntime> | null>(null);
  const searchClient = useRef<SearchClient | null>(null);
  /** The client and the feed, loaded and started once (lazy chunks; ADR 0124 D3). */
  const ensureSearch = useCallback((): Promise<SearchRuntime> => {
    const held = searchRuntime.current;
    if (held !== null) return held;
    const made = Promise.all([import('./search/client'), import('./search/sources')]).then(
      ([clientModule, sourcesModule]) => {
        const client = new clientModule.SearchClient();
        const feed = new sourcesModule.SearchFeed({
          client,
          plugins: () => searchPlugins,
          lists: SEARCH_LISTS,
          defaultTargetId: session.defaultTargetId ?? '',
          targetFacts,
          session,
          history: () => usePreferences.getState().searchHistory,
        });
        if (searchRuntime.current === made) {
          searchClient.current = client;
          void feed.start();
        }
        return { client, feed };
      },
    );
    searchRuntime.current = made;
    return made;
  }, [session, searchPlugins]);
  // The client starts after the first paint, so typing never waits on the static layer.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => void ensureSearch(), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
      const held = searchRuntime.current;
      searchRuntime.current = null;
      searchClient.current = null;
      void held?.then(({ client, feed }) => {
        feed.dispose();
        client.dispose();
      });
    };
  }, [ensureSearch]);
  // A chosen result or search changes the context's history counts.
  useEffect(
    () =>
      usePreferences.subscribe((state, previous) => {
        if (state.searchHistory !== previous.searchHistory) {
          void searchRuntime.current?.then(({ feed }) => feed.refreshContext());
        }
      }),
    [],
  );
  /** Opens the search panel from a door, with the letters typed on it. */
  const openSearch = (door: SearchDoor, text = ''): void => {
    if (searchDoor !== null) return;
    const active = document.activeElement;
    searchReturn.current = active instanceof HTMLElement ? active : null;
    setSearchDoor({ door, text });
    void ensureSearch().then(({ feed }) => {
      // Home and the empty editor lean to making; the toolbar to nothing in particular.
      feed.setLean(door === 'start' ? 'make' : undefined);
      void feed.prepare();
    });
  };
  const closeSearch = useCallback(() => setSearchDoor(null), []);
  const querySearch = useCallback(
    async (request: Parameters<SearchClient['query']>[0]) =>
      (await ensureSearch()).client.query(request),
    [ensureSearch],
  );
  /** The palette door: the engine's order of the commands for typed words (ADR 0124 D10). */
  const rankCommands = useCallback(
    async (text: string): Promise<readonly string[] | null> => {
      const { client, feed } = await ensureSearch();
      feed.setLean('command');
      const answer = await client.query({
        text,
        mode: SEARCH_MODE,
        scope: 'commands',
        limit: 50,
      });
      return answer === null ? null : commandIdsOf(answer);
    },
    [ensureSearch],
  );
  /** A question of the search's actions as a chooser; `null` when cancelled. */
  const askChoice = (title: string, choices: readonly Choice[], lead?: string) =>
    new Promise<string | null>((resolve) =>
      setDialog({
        type: 'choice',
        title,
        choices,
        ...(lead === undefined ? {} : { lead }),
        resolve,
      }),
    );
  /**
   * No mod is open: a new one for the search's action (ADR 0124 D9), from a starter or example
   * when given. Very easy asks only the name, in the folder its New uses; Easy and Advanced pick
   * the folder as New project does.
   */
  const startSearchMod = (request: SearchStartMod): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const from = request.from;
      const options = (folder?: string): NewProjectOptions => ({
        ...(folder === undefined ? {} : { folder }),
        ...(from === undefined
          ? {}
          : {
              bundle: from.source,
              ...(from.values === undefined ? {} : { values: { ...from.values } }),
            }),
      });
      const direct = (): void => {
        void (async () => {
          const outcome = await session.newProject(options());
          await openWith('New mod', async () => outcome);
          resolve(outcome.ok);
        })();
      };
      const ask = bridge.project.defaultParent;
      if (ask === undefined) {
        direct();
        return;
      }
      ask().then(
        (parent) =>
          parent === ''
            ? direct()
            : setDialog({
                type: 'new-mod',
                parent,
                name: request.name,
                search: { options: (folder) => options(folder), resolve },
              }),
        direct,
      );
    });
  /** The sort of a vanilla id by the target's registries, as the search's vanilla layer has it. */
  const vanillaSort = (id: string): VanillaSort | undefined => {
    const client = searchClient.current;
    if (client === null) return undefined;
    const path = id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id;
    return VANILLA_SORTS.find((sort) => client.entry(`vanilla:${sort}:${path}`) !== undefined);
  };
  /** The host side of the search's actions (ADR 0124 D9; B664). */
  const searchHost: SearchActionHost = {
    session,
    mode: SEARCH_MODE,
    plugins: () => searchPlugins,
    vanillaSort,
    rememberChoice: (entryId) => usePreferences.getState().rememberSearchChoice(entryId),
    notify: (notice) => setMessage(notice),
    startMod: startSearchMod,
    openCreator: (start) => {
      if (session.snapshot.project === null) {
        setMessage({ kind: 'error', text: 'Start or open a mod first.' });
        return;
      }
      setDialog({
        type: 'creator',
        start: {
          flowId: start.flowId,
          values: start.values,
          ...(start.note === undefined ? {} : { note: start.note }),
        },
      });
    },
    chooseFlows: ({ flows, starters = [], tile }) => {
      if (session.snapshot.project === null) {
        setMessage({ kind: 'error', text: 'Start or open a mod first.' });
        return;
      }
      if (starters.length === 0) {
        setDialog({ type: 'creator', flowIds: flows });
        return;
      }
      const title =
        homeTiles.find((shown) => shown.tile.id === tile)?.tile.label ??
        'What do you want to make?';
      setDialog({ type: 'make-choice', title, choices: makeChoicesOf(flows, starters) });
    },
    chooseMake: async ({ thing, choices }) => {
      const picked = await askChoice(
        `Make something with ${thing}`,
        choices.map((choice, index) => ({
          id: String(index),
          title: choice.title,
          sentence: choice.questionLabel,
        })),
      );
      return picked === null ? null : (choices[Number(picked)] ?? null);
    },
    chooseSubject: async ({ choices }) => {
      const picked = await askChoice(
        'What is the rule about?',
        choices.map((choice) => ({ id: choice.id, title: choice.name })),
      );
      return picked === null ? null : (picked as ResourceLocation);
    },
    newElement: ({ kind, template }) => {
      if ((session.snapshot.project?.namespaces.length ?? 0) === 0) {
        setMessage({ kind: 'error', text: 'Open a project with a namespace first.' });
        return;
      }
      setDialog({ type: 'element', kind, ...(template === undefined ? {} : { template }) });
    },
    showMine: (kind) => {
      const first = session.snapshot.project?.namespaces
        .flatMap((entry) => entry.elements)
        .filter((element) => element.kind === kind)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (first === undefined) {
        setMessage({ kind: 'info', text: 'Your mod has none of these yet.' });
        return;
      }
      useTryItStore.getState().close();
      select(null);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('[data-testid="my-things"]')
          ?.scrollIntoView({ block: 'start' }),
      );
    },
    openElement: (id) => {
      useTryItStore.getState().close();
      navigateTo(id, null);
    },
    renameElement: (id) => {
      const element = findProjectElement(session.snapshot.project, id);
      const registry = element === undefined ? '' : kindRegistry(element.kind, session.registry);
      const references = session.references
        .to(id)
        .filter((reference) => reference.registry === '' || reference.registry === registry).length;
      setDialog({ type: 'rename', id, references });
    },
    findUsages: (id) => setDialog({ type: 'usages', id, usages: session.references.to(id) }),
    editInCreator: (id) => {
      const element = findProjectElement(session.snapshot.project, id);
      if (element !== undefined) editInCreator(element);
    },
    openAsset: (namespace, path) => {
      if (!path.endsWith('.png')) {
        reveal(`assets/${namespace}/${path}`);
        return;
      }
      session.readAsset(namespace, path).then(
        (bytes) => setDialog({ type: 'paint', namespace, path, bytes }),
        (error: unknown) =>
          setMessage({ kind: 'error', text: `Cannot open ${path}: ${messageOf(error)}` }),
      );
    },
    openRule: (book, index) => {
      useTryItStore.getState().close();
      navigateTo(book, `/rules/${index}`, null);
    },
    seeExample,
    openSettings: (setting) => openSettings(undefined, setting),
    runCommand: (command) => {
      const found = palette.find((entry) => entry.id === command);
      if (found === undefined) {
        setMessage({ kind: 'error', text: 'That cannot be done right now.' });
        return;
      }
      found.run();
    },
    openGuide: (page, anchor) => {
      if (bridge.guide === undefined) {
        setMessage({ kind: 'error', text: 'The guide is not available here.' });
        return;
      }
      setDialog({ type: 'guide', page, anchor });
    },
    showProblem: (problem) => {
      if (problem.elementId === undefined) return;
      useTryItStore.getState().close();
      navigateTo(problem.elementId, problem.path ?? null, problem.range ?? null);
    },
    paintMissing: (problem) => fixProblem(problem, 'paint-picture'),
    surprise: () => setDialog({ type: 'surprise' }),
    openRuleBook,
    paint: () => {
      if (ownNamespace === undefined) {
        setMessage({ kind: 'error', text: 'Start or open a mod first.' });
        return;
      }
      setDialog({ type: 'new-texture', namespace: ownNamespace });
    },
    askAi: buildWithAi,
    copyText: (text) => {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
      if (clipboard === undefined) {
        setMessage({ kind: 'error', text: 'Copy is not available here.' });
        return;
      }
      clipboard.writeText(text).then(
        () => setMessage({ kind: 'info', text: `Copied ${text}.` }),
        (error: unknown) => setMessage({ kind: 'error', text: `Copy: ${messageOf(error)}` }),
      );
    },
  };
  const searchHostRef = useRef(searchHost);
  searchHostRef.current = searchHost;
  /** A result's button (ADR 0124 D9): the panel closes, then the action runs. */
  const onSearchAction = useCallback(
    (hit: SearchHit, which: SearchActionKey, options?: SearchActionOptions) => {
      const actions = searchActions;
      if (actions === null) return;
      setSearchDoor(null);
      void actions.runSearchAction(searchHostRef.current, hit, which, options);
    },
    [],
  );
  const onSearchWish = useCallback((text: string) => {
    void searchActions?.addSearchWish(searchHostRef.current, text);
  }, []);
  const canFixSearch = useCallback(
    (hit: SearchHit) => searchActions?.canFixSearchHit(session, hit) ?? false,
    [session],
  );
  const newProjectWithAiRef = useRef(newProjectWithAi);
  newProjectWithAiRef.current = newProjectWithAi;
  /**
   * **Ask the AI helper** (ADR 0124 D12): the helper's panel waits with the words and the hints,
   * or New project with the AI helper with no mod; nothing is sent. When nothing opens (no key,
   * no helper) the panel stays and shows the outcome's quiet line.
   */
  const onSearchAskAi = useCallback(
    (text: string, hits: readonly SearchHit[]) => {
      setSearchAiLine(null);
      void askAi(text, hits, {
        controller: aiController,
        newProjectWithAi: (draft) => {
          // The panel closes first, so New project with the AI helper never sits under it.
          setSearchDoor(null);
          newProjectWithAiRef.current(draft);
        },
      }).then((outcome) => {
        if (outcome.status === 'unavailable') setSearchAiLine(outcome.line);
        else setSearchDoor(null);
      });
    },
    [aiController],
  );
  useEffect(() => {
    if (searchDoor === null) setSearchAiLine(null);
  }, [searchDoor]);
  /** A third-party plugin's name for its search results (B670); built-in plugins have none. */
  const searchPluginName = (id: string): string | undefined =>
    session.externalPlugins.find((plugin) => plugin.id === id)?.name;
  const searchText = searchWords(SEARCH_MODE);
  /** The large bar of the start surfaces (Home, the empty editor area). */
  const startSearchBar = (testId: string) => (
    <SearchDoorField
      data-testid={testId}
      size="large"
      placeholder={searchText.placeholder.start}
      shortcut={`${modKey}+K`}
      onOpen={(text) => openSearch('start', text)}
    />
  );

  const dispatch = (command: MenuCommand, source: CommandSource): void => {
    if (deduper.shouldRun(command, source)) handlers[command]();
  };

  useEffect(() => bridge.onMenu((command) => dispatch(command, 'menu')));

  useEffect(() => bridge.onMenuOpenRecent((root) => openRecent(root)), [bridge, openRecent]);
  // Picture files dropped anywhere on the window open Picture to texture with them (ADR 0054).
  const dropPicturesRef = useRef<(files: File[]) => void>(() => {});
  dropPicturesRef.current = (files) => {
    const namespace = selected?.id.split(':')[0] ?? project?.namespaces[0]?.name;
    if (namespace === undefined || dialog !== null) return;
    void Promise.all(
      files.map(async (file) => ({
        name: file.name,
        data: new Uint8Array(await file.arrayBuffer()),
      })),
    ).then((pictures) => setDialog({ type: 'picture', namespace, pictures }));
  };
  useEffect(() => {
    const isPicture = (file: File): boolean =>
      file.type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/i.test(file.name);
    const onDragOver = (event: DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    const onDrop = (event: DragEvent): void => {
      if (event.defaultPrevented) return;
      const files = [...(event.dataTransfer?.files ?? [])].filter(isPicture);
      if (files.length === 0) return;
      event.preventDefault();
      dropPicturesRef.current(files);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // File > More Exports lists the plugin exporters too (the toolbar's "More exports").
  const menuPluginExports = JSON.stringify(
    pluginExports.map((entry) => ({
      id: entry.id,
      label: entry.label,
      enabled: entry.reason === null,
    })),
  );
  useEffect(() => {
    bridge.setMenuPluginExports?.(JSON.parse(menuPluginExports));
  }, [bridge, menuPluginExports]);
  const pluginExportsRef = useRef(pluginExports);
  pluginExportsRef.current = pluginExports;
  useEffect(
    () =>
      bridge.onMenuPluginExport?.((id) =>
        pluginExportsRef.current.find((entry) => entry.id === id)?.onSelect(),
      ),
    [bridge],
  );

  const recentPicks = useMemo<PaletteCommand[]>(
    () =>
      recentProjects.map((entry, index) => ({
        id: `recent-${index}`,
        title: `${entry.name}${entry.exists ? '' : ' (missing)'} — ${entry.root}`,
        run: () => openRecent(entry.root),
      })),
    [recentProjects, openRecent],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = shortcutFor(event);
      if (
        command === null ||
        dialog !== null ||
        paletteOpen ||
        recentPickerOpen ||
        searchDoor !== null
      ) {
        return;
      }
      // Text fields keep their native undo/redo.
      if ((command === 'undo' || command === 'redo') && isEditableTarget(document.activeElement)) {
        return;
      }
      if (command === 'newElement') {
        // The menu has no Ctrl/Cmd+N (New project is Ctrl/Cmd+Shift+N), so only this runs.
        if (!canAddElement) return;
        event.preventDefault();
        setDialog({ type: 'element' });
        return;
      }
      event.preventDefault();
      dispatch(menuEquivalent[command], 'keyboard');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Form and preview -----------------------------------------------------------

  const selectedIdForEdit = selected?.id ?? null;
  const editValue = useCallback(
    (pointer: string, value: Json | undefined, options?: ChangeOptions) => {
      if (selectedIdForEdit === null) return;
      try {
        session.setElementValue(selectedIdForEdit, pointer, value, options ?? {});
      } catch (error) {
        setMessage({ kind: 'error', text: `Edit: ${messageOf(error)}` });
      }
    },
    [session, selectedIdForEdit, setMessage],
  );

  const mcVersion = target?.mcVersion ?? null;
  const cacheReady = minecraft.status?.cache != null;
  const vanilla = useMemo<VanillaAssetReader | null>(
    () =>
      cacheReady && mcVersion !== null
        ? { readAsset: (path) => bridge.minecraft.readAsset(mcVersion, path) }
        : null,
    [cacheReady, mcVersion, bridge],
  );
  /** The user's own Minecraft textures for the picker (ADR 0129 D4), from the asset cache. */
  const minecraftTexturesHost = useMemo<MinecraftTexturesHost | null>(
    () =>
      mcVersion === null
        ? null
        : {
            ready: cacheReady,
            list: () => bridge.minecraft.listAssets(mcVersion, MC_TEXTURES_PREFIX),
            read: (path) => bridge.minecraft.readAsset(mcVersion, path),
            openSetUp: () => setDialog({ type: 'settings' }),
          },
    [cacheReady, mcVersion, bridge],
  );
  /**
   * Change a Minecraft texture (ADR 0129 D4): the painter on the user's own override when the
   * project has one, else on the picked picture, saved at the same path in `minecraft`.
   */
  const paintMinecraftTexture = async (pick: McTexturePick): Promise<void> => {
    const { namespace, path } = overrideOf(pick.texture);
    const existing = hasOverride(project, pick.texture);
    const bytes = existing ? await session.readAsset(namespace, path) : pick.bytes;
    setDialog({
      type: 'paint',
      namespace,
      path,
      bytes,
      isNew: !existing,
      mcmeta: pick.mcmeta,
      title: `Change how ${pick.texture.name} looks in Minecraft`,
    });
  };
  const readProjectAsset = useCallback(
    (namespace: string, path: string) =>
      session.readAsset(namespace, path).catch((): Uint8Array | null => null),
    [session],
  );
  const vanillaSounds = useMemo(
    () =>
      mcVersion === null
        ? null
        : createVanillaSoundReader({
            mcVersion,
            readAssetObject: bridge.minecraft.readAssetObject,
          }),
    [mcVersion, bridge],
  );
  const soundSources = useMemo<SoundSources>(
    () => ({
      project,
      sounds: vanillaSounds,
      readProjectAsset,
      onSetup: () => setDialog({ type: 'settings' }),
    }),
    [project, vanillaSounds, readProjectAsset],
  );

  /** The pictures of things: the mod's textures and the user's jar (Home, the search preview). */
  const thingPictures = useMemo(
    () => ({
      project: thumbnail,
      vanilla: vanilla === null ? undefined : (path: string) => vanilla.readAsset(path),
      revision: assetRevision,
    }),
    [thumbnail, vanilla, assetRevision],
  );
  /** What the search's live preview reads (ADR 0124 D9; B665). */
  const guidePlatform = bridge.guide;
  const resultPreviewHost = useMemo<ResultPreviewHost | null>(
    () =>
      target === null
        ? null
        : {
            mode: SEARCH_MODE,
            target,
            library: session.library,
            isKnownKind: (kind) => session.registry.get(kind) !== undefined,
            previewKindOf: (kind) => session.registry.get(kind)?.previewKind,
            kindDefault: (kind) => session.kindDefault(kind),
            project,
            folders: target.folders.resource,
            readProjectAsset,
            vanilla,
            pictures: thingPictures,
            showcase: { deps: showcaseDeps, playClips: showcaseClips },
            ...(guidePlatform === undefined
              ? {}
              : {
                  readGuidePage: (page: string) =>
                    guidePlatform.page(page).then((loaded) => loaded.markdown),
                }),
            onSetup: () => setDialog({ type: 'settings' }),
            terrainSession: session,
            projectRoot: snapshot.root,
            vanillaTools: target.items?.vanillaTools,
          },
    [
      target,
      session,
      project,
      readProjectAsset,
      vanilla,
      thingPictures,
      showcaseDeps,
      showcaseClips,
      guidePlatform,
      snapshot.root,
    ],
  );
  const searchPreview = useCallback(
    (hit: SearchHit) =>
      resultPreviewHost === null ? null : (
        <Suspense fallback={null}>
          <ResultPreview hit={hit} host={resultPreviewHost} />
        </Suspense>
      ),
    [resultPreviewHost],
  );

  const templates = useMemo(
    () =>
      templatesFor(
        session.registry.all().map((kind) => kind.id),
        session.library.templates,
      ),
    [session],
  );

  const functionId = selected?.kind === FUNCTION_KIND ? selected.id : null;
  const functionProjectIds = useMemo(
    () => (project === null || functionId === null ? null : mcfunctionProjectIds(project)),
    [project, functionId],
  );
  const completeFunction = useMemo<CompleteFunction | undefined>(() => {
    if (functionId === null || functionProjectIds === null || target === null) return undefined;
    const targetId = target.id;
    const uri = functionElementUri(functionId, target);
    return (source, offset) =>
      bridge.mcfunction.complete(targetId, source, offset, {
        uri,
        projectIds: functionProjectIds,
        limit: 200,
      });
  }, [bridge, functionId, functionProjectIds, target]);

  const structureHost: StructureStudioHost = {
    replaceFromFile: (id) => void replaceFromFile(id),
    exportStructures: (format) => (format === 'nbt' ? exportStructures() : exportSchematics()),
    openElement: (id) => select(id),
  };

  const scriptTypings = session.scriptTypings;
  const scriptHost = useMemo(() => ({ typings: scriptTypings }), [scriptTypings]);

  const blocksItemsHost: BlocksItemsStudioHost = {
    thumbnail,
    revision: assetRevision,
    problems: snapshot.problems,
    textureLayers: (model) => session.textureLayers(model),
    addElement: (input) => {
      try {
        session.addElement(input);
        select(input.id);
      } catch (error) {
        setMessage({ kind: 'error', text: `Add ${input.id}: ${messageOf(error)}` });
      }
    },
    newFromTemplate: (templateId, id) => {
      const template = templates.find((entry) => entry.id === templateId);
      if (template === undefined || target === null) {
        setMessage({ kind: 'error', text: `Add ${id}: the template ${templateId} is missing.` });
        return;
      }
      const fail = (error: unknown) =>
        setMessage({ kind: 'error', text: `Add ${id}: ${messageOf(error)}` });
      const add = (data: Json) => {
        try {
          session.addElement({ id, kind: template.kind, data });
          select(id);
        } catch (error) {
          fail(error);
        }
      };
      try {
        Promise.resolve(
          template.data(
            templateContext(id, namespaces, session.kindDefault(template.kind), target),
          ),
        ).then(add, fail);
      } catch (error) {
        fail(error);
      }
    },
    ...(target === null
      ? {}
      : { modelPreview: { folders: target.folders.resource, readProjectAsset, vanilla } }),
    applyChanges: async (items, label, writes) => {
      const result = await session.applyChangeset(items, label, { writes });
      setAssetRevision((revision) => revision + 1);
      if (result.skipped.length > 0) {
        throw new Error('The project changed meanwhile: nothing was written. Try again.');
      }
    },
    paintTexture: (namespace, path, size) => {
      const exists = project?.namespaces
        .find((entry) => entry.name === namespace)
        ?.assets.some((asset) => asset.path === path);
      if (exists !== true) {
        setDialog({ type: 'paint', namespace, path, bytes: null, size, isNew: true });
        return;
      }
      session.readAsset(namespace, path).then(
        (bytes) => setDialog({ type: 'paint', namespace, path, bytes }),
        (error: unknown) =>
          setMessage({ kind: 'error', text: `Cannot open ${path}: ${messageOf(error)}` }),
      );
    },
  };

  const form =
    project !== null && selected !== null ? (
      <StructureStudioHostContext.Provider value={structureHost}>
        <ScriptStudioHostContext.Provider value={scriptHost}>
          <BlocksItemsStudioHostContext.Provider value={blocksItemsHost}>
            <ElementForm
              complete={completeFunction}
              project={project}
              element={selected}
              kind={selectedKind}
              problems={selectedProblems}
              schema={schema}
              onChange={editValue}
              focusPointer={selectedPointer}
              {...(selectedRange === null ? {} : { focusColumn: selectedRange.start })}
              onFocused={clearPointer}
            />
          </BlocksItemsStudioHostContext.Provider>
        </ScriptStudioHostContext.Provider>
      </StructureStudioHostContext.Provider>
    ) : undefined;

  const preview =
    project !== null && target !== null ? (
      <PreviewPanel
        project={project}
        element={selected}
        previewKind={selectedKind?.previewKind}
        folders={target.folders.resource}
        readProjectAsset={readProjectAsset}
        vanilla={vanilla}
        onSetup={() => setDialog({ type: 'settings' })}
        onJumpTo={(pointer) => {
          if (selected !== null) navigateTo(selected.id, pointer, null);
        }}
        terrainSession={session}
        projectRoot={snapshot.root}
      />
    ) : undefined;
  // The live preview sits beside the form when shown (ADR 0047 D4); the dock then points there
  // instead of drawing a second canvas.
  const centrePreview = usePreferences((state) => state.centrePreview);
  const dockPreview =
    preview !== undefined && centrePreview && selected !== null ? (
      <p className="text-sm text-muted" data-testid="dock-preview-in-centre">
        The live preview is beside the form. Use Preview in the editor's header to move it back
        here.
      </p>
    ) : (
      preview
    );

  const tryItView =
    tryItOpen && project !== null ? (
      <Suspense
        fallback={
          <p className="grid size-full place-items-center text-sm text-muted">
            Loading the test area…
          </p>
        }
      >
        <TryItView
          session={session}
          root={snapshot.root}
          vanilla={vanilla}
          readProjectAsset={readProjectAsset}
          picture={(assetPath) => thumbnail(assetPath, 32)}
          assetRevision={assetRevision}
          vanillaBlockIds={async () => {
            const current = session.snapshot.project;
            if (current === null) return [];
            return (await session.schemas()).registries(current).ids('block');
          }}
          playAvailable={playConnected}
          onPlay={playNow}
          onTestInMinecraft={testInMinecraft}
          onSetUpVanilla={() => setDialog({ type: 'settings' })}
        />
      </Suspense>
    ) : undefined;

  // Whether nothing covers Home, so its one clip may play.
  const homeClipsVisible = dialog === null && !tryItOpen && !paletteOpen && searchDoor === null;
  const editorArea = (
    <EditorArea
      {...(tryItView === undefined ? {} : { tryIt: tryItView })}
      element={selected}
      form={form}
      tab={activeTab}
      onTabChange={setActiveTab}
      onApply={(id: ResourceLocation, data: Json) =>
        run('Apply', () => session.setElementData(id, data))
      }
      {...(aiController === null ? {} : { onAskAi: askAiAbout })}
      onEditInCreator={editInCreator}
      {...(preview === undefined ? {} : { preview })}
      previewShown={centrePreview}
      onTogglePreview={() => usePreferences.getState().toggleCentrePreview()}
      onRename={(element) => {
        if (element.kind === RULES_KIND) {
          setDialog({
            type: 'rename',
            id: element.id,
            references: session.references.to(element.id).length,
          });
          return;
        }
        setDialog({ type: 'rename-thing', id: element.id, name: displayNameOf(element) });
      }}
      onChangeId={(id) => {
        select(id);
        renameById(id);
      }}
      usedBy={usedByOf}
      filesOf={(id) => session.filesOf(id)}
      onOpenElement={(id) => navigateTo(id, null)}
      {...{
        home: (
          <Home
            project={project}
            tiles={homeTiles}
            onTile={openTile}
            cards={homeCards}
            texturesFolder={target?.folders.resource.textures ?? 'textures'}
            pictures={thingPictures}
            onOpenThing={(card) => navigateTo(card.main.id, null)}
            onEditInCreator={(card) => editInCreator(card.main)}
            onRenameThing={renameThing}
            onDuplicateThing={duplicateThing}
            onDeleteThing={deleteThing}
            onNewProject={handlers.new}
            onSurprise={handlers.surpriseMe}
            onOpenProject={handlers.open}
            recentProjects={recentProjects}
            onOpenRecent={openRecent}
            onRemoveRecent={removeRecent}
            onShowRecentInFolder={(root) => {
              bridge.shell
                .showItemInFolder(root)
                .catch((error: unknown) =>
                  setMessage({ kind: 'error', text: `Show in folder: ${messageOf(error)}` }),
                );
            }}
            {...(bridge.project.recentSummary === undefined
              ? {}
              : {
                  recentSummary: (root: string) =>
                    bridge.project.recentSummary?.(root) ??
                    Promise.reject(new Error('No summary.')),
                })}
            search={startSearchBar('home-search-field')}
            showcase={homeGallery(homeClipsVisible && ideaLive === null, homeClipsVisible)}
            {...(heroExample === null || target === null
              ? {}
              : {
                  heroPicture: (
                    <HeroPicture
                      example={heroExample.example}
                      target={target}
                      label={heroExample.label}
                    />
                  ),
                })}
            showcaseOpen={showcaseOpen}
            onShowcaseOpenChange={(open) => usePreferences.getState().setShowcaseOpen(open)}
          />
        ),
      }}
    />
  );

  return (
    <ShellProviders
      textureDrop={project === null ? null : dropTexture}
      plainWords={plainWords}
      sounds={soundSources}
    >
      <AiPicturesContext.Provider value={aiPicturesHost}>
        <MinecraftTexturesContext.Provider value={minecraftTexturesHost}>
          <Tooltip.Provider delayDuration={400}>
            <Toast.Provider swipeDirection="right" label="Notification">
              <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
                <div>
                  <UpdateBanner
                    updates={bridge.updates}
                    onWhatsNew={openWhatsNew}
                    beforeInstall={reportUnsavedBeforeUpdate}
                  />
                  <Toolbar
                    hasProject={project !== null}
                    canUndo={snapshot.canUndo}
                    canRedo={snapshot.canRedo}
                    undoLabel={snapshot.undoLabel}
                    redoLabel={snapshot.redoLabel}
                    saveDisabledReason={saveDisabledReason}
                    canAddElement={canAddElement}
                    exportDisabledReason={exportReason}
                    installDisabledReason={installReason}
                    dataExportDisabledReason={dataExportReason}
                    combinedExportDisabledReason={combinedReason}
                    dataInstallDisabledReason={dataInstallReason}
                    primaryExport={hasDataPack && !hasResourcePack ? 'data' : 'resource'}
                    exporting={exporting}
                    onNew={handlers.new}
                    onNewFromStarter={handlers.newProjectFromStarter}
                    onExamples={handlers.examples}
                    {...(aiController === null ? {} : { onNewWithAi: buildWithAi })}
                    onHome={goHome}
                    onShare={shareMyMod}
                    onTryIt={handlers.tryIt}
                    tryItOpen={tryItOpen}
                    shareDisabledReason={fabricJarReason}
                    onFirstMod={handlers.firstMod}
                    onWhatsNew={whatsNew}
                    onCreator={handlers.creator}
                    onOpen={handlers.open}
                    recentProjects={recentProjects}
                    onOpenRecent={openRecent}
                    onRemoveRecent={removeRecent}
                    onClearRecent={clearRecent}
                    onRecentMenuOpen={() => void refreshRecent()}
                    onSave={handlers.save}
                    onUndo={() => session.undo()}
                    onRedo={() => session.redo()}
                    onAddElement={() => setDialog({ type: 'element' })}
                    onImportAssets={handlers.importAssets}
                    onExportZip={exportResourceZip}
                    onExportDataZip={exportDataZip}
                    onExportCombined={exportCombined}
                    structureExportDisabledReason={structureExportReason}
                    onExportStructures={exportStructures}
                    onExportSchematics={exportSchematics}
                    pluginExports={pluginExports}
                    fabricJarExportDisabledReason={fabricJarReason}
                    onExportFabricJar={exportFabricJar}
                    onExportJavaProject={exportJavaProject}
                    onTestInMinecraft={testInMinecraft}
                    onInstall={installResource}
                    onInstallData={installData}
                    onSettings={handlers.settings}
                    onSearch={(text) => openSearch('toolbar', text)}
                    searchPlaceholder={searchText.placeholder.toolbar}
                    {...(aiController === null ? {} : { onAiHelper: toggleAiHelper })}
                    installTarget={installTarget}
                    installTargets={installTargets}
                    onChooseInstallTarget={(id) => void chooseInstallTarget(id)}
                  />
                  {sharedJar !== null && (
                    <div
                      role="status"
                      data-testid="share-done"
                      className="flex flex-wrap items-center gap-2 border-b border-border bg-panel px-3 py-1.5 text-sm"
                    >
                      <span>
                        Your mod is saved. Give the file to friends: they put it in their mods
                        folder.
                      </span>
                      <button
                        type="button"
                        data-testid="share-where"
                        className="cursor-pointer text-accent underline-offset-2 hover:underline"
                        onClick={() => {
                          bridge.shell.showItemInFolder(sharedJar).catch((error: unknown) => {
                            setMessage({ kind: 'error', text: `Where is it? ${messageOf(error)}` });
                          });
                        }}
                      >
                        Where is it?
                      </button>
                      <button
                        type="button"
                        data-testid="share-done-close"
                        className="ml-auto cursor-pointer text-muted text-xs hover:text-text"
                        onClick={() => setSharedJar(null)}
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
                <main className="grid min-h-0 grid-cols-[minmax(200px,280px)_minmax(0,1fr)_minmax(260px,360px)]">
                  {
                    <ElementSidebar
                      project={project}
                      selectedId={selectedId}
                      onSelect={(id) => select(id)}
                      onRemove={(id: ResourceLocation) => {
                        const remove = () => run('Remove element', () => session.removeElement(id));
                        const warning = session.deleteExportedIdsWarning([id]);
                        if (warning === null) {
                          remove();
                          return;
                        }
                        setDialog({
                          type: 'delete-exported',
                          title: 'Remove element',
                          message: exportedIdsWarningText('delete', warning, false, id),
                          confirmLabel: REMOVE_ANYWAY_LABEL,
                          onConfirm: remove,
                        });
                      }}
                      assetActions={{
                        onImport: (namespace) => setDialog({ type: 'import', namespace }),
                        onRemove: (namespace, path) =>
                          setDialog({ type: 'remove-asset', namespace, path }),
                        onReveal: (namespace, path) => reveal(`assets/${namespace}/${path}`),
                        onPaint: (namespace, path) => {
                          session.readAsset(namespace, path).then(
                            (bytes) => setDialog({ type: 'paint', namespace, path, bytes }),
                            (error: unknown) =>
                              setMessage({
                                kind: 'error',
                                text: `Cannot open ${path}: ${messageOf(error)}`,
                              }),
                          );
                        },
                        onNewTexture: (namespace) => setDialog({ type: 'new-texture', namespace }),
                        onPicture: (namespace) => setDialog({ type: 'picture', namespace }),
                        thumbnail,
                        revision: assetRevision,
                      }}
                      recentProjects={recentProjects}
                      onOpenRecent={openRecent}
                      onRemoveRecent={removeRecent}
                      collapsed={collapsedGroups}
                      onToggleGroup={(key) => usePreferences.getState().toggleCollapsed(key)}
                      flowTitles={flowTitles}
                    />
                  }
                  {editorArea}
                  <RightDock
                    problems={snapshot.problems}
                    exportProblems={exportProblems}
                    tab={rightDock}
                    onTabChange={setRightDock}
                    preview={dockPreview}
                    onNavigate={(problem) => {
                      setLastProblem(problem);
                      navigateTo(problem.elementId, problem.path ?? null, problem.range ?? null);
                    }}
                    onReveal={reveal}
                    {...(aiController === null
                      ? {}
                      : {
                          assistant: (
                            <AiPanel
                              controller={aiController}
                              onOpenSettings={openAiSettings}
                              onShowMe={showAiStep}
                              onUndo={() => undoAiStep(session)}
                              onRedo={() => redoAiStep(session)}
                            />
                          ),
                          onExplain: explainWithAi,
                        })}
                  />
                </main>
                <div>
                  {project !== null && (
                    <ThingsToFix
                      project={project}
                      problems={[...snapshot.problems, ...exportProblems]}
                      onShow={(problem) => {
                        if (problem.elementId === undefined) return;
                        navigateTo(problem.elementId, problem.path ?? null, problem.range ?? null);
                      }}
                      onFix={fixProblem}
                      {...(aiController === null ? {} : { onAsk: explainWithAi })}
                    />
                  )}
                  <StatusBar snapshot={snapshot} target={project === null ? null : target} />
                </div>
              </div>
              <StatusToast />
              {dialog?.type === 'namespace' && (
                <NewNamespaceDialog
                  onCancel={() => setDialog(null)}
                  onSubmit={(name) => {
                    session.addNamespace(name);
                    setDialog(null);
                  }}
                />
              )}
              {dialog?.type === 'element' && project !== null && target !== null && (
                <NewElementDialog
                  namespaces={namespaces}
                  templates={templatesFirst(templates, dialog.kind, dialog.template)}
                  kindDefault={(kind) => session.kindDefault(kind)}
                  target={target}
                  onCancel={() => setDialog(null)}
                  onSubmit={(input) => {
                    // Throws on kind rules (e.g. `<ns>:sounds`) and duplicates; the dialog shows it.
                    session.addElement(input);
                    navigateTo(input.id, null);
                    setDialog(null);
                  }}
                />
              )}
              {dialog?.type === 'new-project' && (
                <NewProjectDialog
                  starters={session.library.starters}
                  targets={session.availableTargets}
                  defaultTargetId={session.defaultTargetId ?? ''}
                  onCancel={() => setDialog(null)}
                  {...(project === null
                    ? {}
                    : { onOpenCreator: () => setDialog({ type: 'creator' }) })}
                  {...(dialog.startWith === undefined ? {} : { startWith: dialog.startWith })}
                  {...(showcaseList.length === 0
                    ? {}
                    : {
                        renderShowcase: (choose: (flowIds: readonly string[]) => void) =>
                          showcaseGallery(
                            showcaseList,
                            true,
                            (clip) => {
                              const shown = showcaseTile(clip);
                              if (shown !== null) choose(shown.flowIds);
                            },
                            seeShowcaseExample,
                          ),
                      })}
                  onCreate={({ starterId, targetId, values }) => {
                    // The dialog closes first; `newProject` then asks for the folder.
                    setDialog(null);
                    const starter =
                      starterId === null
                        ? undefined
                        : session.library.starters.find((entry) => entry.id === starterId);
                    void openWith(
                      starter === undefined ? 'New project' : `New project from "${starter.title}"`,
                      () =>
                        session.newProject({
                          starterId,
                          values,
                          ...(targetId === '' ? {} : { targetId }),
                        }),
                    );
                  }}
                />
              )}
              {dialog?.type === 'upgrade-target' && project !== null && target !== null && (
                <UpgradeTargetDialog
                  currentTargetId={target.id}
                  targets={session.availableTargets}
                  preview={previewUpgrade}
                  onCancel={() => setDialog(null)}
                  onUpgrade={(targetId, report) => {
                    setDialog(null);
                    session.upgradeTarget(targetId, report).then(
                      () => {
                        setMessage({
                          kind: 'info',
                          text: `Project target changed to ${targetId}.`,
                        });
                        void refreshMinecraftStatus();
                      },
                      (error: unknown) =>
                        setMessage({
                          kind: 'error',
                          text: `Upgrade project target failed: ${messageOf(error)}`,
                        }),
                    );
                  }}
                />
              )}
              {dialog?.type === 'examples' && (
                <ExamplesDialog
                  examples={session.library.examples}
                  namespaces={project === null ? null : namespaces}
                  target={target}
                  onClose={() => setDialog(null)}
                  onOpenAsProject={(example) => {
                    setDialog(null);
                    void openWith(`New project from example "${example.title}"`, () =>
                      session.newProject({ bundle: example }),
                    );
                  }}
                  onCopy={async (example, namespace) => {
                    const result = await copyExample(example, namespace);
                    const first = result.added[0];
                    if (first !== undefined) select(first);
                    return result;
                  }}
                  renderClip={(example) => {
                    const clips = showcaseByExample.get(example.id);
                    return clips === undefined
                      ? null
                      : showcaseGallery(
                          clips,
                          true,
                          makeShowcase,
                          seeShowcaseExample,
                          'What it looks like',
                        );
                  }}
                />
              )}
              {dialog?.type === 'creator' && project !== null && target !== null && (
                <CreatorDialog
                  session={session}
                  project={project}
                  namespaces={namespaces.filter((name) => name !== 'minecraft')}
                  edit={dialog.edit ?? null}
                  {...(dialog.start === undefined ? {} : { start: dialog.start })}
                  {...(dialog.flowIds === undefined ? {} : { flowIds: dialog.flowIds })}
                  {...(dialog.picks === undefined ? {} : { picks: dialog.picks })}
                  folders={target.folders.resource}
                  readProjectAsset={readProjectAsset}
                  vanilla={vanilla}
                  pickImage={(title) =>
                    bridge.dialogs.pickFiles({
                      title,
                      filters: [{ name: 'PNG image', extensions: ['png'] }],
                    })
                  }
                  pickAudio={(title) =>
                    bridge.dialogs.pickFiles({
                      title,
                      filters: [{ name: 'Ogg Vorbis sound', extensions: ['ogg'] }],
                    })
                  }
                  onClose={() => setDialog(null)}
                  onCreated={(result) => {
                    setDialog(null);
                    if (result.written > 0 || result.applied > 0) {
                      setAssetRevision((revision) => revision + 1);
                    }
                    const skipped =
                      result.skipped > 0
                        ? ` ${result.skipped} no longer fitted and were skipped.`
                        : '';
                    const names = [...new Set(result.skippedNames)].join(', ');
                    const already =
                      result.skippedNames.length === 0
                        ? ''
                        : ` Not made again, because you already have ${names}. Use a different name to make a new one.`;
                    setMessage({
                      kind: result.skippedNames.length === 0 ? 'info' : 'error',
                      text: `${result.label}: ${result.changed} element(s) and file(s) changed. Undo reverts them in one step.${skipped}${already}${result.aiNote === undefined ? '' : ` ${result.aiNote}`}`,
                    });
                    const first = result.created[0];
                    if (first !== undefined) select(first);
                  }}
                />
              )}
              {dialog?.type === 'surprise' && (
                <SurpriseDialog
                  roll={rollSurpriseFor}
                  newMod={project === null}
                  onMake={makeSurprise}
                  onClose={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'make-choice' && (
                <MakeChooser
                  title={dialog.title}
                  choices={dialog.choices}
                  onClose={() => setDialog(null)}
                  onPick={(choice) => {
                    if (choice.type === 'flow') {
                      setDialog({ type: 'creator', flowIds: [choice.id] });
                      return;
                    }
                    setDialog(null);
                    addStarter(choice.id);
                  }}
                />
              )}
              {dialog?.type === 'modpacks' && bridge.modpacks !== undefined && (
                <ModpacksDialog
                  session={session}
                  modpacks={bridge.modpacks}
                  testInMinecraft={bridge.testInMinecraft}
                  saveFile={bridge.dialogs.saveFile}
                  targets={session.availableTargets}
                  currentProjectRoot={snapshot.root}
                  defaultTargetId={
                    project === null ? (session.defaultTargetId ?? '') : session.target.id
                  }
                  onOpenProject={(root) => {
                    setDialog(null);
                    void openWith('Open project', () => session.openPath(root));
                  }}
                  onClose={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'paint' && (
                <TextureEditorDialog
                  name={`${dialog.namespace}:${dialog.path}`}
                  bytes={dialog.bytes}
                  {...(dialog.size === undefined ? {} : { size: dialog.size })}
                  {...(dialog.title === undefined ? {} : { title: dialog.title })}
                  {...(dialog.mcmeta === undefined ? {} : { mcmeta: dialog.mcmeta })}
                  isNew={dialog.bytes === null || dialog.isNew === true}
                  onSave={async (bytes, mcmeta) => {
                    const override = dialog.namespace === 'minecraft';
                    if (dialog.bytes === null || dialog.isNew === true) {
                      await addNewTexture(dialog.namespace, dialog.path, bytes, mcmeta);
                    } else {
                      const change = pictureChange(
                        project,
                        dialog.namespace,
                        dialog.path,
                        bytes,
                        mcmeta,
                      );
                      await session.applyChangeset(change.items, `Paint ${dialog.path}`, {
                        writes: change.writes,
                      });
                    }
                    setAssetRevision((revision) => revision + 1);
                    setMessage({
                      kind: 'info',
                      text: override
                        ? `Saved your ${dialog.path}: the game shows it in place of its own once the resource pack is on. Undo takes it back.`
                        : dialog.bytes === null || dialog.isNew === true
                          ? `Added ${dialog.namespace}:${dialog.path}. Undo removes it.`
                          : `Painted ${dialog.path}. Undo restores the old picture.`,
                    });
                  }}
                  onClose={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'minecraft-texture' && minecraftTexturesHost !== null && (
                <Suspense fallback={null}>
                  <LazyMinecraftTexturePicker
                    host={minecraftTexturesHost}
                    title="Change a Minecraft texture"
                    onPick={paintMinecraftTexture}
                    onClose={() =>
                      setDialog((current) =>
                        current?.type === 'minecraft-texture' ? null : current,
                      )
                    }
                  />
                </Suspense>
              )}
              {dialog?.type === 'wishlist' && project !== null && (
                <WishlistDialog
                  projectName={project.name}
                  load={() => session.readWishlist()}
                  save={(entries) => session.writeWishlist(entries)}
                  copy={(text) => navigator.clipboard.writeText(text)}
                  onClose={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'picture' && (
                <PictureToTextureDialog
                  namespace={dialog.namespace}
                  existing={
                    project?.namespaces
                      .find((entry) => entry.name === dialog.namespace)
                      ?.assets.map((asset) => asset.path) ?? []
                  }
                  pickPictures={async () => {
                    const files = await bridge.dialogs.pickFiles({
                      title: 'Choose pictures',
                      filters: [
                        {
                          name: 'Pictures',
                          extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'],
                        },
                      ],
                    });
                    return files.map((file) => ({ name: file.name, data: file.data }));
                  }}
                  {...(dialog.pictures === undefined ? {} : { initialPictures: dialog.pictures })}
                  onAdd={async ({ path, bytes }) => {
                    await addNewTexture(dialog.namespace, path, bytes);
                    setMessage({
                      kind: 'info',
                      text: `Added ${dialog.namespace}:${path}. Undo removes it.`,
                    });
                  }}
                  onPaint={({ path, bytes, kind }) =>
                    setDialog({
                      type: 'paint',
                      namespace: dialog.namespace,
                      path,
                      bytes,
                      size: { width: kind.width, height: kind.height },
                      isNew: true,
                    })
                  }
                  onClose={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'new-texture' && (
                <NewTextureDialog
                  namespace={dialog.namespace}
                  existing={
                    project?.namespaces
                      .find((entry) => entry.name === dialog.namespace)
                      ?.assets.map((asset) => asset.path) ?? []
                  }
                  onPaint={({ kind, path, bytes, mcmeta }) =>
                    setDialog({
                      type: 'paint',
                      namespace: dialog.namespace,
                      path,
                      bytes: bytes ?? null,
                      size: { width: kind.width, height: kind.height },
                      isNew: true,
                      ...(mcmeta === undefined ? {} : { mcmeta }),
                    })
                  }
                  onClose={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'ai-start' && (
                <AiStartDialog
                  keySet={aiKeySet}
                  ai={bridge.ai}
                  model={aiModel}
                  parent={dialog.parent ?? null}
                  {...(dialog.draft === undefined
                    ? {}
                    : {
                        initialText: dialog.draft.text,
                        contextLabel: dialog.draft.context?.label ?? null,
                      })}
                  onStart={(description, pictures, folder) =>
                    startWithAi(description, pictures, folder, dialog.draft?.context?.block)
                  }
                  onKeyReady={() => void aiController?.refreshKey()}
                  onClose={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'welcome' && (
                <WelcomeDialog
                  hasProject={project !== null}
                  onSettings={handlers.settings}
                  onNewProject={() => {
                    setDialog(null);
                    handlers.new();
                  }}
                  onCreator={handlers.creator}
                  {...(aiController === null ? {} : { onBuildWithAi: buildWithAi })}
                  onClose={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'whats-new' && (
                <WhatsNewDialog
                  version={dialog.version}
                  notes={dialog.notes}
                  onClose={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'import' && project !== null && (
                <ImportAssetsDialog
                  namespaces={namespaces}
                  initialNamespace={dialog.namespace}
                  onImport={importAssets}
                  onCancel={() => setDialog(null)}
                />
              )}
              {dialog?.type === 'import-files' && project !== null && (
                <ImportFilesDialog
                  title={
                    dialog.mode === 'blockbench' ? 'Import Blockbench model' : 'Import structure'
                  }
                  namespaces={namespaces}
                  importers={importersFor(dialog.mode).map((entry) => entry.importer)}
                  note={dialog.mode === 'blockbench' ? BLOCKBENCH_IMPORT_NOTE : undefined}
                  onImport={(namespace) => importFiles(namespace, dialog.mode)}
                  onCancel={() => setDialog(null)}
                  testWorlds={
                    dialog.mode === 'structure' && bridge.maps !== undefined && target !== null
                      ? testWorldBuilds(bridge.maps, target.id)
                      : undefined
                  }
                />
              )}
              {dialog?.type === 'remove-asset' && (
                <ConfirmDialog
                  title="Remove asset"
                  message={`Remove ${dialog.namespace}:${dialog.path}? Undo brings it back.`}
                  confirmLabel="Remove"
                  onCancel={() => setDialog(null)}
                  onConfirm={() => {
                    const { namespace, path } = dialog;
                    setDialog(null);
                    session.removeAsset(namespace, path).then(
                      () => setMessage({ kind: 'info', text: `Removed ${namespace}:${path}.` }),
                      (error: unknown) =>
                        setMessage({ kind: 'error', text: `Remove asset: ${messageOf(error)}` }),
                    );
                  }}
                />
              )}
              {dialog?.type === 'new-mod' && (
                <NewModDialog
                  parent={dialog.parent}
                  {...(dialog.name === undefined ? {} : { initialName: dialog.name })}
                  onChangeFolder={() =>
                    bridge.dialogs.pickDirectory({ title: 'Choose where your mods are saved' })
                  }
                  onCancel={() => {
                    setDialog(null);
                    dialog.search?.resolve(false);
                  }}
                  onCreate={async (folder) => {
                    const search = dialog.search;
                    const outcome = await session.newProject(
                      search === undefined ? { folder } : search.options(folder),
                    );
                    if (outcome.ok) {
                      const afterwards = dialog.afterwards;
                      const surpriseIdea = dialog.surpriseIdea;
                      setDialog(null);
                      await openWith('New mod', async () => outcome);
                      if (afterwards !== undefined) setPendingTile(afterwards);
                      if (surpriseIdea !== undefined) void makeIdeaIn(surpriseIdea);
                      search?.resolve(true);
                      return null;
                    }
                    if ('cancelled' in outcome) return null;
                    return outcome.reason;
                  }}
                />
              )}
              {dialog?.type === 'rename-thing' && (
                <RenameThingDialog
                  name={dialog.name}
                  onCancel={() => setDialog(null)}
                  onSubmit={(name) => {
                    setDialog(null);
                    run('Rename', () => session.setElementValue(dialog.id, '/display_name', name));
                  }}
                />
              )}
              {dialog?.type === 'rename' && (
                <RenameElementDialog
                  id={dialog.id}
                  references={dialog.references}
                  warning={(newId) => {
                    const warning = session.renameExportedIdsWarning(dialog.id, newId);
                    if (warning === null) return null;
                    const element = project?.namespaces
                      .flatMap((namespace) => namespace.elements)
                      .find((entry) => entry.id === dialog.id);
                    const name = element === undefined ? dialog.id : displayNameOf(element);
                    return exportedIdsWarningText('rename', warning, false, name);
                  }}
                  onCancel={() => setDialog(null)}
                  onSubmit={(newId) => {
                    // Throws on kind rules and a missing namespace; the dialog shows it.
                    const result = session.renameElement(dialog.id, newId);
                    setDialog(null);
                    if (!result.renamed) {
                      setRightDock('problems');
                      setMessage({
                        kind: 'error',
                        text: `Cannot rename ${dialog.id} to ${newId}: that id is taken (see Problems).`,
                      });
                      return;
                    }
                    select(newId);
                    const count = result.references;
                    setMessage({
                      kind: 'info',
                      text: `Renamed ${dialog.id} to ${newId}; ${count} reference${count === 1 ? '' : 's'} rewritten.`,
                    });
                  }}
                />
              )}
              {dialog?.type === 'usages' && (
                <UsagesDialog
                  id={dialog.id}
                  usages={dialog.usages}
                  onClose={() => setDialog(null)}
                  onNavigate={(reference) => {
                    setDialog(null);
                    navigateTo(reference.from, reference.path === '' ? null : reference.path);
                  }}
                />
              )}
              <WorldPickerDialog
                open={dialog?.type === 'worlds'}
                worlds={dialog?.type === 'worlds' ? dialog.worlds : NO_WORLDS}
                {...(installTarget === null
                  ? {}
                  : { locationName: installTargetName(installTarget) })}
                onClose={() => setDialog(null)}
                onPick={(world) => {
                  setDialog(null);
                  void runPackExport('data', 'install', () => session.installDataPack(world.dir));
                }}
              />
              {dialog?.type === 'plugin-export' &&
                (() => {
                  const exporter = session.pluginExporters.find(
                    (entry) => entry.id === dialog.exporterId,
                  );
                  if (exporter === undefined) return null;
                  return (
                    <PluginExportDialog
                      displayName={exporter.displayName}
                      options={exporter.options ?? []}
                      onClose={() => setDialog(null)}
                      onExport={(values) => {
                        setDialog(null);
                        void runFolderExport(exporter.id, 'file(s)', values);
                      }}
                    />
                  );
                })()}
              {dialog?.type === 'export-map' &&
                project !== null &&
                target !== null &&
                bridge.maps !== undefined && (
                  <Suspense fallback={null}>
                    <ExportMapDialog
                      maps={bridge.maps}
                      target={target}
                      namespace={project.namespaces[0]?.name ?? null}
                      projectName={project.name}
                      build={() => session.buildMapContent()}
                      onDone={(text) => {
                        setDialog(null);
                        setMessage({ kind: 'info', text });
                      }}
                      onClose={() => setDialog(null)}
                    />
                  </Suspense>
                )}
              {dialog?.type === 'fabric-jar' && (
                <ExportFabricJarDialog
                  options={session.fabricJarOptions}
                  hasEntities={
                    project?.namespaces.some((namespace) =>
                      namespace.elements.some((element) => element.kind === 'msm:entity'),
                    ) === true
                  }
                  needsGeckolib={projectNeedsGeckolib(project, target)}
                  onClose={() => setDialog(null)}
                  onExport={(values) => {
                    setDialog(null);
                    void runFabricJarExport(values);
                  }}
                />
              )}
              {dialog?.type === 'java-project' && (
                <ExportJavaProjectDialog
                  scripts={projectScripts(project).map((script) => script.id)}
                  rules={rulesNotInEject(session.rulesView)}
                  onClose={() => setDialog(null)}
                  onExport={() => {
                    setDialog(null);
                    void runJavaProjectExport();
                  }}
                />
              )}
              {dialog?.type === 'test-in-minecraft' && (
                <TestInMinecraftDialog
                  load={loadTestStatus}
                  createInstance={createTestInstance}
                  pickLauncherProgram={pickLauncherProgram}
                  onClose={() => setDialog(null)}
                  onOpenSettings={handlers.settings}
                  onRun={() => {
                    setDialog(null);
                    void runTestInMinecraft();
                  }}
                />
              )}
              {dialog?.type === 'delete-exported' && (
                <ConfirmDialog
                  title={dialog.title}
                  message={dialog.message}
                  confirmLabel={dialog.confirmLabel}
                  // The alert dialog also reports "closed" after a confirm.
                  onCancel={() =>
                    setDialog((current) => (current?.type === 'delete-exported' ? null : current))
                  }
                  onConfirm={() => {
                    setDialog(null);
                    dialog.onConfirm();
                  }}
                />
              )}
              {dialog?.type === 'no-minecraft' && (
                <ConfirmDialog
                  title="Install data pack"
                  message={`${dialog.message} In Settings, choose your Minecraft folder or a Prism Launcher, MultiMC or CurseForge instance.`}
                  confirmLabel="Open Settings"
                  // The alert dialog also reports "closed" after a confirm; keep Settings open then.
                  onCancel={() =>
                    setDialog((current) => (current?.type === 'no-minecraft' ? null : current))
                  }
                  onConfirm={() => setDialog({ type: 'settings' })}
                />
              )}
              <CommandPalette
                open={paletteOpen}
                commands={palette}
                onClose={() => setPaletteOpen(false)}
                rank={rankCommands}
              />
              {searchDoor !== null && (
                <Dialog.Root
                  open
                  onOpenChange={(open) => {
                    if (!open) closeSearch();
                  }}
                >
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
                    <Dialog.Content
                      aria-describedby={undefined}
                      data-testid="search-dialog"
                      data-door={searchDoor.door}
                      className="fixed top-[6vh] left-1/2 z-50 flex max-h-[88vh] w-[min(96vw,1040px)] -translate-x-1/2 flex-col overflow-auto rounded-md border border-border bg-panel p-3 text-text shadow-lg"
                      onCloseAutoFocus={(event) => {
                        // Focus goes back where it was when the search opened (ADR 0124 D11),
                        // unless a result's action already moved it into what it opened (the
                        // mod's name, the Creator): taking it back would leave that dialog
                        // without the focus, and Enter would reopen the search.
                        event.preventDefault();
                        const back = searchReturn.current;
                        searchReturn.current = null;
                        const active = document.activeElement;
                        const moved =
                          active instanceof HTMLElement &&
                          active !== document.body &&
                          active.closest('[data-testid="search-dialog"]') === null;
                        if (back?.isConnected === true && !moved) back.focus();
                      }}
                    >
                      <Dialog.Title className="sr-only">{searchText.fieldLabel}</Dialog.Title>
                      <Suspense
                        fallback={
                          <p className="text-muted text-sm" data-testid="search-loading">
                            {searchText.searching}
                          </p>
                        }
                      >
                        <SearchPanel
                          query={querySearch}
                          door={searchDoor.door}
                          initialText={searchDoor.text}
                          hasMod={project !== null}
                          onAction={onSearchAction}
                          preview={searchPreview}
                          onClose={closeSearch}
                          onWishlist={onSearchWish}
                          {...(aiController !== null && aiKeySet ? { onAskAi: onSearchAskAi } : {})}
                          {...(searchAiLine !== null
                            ? { askAiLine: searchAiLine }
                            : aiController !== null && !aiKeySet
                              ? { askAiLine: NO_KEY_LINE }
                              : {})}
                          pluginName={searchPluginName}
                          minecraftNames={cacheReady}
                          canFix={canFixSearch}
                        />
                      </Suspense>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              )}
              {dialog?.type === 'choice' && (
                <ChoiceDialog
                  title={dialog.title}
                  {...(dialog.lead === undefined ? {} : { lead: dialog.lead })}
                  choices={dialog.choices}
                  onPick={(choice) => {
                    setDialog(null);
                    dialog.resolve(choice.id);
                  }}
                  onClose={() => {
                    setDialog(null);
                    dialog.resolve(null);
                  }}
                />
              )}
              {dialog?.type === 'guide' && guidePlatform !== undefined && (
                <Suspense fallback={null}>
                  <GuideDialog
                    guide={guidePlatform}
                    page={dialog.page}
                    anchor={dialog.anchor}
                    onClose={() => setDialog(null)}
                  />
                </Suspense>
              )}
              <CommandPalette
                open={recentPickerOpen}
                commands={recentPicks}
                onClose={() => setRecentPickerOpen(false)}
                title="Open recent project"
                placeholder="Type a project name or folder"
                testId="recent-picker"
                emptyText="No recent projects."
              />
              {dialog?.type === 'settings' && (
                <SettingsDialog
                  focus={dialog.focus}
                  focusSetting={dialog.focusSetting}
                  mcVersion={mcVersion ?? 'unknown'}
                  status={minecraft.status}
                  progress={minecraft.progress}
                  load={loadSettings}
                  save={saveSettings}
                  browse={browseMinecraft}
                  extract={extractAssets}
                  onClose={() => setDialog(null)}
                  locations={locationList === null ? null : installTargets}
                  selectedId={selectedTargetId}
                  onSelectTarget={(id) => void chooseInstallTarget(id)}
                  targetMissing={minecraft.status?.targetMissing ?? false}
                  jarSource={jarSource}
                  manualRoots={manualRoots}
                  onAddLauncherRoot={addLauncherRoot}
                  onRemoveLauncherRoot={removeLauncherRoot}
                  plugins={session.externalPlugins}
                  onOpenPluginsFolder={bridge.plugins?.openFolder}
                  ai={bridge.ai}
                  onAiChanged={() => void aiController?.refresh()}
                  aiConversationModel={aiConversationModel}
                  aiPictures={bridge.aiPictures}
                  onAiPicturesChanged={() => aiPicturesHost?.refresh()}
                  worldBackups={bridge.worldBackups}
                />
              )}
            </Toast.Provider>
          </Tooltip.Provider>
        </MinecraftTexturesContext.Provider>
      </AiPicturesContext.Provider>
    </ShellProviders>
  );
}
