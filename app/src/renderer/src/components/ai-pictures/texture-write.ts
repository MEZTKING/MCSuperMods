/**
 * Writing a picked AI picture as one undoable step (ADR 0093 D6, ADR 0045): over an asset the
 * project records the bytes go as an undoable write (Undo restores the old picture), a new
 * one as an `asset` change item (Undo removes it). Pure.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import type { ChangeAsset, ChangeItem } from '../../changeset/changeset';

/** The items and writes that put `bytes` at `assets/<namespace>/<path>`. */
export function textureChange(
  project: Project | null,
  namespace: string,
  path: string,
  bytes: Uint8Array,
): { items: ChangeItem[]; writes: ChangeAsset[] } {
  const recorded =
    project?.namespaces
      .find((entry) => entry.name === namespace)
      ?.assets.some((asset) => asset.path === path) ?? false;
  const asset = { namespace, path, bytes };
  if (recorded) return { items: [], writes: [asset] };
  return {
    items: [
      {
        itemId: `ai-picture:${namespace}:${path}`,
        op: 'asset',
        asset,
        accepted: true,
        problems: [],
      },
    ],
    writes: [],
  };
}

/** `ns:block/ruby` as its namespace and asset path (`textures/block/ruby.png`), or `null`. */
export function textureAsset(textureId: string): { namespace: string; path: string } | null {
  const colon = textureId.indexOf(':');
  const namespace = colon < 0 ? 'minecraft' : textureId.slice(0, colon);
  const rest = colon < 0 ? textureId : textureId.slice(colon + 1);
  if (namespace === 'minecraft' || namespace === '' || rest === '') return null;
  return { namespace, path: `textures/${rest}.png` };
}
