/**
 * Pictures for the AI helper (ADR 0048): a pasted screenshot or a chosen image, scaled so its
 * longest edge is at most {@link AI_PICTURE_EDGE} pixels and encoded as PNG, or as JPEG when
 * the PNG would be too large for the API.
 *
 * @packageDocumentation
 */

import { AI_IMAGE_MAX_BYTES, AI_IMAGES_MAX, type AiImage } from '@msm/ai';
import { decodePicture } from '../texture-editor/png-canvas';

/** The longest edge sent; larger pictures cost more and the model scales them down anyway. */
export const AI_PICTURE_EDGE = 1568;

/** A picture ready to send, with a `data:` URL for its thumbnail. */
export interface AiPicture extends AiImage {
  /** The `data:` URL of the encoded picture. */
  url: string;
  /** The file name, or "screenshot" for a pasted one. */
  name: string;
}

/** The most pictures one message carries. */
export const AI_PICTURES_MAX = AI_IMAGES_MAX;

/**
 * Prepares picture bytes for the model.
 *
 * @throws Error When the bytes are not a picture, or still too large as a JPEG.
 */
export async function aiPictureOf(bytes: Uint8Array, name: string): Promise<AiPicture> {
  const image = await decodePicture(bytes, AI_PICTURE_EDGE);
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
  const limit = Math.floor((AI_IMAGE_MAX_BYTES * 4) / 3);
  let url = canvas.toDataURL('image/png');
  let mediaType: AiImage['mediaType'] = 'image/png';
  if (url.length - url.indexOf(',') - 1 > limit) {
    url = canvas.toDataURL('image/jpeg', 0.85);
    mediaType = 'image/jpeg';
  }
  const data = url.slice(url.indexOf(',') + 1);
  if (data.length > limit) throw new Error(`${name} is too large to send, even as a JPEG.`);
  return { mediaType, data, url, name };
}

/** The image files of a paste or a drop. */
export function pictureFilesOf(list: FileList | null | undefined): File[] {
  return [...(list ?? [])].filter((file) => file.type.startsWith('image/'));
}

/** Reads `files` as pictures; returns them and the messages of those that failed. */
export async function readPictures(
  files: readonly File[],
): Promise<{ pictures: AiPicture[]; errors: string[] }> {
  const pictures: AiPicture[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const name = file.name === '' || file.name === 'image.png' ? 'screenshot' : file.name;
      pictures.push(await aiPictureOf(new Uint8Array(await file.arrayBuffer()), name));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { pictures, errors };
}
