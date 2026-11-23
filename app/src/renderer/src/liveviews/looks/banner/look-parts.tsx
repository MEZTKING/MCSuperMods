/**
 * What B628's four looks share: the element's data once it has settled for 150 ms, the bytes of
 * the pictures a look reads (the project's first, then the user's own jar for `minecraft:`
 * paths, `particle/look-pictures.ts`), a flat picture of composed pixels, the geo renderer over
 * one of B623's shapes with a composed picture, and the words for an id (a name in Very easy,
 * never the id itself).
 */

import type { Json, Project } from '@msm/plugin-api';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { thingName } from '../../../components/thing-picker/thing-sources';
import { pngDataUrl } from '../../../preview/bundle-source';
import type { GeoScene } from '../../../preview/geo/subject';
import type { ResourceFolders } from '../../../preview/model-chain';
import { hasWebGL } from '../../../preview/webgl';
import { wordsOfPath } from '../../frame/item-picture';
import { LIVE_VIEW_DEBOUNCE_MS } from '../../frame/live-data';
import type { GeoJson } from '../bodies/index';
import { type LookPictureSource, readLookAsset, splitId } from '../particle/look-pictures';
import { encodePng, type Pixels, pixelsKey } from './pixels';

const GeoCanvas = lazy(() => import('../../../preview/geo/GeoCanvas'));

/** A record of JSON, or `undefined`. */
export function recordOf(value: Json | undefined): Record<string, Json> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

/** A string field, or `undefined` when missing or empty. */
export function stringOf(value: Json | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The jar path of a texture id under `folder` (`ns:path` to `assets/ns/textures/<folder>/path.png`). */
export function texturePathOf(id: string, folder: string, textures = 'textures'): string {
  const { namespace, path } = splitId(id);
  const prefix = folder === '' ? '' : `${folder}/`;
  return `assets/${namespace}/${textures}/${prefix}${path}.png`;
}

/** The value once it has stopped changing (as JSON) for 150 ms; the first value at once. */
export function useSettled<T>(value: T): T {
  const text = JSON.stringify(value) ?? '';
  const [settled, setSettled] = useState<{ text: string; value: T }>({ text, value });
  useEffect(() => {
    if (text === settled.text) return;
    const timer = setTimeout(() => setSettled({ text, value }), LIVE_VIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value, settled.text]);
  return settled.value;
}

/** Loaded bytes by path (`null` for a picture that is not there), or `null` while loading. */
export type LoadedBytes = Readonly<Record<string, Uint8Array | null>>;

/** The bytes at each path (see the module comment), loaded again when the list changes. */
export function useLookBytes(
  paths: readonly string[],
  source: LookPictureSource,
): LoadedBytes | null {
  const key = JSON.stringify([...new Set(paths)].sort());
  const { vanillaAssets, readProject } = source;
  const [loaded, setLoaded] = useState<{ key: string; bytes: LoadedBytes } | null>(null);
  useEffect(() => {
    let live = true;
    const list = JSON.parse(key) as string[];
    void Promise.all(
      list.map(
        async (path) =>
          [
            path,
            await readLookAsset(path, { vanillaAssets, readProject }).catch(() => null),
          ] as const,
      ),
    ).then((entries) => {
      if (live) setLoaded({ key, bytes: Object.fromEntries(entries) });
    });
    return () => {
      live = false;
    };
  }, [key, vanillaAssets, readProject]);
  return loaded?.key === key ? loaded.bytes : null;
}

/** Words for an id: the project's name for its own things, the id's last words for Minecraft's. */
export function idWords(project: Project, id: string): string {
  const { namespace } = splitId(id);
  return namespace === 'minecraft' ? wordsOfPath(id) : thingName(project, id);
}

/** Props of {@link FlatPicture}. */
export interface FlatPictureProps {
  readonly pixels: Pixels;
  /** CSS pixels per picture pixel. */
  readonly scale: number;
  readonly label: string;
  readonly testId?: string;
}

/** Composed pixels as a sharp picture. */
export function FlatPicture(props: FlatPictureProps) {
  const { pixels, scale } = props;
  const url = useMemo(() => pngDataUrl(encodePng(pixels)), [pixels]);
  return (
    <img
      src={url}
      alt={props.label}
      width={pixels.width * scale}
      height={pixels.height * scale}
      draggable={false}
      data-testid={props.testId}
      style={{ imageRendering: 'pixelated' }}
      className="border border-border"
    />
  );
}

/** Props of {@link ShapeCanvas}. */
export interface ShapeCanvasProps {
  /** One of B623's shapes. */
  readonly geo: GeoJson;
  /** The composed picture it wears. */
  readonly pixels: Pixels;
  /** What it is, for the label. */
  readonly name: string;
  readonly folders: ResourceFolders | null;
  readonly testId?: string;
}

/** A shape turning in the geo renderer, wearing composed pixels; nothing without WebGL. */
export function ShapeCanvas(props: ShapeCanvasProps) {
  const { geo, pixels, name, folders } = props;
  const key = pixelsKey(pixels);
  const scene = useMemo<Extract<GeoScene, { ok: true }>>(
    () => ({
      ok: true,
      modelId: `geometry.msm.live.${name}`,
      model: geo,
      // A new id per picture, so the renderer reads the new one.
      textureId: `msm:live/${key}`,
      animations: null,
      initialAnimation: null,
      scale: 1,
      notices: [],
    }),
    [geo, key, name],
  );
  const bytes = useMemo(() => encodePng(pixels), [pixels]);
  if (folders === null || !hasWebGL()) return null;
  return (
    <div className="h-64 w-full max-w-sm" data-testid={props.testId}>
      <Suspense fallback={<p className="text-sm text-muted">Loading preview…</p>}>
        <GeoCanvas
          scene={scene}
          subjectId={name}
          folders={folders}
          readProjectAsset={async () => bytes}
        />
      </Suspense>
    </div>
  );
}
