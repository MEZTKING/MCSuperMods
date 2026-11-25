/**
 * Home's **Your mods** (ADR 0128 D4, D5): the recent mods as a grid of cards above the
 * Showcase. A card shows the mod's picture (its `pack.png`, else its first item or block
 * texture, else a drawn monogram), its name, how many things it has and when it was last
 * opened, the Minecraft it is made for and the newer one it can move to (ADR 0136 D5, from its
 * file alone), with **Open** as its main action and a menu with **Show in folder** and **Remove from
 * this list**. The eight most recent show; **See all my mods** opens the whole list. A mod whose
 * folder is gone says "This mod's folder is not there any more." with **Remove**.
 *
 * Pictures and counts are read per card after Home is drawn (`recent-summary.ts`, cached);
 * Home never waits for them. The arrow keys move between the cards' Open buttons.
 *
 * Test ids: `home-your-mods`, `home-recent-card-<n>`, `home-recent-<n>` (Open),
 * `home-recent-picture-<n>`, `home-recent-things-<n>`, `home-recent-made-for-<n>`,
 * `home-recent-menu-<n>`,
 * `home-recent-show`, `home-recent-remove` (menu items), `home-recent-missing-<n>`,
 * `home-recent-remove-<n>` (a missing mod's Remove), `home-recent-all`, `your-mods-dialog`.
 *
 * @packageDocumentation
 */

import type { TargetFacts } from '@msm/plugin-api';
import { FolderOpen, MoreHorizontal, X } from 'lucide-react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import type { RecentProjectSummary, RecentProjectView } from '../../../../shared/platform';
import { Button, iconButtonClass } from '../ui/Button';
import { DialogContent, DialogRoot } from '../ui/DialogContent';
import {
  madeForWords,
  monogram,
  monogramHue,
  openedAgo,
  type RecentCardSummary,
  recentSummary,
  thingsInWords,
} from './recent-summary';

/** The heading of the section. */
export const YOUR_MODS = 'Your mods';
/** The line of a mod whose folder is gone. */
export const MOD_FOLDER_GONE = "This mod's folder is not there any more.";
/** How many cards Home shows before **See all my mods**. */
export const YOUR_MODS_SHOWN = 8;

const menuItemClass =
  'flex cursor-pointer rounded px-2 py-1 text-sm outline-none select-none ' +
  'data-[highlighted]:bg-bg data-[highlighted]:text-accent';

/** Props of {@link YourMods}. */
export interface YourModsProps {
  /** The recent mods, newest first. */
  readonly recent: readonly RecentProjectView[];
  readonly onOpen: (root: string) => void;
  readonly onRemove?: (root: string) => void;
  readonly onShowInFolder?: (root: string) => void;
  /** Reads a mod's picture and thing count; absent shows monograms and no count. */
  readonly summary?: (root: string) => Promise<RecentProjectSummary>;
  /** The time now in milliseconds (tests). */
  readonly now?: () => number;
  /** Every built-in target, for "Made for Minecraft X"; absent shows no such line. */
  readonly targets?: readonly TargetFacts[];
  /** **Tell me about test versions of Minecraft**: "can move to" names test versions too. */
  readonly testVersions?: boolean;
}

/** A card's picture: the mod's own, else its monogram. */
function ModPicture(props: { name: string; picture: string | null; index: number }) {
  if (props.picture !== null) {
    return (
      <img
        src={props.picture}
        alt=""
        className="size-16 shrink-0 rounded object-cover object-top [image-rendering:pixelated]"
        data-testid={`home-recent-picture-${props.index}`}
        data-picture="own"
      />
    );
  }
  const hue = monogramHue(props.name);
  return (
    <span
      aria-hidden
      className="flex size-16 shrink-0 items-center justify-center rounded font-bold text-white text-xl"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 55% 30%))`,
        textShadow: '2px 2px 0 rgb(0 0 0 / 0.45)',
      }}
      data-testid={`home-recent-picture-${props.index}`}
      data-picture="monogram"
    >
      {monogram(props.name)}
    </span>
  );
}

/** Props of one card. */
interface CardProps extends YourModsProps {
  readonly entry: RecentProjectView;
  readonly index: number;
  readonly onKeyDown: (index: number, event: KeyboardEvent<HTMLElement>) => void;
}

/** One mod's card. */
function ModCard(props: CardProps) {
  const { entry, index, summary } = props;
  const [read, setRead] = useState<RecentCardSummary | null>(null);
  useEffect(() => {
    setRead(null);
    if (summary === undefined || !entry.exists) return;
    let live = true;
    recentSummary(entry.root, entry.openedAt, summary).then(
      (result) => {
        if (live) setRead(result);
      },
      () => {
        // Unreadable: the monogram and no count.
      },
    );
    return () => {
      live = false;
    };
  }, [entry.root, entry.openedAt, entry.exists, summary]);
  const ago = openedAgo(entry.openedAt, (props.now ?? Date.now)());
  const madeFor =
    read === null || props.targets === undefined
      ? null
      : madeForWords(read.target, props.targets, props.testVersions === true);
  return (
    <li
      className="flex w-72 flex-col gap-2 rounded-md border border-border bg-panel p-2"
      data-testid={`home-recent-card-${index}`}
    >
      <div className="flex gap-2">
        <ModPicture name={entry.name} picture={read?.picture ?? null} index={index} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate font-semibold text-sm" title={entry.name}>
            {entry.name}
          </h3>
          {entry.exists ? (
            <>
              <p className="text-muted text-xs" data-testid={`home-recent-things-${index}`}>
                {read === null ? ' ' : thingsInWords(read.things)}
              </p>
              {ago !== '' && <p className="text-muted text-xs">Opened {ago}</p>}
              {madeFor !== null && (
                <p className="text-muted text-xs" data-testid={`home-recent-made-for-${index}`}>
                  {madeFor}
                </p>
              )}
            </>
          ) : (
            <p className="text-error text-xs" data-testid={`home-recent-missing-${index}`}>
              {MOD_FOLDER_GONE}
            </p>
          )}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1.5">
        {entry.exists ? (
          <>
            <Button
              className="border-accent"
              aria-label={`Open ${entry.name}`}
              data-testid={`home-recent-${index}`}
              data-recent-index={index}
              onClick={() => props.onOpen(entry.root)}
              onKeyDown={(event) => props.onKeyDown(index, event)}
            >
              <FolderOpen size={14} aria-hidden />
              Open
            </Button>
            <span className="flex-1" />
            {(props.onShowInFolder !== undefined || props.onRemove !== undefined) && (
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className={iconButtonClass}
                    aria-label={`More for ${entry.name}`}
                    data-testid={`home-recent-menu-${index}`}
                  >
                    <MoreHorizontal size={14} aria-hidden />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="z-50 flex min-w-40 flex-col gap-0.5 rounded-md border border-border bg-panel p-1 text-text shadow-lg"
                  >
                    {props.onShowInFolder !== undefined && (
                      <DropdownMenu.Item
                        className={menuItemClass}
                        data-testid="home-recent-show"
                        onSelect={() => props.onShowInFolder?.(entry.root)}
                      >
                        Show in folder
                      </DropdownMenu.Item>
                    )}
                    {props.onRemove !== undefined && (
                      <DropdownMenu.Item
                        className={menuItemClass}
                        data-testid="home-recent-remove"
                        onSelect={() => props.onRemove?.(entry.root)}
                      >
                        Remove from this list
                      </DropdownMenu.Item>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </>
        ) : (
          props.onRemove !== undefined && (
            <Button
              aria-label={`Remove ${entry.name} from this list`}
              data-testid={`home-recent-remove-${index}`}
              data-recent-index={index}
              onClick={() => props.onRemove?.(entry.root)}
              onKeyDown={(event) => props.onKeyDown(index, event)}
            >
              Remove
            </Button>
          )
        )}
      </div>
    </li>
  );
}

/** The cards of `entries` (indices from `start`) with the arrow keys between them. */
function ModGrid(props: YourModsProps & { entries: readonly RecentProjectView[]; label: string }) {
  const { entries, label, ...rest } = props;
  const onKeyDown = (index: number, event: KeyboardEvent<HTMLElement>): void => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    const list = event.currentTarget.closest('ul');
    const next = list?.querySelector<HTMLElement>(`[data-recent-index="${index + move}"]`);
    if (next === null || next === undefined) return;
    event.preventDefault();
    next.focus();
  };
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-wrap gap-2 p-0">
      {entries.map((entry, index) => (
        <ModCard key={entry.root} {...rest} entry={entry} index={index} onKeyDown={onKeyDown} />
      ))}
    </ul>
  );
}

/** Your mods; nothing when there are none. */
export function YourMods(props: YourModsProps) {
  const headingId = useId();
  const [all, setAll] = useState(false);
  if (props.recent.length === 0) return null;
  const shown = props.recent.slice(0, YOUR_MODS_SHOWN);
  return (
    <section
      id="home-your-mods"
      aria-labelledby={headingId}
      className="flex w-full max-w-5xl flex-col gap-2"
      data-testid="home-your-mods"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="font-semibold text-base">
          {YOUR_MODS}
        </h2>
        {props.recent.length > YOUR_MODS_SHOWN && (
          <Button data-testid="home-recent-all" onClick={() => setAll(true)}>
            See all my mods ({props.recent.length})
          </Button>
        )}
      </div>
      <ModGrid {...props} entries={shown} label={YOUR_MODS} />
      {all && (
        <DialogRoot open onOpenChange={(open) => setAll(open)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <DialogContent
              aria-describedby={undefined}
              data-testid="your-mods-dialog"
              className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(94vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
            >
              <div className="flex items-center gap-2">
                <Dialog.Title className="flex-1 font-semibold text-base">All my mods</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className={iconButtonClass} aria-label="Close">
                    <X size={14} aria-hidden />
                  </button>
                </Dialog.Close>
              </div>
              <ModGrid
                {...props}
                entries={props.recent}
                label="All my mods"
                onOpen={(root) => {
                  setAll(false);
                  props.onOpen(root);
                }}
              />
            </DialogContent>
          </Dialog.Portal>
        </DialogRoot>
      )}
    </section>
  );
}
