/**
 * A gallery card's still (ADR 0129 D1, D2, D5): its example's drawn still when the example has
 * pictures of its own (`textures/`), else the card's drawn picture (`FLOW_CARDS`' `picture`, an
 * art generator look drawn with the library's `artLookPng`), composed the drawn-still way: scaled
 * by a whole number, centred on a tint of its own colour, at the card's device pixels, shown
 * `pixelated`. A card with no entry in `FLOW_CARDS` keeps the old way (its example's still, or
 * the flow's bundle with its default answers).
 *
 * The library is loaded with its first use, so Home's first paint does not carry it.
 *
 * @packageDocumentation
 */

import type { ExampleProject, Target } from '@msm/plugin-api';
import type { ArtLook } from '@msm/plugin-library';
import {
  CANVAS_CODEC,
  composeStill,
  drawnStill,
  drawnStillIfPictures,
  type StillCodec,
  type StillSize,
} from '../../../showcase/drawn-still';
import type { FlowCard } from '../../../showcase/flow-clips';
import { imageDataUrl } from '../../texture-editor/png-canvas';

/** Draws an art look as PNG bytes (the library's `artLookPng`). */
export type LookDrawer = (look: ArtLook) => Promise<Uint8Array>;

/** The library's drawer, loaded on first use. */
export const libraryLookDrawer: LookDrawer = async (look) => {
  const library = await import('@msm/plugin-library');
  return library.artLookPng(look);
};

/** Which picture a card shows: its example's own pictures, or its drawn look. */
export type CardPictureSource = 'example' | 'look';

/** A drawn card still and where it came from. */
export interface CardStill {
  readonly url: string;
  readonly source: CardPictureSource;
}

const looks = new Map<string, Promise<string>>();

/** Forgets the drawn looks (tests). */
export function clearLookStills(): void {
  looks.clear();
}

/** An art look drawn as a still `size` big: scaled by a whole number, centred; cached. */
export function lookStill(
  look: ArtLook,
  size: StillSize,
  codec: StillCodec = CANVAS_CODEC,
  draw: LookDrawer = libraryLookDrawer,
): Promise<string> {
  const key = `${JSON.stringify(look)}\u0000${size.width}x${size.height}`;
  const hit = looks.get(key);
  if (hit !== undefined) return hit;
  const made = (async () => {
    const image = await codec.decode(await draw(look));
    return imageDataUrl(codec.encode(composeStill([image], size.width, size.height)));
  })();
  looks.set(key, made);
  made.catch(() => {
    if (looks.get(key) === made) looks.delete(key);
  });
  return made;
}

/** What a card's still is drawn from. */
export interface CardStillInput {
  /** The card's entry in `FLOW_CARDS`, when it has one. */
  readonly flowCard: FlowCard | undefined;
  /** Its example (the flow card's, else the card's own), when the session has it. */
  readonly example: ExampleProject | undefined;
  /** The flow's bundle with its default answers, for a card without a flow card or example. */
  readonly fallback: ExampleProject | undefined;
  readonly target: Target;
  readonly size: StillSize;
  readonly codec?: StillCodec | undefined;
  readonly draw?: LookDrawer | undefined;
}

/** A card's still, or `null` when there is nothing to draw it from. */
export async function cardStill(input: CardStillInput): Promise<CardStill | null> {
  const { flowCard, example, target, size, codec } = input;
  if (flowCard !== undefined) {
    if (example !== undefined) {
      const own = await drawnStillIfPictures(example, target, codec, size);
      if (own !== null) return { url: own, source: 'example' };
    }
    return { url: await lookStill(flowCard.picture, size, codec, input.draw), source: 'look' };
  }
  const shown = example ?? input.fallback;
  if (shown === undefined) return null;
  return { url: await drawnStill(shown, target, codec, size), source: 'example' };
}
