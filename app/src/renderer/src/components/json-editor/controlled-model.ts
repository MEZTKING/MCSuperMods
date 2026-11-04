/**
 * Keeps a Monaco model in step with a controlled `value` prop without fighting the user's
 * typing. Shared by the JSON and mcfunction editors.
 *
 * The host echoes every value the editor emits back through `value`, but React may commit an
 * older echo after newer keystrokes have already reached the model. Replacing the text then
 * (`model.setValue`) drops those keystrokes and moves the caret to (1,1), so typing fast
 * scrambles the source. Here every emitted value is remembered until its echo (or a newer
 * one) arrives; echoes are ignored, and only a value the editor never emitted (undo, a
 * rename, another editor) is applied, as a minimal edit that keeps the selection.
 *
 * @packageDocumentation
 */

/** A Monaco range (1-based lines and columns). */
export interface ModelRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** The parts of `monaco.editor.ITextModel` the binding uses. */
export interface ControlledModel {
  getValue(): string;
  getPositionAt(offset: number): { lineNumber: number; column: number };
  pushStackElement(): void;
  pushEditOperations(
    beforeCursorState: null,
    editOperations: { range: ModelRange; text: string }[],
    cursorStateComputer: () => null,
  ): unknown;
  onDidChangeContent(listener: () => void): { dispose(): void };
}

/** The handle {@link bindControlledModel} returns. */
export interface ControlledModelBinding {
  /** Applies the host's `value`: ignored when it is an echo of the editor's own edits. */
  setValue(value: string): void;
  dispose(): void;
}

/** The smallest single replacement turning `from` into `to`, as offsets into `from`. */
export function minimalEdit(
  from: string,
  to: string,
): { start: number; end: number; text: string } {
  const limit = Math.min(from.length, to.length);
  let prefix = 0;
  while (prefix < limit && from.charCodeAt(prefix) === to.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (
    suffix < limit - prefix &&
    from.charCodeAt(from.length - 1 - suffix) === to.charCodeAt(to.length - 1 - suffix)
  ) {
    suffix++;
  }
  return { start: prefix, end: from.length - suffix, text: to.slice(prefix, to.length - suffix) };
}

/**
 * Reports every user edit of `model` through `onChange` and returns a `setValue` that applies
 * only genuine external changes (see the module comment).
 */
export function bindControlledModel(
  model: ControlledModel,
  onChange: (value: string) => void,
): ControlledModelBinding {
  /** Values emitted whose echo has not arrived yet, oldest first. */
  let emitted: string[] = [];
  let applying = false;
  const subscription = model.onDidChangeContent(() => {
    if (applying) return;
    const value = model.getValue();
    emitted.push(value);
    onChange(value);
  });

  return {
    setValue(value) {
      const current = model.getValue();
      if (value === current) {
        // Caught up: no older echo can still arrive (renders commit in order).
        emitted = [];
        return;
      }
      const index = emitted.indexOf(value);
      if (index >= 0) {
        // A stale echo of the editor's own edit; newer keystrokes are already in the model.
        emitted = emitted.slice(index + 1);
        return;
      }
      emitted = [];
      const edit = minimalEdit(current, value);
      const start = model.getPositionAt(edit.start);
      const end = model.getPositionAt(edit.end);
      applying = true;
      try {
        model.pushStackElement();
        model.pushEditOperations(
          null,
          [
            {
              range: {
                startLineNumber: start.lineNumber,
                startColumn: start.column,
                endLineNumber: end.lineNumber,
                endColumn: end.column,
              },
              text: edit.text,
            },
          ],
          () => null,
        );
        model.pushStackElement();
      } finally {
        applying = false;
      }
    },
    dispose() {
      subscription.dispose();
    },
  };
}
