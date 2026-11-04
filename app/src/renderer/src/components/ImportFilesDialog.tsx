import { useId, useState } from 'react';
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
  /** Picks files and imports them; resolves to an error message, or `null` on success. */
  onImport(namespace: string): Promise<string | null>;
  onCancel(): void;
}) {
  const [namespace, setNamespace] = useState(props.initialNamespace ?? props.namespaces[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const namespaceId = useId();
  const listId = useId();
  const none = props.importers.length === 0;

  const submit = async (): Promise<void> => {
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
      submitLabel={busy ? 'Importing…' : 'Choose files…'}
      busy={busy}
      onCancel={props.onCancel}
      onSubmit={() => void submit()}
    >
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
      <p className="text-xs text-muted">
        Each file becomes a new element named after the file. Files whose element already exists are
        skipped; one undo removes the whole import.
      </p>
    </Modal>
  );
}
