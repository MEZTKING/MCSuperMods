import type { JsonErrorLocation } from './json-error';

/** Props shared by the Monaco editor and its `<textarea>` fallback. */
export interface JsonEditorProps {
  /** DOM id of the editable control, for `<label htmlFor>`. */
  id: string;
  value: string;
  onChange(value: string): void;
  /** The last parse error, shown as a marker (Monaco) or `aria-invalid` (textarea). */
  error: JsonErrorLocation | null;
  /** Id of the element describing the error, if shown. */
  errorId?: string;
  /** Accessible label of the editor. */
  label: string;
}
