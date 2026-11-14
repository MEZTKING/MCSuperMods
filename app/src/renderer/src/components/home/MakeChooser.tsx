/**
 * The chooser of a Home tile that offers library starters as well as Creator flows (ADR 0086
 * D8): one card per choice. A flow card opens the Creator on that flow; a starter card adds the
 * starter's ready-made things to the mod in one undo step. Presentational.
 *
 * Test ids: `make-chooser`, `make-choice-<id>`.
 *
 * @packageDocumentation
 */

import { Dialog } from 'radix-ui';
import { Button } from '../ui/Button';

/** One choice of the chooser. */
export interface MakeChoice {
  /** `flow` opens the Creator; `starter` adds the starter at once. */
  readonly type: 'flow' | 'starter';
  /** The flow or starter id. */
  readonly id: string;
  readonly title: string;
  readonly sentence: string;
}

/** Props of {@link MakeChooser}. */
export interface MakeChooserProps {
  /** The tile's words. */
  title: string;
  choices: readonly MakeChoice[];
  onPick(choice: MakeChoice): void;
  onClose(): void;
}

/** The chooser dialog. */
export function MakeChooser(props: MakeChooserProps) {
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
          data-testid="make-chooser"
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="font-semibold text-base">{props.title}</Dialog.Title>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {props.choices.map((choice) => (
              <li key={`${choice.type}-${choice.id}`}>
                <button
                  type="button"
                  data-testid={`make-choice-${choice.id}`}
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded border border-border p-2 text-left hover:border-accent"
                  onClick={() => props.onPick(choice)}
                >
                  <span className="font-medium text-sm">{choice.title}</span>
                  <span className="text-muted text-xs">{choice.sentence}</span>
                  <span className="text-accent text-xs">
                    {choice.type === 'flow'
                      ? 'Choose how it looks and works, then make it.'
                      : 'Adds it to your mod straight away. Undo takes it back.'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Dialog.Close asChild>
            <Button className="self-end">Cancel</Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
