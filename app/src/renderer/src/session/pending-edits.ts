/**
 * Edits an editor holds back for a moment (the function and script editors report typing
 * after a pause; the Rules section sends rule edits to the book one after another). The session
 * reports them before it saves or asks to discard changes, so Save right after a keystroke
 * writes that keystroke and the saved state is true.
 *
 * A flush may return a promise that settles once its edit is on the command stack (the Rules
 * section's edits go through the asynchronous `applyChangeset`): {@link flushPendingEdits}
 * waits for those, so Save does not write the files while the edit is still on its way and then
 * find the project changed under it.
 *
 * @packageDocumentation
 */

/** Reports an editor's held-back edit; a promise settles once the edit has landed. */
export type PendingEditFlush = () => void | Promise<void>;

const pending = new Set<PendingEditFlush>();

/**
 * Registers `flush`, which reports an editor's held-back edit at once.
 *
 * @returns Unregisters it.
 */
export function registerPendingEdit(flush: PendingEditFlush): () => void {
  pending.add(flush);
  return () => {
    pending.delete(flush);
  };
}

/**
 * Reports every held-back edit now. Every flush starts synchronously; the returned promise
 * settles once the edits that land later (an asynchronous flush) are on the stack. A flush
 * that fails asynchronously is ignored here: its editor reports its own error.
 */
export function flushPendingEdits(): Promise<void> {
  const landing: Promise<void>[] = [];
  for (const flush of [...pending]) {
    const result = flush();
    if (result !== undefined) landing.push(result.catch(() => undefined));
  }
  return landing.length === 0 ? Promise.resolve() : Promise.all(landing).then(() => undefined);
}
