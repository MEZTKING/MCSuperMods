/**
 * Asks for an element's new id. The host renames through `session.renameElement`, which
 * rewrites every reference as one undo step; errors (kind rules, missing namespace) are
 * shown in the dialog. When the element's id, or a generated id it owns, was already exported
 * or installed, the dialog warns before the rename (ADR 0102 D5) and the button reads
 * "Rename anyway".
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
  /**
   * The exported-ids warning for a rename to `newId` (`undefined` while the typed id is not a
   * valid new id), or `null` when nothing exported changes (ADR 0102 D5).
   */
  warning?(newId: ResourceLocation | undefined): string | null;
}

/** The submit button's text when the rename changes exported ids. */
export const RENAME_ANYWAY_LABEL = 'Rename anyway';

/** `text` as a new id, or `undefined` when it is not one. */
function typedId(text: string, current: ResourceLocation): ResourceLocation | undefined {
  try {
    return parseNewId(text, current);
  } catch {
    return undefined;
  }
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
  const warning = props.warning?.(typedId(text, props.id)) ?? null;
  return (
    <Modal
      title="Rename element"
      error={error}
      testId="rename-dialog"
      submitLabel={warning === null ? 'Rename' : RENAME_ANYWAY_LABEL}
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
      {warning !== null && (
        <p
          role="status"
          data-testid="rename-exported-warning"
          className="whitespace-pre-line rounded border border-warning px-2 py-1 text-sm"
        >
          {warning}
        </p>
      )}
    </Modal>
  );
}
