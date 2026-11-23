/**
 * "New project with the AI helper…" (ADR 0047 D3, ADR 0125 D5): asks what to make; the host then
 * creates a blank project and opens the AI helper on a whole build with the description, and any
 * screenshots or pictures pasted or attached (ADR 0048). Without a key the set-up card is shown in
 * place: what was typed stays, and a passed key check goes on by itself. In Very easy it asks the
 * mod's name, as Very easy's New does, instead of a folder.
 *
 * @packageDocumentation
 */

import { type AiModelId, DEFAULT_AI_SETTINGS } from '@msm/ai';
import { ImagePlus, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { AiPlatform } from '../../../shared/platform';
import { AiKeySetup } from './ai/AiKeySetup';
import { AI_PICTURES_MAX, type AiPicture, pictureFilesOf, readPictures } from './ai/ai-pictures';
import { SETUP_WORDS, savedIn, startFooter } from './ai/ai-setup-words';
import { fieldClass, Modal } from './NewElementDialog';
import { modFolder, modNameError } from './NewProjectDialog';
import { Button, iconButtonClass } from './ui/Button';

/** Ideas offered as one-click starting points. */
export const AI_START_IDEAS: readonly string[] = [
  'A ruby ore with ruby tools and armour that is a little better than iron.',
  'A magic wand that shoots fireballs and a staff that heals the player.',
  'A friendly animated pet mob that follows the player and drops feathers.',
  'Three new foods: a berry pie, a golden carrot soup and a spicy pepper that gives speed.',
];

export interface AiStartDialogProps {
  /** Whether an Anthropic key is saved; without one the set-up card is shown first. */
  keySet: boolean;
  /** Main's AI services, for the set-up card. */
  ai?: AiPlatform | undefined;
  /** The settings' model, for the cost sentences. */
  model?: AiModelId | undefined;
  /**
   * Very easy: the folder new mods go in (`<Documents>/MCSuperMods`); the dialog then asks the
   * mod's name and starts in `<parent>/<name>`. Omitted: the host asks for a folder.
   */
  parent?: string | null | undefined;
  /**
   * Starts with the description and the pictures (screenshots) to send with it, in `folder`
   * when the dialog asked a name. A returned text is a failure shown in the dialog.
   */
  onStart(
    description: string,
    pictures: readonly AiPicture[],
    folder?: string,
  ): undefined | Promise<string | null | undefined>;
  /** After the set-up card's check passed (the host reads the key status again). */
  onKeyReady?: (() => void) | undefined;
  onClose(): void;
}

export function AiStartDialog({
  keySet,
  ai,
  model = DEFAULT_AI_SETTINGS.model,
  parent = null,
  onStart,
  onKeyReady,
  onClose,
}: AiStartDialogProps) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [pictures, setPictures] = useState<AiPicture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [starting, setStarting] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const nameId = useId();
  const asksName = parent !== null && parent !== '';
  const ready = keySet || checked;
  const described = text.trim() !== '' || pictures.length > 0;
  const addPictures = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0) return;
    const room = AI_PICTURES_MAX - pictures.length;
    const read = await readPictures(files.slice(0, Math.max(0, room)));
    setPictures((current) => [...current, ...read.pictures]);
    setError(
      read.errors.length > 0
        ? read.errors.join(' ')
        : files.length > room
          ? `At most ${AI_PICTURES_MAX} pictures go with the description.`
          : null,
    );
  };
  /** Starts; `keyWorks` is set when the key check has just passed (the state lags a render). */
  const submit = (keyWorks = false): void => {
    if (!(ready || keyWorks) || !described || starting) return;
    let folder: string | undefined;
    if (asksName && parent !== null) {
      const problem = modNameError(name);
      if (problem !== null) {
        setError(problem);
        return;
      }
      folder = modFolder(parent, name);
    }
    setStarting(true);
    setError(null);
    Promise.resolve(onStart(text.trim(), pictures, ...(folder === undefined ? [] : [folder]))).then(
      (failure) => {
        setStarting(false);
        if (typeof failure === 'string') setError(failure);
      },
      (failure: unknown) => {
        setStarting(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
  };
  const latestSubmit = useRef(submit);
  latestSubmit.current = submit;
  return (
    <Modal
      title={SETUP_WORDS.startTitle}
      error={error}
      wide
      testId="ai-start-dialog"
      submitLabel={asksName ? SETUP_WORDS.startNameSubmit : SETUP_WORDS.startFolderSubmit}
      busy={!ready || !described || starting}
      onCancel={onClose}
      onSubmit={() => submit()}
    >
      {!keySet && (
        <div className="flex flex-col gap-1.5" data-testid="ai-start-no-key">
          {!checked && <p className="text-sm">{SETUP_WORDS.startNeedsKey}</p>}
          <AiKeySetup
            ai={ai}
            model={model}
            onReady={() => {
              setChecked(true);
              onKeyReady?.();
              latestSubmit.current(true);
            }}
          />
        </div>
      )}
      {asksName && parent !== null && (
        <>
          <label htmlFor={nameId} className="text-sm font-medium">
            {SETUP_WORDS.startName}
          </label>
          <input
            id={nameId}
            data-testid="ai-start-name"
            className={fieldClass}
            placeholder={SETUP_WORDS.startNamePlaceholder}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          <p className="text-muted text-xs" data-testid="ai-start-folder">
            {savedIn(name.trim() === '' ? parent : modFolder(parent, name))}
          </p>
        </>
      )}
      <label htmlFor={inputId} className="text-sm font-medium">
        {SETUP_WORDS.startAsk}
      </label>
      <textarea
        id={inputId}
        data-testid="ai-start-input"
        className={`${fieldClass} min-h-28`}
        placeholder={SETUP_WORDS.startPlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onPaste={(event) => {
          const files = pictureFilesOf(event.clipboardData.files);
          if (files.length === 0) return;
          event.preventDefault();
          void addPictures(files);
        }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          multiple
          hidden
          data-testid="ai-start-attach-input"
          onChange={(event) => {
            void addPictures(pictureFilesOf(event.target.files));
            event.target.value = '';
          }}
        />
        <Button
          data-testid="ai-start-attach"
          disabled={pictures.length >= AI_PICTURES_MAX}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={14} aria-hidden />
          Add a screenshot…
        </Button>
        <span className="text-xs text-muted">
          Or paste one (Ctrl+V): a picture of an item, a mob or a mod you like. The helper builds
          something like it.
        </span>
      </div>
      {pictures.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="ai-start-pictures">
          {pictures.map((picture, index) => (
            <span key={`${picture.name}-${index}`} className="relative">
              <img
                src={picture.url}
                alt={`To send: ${picture.name}`}
                className="h-16 max-w-28 rounded border border-border object-contain"
              />
              <button
                type="button"
                className={`${iconButtonClass} absolute -top-1 -right-1 bg-panel`}
                aria-label={`Remove ${picture.name}`}
                onClick={() => setPictures(pictures.filter((_, other) => other !== index))}
              >
                <X size={10} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Or start from an idea:</span>
        {AI_START_IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            className="cursor-pointer rounded px-1 text-left text-accent hover:underline"
            onClick={() => setText(idea)}
          >
            {idea}
          </button>
        ))}
      </div>
      <p className="text-muted text-xs" data-testid="ai-start-cost">
        {startFooter(model, asksName)}
      </p>
    </Modal>
  );
}
