/**
 * The outline check per slot (2026-11-22, after MSM's leggings drawing let a round blob pass):
 * for every armour piece, tool, bow, ingot and gem a round blob and a plain oval in the
 * drawing's own box fail the shape check, while MSM's drawing of the slot in another colour,
 * seed and place passes. The leggings drawing has a real gap between the legs.
 */
import { artPixels } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import {
  boxOval,
  checkPicture,
  fittedMask,
  MIN_MARKS_KEPT,
  shapeMatch,
} from '../../src/renderer/src/components/ai-pictures/checks';
import { AI_SLOTS } from '../../src/renderer/src/components/ai-pictures/prompt';
import type { RgbaImage } from '../../src/renderer/src/components/texture-editor/pixels';

const GOLD = [230, 180, 40] as const;

function drawing(recipe: string, colour: readonly [number, number, number], seed = 0): RgbaImage {
  const pixels = artPixels({
    recipe: recipe as never,
    colour: [...colour] as [number, number, number],
    seed,
  });
  return {
    width: pixels.width,
    height: pixels.height,
    data: new Uint8ClampedArray(pixels.data.subarray(0, pixels.width * pixels.height * 4)),
  };
}

/** A filled round blob of `colour`, 16 by 16, like the onion the user got. */
function blob(colour: readonly [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if ((x - 7.5) ** 2 + ((y - 8.5) * 1.3) ** 2 < 30)
        data.set([...colour, 255], (y * 16 + x) * 4);
    }
  }
  return { width: 16, height: 16, data };
}

/** A 16 by 16 picture of `mask` (a 16 by 16 grid) in `colour`. */
function ofMask(mask: readonly boolean[], colour: readonly [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  mask.forEach((on, at) => {
    if (on) data.set([...colour, 255], at * 4);
  });
  return { width: 16, height: 16, data };
}

/** `image` moved by (dx, dy) on a 32 by 32 canvas (the check crops and fits, so place is free). */
function moved(image: RgbaImage, dx: number, dy: number): RgbaImage {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const from = (y * image.width + x) * 4;
      data.set(image.data.subarray(from, from + 4), ((y + dy) * 32 + x + dx) * 4);
    }
  }
  return { width: 32, height: 32, data };
}

const SLOTS = [
  'helmet',
  'chestplate',
  'leggings',
  'boots',
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'bow',
  'ingot',
  'gem',
] as const;

describe('the outline check per slot', () => {
  it('covers the slots the brief names, each with its recipe', () => {
    for (const id of SLOTS) {
      expect(AI_SLOTS.find((slot) => slot.id === id)?.recipe, id).toBe(id);
    }
  });

  for (const id of SLOTS) {
    describe(id, () => {
      const reference = drawing(id, GOLD);

      it('a round blob fails', () => {
        const check = checkPicture(blob(GOLD), { reference, colour: GOLD });
        expect(check.ok).toBe(false);
        expect(check.failures).toEqual(['shape']);
      });

      it('a plain oval in the drawing’s own box fails', () => {
        const oval = ofMask(boxOval(fittedMask(reference)), GOLD);
        const check = checkPicture(oval, { reference, colour: GOLD });
        expect(check.failures).toEqual(['shape']);
        expect(check.marks).toBeLessThan(MIN_MARKS_KEPT);
      });

      it('MSM’s drawing passes, in another colour and seed and moved', () => {
        const own = moved(drawing(id, [240, 196, 60], 5), 7, 3);
        const check = checkPicture(own, { reference, colour: GOLD });
        expect(check.ok).toBe(true);
        expect(check.overlap).toBeGreaterThan(0.95);
        expect(check.marks).toBeGreaterThan(0.95);
      });
    });
  }

  it('the round blob shares few of every slot’s marks', () => {
    for (const id of SLOTS) {
      const match = shapeMatch(blob(GOLD), drawing(id, GOLD));
      expect(match.marks, id).not.toBeNull();
      expect(match.marks ?? 1, id).toBeLessThan(MIN_MARKS_KEPT);
    }
  });

  it('the leggings drawing has a gap between the legs a blob fills', () => {
    const reference = drawing('leggings', GOLD);
    const match = shapeMatch(blob(GOLD), reference);
    expect(match.gaps).not.toBeNull();
    expect(match.gaps ?? 1).toBeLessThan(0.5);
    expect(shapeMatch(reference, reference).gaps).toBe(1);
    // Rows 7 to 11 of the drawing are clear between the legs.
    for (let y = 7; y <= 11; y += 1) {
      for (const x of [7, 8]) {
        expect(reference.data[(y * 16 + x) * 4 + 3], `${x},${y}`).toBe(0);
      }
    }
  });
});
