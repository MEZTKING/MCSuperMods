/**
 * The Wishlist (ADR 0053): what MSM could not build as asked, noted by the AI helper or by the
 * user, with what is missing and what was built instead. Copy the open wishes to send them on,
 * add your own, tick the ones that are done or remove them. Saved in `msm.wishlist.json`.
 *
 * @packageDocumentation
 */

import { Check, Copy, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { addWish, type WishlistEntry, wishlistText } from '../wishlist/wishlist';
import { fieldClass, Modal } from './NewElementDialog';
import { Button, iconButtonClass } from './ui/Button';

export interface WishlistDialogProps {
  projectName: string;
  load(): Promise<WishlistEntry[]>;
  save(entries: WishlistEntry[]): Promise<void>;
  /** Copies text to the clipboard. */
  copy(text: string): Promise<void>;
  onClose(): void;
}

export function WishlistDialog(props: WishlistDialogProps) {
  const [entries, setEntries] = useState<WishlistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [title, setTitle] = useState('');
  const [missing, setMissing] = useState('');
  const ids = { title: useId(), missing: useId() };

  useEffect(() => {
    props.load().then(setEntries, (caught: unknown) => {
      setEntries([]);
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, []);

  const update = async (next: WishlistEntry[]): Promise<void> => {
    setEntries(next);
    try {
      await props.save(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const list = entries ?? [];
  const open = list.filter((entry) => entry.status === 'open');
  const done = list.filter((entry) => entry.status === 'done');

  const row = (entry: WishlistEntry) => (
    <li
      key={entry.id}
      className="flex flex-col gap-0.5 rounded border border-border p-2 text-sm"
      data-testid={`wish-${entry.id}`}
      data-status={entry.status}
    >
      <span className="flex items-center gap-1">
        <span
          className={`flex-1 font-medium ${entry.status === 'done' ? 'line-through text-muted' : ''}`}
        >
          {entry.title}
        </span>
        <span className="text-xs text-muted">{entry.source === 'ai' ? 'AI helper' : 'You'}</span>
        <button
          type="button"
          className={iconButtonClass}
          aria-label={
            entry.status === 'done' ? `Reopen ${entry.title}` : `Mark ${entry.title} done`
          }
          data-testid={`wish-toggle-${entry.id}`}
          onClick={() =>
            void update(
              list.map((other) =>
                other === entry
                  ? { ...other, status: other.status === 'done' ? 'open' : 'done' }
                  : other,
              ),
            )
          }
        >
          <Check size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Remove ${entry.title}`}
          data-testid={`wish-remove-${entry.id}`}
          onClick={() => void update(list.filter((other) => other !== entry))}
        >
          <Trash2 size={14} aria-hidden />
        </button>
      </span>
      {entry.request !== '' && <span className="text-xs">Asked for: {entry.request}</span>}
      <span className="text-xs">Missing: {entry.missing}</span>
      {entry.builtInstead !== undefined && (
        <span className="text-xs text-muted">Built instead: {entry.builtInstead}</span>
      )}
    </li>
  );

  return (
    <Modal
      title="Wishlist"
      error={error}
      wide
      testId="wishlist-dialog"
      submitLabel="Close"
      onCancel={props.onClose}
      onSubmit={props.onClose}
    >
      <p className="text-sm text-muted">
        Things MCSuperMods could not make exactly as asked. The AI helper adds them when it hits a
        limit; you can add your own. Copy the open ones to ask for them to be added to MCSuperMods.
      </p>
      {entries === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm" data-testid="wishlist-empty">
          Nothing yet.
        </p>
      ) : (
        <ul className="flex max-h-[45vh] flex-col gap-1.5 overflow-auto" data-testid="wishlist">
          {open.map(row)}
          {done.map(row)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="wishlist-copy"
          disabled={open.length === 0}
          onClick={() => {
            void props.copy(wishlistText(list, props.projectName)).then(
              () => setCopied(true),
              (caught: unknown) =>
                setError(caught instanceof Error ? caught.message : String(caught)),
            );
          }}
        >
          <Copy size={14} aria-hidden />
          {copied ? 'Copied' : `Copy ${open.length} open`}
        </Button>
      </div>
      <fieldset className="flex flex-col gap-1 rounded border border-border p-2">
        <legend className="px-1 text-xs font-semibold text-muted">Add your own</legend>
        <label htmlFor={ids.title} className="text-xs">
          What should MCSuperMods be able to make?
        </label>
        <input
          id={ids.title}
          data-testid="wishlist-title"
          className={fieldClass}
          value={title}
          maxLength={120}
          placeholder="A grappling hook that pulls me to blocks"
          onChange={(event) => setTitle(event.target.value)}
        />
        <label htmlFor={ids.missing} className="text-xs">
          What is missing or does not work?
        </label>
        <input
          id={ids.missing}
          data-testid="wishlist-missing"
          className={fieldClass}
          value={missing}
          maxLength={1000}
          onChange={(event) => setMissing(event.target.value)}
        />
        <Button
          data-testid="wishlist-add"
          disabled={title.trim() === '' || missing.trim() === ''}
          onClick={() => {
            void update(
              addWish(list, {
                source: 'user',
                title: title.trim(),
                request: '',
                missing: missing.trim(),
              }),
            );
            setTitle('');
            setMissing('');
          }}
        >
          Add to the Wishlist
        </Button>
      </fieldset>
    </Modal>
  );
}
