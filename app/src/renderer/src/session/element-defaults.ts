/**
 * New-project and new-element defaults: the first namespace's name and the substitution of a
 * kind's placeholder defaults with ids in the user's namespace.
 *
 * @packageDocumentation
 */

import { type Json, parseResourceLocation, type ResourceLocation } from '@msm/core';

/** The placeholder some kinds use in `defaultData` for an id the app must fill in. */
export const APP_PLACEHOLDER = '<set by the app>';

/** The kind whose element id must be `<ns>:sounds`. */
export const SOUNDS_KIND = 'minecraft:sounds';

/** The kind of the project's `pack.mcmeta` element. */
export const PACK_MCMETA_KIND = 'minecraft:pack_mcmeta';

/**
 * A namespace name derived from a folder name: lower case, every run of characters outside
 * `[a-z0-9_]` replaced by `_`, trimmed of `_`; `my_project` when nothing is left.
 *
 * @param folderName - The project folder's base name.
 */
export function namespaceFromFolderName(folderName: string): string {
  const name = folderName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return name === '' ? 'my_project' : name;
}

/**
 * `<ns>:<prefix>/<path>` unless the path already starts with `block/` or `item/`, in which
 * case `<ns>:<path>`.
 */
function referenceFor(namespace: string, path: string, prefix: 'block' | 'item'): string {
  return /^(block|item)\//.test(path) ? `${namespace}:${path}` : `${namespace}:${prefix}/${path}`;
}

/** The default `block/` or `item/` prefix for references made by an element of `kind`. */
function prefixFor(kind: string, path: string): 'block' | 'item' {
  if (path.startsWith('item/')) return 'item';
  if (path.startsWith('block/')) return 'block';
  return kind === 'minecraft:item_definition' ? 'item' : 'block';
}

function substitute(value: Json, key: string | undefined, reference: string): Json {
  if (typeof value === 'string') {
    if (value === APP_PLACEHOLDER) return reference;
    if (value === '' && key === 'model') return reference;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, undefined, reference));
  if (typeof value === 'object' && value !== null) {
    const out: { [key: string]: Json } = {};
    for (const [name, member] of Object.entries(value)) {
      out[name] = substitute(member, name, reference);
    }
    return out;
  }
  return value;
}

/**
 * A new element's data from its kind's `defaultData`: every {@link APP_PLACEHOLDER} string
 * and every empty `model` string becomes a reference in the element's own namespace, named
 * after the element (`demo:ruby_block` becomes `demo:block/ruby_block`; an item definition
 * refers to `demo:item/<path>`).
 *
 * @param kind - The element kind id.
 * @param id - The new element's id.
 * @param defaultData - The kind's `defaultData`, or `undefined` for `{}`.
 */
export function defaultElementData(
  kind: string,
  id: ResourceLocation,
  defaultData: Json | undefined,
): Json {
  if (defaultData === undefined) return {};
  const { namespace, path } = parseResourceLocation(id);
  return substitute(
    structuredClone(defaultData),
    undefined,
    referenceFor(namespace, path, prefixFor(kind, path)),
  );
}

/**
 * Checks kind-specific id rules before an element is created.
 *
 * @throws Error If a `minecraft:sounds` element's path is not `sounds`.
 */
export function assertElementIdAllowed(kind: string, id: ResourceLocation): void {
  if (kind !== SOUNDS_KIND) return;
  const { namespace, path } = parseResourceLocation(id);
  if (path !== 'sounds') {
    throw new Error(
      `A sounds file must have the id ${namespace}:sounds (one per namespace), not ${id}.`,
    );
  }
}
