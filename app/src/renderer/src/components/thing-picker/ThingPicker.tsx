/**
 * The ThingPicker (ADR 0082 D7): a dialog that picks one thing (an item, block, mob, sound,
 * particle, effect, function or dimension) by picture and name. A search box first, then the
 * project's own things ("Your things"), then the game's by category. Keyboard: the arrow keys
 * move between tiles, Enter picks, Esc closes, and typing on a tile goes to the search box.
 * Shared by the Rule book and, later, the Very easy mode (ADR 0083). A sound's tile has a Play
 * button beside its name (ADR 0121 D2, B622), out of the arrow keys' way (`tabIndex` -1).
 *
 * @packageDocumentation
 */

import {
  Box,
  Car,
  Droplets,
  FileCode,
  Gauge,
  Globe,
  Keyboard,
  type LucideIcon,
  Music,
  Package,
  PawPrint,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SoundPlayButton } from '../../audio/SoundPlayButton';
import { pngDataUrl } from '../AssetList';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';
import {
  filterThings,
  THING_WORDS,
  type Thing,
  type ThingPicture,
  type ThingSection,
  type ThingSort,
} from './thing-sources';

export {
  filterThings,
  THING_REGISTRIES,
  THING_WORDS,
  type Thing,
  type ThingPicture,
  type ThingRegistries,
  type ThingSection,
  type ThingSort,
  type ThingSourceInput,
  thingName,
  thingSections,
  thingWords,
  vanillaPicturePaths,
} from './thing-sources';

/** Where the picker loads pictures from; either part may be missing (generic icons then). */
export interface ThingPictures {
  /** A PNG thumbnail of a project texture (`assets/<ns>/...png`), at most `size` pixels. */
  project?: ((assetPath: string, size: number) => Promise<Uint8Array>) | undefined;
  /** A file of the extracted client jar by jar path, or `null` when it is not there. */
  vanilla?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  /** Changes when project pictures may have changed. */
  revision?: number | undefined;
}

/** Props of {@link ThingPicker}. */
export interface ThingPickerProps {
  /** The dialog title, for example "Pick an item". */
  title: string;
  /** What is picked (for the generic icon and the words). */
  sort: ThingSort;
  /** What to offer, usually from `thingSections`. */
  sections: readonly ThingSection[];
  /** The current id, marked as chosen. */
  value?: string | undefined;
  /** Where pictures come from; without it every tile shows the generic icon. */
  pictures?: ThingPictures | null | undefined;
  /** Offers a first tile that picks "nothing" (`onPick(null)`), with this label ("Any block"). */
  noneLabel?: string | undefined;
  /** Picks a thing (or `null` for the {@link noneLabel} tile) and closes. */
  onPick(id: string | null): void;
  onCancel(): void;
}

/** How many tiles a section shows before "Show all". */
export const TILES_PER_SECTION = 48;
/** The tile grid's column count (arrow up and down move by this). */
const COLUMNS = 6;
const PICTURE_SIZE = 32;

const SORT_ICONS: Readonly<Record<ThingSort, LucideIcon>> = {
  item: Package,
  block: Box,
  mob: PawPrint,
  sound: Music,
  particle: Sparkles,
  effect: Droplets,
  function: FileCode,
  dimension: Globe,
  key: Keyboard,
  vehicle: Car,
  hud: Gauge,
  command: Terminal,
};

/** Loads a thing's picture as a `data:` URL; `null` while loading or when there is none. */
function usePicture(
  picture: ThingPicture | null,
  pictures: ThingPictures | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const project = pictures?.project;
  const vanilla = pictures?.vanilla;
  const revision = pictures?.revision ?? 0;
  const key =
    picture === null
      ? ''
      : picture.from === 'project'
        ? `p:${picture.assetPath}`
        : `v:${picture.paths.join('|')}`;
  useEffect(() => {
    setUrl(null);
    if (picture === null) return;
    let live = true;
    const done = (bytes: Uint8Array | null) => {
      if (live && bytes !== null) setUrl(pngDataUrl(bytes));
    };
    if (picture.from === 'project') {
      if (project === undefined) return;
      project(picture.assetPath, PICTURE_SIZE).then(done, () => undefined);
    } else {
      if (vanilla === undefined) return;
      const tryAt = (index: number): void => {
        const path = picture.paths[index];
        if (path === undefined) return;
        vanilla(path).then(
          (bytes) => (bytes === null ? tryAt(index + 1) : done(bytes)),
          () => tryAt(index + 1),
        );
      };
      tryAt(0);
    }
    return () => {
      live = false;
    };
    // `key` stands for `picture`, which callers rebuild on every render.
  }, [key, project, vanilla, revision]);
  return url;
}

/** A thing's picture, or the sort's generic icon. */
export function ThingIcon(props: {
  sort: ThingSort;
  picture: ThingPicture | null;
  pictures?: ThingPictures | null | undefined;
  size?: number;
}) {
  const url = usePicture(props.picture, props.pictures);
  const size = props.size ?? PICTURE_SIZE;
  if (url !== null) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        data-testid="thing-picture"
        style={{ imageRendering: 'pixelated' }}
      />
    );
  }
  const Icon = SORT_ICONS[props.sort];
  return <Icon aria-hidden size={size * 0.75} className="text-muted" data-testid="thing-generic" />;
}

interface TileProps {
  thing: Thing | null;
  label: string;
  sort: ThingSort;
  chosen: boolean;
  active: boolean;
  index: number;
  pictures: ThingPictures | null | undefined;
  onPick(): void;
  onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void;
  register(index: number, node: HTMLButtonElement | null): void;
}

function Tile(props: TileProps) {
  const { thing } = props;
  if (props.sort !== 'sound' || thing === null) return <TileButton {...props} />;
  // A sound's tile: Play in its corner, beside the button that picks it (never inside it).
  return (
    <div className="relative flex" data-testid={`thing-sound-${thing.id}`}>
      <TileButton {...props} />
      <span className="absolute top-0.5 right-0.5">
        <SoundPlayButton event={thing.id} compact tabIndex={-1} />
      </span>
    </div>
  );
}

function TileButton(props: TileProps) {
  const { thing, index } = props;
  return (
    <button
      type="button"
      ref={(node) => props.register(index, node)}
      tabIndex={props.active ? 0 : -1}
      aria-pressed={props.chosen}
      data-testid={thing === null ? 'thing-none' : `thing-${thing.id}`}
      title={props.label}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded border p-1.5 text-center text-xs cursor-pointer hover:border-accent focus:border-accent focus:outline-none ${props.chosen ? 'border-accent bg-bg' : 'border-border'}`}
      onClick={props.onPick}
      onKeyDown={(event) => props.onKeyDown(event, index)}
    >
      <span className="flex size-8 items-center justify-center">
        {thing === null ? (
          <ThingIcon sort={props.sort} picture={null} />
        ) : (
          <ThingIcon sort={props.sort} picture={thing.picture} pictures={props.pictures} />
        )}
      </span>
      <span className="line-clamp-2 break-words">{props.label}</span>
    </button>
  );
}

/** The ThingPicker dialog. */
export function ThingPicker(props: ThingPickerProps) {
  const { sections, sort, onPick } = props;
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const tiles = useRef(new Map<number, HTMLButtonElement>());
  const searchId = useId();

  const shown = useMemo(() => filterThings(sections, query), [sections, query]);
  const searching = query.trim().length > 0;
  const showNone = props.noneLabel !== undefined && !searching;

  // The tiles in order, as rendered: "none" first, then each section's visible part.
  const visible = useMemo(() => {
    const out: { section: string; things: Thing[]; hidden: number; label: string }[] = [];
    for (const section of shown) {
      const all = section.things;
      const open = searching || expanded.has(section.id);
      const things = open ? [...all] : all.slice(0, TILES_PER_SECTION);
      out.push({
        section: section.id,
        things,
        hidden: all.length - things.length,
        label: section.label,
      });
    }
    return out;
  }, [shown, expanded, searching]);
  const flat = useMemo(() => {
    const out: (Thing | null)[] = showNone ? [null] : [];
    for (const section of visible) out.push(...section.things);
    return out;
  }, [visible, showNone]);

  useEffect(() => {
    // Start on the chosen thing when it is shown, else on the first tile.
    const index = flat.findIndex((thing) => thing !== null && thing.id === props.value);
    setActive(Math.max(index, 0));
    // Only when the list itself changes.
  }, [flat]);

  const focusTile = useCallback((index: number) => {
    setActive(index);
    tiles.current.get(index)?.focus();
  }, []);
  const register = useCallback((index: number, node: HTMLButtonElement | null) => {
    if (node === null) tiles.current.delete(index);
    else tiles.current.set(index, node);
  }, []);
  const pick = useCallback(
    (thing: Thing | null) => onPick(thing === null ? null : thing.id),
    [onPick],
  );

  const onTileKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = flat.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      if (event.key === 'ArrowUp' && index - COLUMNS < 0) {
        searchRef.current?.focus();
        return;
      }
      focusTile(Math.max(0, Math.min(last, index + move)));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusTile(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusTile(last);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Type to search.
      event.preventDefault();
      setQuery((text) => text + event.key);
      searchRef.current?.focus();
    }
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' && flat.length > 0) {
      event.preventDefault();
      focusTile(0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const first = flat[0];
      if (first !== undefined) pick(first);
    }
  };

  let index = showNone ? 1 : 0;
  const empty = flat.length === 0;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="thing-picker"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">{props.title}</Dialog.Title>
          <label htmlFor={searchId} className="sr-only">
            Search {THING_WORDS[sort].many}
          </label>
          <input
            id={searchId}
            ref={searchRef}
            type="search"
            data-testid="thing-search"
            placeholder={`Search ${THING_WORDS[sort].many}`}
            className={fieldClass}
            value={query}
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKey}
          />
          {props.pictures?.vanilla === undefined && (
            <p className="text-xs text-muted" data-testid="thing-no-vanilla-pictures">
              Pictures of Minecraft things appear once MSM has found your Minecraft (Settings, Game
              locations).
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            {showNone && (
              <div className={`mb-2 grid grid-cols-6 gap-1.5`}>
                <Tile
                  thing={null}
                  label={props.noneLabel ?? ''}
                  sort={sort}
                  chosen={props.value === undefined}
                  active={active === 0}
                  index={0}
                  pictures={props.pictures}
                  onPick={() => pick(null)}
                  onKeyDown={onTileKey}
                  register={register}
                />
              </div>
            )}
            {visible.map((section) => (
              <section key={section.section} aria-label={section.label} className="mb-3">
                <h3 className="mb-1 text-xs font-semibold text-muted">{section.label}</h3>
                <div className="grid grid-cols-6 gap-1.5">
                  {section.things.map((thing) => {
                    const at = index;
                    index += 1;
                    return (
                      <Tile
                        key={thing.id}
                        thing={thing}
                        label={thing.name}
                        sort={sort}
                        chosen={thing.id === props.value}
                        active={active === at}
                        index={at}
                        pictures={props.pictures}
                        onPick={() => pick(thing)}
                        onKeyDown={onTileKey}
                        register={register}
                      />
                    );
                  })}
                </div>
                {section.hidden > 0 && (
                  <Button
                    className="mt-1.5"
                    data-testid={`thing-more-${section.section}`}
                    onClick={() => setExpanded((open) => new Set([...open, section.section]))}
                  >
                    Show all {section.things.length + section.hidden}
                  </Button>
                )}
              </section>
            ))}
            {empty && (
              <p className="text-muted" data-testid="thing-empty">
                {searching
                  ? `No ${THING_WORDS[sort].many} match "${query.trim()}".`
                  : `There are no ${THING_WORDS[sort].many} to pick yet.`}
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Dialog.Close asChild>
              <Button>Cancel</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
