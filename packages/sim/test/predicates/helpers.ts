/**
 * Helpers for the tag and predicate tests: lookups over in-memory files, a context on a built-in
 * target, and B600's fixture files (`docs/reference/spikes/b600/spike-src/make_pack.py`, MSM's
 * own data, namespace `msm_b600`).
 */
import type { Json, Target } from '@msm/plugin-api';
import {
  createTagResolver,
  type DataLookup,
  type EvalContext,
  layeredLookup,
  normaliseId,
  SimRandom,
  type TagOptions,
} from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';

/** Files by folder key, then by id. */
export type FileTable = Readonly<Record<string, Readonly<Record<string, Json>>>>;

/** A lookup over a table (ids without a namespace mean `minecraft:`). */
export function tableLookup(table: FileTable): DataLookup {
  return (folder, id) => {
    const files = table[folder];
    if (files === undefined) return undefined;
    const full = normaliseId(id);
    for (const [key, value] of Object.entries(files)) if (normaliseId(key) === full) return value;
    return undefined;
  };
}

let targets: readonly Target[] | undefined;

/** The built-in targets (loaded once). */
export async function targetsOnce(): Promise<readonly Target[]> {
  targets ??= await builtInTargets();
  return targets;
}

/** A context over project and vanilla tables. */
export function contextFor(
  target: Target,
  project: FileTable,
  vanilla: FileTable = {},
  seed = 1,
  options: Omit<TagOptions, 'project'> = {},
): EvalContext {
  const lookup = layeredLookup(tableLookup(project), tableLookup(vanilla));
  const resolveTag = createTagResolver(lookup, {
    tagsFolder: target.folders.data.tags,
    ...options,
  });
  return { random: new SimRandom(seed), lookup, resolveTag, types: target };
}

/** `{type: random_chance, chance}` as the fixture writes it. */
export const chance = (value: number): Json => ({ type: 'minecraft:random_chance', chance: value });

/** B600's predicate files (make_pack.py, "predicates"). */
export const B600_PREDICATES: Readonly<Record<string, Json>> = {
  'msm_b600:chance30': chance(0.3),
  'msm_b600:raining': { type: 'minecraft:weather_check', raining: true },
  'msm_b600:day': {
    type: 'minecraft:time_check',
    clock: 'minecraft:overworld',
    value: { min: 0, max: 12000 },
    period: 24000,
  },
  'msm_b600:sneaking': {
    type: 'minecraft:entity_properties',
    entity: 'this',
    predicate: { 'minecraft:flags': { is_sneaking: true } },
  },
  'msm_b600:is_player': {
    type: 'minecraft:entity_properties',
    entity: 'this',
    predicate: { 'minecraft:entity_type': 'minecraft:player' },
  },
  'msm_b600:tool_any': { type: 'minecraft:match_tool', predicate: {} },
  'msm_b600:killed_by_player': { type: 'minecraft:killed_by_player' },
  'msm_b600:survives_explosion': { type: 'minecraft:survives_explosion' },
  'msm_b600:table_bonus': {
    type: 'minecraft:table_bonus',
    enchantment: 'minecraft:fortune',
    chances: [1.0],
  },
  'msm_b600:damage_fire': {
    type: 'minecraft:damage_source_properties',
    predicate: { tags: [{ id: '#minecraft:is_fire', expected: true }] },
  },
  'msm_b600:plains': {
    type: 'minecraft:location_check',
    predicate: { biomes: 'minecraft:plains' },
  },
  'msm_b600:high': {
    type: 'minecraft:location_check',
    predicate: { position: { y: { min: 100 } } },
  },
  'msm_b600:score5': {
    type: 'minecraft:entity_scores',
    entity: 'this',
    scores: { b600: { min: 5 } },
  },
  'msm_b600:int_check': { type: 'minecraft:int_value_check', value: 4, test: { min: 3, max: 5 } },
  'msm_b600:inverted_zero': { type: 'minecraft:inverted', term: chance(0.0) },
  'msm_b600:all_any': {
    type: 'minecraft:all_of',
    terms: [chance(1.0), { type: 'minecraft:any_of', terms: [chance(0.0), chance(0.5)] }],
  },
  'msm_b600:list_form': { type: 'minecraft:all_of', terms: [chance(1.0), chance(0.5)] },
  'msm_b600:ref': { type: 'minecraft:all_of', terms: ['msm_b600:chance30'] },
  'msm_b600:enchant_active': { type: 'minecraft:enchantment_active_check', active: true },
};
