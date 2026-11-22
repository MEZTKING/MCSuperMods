/**
 * The fake image service of the e2e runs (`MSM_E2E_AI_PICTURES_FAKE=1`, ADR 0093 D8): no key,
 * no network. It draws `count` 64 by 64 PNGs: a shaded ball on a white background for items
 * and tools, a speckled square for blocks, each picture in another hue.
 *
 * @packageDocumentation
 */

import { encodePng, scaleRgb } from './png';
import type { PictureProvider } from './provider';

export { encodePng };

/** An RGB colour of `hue` (0 to 360) at `light` (0 to 1). */
function colourOf(hue: number, light: number): [number, number, number] {
  const k = (n: number) => (n + hue / 30) % 12;
  const a = 0.7 * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** One fake picture. */
export function fakePicture(index: number, block: boolean): Uint8Array {
  const size = 64;
  const hue = (index * 90 + 10) % 360;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = (y * size + x) * 4;
      if (block) {
        const speckle = ((x * 7 + y * 13) % 5) / 10;
        data.set([...colourOf(hue, 0.3 + speckle * 0.6), 255], at);
        continue;
      }
      const dx = x - 32;
      const dy = y - 32;
      const inside = dx * dx + dy * dy < 22 * 22;
      // Lighter towards the top left, as vanilla items are lit.
      const light = 0.25 + 0.5 * (1 - (x + y) / (2 * size));
      data.set(inside ? [...colourOf(hue, light), 255] : [255, 255, 255, 255], at);
    }
  }
  return encodePng(size, size, data);
}

export const fakeProvider: PictureProvider = {
  id: 'retro-diffusion',
  async generate(input) {
    const reference = input.reference;
    if (reference !== undefined) {
      // As img2img would: MSM's drawing, scaled up four times, the same for every picture.
      const size = 4;
      const rgb = scaleRgb(
        reference.rgb,
        reference.width,
        reference.height,
        reference.width * size,
        reference.height * size,
      );
      const rgba = new Uint8Array((rgb.length / 3) * 4);
      for (let at = 0, to = 0; at < rgb.length; at += 3, to += 4) {
        rgba.set([rgb[at] ?? 0, rgb[at + 1] ?? 0, rgb[at + 2] ?? 0, 255], to);
      }
      return Array.from({ length: input.count }, () =>
        encodePng(reference.width * size, reference.height * size, rgba),
      );
    }
    return Array.from({ length: input.count }, (_, index) =>
      fakePicture(
        index,
        input.style === 'block' || input.style === 'skin' || input.style === 'painting',
      ),
    );
  },
  async testKey() {
    return { ok: true };
  },
  async cost(input) {
    // Retro Diffusion's RD Plus price, so the e2e runs see a price as the real service shows.
    return { usd: Math.round(FAKE_PRICE_USD * input.count * 100) / 100, balanceUsd: 9.76 };
  },
};

/** The price a picture the fake service reports (RD Plus's $0.06). */
export const FAKE_PRICE_USD = 0.06;
