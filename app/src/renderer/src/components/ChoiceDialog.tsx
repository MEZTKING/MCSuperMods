/**
 * A small chooser: a list of named choices, one button each, and Cancel (ADR 0124 D9; B667).
 * The search's **Make something with it** asks which flow, and **Add this rule** which thing the
 * rule is about, through it. Presentational: the host resolves the question.
 *
 * Test ids: `choice-dialog`, `choice-<index>`, `choice-cancel`.
 *
 * @packageDocumentation
 */

import { Dialog } from 'radix-ui';
import { Button } from './ui/Button';

/** One choice. */
export interface Choice {
  readonly id: string;
  readonly title: string;
  /** A plain line under the title. */
  readonly sentence?: string;
}

/** Props of {@link ChoiceDialog}. */
export interface ChoiceDialogProps {
  readonly title: string;
  /** A line under the title. */
  readonly lead?: string;
  readonly choices: readonly Choice[];
  onPick(choice: Choice): void;
  /** Cancel, Escape or a click outside. */
  onClose(): void;
}

/** The chooser dialog. */
export function ChoiceDialog(props: ChoiceDialogProps) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="choice-dialog"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="font-semibold text-base">{props.title}</Dialog.Title>
          {props.lead !== undefined && <p className="text-muted text-sm">{props.lead}</p>}
          <ul className="m-0 flex min-h-0 list-none flex-col gap-2 overflow-auto p-0">
            {props.choices.map((choice, index) => (
              <li key={choice.id}>
                <button
                  type="button"
                  data-testid={`choice-${index}`}
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded border border-border p-2 text-left hover:border-accent focus-visible:border-accent"
                  onClick={() => props.onPick(choice)}
                >
                  <span className="font-medium text-sm">{choice.title}</span>
                  {choice.sentence !== undefined && choice.sentence !== '' && (
                    <span className="text-muted text-xs">{choice.sentence}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <Dialog.Close asChild>
            <Button className="self-end" data-testid="choice-cancel">
              Cancel
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
