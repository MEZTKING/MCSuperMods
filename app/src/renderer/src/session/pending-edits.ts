/**
 * Edits an editor holds back for a moment (the function and script editors report typing
 * after a pause). The session reports them before it saves or asks to discard changes, so
 * Save right after a keystroke writes that keystroke and the saved state is true.
 *
 * @packageDocumentation
 */

const pending = new Set<() => void>();

/**
 * Registers `flush`, which reports an editor's held-back edit at once.
 *
 * @returns Unregisters it.
 */
export function registerPendingEdit(flush: () => void): () => void {
  pending.add(flush);
  return () => {
    pending.delete(flush);
  };
}

/** Reports every held-back edit now. */
export function flushPendingEdits(): void {
  for (const flush of [...pending]) flush();
}
