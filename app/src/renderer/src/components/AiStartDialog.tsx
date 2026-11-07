/**
 * "New project with the AI helper…" (ADR 0047 D3): asks what to make; the host then creates a
 * blank project in a folder the user picks, opens the AI helper in Build mode and sends the
 * description, with any screenshots or pictures pasted or attached (ADR 0048).
 *
 * @packageDocumentation
 */

import { ImagePlus, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { AI_PICTURES_MAX, type AiPicture, pictureFilesOf, readPictures } from './ai/ai-pictures';
import { fieldClass, Modal } from './NewElementDialog';
import { Button, iconButtonClass } from './ui/Button';

/** Ideas offered as one-click starting points. */
export const AI_START_IDEAS: readonly string[] = [
  'A ruby ore with ruby tools and armour that is a little better than iron.',
  'A magic wand that shoots fireballs and a staff that heals the player.',
  'A friendly animated pet mob that follows the player and drops feathers.',
  'Three new foods: a berry pie, a golden carrot soup and a spicy pepper that gives speed.',
];

export interface AiStartDialogProps {
  /** Whether an Anthropic key is saved; without one the dialog points to Settings. */
  keySet: boolean;
  /** Starts with the description and the pictures (screenshots) to send with it. */
  onStart(description: string, pictures: readonly AiPicture[]): void;
  onOpenSettings(): void;
  onClose(): void;
}

export function AiStartDialog({ keySet, onStart, onOpenSettings, onClose }: AiStartDialogProps) {
  const [text, setText] = useState('');
  const [pictures, setPictures] = useState<AiPicture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
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
  return (
    <Modal
      title="New project with the AI helper"
      error={error}
      wide
      testId="ai-start-dialog"
      submitLabel={keySet ? 'Choose folder and build…' : 'Open Settings'}
      busy={keySet && text.trim() === '' && pictures.length === 0}
      onCancel={onClose}
      onSubmit={() => (keySet ? onStart(text.trim(), pictures) : onOpenSettings())}
    >
      {!keySet && (
        <p className="text-sm" data-testid="ai-start-no-key">
          The AI helper needs your own Anthropic API key. Save it in Settings → AI helper, then come
          back here.
        </p>
      )}
      <label htmlFor={inputId} className="text-sm font-medium">
        What should your mod add?
      </label>
      <textarea
        id={inputId}
        data-testid="ai-start-input"
        className={`${fieldClass} min-h-28`}
        placeholder="Describe the blocks, items, mobs or other content you want, in your own words."
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
      <p className="text-muted text-xs">
        MCSuperMods makes a new project in a folder you choose, then the AI helper plans the mod,
        builds it step by step and shows every change for you to apply. It costs a little on your
        Anthropic account; the helper shows the cost as it goes.
      </p>
    </Modal>
  );
}
