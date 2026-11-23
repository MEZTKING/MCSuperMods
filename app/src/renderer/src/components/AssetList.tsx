import type { Asset } from '@msm/core';
import {
  FileAudio,
  FileImage,
  FolderSearch,
  ImagePlus,
  ImageUp,
  Paintbrush,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { TEXTURE_DRAG_TYPE } from '../textures/retexture';
import { iconButtonClass } from './ui/Button';
import { MoreOptions, rememberedMoreOptions } from './ui/MoreOptions';

/** Host actions for a namespace's assets. All optional: without them the list is read-only. */
export interface AssetActions {
  /** Opens the import dialog for the namespace. */
  onImport?(namespace: string): void;
  /** Asks to remove an asset (the host confirms first). */
  onRemove?(namespace: string, path: string): void;
  /** Reveals an asset in the OS file manager. */
  onReveal?(namespace: string, path: string): void;
  /** Opens a PNG texture in the pixel editor (ADR 0047 D5). */
  onPaint?(namespace: string, path: string): void;
  /** Starts a new, blank texture in the pixel editor. */
  onNewTexture?(namespace: string): void;
  /** Turns a picture or screenshot into a texture (ADR 0048). */
  onPicture?(namespace: string): void;
  /** Loads a PNG thumbnail for a project-relative asset path (`assets/<ns>/...png`). */
  thumbnail?(assetPath: string, size: number): Promise<Uint8Array>;
  /** Changes when asset bytes may have changed (re-import), so thumbnails reload. */
  revision?: number;
}

const THUMBNAIL_SIZE = 32;

/** A PNG as a `data:` URL (the renderer CSP allows `data:` images, not `blob:`). */
export function pngDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/** A thumbnail as a `data:` URL, or `null` while loading or when unavailable. */
function useThumbnail(
  load: AssetActions['thumbnail'],
  assetPath: string,
  revision: number,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (load === undefined) return;
    let live = true;
    load(assetPath, THUMBNAIL_SIZE).then(
      (bytes) => {
        if (live) setUrl(pngDataUrl(bytes));
      },
      () => {
        if (live) setUrl(null);
      },
    );
    return () => {
      live = false;
    };
  }, [load, assetPath, revision]);
  return url;
}

/** Words of a file name ("textures/block/ruby_ore.png" reads "Ruby ore"). */
export function assetWords(path: string): string {
  const file = path.split('/').pop() ?? path;
  const stem = file.includes('.') ? file.slice(0, file.indexOf('.')) : file;
  const words = stem.replace(/[_-]+/g, ' ').trim();
  return words === '' ? file : words.charAt(0).toUpperCase() + words.slice(1);
}

/** What an asset is, for its mark and its words. */
type AssetSort = 'picture' | 'sound' | 'file';

function sortOf(asset: Asset): AssetSort {
  if (asset.mediaType.startsWith('image/')) return 'picture';
  if (asset.mediaType.startsWith('audio/') || asset.path.endsWith('.ogg')) return 'sound';
  return 'file';
}

/**
 * The plain names of a list of assets, by path: words of the file name, then the folder's word in
 * brackets where two share a name ("Ruby (item)"), then the sort where they still do.
 */
export function assetNames(assets: readonly Asset[]): Map<string, string> {
  const base = new Map(assets.map((asset) => [asset.path, assetWords(asset.path)]));
  const count = (names: Iterable<string>) => {
    const counts = new Map<string, number>();
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
    return counts;
  };
  const baseCounts = count(base.values());
  const named = new Map<string, string>();
  for (const asset of assets) {
    const name = base.get(asset.path) as string;
    if ((baseCounts.get(name) ?? 0) < 2) {
      named.set(asset.path, name);
      continue;
    }
    const parts = asset.path.split('/');
    const folder = parts.length > 1 ? (parts[parts.length - 2] as string) : '';
    named.set(asset.path, folder === '' ? name : `${name} (${folder.replace(/_/g, ' ')})`);
  }
  const namedCounts = count(named.values());
  for (const asset of assets) {
    const name = named.get(asset.path) as string;
    if ((namedCounts.get(name) ?? 0) > 1 && sortOf(asset) === 'file') {
      named.set(asset.path, `${name} (settings)`);
    }
  }
  return named;
}

/** Whether the list starts showing where the files are (the More options' own start). */
function pathsStartShown(key: string): boolean {
  return (
    rememberedMoreOptions(key) ??
    (typeof window !== 'undefined' && window.msmMoreOptionsOpen === true)
  );
}

function AssetRow(props: {
  namespace: string;
  asset: Asset;
  name: string;
  showPaths: boolean;
  actions: AssetActions;
}) {
  const { namespace, asset, actions, name, showPaths } = props;
  const sort = sortOf(asset);
  const isImage = asset.mediaType === 'image/png';
  const draggable = isImage && asset.path.startsWith('textures/');
  const thumbnail = useThumbnail(
    isImage ? actions.thumbnail : undefined,
    `assets/${namespace}/${asset.path}`,
    actions.revision ?? 0,
  );
  const id = `${namespace}:${asset.path}`;
  const shown = showPaths ? asset.path : name;
  const what = sort === 'picture' ? 'a picture' : sort === 'sound' ? 'a sound' : 'a file';
  return (
    <li
      className={`group flex min-w-0 items-center gap-1.5 px-1 py-0.5 ${draggable ? 'cursor-grab' : ''}`}
      title={
        draggable
          ? `${shown}: drag it onto an item, block or model to use it`
          : showPaths
            ? `${asset.path} (${asset.mediaType})`
            : `${name} (${what})`
      }
      data-testid={`asset-row-${id}`}
      data-asset-sort={sort}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.setData(TEXTURE_DRAG_TYPE, id);
        event.dataTransfer.setData('text/plain', id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
    >
      {thumbnail !== null ? (
        <img
          src={thumbnail}
          alt=""
          width={16}
          height={16}
          className="size-4 shrink-0 [image-rendering:pixelated]"
        />
      ) : sort === 'sound' ? (
        <FileAudio size={14} aria-hidden className="shrink-0 text-muted" />
      ) : (
        <FileImage size={14} aria-hidden className="shrink-0 text-muted" />
      )}
      {/* `w-0` stops the name's width pushing the row (and the sidebar's scroll content) wider,
          so the action buttons always fit; the full path is under the name in More options. */}
      <span className="flex w-0 min-w-0 flex-1 flex-col">
        <span className="truncate" title={shown}>
          {name}
        </span>
        {showPaths && <span className="truncate text-muted text-xs">{asset.path}</span>}
      </span>
      {isImage && actions.onPaint !== undefined && (
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Paint ${name}`}
          title="Paint this picture"
          data-testid={`asset-paint-${id}`}
          onClick={() => actions.onPaint?.(namespace, asset.path)}
        >
          <Paintbrush size={14} aria-hidden />
        </button>
      )}
      {actions.onReveal !== undefined && (
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Show ${name} in folder`}
          title="Show in folder"
          data-testid={`asset-reveal-${id}`}
          onClick={() => actions.onReveal?.(namespace, asset.path)}
        >
          <FolderSearch size={14} aria-hidden />
        </button>
      )}
      {actions.onRemove !== undefined && (
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
          data-testid={`asset-remove-${id}`}
          onClick={() => actions.onRemove?.(namespace, asset.path)}
        >
          <Trash2 size={14} aria-hidden />
        </button>
      )}
    </li>
  );
}

const headingClass = 'mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted';

/**
 * The "Pictures and sounds" section of one namespace (plan B703): each file by a plain name with a
 * picture or sound mark; **Show where the files are** (a More options at the bottom) shows the
 * paths. Paint, show in folder, remove, bring in, new picture and photo to picture.
 */
export function AssetList(props: {
  namespace: string;
  /** The mod part's name before the section's name, when the mod has more than one. */
  part?: string | undefined;
  assets: readonly Asset[];
  actions: AssetActions;
}) {
  const { namespace, actions } = props;
  const assets = [...props.assets].sort((a, b) => a.path.localeCompare(b.path));
  const names = assetNames(assets);
  const moreKey = `assets-${namespace}`;
  const [showPaths, setShowPaths] = useState(() => pathsStartShown(moreKey));
  const heading = 'Pictures and sounds';
  const inPart = props.part === undefined ? '' : ` in ${props.part}`;
  return (
    <section
      aria-label={props.part === undefined ? heading : `${props.part} ${heading}`}
      className="ml-1"
    >
      <div className="flex items-center gap-1">
        <h3 className={headingClass}>{heading}</h3>
        {actions.onPicture !== undefined && (
          <button
            type="button"
            className={`${iconButtonClass} mt-2 ml-auto`}
            aria-label={`Turn a photo into a picture${inPart}`}
            title="Turn a photo into a picture…"
            data-testid={`assets-picture-${namespace}`}
            onClick={() => actions.onPicture?.(namespace)}
          >
            <ImagePlus size={14} aria-hidden />
          </button>
        )}
        {actions.onNewTexture !== undefined && (
          <button
            type="button"
            className={`${iconButtonClass} mt-2 ${actions.onPicture === undefined ? 'ml-auto' : ''}`}
            aria-label={`New picture${inPart}`}
            title="New picture…"
            data-testid={`assets-new-texture-${namespace}`}
            onClick={() => actions.onNewTexture?.(namespace)}
          >
            <Paintbrush size={14} aria-hidden />
          </button>
        )}
        {actions.onImport !== undefined && (
          <button
            type="button"
            className={`${iconButtonClass} mt-2 ${actions.onNewTexture === undefined && actions.onPicture === undefined ? 'ml-auto' : ''}`}
            aria-label={`Bring in pictures or sounds${inPart}`}
            title="Bring in pictures or sounds…"
            data-testid={`assets-import-${namespace}`}
            onClick={() => actions.onImport?.(namespace)}
          >
            <ImageUp size={14} aria-hidden />
          </button>
        )}
      </div>
      {assets.length === 0 ? (
        <p className="px-1 py-0.5 text-muted">No pictures or sounds yet.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {assets.map((asset) => (
              <AssetRow
                key={asset.path}
                namespace={namespace}
                asset={asset}
                name={names.get(asset.path) ?? asset.path}
                showPaths={showPaths}
                actions={actions}
              />
            ))}
          </ul>
          <div className="mt-1 px-1">
            <MoreOptions
              storageKey={moreKey}
              label="Show where the files are"
              onOpenChange={setShowPaths}
            >
              <p className="text-muted text-xs">
                These files are in assets/{namespace}/ in the mod&apos;s folder.
              </p>
            </MoreOptions>
          </div>
        </>
      )}
    </section>
  );
}
