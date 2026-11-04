/**
 * Asks for an element's new id. The host renames through `session.renameElement`, which
 * rewrites every reference as one undo step; errors (kind rules, missing namespace) are
 * shown in the dialog.
 *
 * @packageDocumentation
 */

import type { ResourceLocation } from '@msm/core';
import { useId, useState } from 'react';
import { attempt, fieldClass, Modal } from './NewElementDialog';

/** Props of {@link RenameElementDialog}. */
export interface RenameElementDialogProps {
  /** The element's current id. */
  id: ResourceLocation;
  /** How many references the rename rewrites. */
  references: number;
  onCancel(): void;
  /** Renames to `newId`; throws to show an error. */
  onSubmit(newId: ResourceLocation): void;
}

const ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_.\-/]+$/;

/** Checks a typed id; returns the id or throws with a message for the dialog. */
export function parseNewId(text: string, current: ResourceLocation): ResourceLocation {
  const trimmed = text.trim();
  if (trimmed === current) throw new Error('Enter a different id.');
  if (!ID_PATTERN.test(trimmed) || trimmed.split(/[:/]/).some((part) => part === '')) {
    throw new Error(
      `"${trimmed}" is not a valid id: write namespace:path with lower-case letters, digits, "_", "-", "." and "/".`,
    );
  }
  return trimmed as ResourceLocation;
}

/** The "Rename element" dialog. */
export function RenameElementDialog(props: RenameElementDialogProps) {
  const [text, setText] = useState<string>(props.id);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const count = props.references;
  return (
    <Modal
      title="Rename element"
      error={error}
      testId="rename-dialog"
      submitLabel="Rename"
      onCancel={props.onCancel}
      onSubmit={() => attempt(() => props.onSubmit(parseNewId(text, props.id)), setError)}
    >
      <label htmlFor={inputId}>New id</label>
      <input
        id={inputId}
        data-testid="rename-input"
        aria-describedby={hintId}
        className={fieldClass}
        value={text}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
      />
      <p id={hintId} className="text-xs text-muted">
        {count === 0
          ? `Nothing refers to ${props.id}.`
          : `${count} reference${count === 1 ? '' : 's'} to ${props.id} will be rewritten.`}{' '}
        Undo reverts the rename in one step.
      </p>
    </Modal>
  );
}
