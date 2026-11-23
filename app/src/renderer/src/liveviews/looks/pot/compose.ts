/**
 * A decorated pot's picture for B623's pot shape (`POT_ATLAS`): the pattern on each side asked
 * for (16 by 16 each, in the top row), the plain side picture on the others, and a clay strip
 * below (rows 16 to 32) for the top, the bottom, the neck and the lip, tiled from the plain side.
 * The plain side is the user's own jar's `entity/decorated_pot/decorated_pot_side.png`; without
 * it MSM paints its own clay.
 */

import {
  blankPixels,
  drawOver,
  fillRect,
  type Pixels,
  scalePixels,
  setPixel,
} from '../banner/pixels';
import { POT_ATLAS } from '../bodies/shapes';

/** A pot's sides. */
export type PotSide = keyof typeof POT_ATLAS.sides;
export const POT_SIDES: readonly PotSide[] = ['north', 'east', 'south', 'west'];

/** A pot face is 16 by 16. */
const FACE = 16;

/** MSM's own clay, two shades in a checker so the stand-in does not look flat. */
const CLAY: readonly [number, number, number, number] = [156, 88, 62, 255];
const CLAY_DARK: readonly [number, number, number, number] = [143, 80, 56, 255];

/** MSM's stand-in plain side: clay with a darker rim. */
export function standInSide(): Pixels {
  const side = blankPixels(FACE, FACE);
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const rim = x === 0 || y === 0 || x === FACE - 1 || y === FACE - 1;
      setPixel(side, x, y, rim || (x + y) % 5 === 0 ? CLAY_DARK : CLAY);
    }
  }
  return side;
}

const atFace = (picture: Pixels): Pixels =>
  picture.width === FACE && picture.height === FACE ? picture : scalePixels(picture, FACE, FACE);

/**
 * The 64 by 32 pot picture: `pattern` on the `patterned` sides, `plain` (or MSM's clay) on the
 * rest and tiled along the clay strip.
 */
export function composePotPicture(
  pattern: Pixels | null,
  plain: Pixels | null,
  patterned: ReadonlySet<PotSide>,
): Pixels {
  const picture = blankPixels(POT_ATLAS.width, POT_ATLAS.height);
  const side = atFace(plain ?? standInSide());
  fillRect(picture, POT_ATLAS.clay, CLAY);
  for (let dx = 0; dx < POT_ATLAS.width; dx += FACE) {
    drawOver(picture, side, { dx, dy: POT_ATLAS.clay[1] });
  }
  for (const name of POT_SIDES) {
    const [u, v] = POT_ATLAS.sides[name];
    const face = patterned.has(name) && pattern !== null ? atFace(pattern) : side;
    fillRect(picture, [u, v, FACE, FACE], CLAY);
    drawOver(picture, face, { dx: u, dy: v });
  }
  return picture;
}
