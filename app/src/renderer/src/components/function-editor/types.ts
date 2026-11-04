/**
 * Shapes shared by the function editors. They mirror `McfunctionProblem` (as the session maps
 * it onto elements) and `McfunctionCompletion` from `@msm/schemas/mcfunction`, which the
 * renderer must not import.
 */

/** A problem in a function element, addressed to one source line. */
export interface FunctionProblem {
  /** `/lines/<n>` (0-based line) for a source problem; anything else is not line-addressed. */
  path: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  /** UTF-16 offsets within the line; the whole line when absent. */
  range?: { start: number; end: number } | undefined;
}

/** One completion proposal for the source at an offset. */
export interface FunctionCompletion {
  label: string;
  /** Text replacing the token before the caret; may contain TextMate snippet syntax. */
  insertText: string;
  /** Lower-case LSP completion kind name (`keyword`, `value`, ...). */
  kind: string;
  detail?: string | undefined;
}

/** Completion callback: the whole source and the caret's UTF-16 offset. */
export type CompleteFunction = (source: string, offset: number) => Promise<FunctionCompletion[]>;

/** Props shared by the Monaco editor and its `<textarea>` fallback. */
export interface FunctionSourceEditorProps {
  /** DOM id of the editable control. */
  id: string;
  value: string;
  onChange(value: string): void;
  problems: readonly FunctionProblem[];
  complete?: CompleteFunction | undefined;
  /** Accessible label of the editor. */
  label: string;
}
