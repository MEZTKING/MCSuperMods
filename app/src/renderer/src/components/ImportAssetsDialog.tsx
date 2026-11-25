import { useId, useState } from 'react';
import { fieldClass, Modal } from './NewElementDialog';
import { MoreOptions } from './ui/MoreOptions';

/** Where imported files go, under `assets/<namespace>/`. */
export type ImportFolderChoice = 'block' | 'item' | 'custom' | 'sounds' | 'shaders';

/** Whether `folder` is a safe folder path below `textures/` or `shaders/`. */
function isSafeFolder(folder: string): boolean {
  return /^[a-z0-9_.\-/]+$/.test(folder) && !folder.includes('//');
}

/**
 * The asset subfolder for a choice: `textures/block`, `textures/item`, `textures/<custom>`,
 * `sounds`, or `shaders` with an optional folder below it (`shaders/post`, ADR 0106 D2: the
 * raw `.vsh`, `.fsh` and `.glsl` files a post effect or shader program names).
 *
 * @throws Error If a custom folder is empty or not a valid path, or a shader folder is not
 *   a valid path.
 */
export function importSubfolder(choice: ImportFolderChoice, custom: string): string {
  if (choice === 'block') return 'textures/block';
  if (choice === 'item') return 'textures/item';
  if (choice === 'sounds') return 'sounds';
  const trimmed = custom.trim().replace(/^\/+|\/+$/g, '');
  if (choice === 'shaders') {
    if (trimmed === '') return 'shaders';
    if (!isSafeFolder(trimmed)) {
      throw new Error('Enter a folder under shaders/, for example "post", or leave it empty.');
    }
    return `shaders/${trimmed}`;
  }
  if (trimmed === '' || !isSafeFolder(trimmed)) {
    throw new Error('Enter a folder under textures/, for example "entity" or "gui/icons".');
  }
  return `textures/${trimmed}`;
}

/** A file picker filter, as `platform.dialogs.pickFiles` takes it. */
export interface ImportFileFilter {
  name: string;
  extensions: string[];
}

/** The file picker's title for importing into `subfolder`: sounds, shaders or textures. */
export function importPickerTitle(subfolder: string): string {
  if (subfolder === 'sounds' || subfolder.startsWith('sounds/')) return 'Import sounds';
  if (subfolder === 'shaders' || subfolder.startsWith('shaders/')) return 'Import shaders';
  return 'Import textures';
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
  if (subfolder === 'shaders' || subfolder.startsWith('shaders/')) {
    return [{ name: 'Shader source (.vsh, .fsh, .glsl)', extensions: ['vsh', 'fsh', 'glsl'] }];
  }
  return [
    { name: 'PNG image or animation metadata', extensions: ['png', 'mcmeta'] },
    { name: 'PNG image', extensions: ['png'] },
    { name: 'Animation metadata (.png.mcmeta)', extensions: ['mcmeta'] },
  ];
}

/** The choices most people need, in plain words (ADR 0130 D2). */
const CHOICES: { id: ImportFolderChoice; label: string }[] = [
  { id: 'block', label: 'Block pictures' },
  { id: 'item', label: 'Item pictures' },
  { id: 'sounds', label: 'Sounds (Ogg Vorbis files)' },
];

/** The choices that name folders by hand, under More options. */
const MORE_CHOICES: { id: ImportFolderChoice; label: string }[] = [
  { id: 'custom', label: 'Other textures folder' },
  { id: 'shaders', label: 'Shaders (shaders, .vsh, .fsh and .glsl)' },
];

/** The dialog's title: the File menu's words. */
export const IMPORT_ASSETS_TITLE = 'Bring in pictures or sounds';

/** The dialog's first line: what it does, in the user's words (ADR 0130 D2). */
export const IMPORT_ASSETS_INTRO =
  'Copies pictures or sounds from your computer into your mod. Choose what they are for, then the files.';

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

  const choiceRow = (entry: { id: ImportFolderChoice; label: string }) => (
    <label key={entry.id} className="flex items-center gap-2">
      <input
        type="radio"
        name="import-folder"
        value={entry.id}
        data-testid={`import-assets-folder-${entry.id}`}
        checked={choice === entry.id}
        onChange={() => {
          setChoice(entry.id);
          // The textures and shaders folder fields are one field: start it empty.
          setCustom('');
        }}
      />
      {entry.label}
    </label>
  );

  return (
    <Modal
      title={IMPORT_ASSETS_TITLE}
      error={error}
      testId="import-assets-dialog"
      submitLabel={busy ? 'Importing…' : 'Choose files…'}
      busy={busy}
      onCancel={props.onCancel}
      onSubmit={() => void submit()}
    >
      <p className="text-sm" data-testid="import-assets-intro">
        {IMPORT_ASSETS_INTRO}
      </p>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1">They are</legend>
        {CHOICES.map(choiceRow)}
      </fieldset>
      <p className="text-xs text-muted">
        Files with the same name replace the ones already there. Pictures must be PNG files; pick a
        moving picture together with its <code>.png.mcmeta</code> file to keep them side by side.
      </p>
      <MoreOptions storageKey="dialog-import-assets">
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
          <legend className="mb-1">Other folders</legend>
          {MORE_CHOICES.map(choiceRow)}
        </fieldset>
        {choice === 'shaders' && (
          <>
            <label htmlFor={customId}>Folder under shaders/ (empty: shaders)</label>
            <input
              id={customId}
              data-testid="import-assets-shader-folder"
              className={fieldClass}
              value={custom}
              placeholder="post"
              spellCheck={false}
              onChange={(event) => setCustom(event.target.value)}
            />
          </>
        )}
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
          Block and item pictures go to textures/block and textures/item, sounds to sounds. Shader
          files are copied as they are: MCSuperMods does not check them, so a mistake shows only in
          the game.
        </p>
      </MoreOptions>
    </Modal>
  );
}
