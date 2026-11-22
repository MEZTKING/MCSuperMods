/**
 * The Fluid Studio's picture (ADR 0099 D1), out of the Studio so the Creator and the AI helper
 * draw it too (B615): the still, flowing, overlay and bucket pictures with the tint multiplied
 * over them, and one line of words. Pictures come through the blocks and items Studio host
 * (`thumbnail` for the project's, the vanilla reader for Minecraft's), so a bundle-backed host
 * draws a bundle's.
 *
 * @packageDocumentation
 */

import type { Element } from '@msm/core';
import { useEffect, useState } from 'react';
import { pngDataUrl } from '../../components/AssetList';
import { asObject } from './blocks-items-model';
import {
  type FluidPicture,
  fluidPreviewOf,
  pictureAssetPath,
  speedWords,
  spreadWords,
} from './fluid-model';
import { useBlocksItemsStudioHost } from './host';

const PICTURE_SIZE = 64;

/** The picture of `texture` as a data URL: a project thumbnail, or vanilla's from the game. */
function usePicture(texture: string): string | null {
  const host = useBlocksItemsStudioHost();
  const [url, setUrl] = useState<string | null>(null);
  const thumbnail = host?.thumbnail;
  const vanilla = host?.modelPreview?.vanilla ?? null;
  const revision = host?.revision ?? 0;
  const path = pictureAssetPath(texture);
  useEffect(() => {
    void revision;
    setUrl(null);
    const load = path.startsWith('assets/minecraft/')
      ? vanilla === null
        ? undefined
        : () => vanilla.readAsset(path)
      : thumbnail === undefined
        ? undefined
        : () => thumbnail(path, PICTURE_SIZE);
    if (load === undefined) return;
    let live = true;
    load().then(
      (bytes) => {
        if (live && bytes !== null) setUrl(pngDataUrl(bytes));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [thumbnail, vanilla, path, revision]);
  return url;
}

/** One tile of the preview: the picture's first frame with the tint multiplied over it. */
export function FluidTile(props: {
  label: string;
  picture: FluidPicture;
  tint: string | undefined;
  testId: string;
}) {
  const url = usePicture(props.picture.texture);
  return (
    <figure className="flex flex-col items-center gap-1" data-testid={props.testId}>
      <div
        className="relative size-16 overflow-hidden border border-border bg-bg"
        data-testid={`${props.testId}-picture`}
        data-texture={props.picture.texture}
      >
        {url !== null && (
          <img
            alt=""
            src={url}
            className="absolute inset-0 size-16 object-cover object-top [image-rendering:pixelated]"
          />
        )}
        {props.tint !== undefined && (
          <div
            aria-hidden
            className="absolute inset-0"
            data-testid={`${props.testId}-tint`}
            style={{ backgroundColor: props.tint, mixBlendMode: 'multiply' }}
          />
        )}
      </div>
      <figcaption className="text-center text-muted text-xs">
        {props.label}
        {props.picture.fallback ? ' (from your game)' : ''}
      </figcaption>
    </figure>
  );
}

/** "spreads 7 blocks" for the defaults line. */
export function fluidSpreadWords(dropOff: number): string {
  return spreadWords(dropOff)
    .replace(/^Spreads/, 'spreads')
    .replace(/ from its source.*$/, '');
}

/** The liquid's display name, or "Liquid". */
export function fluidName(element: Pick<Element, 'data'>): string {
  const data = asObject(element.data);
  return typeof data.display_name === 'string' && data.display_name.trim() !== ''
    ? data.display_name
    : 'Liquid';
}

/** The tiles and the words line (`<testId>-still`, `-flowing`, `-overlay`, `-bucket`, `-words`). */
export function FluidPictures(props: { element: Pick<Element, 'data'>; testId?: string }) {
  const testId = props.testId ?? 'fluid-preview';
  const preview = fluidPreviewOf(props.element.data);
  const name = fluidName(props.element);
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <FluidTile
          label="Still"
          picture={preview.still}
          tint={preview.tint}
          testId={`${testId}-still`}
        />
        <FluidTile
          label="Flowing"
          picture={preview.flowing}
          tint={preview.tint}
          testId={`${testId}-flowing`}
        />
        {preview.overlay !== undefined && (
          <FluidTile
            label="Overlay"
            picture={preview.overlay}
            tint={preview.tint}
            testId={`${testId}-overlay`}
          />
        )}
        <FluidTile
          label="Bucket"
          picture={preview.bucket}
          tint={undefined}
          testId={`${testId}-bucket`}
        />
      </div>
      <p className="text-muted text-xs" data-testid={`${testId}-words`}>
        {`${name} flows ${speedWords(preview.flow.tickDelay)} and ${fluidSpreadWords(
          preview.flow.dropOff,
        )}${preview.light > 0 ? `, with light level ${preview.light}` : ''}.`}
      </p>
    </>
  );
}
