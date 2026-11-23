/**
 * MSM's own test picture for shaders and post effects (ADR 0121 D8; B629): a still frame drawn
 * here from plain numbers, not a frame of Try it (reading one back would need its canvas kept
 * after drawing and a session open; this picture is the same in every run). A sky gradient, a
 * sun, a row of coloured blocks on grass, a black-and-white strip and a grey ramp, so a tint, a
 * blur, an inversion or an outline each show.
 */

/** A picture as RGBA bytes, rows from the top. */
export interface RgbaPicture {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** The test picture's size: a 16 by 9 frame small enough for one run under SwiftShader. */
export const TEST_PICTURE_WIDTH = 384;
export const TEST_PICTURE_HEIGHT = 216;

const BLOCK_HUES: readonly (readonly [number, number, number])[] = [
  [200, 60, 50],
  [225, 140, 40],
  [230, 205, 60],
  [80, 170, 70],
  [60, 160, 190],
  [70, 90, 200],
  [150, 80, 190],
  [215, 110, 170],
];

/** Draws the test picture at `width` by `height`. */
export function testPicture(width = TEST_PICTURE_WIDTH, height = TEST_PICTURE_HEIGHT): RgbaPicture {
  const data = new Uint8ClampedArray(width * height * 4);
  const horizon = Math.round(height * 0.62);
  const sunX = width * 0.8;
  const sunY = height * 0.2;
  const sunR = height * 0.09;
  const block = Math.max(4, Math.round(width / 12));
  const blockTop = horizon - block;
  const stripTop = height - Math.max(4, Math.round(height / 9));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r: number;
      let g: number;
      let b: number;
      if (y < horizon) {
        const t = y / horizon;
        r = 110 + 90 * t;
        g = 155 + 70 * t;
        b = 255 - 10 * t;
        if ((x - sunX) ** 2 + (y - sunY) ** 2 <= sunR * sunR) [r, g, b] = [255, 245, 200];
        const column = Math.floor((x - block / 2) / (block * 1.4));
        const inColumn = (x - block / 2) % (block * 1.4);
        if (y >= blockTop && column >= 0 && column < BLOCK_HUES.length && inColumn < block) {
          const hue = BLOCK_HUES[column] as readonly [number, number, number];
          const edge = inColumn < 1 || inColumn >= block - 1 || y === blockTop || y === horizon - 1;
          [r, g, b] = edge ? [hue[0] * 0.5, hue[1] * 0.5, hue[2] * 0.5] : hue;
        }
      } else if (y < stripTop) {
        const grass = y < horizon + Math.max(2, Math.round(height / 40));
        const speck = ((x * 7 + y * 13) % 11 === 0 ? 1 : 0) * 18;
        [r, g, b] = grass ? [95 + speck, 160 + speck, 60] : [125 + speck, 90 + speck, 60 + speck];
      } else if (x < width / 2) {
        const cell = Math.floor(x / 8) + Math.floor((y - stripTop) / 8);
        const on = cell % 2 === 0 ? 255 : 0;
        [r, g, b] = [on, on, on];
      } else {
        const grey = Math.round(((x - width / 2) / (width / 2)) * 255);
        [r, g, b] = [grey, grey, grey];
      }
      const at = (y * width + x) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = 255;
    }
  }
  return { width, height, data };
}

/** The share of sampled pixels that differ between two pictures of one size (0 to 1). */
export function pictureDifference(a: RgbaPicture, b: RgbaPicture): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0;
  let total = 0;
  for (let at = 0; at < a.data.length; at += 4 * 7) {
    total += 1;
    const delta =
      Math.abs((a.data[at] ?? 0) - (b.data[at] ?? 0)) +
      Math.abs((a.data[at + 1] ?? 0) - (b.data[at + 1] ?? 0)) +
      Math.abs((a.data[at + 2] ?? 0) - (b.data[at + 2] ?? 0));
    if (delta > 6) changed += 1;
  }
  return total === 0 ? 0 : changed / total;
}
