/**
 * The picture at the right of Home's hero (ADR 0129 D5): the drawn still of a featured example
 * (the first Showcase card's), at the picture's size in device pixels and shown `pixelated`, with
 * a skeleton of the same size until it is drawn. A still, not a clip, so the Showcase's card stays
 * the one live clip on Home (ADR 0118's rule).
 *
 * Test id: `home-hero-still` (once drawn).
 *
 * @packageDocumentation
 */

import type { ExampleProject, Target } from '@msm/plugin-api';
import { useEffect, useRef, useState } from 'react';
import { drawnStill, type StillCodec, stillSizeFor } from '../../../showcase/drawn-still';
import { pixelImageClass } from './card-style';

/** Props of {@link HeroPicture}. */
export interface HeroPictureProps {
  readonly example: ExampleProject;
  readonly target: Target;
  /** What the picture shows, for screen readers ("A small elm hut"). */
  readonly label: string;
  readonly codec?: StillCodec;
}

/** The hero's picture. */
export function HeroPicture(props: HeroPictureProps) {
  const { example, target, codec } = props;
  const box = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const element = box.current;
    let live = true;
    const size = stillSizeFor(
      element?.clientWidth ?? 0,
      element?.clientHeight ?? 0,
      typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    );
    drawnStill(example, target, codec, size).then(
      (made) => {
        if (live) setUrl(made);
      },
      () => {
        // No picture: the skeleton's plain ground stays.
      },
    );
    return () => {
      live = false;
    };
  }, [example, target, codec]);
  return (
    <div
      ref={box}
      role="img"
      aria-label={props.label}
      className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-bg"
    >
      {url === null ? (
        <span aria-hidden className="block size-full animate-pulse bg-border/40" />
      ) : (
        <img src={url} alt="" className={pixelImageClass} data-testid="home-hero-still" />
      )}
    </div>
  );
}
