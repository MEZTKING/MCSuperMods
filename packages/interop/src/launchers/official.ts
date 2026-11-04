/**
 * The official launcher's game directory as a game location.
 */

import type { GameLocation } from './types';

/** The display name of the official launcher location. */
export const OFFICIAL_LAUNCHER_NAME = 'Official launcher';

/**
 * The official launcher's `.minecraft` folder as a location: packs go straight into it and
 * any installed version may run there, so `mcVersion` and `loader` are `null`.
 */
export function officialLocation(root: string): GameLocation {
  return {
    ref: { launcher: 'official', root },
    id: 'official:default',
    displayName: OFFICIAL_LAUNCHER_NAME,
    mcVersion: null,
    loader: null,
    gameDir: root,
    modsDir: null,
    instanceDir: null,
    problems: [],
  };
}
