/**
 * Each supported condition type answers yes in one situation and no in another (B604 exit
 * criteria), on both targets; unknown stays unknown through `inverted`, `all_of` and `any_of`;
 * an unknown type is reported.
 */
import type { Json, Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CONDITIONS,
  type EvalContext,
  type Situation,
  testPredicate,
  unsupportedWords,
} from '../../src/index.js';
import { chance, contextFor, type FileTable, targetsOnce } from './helpers.js';

let targets: readonly Target[] = [];
beforeAll(async () => {
  targets = await targetsOnce();
});

const VANILLA: FileTable = {
  predicate: {
    'minecraft:tool/can_silk_touch': {
      type: 'minecraft:match_tool',
      predicate: {
        predicates: {
          'minecraft:enchantments': [{ enchantments: 'minecraft:silk_touch', levels: { min: 1 } }],
        },
      },
    },
  },
  'tags/damage_type': {
    'minecraft:is_fire': { values: ['minecraft:in_fire', 'minecraft:on_fire'] },
  },
  'tags/item': { 'minecraft:pickaxes': { values: ['minecraft:diamond_pickaxe'] } },
  'tags/entity_type': {
    'minecraft:skeletons': { values: ['minecraft:skeleton', 'minecraft:stray'] },
  },
  'tags/block': { 'minecraft:logs': { values: ['minecraft:oak_log'] } },
  'tags/worldgen/biome': { 'minecraft:is_forest': { values: ['minecraft:forest'] } },
  context_int_provider: { 'minecraft:compostable/low': { type: 'minecraft:constant', value: 3 } },
};

const ctx = (seed = 1): EvalContext => contextFor(targets[0] as Target, {}, VANILLA, seed);
const ask = (condition: Json, situation: Situation, seed = 1) =>
  testPredicate(condition, situation, ctx(seed));
const base: Situation = { context: 'minecraft:generic' };

/** [type, condition, a situation answering yes, one answering no]. */
const CASES: readonly [string, Json, Situation, Situation][] = [
  ['random_chance', chance(1), base, base],
  ['all_of', { type: 'all_of', terms: [chance(1), chance(1)] }, base, base],
  ['any_of', { type: 'any_of', terms: [chance(0), chance(1)] }, base, base],
  ['inverted', { type: 'inverted', term: chance(0) }, base, base],
  [
    'random_chance_with_enchanted_bonus',
    {
      type: 'random_chance_with_enchanted_bonus',
      enchantment: 'minecraft:looting',
      unenchanted_chance: 0,
      enchanted_chance: { type: 'minecraft:linear', base: 1, per_level_above_first: 0 },
    },
    {
      ...base,
      killer: {
        type: 'minecraft:player',
        player: true,
        weapon: { id: 'minecraft:iron_sword', count: 1, enchantments: { 'minecraft:looting': 1 } },
      },
    },
    // Fortune on a mining tool changes nothing: the attacker's weapon counts (B600).
    {
      ...base,
      tool: { id: 'minecraft:iron_pickaxe', count: 1, enchantments: { 'minecraft:looting': 3 } },
    },
  ],
  [
    'table_bonus',
    { type: 'table_bonus', enchantment: 'minecraft:fortune', chances: [0, 1] },
    { ...base, tool: { id: 'minecraft:iron_pickaxe', count: 1, enchantments: { fortune: 3 } } },
    base,
  ],
  [
    'survives_explosion',
    { type: 'survives_explosion' },
    { ...base, explosion: { power: 4, decays: false } },
    { ...base, explosion: { power: 1e9, decays: true } },
  ],
  [
    'killed_by_player',
    { type: 'killed_by_player' },
    { ...base, killer: { type: 'minecraft:player', player: true } },
    { ...base, killer: { type: 'minecraft:zombie', player: false } },
  ],
  [
    'match_tool',
    'minecraft:tool/can_silk_touch',
    {
      ...base,
      tool: { id: 'minecraft:iron_pickaxe', count: 1, enchantments: { 'minecraft:silk_touch': 1 } },
    },
    { ...base, tool: { id: 'minecraft:iron_pickaxe', count: 1 } },
  ],
  [
    'match_block',
    { type: 'match_block', blocks: '#minecraft:logs', state: { axis: 'y' } },
    { ...base, block: { id: 'minecraft:oak_log', state: { axis: 'y' } } },
    { ...base, block: { id: 'minecraft:oak_log', state: { axis: 'x' } } },
  ],
  [
    'weather_check',
    { type: 'weather_check', raining: true, thundering: false },
    { ...base, weather: { raining: true, thundering: false } },
    { ...base, weather: { raining: true, thundering: true } },
  ],
  [
    'time_check',
    { type: 'time_check', clock: 'minecraft:overworld', value: { min: 13000 }, period: 24000 },
    { ...base, time: { clock: 'minecraft:overworld', ticks: 37000 } },
    { ...base, time: { clock: 'overworld', ticks: 1000 } },
  ],
  [
    'entity_properties',
    {
      type: 'entity_properties',
      entity: 'killer',
      predicate: {
        'minecraft:entity_type': '#minecraft:skeletons',
        'minecraft:flags': { is_on_fire: false },
      },
    },
    { ...base, killer: { type: 'minecraft:stray', player: false, flags: { is_on_fire: false } } },
    { ...base, killer: { type: 'minecraft:zombie', player: false, flags: { is_on_fire: false } } },
  ],
  [
    'entity_scores',
    {
      type: 'entity_scores',
      entity: 'this',
      scores: { kills: { min: 'minecraft:compostable/low' } },
    },
    { ...base, thisEntity: { type: 'minecraft:player', scores: { kills: 3 } } },
    { ...base, thisEntity: { type: 'minecraft:player', scores: { kills: 2 } } },
  ],
  [
    'int_value_check',
    { type: 'int_value_check', value: { type: 'minecraft:add', inputs: [2, 2] }, test: 4 },
    base,
    { ...base },
  ],
  [
    'float_value_check',
    {
      type: 'float_value_check',
      value: { type: 'minecraft:mul', inputs: [0.5, 3] },
      test: { max: 1.5 },
    },
    base,
    base,
  ],
  [
    'location_check',
    {
      type: 'location_check',
      offsetY: 1,
      predicate: { biomes: '#minecraft:is_forest', position: { y: { min: 64 } } },
    },
    { ...base, biome: 'minecraft:forest', position: [0, 63, 0] },
    { ...base, biome: 'minecraft:forest', position: [0, 62, 0] },
  ],
  [
    'damage_source_properties',
    {
      type: 'damage_source_properties',
      predicate: { tags: [{ id: '#minecraft:is_fire', expected: true }], is_direct: true },
    },
    {
      ...base,
      damage: { type: 'minecraft:on_fire' },
      killer: { type: 'minecraft:blaze', player: false },
      directKiller: { type: 'minecraft:blaze' },
    },
    {
      ...base,
      damage: { type: 'minecraft:fall' },
      killer: { type: 'minecraft:blaze', player: false },
      directKiller: { type: 'minecraft:blaze' },
    },
  ],
];

/** The no-side of the cases whose yes and no differ only in the condition. */
const NO_CONDITIONS: Readonly<Record<string, Json>> = {
  random_chance: chance(0),
  all_of: { type: 'all_of', terms: [chance(1), chance(0)] },
  any_of: { type: 'any_of', terms: [chance(0), chance(0)] },
  inverted: { type: 'inverted', term: chance(1) },
  int_value_check: {
    type: 'int_value_check',
    value: { type: 'minecraft:add', inputs: [2, 3] },
    test: 4,
  },
  float_value_check: {
    type: 'float_value_check',
    value: { type: 'minecraft:mul', inputs: [0.5, 4] },
    test: { max: 1.5 },
  },
};

describe('each supported condition', () => {
  it('has a yes and a no case, on both targets', () => {
    for (const target of targets) {
      for (const [type, condition, yes, no] of CASES) {
        const yesCtx = contextFor(target, {}, VANILLA, 3);
        const noCtx = contextFor(target, {}, VANILLA, 3);
        const yesResult = testPredicate(condition, yes, yesCtx);
        const noResult = testPredicate(NO_CONDITIONS[type] ?? condition, no, noCtx);
        expect([type, yesResult.answer, yesResult.unsupported]).toEqual([type, 'yes', []]);
        expect([type, noResult.answer, noResult.unsupported]).toEqual([type, 'no', []]);
      }
    }
  });

  it('covers every handled type in the cases', () => {
    expect(CASES.map(([type]) => type).sort()).toEqual(Object.keys(CONDITIONS).sort());
  });
});

describe('unknown', () => {
  it('is reported for a type neither handled nor known', () => {
    const result = ask({ type: 'minecraft:made_up', foo: 1 }, base);
    expect(result.answer).toBe('unknown');
    expect(result.unsupported).toEqual([
      { kind: 'condition', type: 'made_up', path: '', reason: 'not_supported' },
    ]);
    expect(unsupportedWords(result.unsupported[0] as never)).toContain('made_up');
  });

  it('is never turned into no by inverted, and only settles all_of and any_of when it must', () => {
    const weather = { type: 'weather_check', raining: true };
    expect(ask({ type: 'inverted', term: weather }, base).answer).toBe('unknown');
    expect(ask({ type: 'all_of', terms: [weather, chance(1)] }, base).answer).toBe('unknown');
    expect(ask({ type: 'all_of', terms: [weather, chance(0)] }, base).answer).toBe('no');
    expect(ask({ type: 'any_of', terms: [weather, chance(1)] }, base).answer).toBe('yes');
    expect(ask({ type: 'any_of', terms: [weather, chance(0)] }, base).answer).toBe('unknown');
    expect(ask([weather, chance(1)], base).answer).toBe('unknown');
  });

  it('comes from what the situation does not hold, with the part named', () => {
    const flags = ask(
      { type: 'entity_properties', entity: 'this', predicate: { flags: { is_baby: true } } },
      { ...base, thisEntity: { type: 'minecraft:zombie' } },
    );
    expect(flags.answer).toBe('unknown');
    expect(flags.unsupported).toEqual([
      {
        kind: 'condition',
        type: 'entity flag is_baby',
        path: '/predicate/flags/is_baby',
        reason: 'needs_world',
      },
    ]);
    const light = ask(
      { type: 'location_check', predicate: { light: { light: { min: 8 } } } },
      base,
    );
    expect(light.answer).toBe('unknown');
    expect(light.unsupported[0]).toMatchObject({ type: 'location light', reason: 'needs_world' });
    const nbt = ask(
      { type: 'entity_properties', entity: 'this', predicate: { 'minecraft:nbt': '{}' } },
      { ...base, thisEntity: { type: 'minecraft:zombie' } },
    );
    expect(nbt.answer).toBe('unknown');
    const target = ask({ type: 'entity_properties', entity: 'target_entity', predicate: {} }, base);
    expect(target.answer).toBe('unknown');
    const score = ask(
      { type: 'entity_scores', entity: 'this', scores: { x: 1 } },
      { ...base, thisEntity: { type: 'minecraft:pig' } },
    );
    expect(score.answer).toBe('unknown');
    const env = ask(
      { type: 'environment_attribute_check', attribute: 'minecraft:sky_color', value: 0 },
      base,
    );
    expect(env.answer).toBe('unknown');
    expect(unsupportedWords(env.unsupported[0] as never)).toContain('only the game knows');
  });

  it('comes from a vanilla tag that is not there (the Minecraft folder not set up)', () => {
    const result = testPredicate(
      { type: 'match_tool', predicate: { items: '#minecraft:axes' } },
      { ...base, tool: { id: 'minecraft:iron_axe', count: 1 } },
      ctx(),
    );
    expect(result.answer).toBe('unknown');
    expect(result.unsupported[0]).toMatchObject({
      kind: 'reference',
      type: '#minecraft:axes',
      reason: 'missing_file',
    });
  });

  it('stops a predicate that names itself', () => {
    const loop = contextFor(targets[0] as Target, {
      predicate: { 'x:loop': { type: 'all_of', terms: ['x:loop'] } },
    });
    const result = testPredicate('x:loop', base, loop);
    expect(result.answer).toBe('unknown');
    expect(result.unsupported[0]).toMatchObject({ kind: 'reference', type: 'x:loop' });
  });
});

describe('the parts', () => {
  it('answer one by one, with their paths', () => {
    const result = ask(
      {
        type: 'all_of',
        terms: [chance(1), { type: 'killed_by_player' }, 'minecraft:tool/can_silk_touch'],
      },
      base,
    );
    expect(result.answer).toBe('no');
    expect(result.parts.parts.map((p) => [p.path, p.type, p.answer])).toEqual([
      ['/terms/0', 'random_chance', 'yes'],
      ['/terms/1', 'killed_by_player', 'no'],
      ['/terms/2', 'reference', 'no'],
    ]);
    expect(result.parts.parts[2]?.parts[0]).toMatchObject({
      path: 'minecraft:tool/can_silk_touch#',
      type: 'match_tool',
    });
  });

  it('read the older `condition` key as the type', () => {
    expect(ask({ condition: 'minecraft:random_chance', chance: 1 }, base).answer).toBe('yes');
  });

  it('are the same for the same seed', () => {
    const condition = {
      type: 'random_chance',
      chance: { type: 'minecraft:uniform', min: 0, max: 1 },
    };
    const run = (seed: number) =>
      Array.from({ length: 20 }, () => 0).map(() => ask(condition, base, seed).answer);
    expect(run(5)).toEqual(run(5));
  });
});
