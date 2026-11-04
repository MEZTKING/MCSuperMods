import type { Json, ResourceLocation } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { Toast, Tooltip } from 'radix-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuCommand } from '../../shared/ipc-channels';
import type { AppSettings, MsmBridge } from '../../shared/platform';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EditorArea } from './components/EditorArea';
import { ElementSidebar } from './components/ElementSidebar';
import { ImportAssetsDialog } from './components/ImportAssetsDialog';
import { NewElementDialog, NewNamespaceDialog } from './components/NewElementDialog';
import { RightDock } from './components/RightDock';
import { SettingsDialog } from './components/SettingsDialog';
import { StatusBar } from './components/StatusBar';
import { StatusToast } from './components/StatusToast';
import { Toolbar } from './components/Toolbar';
import type { ChangeOptions } from './forms';
import { PreviewPanel, type VanillaAssetReader } from './preview';
import type { ExportMode, OpenOutcome, ProjectSession } from './session/project-session';
import { type CommandSource, createCommandDeduper, shortcutFor } from './shortcuts';
import { useUiStore } from './store/ui-store';
import { ElementForm } from './studios/ElementForm';
import { errorCount, exportDisabledReason, installDisabledReason } from './studios/export-state';
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
const menuEquivalent = { save: 'save', undo: 'undo', redo: 'redo' } as const;

/** The dialog currently open, if any. */
type DialogState =
  | { type: 'namespace' }
  | { type: 'element' }
  | { type: 'import'; namespace?: string }
  | { type: 'settings' }
  | { type: 'remove-asset'; namespace: string; path: string };

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

  // Reads the Minecraft installation status for the open project's target into the store.
  const refreshMinecraftStatus = useCallback(() => {
    session.minecraftStatus().then(
      (status) => useUiStore.getState().setMinecraftStatus(status),
      () => useUiStore.getState().setMinecraftStatus(null),
    );
  }, [session]);

  useEffect(() => refreshMinecraftStatus(), [refreshMinecraftStatus]);

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
          refreshMinecraftStatus();
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

  // Export and install --------------------------------------------------------------------

  const exportReason = exportDisabledReason(project !== null, snapshot.problems);
  const installReason = installDisabledReason(
    project !== null,
    snapshot.problems,
    minecraft.status,
  );

  const exportPack = async (mode: ExportMode): Promise<void> => {
    setExporting(true);
    try {
      const result = await session.exportResourcePack(mode);
      setExportProblems(result.problems);
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
      const warnings = result.problems.length;
      const suffix = warnings > 0 ? ` ${warnings} warning(s), see Problems.` : '';
      setMessage({
        kind: 'info',
        text:
          mode === 'install'
            ? `Installed to ${result.location ?? 'the resourcepacks folder'}. In Minecraft, open Options, then Resource Packs, and move the pack to the selected side.${suffix}`
            : `Exported to ${result.location ?? 'the chosen file'}.${suffix}`,
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: `${mode === 'install' ? 'Install' : 'Export'} failed: ${messageOf(error)}`,
      });
    } finally {
      setExporting(false);
    }
  };

  // Assets --------------------------------------------------------------------------------

  const importAssets = async (namespace: string, subfolder: string): Promise<string | null> => {
    const sounds = subfolder === 'sounds';
    let files: Awaited<ReturnType<MsmBridge['dialogs']['pickFiles']>>;
    try {
      files = await bridge.dialogs.pickFiles({
        title: sounds ? 'Import sounds' : 'Import textures',
        filters: [
          sounds
            ? { name: 'Ogg Vorbis sound', extensions: ['ogg'] }
            : { name: 'PNG image', extensions: ['png'] },
        ],
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
    async (settings: AppSettings) => {
      await session.setSettings(settings);
      refreshMinecraftStatus();
    },
    [session, refreshMinecraftStatus],
  );
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
      refreshMinecraftStatus();
    }
  }, [session, refreshMinecraftStatus]);

  // Commands and shortcuts ----------------------------------------------------------------

  const handlers: Record<MenuCommand, () => void> = {
    new: () => void openWith('New project', () => session.newProject()),
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
  };

  const dispatch = (command: MenuCommand, source: CommandSource): void => {
    if (deduper.shouldRun(command, source)) handlers[command]();
  };

  useEffect(() => bridge.onMenu((command) => dispatch(command, 'menu')));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = shortcutFor(event);
      if (command === null || dialog !== null) return;
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

  // Selection, form and preview -----------------------------------------------------------

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
    () => templatesFor(session.registry.all().map((kind) => kind.id)),
    [session],
  );

  const form =
    project !== null && selected !== null ? (
      <ElementForm
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
            exporting={exporting}
            onNew={handlers.new}
            onOpen={handlers.open}
            onSave={handlers.save}
            onUndo={() => session.undo()}
            onRedo={() => session.redo()}
            onAddNamespace={() => setDialog({ type: 'namespace' })}
            onAddElement={() => setDialog({ type: 'element' })}
            onImportAssets={() => setDialog({ type: 'import' })}
            onExportZip={() => void exportPack('zip')}
            onInstall={() => void exportPack('install')}
            onSettings={() => setDialog({ type: 'settings' })}
          />
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
          />
        )}
      </Toast.Provider>
    </Tooltip.Provider>
  );
}
