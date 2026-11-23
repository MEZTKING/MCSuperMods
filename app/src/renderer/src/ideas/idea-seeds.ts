/**
 * The seeds of Home's **More ideas** (ADR 0128 D1): card *n* (from 0) is the mod Surprise me
 * makes from {@link ideaSeed}(base, n), so the list is the same each time the user comes back
 * and goes on for ever; **Shuffle** changes the base. Pure and tiny: Home's first paint carries
 * it, the generator does not.
 *
 * Also the window of the endless grid ({@link ideasWindow}): which rows are near the view and
 * how many rows the list has grown to. Pure, so the scrolling is tested without a browser.
 *
 * @packageDocumentation
 */

import {
  STORE_CARD_GAP,
  STORE_CARD_HEIGHT,
  STORE_CARD_WIDTH,
} from '../components/home/gallery/card-style';

/** The largest seed (Surprise me's `MAX_SEED`). */
export const IDEA_MAX_SEED = 999_999;

/**
 * The seed of card `index` for the base seed `base`: a whole number from 1 to
 * {@link IDEA_MAX_SEED}, the same for the same base and index everywhere (a 32-bit mix of
 * both, so neighbouring cards are unrelated).
 */
export function ideaSeed(base: number, index: number): number {
  let h = Math.imul((base >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13) ^ Math.imul(index + 1, 0xc2b2ae35), 0x27d4eb2f) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x165667b1) >>> 0;
  h ^= h >>> 15;
  return 1 + ((h >>> 0) % IDEA_MAX_SEED);
}

/**
 * The size of an idea card and the gap between cards, in CSS pixels: the gallery's card (D7 of
 * the plan after 1.5.8), its 240 by 150 picture box with the words and actions under it.
 */
export const IDEA_CARD_WIDTH = STORE_CARD_WIDTH;
export const IDEA_CARD_HEIGHT = STORE_CARD_HEIGHT;
export const IDEA_GAP = STORE_CARD_GAP;
/**
 * A row's height: a card and the gap under it, rounded to whole pixels so every row of the grid
 * (and its pictures) starts on a whole pixel.
 */
export const IDEA_ROW = Math.round(IDEA_CARD_HEIGHT + IDEA_GAP);
/** How far past the view cards are kept made (above and below), in CSS pixels. */
export const IDEA_OVERSCAN = 600;
/** Rows the list starts with. */
export const IDEA_FIRST_ROWS = 3;
/** Rows kept ready below the last one near the view, so more keep coming. */
export const IDEA_ROWS_AHEAD = 2;

/** Where the list is: its top against the top of the view, the view's height, its width. */
export interface IdeasView {
  /** The list's top minus the view's top (negative once scrolled past it). */
  readonly top: number;
  readonly height: number;
  readonly width: number;
}

/** The window of the grid. */
export interface IdeasWindow {
  readonly columns: number;
  /** The first and last row (inclusive) whose cards are mounted; `last < first` for none. */
  readonly first: number;
  readonly last: number;
  /** How many rows the list has (it only grows). */
  readonly rows: number;
}

/** The cards in a row for a list `width` pixels wide (at least one). */
export function ideaColumns(width: number): number {
  return Math.max(1, Math.floor((width + IDEA_GAP) / (IDEA_CARD_WIDTH + IDEA_GAP)));
}

/**
 * The window for `view` when the list has `rows` rows: the rows within {@link IDEA_OVERSCAN}
 * of the view are mounted, and the list grows to {@link IDEA_ROWS_AHEAD} rows past the last
 * of them (never shrinks).
 */
export function ideasWindow(view: IdeasView, rows: number): IdeasWindow {
  const columns = ideaColumns(view.width);
  const from = -view.top - IDEA_OVERSCAN;
  const to = -view.top + view.height + IDEA_OVERSCAN;
  const near = Math.floor(to / IDEA_ROW);
  const grown = Math.max(rows, IDEA_FIRST_ROWS, near + 1 + IDEA_ROWS_AHEAD);
  const first = Math.max(0, Math.floor(from / IDEA_ROW));
  const last = Math.min(grown - 1, near);
  return { columns, first, last, rows: grown };
}

/** Cards the **More ideas** row starts with (ADR 0129 D5, layout A). */
export const IDEA_ROW_FIRST = 8;
/** Cards kept ready past the last one near the row's view, so more keep coming. */
export const IDEA_ROW_AHEAD = 4;
/** A row card's step sideways: a card and the gap after it. */
export const IDEA_STEP = IDEA_CARD_WIDTH + IDEA_GAP;

/** Where the row is scrolled: its scroll from the left and its visible width. */
export interface IdeasRowView {
  readonly left: number;
  readonly width: number;
}

/** The window of the row: the first and last card mounted and how many cards it has. */
export interface IdeasRowWindow {
  readonly first: number;
  /** `last < first` for none. */
  readonly last: number;
  /** How many cards the row has (it only grows). */
  readonly count: number;
}

/**
 * The window of the **More ideas** row for `view` when it has `count` cards: the cards within
 * {@link IDEA_OVERSCAN} of the view sideways are mounted, and the row grows to
 * {@link IDEA_ROW_AHEAD} cards past the last of them (never shrinks). Pure.
 */
export function ideasRowWindow(view: IdeasRowView, count: number): IdeasRowWindow {
  const from = view.left - IDEA_OVERSCAN;
  const to = view.left + view.width + IDEA_OVERSCAN;
  const near = Math.max(0, Math.floor(to / IDEA_STEP));
  const grown = Math.max(count, IDEA_ROW_FIRST, near + 1 + IDEA_ROW_AHEAD);
  const first = Math.max(0, Math.floor(from / IDEA_STEP));
  const last = Math.min(grown - 1, near);
  return { first, last, count: grown };
}
