/**
 * RFC 6901 JSON pointers and conversion of Immer patches to RFC 6902 JSON patches.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import type { Patch } from 'immer';

/** One RFC 6902 operation. MSM only produces `add`, `remove` and `replace`. */
export interface JsonPatchOperation {
  /** The operation. */
  op: 'add' | 'remove' | 'replace';
  /** RFC 6901 pointer to the target location. */
  path: string;
  /** The new value, for `add` and `replace`. */
  value?: Json;
}

/**
 * Builds an RFC 6901 pointer from path segments, escaping `~` as `~0` and `/` as `~1`.
 *
 * @param path - The segments; the empty array is the whole document (`""`).
 * @returns The pointer, for example `/namespaces/0/elements/0/data/x`.
 */
export function toJsonPointer(path: readonly (string | number)[]): string {
  let pointer = '';
  for (const segment of path) {
    pointer += `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`;
  }
  return pointer;
}

/**
 * Converts Immer patches (array paths) to RFC 6902 operations (pointer paths).
 *
 * @param patches - Patches produced by Immer.
 * @returns The equivalent JSON patch, in the same order.
 * @throws Error If a patch is not `add`, `remove` or `replace`.
 */
export function immerPatchesToJsonPatch(patches: Patch[]): JsonPatchOperation[] {
  return patches.map((patch) => {
    if (patch.op !== 'add' && patch.op !== 'remove' && patch.op !== 'replace') {
      throw new Error(`Unsupported patch operation ${JSON.stringify(patch.op)}.`);
    }
    const operation: JsonPatchOperation = { op: patch.op, path: toJsonPointer(patch.path) };
    if (patch.op !== 'remove' && patch.value !== undefined) operation.value = patch.value as Json;
    return operation;
  });
}
