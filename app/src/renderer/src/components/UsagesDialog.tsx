/**
 * Lists the references to one element (from the session's reference index, ADR 0016); a
 * row selects the referencing element and focuses the field or function line.
 *
 * @packageDocumentation
 */

import type { Reference, ResourceLocation } from '@msm/core';
import { Dialog } from 'radix-ui';
import { Button } from './ui/Button';

/** Props of {@link UsagesDialog}. */
export interface UsagesDialogProps {
  id: ResourceLocation;
  usages: readonly Reference[];
  onNavigate(reference: Reference): void;
  onClose(): void;
}

/** Where a reference sits, for display. */
export function usageLocation(reference: Reference): string {
  const line = /^\/lines\/(\d+)$/.exec(reference.path);
  if (line !== null) return `line ${Number(line[1]) + 1}`;
  return reference.path === '' ? '(root)' : reference.path;
}

/** The "Find usages" result list. */
export function UsagesDialog({ id, usages, onNavigate, onClose }: UsagesDialogProps) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="usages-dialog"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">
            Usages of <code className="font-mono">{id}</code>
          </Dialog.Title>
          {usages.length === 0 ? (
            <p className="text-muted">Nothing in the project refers to {id}.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {usages.map((reference, index) => (
                <li key={`${reference.from}\u0000${reference.path}\u0000${index}`}>
                  <button
                    type="button"
                    data-testid="usage-row"
                    className="w-full cursor-pointer rounded px-1.5 py-0.5 text-left hover:bg-bg"
                    onClick={() => onNavigate(reference)}
                  >
                    <code className="mr-2 font-mono text-xs">{reference.from}</code>
                    <span className="text-muted text-xs">{usageLocation(reference)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Dialog.Close asChild>
              <Button>Close</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
