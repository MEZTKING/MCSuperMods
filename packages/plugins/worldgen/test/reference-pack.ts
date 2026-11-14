/**
 * The vanilla decoration order measured in the user's reference pack
 * (`docs/reference/vanilla-worldgen/tools/feature_indices.txt`, the release target): one line per
 * placed feature, `step<N>`, its index in that step's sorted list, and its id. The game numbers
 * features by this order (`FeatureSorter`), so a biome whose vanilla features run against it can
 * close a "Feature order cycle" with the vanilla biomes of the same world. Test-only: the order
 * is a version fact and lives in no plugin source.
 */
import { readFileSync } from 'node:fs';

/** Where a vanilla placed feature runs: its decoration step ordinal and index in that step. */
export interface VanillaPosition {
  step: number;
  index: number;
}

const FILE = new URL(
  '../../../../docs/reference/vanilla-worldgen/tools/feature_indices.txt',
  import.meta.url,
);

/** Placed feature id to its vanilla step and index. */
export function vanillaFeatureOrder(): ReadonlyMap<string, VanillaPosition> {
  const order = new Map<string, VanillaPosition>();
  for (const line of readFileSync(FILE, 'utf8').split('\n')) {
    const [step, index, id] = line.trim().split(/\s+/);
    if (step === undefined || index === undefined || id === undefined) continue;
    order.set(id, { step: Number(step.replace('step', '')), index: Number(index) });
  }
  return order;
}

/**
 * Every place a biome's `features` list departs from the vanilla order: a vanilla feature in
 * another step than vanilla's, or after a vanilla feature that vanilla runs later in the step.
 * Project features (not in the vanilla list) are ignored.
 */
export function vanillaOrderProblems(
  features: unknown,
  order: ReadonlyMap<string, VanillaPosition> = vanillaFeatureOrder(),
): string[] {
  const problems: string[] = [];
  if (!Array.isArray(features)) return problems;
  features.forEach((list: unknown, step) => {
    if (!Array.isArray(list)) return;
    let last: { id: string; index: number } | undefined;
    for (const entry of list) {
      if (typeof entry !== 'string') continue;
      const id = entry.includes(':') ? entry : `minecraft:${entry}`;
      const position = order.get(id);
      if (position === undefined) continue;
      if (position.step !== step) {
        problems.push(`${id} is in step ${step}; vanilla runs it in step ${position.step}`);
        continue;
      }
      if (last !== undefined && position.index < last.index) {
        problems.push(`${id} comes after ${last.id} in step ${step}; vanilla runs it first`);
      }
      if (last === undefined || position.index > last.index) last = { id, index: position.index };
    }
  });
  return problems;
}
