/**
 * Shapes shared by the script editors (Monaco with the TypeScript language and the
 * `<textarea>` fallback). Problems and focus reuse the function editor's shapes: a script is
 * stored as `{ lines }` like a function, so problems address `/lines/<n>` with a range.
 *
 * @packageDocumentation
 */

import type { FunctionFocus, FunctionProblem } from '../function-editor/types';

/** A problem in a script element, addressed to one source line. */
export type ScriptProblem = FunctionProblem;

/** A source position the host asks the editor to move the caret to and reveal. */
export type ScriptFocus = FunctionFocus;

/** Props shared by the Monaco script editor and its `<textarea>` fallback. */
export interface ScriptSourceEditorProps {
  /** DOM id of the editable control. */
  id: string;
  value: string;
  onChange(value: string): void;
  /** Accessible label of the editor. */
  label: string;
  /** The Monaco model URI (`file:///<ns>/<path>.ts`), so the `msm:runtime` module resolves. */
  modelUri: string;
  /** The `msm-runtime.d.ts` text, added to the TypeScript service as an extra lib. */
  typings: string;
  /** Problems shown as markers (Monaco) or under the editor (fallback). */
  problems: readonly ScriptProblem[];
  /** Moves the caret there, reveals it and focuses the editor. */
  focus?: ScriptFocus | null | undefined;
  /** Called once {@link focus} has been handled. */
  onFocused?: (() => void) | undefined;
}
