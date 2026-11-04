import { useId, useState } from 'react';
import { fieldClass, Modal } from './NewElementDialog';

/** Where imported files go, under `assets/<namespace>/`. */
export type ImportFolderChoice = 'block' | 'item' | 'custom' | 'sounds';

/**
 * The asset subfolder for a choice: `textures/block`, `textures/item`, `textures/<custom>` or
 * `sounds`.
 *
 * @throws Error If a custom folder is empty or not a valid path.
 */
export function importSubfolder(choice: ImportFolderChoice, custom: string): string {
  if (choice === 'block') return 'textures/block';
  if (choice === 'item') return 'textures/item';
  if (choice === 'sounds') return 'sounds';
  const trimmed = custom.trim().replace(/^\/+|\/+$/g, '');
  if (trimmed === '' || !/^[a-z0-9_.\-/]+$/.test(trimmed) || trimmed.includes('//')) {
    throw new Error('Enter a folder under textures/, for example "entity" or "gui/icons".');
  }
  return `textures/${trimmed}`;
}

/** A file picker filter, as `platform.dialogs.pickFiles` takes it. */
export interface ImportFileFilter {
  name: string;
  extensions: string[];
}

/**
 * The file picker filters for importing into `subfolder`. Textures accept PNG images and
 * their `.png.mcmeta` animation sidecars, which are imported into the same folder as the
 * image. The picker matches the last extension only, so sidecars are offered as `mcmeta`;
 * the import check (`assetImportError`) still rejects any `.mcmeta` not ending in
 * `.png.mcmeta`.
 */
export function importFileFilters(subfolder: string): ImportFileFilter[] {
  if (subfolder === 'sounds' || subfolder.startsWith('sounds/')) {
    return [{ name: 'Ogg Vorbis sound', extensions: ['ogg'] }];
  }
  return [
    { name: 'PNG image or animation metadata', extensions: ['png', 'mcmeta'] },
    { name: 'PNG image', extensions: ['png'] },
    { name: 'Animation metadata (.png.mcmeta)', extensions: ['mcmeta'] },
  ];
}

const CHOICES: { id: ImportFolderChoice; label: string }[] = [
  { id: 'block', label: 'Block textures (textures/block)' },
  { id: 'item', label: 'Item textures (textures/item)' },
  { id: 'custom', label: 'Other textures folder' },
  { id: 'sounds', label: 'Sounds (sounds, Ogg Vorbis)' },
];

/** Asks where to import, then lets the host show the file picker and import. */
export function ImportAssetsDialog(props: {
  namespaces: readonly string[];
  initialNamespace?: string | undefined;
  /** Picks files and imports them; resolves to an error message, or `null` on success. */
  onImport(namespace: string, subfolder: string): Promise<string | null>;
  onCancel(): void;
}) {
  const [namespace, setNamespace] = useState(props.initialNamespace ?? props.namespaces[0] ?? '');
  const [choice, setChoice] = useState<ImportFolderChoice>('block');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const namespaceId = useId();
  const customId = useId();

  const submit = async (): Promise<void> => {
    let subfolder: string;
    try {
      subfolder = importSubfolder(choice, custom);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const failure = await props.onImport(namespace, subfolder);
      if (failure !== null) setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Import assets"
      error={error}
      testId="import-assets-dialog"
      submitLabel={busy ? 'Importing…' : 'Choose files…'}
      busy={busy}
      onCancel={props.onCancel}
      onSubmit={() => void submit()}
    >
      <label htmlFor={namespaceId}>Namespace</label>
      <select
        id={namespaceId}
        data-testid="import-assets-namespace"
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
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1">Folder</legend>
        {CHOICES.map((entry) => (
          <label key={entry.id} className="flex items-center gap-2">
            <input
              type="radio"
              name="import-folder"
              value={entry.id}
              data-testid={`import-assets-folder-${entry.id}`}
              checked={choice === entry.id}
              onChange={() => setChoice(entry.id)}
            />
            {entry.label}
          </label>
        ))}
      </fieldset>
      {choice === 'custom' && (
        <>
          <label htmlFor={customId}>Folder under textures/</label>
          <input
            id={customId}
            data-testid="import-assets-custom-folder"
            className={fieldClass}
            value={custom}
            placeholder="entity"
            spellCheck={false}
            onChange={(event) => setCustom(event.target.value)}
          />
        </>
      )}
      <p className="text-xs text-muted">
        Files with the same name replace the existing ones. Textures must be PNG files; pick an
        animated texture together with its <code>.png.mcmeta</code> file to keep them side by side.
      </p>
    </Modal>
  );
}
