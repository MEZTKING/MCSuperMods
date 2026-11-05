import { X } from 'lucide-react';
import { Toast } from 'radix-ui';
import { useUiStore } from '../store/ui-store';
import { iconButtonClass } from './ui/Button';

/**
 * Shows the store's status message as a Radix toast (announced politely to screen readers).
 * Errors stay longer than information; a message with an action shows its button. Needs a
 * `Toast.Provider` above it.
 */
export function StatusToast() {
  const message = useUiStore((state) => state.message);
  const setMessage = useUiStore((state) => state.setMessage);
  return (
    <>
      {message !== null && (
        <Toast.Root
          key={`${message.kind}\u0000${message.text}`}
          type={message.kind === 'error' ? 'foreground' : 'background'}
          duration={message.kind === 'error' ? 10_000 : 4_000}
          onOpenChange={(open) => {
            if (!open && useUiStore.getState().message === message) setMessage(null);
          }}
          className={
            // Width-limited and wrapping, so long text never runs past the window edge.
            'flex w-full max-w-[min(420px,90vw)] items-start gap-2 break-words rounded-md border bg-panel p-3 shadow-lg ' +
            (message.kind === 'error' ? 'border-error' : 'border-border')
          }
        >
          <Toast.Description
            data-testid="status-toast-text"
            className={`max-h-48 min-w-0 flex-1 overflow-y-auto whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.kind === 'error' ? 'text-error' : ''}`}
          >
            {message.text}
          </Toast.Description>
          {message.action !== undefined && (
            <Toast.Action
              altText={message.action.label}
              className="shrink-0 rounded border border-border px-2 py-0.5 text-sm hover:bg-bg"
              data-testid="status-toast-action"
              onClick={message.action.run}
            >
              {message.action.label}
            </Toast.Action>
          )}
          <Toast.Close className={iconButtonClass} aria-label="Dismiss">
            <X size={14} aria-hidden />
          </Toast.Close>
        </Toast.Root>
      )}
      <Toast.Viewport className="fixed right-0 bottom-8 z-50 m-0 flex w-[min(452px,100vw)] max-w-[100vw] list-none flex-col gap-2 p-4 outline-none" />
    </>
  );
}
