import { type ResourceLocation, stableStringify } from '@msm/core';
import { useCallback, useEffect, useState } from 'react';
import type { MenuCommand } from '../../shared/ipc-channels';
import type { MsmBridge } from '../../shared/platform';
import { ElementList } from './components/ElementList';
import { NewElementDialog, NewNamespaceDialog } from './components/NewElementDialog';
import { ProblemsPanel } from './components/ProblemsPanel';
import { RawJsonPanel } from './components/RawJsonPanel';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import type { OpenOutcome, ProjectSession } from './session/project-session';
import { saveBlockers } from './session/project-session';
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

/** The application shell. */
export function App({ session, bridge }: { session: ProjectSession; bridge: MsmBridge }) {
  const snapshot = useUiStore((state) => state.snapshot) ?? session.snapshot;
  const selectedId = useUiStore((state) => state.selectedId);
  const select = useUiStore((state) => state.select);
  const setMessage = useUiStore((state) => state.setMessage);
  const [dialog, setDialog] = useState<'namespace' | 'element' | null>(null);

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

  useEffect(() => {
    bridge.smokeReady();
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

  useEffect(() => bridge.onMenu((command) => handlers[command]()));

  const project = snapshot.project;
  const selected =
    project?.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((e) => e.id === selectedId) ?? null;
  const saveDisabledReason =
    project === null
      ? 'No project is open.'
      : saveBlockers(snapshot.problems).length > 0
        ? 'Saving is disabled because the project loaded with errors.'
        : null;

  return (
    <div className="app">
      <Toolbar
        hasProject={project !== null}
        canUndo={snapshot.canUndo}
        canRedo={snapshot.canRedo}
        undoLabel={snapshot.undoLabel}
        redoLabel={snapshot.redoLabel}
        saveDisabledReason={saveDisabledReason}
        canAddElement={(project?.namespaces.length ?? 0) > 0}
        onNew={handlers.new}
        onOpen={handlers.open}
        onSave={handlers.save}
        onUndo={() => session.undo()}
        onRedo={() => session.redo()}
        onAddNamespace={() => setDialog('namespace')}
        onAddElement={() => setDialog('element')}
      />
      <main className="workspace">
        <ElementList
          project={project}
          selectedId={selectedId}
          onSelect={select}
          onRemove={(id: ResourceLocation) =>
            run('Remove element', () => session.removeElement(id))
          }
        />
        <RawJsonPanel
          key={selected === null ? 'none' : `${selected.id}\u0000${stableStringify(selected.data)}`}
          element={selected}
          onApply={(id, data) => run('Apply', () => session.setElementData(id, data))}
        />
      </main>
      <ProblemsPanel problems={snapshot.problems} />
      <StatusBar snapshot={snapshot} />
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
    </div>
  );
}
