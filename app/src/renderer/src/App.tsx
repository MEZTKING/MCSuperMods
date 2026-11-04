import type { Json, ResourceLocation } from '@msm/core';
import { Toast, Tooltip } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MenuCommand } from '../../shared/ipc-channels';
import type { MsmBridge } from '../../shared/platform';
import { EditorArea } from './components/EditorArea';
import { ElementSidebar } from './components/ElementSidebar';
import { NewElementDialog, NewNamespaceDialog } from './components/NewElementDialog';
import { RightDock } from './components/RightDock';
import { StatusBar } from './components/StatusBar';
import { StatusToast } from './components/StatusToast';
import { Toolbar } from './components/Toolbar';
import type { OpenOutcome, ProjectSession } from './session/project-session';
import { saveBlockers } from './session/project-session';
import { type CommandSource, createCommandDeduper, shortcutFor } from './shortcuts';
import { useUiStore } from './store/ui-store';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isEditableTarget(element: Element | null): boolean {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && element.type === 'text') ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/** The menu command bound to the same accelerator as each keyboard shortcut. */
const menuEquivalent = { save: 'save', undo: 'undo', redo: 'redo', newElement: 'new' } as const;

/** The application shell. */
export function App({ session, bridge }: { session: ProjectSession; bridge: MsmBridge }) {
  const snapshot = useUiStore((state) => state.snapshot) ?? session.snapshot;
  const selectedId = useUiStore((state) => state.selectedId);
  const select = useUiStore((state) => state.select);
  const setMessage = useUiStore((state) => state.setMessage);
  const [dialog, setDialog] = useState<'namespace' | 'element' | null>(null);
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
          const blocked = saveBlockers(session.snapshot.problems).length;
          setMessage(
            blocked > 0
              ? {
                  kind: 'error',
                  text: `Saving is disabled: the project loaded with ${blocked} error(s). See Problems.`,
                }
              : { kind: 'info', text: `${label}: ${session.snapshot.root ?? ''}` },
          );
        } else if ('reason' in outcome) {
          setMessage({ kind: 'error', text: `${label} failed: ${outcome.reason}` });
        }
      } catch (error) {
        setMessage({ kind: 'error', text: `${label} failed: ${messageOf(error)}` });
      }
    },
    [select, session, setMessage],
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
  const canAddElement = (project?.namespaces.length ?? 0) > 0;
  const saveDisabledReason =
    project === null
      ? 'No project is open.'
      : saveBlockers(snapshot.problems).length > 0
        ? 'Saving is disabled because the project loaded with errors.'
        : null;

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
        // Without a namespace there is nothing to add; leave the key to the menu (New project).
        if (!canAddElement) return;
        event.preventDefault();
        if (deduper.shouldRun(menuEquivalent.newElement, 'keyboard')) setDialog('element');
        return;
      }
      event.preventDefault();
      dispatch(menuEquivalent[command], 'keyboard');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const selected =
    project?.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((e) => e.id === selectedId) ?? null;

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
            onNew={handlers.new}
            onOpen={handlers.open}
            onSave={handlers.save}
            onUndo={() => session.undo()}
            onRedo={() => session.redo()}
            onAddNamespace={() => setDialog('namespace')}
            onAddElement={() => setDialog('element')}
          />
          <main className="grid min-h-0 grid-cols-[minmax(200px,280px)_minmax(0,1fr)_minmax(240px,340px)]">
            <ElementSidebar
              project={project}
              selectedId={selectedId}
              onSelect={select}
              onRemove={(id: ResourceLocation) =>
                run('Remove element', () => session.removeElement(id))
              }
            />
            <EditorArea
              element={selected}
              onApply={(id: ResourceLocation, data: Json) =>
                run('Apply', () => session.setElementData(id, data))
              }
            />
            <RightDock problems={snapshot.problems} />
          </main>
          <StatusBar snapshot={snapshot} />
        </div>
        <StatusToast />
        {dialog === 'namespace' && (
          <NewNamespaceDialog
            onCancel={() => setDialog(null)}
            onSubmit={(name) => {
              session.addNamespace(name);
              setDialog(null);
            }}
          />
        )}
        {dialog === 'element' && project !== null && (
          <NewElementDialog
            namespaces={project.namespaces.map((namespace) => namespace.name)}
            kinds={session.registry.all().map((kind) => kind.id)}
            onCancel={() => setDialog(null)}
            onSubmit={(input) => {
              session.addElement(input);
              select(input.id);
              setDialog(null);
            }}
          />
        )}
      </Toast.Provider>
    </Tooltip.Provider>
  );
}
