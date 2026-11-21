/**
 * The renderer's side of the window close round trip (`app/src/main/close-guard.ts`). Main
 * asks before every close, including "Restart to update": `report` hands over the typing the
 * function, script and rule editors still hold back and says whether the project is unsaved,
 * so main's prompt sees an edit made within the editors' pause; `save` is the prompt's "Save".
 *
 * @packageDocumentation
 */

import type { CloseRequestHandlers } from '../../../shared/platform';
import { flushPendingEdits } from './pending-edits';

/** The part of the project session the close round trip uses. */
export interface CloseRequestSession {
  readonly snapshot: { readonly dirty: boolean };
  save(): Promise<void>;
}

/** Callbacks that tell the user how the prompt's "Save" went. */
export interface CloseRequestFeedback {
  saved?(): void;
  failed?(error: unknown): void;
}

/** The close round trip's handlers over `session`. */
export function closeRequestHandlers(
  session: CloseRequestSession,
  feedback: CloseRequestFeedback = {},
): CloseRequestHandlers {
  return {
    async report() {
      await flushPendingEdits();
      return session.snapshot.dirty;
    },
    async save() {
      try {
        await session.save();
      } catch (error) {
        feedback.failed?.(error);
        return false;
      }
      feedback.saved?.();
      // An edit made while the files were written keeps the project unsaved: stay open.
      return !session.snapshot.dirty;
    },
  };
}
