/**
 * The sign text mock-up (B463): while the crosshair is on a sign with words on it, a plaque
 * over the picture shows the side the player looks at, in its dye colour (glowing ink drawn
 * brighter), with "Mock-up" beside it. The game draws the words on the board itself.
 *
 * Part of the lazy Try it chunk.
 */

import type { SignFace, SignSide, SignText } from '@msm/sim';
import { colourWords } from './SignEditor';

/** MSM's own picture colours for the sixteen dyes (plain sRGB, not the game's). */
const DYE_RGB: Readonly<Record<string, string>> = {
  black: '#1d1d21',
  white: '#f0f0f0',
  orange: '#e07b1f',
  magenta: '#c74ebd',
  light_blue: '#3ab3da',
  yellow: '#f5d33c',
  lime: '#80c71f',
  pink: '#f38baa',
  gray: '#4c5458',
  light_gray: '#9d9d97',
  cyan: '#169c9c',
  purple: '#8932b8',
  blue: '#3c44aa',
  brown: '#835432',
  green: '#5e7c16',
  red: '#b02e26',
};

/** Props of {@link SignPlaque}. */
export interface SignPlaqueProps {
  readonly name: string;
  readonly text: SignText;
  readonly side: SignSide;
}

const hasWords = (face: SignFace): boolean => face.lines.some((line) => line.trim() !== '');

/** The plaque; nothing when the side looked at is blank. */
export function SignPlaque({ name, text, side }: SignPlaqueProps) {
  const face = text[side];
  if (!hasWords(face)) return null;
  const colour = DYE_RGB[face.colour] ?? DYE_RGB.black;
  return (
    <figure
      data-testid="tryit-sign-plaque"
      data-side={side}
      aria-label={`${name}, ${side}: ${face.lines.filter((line) => line !== '').join(', ')}`}
      className="pointer-events-none absolute top-[38%] left-1/2 z-10 flex w-56 -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5 rounded border-2 border-[#6b4a2b] bg-[#c8a46e] px-2 py-1.5 font-mono text-sm shadow-md"
    >
      {face.lines.map((line, index) => (
        <span
          key={index}
          data-testid="tryit-sign-plaque-line"
          className="min-h-5 leading-5"
          style={{
            color: colour,
            textShadow: face.glowing ? `0 0 4px ${colour}, 0 0 1px #fff` : undefined,
          }}
        >
          {line}
        </span>
      ))}
      <figcaption className="rounded bg-black/40 px-1 text-[10px] text-white">
        Mock-up · {side === 'front' ? 'front' : 'back'} · {colourWords(face.colour)}
        {face.glowing ? ', glowing' : ''}
        {text.waxed ? ', waxed' : ''}
      </figcaption>
    </figure>
  );
}
