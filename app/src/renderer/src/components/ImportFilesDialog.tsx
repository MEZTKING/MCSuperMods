import { useEffect, useId, useState } from 'react';
import type { StructureSaveInfo } from '../../../shared/platform';
import { fieldClass, Modal } from './NewElementDialog';

/** One importer as the dialog lists it. */
export interface ImportFilesDialogImporter {
  id: string;
  displayName: string;
  /** Lower-case extensions without the dot. */
  extensions: readonly string[];
}

/** `.nbt, .schem` for a list of extensions. */
export function extensionList(extensions: readonly string[]): string {
  return extensions.map((extension) => `.${extension}`).join(', ');
}

/** The explanation the Blockbench import dialog shows. */
export const BLOCKBENCH_IMPORT_NOTE =
  'Only Blockbench projects (.bbmodel) and Blockbench’s own exports (.geo.json and .animation.json) are accepted; other .json files are refused. A .bbmodel becomes a geo model, an animation set when it has animations, and its embedded textures under textures/entity/. Elements that already exist are skipped; one undo removes the whole import.';

/** The explanation shown when no {@link ImportFilesDialog} `note` is given. */
export const DEFAULT_IMPORT_NOTE =
  'Each file becomes a new element named after the file. Files whose element already exists are skipped; one undo removes the whole import.';

/** The note of the "From my test worlds" tab (ADR 0116 D3). */
export const TEST_WORLDS_IMPORT_NOTE =
  'Builds saved with a structure block (its Save button) in the worlds of Play and Play my game. Each becomes a structure template named after it; ones that already exist are skipped; one undo removes the whole import.';

/** "Bring builds from my test worlds" (ADR 0116 D3): the managed instance's structure saves. */
export interface TestWorldBuilds {
  /** The structure-block saves of the managed instance's worlds. */
  list(): Promise<StructureSaveInfo[]>;
  /** Imports the chosen saves into `namespace`; resolves an error message, or `null`. */
  importSaves(namespace: string, saves: readonly StructureSaveInfo[]): Promise<string | null>;
}

/** A save's key in the list: `<world>/<id>`. */
export const saveKey = (save: StructureSaveInfo): string => `${save.world}/${save.id}`;

/**
 * Asks which namespace imported files go into and lists the importers that will read them;
 * the host then shows the file picker (filters built from the importers) and imports.
 */
export function ImportFilesDialog(props: {
  /** The dialog title, for example "Import structure". */
  title?: string;
  namespaces: readonly string[];
  initialNamespace?: string | undefined;
  importers: readonly ImportFilesDialogImporter[];
  /** What the import does and which files it accepts; a generic explanation when absent. */
  note?: string | undefined;
  /** Picks files and imports them; resolves to an error message, or `null` on success. */
  onImport(namespace: string): Promise<string | null>;
  onCancel(): void;
  /** Adds the "From my test worlds" tab (structure imports, ADR 0116 D3). */
  testWorlds?: TestWorldBuilds | undefined;
}) {
  const [namespace, setNamespace] = useState(props.initialNamespace ?? props.namespaces[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'files' | 'test-worlds'>('files');
  const [saves, setSaves] = useState<StructureSaveInfo[] | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const namespaceId = useId();
  const listId = useId();
  const none = props.importers.length === 0;
  const testWorlds = props.testWorlds;

  useEffect(() => {
    if (tab !== 'test-worlds' || testWorlds === undefined || saves !== null) return;
    let live = true;
    testWorlds.list().then(
      (listed) => {
        if (live) setSaves(listed);
      },
      (reason: unknown) => {
        if (!live) return;
        setSaves([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      live = false;
    };
  }, [tab, testWorlds, saves]);

  const submitSaves = async (): Promise<void> => {
    if (testWorlds === undefined || saves === null) return;
    const picked = saves.filter((save) => chosen.has(saveKey(save)));
    if (picked.length === 0) {
      setError('Choose at least one build.');
      return;
    }
    if (namespace === '') {
      setError('Add a namespace first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const failure = await testWorlds.importSaves(namespace, picked);
      if (failure !== null) setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (tab === 'test-worlds') {
      await submitSaves();
      return;
    }
    if (none) {
      setError('No plugin can import files.');
      return;
    }
    if (namespace === '') {
      setError('Add a namespace first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const failure = await props.onImport(namespace);
      if (failure !== null) setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={props.title ?? 'Import files'}
      error={error}
      testId="import-files-dialog"
      submitLabel={busy ? 'Importing…' : tab === 'test-worlds' ? 'Bring builds' : 'Choose files…'}
      busy={busy || (tab === 'test-worlds' && (saves === null || saves.length === 0))}
      onCancel={props.onCancel}
      onSubmit={() => void submit()}
    >
      {testWorlds !== undefined && (
        <div role="tablist" aria-label="Import from" className="mb-1 flex gap-1">
          {(
            [
              ['files', 'Files'],
              ['test-worlds', 'From my test worlds'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`import-files-tab-${id}`}
              className={`rounded border px-2 py-0.5 ${tab === id ? 'border-accent bg-bg' : 'border-border'}`}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <label htmlFor={namespaceId}>Namespace</label>
      <select
        id={namespaceId}
        data-testid="import-files-namespace"
        className={fieldClass}
        value={namespace}
        onChange={(event) => setNamespace(event.target.value)}
      >
        {props.namespaces.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      {tab === 'files' ? (
        <>
          <p id={listId} className="mb-0">
            Supported files
          </p>
          {none ? (
            <p className="text-muted">No plugin can import files.</p>
          ) : (
            <ul aria-labelledby={listId} data-testid="import-files-importers" className="m-0 pl-5">
              {props.importers.map((importer) => (
                <li key={importer.id}>
                  {importer.displayName}{' '}
                  <span className="text-muted">({extensionList(importer.extensions)})</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted" data-testid="import-files-note">
            {props.note ?? DEFAULT_IMPORT_NOTE}
          </p>
        </>
      ) : (
        <TestWorldSaves
          saves={saves}
          chosen={chosen}
          onToggle={(key) =>
            setChosen((current) => {
              const next = new Set(current);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
        />
      )}
    </Modal>
  );
}

/** The "From my test worlds" list: one checkbox per structure save. */
function TestWorldSaves(props: {
  saves: readonly StructureSaveInfo[] | null;
  chosen: ReadonlySet<string>;
  onToggle(key: string): void;
}) {
  const headingId = useId();
  if (props.saves === null) return <p className="text-muted text-sm">Looking for builds…</p>;
  return (
    <>
      <p id={headingId} className="mb-0 font-medium">
        Bring builds from my test worlds
      </p>
      {props.saves.length === 0 ? (
        <p className="text-muted text-sm" data-testid="import-test-worlds-empty">
          No builds found. In a world of Play or Play my game, place a structure block, set it to
          Save, give the build a name and press Save.
        </p>
      ) : (
        <fieldset
          aria-labelledby={headingId}
          data-testid="import-test-worlds-list"
          className="m-0 flex max-h-64 flex-col gap-1 overflow-auto border-0 p-0"
        >
          {props.saves.map((save) => {
            const key = saveKey(save);
            return (
              <label key={key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  data-testid={`import-test-world-save-${key}`}
                  checked={props.chosen.has(key)}
                  onChange={() => props.onToggle(key)}
                />
                <span className="font-mono">{save.id}</span>
                <span className="text-muted text-xs">in {save.world}</span>
              </label>
            );
          })}
        </fieldset>
      )}
      <p className="text-xs text-muted" data-testid="import-test-worlds-note">
        {TEST_WORLDS_IMPORT_NOTE}
      </p>
    </>
  );
}
