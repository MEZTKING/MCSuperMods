/**
 * Builds a complete {@link MinecraftStatus} for tests: no folder, no versions, no cache, no
 * launcher target. Pass only the fields a test cares about.
 */

import type { MinecraftStatus } from '../../src/shared/platform';

/** A {@link MinecraftStatus} with every field set, overridden by `overrides`. */
export function minecraftStatus(overrides: Partial<MinecraftStatus> = {}): MinecraftStatus {
  return {
    minecraftDir: null,
    installed: [],
    chosen: null,
    cache: null,
    target: null,
    targetMissing: false,
    jar: null,
    warnings: [],
    ...overrides,
  };
}
