/**
 * The picture at the right of Home's hero (ADR 0129 D5): the drawn still of a featured example
 * (the first Showcase card's), at the picture's size in device pixels and shown `pixelated`, with
 * a skeleton of the same size until it is drawn. A still, not a clip, so the Showcase's card stays
 * the one live clip on Home (ADR 0118's rule). The size is measured from the box's exact layout
 * size (not rounded CSS pixels) and again whenever it changes (the window resized or moved to a
 * screen of another scale), so the still is always one still pixel per device pixel; a box with
 * no size (hidden in a narrow window) draws nothing.
 *
 * Test id: `home-hero-still` (once drawn).
 *
 * @packageDocumentation
 */

import type { ExampleProject, Target } from '@msm/plugin-api';
import { useEffect, useRef, useState } from 'react';
import {
  drawnStill,
  type StillCodec,
  type StillSize,
  stillSizeFor,
} from '../../../showcase/drawn-still';
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
  const [size, setSize] = useState<StillSize | null>(null);
  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    const measure = (): void => {
      // The picture inside the border: the exact layout size, not rounded CSS pixels.
      const rect = element.getBoundingClientRect();
      const border = element.offsetWidth - element.clientWidth;
      const width = rect.width - border;
      const height = rect.height - (element.offsetHeight - element.clientHeight);
      if (!(width > 0) || !(height > 0)) return;
      const next = stillSizeFor(
        width,
        height,
        typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      );
      setSize((before) =>
        before !== null && before.width === next.width && before.height === next.height
          ? before
          : next,
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  useEffect(() => {
    if (size === null) return;
    let live = true;
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
  }, [example, target, codec, size]);
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
