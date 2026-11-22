/**
 * A fake AI pictures platform for renderer tests (ADR 0093): no main, no network. With a
 * reference it answers as img2img would (MSM's drawing back, four times larger); without one,
 * shaded balls on white; `next` replaces the answer (a failure, `hang`, or fixed pictures). It
 * prices every round at Retro Diffusion's RD Plus $0.06 a picture.
 */
import { vi } from 'vitest';
import type {
  AiPicturesHost,
  PictureCodec,
} from '../../src/renderer/src/components/ai-pictures/ai-pictures-host';
import { fromHsl } from '../../src/renderer/src/components/ai-pictures/cleanup';
import type { RgbaImage } from '../../src/renderer/src/components/texture-editor/pixels';
import type {
  AiPictureCostRequest,
  AiPictureRaster,
  AiPictureRequest,
  AiPictureResult,
  AiPicturesPlatform,
  AiPicturesStatus,
} from '../../src/shared/ai-pictures';

/** A codec without a canvas: 8 bytes of size, then the RGBA bytes. */
export const testCodec: PictureCodec = {
  async decode(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(0);
    const height = view.getUint32(4);
    return { width, height, data: new Uint8ClampedArray(bytes.slice(8)) };
  },
  encode(image) {
    const out = new Uint8Array(8 + image.data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, image.width);
    view.setUint32(4, image.height);
    out.set(image.data, 8);
    return out;
  },
};

/** A photo-like ball of `hue` on white, 64 by 64, in the test codec. */
export function ball(hue: number): Uint8Array {
  const size = 64;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inside = (x - 32) ** 2 + (y - 32) ** 2 < 24 ** 2;
      const [r, g, b] = fromHsl(hue, 0.7, 0.25 + 0.5 * (1 - (x + y) / 128));
      data.set(inside ? [r, g, b, 255] : [255, 255, 255, 255], (y * size + x) * 4);
    }
  }
  return testCodec.encode({ width: size, height: size, data });
}

/** An RGB raster scaled up `scale` times, opaque, in the test codec. */
export function fromRaster(raster: AiPictureRaster, scale: number): Uint8Array {
  const width = raster.width * scale;
  const height = raster.height * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (Math.floor(y / scale) * raster.width + Math.floor(x / scale)) * 3;
      data.set(
        [raster.rgb[from] ?? 0, raster.rgb[from + 1] ?? 0, raster.rgb[from + 2] ?? 0, 255],
        (y * width + x) * 4,
      );
    }
  }
  return testCodec.encode({ width, height, data });
}

/** `image` in the test codec. */
export function encoded(image: RgbaImage): Uint8Array {
  return testCodec.encode(image);
}

export const READY: AiPicturesStatus = {
  service: 'retro-diffusion',
  keys: { 'retro-diffusion': { set: true, tail: 'wxyz' }, openai: { set: false, tail: null } },
  encryptionAvailable: true,
};

export interface FakePictures extends AiPicturesPlatform {
  requests: AiPictureRequest[];
  costs: AiPictureCostRequest[];
  /** A fixed answer, or `null` for the default (img2img echo or balls). */
  next: AiPictureResult | null;
}

export function fakePictures(status: AiPicturesStatus = READY): FakePictures {
  const fake: FakePictures = {
    requests: [],
    costs: [],
    next: null,
    status: async () => structuredClone(status),
    setService: async () => {},
    setKey: async () => {},
    clearKey: async () => {},
    testKey: async () => ({ ok: true }),
    generate: async (request) => {
      fake.requests.push(request);
      if (fake.next !== null) return fake.next;
      const reference = request.reference;
      return {
        ok: true,
        images: Array.from({ length: request.count }, (_, index) =>
          reference === undefined ? ball(index * 80) : fromRaster(reference, 4),
        ),
      };
    },
    cost: async (request) => {
      fake.costs.push(request);
      return { ok: true, usd: Math.round(6 * request.count) / 100, balanceUsd: 9.76 };
    },
    cancel: async () => {},
  };
  return fake;
}

export function fakeHost(platform: AiPicturesPlatform, status: AiPicturesStatus | null = READY) {
  const host: AiPicturesHost = {
    platform,
    status,
    refresh: vi.fn(),
    openSettings: vi.fn(),
    codec: testCodec,
  };
  return host;
}
