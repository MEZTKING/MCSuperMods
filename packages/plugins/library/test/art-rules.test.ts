/**
 * The pixel rules of ADR 0092 D13 (a), each proved both ways on small hand-made pictures: a
 * picture that follows the rule passes and one that breaks it is caught. Every picture is made
 * in code here; none comes from a Minecraft texture.
 */
import { describe, expect, it } from 'vitest';
import { oklchToRgb } from '../src/art/colour';
import { generateRamp } from '../src/art/ramp';
import {
  ALPHA_LEVELS,
  type ArtRecipeInfo,
  COLOUR_CAPS,
  checkArtRules,
  type Rgb,
} from '../src/index';

type Info = Pick<
  ArtRecipeInfo,
  'id' | 'kind' | 'width' | 'height' | 'frames' | 'tiles' | 'outline'
>;

const ITEM: Info = {
  id: 'gem',
  kind: 'item',
  width: 16,
  height: 16,
  frames: 1,
  tiles: false,
  outline: true,
};
const BLOCK: Info = {
  id: 'plain',
  kind: 'block',
  width: 16,
  height: 16,
  frames: 1,
  tiles: false,
  outline: false,
};
const TILE: Info = { ...BLOCK, tiles: true };
const PARTICLE: Info = {
  id: 'particle_orb',
  kind: 'particle',
  width: 8,
  height: 8,
  frames: 4,
  tiles: false,
  outline: false,
};

type Pixel = Rgb | readonly [number, number, number, number] | null;

/** A `width` by `height` picture (times `frames`) painted by `paint`; null is transparent. */
function picture(
  width: number,
  height: number,
  paint: (x: number, y: number, frame: number) => Pixel,
  frames = 1,
): { width: number; height: number; frames: number; data: Uint8Array } {
  const data = new Uint8Array(width * height * 4 * frames);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = paint(x, y, frame);
        if (pixel === null) continue;
        data.set(
          [pixel[0], pixel[1], pixel[2], pixel[3] ?? 255],
          ((frame * height + y) * width + x) * 4,
        );
      }
    }
  }
  return { width, height, frames, data };
}

/** A red ramp, darkest first; 0 is the outline. */
const RED = generateRamp([196, 28, 52], { count: 6, anchor: 3 });
const shade = (index: number): Rgb => RED[Math.max(0, Math.min(5, index))] as Rgb;

/** An 8 by 8 item square (4 to 11) shaded from light (top left) to dark, with an outline. */
function square(options: { outline?: boolean; lightFrom?: 'top-left' | 'bottom-right' } = {}) {
  const outline = options.outline ?? true;
  const fromBottom = options.lightFrom === 'bottom-right';
  return picture(16, 16, (x, y) => {
    const inside = x >= 4 && x <= 11 && y >= 4 && y <= 11;
    const ring = x >= 3 && x <= 12 && y >= 3 && y <= 12;
    if (inside) {
      const t = (x - 4 + (y - 4)) / 14;
      return shade(1 + Math.round(4 * (fromBottom ? t : 1 - t)));
    }
    if (ring && outline) return shade(0);
    return null;
  });
}

const problems = (image: Parameters<typeof checkArtRules>[0], info: Info, rule: string) =>
  checkArtRules(image, info).filter((message) => message.startsWith(rule));

describe('checkArtRules (ADR 0092 D13 (a))', () => {
  it('passes a well-made item and a well-made block', () => {
    expect(checkArtRules(square(), ITEM)).toEqual([]);
    const bevel = picture(16, 16, (x, y) => {
      if (x === 0 || y === 0) return shade(5);
      if (x === 15 || y === 15) return shade(1);
      return shade(3);
    });
    expect(checkArtRules(bevel, BLOCK)).toEqual([]);
  });

  it('size: catches the wrong size, frame count or data length', () => {
    expect(problems(square(), { ...ITEM, width: 18, height: 18 }, 'size')).toHaveLength(1);
    expect(problems(square(), { ...ITEM, frames: 4 }, 'size')).toHaveLength(1);
    const short = { ...square(), data: new Uint8Array(10) };
    expect(problems(short, ITEM, 'size').length).toBeGreaterThan(0);
  });

  it('colours: allows the cap and catches one more', () => {
    const greys = (count: number) =>
      picture(16, 16, (x) => {
        const level = 60 + 10 * Math.min(count - 1, Math.floor((x * count) / 16));
        return [level, level, level + 2];
      });
    expect(COLOUR_CAPS.block).toBe(12);
    expect(problems(greys(12), BLOCK, 'colours')).toEqual([]);
    expect(problems(greys(13), BLOCK, 'colours')).toHaveLength(1);
    expect(COLOUR_CAPS.item).toBe(10);
  });

  it('alpha: hard on blocks and items, fixed levels on particles and the portal', () => {
    const glass = (alpha: number) => picture(16, 16, () => [120, 160, 200, alpha]);
    expect(problems(glass(255), BLOCK, 'alpha')).toEqual([]);
    expect(problems(glass(128), BLOCK, 'alpha')).toHaveLength(1);
    expect(problems(glass(170), { ...TILE, id: 'portal' }, 'alpha')).toEqual([]);
    expect(problems(glass(128), { ...TILE, id: 'portal' }, 'alpha')).toHaveLength(1);
    const glow = (alpha: number) =>
      picture(8, 8, (x, y) => (x > 1 && x < 6 && y > 1 && y < 6 ? [250, 200, 90, alpha] : null), 4);
    expect(ALPHA_LEVELS).toEqual([85, 170, 255]);
    expect(problems(glow(85), PARTICLE, 'alpha')).toEqual([]);
    expect(problems(glow(100), PARTICLE, 'alpha')).toHaveLength(4);
  });

  it('outline: items need a darker edge; enclosed outline pixels count as outline', () => {
    expect(problems(square({ outline: false }), ITEM, 'outline')).toHaveLength(1);
    // A flat shape in one colour: the inside is all edge colour.
    const flat = picture(16, 16, (x, y) =>
      x >= 4 && x <= 11 && y >= 4 && y <= 11 ? shade(0) : null,
    );
    expect(problems(flat, ITEM, 'outline')).toHaveLength(1);
    // Two legs whose outlines meet and close the gap between them.
    const legs = picture(16, 16, (x, y) => {
      if (y < 3 || y > 12 || x < 3 || x > 12) return null;
      if (y === 3 || y === 12 || x === 3 || x === 12 || x === 7 || x === 8) return shade(0);
      return shade(5 - Math.round((x + y) / 8));
    });
    expect(problems(legs, ITEM, 'outline')).toEqual([]);
  });

  it('outline: blocks must not have one, but a bevel or a bark ring is not one', () => {
    const framed = picture(16, 16, (x, y) =>
      x === 0 || y === 0 || x === 15 || y === 15 ? shade(0) : shade(2 + ((x + y) % 2)),
    );
    expect(problems(framed, BLOCK, 'outline')).toHaveLength(1);
    const ring = picture(16, 16, (x, y) =>
      x === 0 || y === 0 || x === 15 || y === 15 ? shade((x * 7 + y * 3) % 3) : shade(4),
    );
    expect(problems(ring, BLOCK, 'outline')).toEqual([]);
  });

  it('lightness: catches pure black and pure white', () => {
    const withPixel = (rgb: Rgb) => {
      const image = square();
      image.data.set([...rgb, 255], (7 * 16 + 7) * 4);
      return image;
    };
    expect(problems(withPixel([0, 0, 0]), ITEM, 'lightness')).toHaveLength(1);
    expect(problems(withPixel([255, 255, 255]), ITEM, 'lightness')).toHaveLength(1);
    expect(problems(withPixel([30, 30, 34]), ITEM, 'lightness')).toEqual([]);
  });

  it('light: catches an item lit from the bottom right, per material', () => {
    expect(problems(square({ lightFrom: 'bottom-right' }), ITEM, 'light')).toHaveLength(1);
    // A dark handle in the top-left half does not count against a pale head's light.
    const pale = generateRamp([236, 236, 240], { count: 6, anchor: 3 });
    const brown = generateRamp([128, 94, 52], { count: 4, anchor: 2 });
    const tool = picture(16, 16, (x, y) => {
      if (x < 2 || y < 2 || x > 13 || y > 13) return null;
      if (x === 2 || y === 2 || x === 13 || y === 13) return pale[0] as Rgb;
      if (x + y < 12) return brown[2 - ((x + y) % 2)] as Rgb;
      return pale[5 - Math.round(((x + y - 12) * 3) / 14)] as Rgb;
    });
    expect(problems(tool, ITEM, 'light')).toEqual([]);
  });

  it('light: lets a tiling face differ by noise but catches one lit from the bottom right', () => {
    const noise = picture(16, 16, (x, y) => shade(2 + ((x * 5 + y * 3) % 3)));
    expect(problems(noise, TILE, 'light')).toEqual([]);
    const backwards = picture(16, 16, (x, y) => shade(x + y < 15 ? 1 : 4));
    expect(problems(backwards, TILE, 'light')).toHaveLength(1);
  });

  it('ramp: catches a darker shade that is warmer than the lighter one', () => {
    const pair = (darkHue: number) =>
      picture(16, 16, (x) =>
        x < 8 ? oklchToRgb([0.72, 0.12, 240]) : oklchToRgb([0.5, 0.12, darkHue]),
      );
    expect(problems(pair(252), BLOCK, 'ramp')).toEqual([]);
    expect(problems(pair(228), BLOCK, 'ramp')).toHaveLength(1);
  });

  it('tiling: passes a face that wraps and catches one whose seam shows', () => {
    const wraps = picture(16, 16, (x, y) => shade(2 + (((x >> 1) + (y >> 1)) % 2)));
    expect(problems(wraps, TILE, 'tiling')).toEqual([]);
    const ramped = picture(16, 16, (x) => shade(5 - Math.floor(x / 4)));
    expect(problems(ramped, TILE, 'tiling')).toHaveLength(1);
    expect(problems(ramped, BLOCK, 'tiling')).toEqual([]);
  });
});
