/**
 * Escape that closes a dialog although a status toast opened after it (B714).
 *
 * Radix gives Escape only to the highest dismissable layer, and a status toast is one too
 * (`StatusToast`): a toast that appeared while a dialog was open (a save's or an export's
 * message, a moment after the click) took the first Escape, which closed the toast and left the
 * dialog open. The toast does not mark the key as handled, so an Escape that reaches the
 * dialog's content with its default not prevented, from focus inside the dialog itself, was
 * taken by no layer of the dialog's own: the dialog then runs its `onEscapeKeyDown` as Radix
 * would and closes. Escape that a layer did take (the dialog itself
 * when it is the highest, a menu, list or tooltip opened in it) is prevented, so nothing closes
 * twice, and focus in a layer opened from the dialog (portalled outside its content) is left to
 * that layer. The toolbar's menus have the same fallback (`play/menu-open.ts`, B701).
 *
 * @packageDocumentation
 */

import { Dialog } from 'radix-ui';
import { type ComponentProps, createContext, type KeyboardEvent, useContext } from 'react';

/** The open dialog's `onOpenChange`, from {@link DialogRoot} to {@link DialogContent}. */
const OpenChange = createContext<((open: boolean) => void) | undefined>(undefined);

/** Radix's `Dialog.Root`, passing its `onOpenChange` on to {@link DialogContent}. */
export function DialogRoot(props: ComponentProps<typeof Dialog.Root>) {
  return (
    <OpenChange.Provider value={props.onOpenChange}>
      <Dialog.Root {...props} />
    </OpenChange.Provider>
  );
}

/**
 * Whether `event` is an Escape, pressed with the focus in the dialog `event.currentTarget` itself,
 * that no layer took (the cause above).
 */
export function escapeNotTaken(event: KeyboardEvent<HTMLElement>): boolean {
  // The native event's flag: React's copy is taken when the event is made.
  if (event.key !== 'Escape' || event.nativeEvent.defaultPrevented) return false;
  return event.target instanceof Node && event.currentTarget.contains(event.target);
}

/**
 * Radix's `Dialog.Content` with that Escape: use it, inside a {@link DialogRoot}, for every
 * dialog in its place. It closes the dialog as Radix's Escape does, through the root's
 * `onOpenChange(false)`.
 */
export function DialogContent({
  onKeyDown,
  onEscapeKeyDown,
  children,
  ...props
}: ComponentProps<typeof Dialog.Content>) {
  const onOpenChange = useContext(OpenChange);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (!escapeNotTaken(event)) return;
    onEscapeKeyDown?.(event.nativeEvent);
    if (event.nativeEvent.defaultPrevented) return;
    // Handled here: the dialog this one was opened from (an owner in the React tree, where the
    // event goes on to) must not close as well.
    event.preventDefault();
    onOpenChange?.(false);
  };
  return (
    <Dialog.Content
      {...props}
      {...(onEscapeKeyDown === undefined ? {} : { onEscapeKeyDown })}
      onKeyDown={keyDown}
    >
      {children}
    </Dialog.Content>
  );
}
