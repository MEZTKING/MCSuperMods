/**
 * The "What's new" dialog: release notes for one version. Notes passed in (from the update
 * feed) win; otherwise the version's section of the bundled `CHANGELOG.md`; otherwise a short
 * note with a link to the releases page.
 *
 * @packageDocumentation
 */

import { Dialog } from 'radix-ui';
import { useEffect, useState } from 'react';
import { changelogSection, loadChangelog, RELEASES_URL } from '../whats-new';
import { Markdown } from './Markdown';
import { Button } from './ui/Button';

/** Props of {@link WhatsNewDialog}. */
export interface WhatsNewDialogProps {
  /** The version the notes are for (without a leading `v`). */
  version: string;
  /** Release notes as Markdown (from the update feed), when known. */
  notes?: string | undefined;
  /** Loads the bundled changelog; defaults to the lazy `CHANGELOG.md` chunk. */
  load?: () => Promise<string>;
  onClose(): void;
}

type Content = { state: 'loading' } | { state: 'ready'; markdown: string } | { state: 'missing' };

/** The "What's new" dialog. */
export function WhatsNewDialog({
  version,
  notes,
  load = loadChangelog,
  onClose,
}: WhatsNewDialogProps) {
  const shown = version.replace(/^v/, '');
  const [content, setContent] = useState<Content>(() =>
    notes !== undefined && notes.trim() !== ''
      ? { state: 'ready', markdown: notes }
      : { state: 'loading' },
  );

  useEffect(() => {
    if (notes !== undefined && notes.trim() !== '') return;
    let live = true;
    load().then(
      (changelog) => {
        if (!live) return;
        const section = changelogSection(changelog, shown);
        setContent(section === null ? { state: 'missing' } : { state: 'ready', markdown: section });
      },
      () => {
        if (live) setContent({ state: 'missing' });
      },
    );
    return () => {
      live = false;
    };
  }, [load, notes, shown]);

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
          data-testid="whats-new-dialog"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-x-hidden rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">
            What's new in MCSuperMods {shown}
          </Dialog.Title>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="whats-new-body">
            {content.state === 'loading' && <p className="text-sm text-muted">Loading…</p>}
            {content.state === 'ready' && <Markdown source={content.markdown} />}
            {content.state === 'missing' && (
              <p className="text-sm" data-testid="whats-new-missing">
                No release notes for version {shown} are included in this copy of MCSuperMods.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm text-accent underline"
            >
              All releases on GitHub
            </a>
            <Dialog.Close asChild>
              <Button className="ml-auto" data-testid="whats-new-close">
                Close
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
