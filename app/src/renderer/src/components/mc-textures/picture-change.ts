/**
 * Writing a picture started from a Minecraft texture (ADR 0129 D4) as one undoable step: the PNG
 * over or beside the project's assets (`textureChange`, ADR 0045), and with it MSM's own
 * `.png.mcmeta` when the picture is still an animation strip, so it animates in the game. A
 * **Change a Minecraft texture** picture goes to the same path in the `minecraft` namespace,
 * where the resource pack's copy overrides the game's. Pure.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import type { ChangeAsset, ChangeItem } from '../../changeset/changeset';
import { textureChange } from '../ai-pictures/texture-write';
import { isStrip, type McTexture } from './catalogue';

/** The namespace overrides of Minecraft's own textures live in. */
export const MINECRAFT_NAMESPACE = 'minecraft';

/** The width and height of a PNG from its header, or `null` when it is not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The items and writes of the sidecar alone: MSM's `mcmeta` at `<path>.mcmeta` when `bytes` is
 * an animation strip, else nothing.
 */
export function metaChange(
  project: Project | null,
  namespace: string,
  path: string,
  bytes: Uint8Array,
  mcmeta: Uint8Array | null,
): { items: ChangeItem[]; writes: ChangeAsset[] } {
  const size = pngSize(bytes);
  if (mcmeta === null || size === null || !isStrip(size.width, size.height)) {
    return { items: [], writes: [] };
  }
  return textureChange(project, namespace, `${path}.mcmeta`, mcmeta);
}

/**
 * The items and writes that put `bytes` at `assets/<namespace>/<path>` and, given `mcmeta` and a
 * strip, the sidecar at `<path>.mcmeta`.
 */
export function pictureChange(
  project: Project | null,
  namespace: string,
  path: string,
  bytes: Uint8Array,
  mcmeta: Uint8Array | null = null,
): { items: ChangeItem[]; writes: ChangeAsset[] } {
  const picture = textureChange(project, namespace, path, bytes);
  const meta = metaChange(project, namespace, path, bytes, mcmeta);
  return {
    items: [...picture.items, ...meta.items],
    writes: [...picture.writes, ...meta.writes],
  };
}

/** Where a changed Minecraft texture is saved: the same path in the `minecraft` namespace. */
export function overrideOf(texture: Pick<McTexture, 'assetPath'>): {
  namespace: string;
  path: string;
} {
  return { namespace: MINECRAFT_NAMESPACE, path: texture.assetPath };
}

/** Whether the project already overrides `texture` (the painter then opens the user's copy). */
export function hasOverride(project: Project | null, texture: Pick<McTexture, 'assetPath'>) {
  return (
    project?.namespaces
      .find((entry) => entry.name === MINECRAFT_NAMESPACE)
      ?.assets.some((asset) => asset.path === texture.assetPath) ?? false
  );
}
