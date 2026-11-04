import { X } from 'lucide-react';
import { Toast } from 'radix-ui';
import { useUiStore } from '../store/ui-store';
import { iconButtonClass } from './ui/Button';

/**
 * Shows the store's status message as a Radix toast (announced politely to screen readers).
 * Errors stay longer than information. Needs a `Toast.Provider` above it.
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
            'flex items-start gap-2 rounded-md border bg-panel p-3 shadow-lg ' +
            (message.kind === 'error' ? 'border-error' : 'border-border')
          }
        >
          <Toast.Description
            className={`flex-1 whitespace-pre-line ${message.kind === 'error' ? 'text-error' : ''}`}
          >
            {message.text}
          </Toast.Description>
          <Toast.Close className={iconButtonClass} aria-label="Dismiss">
            <X size={14} aria-hidden />
          </Toast.Close>
        </Toast.Root>
      )}
      <Toast.Viewport className="fixed right-0 bottom-8 z-50 m-0 flex w-96 max-w-[100vw] list-none flex-col gap-2 p-4 outline-none" />
    </>
  );
}
