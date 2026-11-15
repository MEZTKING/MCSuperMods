/**
 * The project's bags and bundles in Try it's hotbar and picker (B463, ADR 0095): each item with
 * `msm:item_inventory` or `msm:bundle`, with the picture its item model shows. Using one opens
 * its mock-up screen (`BagScreen.tsx`), pointed at a block or at nothing.
 */

import type { ItemInventorySpec, SimFiles } from '@msm/sim';
import type { ResourceFolders } from '../../preview/model-chain';
import { blockTexture, type TryItThing } from '../hotbar';

/** A name in plain words from an item id, when the language file has none. */
const plainName = (id: string): string =>
  (
    id
      .slice(id.indexOf(':') + 1)
      .split('/')
      .at(-1) ?? id
  )
    .split('_')
    .filter((word) => word !== '')
    .map((word) => (word[0] ?? '').toUpperCase() + word.slice(1))
    .join(' ');

/** The bags and bundles, in id order. */
export function bagThings(
  bags: ReadonlyMap<string, ItemInventorySpec>,
  nameOf: (id: string) => string | undefined,
  files: SimFiles,
  folders: ResourceFolders,
): TryItThing[] {
  return [...bags.keys()].sort().map((id) => {
    const texture = blockTexture(files, folders, id);
    return {
      id,
      name: nameOf(id) ?? plainName(id),
      kind: 'bag' as const,
      ...(texture === undefined ? {} : { texture }),
    };
  });
}
