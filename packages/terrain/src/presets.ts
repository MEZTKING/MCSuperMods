/** The engine's presets seam (ADR 0119 D3; B578 fills it): multi-noise biome source presets. */

import type { WorldgenFiles } from './api';

/** The biome parameter list of a multi_noise preset, or `null` while unknown (WS9). */
export function resolvePreset(_files: WorldgenFiles, _preset: string): unknown | null {
  return null;
}
