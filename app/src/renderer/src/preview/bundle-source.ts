/**
 * A bundle-backed asset source for the Creator's live preview (ADR 0043 D3): the bundle is
 * previewed from memory, never applied. Models resolve from the bundle's elements first, then
 * the project, then the vanilla cache (the existing model lookup over {@link bundlePreviewProject});
 * textures from the bundle's bytes first, then the project's files ({@link bundleAssetReader}).
 * Also the small lookups the Creator's tabs need: an item's or block's texture, display names
 * from the bundle's language files or the elements' own `display_name`, and `data:` URLs for generated PNGs.
 *
 * Pure, apart from `btoa`; no deepslate or gl-matrix, so it stays out of the lazy chunks.
 *
 * @packageDocumentation
 */

import { createElement, type Json, type Project, type ResourceLocation } from '@msm/core';
import type { ContentBundle, ContentBundleElement } from '@msm/plugin-api';
import { blockItemIdOf } from '@msm/plugin-blocks-items';
import { normaliseId, type ResourceFolders } from './model-chain';

type JsonObject = { [key: string]: Json };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MODEL_KIND = 'minecraft:model';
const ITEM_KIND = 'msm:item';
const BLOCK_KIND = 'msm:block';

/**
 * `project` with the bundle's elements laid over it: a bundle element replaces a project
 * element of the same id, namespaces the project lacks are added. Never changes `project`.
 */
export function bundlePreviewProject(project: Project, bundle: ContentBundle): Project {
  const byNamespace = new Map<string, ContentBundleElement[]>();
  for (const entry of bundle.elements) {
    const namespace = entry.id.slice(0, entry.id.indexOf(':'));
    const list = byNamespace.get(namespace) ?? [];
    list.push(entry);
    byNamespace.set(namespace, list);
  }
  const ids = new Set(bundle.elements.map((entry) => entry.id));
  const namespaces = project.namespaces.map((namespace) => ({
    ...namespace,
    elements: namespace.elements.filter((element) => !ids.has(element.id)),
  }));
  for (const [name, entries] of byNamespace) {
    let namespace = namespaces.find((entry) => entry.name === name);
    if (namespace === undefined) {
      namespace = { name, elements: [], assets: [] };
      namespaces.push(namespace);
    }
    for (const entry of entries) {
      namespace.elements.push(
        createElement({
          id: entry.id as ResourceLocation,
          kind: entry.kind,
          data: entry.data,
          now: () => '1970-01-01T00:00:00.000Z',
        }),
      );
    }
  }
  return { ...project, namespaces };
}

/** The bytes of a bundle asset, or `undefined`. */
export function bundleAssetBytes(
  bundle: ContentBundle,
  namespace: string,
  path: string,
): Uint8Array | undefined {
  return bundle.assets.find((asset) => asset.namespace === namespace && asset.path === path)?.bytes;
}

/** Reads an asset from the bundle first, then through `fallback` (the project's files). */
export function bundleAssetReader(
  bundle: ContentBundle,
  fallback: (namespace: string, path: string) => Promise<Uint8Array | null>,
): (namespace: string, path: string) => Promise<Uint8Array | null> {
  return async (namespace, path) =>
    bundleAssetBytes(bundle, namespace, path) ?? (await fallback(namespace, path));
}

/** A PNG's bytes as a `data:` URL (the CSP allows `img-src data:`). */
export function pngDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/** The first texture a model names, following its parents inside the bundle. */
function firstTexture(bundle: ContentBundle, modelId: string): string | undefined {
  const seen = new Set<string>();
  let id: string | undefined = normaliseId(modelId);
  while (id !== undefined && !seen.has(id)) {
    seen.add(id);
    const current: string = id;
    const model = bundle.elements.find(
      (entry) => entry.kind === MODEL_KIND && normaliseId(entry.id) === current,
    );
    if (model === undefined || !isObject(model.data)) return undefined;
    const textures = model.data.textures;
    if (isObject(textures)) {
      const preferred = ['layer0', 'all', 'side', 'top', 'texture', 'particle'];
      for (const key of [...preferred, ...Object.keys(textures)]) {
        const value = textures[key];
        if (typeof value === 'string' && !value.startsWith('#')) return value;
      }
    }
    id = typeof model.data.parent === 'string' ? normaliseId(model.data.parent) : undefined;
  }
  return undefined;
}

/** The asset path of a texture id under the target's texture folder. */
export function texturePath(
  textureId: string,
  folders: ResourceFolders,
): {
  namespace: string;
  path: string;
} {
  const id = normaliseId(textureId);
  const colon = id.indexOf(':');
  return { namespace: id.slice(0, colon), path: `${folders.textures}/${id.slice(colon + 1)}.png` };
}

/** The model id an `msm:item` or `msm:block` names (`data.model`). */
export function elementModel(data: Json): string | undefined {
  return isObject(data) && typeof data.model === 'string' ? normaliseId(data.model) : undefined;
}

/**
 * The bytes of the texture drawn for a bundle item or block: its model's first texture, read
 * from the bundle's assets. `undefined` when the model or texture is not in the bundle.
 */
export function elementTextureBytes(
  bundle: ContentBundle,
  data: Json,
  folders: ResourceFolders,
): Uint8Array | undefined {
  const model = elementModel(data);
  if (model === undefined) return undefined;
  const texture = firstTexture(bundle, model);
  if (texture === undefined) return undefined;
  const { namespace, path } = texturePath(texture, folders);
  return bundleAssetBytes(bundle, namespace, path);
}

/** The `display_name` of an element's data, when it is a non-empty string. */
function ownDisplayName(data: Json): string | undefined {
  if (!isObject(data)) return undefined;
  const value = data.display_name;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The display name of a bundle item or block, read the way lowering writes the language keys
 * (`item.<ns>.<path>` or `block.<ns>.<path>`): first the bundle's language files, then the
 * elements' own `display_name`. An `msm:block` names `block.<id>`; an `msm:item` names
 * `item.<id>`, and so does an `msm:block` whose block item has its own id (`item.id`, seeds
 * planting a crop; `blockItemIdOf`). A block whose item shares its id writes only the block key,
 * as lowering does. The language files come first; where both name a key differently, export
 * reports a merge conflict anyway. `undefined` when nothing names it.
 */
export function displayName(
  bundle: ContentBundle,
  id: string,
  type: 'item' | 'block',
): string | undefined {
  const colon = id.indexOf(':');
  const key = `${type}.${id.slice(0, colon)}.${id.slice(colon + 1).replaceAll('/', '.')}`;
  for (const entry of bundle.elements) {
    if (entry.kind !== 'minecraft:lang' || !isObject(entry.data)) continue;
    const value = entry.data[key];
    if (typeof value === 'string') return value;
  }
  for (const entry of bundle.elements) {
    const names =
      type === 'block'
        ? entry.kind === BLOCK_KIND && entry.id === id
        : (entry.kind === ITEM_KIND && entry.id === id) ||
          (entry.kind === BLOCK_KIND &&
            entry.id !== id &&
            blockItemIdOf(entry.id, entry.data) === id);
    if (!names) continue;
    const own = ownDisplayName(entry.data);
    if (own !== undefined) return own;
  }
  return undefined;
}

/**
 * The asset path of a painting variant's picture: `asset_id` `<ns>:<path>` names
 * `<textures>/painting/<path>.png` in `<ns>`.
 */
export function paintingTexturePath(
  assetId: string,
  folders: ResourceFolders,
): { namespace: string; path: string } {
  return texturePath(normaliseId(assetId).replace(':', ':painting/'), folders);
}

/**
 * The bytes of a painting variant's picture: the bundle's own file first, then `fallback`
 * (the project's files), `null` when neither has it.
 */
export async function paintingTextureBytes(
  bundle: ContentBundle,
  assetId: string,
  folders: ResourceFolders,
  fallback: (namespace: string, path: string) => Promise<Uint8Array | null>,
): Promise<Uint8Array | null> {
  const { namespace, path } = paintingTexturePath(assetId, folders);
  return bundleAssetReader(bundle, fallback)(namespace, path).catch(() => null);
}
