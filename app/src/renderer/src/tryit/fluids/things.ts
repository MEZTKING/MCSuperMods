/**
 * The project's fluid buckets in Try it's hotbar and picker (B483, ADR 0099): each fluid's
 * `<ns>:<path>_bucket` with the picture its item model shows. Using one pours a source of the
 * fluid where a block would go; the fluid's own block is not offered (only a bucket places it,
 * as in the game).
 *
 * Part of the lazy Try it chunk.
 */

import type { FluidSpec, SimFiles } from '@msm/sim';
import type { ResourceFolders } from '../../preview/model-chain';
import { blockTexture, type TryItThing } from '../hotbar';

/** The buckets, in fluid id order. */
export function bucketThings(
  fluids: readonly FluidSpec[],
  files: SimFiles,
  folders: ResourceFolders,
): TryItThing[] {
  return fluids.map((fluid) => {
    const texture = blockTexture(files, folders, fluid.bucket);
    return {
      id: fluid.bucket,
      name: fluid.bucketName,
      kind: 'bucket' as const,
      ...(texture === undefined ? {} : { texture }),
    };
  });
}
