/**
 * The order features run in (ADR 0119 D6: "in the target's feature order"): per decoration step,
 * one list over every biome of the world's files, each biome's own order kept (a topological
 * order of the biomes' lists; ties go by the target's vendored order when the host passes it, then
 * by first appearance). The biome additions' features run after them in their step, as the
 * runtime adds them (ADR 0060 D2).
 *
 * The step names and the vanilla order are target facts (`worldgen.featureSteps`,
 * `worldgen.vanillaFeatureOrder`). `TerrainTargetFacts` does not carry them yet, so they are read
 * when present (`FeatureFacts`); without them the steps are the biome files' list positions and an
 * addition's step name is read by `msm:biome_addition`'s own format (ADR 0060 D2).
 */

import type { TerrainTargetFacts } from '../api';
import { withNamespace } from '../registries';
import type { EngineWorld } from '../world';
import type { BiomeAddition } from './additions';
import { isObject } from './blocks';
import { FEATURE_FOLDERS } from './providers';

/** Facts the features read when the host passes them (not yet in `TerrainTargetFacts`). */
export interface FeatureFacts {
  /** `worldgen.featureSteps`: the decoration step names, in order. */
  readonly featureSteps?: readonly string[];
  /** `worldgen.vanillaFeatureOrder`: vanilla's placed features per step name, in order. */
  readonly featureOrder?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The step names of `msm:biome_addition`'s own format (ADR 0060 D2, the `GenerationStep` enum of
 * `definition.mcdoc`), used only when the target's names are not passed.
 */
export const ADDITION_STEPS: readonly string[] = Object.freeze([
  'raw_generation',
  'lakes',
  'local_modifications',
  'underground_structures',
  'surface_structures',
  'strongholds',
  'underground_ores',
  'underground_decoration',
  'fluid_springs',
  'vegetal_decoration',
  'top_layer_modification',
]);

/** A world's feature order and what each biome lists. */
export interface FeatureOrder {
  readonly steps: readonly (readonly string[])[];
  /** Biome id to its placed features per step (additions included). */
  readonly byBiome: ReadonlyMap<string, readonly ReadonlySet<string>[]>;
  /** Biome id to every placed feature it lists, in any step. */
  readonly anyStep: ReadonlyMap<string, ReadonlySet<string>>;
}

function stepLists(biome: unknown): string[][] {
  if (!isObject(biome) || !Array.isArray(biome.features)) return [];
  return biome.features.map((step) =>
    Array.isArray(step)
      ? step.filter((f): f is string => typeof f === 'string').map(withNamespace)
      : [],
  );
}

/** One order through lists that each keep their own (Kahn's, ties by rank, then first seen). */
export function mergeOrders(
  lists: readonly (readonly string[])[],
  rank: ReadonlyMap<string, number>,
): string[] {
  const seen = new Map<string, number>();
  const next = new Map<string, Set<string>>();
  const incoming = new Map<string, number>();
  for (const list of lists) {
    for (let i = 0; i < list.length; i += 1) {
      const id = list[i] as string;
      if (!seen.has(id)) {
        seen.set(id, seen.size);
        incoming.set(id, 0);
        next.set(id, new Set());
      }
      if (i > 0) {
        const before = list[i - 1] as string;
        const after = next.get(before) as Set<string>;
        if (before !== id && !after.has(id)) {
          after.add(id);
          incoming.set(id, (incoming.get(id) ?? 0) + 1);
        }
      }
    }
  }
  const key = (id: string) => [rank.get(id) ?? Number.MAX_SAFE_INTEGER, seen.get(id) ?? 0] as const;
  const less = (a: string, b: string) => {
    const [ra, sa] = key(a);
    const [rb, sb] = key(b);
    return ra !== rb ? ra < rb : sa < sb;
  };
  const ready = [...seen.keys()].filter((id) => incoming.get(id) === 0);
  const out: string[] = [];
  const done = new Set<string>();
  while (out.length < seen.size) {
    if (ready.length === 0) {
      // A cycle: take the earliest feature still waiting (the game would refuse the world).
      let pick: string | undefined;
      for (const id of seen.keys()) if (!done.has(id) && (!pick || less(id, pick))) pick = id;
      if (!pick) break;
      ready.push(pick);
      incoming.set(pick, 0);
    }
    let best = 0;
    for (let i = 1; i < ready.length; i += 1) {
      if (less(ready[i] as string, ready[best] as string)) best = i;
    }
    const id = ready.splice(best, 1)[0] as string;
    if (done.has(id)) continue;
    done.add(id);
    out.push(id);
    for (const n of next.get(id) ?? []) {
      const left = (incoming.get(n) ?? 0) - 1;
      incoming.set(n, left);
      if (left === 0 && !done.has(n)) ready.push(n);
    }
  }
  return out;
}

const kept = new WeakMap<EngineWorld, FeatureOrder>();

/** The order of a world (kept per world). */
export function featureOrder(
  world: EngineWorld,
  additions: readonly BiomeAddition[],
): FeatureOrder {
  const known = kept.get(world);
  if (known) return known;
  const facts = world.facts as TerrainTargetFacts & FeatureFacts;
  const stepNames = facts.featureSteps ?? ADDITION_STEPS;
  const files = world.files;
  const byBiome = new Map<string, Set<string>[]>();
  const perStep: string[][][] = [];
  for (const id of files.ids(FEATURE_FOLDERS.biome)) {
    const lists = stepLists(files.get(FEATURE_FOLDERS.biome, id));
    byBiome.set(
      id,
      lists.map((l) => new Set(l)),
    );
    lists.forEach((list, step) => {
      perStep[step] ??= [];
      (perStep[step] as string[][]).push(list);
    });
  }
  const steps: string[][] = [];
  const count = Math.max(perStep.length, ...additions.map((a) => a.step + 1), 0);
  for (let step = 0; step < count; step += 1) {
    const rank = new Map<string, number>();
    const name = stepNames[step];
    const vanilla = name !== undefined ? facts.featureOrder?.[name] : undefined;
    for (const [i, id] of (vanilla ?? []).entries()) rank.set(withNamespace(id), i);
    steps.push(mergeOrders(perStep[step] ?? [], rank));
  }
  // Additions: after the biomes' own features in their step.
  for (const addition of additions) {
    const list = steps[addition.step] as string[];
    if (!list.includes(addition.feature)) list.push(addition.feature);
    for (const biome of addition.biomes) {
      let lists = byBiome.get(biome);
      if (!lists) {
        lists = [];
        byBiome.set(biome, lists);
      }
      while (lists.length <= addition.step) lists.push(new Set());
      (lists[addition.step] as Set<string>).add(addition.feature);
    }
  }
  const anyStep = new Map<string, Set<string>>();
  for (const [biome, lists] of byBiome) {
    const all = new Set<string>();
    for (const l of lists) for (const f of l) all.add(f);
    anyStep.set(biome, all);
  }
  const order: FeatureOrder = { steps, byBiome, anyStep };
  kept.set(world, order);
  return order;
}
