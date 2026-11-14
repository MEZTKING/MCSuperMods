/**
 * The main window's unsaved-changes guard on close, kept free of Electron so it can be tested.
 * A clean window closes at once; a dirty one asks first ("Discard changes" or "Cancel"). Only
 * a cancelled prompt keeps the window open. Nothing here listens to `before-quit`, so once
 * every window has closed nothing stands between "Restart to update" and the installer
 * (ADR 0018).
 *
 * @packageDocumentation
 */

/** The part of a close event the guard uses. */
export interface CloseEventLike {
  preventDefault(): void;
}

/** What the guard needs from its window. */
export interface CloseGuardDeps {
  /** Whether the renderer reported unsaved changes. */
  isDirty(): boolean;
  /** Asks whether to discard them; resolves `true` for "Discard changes". */
  confirmDiscard(): Promise<boolean>;
  /** Closes the window again (the guard then lets it through). */
  close(): void;
}

/** Creates the window's `close` listener. */
export function createCloseGuard(deps: CloseGuardDeps): (event: CloseEventLike) => void {
  let closeConfirmed = false;
  let asking = false;
  return (event) => {
    if (closeConfirmed || !deps.isDirty()) return;
    event.preventDefault();
    // A second close while the prompt is open (for example "Restart to update" and then the
    // window's X) does not stack a second prompt.
    if (asking) return;
    asking = true;
    void deps
      .confirmDiscard()
      .catch(() => false)
      .then((discard) => {
        asking = false;
        if (!discard) return;
        closeConfirmed = true;
        deps.close();
      });
  };
}
