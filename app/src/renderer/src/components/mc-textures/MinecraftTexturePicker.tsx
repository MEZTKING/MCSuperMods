/**
 * The picker of **Start from a Minecraft texture** and **Change a Minecraft texture** (ADR 0129
 * D4): the textures of the user's own Minecraft by name, in folders (blocks, items, mobs,
 * particles, GUI, paintings), with a search and pixelated thumbnails that load as they come near
 * the view. Ids show only in Advanced mode. Without the Minecraft folder set up it says so in one
 * line and offers the set-up. The pictures come from the user's jar through the local asset cache
 * (ADR 0011); MSM ships none. The default export is loaded lazily on first use.
 *
 * @packageDocumentation
 */

import { Dialog } from 'radix-ui';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../../store/preferences';
import { pngDataUrl } from '../AssetList';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';
import {
  filterTextures,
  MC_TEXTURE_FOLDERS,
  type McTexture,
  type McTextureFolder,
  minecraftTextures,
} from './catalogue';
import { type McTexturePick, type MinecraftTexturesHost, readPick } from './host';

/** The line shown when the Minecraft folder is not set up. */
export const NOT_SET_UP_WORDS =
  "Minecraft's textures come from your own Minecraft: set up the Minecraft folder first.";

/** How many cards show before **Show more**. */
export const PAGE_SIZE = 120;

/** Props of {@link MinecraftTexturePicker}. */
export interface MinecraftTexturePickerProps {
  host: MinecraftTexturesHost;
  /** The dialog's title. */
  title: string;
  /** The folder shown first (`'all'` by default). */
  folder?: McTextureFolder | 'all';
  /** Takes the picked texture; rejects with a message when it cannot. */
  onPick(pick: McTexturePick): Promise<void> | void;
  onClose(): void;
}

/** The test id part of a texture: `minecraft:block/stone` -> `block-stone`. */
export function textureTestId(texture: Pick<McTexture, 'id'>): string {
  return texture.id.slice('minecraft:'.length).replace(/[^a-z0-9]+/g, '-');
}

/** The listing, once per host (the cache does not change while the app runs). */
const listings = new WeakMap<MinecraftTexturesHost, Promise<McTexture[]>>();
function listingOf(host: MinecraftTexturesHost): Promise<McTexture[]> {
  let listing = listings.get(host);
  if (listing === undefined) {
    listing = host.list().then((paths) => minecraftTextures(paths));
    listing.catch(() => listings.delete(host));
    listings.set(host, listing);
  }
  return listing;
}

/** A thumbnail that loads its picture once it comes near the view. */
function Thumbnail({ host, texture }: { host: MinecraftTexturesHost; texture: McTexture }) {
  const [url, setUrl] = useState<string | null>(null);
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    let live = true;
    const load = (): void => {
      host.read(texture.jarPath).then(
        (bytes) => {
          if (live && bytes !== null) setUrl(pngDataUrl(bytes));
        },
        () => {},
      );
    };
    if (typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        live = false;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [host, texture.jarPath]);
  return (
    <span
      ref={box}
      className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-bg"
      aria-hidden
    >
      {url !== null && (
        // An animation strip shows its first frame: the square box crops to the top.
        <img
          src={url}
          alt=""
          className="size-12 object-cover object-top [image-rendering:pixelated]"
          draggable={false}
        />
      )}
    </span>
  );
}

export function MinecraftTexturePicker(props: MinecraftTexturePickerProps) {
  const { host } = props;
  const advanced = usePreferences((state) => state.mode) === 'advanced';
  const [textures, setTextures] = useState<McTexture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<McTextureFolder | 'all'>(props.folder ?? 'all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  const searchId = useId();

  useEffect(() => {
    if (!host.ready) return;
    let live = true;
    listingOf(host).then(
      (list) => {
        if (live) setTextures(list);
      },
      (caught: unknown) => {
        if (live) setError(caught instanceof Error ? caught.message : String(caught));
      },
    );
    return () => {
      live = false;
    };
  }, [host]);

  const found = useMemo(
    () => (textures === null ? [] : filterTextures(textures, folder, query)),
    [textures, folder, query],
  );

  const pick = async (texture: McTexture): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await props.onPick(await readPick(host, texture));
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="mc-texture-picker"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">{props.title}</Dialog.Title>
          {!host.ready ? (
            <div
              role="status"
              data-testid="mc-texture-not-set-up"
              className="flex flex-wrap items-center gap-2 rounded border border-warning px-3 py-2 text-sm"
            >
              <span>{NOT_SET_UP_WORDS}</span>
              <Button
                data-testid="mc-texture-set-up"
                onClick={() => {
                  props.onClose();
                  host.openSetUp();
                }}
              >
                Set up Minecraft folder
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted">
                Pick a picture from your own Minecraft. It becomes the start of your own picture:
                the game's files stay as they are.
              </p>
              <label htmlFor={searchId} className="sr-only">
                Search Minecraft's textures
              </label>
              <input
                id={searchId}
                data-testid="mc-texture-search"
                className={fieldClass}
                placeholder="Search: stone, dirt, diamond sword, cow…"
                value={query}
                // biome-ignore lint/a11y/noAutofocus: the picker is a search first.
                autoFocus
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShown(PAGE_SIZE);
                }}
              />
              <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Folders">
                {[{ id: 'all' as const, label: 'All' }, ...MC_TEXTURE_FOLDERS].map((entry) => (
                  <Button
                    key={entry.id}
                    data-testid={`mc-texture-folder-${entry.id}`}
                    aria-pressed={folder === entry.id}
                    className={folder === entry.id ? 'border-accent text-accent' : undefined}
                    onClick={() => {
                      setFolder(entry.id);
                      setShown(PAGE_SIZE);
                    }}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>
              {textures === null && error === null && (
                <p className="text-sm text-muted">Reading your Minecraft's textures…</p>
              )}
              {textures !== null && (
                <p className="text-xs text-muted" data-testid="mc-texture-count">
                  {found.length === 1 ? '1 picture' : `${found.length} pictures`}
                </p>
              )}
              {textures !== null && found.length === 0 && (
                <p className="text-sm text-muted" data-testid="mc-texture-none">
                  Nothing matches. Try another word or another folder.
                </p>
              )}
              <ul
                className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1 overflow-auto"
                aria-label="Minecraft textures"
              >
                {found.slice(0, shown).map((texture) => (
                  <li key={texture.jarPath}>
                    <button
                      type="button"
                      data-testid={`mc-texture-${textureTestId(texture)}`}
                      disabled={busy}
                      title={advanced ? texture.id : texture.name}
                      className="flex w-full cursor-pointer items-center gap-2 rounded border border-border p-1 text-left text-sm hover:enabled:border-accent focus-visible:border-accent disabled:opacity-50"
                      onClick={() => void pick(texture)}
                    >
                      <Thumbnail host={host} texture={texture} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{texture.name}</span>
                        {texture.animated && <span className="text-xs text-muted">Moving</span>}
                        {advanced && (
                          <span className="truncate font-mono text-xs text-muted">
                            {texture.id}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {found.length > shown && (
                <Button
                  data-testid="mc-texture-more"
                  className="self-start"
                  onClick={() => setShown(shown + PAGE_SIZE)}
                >
                  Show more ({found.length - shown} left)
                </Button>
              )}
            </>
          )}
          {error !== null && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Dialog.Close asChild>
              <Button data-testid="mc-texture-cancel">Cancel</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default MinecraftTexturePicker;
