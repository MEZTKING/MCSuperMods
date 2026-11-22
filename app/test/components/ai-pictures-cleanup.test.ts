import { minecraftArt } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import {
  cleanUpPicture,
  countColours,
  downscale,
  fromHsl,
  looksLikePixelArt,
  quantise,
  toHsl,
} from '../../src/renderer/src/components/ai-pictures/cleanup';
import type { RgbaImage } from '../../src/renderer/src/components/texture-editor/pixels';

/**
 * A photo-like picture: a smoothly shaded red ball (lighter at its top left, every pixel a
 * slightly different colour) on a slightly noisy pale grey background, 256 by 256.
 */
function photoOfBall(size = 256): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = (y * size + x) * 4;
      const dx = x - size / 2;
      const dy = y - size * 0.55;
      if (dx * dx + dy * dy < (size * 0.3) ** 2) {
        // Light from the top left: brighter towards (0, 0).
        const light = 0.2 + 0.55 * (1 - (x + y) / (2 * size)) + ((x * 31 + y * 17) % 7) / 400;
        const [r, g, b] = fromHsl(355 + ((x + y) % 11), 0.75, light);
        data.set([r, g, b, 255], at);
      } else {
        const noise = (x * 13 + y * 7) % 5;
        data.set([228 + noise, 230 + noise, 232 + noise, 255], at);
      }
    }
  }
  return { width: size, height: size, data };
}

function alphaAt(image: RgbaImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3] ?? 0;
}

function lightAt(image: RgbaImage, x: number, y: number): number {
  const at = (y * image.width + x) * 4;
  return toHsl(image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0)[2];
}

describe('AI picture clean-up', () => {
  it('turns a photo-like object into a 16 by 16 icon with transparency and few colours', () => {
    const icon = cleanUpPicture(photoOfBall(), { size: 16, style: 'item', outline: false });
    expect(icon.width).toBe(16);
    expect(icon.height).toBe(16);
    // The corners were background and are clear now; the middle is solid.
    expect(alphaAt(icon, 0, 0)).toBe(0);
    expect(alphaAt(icon, 15, 15)).toBe(0);
    expect(alphaAt(icon, 8, 8)).toBe(255);
    // Every pixel is fully clear or fully solid.
    for (let at = 3; at < icon.data.length; at += 4) expect([0, 255]).toContain(icon.data[at]);
    expect(countColours(icon)).toBeLessThanOrEqual(6);
    expect(countColours(icon)).toBeGreaterThan(2);
  });

  it('honours the number of shades', () => {
    const icon = cleanUpPicture(photoOfBall(), {
      size: 16,
      style: 'item',
      shades: 4,
      outline: false,
    });
    expect(countColours(icon)).toBeLessThanOrEqual(4);
  });

  it('crops to the content and fills the texture, keeping the proportions', () => {
    const icon = cleanUpPicture(photoOfBall(), { size: 16, style: 'item', outline: false });
    let top = 16;
    let bottom = -1;
    let left = 16;
    let right = -1;
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (alphaAt(icon, x, y) === 0) continue;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    // The ball fills the icon edge to edge, and stays round (as wide as it is tall).
    expect(bottom - top).toBeGreaterThanOrEqual(14);
    expect(Math.abs(right - left - (bottom - top))).toBeLessThanOrEqual(1);
  });

  it('adds a one-pixel dark outline outside the shape', () => {
    const plain = cleanUpPicture(photoOfBall(), { size: 16, style: 'item', outline: false });
    const outlined = cleanUpPicture(photoOfBall(), { size: 16, style: 'item' });
    // Fitted one pixel short of each edge, then outlined.
    const solid = (image: RgbaImage) => {
      let count = 0;
      for (let at = 3; at < image.data.length; at += 4) if (image.data[at] === 255) count += 1;
      return count;
    };
    expect(solid(outlined)).toBeGreaterThan(0);
    expect(alphaAt(outlined, 0, 0)).toBe(0);
    // The outline is darker than anything in the shape.
    let darkestInside = 1;
    let outlineLight = 1;
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (alphaAt(outlined, x, y) === 0) continue;
        const clear = (cx: number, cy: number) =>
          cx < 0 || cy < 0 || cx > 15 || cy > 15 || alphaAt(outlined, cx, cy) === 0;
        const edge = clear(x - 1, y) || clear(x + 1, y) || clear(x, y - 1) || clear(x, y + 1);
        if (edge) outlineLight = Math.min(outlineLight, lightAt(outlined, x, y));
        else darkestInside = Math.min(darkestInside, lightAt(outlined, x, y));
      }
    }
    expect(outlineLight).toBeLessThan(darkestInside);
    expect(countColours(outlined)).toBeLessThanOrEqual(countColours(plain) + 1);
  });

  it('keeps the light from the top left (never inverts the shading)', () => {
    const icon = cleanUpPicture(photoOfBall(), { size: 16, style: 'item', outline: false });
    // Compare the shape's top-left quarter with its bottom-right quarter.
    let topLeft = 0;
    let topLeftCount = 0;
    let bottomRight = 0;
    let bottomRightCount = 0;
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (alphaAt(icon, x, y) === 0) continue;
        if (x + y < 12) {
          topLeft += lightAt(icon, x, y);
          topLeftCount += 1;
        } else if (x + y > 18) {
          bottomRight += lightAt(icon, x, y);
          bottomRightCount += 1;
        }
      }
    }
    expect(topLeft / topLeftCount).toBeGreaterThan(bottomRight / bottomRightCount + 0.1);
  });

  it('quantises monotonically: a lighter source pixel never comes out darker', () => {
    const width = 64;
    const data = new Uint8ClampedArray(width * 4);
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fromHsl(120, 0.6, 0.1 + (0.8 * x) / width);
      data.set([r, g, b, 255], x * 4);
    }
    const image = { width, height: 1, data };
    const ramps = quantise(image, 6);
    expect(ramps).toHaveLength(1);
    expect(ramps[0]?.colours).toHaveLength(6);
    for (let x = 1; x < width; x += 1) {
      expect(lightAt(image, x, 0)).toBeGreaterThanOrEqual(lightAt(image, x - 1, 0));
    }
    // The ramp turns towards blue in the dark and towards yellow in the light.
    const dark = ramps[0]?.colours[0] ?? [0, 0, 0, 255];
    const light = ramps[0]?.colours[5] ?? [0, 0, 0, 255];
    const [darkHue] = toHsl(dark[0], dark[1], dark[2]);
    const [lightHue] = toHsl(light[0], light[1], light[2]);
    expect(darkHue).toBeGreaterThan(120);
    expect(lightHue).toBeLessThan(120);
  });

  it("quantises to the drawn art's ramps (ADR 0092 D15), keeping the rank order", () => {
    for (const hue of [10, 120, 210, 300]) {
      const width = 60;
      const data = new Uint8ClampedArray(width * 4);
      for (let x = 0; x < width; x += 1) {
        const [r, g, b] = fromHsl(hue, 0.6, 0.15 + (0.7 * x) / width);
        data.set([r, g, b, 255], x * 4);
      }
      const image = { width, height: 1, data };
      const [ramp] = quantise(image, 6);
      const colours = (ramp?.colours ?? []).map(
        ([r, g, b]) => [r, g, b] as [number, number, number],
      );
      expect(colours).toHaveLength(6);
      // The same ramp the drawn art makes of its anchor shade (the third of six).
      const drawn = minecraftArt.generateRamp(colours[2] ?? [0, 0, 0], {
        count: 6,
        anchor: 2,
        hueShift: minecraftArt.ART_HUE_SHIFT,
      });
      colours.forEach((colour, index) => {
        for (let channel = 0; channel < 3; channel += 1) {
          expect(
            Math.abs((colour[channel] ?? 0) - (drawn[index]?.[channel] ?? 0)),
          ).toBeLessThanOrEqual(2);
        }
      });
      // Darker ranks take darker shades (OKLab lightness), never the other way round.
      const lightness = colours.map((colour) => minecraftArt.rgbToOklch(colour)[0]);
      for (let index = 1; index < lightness.length; index += 1) {
        expect(lightness[index]).toBeGreaterThan(lightness[index - 1] ?? 1);
      }
      for (let x = 1; x < width; x += 1) {
        const at = (x: number) =>
          minecraftArt.rgbToOklch([
            data[x * 4] ?? 0,
            data[x * 4 + 1] ?? 0,
            data[x * 4 + 2] ?? 0,
          ])[0];
        expect(at(x)).toBeGreaterThanOrEqual(at(x - 1));
      }
    }
  });

  it('caps a ramp at eight shades, as the drawn art does', () => {
    const width = 80;
    const data = new Uint8ClampedArray(width * 4);
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fromHsl(200, 0.6, 0.1 + (0.8 * x) / width);
      data.set([r, g, b, 255], x * 4);
    }
    const ramps = quantise({ width, height: 1, data }, 12);
    expect(ramps[0]?.colours).toHaveLength(8);
  });

  it('keeps two hues apart, each with its own ramp', () => {
    const width = 40;
    const data = new Uint8ClampedArray(width * 4);
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fromHsl(x < 20 ? 30 : 210, 0.7, 0.2 + ((x % 20) / 20) * 0.6);
      data.set([r, g, b, 255], x * 4);
    }
    const image = { width, height: 1, data };
    expect(quantise(image, 6)).toHaveLength(2);
    expect(countColours(image)).toBeLessThanOrEqual(12);
  });

  it('makes an opaque block texture from the centre square', () => {
    const wide: RgbaImage = { width: 300, height: 200, data: new Uint8ClampedArray(300 * 200 * 4) };
    for (let at = 0; at < wide.data.length; at += 4) {
      const pixel = at / 4;
      wide.data.set([90 + (pixel % 37), 90 + (pixel % 23), 100, (pixel % 3) * 100], at);
    }
    const block = cleanUpPicture(wide, { size: 32, style: 'block' });
    expect(block.width).toBe(32);
    for (let at = 3; at < block.data.length; at += 4) expect(block.data[at]).toBe(255);
    expect(countColours(block)).toBeLessThanOrEqual(6 * 4);
  });

  it('scales pixel art by the commonest colour, not by blending', () => {
    // A 4x upscaled two-colour checkerboard stays two colours.
    const size = 64;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dark = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
        data.set(dark ? [40, 40, 40, 255] : [200, 200, 200, 255], (y * size + x) * 4);
      }
    }
    const image = { width: size, height: size, data };
    expect(looksLikePixelArt(image)).toBe(true);
    const small = downscale(image, 16, 16);
    expect(countColours(small)).toBe(2);
    expect(countColours(downscale(image, 16, 16, 'area'))).toBe(2);
  });

  it('returns a clear texture when nothing is left', () => {
    const white: RgbaImage = {
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(8 * 8 * 4).fill(255),
    };
    const icon = cleanUpPicture(white, { size: 16, style: 'tool' });
    expect(countColours(icon)).toBe(0);
  });
});
