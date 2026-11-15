/**
 * Sign text (B463, ADR 0101 D5 "sign text as a mock-up"): the words written on each sign and
 * hanging sign in the area, front and back, with the dye colour, glowing ink and wax the game
 * keeps beside them (B446). The game keeps them in the sign's block entity and draws them on the
 * board; the preview keeps them here, and the view shows them as a mock-up plaque.
 */
import type { BlockPos } from '../../types.js';
import type { SignSide } from './use.js';

/** Lines on one side of a sign, as the game's edit screen has them. */
export const SIGN_LINES = 4;
/** The most characters a line holds in the preview (the game measures the drawn width). */
export const SIGN_LINE_LENGTH = 90;

/** One side's text. */
export interface SignFace {
  readonly lines: readonly string[];
  /** A dye colour name (`black` by default). */
  readonly colour: string;
  /** Glowing ink (a glow ink sac in the game). */
  readonly glowing: boolean;
}

/** A sign's text, both sides, and whether it is waxed. */
export interface SignText {
  readonly front: SignFace;
  readonly back: SignFace;
  readonly waxed: boolean;
}

const EMPTY_FACE: SignFace = Object.freeze({
  lines: Object.freeze(['', '', '', '']),
  colour: 'black',
  glowing: false,
});

/** A sign with nothing written on it. */
export const EMPTY_SIGN: SignText = Object.freeze({
  front: EMPTY_FACE,
  back: EMPTY_FACE,
  waxed: false,
});

const keyOf = (pos: BlockPos): string => `${pos.x},${pos.y},${pos.z}`;

/** Four lines, each cut to {@link SIGN_LINE_LENGTH}, without line breaks. */
export function cleanLines(lines: readonly string[]): readonly string[] {
  return Object.freeze(
    Array.from({ length: SIGN_LINES }, (_, i) =>
      (lines[i] ?? '').replace(/[\r\n]+/g, ' ').slice(0, SIGN_LINE_LENGTH),
    ),
  );
}

/** What a change to one side of a sign sets. */
export interface SignEdit {
  readonly lines?: readonly string[];
  readonly colour?: string;
  readonly glowing?: boolean;
}

/** The text of every sign in the area, by position. */
export class SignBoard {
  private readonly texts = new Map<string, SignText>();

  /** The text of the sign at `pos` (an empty sign when nothing was written). */
  get(pos: BlockPos): SignText {
    return this.texts.get(keyOf(pos)) ?? EMPTY_SIGN;
  }

  /** Whether anything is kept for `pos`. */
  has(pos: BlockPos): boolean {
    return this.texts.has(keyOf(pos));
  }

  /** Changes one side of the sign at `pos`; a waxed sign stays as it is. Returns the text. */
  edit(pos: BlockPos, side: SignSide, edit: SignEdit): SignText {
    const now = this.get(pos);
    if (now.waxed) return now;
    const face = now[side];
    const next: SignFace = Object.freeze({
      lines: edit.lines === undefined ? face.lines : cleanLines(edit.lines),
      colour: edit.colour ?? face.colour,
      glowing: edit.glowing ?? face.glowing,
    });
    const text = Object.freeze({ ...now, [side]: next });
    this.texts.set(keyOf(pos), text);
    return text;
  }

  /** Waxes the sign at `pos` (honeycomb in the game): its text can no longer change. */
  wax(pos: BlockPos): SignText {
    const text = Object.freeze({ ...this.get(pos), waxed: true });
    this.texts.set(keyOf(pos), text);
    return text;
  }

  /** Forgets the text at `pos` (the sign was broken). */
  remove(pos: BlockPos): void {
    this.texts.delete(keyOf(pos));
  }

  /** Forgets every sign ("Clear the area"). */
  clear(): void {
    this.texts.clear();
  }

  /** Every sign with text, by position key. */
  entries(): IterableIterator<[string, SignText]> {
    return this.texts.entries();
  }
}

/** The words of one side, joined with " / " for the log; empty lines left out. */
export function signWords(face: SignFace): string {
  return face.lines.filter((line) => line.trim() !== '').join(' / ');
}
