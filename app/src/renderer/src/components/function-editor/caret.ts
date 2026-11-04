/**
 * The function editor's caret for host commands, without loading Monaco: the Monaco editor
 * registers a reader on its host element, and "Go to definition" (F12, Ctrl+Click or the
 * command palette) asks it where the caret is. Both editors raise
 * {@link GO_TO_DEFINITION_EVENT} on F12; the host resolves it like the palette command.
 *
 * @packageDocumentation
 */

/** A caret in function source: 0-based line and UTF-16 offset within it. */
export interface FunctionCaret {
  line: number;
  column: number;
}

/** Reads an editor's current caret, or `null` when it has none. */
export type CaretReader = () => FunctionCaret | null;

/** The `data-testid` of the Monaco function editor's host element. */
export const MONACO_HOST_TEST_ID = 'monaco-host';

const readers = new WeakMap<Element, CaretReader>();

/** Registers the caret reader of the editor in `host`; returns the unregister function. */
export function registerCaretReader(host: Element, reader: CaretReader): () => void {
  readers.set(host, reader);
  return () => {
    if (readers.get(host) === reader) readers.delete(host);
  };
}

/** The caret of the Monaco function editor that holds `active`, or `null`. */
export function monacoCaret(active: Element | null): FunctionCaret | null {
  const host = active?.closest(`[data-testid="${MONACO_HOST_TEST_ID}"]`);
  if (host === null || host === undefined) return null;
  return readers.get(host)?.() ?? null;
}

/** The DOM event a function editor raises to ask the host for "Go to definition". */
export const GO_TO_DEFINITION_EVENT = 'msm:go-to-definition';

/** Raises {@link GO_TO_DEFINITION_EVENT} from `target` with the caret it applies to. */
export function requestGoToDefinition(target: EventTarget, caret: FunctionCaret): void {
  target.dispatchEvent(
    new CustomEvent<FunctionCaret>(GO_TO_DEFINITION_EVENT, { bubbles: true, detail: caret }),
  );
}
