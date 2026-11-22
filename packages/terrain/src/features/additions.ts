/**
 * The project's biome additions (`msm:biome_addition`, ADR 0060 D2): placed features added to
 * vanilla or other biomes when a server starts. The element lowers to
 * `msm/<ns>/biome_addition/<path>.json` (the runtime's layer, not a data pack folder); the host
 * hands those definitions to the engine under the folder key `ADDITIONS_FOLDER`, ids as
 * `<ns>:<path>`. Each feature runs in its step after the biome's own (`order.ts`). Spawns are not
 * the preview's (Try it's limits, ADR 0085).
 */

import type { TerrainTargetFacts } from '../api';
import type { WorldFiles } from '../registries';
import { withNamespace } from '../registries';
import { isObject } from './blocks';
import { ADDITION_STEPS, type FeatureFacts } from './order';

/** The folder key the host passes biome addition definitions under. */
export const ADDITIONS_FOLDER = 'msm/biome_addition';

/** One added feature. */
export interface BiomeAddition {
  /** The addition's id (`<ns>:<path>`). */
  readonly id: string;
  readonly feature: string;
  readonly step: number;
  /** The biome ids it adds to (tags resolved). */
  readonly biomes: readonly string[];
}

/** The additions in a world's files, by addition id, then in their order. */
export function readAdditions(files: WorldFiles, facts: TerrainTargetFacts): BiomeAddition[] {
  const steps = (facts as TerrainTargetFacts & FeatureFacts).featureSteps ?? ADDITION_STEPS;
  const out: BiomeAddition[] = [];
  for (const id of files.ids(ADDITIONS_FOLDER)) {
    const json = files.get(ADDITIONS_FOLDER, id);
    if (!isObject(json) || !Array.isArray(json.features)) continue;
    const biomes = new Set<string>();
    for (const entry of Array.isArray(json.biomes) ? json.biomes : []) {
      if (typeof entry !== 'string') continue;
      if (entry.startsWith('#')) for (const b of files.biomeTag(entry.slice(1))) biomes.add(b);
      else biomes.add(withNamespace(entry));
    }
    for (const f of json.features) {
      if (!isObject(f) || typeof f.feature !== 'string') continue;
      const step = typeof f.step === 'string' ? steps.indexOf(f.step) : -1;
      out.push({
        id,
        feature: withNamespace(f.feature),
        step: step >= 0 ? step : steps.length - 1,
        biomes: [...biomes].sort(),
      });
    }
  }
  return out;
}
