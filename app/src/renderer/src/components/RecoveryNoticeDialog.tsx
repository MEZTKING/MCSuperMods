/**
 * The notice after main started the window's page again because it stopped (B870,
 * `main/crash-recovery.ts`): asked for once at start-up, it says in plain words what happened,
 * that changes not yet saved could not be kept, which plugins from other people were running,
 * and whether they are now off for this run. Mounted beside `App` by `main.tsx`, so it shows
 * whatever screen the app opens on.
 *
 * @packageDocumentation
 */

import { Dialog } from 'radix-ui';
import { useEffect, useState } from 'react';
import type { MsmBridge } from '../../../shared/platform';
import { type RecoveryNotice, recoveryNoticeText } from '../../../shared/recovery-notice';
import { Button } from './ui/Button';
import { DialogContent, DialogRoot } from './ui/DialogContent';

/** Asks main for the recovery notice once and shows it until closed. */
export function RecoveryNoticeDialog(props: { bridge: Pick<MsmBridge, 'recoveryNotice'> }) {
  const [notice, setNotice] = useState<RecoveryNotice | null>(null);
  const ask = props.bridge.recoveryNotice;
  useEffect(() => {
    if (ask === undefined) return;
    let live = true;
    ask().then(
      (found) => {
        if (live && found !== null) setNotice(found);
      },
      () => {
        // No notice to show.
      },
    );
    return () => {
      live = false;
    };
  }, [ask]);
  if (notice === null) return null;
  const words = recoveryNoticeText(notice);
  const close = (): void => setNotice(null);
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          data-testid="recovery-notice"
          data-plugins-off={notice.pluginsOff ? 'true' : 'false'}
          className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="mb-1.5 text-base font-semibold">{words.title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="flex flex-col gap-1.5">
              {words.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </Dialog.Description>
          <div className="mt-3 flex gap-1.5">
            <Button data-testid="recovery-notice-close" onClick={close}>
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog.Portal>
    </DialogRoot>
  );
}
