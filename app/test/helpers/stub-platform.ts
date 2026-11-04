/**
 * Stubs for the {@link PlatformAdapter} services a renderer-side test does not exercise. Each
 * method rejects, so an unexpected call fails the test loudly.
 */

import type { PlatformAdapter } from '../../src/shared/platform';

const unavailable = async (): Promise<never> => {
  throw new Error('Not available in this test.');
};

/** Every adapter service except `app`, `project`, `fs` and the Phase 0 dialogs. */
export function stubPlatformServices(): Pick<
  PlatformAdapter,
  | 'shell'
  | 'targets'
  | 'settings'
  | 'minecraft'
  | 'thumbnails'
  | 'mcfunction'
  | 'exports'
  | 'updates'
> & { dialogs: Pick<PlatformAdapter['dialogs'], 'pickFiles' | 'saveFile'> } {
  return {
    dialogs: { pickFiles: unavailable, saveFile: unavailable },
    shell: { showItemInFolder: unavailable },
    targets: { readVendored: unavailable },
    settings: { get: unavailable, set: unavailable },
    minecraft: {
      status: unavailable,
      extract: unavailable,
      readAsset: unavailable,
      listAssets: unavailable,
      installResourcePack: unavailable,
      listWorlds: unavailable,
      installDataPack: unavailable,
    },
    thumbnails: { get: unavailable },
    mcfunction: { check: unavailable, complete: unavailable },
    exports: { pickFolder: unavailable, writeFiles: unavailable },
    updates: { check: unavailable, install: unavailable, onStatus: () => () => {} },
  };
}
