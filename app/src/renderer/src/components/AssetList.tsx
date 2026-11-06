import type { Asset } from '@msm/core';
import { FileAudio, FileImage, FolderSearch, ImageUp, Paintbrush, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { iconButtonClass } from './ui/Button';

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

function AssetRow(props: { namespace: string; asset: Asset; actions: AssetActions }) {
  const { namespace, asset, actions } = props;
  const isImage = asset.mediaType === 'image/png';
  const thumbnail = useThumbnail(
    isImage ? actions.thumbnail : undefined,
    `assets/${namespace}/${asset.path}`,
    actions.revision ?? 0,
  );
  const name = `${namespace}:${asset.path}`;
  return (
    <li
      className="group flex min-w-0 items-center gap-1.5 px-1 py-0.5"
      title={`${asset.path} (${asset.mediaType})`}
      data-testid={`asset-row-${name}`}
    >
      {thumbnail !== null ? (
        <img
          src={thumbnail}
          alt=""
          width={16}
          height={16}
          className="size-4 shrink-0 [image-rendering:pixelated]"
        />
      ) : isImage ? (
        <FileImage size={14} aria-hidden className="shrink-0 text-muted" />
      ) : (
        <FileAudio size={14} aria-hidden className="shrink-0 text-muted" />
      )}
      {/* `w-0` stops the name's width pushing the row (and the sidebar's scroll content) wider,
          so the action buttons always fit; the full path is in the tooltip. */}
      <span className="w-0 min-w-0 flex-1 truncate" title={asset.path}>
        {asset.path}
      </span>
      {isImage && actions.onPaint !== undefined && (
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Paint ${name}`}
          title="Paint this texture"
          data-testid={`asset-paint-${name}`}
          onClick={() => actions.onPaint?.(namespace, asset.path)}
        >
          <Paintbrush size={14} aria-hidden />
        </button>
      )}
      {actions.onReveal !== undefined && (
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Reveal ${name} in folder`}
          title="Reveal in folder"
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
          title={`Remove ${asset.path}`}
          onClick={() => actions.onRemove?.(namespace, asset.path)}
        >
          <Trash2 size={14} aria-hidden />
        </button>
      )}
    </li>
  );
}

const headingClass = 'mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted';

/** The "Assets" section of one namespace: thumbnails, import, reveal and remove. */
export function AssetList(props: {
  namespace: string;
  assets: readonly Asset[];
  actions: AssetActions;
}) {
  const { namespace, actions } = props;
  const assets = [...props.assets].sort((a, b) => a.path.localeCompare(b.path));
  return (
    <section aria-label={`${namespace} assets`} className="ml-1">
      <div className="flex items-center gap-1">
        <h3 className={headingClass}>Assets</h3>
        {actions.onImport !== undefined && (
          <button
            type="button"
            className={`${iconButtonClass} mt-2 ml-auto`}
            aria-label={`Import textures or sounds into ${namespace}`}
            title="Import textures…"
            data-testid={`assets-import-${namespace}`}
            onClick={() => actions.onImport?.(namespace)}
          >
            <ImageUp size={14} aria-hidden />
          </button>
        )}
      </div>
      {assets.length === 0 ? (
        <p className="px-1 py-0.5 text-muted">No assets.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {assets.map((asset) => (
            <AssetRow key={asset.path} namespace={namespace} asset={asset} actions={actions} />
          ))}
        </ul>
      )}
    </section>
  );
}
