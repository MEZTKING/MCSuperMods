/**
 * The things vanilla parity 3, batch 2 adds to Try it's hotbar and picker (B540): the project's
 * fish buckets and fluid bottles (with the pictures their item models show), the traders' gift
 * items, and the vanilla tools their uses need, offered only when the project has something to
 * use them on: vanilla's cauldron (a block, kind `prop`) and glass bottle for fluid cauldrons and
 * bottles, the empty bucket for cauldrons and dry fish buckets, the water bucket for fish, boats
 * and mixing, and the lava bucket for mixing. Vanilla items draw their picture from the client
 * jar when it is set up, else an icon.
 *
 * Part of the lazy Try it chunk.
 */

import {
  BUCKET,
  CAULDRON,
  type EntityCatalogue,
  type FluidSpec,
  GLASS_BOTTLE,
  LAVA_BUCKET,
  type SimFiles,
  type TraderSpec,
  type VehicleCatalogue,
  WATER_BUCKET,
} from '@msm/sim';
import type { ResourceFolders } from '../../preview/model-chain';
import { blockTexture, type TryItThing } from '../hotbar';

/** What the batch 2 things are read from. */
export interface Batch2Sources {
  readonly fluids: readonly FluidSpec[];
  readonly mobs: Pick<EntityCatalogue, 'ids' | 'get'>;
  readonly traders: ReadonlyMap<string, TraderSpec>;
  readonly vehicles: Pick<VehicleCatalogue, 'ids' | 'get'>;
  /** An item's name in plain words. */
  readonly nameOf: (id: string) => string;
}

const vanillaItem = (id: string, name: string): TryItThing => ({
  id,
  name,
  kind: 'item',
  texture: `minecraft:item/${id.slice(id.indexOf(':') + 1)}`,
});

/** The batch 2 things, project ones first; see the module comment. */
export function batch2Things(
  sources: Batch2Sources,
  files: SimFiles,
  folders: ResourceFolders,
): TryItThing[] {
  const out: TryItThing[] = [];
  const project = (id: string, name: string): void => {
    const texture = blockTexture(files, folders, id);
    out.push({ id, name, kind: 'item', ...(texture === undefined ? {} : { texture }) });
  };
  let water = false;
  let empty = false;
  let lava = false;
  for (const id of sources.mobs.ids()) {
    const bucket = sources.mobs.get(id)?.bucket;
    if (bucket === undefined) continue;
    project(bucket.item, bucket.name);
    if (bucket.water) water = true;
    else empty = true;
  }
  let cauldrons = false;
  let bottles = false;
  for (const fluid of sources.fluids) {
    if (fluid.bottle !== undefined) {
      project(fluid.bottle.id, fluid.bottle.name);
      bottles = true;
    }
    if (fluid.cauldron !== undefined) cauldrons = true;
    for (const rule of fluid.mixing ?? []) {
      if (rule.with === 'lava' || rule.with === 'minecraft:lava') lava = true;
      if (rule.with === 'water' || rule.with === 'minecraft:water') water = true;
    }
  }
  const gifts = new Set<string>();
  for (const trader of sources.traders.values()) {
    const gift = trader.reputation?.giftItem;
    if (gift !== undefined) gifts.add(gift);
  }
  for (const gift of [...gifts].sort()) {
    if (gift.startsWith('minecraft:')) out.push(vanillaItem(gift, sources.nameOf(gift)));
    else project(gift, sources.nameOf(gift));
  }
  for (const id of sources.vehicles.ids()) {
    const definition = sources.vehicles.get(id)?.definition as Record<string, unknown> | undefined;
    if (definition?.['msm:boat'] !== undefined) water = true;
  }
  if (cauldrons) {
    out.push({
      id: CAULDRON,
      name: 'Cauldron',
      kind: 'prop',
      texture: 'minecraft:block/cauldron_side',
    });
    empty = true;
  }
  if (cauldrons || bottles) out.push(vanillaItem(GLASS_BOTTLE, 'Glass Bottle'));
  if (empty) out.push(vanillaItem(BUCKET, 'Bucket'));
  if (water) out.push(vanillaItem(WATER_BUCKET, 'Water Bucket'));
  if (lava) out.push(vanillaItem(LAVA_BUCKET, 'Lava Bucket'));
  return out;
}
