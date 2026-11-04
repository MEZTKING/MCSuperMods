import { AlertDialog } from 'radix-ui';
import { Button } from './ui/Button';

/** A yes/no confirmation (Radix alert dialog: focus starts on Cancel). */
export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <AlertDialog.Content
          data-testid="confirm-dialog"
          className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <AlertDialog.Title className="mb-1.5 text-base font-semibold">
            {props.title}
          </AlertDialog.Title>
          <AlertDialog.Description className="whitespace-pre-line">
            {props.message}
          </AlertDialog.Description>
          <div className="mt-3 flex gap-1.5">
            <AlertDialog.Action asChild>
              <Button data-testid="confirm-dialog-confirm" onClick={props.onConfirm}>
                {props.confirmLabel}
              </Button>
            </AlertDialog.Action>
            <AlertDialog.Cancel asChild>
              <Button>Cancel</Button>
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
