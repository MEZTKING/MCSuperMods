/**
 * Pictures for the flat looks of B625 (particle sprites, waypoint dots, potion bottles, the
 * creative page, effect frames; ADR 0121 D3, D7). A picture is read from the project first (a
 * resource pack may repaint one of Minecraft's), then, for `minecraft:` paths, from the user's
 * own jar cache (`LiveViewProps.vanillaAssets`, B621's folders). Nothing is bundled, written or
 * copied: the bytes become `data:` URLs for the page only. When the Minecraft folder is not set
 * up, the views draw MSM's own stand-in and say so in the frame.
 */

import type { Json } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import { pngDataUrl } from '../../../preview/bundle-source';
import type { VanillaAssetReader } from '../../../preview/model-chain';

/** Where the looks read pictures from. */
export interface LookPictureSource {
  /** The user's jar cache, or `null` when the Minecraft folder is not set up. */
  readonly vanillaAssets: VanillaAssetReader | null;
  /** A project file by its path (`assets/<ns>/...`), or absent. */
  readonly readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
}

/** The words of the frame's note when a look draws MSM's stand-in for Minecraft's pictures. */
export const STAND_IN_WORDS =
  'Your Minecraft folder is not set up, so MSM draws its own stand-in for Minecraft’s pictures.';

/** `ns:path` (or `path`, which is `minecraft:`) split. */
export function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/** Whether a jar path (`assets/<ns>/...`) is one of Minecraft's own. */
export function isVanillaPath(path: string): boolean {
  return path.startsWith('assets/minecraft/');
}

/** The bytes at a jar path: the project's first, then Minecraft's for `minecraft:` paths. */
export async function readLookAsset(
  path: string,
  source: LookPictureSource,
): Promise<Uint8Array | null> {
  const own =
    source.readProject === undefined ? null : await source.readProject(path).catch(() => null);
  if (own !== null && own.length > 0) return own;
  if (!isVanillaPath(path) || source.vanillaAssets === null) return null;
  const bytes = await source.vanillaAssets.readAsset(path).catch(() => null);
  return bytes === null || bytes.length === 0 ? null : bytes;
}

/** The JSON at a jar path, or `undefined`. */
export async function readLookJson(
  path: string,
  source: LookPictureSource,
): Promise<Json | undefined> {
  const bytes = await readLookAsset(path, source);
  if (bytes === null) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Json;
  } catch {
    return undefined;
  }
}

/** A picture's state: still loading, found (a `data:` URL) or not there. */
export type PictureState =
  | { readonly state: 'loading' }
  | { readonly state: 'found'; readonly url: string }
  | { readonly state: 'missing' };

const LOADING: PictureState = { state: 'loading' };
const MISSING: PictureState = { state: 'missing' };

/** The pictures at `paths`, in order, as `data:` URLs (`missing` for those not there). */
export function useLookPictures(
  paths: readonly (string | null)[],
  source: LookPictureSource,
): readonly PictureState[] {
  const key = JSON.stringify(paths);
  const { vanillaAssets, readProject } = source;
  const [pictures, setPictures] = useState<readonly PictureState[]>(() => paths.map(() => LOADING));
  useEffect(() => {
    let live = true;
    const list = JSON.parse(key) as (string | null)[];
    setPictures(list.map(() => LOADING));
    void Promise.all(
      list.map(async (path): Promise<PictureState> => {
        if (path === null || path === '') return MISSING;
        const bytes = await readLookAsset(path, { vanillaAssets, readProject });
        return bytes === null ? MISSING : { state: 'found', url: pngDataUrl(bytes) };
      }),
    ).then((found) => {
      if (live) setPictures(found);
    });
    return () => {
      live = false;
    };
  }, [key, vanillaAssets, readProject]);
  return pictures;
}

/** One picture (see {@link useLookPictures}). */
export function useLookPicture(path: string | null, source: LookPictureSource): PictureState {
  return useLookPictures([path], source)[0] ?? MISSING;
}

/** A colour number (`0xRRGGBB`, or a signed ARGB int) as `#rrggbb`. */
export function cssColour(value: number): string {
  return `#${((value >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Whether the viewer asked for less motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
