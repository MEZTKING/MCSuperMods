/**
 * Checks for asset files the user imports: safe names, PNG headers for textures, the Ogg
 * signature for sounds.
 *
 * @packageDocumentation
 */

import { isProjectRelativePath } from '@msm/core';
import { readPngHeader } from '@msm/interop';

/** Asset file names: the characters Minecraft allows in resource paths, no path separators. */
const ASSET_NAME = /^[a-z0-9_.-]+$/;

const OGG_SIGNATURE = [0x4f, 0x67, 0x67, 0x53] as const;

/**
 * Why `name` (with `data`) cannot be imported into `subfolder`, or `undefined` when it can.
 *
 * - The subfolder must be a safe relative path and the name one lower-case path segment.
 * - Files under `textures/` must be PNG images (or `.png.mcmeta` animation metadata).
 * - Files under `sounds/` must be Ogg files.
 * - Any `.png` must have a valid PNG header; any `.ogg` must start with `OggS`.
 *
 * @param subfolder - Folder under `assets/<ns>/`, for example `textures/block`.
 * @param name - The file name.
 * @param data - The file's bytes.
 */
export function assetImportError(
  subfolder: string,
  name: string,
  data: Uint8Array,
): string | undefined {
  if (!isProjectRelativePath(subfolder)) {
    return `${JSON.stringify(subfolder)} is not a safe relative folder.`;
  }
  if (!ASSET_NAME.test(name) || name === '.' || name === '..') {
    return `${JSON.stringify(name)}: file names may use only lower-case letters, digits, "_", "-" and ".".`;
  }
  const isTextures = subfolder === 'textures' || subfolder.startsWith('textures/');
  const isSounds = subfolder === 'sounds' || subfolder.startsWith('sounds/');
  if (isTextures && !name.endsWith('.png') && !name.endsWith('.png.mcmeta')) {
    return `${name}: textures must be PNG images.`;
  }
  if (isSounds && !name.endsWith('.ogg')) return `${name}: sounds must be Ogg Vorbis files.`;
  if (name.endsWith('.png')) {
    try {
      readPngHeader(data);
    } catch (error) {
      return `${name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (name.endsWith('.ogg') && !OGG_SIGNATURE.every((byte, index) => data[index] === byte)) {
    return `${name}: not an Ogg file (bad signature).`;
  }
  return undefined;
}
