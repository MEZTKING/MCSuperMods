/**
 * A stand-in body wearing its pictures (B627; ADR 0121 D4, D9), shared by the variant, villager
 * and sulfur cube views: the body of `looks/bodies/` (loaded lazily), the layers read from the
 * project first and then the user's own jar cache (`readLookAsset`), laid over each other into one
 * picture (`compose.ts`) and drawn turning by {@link BodyCanvas}. Without WebGL, the layers are
 * shown flat, one over another, as the picture the body would wear. Nothing is bundled or
 * written: the pictures live in the page only.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { pngDataUrl } from '../../../preview/bundle-source';
import { hasWebGL } from '../../../preview/webgl';
import { decodePng } from '../font/png';
import { PixelPicture } from '../particle/LookPicture';
import {
  type LookPictureSource,
  prefersReducedMotion,
  readLookAsset,
} from '../particle/look-pictures';
import type { BodySheet } from './BodyCanvas';
import { composeLayers, geoTextureSize } from './compose';

const BodyCanvas = lazy(() => import('./BodyCanvas'));

/** One picture a body wears. */
export interface BodyLayer {
  /** The jar path (`assets/<ns>/textures/....png`), or `null` when the data names none. */
  readonly path: string | null;
  /** What it is, in words ("Clothes of the look"). */
  readonly label: string;
  /** The rectangle of the body's picture it may cover; the whole picture when absent. */
  readonly rect?: readonly [number, number, number, number];
}

/** Read pictures: still waiting, or each layer's bytes (`null` where it was not found). */
export type LayerBytes =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly bytes: readonly (Uint8Array | null)[] };

/** The bytes of each path, read again `debounceMs` after the paths or the readers change. */
export function useLayerBytes(
  paths: readonly (string | null)[],
  source: LookPictureSource,
  debounceMs: number,
): LayerBytes {
  const key = JSON.stringify(paths);
  const { vanillaAssets, readProject } = source;
  const [state, setState] = useState<LayerBytes>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    const list = JSON.parse(key) as (string | null)[];
    const timer = setTimeout(() => {
      void Promise.all(
        list.map((path) =>
          path === null
            ? Promise.resolve(null)
            : readLookAsset(path, { vanillaAssets, readProject }),
        ),
      ).then((bytes) => {
        if (live) setState({ status: 'ready', bytes });
      });
    }, debounceMs);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, vanillaAssets, readProject, debounceMs]);
  return state;
}

/** The body's geo JSON once loaded (and changed by `transform`), or `null`. */
function useGeo(
  body: (() => Promise<Json>) | null,
  bodyKey: string,
  transform: ((geo: Json) => Json) | undefined,
  transformKey: string,
): Json | null {
  const [geo, setGeo] = useState<Json | null>(null);

  useEffect(() => {
    let live = true;
    if (body === null) {
      setGeo(null);
      return;
    }
    void body().then(
      (loaded) => {
        if (live) setGeo(transform === undefined ? loaded : transform(loaded));
      },
      () => {
        if (live) setGeo(null);
      },
    );
    return () => {
      live = false;
    };
  }, [bodyKey, transformKey]);
  return geo;
}

/** The layers laid into one picture at the body's texture size, or `null` when none decodes. */
export function composeSheet(
  geo: Json,
  layers: readonly BodyLayer[],
  bytes: readonly (Uint8Array | null)[],
): BodySheet | null {
  const { width, height } = geoTextureSize(geo);
  const decoded = layers.flatMap((layer, index) => {
    const found = bytes[index];
    if (found === null || found === undefined) return [];
    try {
      return [
        { pixels: decodePng(found), ...(layer.rect === undefined ? {} : { rect: layer.rect }) },
      ];
    } catch {
      return [];
    }
  });
  if (decoded.length === 0) return null;
  return { width, height, data: composeLayers(width, height, decoded) };
}

/** Props of {@link BodyLook}. */
export interface BodyLookProps {
  /** The body's loader (`bodyFor`), its id as a key, and an optional change (scale, parts left out). */
  readonly body: () => Promise<Json>;
  readonly bodyKey: string;
  readonly transform?: (geo: Json) => Json;
  readonly transformKey?: string;
  /** The pictures, bottom first. */
  readonly layers: readonly BodyLayer[];
  readonly source: LookPictureSource;
  /** What is shown, in words. */
  readonly label: string;
  /** The wait after an edit (the panel's 150 ms; 0 in a Studio). */
  readonly debounceMs: number;
  readonly testId: string;
}

/** The body; see the module comment. */
export function BodyLook(props: BodyLookProps) {
  const { layers, source, debounceMs, testId } = props;
  const webgl = hasWebGL();
  const geo = useGeo(
    webgl ? props.body : null,
    props.bodyKey,
    props.transform,
    props.transformKey ?? '',
  );
  const bytes = useLayerBytes(
    layers.map((layer) => layer.path),
    source,
    debounceMs,
  );
  const layersKey = JSON.stringify(layers);

  const sheet = useMemo(
    () =>
      geo === null || bytes.status !== 'ready' ? null : composeSheet(geo, layers, bytes.bytes),
    [geo, layersKey, bytes],
  );
  const found =
    bytes.status === 'ready' ? layers.filter((_, index) => bytes.bytes[index] != null) : [];
  const missing =
    bytes.status === 'ready'
      ? layers.filter((layer, index) => layer.path !== null && bytes.bytes[index] == null)
      : [];
  return (
    <div
      className="flex flex-col gap-2"
      data-testid={testId}
      data-state={bytes.status}
      data-layers={found.map((layer) => layer.path).join('|')}
      data-paths={layers.map((layer) => layer.path ?? '').join('|')}
      data-mode={webgl ? 'body' : 'flat'}
    >
      {bytes.status === 'ready' && webgl && geo !== null && (
        <Suspense fallback={<span className="text-muted text-xs">…</span>}>
          <BodyCanvas
            geo={geo}
            sheet={sheet}
            label={props.label}
            turning={!prefersReducedMotion()}
            testId={`${testId}-canvas`}
          />
        </Suspense>
      )}
      {bytes.status === 'ready' && !webgl && (
        <FlatLayers layers={layers} bytes={bytes.bytes} label={props.label} testId={testId} />
      )}
      {missing.length > 0 && (
        <p className="text-warning text-xs" data-testid={`${testId}-missing`}>
          {`Not found: ${missing.map((layer) => layer.label.toLowerCase()).join(', ')}.`}
        </p>
      )}
    </div>
  );
}

/** The layers one over another, flat (without WebGL, ADR 0121 D9). */
function FlatLayers(props: {
  layers: readonly BodyLayer[];
  bytes: readonly (Uint8Array | null)[];
  label: string;
  testId: string;
}) {
  const urls = props.layers.flatMap((layer, index) => {
    const bytes = props.bytes[index];
    return bytes === null || bytes === undefined ? [] : [{ layer, url: pngDataUrl(bytes) }];
  });
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span
        role="img"
        aria-label={props.label}
        className="relative block border border-border"
        style={{ width: 192, height: 192 }}
        data-testid={`${props.testId}-flat`}
      >
        {urls.map(({ layer, url }, index) => (
          <PixelPicture key={`${index}-${layer.label}`} url={url} width={192} height={192} layer />
        ))}
      </span>
      <span className="text-muted text-xs">
        The pictures flat, one over another: the 3D body needs WebGL.
      </span>
    </div>
  );
}
