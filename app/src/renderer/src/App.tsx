import type { Json, Element as ProjectElement, Reference, ResourceLocation } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { Toast, Tooltip } from 'radix-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuCommand } from '../../shared/ipc-channels';
import type {
  AppSettingsPatch,
  LauncherSettings,
  MinecraftStatus,
  MsmBridge,
  WorldInfo,
} from '../../shared/platform';
import {
  type BuiltInCommandId,
  type CommandHandlers,
  definitionOf,
  type FocusedLocation,
  paletteCommands,
  referenceAt,
} from './commands/built-in-commands';
import { CommandPalette } from './components/CommandPalette';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EditorArea } from './components/EditorArea';
import { ElementSidebar } from './components/ElementSidebar';
import { ExamplesDialog } from './components/ExamplesDialog';
import { lineOffset } from './components/function-editor/source-text';
import { ImportAssetsDialog, importFileFilters } from './components/ImportAssetsDialog';
import {
  describeJarSource,
  type InstallTargetOption,
  installTargetName,
  type ManualLauncher,
  type ManualLauncherRoot,
} from './components/install-target';
import { NewElementDialog, NewNamespaceDialog } from './components/NewElementDialog';
import { NewProjectDialog } from './components/NewProjectDialog';
import { RenameElementDialog } from './components/RenameElementDialog';
import { RightDock } from './components/RightDock';
import { SettingsDialog } from './components/SettingsDialog';
import { StatusBar } from './components/StatusBar';
import { StatusToast } from './components/StatusToast';
import { modKey, Toolbar } from './components/Toolbar';
import { UpdateBanner, updateCheckMessage } from './components/UpdateBanner';
import { UsagesDialog } from './components/UsagesDialog';
import { WorldPickerDialog } from './components/WorldPickerDialog';
import type { ChangeOptions } from './forms';
import { PreviewPanel, type VanillaAssetReader } from './preview';
import {
  FUNCTION_KIND,
  functionElementUri,
  mcfunctionProjectIds,
} from './session/mcfunction-problems';
import type {
  ExportResult,
  OpenOutcome,
  PackDelivery,
  PackKind,
  ProjectSession,
} from './session/project-session';
import { kindRegistry } from './session/schema-context';
import { type CommandSource, createCommandDeduper, shortcutFor } from './shortcuts';
import { useUiStore } from './store/ui-store';
import { ElementForm } from './studios/ElementForm';
import {
  dataExportDisabledReason,
  dataInstallDisabledReason,
  errorCount,
  exportDisabledReason,
  hasLayerOutput,
  installDisabledReason,
  installTargetOption,
} from './studios/export-state';
import type { CompleteFunction } from './studios/FunctionEditor';
import { templatesFor } from './studios/templates';
import { useSchemaContext } from './studios/use-schema-context';

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

/** The menu command bound to the same accelerator as each keyboard shortcut. */
const menuEquivalent = {
  save: 'save',
  undo: 'undo',
  redo: 'redo',
  renameElement: 'renameElement',
  commandPalette: 'commandPalette',
} as const satisfies Record<string, MenuCommand>;

/** The dialog currently open, if any. */
type DialogState =
  | { type: 'namespace' }
  | { type: 'element' }
  | { type: 'new-project' }
  | { type: 'examples' }
  | { type: 'import'; namespace?: string }
  | { type: 'settings' }
  | { type: 'remove-asset'; namespace: string; path: string }
  | { type: 'rename'; id: ResourceLocation; references: number }
  | { type: 'usages'; id: ResourceLocation; usages: readonly Reference[] }
  | { type: 'worlds'; worlds: readonly WorldInfo[] }
  | { type: 'no-minecraft'; message: string };

/**
 * Where the caret is: the `data-pointer` of the focused form field, or `/lines/<n>` and the
 * column in the function editor's text area. `null` elsewhere (Monaco keeps its caret to
 * itself).
 */
export function focusedLocation(active: Element | null): FocusedLocation | null {
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

/** A zero-argument action that also reports its own errors. */
type Action = () => void;

/** The application shell: toolbar, sidebar, editor (Form and Raw JSON), Preview and Problems. */
export function App({ session, bridge }: { session: ProjectSession; bridge: MsmBridge }) {
  const snapshot = useUiStore((state) => state.snapshot) ?? session.snapshot;
  const selectedId = useUiStore((state) => state.selectedId);
  const selectedPointer = useUiStore((state) => state.selectedPointer);
  const activeTab = useUiStore((state) => state.activeTab);
  const rightDock = useUiStore((state) => state.rightDock);
  const minecraft = useUiStore((state) => state.minecraft);
  const exportProblems = useUiStore((state) => state.exportProblems);
  const { select, setMessage, setActiveTab, setRightDock, navigateTo, setExportProblems } =
    useUiStore.getState();
  const clearPointer = useCallback(() => useUiStore.getState().selectPointer(null), []);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [exporting, setExporting] = useState(false);
  const [assetRevision, setAssetRevision] = useState(0);
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
    },
    [select, session, setMessage, setExportProblems, refreshMinecraftStatus],
  );

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

  // Export and install --------------------------------------------------------------------

  const lowerForTarget = useCallback(
    (element: ProjectElement) => {
      const kind = session.registry.get(element.kind);
      if (kind === undefined || target === null) return [];
      return kind.lower(element, target);
    },
    [session, target],
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

  const exportReason = exportDisabledReason(project !== null, snapshot.problems);
  const installReason = installDisabledReason(
    project !== null,
    snapshot.problems,
    minecraft.status,
  );
  const dataExportReason = dataExportDisabledReason(
    project !== null,
    snapshot.problems,
    hasDataPack,
  );
  const dataInstallReason = dataInstallDisabledReason(
    project !== null,
    snapshot.problems,
    minecraft.status,
    hasDataPack,
  );

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
      setExportProblems(result.problems);
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
        text = `Installed to ${result.location ?? 'the world'}. In Minecraft, open the world (or run /reload in it), then check /datapack list.`;
      } else if (mode === 'install') {
        text = `Installed to ${result.location ?? 'the resourcepacks folder'}. In Minecraft, open Options, then Resource Packs, and move the pack to the selected side.`;
      } else {
        text = `Exported to ${result.location ?? 'the chosen file'}.`;
      }
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
    dataExportReason,
    () =>
      void runPackExport('resource', 'combined', () => session.exportPack('resource', 'combined')),
  );
  const installResource = guarded(
    installReason,
    () =>
      void runPackExport('resource', 'install', () => session.exportPack('resource', 'install')),
  );
  const installData = guarded(dataInstallReason, () => {
    session.listWorlds().then(
      (worlds) => setDialog({ type: 'worlds', worlds }),
      (error: unknown) => setDialog({ type: 'no-minecraft', message: messageOf(error) }),
    );
  });

  // Assets --------------------------------------------------------------------------------

  const importAssets = async (namespace: string, subfolder: string): Promise<string | null> => {
    const sounds = subfolder === 'sounds';
    let files: Awaited<ReturnType<MsmBridge['dialogs']['pickFiles']>>;
    try {
      files = await bridge.dialogs.pickFiles({
        title: sounds ? 'Import sounds' : 'Import textures',
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

  // Commands and shortcuts ----------------------------------------------------------------

  const [paletteOpen, setPaletteOpen] = useState(false);
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

  const renameSelected = (): void => {
    if (selected === null) {
      setMessage({ kind: 'error', text: 'Select an element to rename.' });
      return;
    }
    const registry = kindRegistry(selected.kind);
    const references = session.references
      .to(selected.id)
      .filter((reference) => reference.registry === '' || reference.registry === registry).length;
    setDialog({ type: 'rename', id: selected.id, references });
  };

  const findUsages = (): void => {
    if (selected === null) {
      setMessage({ kind: 'error', text: 'Select an element to find its usages.' });
      return;
    }
    setDialog({ type: 'usages', id: selected.id, usages: session.references.to(selected.id) });
  };

  const goToDefinition = (): void => {
    const focus = paletteFocus.current ?? focusedLocation(document.activeElement);
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

  const handlers: Record<MenuCommand, Action> = {
    new: () => void openWith('New project', () => session.newProject()),
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
    exportResourcePack: exportResourceZip,
    exportDataPack: exportDataZip,
    exportCombined,
    installResourcePack: installResource,
    installDataPack: installData,
    settings: () => {
      setDialog({ type: 'settings' });
      // Launchers may have gained instances since the last read; look again.
      void refreshMinecraftStatus();
      refreshLaunchers().catch(() => useUiStore.getState().setLauncherSettings(null));
    },
    renameElement: renameSelected,
    commandPalette: openPalette,
    checkForUpdates,
  };

  const commandHandlers: CommandHandlers = {
    newProject: handlers.new,
    newProjectFromStarter: handlers.newProjectFromStarter,
    examples: handlers.examples,
    openProject: handlers.open,
    save: saveDisabledReason === null ? handlers.save : null,
    undo: snapshot.canUndo ? () => session.undo() : null,
    redo: snapshot.canRedo ? () => session.redo() : null,
    newElement: canAddElement ? () => setDialog({ type: 'element' }) : null,
    addNamespace: project === null ? null : () => setDialog({ type: 'namespace' }),
    importAssets: canAddElement ? handlers.importAssets : null,
    exportResourcePack: exportReason === null ? exportResourceZip : null,
    exportDataPack: dataExportReason === null ? exportDataZip : null,
    exportCombined: dataExportReason === null ? exportCombined : null,
    installResourcePack: installReason === null ? installResource : null,
    installDataPack: dataInstallReason === null ? installData : null,
    renameElement: selected === null ? null : renameSelected,
    goToDefinition: selected === null ? null : goToDefinition,
    findUsages: selected === null ? null : findUsages,
    toggleRawJson:
      selected === null ? null : () => setActiveTab(activeTab === 'json' ? 'form' : 'json'),
    settings: handlers.settings,
    // Settings opens with the Game locations list first; it holds the install target.
    chooseInstallTarget: handlers.settings,
    checkForUpdates,
  } satisfies Record<BuiltInCommandId, Action | null>;

  const palette = paletteCommands(commandHandlers, session.pluginCommands, {
    modKey,
    onError: (title, error) => setMessage({ kind: 'error', text: `${title}: ${messageOf(error)}` }),
  });

  const dispatch = (command: MenuCommand, source: CommandSource): void => {
    if (deduper.shouldRun(command, source)) handlers[command]();
  };

  useEffect(() => bridge.onMenu((command) => dispatch(command, 'menu')));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = shortcutFor(event);
      if (command === null || dialog !== null || paletteOpen) return;
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
  const readProjectAsset = useCallback(
    (namespace: string, path: string) =>
      session.readAsset(namespace, path).catch((): Uint8Array | null => null),
    [session],
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

  const form =
    project !== null && selected !== null ? (
      <ElementForm
        complete={completeFunction}
        project={project}
        element={selected}
        kind={selectedKind}
        problems={selectedProblems}
        schema={schema}
        onChange={editValue}
        focusPointer={selectedPointer}
        onFocused={clearPointer}
      />
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
      />
    ) : undefined;

  return (
    <Tooltip.Provider delayDuration={400}>
      <Toast.Provider swipeDirection="right" label="Notification">
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
          <div>
            <UpdateBanner updates={bridge.updates} />
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
              combinedExportDisabledReason={dataExportReason}
              dataInstallDisabledReason={dataInstallReason}
              primaryExport={hasDataPack && !hasResourcePack ? 'data' : 'resource'}
              exporting={exporting}
              onNew={handlers.new}
              onNewFromStarter={handlers.newProjectFromStarter}
              onExamples={handlers.examples}
              onOpen={handlers.open}
              onSave={handlers.save}
              onUndo={() => session.undo()}
              onRedo={() => session.redo()}
              onAddNamespace={() => setDialog({ type: 'namespace' })}
              onAddElement={() => setDialog({ type: 'element' })}
              onImportAssets={handlers.importAssets}
              onExportZip={exportResourceZip}
              onExportDataZip={exportDataZip}
              onExportCombined={exportCombined}
              onInstall={installResource}
              onInstallData={installData}
              onSettings={handlers.settings}
              installTarget={installTarget}
              installTargets={installTargets}
              onChooseInstallTarget={(id) => void chooseInstallTarget(id)}
            />
          </div>
          <main className="grid min-h-0 grid-cols-[minmax(200px,280px)_minmax(0,1fr)_minmax(260px,360px)]">
            <ElementSidebar
              project={project}
              selectedId={selectedId}
              onSelect={(id) => select(id)}
              onRemove={(id: ResourceLocation) =>
                run('Remove element', () => session.removeElement(id))
              }
              assetActions={{
                onImport: (namespace) => setDialog({ type: 'import', namespace }),
                onRemove: (namespace, path) => setDialog({ type: 'remove-asset', namespace, path }),
                onReveal: (namespace, path) => reveal(`assets/${namespace}/${path}`),
                thumbnail,
                revision: assetRevision,
              }}
            />
            <EditorArea
              element={selected}
              form={form}
              tab={activeTab}
              onTabChange={setActiveTab}
              onApply={(id: ResourceLocation, data: Json) =>
                run('Apply', () => session.setElementData(id, data))
              }
            />
            <RightDock
              problems={snapshot.problems}
              exportProblems={exportProblems}
              tab={rightDock}
              onTabChange={setRightDock}
              preview={preview}
              onNavigate={(problem) => navigateTo(problem.elementId, problem.path ?? null)}
              onReveal={reveal}
            />
          </main>
          <StatusBar snapshot={snapshot} />
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
        {dialog?.type === 'element' && project !== null && (
          <NewElementDialog
            namespaces={namespaces}
            templates={templates}
            kindDefault={(kind) => session.registry.get(kind)?.defaultData}
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
            onCancel={() => setDialog(null)}
            onSubmit={(starter) => {
              setDialog(null);
              void openWith(
                starter === null ? 'New project' : `New project from "${starter.title}"`,
                () => session.newProject(starter === null ? {} : { starter }),
              );
            }}
          />
        )}
        {dialog?.type === 'examples' && (
          <ExamplesDialog
            examples={session.library.examples}
            namespaces={project === null ? null : namespaces}
            onClose={() => setDialog(null)}
            onOpenAsProject={(example) => {
              setDialog(null);
              void openWith(`New project from example "${example.title}"`, () =>
                session.newProject({ bundle: example }),
              );
            }}
            onCopy={async (example, namespace) => {
              const result = await session.addBundle(example, {
                namespace,
                label: `Copy example ${example.title}`,
              });
              if (result.assets.length > 0) setAssetRevision((revision) => revision + 1);
              const skipped = result.duplicates.length + result.skippedAssets.length;
              setMessage({
                kind: 'info',
                text:
                  `Copied "${example.title}" into ${namespace}: ${result.added.length} element(s), ${result.assets.length} asset(s)` +
                  (skipped > 0 ? `; ${skipped} already in the project and skipped.` : '.'),
              });
              const first = result.added[0];
              if (first !== undefined) select(first);
              return result;
            }}
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
        {dialog?.type === 'rename' && (
          <RenameElementDialog
            id={dialog.id}
            references={dialog.references}
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
          {...(installTarget === null ? {} : { locationName: installTargetName(installTarget) })}
          onClose={() => setDialog(null)}
          onPick={(world) => {
            setDialog(null);
            void runPackExport('data', 'install', () => session.installDataPack(world.dir));
          }}
        />
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
        />
        {dialog?.type === 'settings' && (
          <SettingsDialog
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
          />
        )}
      </Toast.Provider>
    </Tooltip.Provider>
  );
}
