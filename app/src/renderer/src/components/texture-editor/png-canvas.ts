/**
 * Decoding and encoding pictures with an image element and a canvas (the texture editor and
 * Picture to texture, ADR 0047 D5 and ADR 0048).
 *
 * @packageDocumentation
 */

import type { RgbaImage } from './pixels';

/** The largest edge a decoded picture keeps; bigger pictures are scaled down on decode. */
export const MAX_DECODED_EDGE = 2048;

/** The image type of `bytes` from its signature (PNG when unknown; browsers sniff anyway). */
export function imageMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return 'image/webp';
  }
  return 'image/png';
}

/** A `data:` URL of picture bytes. */
export function imageDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${imageMimeType(bytes)};base64,${btoa(binary)}`;
}

/**
 * Decodes picture bytes (PNG, JPEG, GIF, BMP or WebP) into RGBA pixels; pictures larger than
 * `maxEdge` are scaled down to fit.
 *
 * @throws Error When the bytes are not a picture.
 */
export async function decodePicture(
  bytes: Uint8Array,
  maxEdge = Number.POSITIVE_INFINITY,
): Promise<RgbaImage> {
  const image = new Image();
  image.src = imageDataUrl(bytes);
  try {
    await image.decode();
  } catch {
    throw new Error('This file is not a picture MCSuperMods can read (PNG, JPEG, GIF, BMP, WebP).');
  }
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This computer cannot draw images here.');
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data: new Uint8ClampedArray(data) };
}

/** Encodes RGBA pixels as PNG bytes. */
export function encodePicture(image: RgbaImage): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This computer cannot draw images here.');
  context.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  );
  const url = canvas.toDataURL('image/png');
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

/** Draws `image` at `zoom` pixels per texel over a checkerboard. */
export function drawZoomed(canvas: HTMLCanvasElement, image: RgbaImage, zoom: number): void {
  canvas.width = image.width * zoom;
  canvas.height = image.height * zoom;
  const context = canvas.getContext('2d');
  if (context === null) return;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const at = (y * image.width + x) * 4;
      context.fillStyle = (x + y) % 2 === 0 ? '#d8d8d8' : '#b8b8b8';
      context.fillRect(x * zoom, y * zoom, zoom, zoom);
      const a = image.data[at + 3] ?? 0;
      if (a > 0) {
        context.fillStyle = `rgba(${image.data[at]}, ${image.data[at + 1]}, ${image.data[at + 2]}, ${a / 255})`;
        context.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    }
  }
}
