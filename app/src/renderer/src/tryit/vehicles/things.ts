/**
 * The project's vehicles in Try it's hotbar and picker (B428): each vehicle's item, with the
 * picture its item model shows (`assets/<ns>/items/<path>.json`, ADR 0090 D5).
 */

import type { SimFiles, VehicleCatalogue } from '@msm/sim';
import type { ResourceFolders } from '../../preview/model-chain';
import { blockTexture, type TryItThing } from '../hotbar';

/** The vehicles' items, in id order. */
export function vehicleThings(
  vehicles: Pick<VehicleCatalogue, 'ids' | 'get'>,
  files: SimFiles,
  folders: ResourceFolders,
): TryItThing[] {
  const out: TryItThing[] = [];
  for (const id of vehicles.ids()) {
    const vehicle = vehicles.get(id);
    if (vehicle === undefined) continue;
    // A vehicle's item model is found as a block's item model is.
    const texture = blockTexture(files, folders, id);
    out.push({
      id,
      name: vehicle.displayName,
      kind: 'vehicle',
      ...(texture === undefined ? {} : { texture }),
    });
  }
  return out;
}
