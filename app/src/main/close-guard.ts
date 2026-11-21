/**
 * The main window's unsaved-changes guard on close, kept free of Electron so it can be tested.
 *
 * Every close (the window's X, File > Exit, "Restart to update") first asks the renderer to
 * report the edits the function, script and rule editors still hold back and whether the
 * project has unsaved changes ({@link CloseGuardDeps.flush}). Main's own `dirty` flag only
 * learns of typing after the editors' pause, so without this round trip a close within that
 * pause skipped the prompt and lost the typing. When the renderer does not answer in time,
 * the last reported state decides.
 *
 * A clean window then closes; a dirty one asks first: "Save" (saves, then closes, or carries
 * on with the update install), "Discard changes" or "Cancel". Only a cancelled prompt or a
 * failed save keeps the window open. Nothing here listens to `before-quit`, so once every
 * window has closed nothing stands between "Restart to update" (or the install when the app
 * closes) and the installer; while the prompt is open or was cancelled the app does not quit,
 * so nothing installs (ADR 0018).
 *
 * @packageDocumentation
 */

/** The part of a close event the guard uses. */
export interface CloseEventLike {
  preventDefault(): void;
}

/** The unsaved-changes prompt's answer. */
export type CloseChoice = 'save' | 'discard' | 'cancel';

/** What the guard needs from its window. */
export interface CloseGuardDeps {
  /** Whether the renderer last reported unsaved changes (used when it does not answer). */
  isDirty(): boolean;
  /**
   * Asks the renderer to report held-back edits and whether anything is unsaved; `null` when
   * it did not answer in time.
   */
  flush(): Promise<boolean | null>;
  /** Asks what to do with the unsaved changes. */
  confirm(): Promise<CloseChoice>;
  /** Asks the renderer to save; resolves `true` once the project is saved. */
  save(): Promise<boolean>;
  /** Closes the window again (the guard then lets it through). */
  close(): void;
}

/** Creates the window's `close` listener. */
export function createCloseGuard(deps: CloseGuardDeps): (event: CloseEventLike) => void {
  let closeConfirmed = false;
  let busy = false;

  const mayClose = async (): Promise<boolean> => {
    const reported = await deps.flush().catch(() => null);
    if (!(reported ?? deps.isDirty())) return true;
    const choice = await deps.confirm().catch((): CloseChoice => 'cancel');
    if (choice === 'discard') return true;
    if (choice === 'save') return deps.save().catch(() => false);
    return false;
  };

  return (event) => {
    if (closeConfirmed) return;
    event.preventDefault();
    // A second close while the guard is still asking (for example "Restart to update" and then
    // the window's X) does not stack a second round trip or prompt.
    if (busy) return;
    busy = true;
    void mayClose()
      .catch(() => false)
      .then((close) => {
        busy = false;
        if (!close) return;
        closeConfirmed = true;
        deps.close();
      });
  };
}

/** A close request main sends the renderer: report held-back edits, or save. */
export interface CloseRequest {
  id: number;
  op: 'report' | 'save';
}

/** The renderer's answer to a {@link CloseRequest}. */
export interface CloseAnswer {
  id: number;
  value: boolean;
}

/** How long main waits for the renderer to report held-back edits. */
export const CLOSE_REPORT_TIMEOUT_MS = 1000;
/** How long main waits for the renderer to save before the window stays open. */
export const CLOSE_SAVE_TIMEOUT_MS = 60_000;

/** One window's close requests to its renderer, matched to their answers by id. */
export interface CloseRequests {
  /** Sends `op` and resolves with the answer, or `null` after `timeoutMs` or a failed send. */
  ask(op: CloseRequest['op'], timeoutMs: number): Promise<boolean | null>;
  /** Hands over an answer from the renderer; unknown ids and malformed payloads are ignored. */
  answer(payload: unknown): void;
}

/** Creates the close requests of one window; `send` delivers a request to its renderer. */
export function createCloseRequests(send: (request: CloseRequest) => void): CloseRequests {
  let next = 1;
  const waiting = new Map<number, (value: boolean | null) => void>();
  return {
    ask(op, timeoutMs) {
      const id = next++;
      return new Promise<boolean | null>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const settle = (value: boolean | null): void => {
          clearTimeout(timer);
          waiting.delete(id);
          resolve(value);
        };
        timer = setTimeout(() => settle(null), timeoutMs);
        waiting.set(id, settle);
        try {
          send({ id, op });
        } catch {
          // The renderer is gone (crashed or destroyed): nothing will answer.
          settle(null);
        }
      });
    },
    answer(payload) {
      if (typeof payload !== 'object' || payload === null) return;
      const { id, value } = payload as Partial<CloseAnswer>;
      if (typeof id !== 'number' || typeof value !== 'boolean') return;
      waiting.get(id)?.(value);
    },
  };
}
