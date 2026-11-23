/**
 * The Studios' side of the flat looks (B625): a project file reader by jar path
 * (`assets/<ns>/...`) over the blocks and items Studio host, made again when the host's asset
 * revision changes so a repainted picture shows at once. Types only from the host, so the eager
 * Studios that call it pull no look code into the first paint.
 */

import { useMemo } from 'react';
import type { BlocksItemsStudioHost } from '../../../studios/blocks-items/host';

/** `(path) => bytes` over `host.modelPreview.readProjectAsset`, or `undefined` without one. */
export function useHostProjectReader(
  host: BlocksItemsStudioHost | null,
): ((path: string) => Promise<Uint8Array | null>) | undefined {
  const read = host?.modelPreview?.readProjectAsset;
  const revision = host?.revision ?? 0;
  return useMemo(() => {
    void revision;
    if (read === undefined) return undefined;
    return async (path: string) => {
      const match = /^assets\/([^/]+)\/(.+)$/.exec(path);
      if (match === null) return null;
      return await read(match[1] as string, match[2] as string).catch(() => null);
    };
  }, [read, revision]);
}
