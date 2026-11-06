/**
 * "New project with the AI helper…" (ADR 0047 D3): asks what to make; the host then creates a
 * blank project in a folder the user picks, opens the AI helper in Build mode and sends the
 * description.
 *
 * @packageDocumentation
 */

import { useId, useState } from 'react';
import { fieldClass, Modal } from './NewElementDialog';

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
  onStart(description: string): void;
  onOpenSettings(): void;
  onClose(): void;
}

export function AiStartDialog({ keySet, onStart, onOpenSettings, onClose }: AiStartDialogProps) {
  const [text, setText] = useState('');
  const inputId = useId();
  return (
    <Modal
      title="New project with the AI helper"
      error={null}
      wide
      testId="ai-start-dialog"
      submitLabel={keySet ? 'Choose folder and build…' : 'Open Settings'}
      busy={keySet && text.trim() === ''}
      onCancel={onClose}
      onSubmit={() => (keySet ? onStart(text.trim()) : onOpenSettings())}
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
      />
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
