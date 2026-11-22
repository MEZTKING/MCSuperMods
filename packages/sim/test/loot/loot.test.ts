/**
 * The loot evaluator, part by part (B605): each entry type, each function type, the seed, the
 * odds in steps, unknown answers, enchantment providers, additions and trial spawners. The
 * odds against the game are in `measured.test.ts`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import type { Json, JsonObject, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  applyItemModifier,
  enchantmentProviderOdds,
  type LootStack,
  lootOdds,
  type OddsStep,
  rollEnchantmentProvider,
  rollLoot,
  type Situation,
  trialSpawnerSummary,
  withLootAdditions,
} from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';
import { type FakeFiles, fakeContext } from './helpers.js';

/** The oldest target. */
const TARGET = (await builtInTargets()).at(-1) as Target;
const PACK = JSON.parse(
  readFileSync(new URL('./b600-pack.json', import.meta.url), 'utf8'),
) as FakeFiles;
const CHEST: Situation = { context: 'minecraft:chest' };

const item = (name: string, extra: JsonObject = {}): JsonObject => ({
  type: 'minecraft:item',
  name,
  ...extra,
});
const pool = (entries: Json[], extra: JsonObject = {}): JsonObject => ({
  rolls: 1,
  entries,
  ...extra,
});
const table = (...pools: JsonObject[]): JsonObject => ({ pools });

/** Files with a few test items' facts, enchantments and recipes of our own. */
const FILES: FakeFiles = {
  ...PACK,
  enchantment: {
    ...PACK.enchantment,
    'test:sharp': {
      description: 'Sharp',
      exclusive_set: 'test:blunt',
      max_cost: { base: 60, per_level_above_first: 0 },
      max_level: 3,
      min_cost: { base: 1, per_level_above_first: 0 },
      supported_items: '#test:blades',
      weight: 10,
    },
    'test:blunt': {
      description: 'Blunt',
      max_cost: { base: 60, per_level_above_first: 0 },
      max_level: 1,
      min_cost: { base: 1, per_level_above_first: 0 },
      supported_items: '#test:blades',
      weight: 10,
    },
  },
  'tags/item': {
    ...PACK['tags/item'],
    'test:blades': { values: ['minecraft:iron_sword'] },
    'test:ores': { values: ['minecraft:iron_ore'] },
  },
  'tags/instrument': { 'test:horns': { values: ['minecraft:ponder_goat_horn'] } },
  recipe: {
    'test:iron': {
      type: 'minecraft:smelting',
      ingredient: '#test:ores',
      result: { id: 'minecraft:iron_ingot' },
    },
  },
  enchantment_provider: {
    'test:single': { type: 'minecraft:single', enchantment: 'test:sharp', level: 2 },
  },
};

const ctx = (seed = 1, extra = {}) => fakeContext(FILES, TARGET, seed, extra);
const roll = (t: Json, situation: Situation = CHEST, seed = 1) => rollLoot(t, situation, ctx(seed));
const one = (t: Json, situation: Situation = CHEST, seed = 1): LootStack[] => [
  ...roll(t, situation, seed).stacks,
];
const modify = (fn: Json, id = 'minecraft:diamond', situation: Situation = CHEST, seed = 1) =>
  applyItemModifier(fn as JsonObject, { id, count: 1 }, situation, ctx(seed));

function lastStep(steps: Iterable<OddsStep>): OddsStep {
  let last: OddsStep | undefined;
  for (const step of steps) last = step;
  if (!last) throw new Error('no step');
  return last;
}

describe('a roll at a seed', () => {
  it('is the same for the same seed and differs for another', () => {
    const t = { pools: [pool([item('minecraft:stone'), item('minecraft:dirt')], { rolls: 20 })] };
    expect(one(t, CHEST, 7)).toEqual(one(t, CHEST, 7));
    expect(one(t, CHEST, 7)).not.toEqual(one(t, CHEST, 8));
  });

  it('runs entry, then pool, then table modifiers', () => {
    const stacks = one(PACK.loot_table?.['msm_b600:table_modifier'] as Json);
    expect(stacks).toEqual([{ id: 'minecraft:apple', count: 4, pool: 0 }]);
  });

  it('rolls a table named by id, and reports one that is missing', () => {
    expect(one('msm_b600:weights')).toHaveLength(1);
    const missing = roll('msm_b600:nope');
    expect(missing.stacks).toEqual([]);
    expect(missing.unsupported).toEqual([
      { kind: 'reference', type: 'msm_b600:nope', path: '', reason: 'missing_file' },
    ]);
  });

  it('stops a table that names itself and says so', () => {
    const files: FakeFiles = {
      loot_table: {
        'test:loop': table(pool([{ type: 'minecraft:loot_table', value: 'test:loop' }])),
      },
    };
    const result = rollLoot('test:loop', CHEST, fakeContext(files, TARGET));
    expect(result.stacks).toEqual([]);
    expect(result.unsupported.some((u) => u.type === 'test:loop')).toBe(true);
  });
});

describe('entries', () => {
  it('item and empty', () => {
    expect(one(table(pool([item('stone')])))).toEqual([
      { id: 'minecraft:stone', count: 1, pool: 0 },
    ]);
    expect(one(table(pool([{ type: 'minecraft:empty' }])))).toEqual([]);
  });

  it('tag, with and without expand', () => {
    const all = one(table(pool([{ type: 'minecraft:tag', items: '#msm_b600:three' }])));
    expect(all.map((s) => s.id)).toEqual(['minecraft:stone', 'minecraft:dirt', 'minecraft:sand']);
    const expanded = one(
      table(pool([{ type: 'minecraft:tag', items: '#msm_b600:three', expand: true }])),
    );
    expect(expanded).toHaveLength(1);
  });

  it('loot_table: an id, an inline table and a list', () => {
    expect(
      one(table(pool([{ type: 'minecraft:loot_table', value: 'msm_b600:two_pools' }]))).length,
    ).toBeGreaterThanOrEqual(1);
    const inline = table(pool([item('minecraft:apple')]));
    expect(one(table(pool([{ type: 'minecraft:loot_table', value: inline }])))).toEqual([
      { id: 'minecraft:apple', count: 1, pool: 0 },
    ]);
    const list = { type: 'minecraft:loot_table', value: [inline, table(pool([item('stick')]))] };
    expect(one(table(pool([list]))).map((s) => s.id)).toEqual([
      'minecraft:apple',
      'minecraft:stick',
    ]);
    const expanded = one(table(pool([{ ...list, expand: true }])));
    expect(expanded).toHaveLength(1);
  });

  it('alternatives, group and sequence', () => {
    const never = { type: 'minecraft:random_chance', chance: 0 };
    const kids = [item('stone', { condition: never }), item('dirt'), item('sand')];
    expect(one(table(pool([{ type: 'minecraft:alternatives', children: kids }])))[0]?.id).toBe(
      'minecraft:dirt',
    );
    const group = { type: 'minecraft:group', children: kids };
    const groupOdds = lastStep(
      lootOdds(table(pool([group])), CHEST, ctx(), {
        rolls: 2000,
        step: 2000,
        cancel: { cancelled: false },
      }),
    );
    expect(groupOdds.rows.map((r) => r.item).sort()).toEqual(['minecraft:dirt', 'minecraft:sand']);
    const seq = {
      type: 'minecraft:sequence',
      children: [item('dirt'), item('stone', { condition: never }), item('sand')],
    };
    const seqOdds = lastStep(
      lootOdds(table(pool([seq])), CHEST, ctx(), {
        rolls: 2000,
        step: 2000,
        cancel: { cancelled: false },
      }),
    );
    expect(seqOdds.rows.map((r) => r.item)).toEqual(['minecraft:dirt']);
  });

  it('dynamic and slots stay candidates and are said to need the game', () => {
    const t = table(pool([{ type: 'minecraft:dynamic', name: 'minecraft:contents' }]));
    const result = roll(t);
    expect(result.stacks).toEqual([]);
    expect(result.unsupported).toEqual([
      { kind: 'entry', type: 'dynamic', path: '/pools/0/entries/0', reason: 'needs_world' },
    ]);
    const half = table(pool([item('stone'), { type: 'minecraft:slots', slot_source: 'x' }]));
    const odds = lastStep(
      lootOdds(half, CHEST, ctx(), { rolls: 20_000, step: 5000, cancel: { cancelled: false } }),
    );
    expect(odds.rows[0]?.chance).toBeGreaterThan(0.48);
    expect(odds.rows[0]?.chance).toBeLessThan(0.52);
    expect(odds.unsupported?.map((u) => u.type)).toEqual(['slots']);
  });

  it('a type it does not know is named, never skipped', () => {
    const result = roll(table(pool([{ type: 'minecraft:made_up' }])));
    expect(result.unsupported).toEqual([
      { kind: 'entry', type: 'made_up', path: '/pools/0/entries/0', reason: 'not_supported' },
    ]);
  });
});

describe('conditions answered unknown', () => {
  it('pass, mark the stacks uncertain and name what the situation lacked', () => {
    const t = table(
      pool([item('stone', { condition: { type: 'minecraft:weather_check', raining: true } })]),
    );
    const result = roll(t);
    expect(result.stacks).toEqual([{ id: 'minecraft:stone', count: 1, uncertain: true, pool: 0 }]);
    expect(result.unsupported.length).toBeGreaterThan(0);
    expect(result.unsupported.every((u) => u.path.startsWith('/pools/0/entries/0/condition'))).toBe(
      true,
    );
  });

  it('mark the rows of the odds, and any tester can stand in', () => {
    const t = table(
      pool([item('stone', { condition: { type: 'minecraft:weather_check', raining: true } })]),
      pool([item('dirt')]),
    );
    const odds = lastStep(
      lootOdds(t, CHEST, ctx(1, { standIn: true }), {
        rolls: 100,
        step: 100,
        cancel: { cancelled: false },
      }),
    );
    expect(odds.rows.find((r) => r.item === 'minecraft:stone')?.uncertain).toBe(true);
    expect(odds.rows.find((r) => r.item === 'minecraft:dirt')?.uncertain).toBeUndefined();
  });

  it('known answers stay yes and no', () => {
    const t = table(pool([item('stone', { condition: { type: 'minecraft:killed_by_player' } })]));
    expect(one(t)).toEqual([]);
    const killer = { type: 'minecraft:player', player: true };
    expect(one(t, { context: 'minecraft:entity', killer })).toHaveLength(1);
  });
});

describe('functions', () => {
  const tool = (enchantments: Record<string, number>): Situation => ({
    context: 'minecraft:block',
    tool: { id: 'minecraft:diamond_pickaxe', count: 1, enchantments },
  });

  it('set_count, with add, and limit_count', () => {
    expect(modify({ type: 'minecraft:set_count', count: 5 }).item.count).toBe(5);
    expect(
      modify([
        { type: 'set_count', count: 5 },
        { type: 'set_count', count: 2, add: true },
      ]).item.count,
    ).toBe(7);
    expect(
      modify([
        { type: 'set_count', count: 9 },
        { type: 'limit_count', limit: { max: 4 } },
      ]).item.count,
    ).toBe(4);
    expect(
      modify([
        { type: 'set_count', count: -3 },
        { type: 'limit_count', limit: { min: 0 } },
      ]).item.count,
    ).toBe(0);
  });

  it('apply_bonus: no Fortune, no bonus; each formula with it', () => {
    const ore = {
      type: 'minecraft:apply_bonus',
      enchantment: 'minecraft:fortune',
      formula: 'minecraft:ore_drops',
    };
    expect(modify(ore, 'minecraft:diamond', tool({})).item.count).toBe(1);
    const counts = new Set<number>();
    for (let seed = 1; seed < 60; seed += 1)
      counts.add(
        modify(ore, 'minecraft:diamond', tool({ 'minecraft:fortune': 3 }), seed).item.count,
      );
    expect([...counts].sort()).toEqual([1, 2, 3, 4]);
    const binomial = {
      type: 'apply_bonus',
      enchantment: 'fortune',
      formula: 'binomial_with_bonus_count',
      parameters: { extra: 3, probability: 1 },
    };
    expect(modify(binomial, 'minecraft:diamond', tool({})).item.count).toBe(4);
    const uniform = {
      type: 'apply_bonus',
      enchantment: 'fortune',
      formula: 'uniform_bonus_count',
      parameters: { bonusMultiplier: 1 },
    };
    expect(modify(uniform, 'minecraft:diamond', tool({})).item.count).toBe(1);
    expect(
      modify({ ...ore, formula: 'minecraft:made_up' }, 'minecraft:diamond', tool({ fortune: 1 }))
        .unsupported[0]?.kind,
    ).toBe('formula');
  });

  it("enchanted_count_increase reads the killer's weapon, not the tool", () => {
    const fn = {
      type: 'minecraft:enchanted_count_increase',
      enchantment: 'minecraft:looting',
      count: 1,
      limit: 3,
    };
    expect(modify(fn, 'minecraft:bone', tool({ 'minecraft:looting': 3 })).item.count).toBe(1);
    const killer = {
      type: 'minecraft:player',
      player: true,
      weapon: { id: 'minecraft:iron_sword', count: 1, enchantments: { 'minecraft:looting': 2 } },
    };
    expect(modify(fn, 'minecraft:bone', { context: 'minecraft:entity', killer }).item.count).toBe(
      3,
    );
    expect(
      modify({ ...fn, limit: 0 }, 'minecraft:bone', { context: 'minecraft:entity', killer }).item
        .count,
    ).toBe(3);
  });

  it('explosion_decay only when the explosion decays drops', () => {
    const decay = [{ type: 'set_count', count: 50 }, { type: 'explosion_decay' }];
    expect(modify(decay).item.count).toBe(50);
    expect(
      modify(decay, 'minecraft:diamond', {
        context: 'minecraft:block',
        explosion: { power: 4, decays: false },
      }).item.count,
    ).toBe(50);
    const kept = modify(decay, 'minecraft:diamond', {
      context: 'minecraft:block',
      explosion: { power: 4, decays: true },
    }).item.count;
    expect(kept).toBeGreaterThan(2);
    expect(kept).toBeLessThan(25);
  });

  it('set_damage sets the durability left, and adds to it', () => {
    expect(modify({ type: 'set_damage', damage: 0.5 }, 'minecraft:iron_sword').item.damage).toBe(
      0.5,
    );
    expect(
      modify(
        [
          { type: 'set_damage', damage: 0.5 },
          { type: 'set_damage', damage: -0.2, add: true },
        ],
        'minecraft:iron_sword',
      ).item.damage,
    ).toBeCloseTo(0.3);
  });

  it('enchant_randomly and enchant_with_levels; a book becomes an enchanted book', () => {
    const random = modify({ type: 'enchant_randomly', options: 'test:sharp' }, 'minecraft:book');
    expect(random.item.id).toBe('minecraft:enchanted_book');
    expect(Object.keys(random.item.enchantments ?? {})).toEqual(['test:sharp']);
    expect(
      modify({ type: 'enchant_randomly', options: 'test:sharp' }, 'minecraft:stick').item
        .enchantments,
    ).toBeUndefined();
    const sword = modify(
      { type: 'enchant_with_levels', levels: 10, options: ['test:sharp', 'test:blunt'] },
      'minecraft:iron_sword',
    );
    const got = Object.keys(sword.item.enchantments ?? {});
    expect(got).toHaveLength(1);
    expect(sword.unsupported).toEqual([]);
    const unknownItem = modify(
      { type: 'enchant_with_levels', levels: 10, options: 'test:sharp' },
      'test:thing',
    );
    expect(unknownItem.unsupported[0]?.reason).toBe('missing_file');
    expect(unknownItem.item.uncertain).toBe(true);
  });

  it('sequence, set_name, set_lore and set_components', () => {
    const named = modify({
      type: 'sequence',
      functions: [
        { type: 'set_name', name: 'Hi', target: 'item_name' },
        { type: 'set_lore', lore: ['a'], mode: 'append' },
        { type: 'set_lore', lore: ['b'], mode: 'insert', offset: 0 },
      ],
    });
    expect(named.item.components).toEqual({
      'minecraft:item_name': 'Hi',
      'minecraft:lore': ['b', 'a'],
    });
    const replaced = modify([
      { type: 'set_lore', lore: ['a', 'b', 'c'], mode: 'append' },
      { type: 'set_lore', lore: ['x'], mode: 'replace_section', offset: 1, size: 1 },
    ]);
    expect(replaced.item.components?.['minecraft:lore']).toEqual(['a', 'x', 'c']);
    const custom = modify({ type: 'set_name', name: 'Bob' });
    expect(custom.item.components).toEqual({ 'minecraft:custom_name': 'Bob' });
    const patched = modify([
      { type: 'set_components', components: { 'minecraft:rarity': 'epic', glider: {} } },
      { type: 'set_components', components: { '!minecraft:glider': {} } },
    ]);
    expect(patched.item.components).toEqual({ 'minecraft:rarity': 'epic' });
  });

  it('set_enchantments, with add', () => {
    const set = modify(
      [
        { type: 'set_enchantments', enchantments: { 'test:sharp': 1 } },
        { type: 'set_enchantments', enchantments: { 'test:sharp': 2 }, add: true },
      ],
      'minecraft:book',
    );
    expect(set.item).toEqual({
      id: 'minecraft:enchanted_book',
      count: 1,
      enchantments: { 'test:sharp': 3 },
    });
  });

  it('furnace_smelt from the caller or from the recipes', () => {
    expect(modify({ type: 'furnace_smelt' }, 'minecraft:iron_ore').item.id).toBe(
      'minecraft:iron_ingot',
    );
    const given = applyItemModifier(
      { type: 'furnace_smelt' },
      { id: 'minecraft:raw_gold', count: 1 },
      CHEST,
      ctx(1, { smelt: () => 'minecraft:gold_ingot' }),
    );
    expect(given.item.id).toBe('minecraft:gold_ingot');
    const none = applyItemModifier(
      { type: 'furnace_smelt' },
      { id: 'minecraft:raw_gold', count: 1 },
      CHEST,
      { ...ctx(), ids: undefined } as never,
    );
    expect(none.unsupported[0]).toMatchObject({ type: 'furnace_smelt', reason: 'missing_file' });
  });

  it('set_item and discard change the odds', () => {
    expect(modify({ type: 'set_item', item: 'emerald' }).item.id).toBe('minecraft:emerald');
    expect(modify({ type: 'discard' }).item.count).toBe(0);
    const t = table(
      pool([
        item('stone', {
          modifier: { type: 'discard', condition: { type: 'random_chance', chance: 0.5 } },
        }),
      ]),
    );
    const odds = lastStep(
      lootOdds(t, CHEST, ctx(), { rolls: 20_000, step: 20_000, cancel: { cancelled: false } }),
    );
    expect(Math.abs((odds.rows[0]?.chance ?? 0) - 0.5)).toBeLessThan(0.02);
  });

  it('filtered runs on_pass or on_fail', () => {
    const fn = {
      type: 'filtered',
      item_filter: { items: 'minecraft:diamond' },
      on_pass: { type: 'set_count', count: 2 },
      on_fail: { type: 'set_count', count: 3 },
    };
    expect(modify(fn).item.count).toBe(2);
    expect(modify(fn, 'minecraft:stone').item.count).toBe(3);
  });

  it('the component setters', () => {
    const c = (fn: JsonObject, id = 'minecraft:diamond') => modify(fn, id).item.components ?? {};
    expect(c({ type: 'set_potion', id: 'swiftness' })).toEqual({
      'minecraft:potion_contents': { potion: 'minecraft:swiftness' },
    });
    expect(c({ type: 'set_custom_data', tag: { a: 1 } })).toEqual({
      'minecraft:custom_data': { a: 1 },
    });
    expect(c({ type: 'set_ominous_bottle_amplifier', amplifier: 9 })).toEqual({
      'minecraft:ominous_bottle_amplifier': 4,
    });
    expect(c({ type: 'set_instrument', options: '#test:horns' })).toEqual({
      'minecraft:instrument': 'minecraft:ponder_goat_horn',
    });
    expect(c({ type: 'set_loot_table', name: 'test:x', seed: 3 })).toEqual({
      'minecraft:container_loot': { loot_table: 'test:x', seed: 3 },
    });
    expect(c({ type: 'toggle_tooltips', toggles: { 'minecraft:enchantments': false } })).toEqual({
      'minecraft:tooltip_display': { hidden_components: ['minecraft:enchantments'] },
    });
    expect(
      c({ type: 'set_stew_effect', effects: [{ type: 'minecraft:speed', duration: 5 }] }),
    ).toEqual({ 'minecraft:suspicious_stew_effects': [{ duration: 5, id: 'minecraft:speed' }] });
    expect(
      c({ type: 'set_banner_pattern', patterns: [{ pattern: 'x', color: 'red' }], append: false }),
    ).toEqual({ 'minecraft:banner_patterns': [{ pattern: 'x', color: 'red' }] });
    expect(c({ type: 'set_writable_book_pages', pages: ['p'], mode: 'append' })).toEqual({
      'minecraft:writable_book_content': { pages: ['p'] },
    });
    expect(c({ type: 'set_written_book_pages', pages: ['p'], mode: 'append' })).toEqual({
      'minecraft:written_book_content': { pages: ['p'] },
    });
    expect(c({ type: 'set_book_cover', title: 'T' })).toEqual({
      'minecraft:written_book_content': { title: 'T' },
    });
    expect(c({ type: 'set_fireworks', flight_duration: 2 })).toEqual({
      'minecraft:fireworks': { flight_duration: 2 },
    });
    expect(c({ type: 'set_firework_explosion', shape: 'star' })).toEqual({
      'minecraft:firework_explosion': { shape: 'star' },
    });
    expect(c({ type: 'set_custom_model_data', floats: [1] })).toEqual({
      'minecraft:custom_model_data': { floats: [1] },
    });
    expect(
      c({
        type: 'set_attributes',
        modifiers: [{ attribute: 'a', amount: 2, operation: 'add_value', id: 'x', slot: 'hand' }],
      }),
    ).toEqual({
      'minecraft:attribute_modifiers': {
        modifiers: [{ amount: 2, attribute: 'a', id: 'x', operation: 'add_value', slot: 'hand' }],
      },
    });
  });

  it('copy_state needs the block', () => {
    expect(
      modify({ type: 'copy_state', block: 'x', properties: ['age'] }).unsupported[0]?.reason,
    ).toBe('needs_world');
    const s: Situation = {
      context: 'minecraft:block',
      block: { id: 'minecraft:wheat', state: { age: '7' } },
    };
    expect(
      modify({ type: 'copy_state', block: 'x', properties: ['age'] }, 'minecraft:wheat', s).item
        .components,
    ).toEqual({ 'minecraft:block_state': { age: '7' } });
  });

  it('the parts only the game knows are named and leave the item as it was', () => {
    for (const type of [
      'copy_name',
      'copy_components',
      'copy_custom_data',
      'fill_player_head',
      'exploration_map',
      'set_random_dyes',
      'set_random_potion',
      'set_contents',
      'modify_contents',
      'made_up',
    ]) {
      const result = modify({ type: `minecraft:${type}` });
      expect(result.item).toEqual({ id: 'minecraft:diamond', count: 1, uncertain: true });
      expect(result.unsupported.map((u) => u.type)).toEqual([type]);
    }
  });

  it('a function condition is tried for each stack', () => {
    const t = table(pool([item('stone')], { rolls: 2 }));
    const withCondition = {
      ...t,
      modifier: { type: 'set_count', count: 5, condition: { type: 'random_chance', chance: 0.5 } },
    };
    const counts = new Set<string>();
    for (let seed = 1; seed < 40; seed += 1)
      counts.add(
        one(withCondition, CHEST, seed)
          .map((s) => s.count)
          .join(','),
      );
    expect(counts.has('1,5') || counts.has('5,1')).toBe(true);
  });

  it('item modifier ids, and a missing one', () => {
    expect(modify('msm_b600:ref' as never).item.count).toBe(5);
    expect(modify('test:nope' as never).unsupported[0]).toMatchObject({
      kind: 'reference',
      reason: 'missing_file',
    });
  });
});

/** The spike's first results file (every target's item modifier answers were the same). */
const SPIKE_RESULTS = (() => {
  const dir = new URL('../../../../docs/reference/spikes/b600/results/', import.meta.url);
  const name =
    readdirSync(dir)
      .filter((n) => n.startsWith('server-'))
      .sort()[0] ?? '';
  return new URL(name, dir);
})();

describe("the B600 spike's item modifier observations", () => {
  const observed = JSON.parse(readFileSync(SPIKE_RESULTS, 'utf8')).mod as Record<
    string,
    { before: string; after: string }
  >;
  const text = (value: Json): Json =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).join() === 'text'
      ? (value.text as Json)
      : value;

  for (const [name, { before, after }] of Object.entries(observed)) {
    it(name, () => {
      const input = JSON.parse(before) as { id: string; count: number };
      const want = JSON.parse(after) as { id: string; count: number; components?: JsonObject };
      const result = applyItemModifier(
        `msm_b600:${name}`,
        input,
        CHEST,
        fakeContext(FILES, TARGET, 1, {
          smelt: (id) => (id === 'minecraft:raw_iron' ? 'minecraft:iron_ingot' : undefined),
        }),
      );
      expect(result.unsupported).toEqual([]);
      expect(result.item.id).toBe(want.id);
      expect(result.item.count).toBe(want.count);
      const components = { ...(want.components ?? {}) };
      const enchantments = components['minecraft:enchantments'];
      delete components['minecraft:enchantments'];
      const damage = components['minecraft:damage'];
      delete components['minecraft:damage'];
      if (enchantments) expect(result.item.enchantments).toEqual(enchantments);
      if (typeof damage === 'number') {
        expect(Math.floor((1 - (result.item.damage ?? 1)) * 1561)).toBe(damage);
      }
      const ours = Object.fromEntries(
        Object.entries(result.item.components ?? {}).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.map(text) : v,
        ]),
      );
      expect(ours).toEqual(components);
    });
  }
});

describe('the odds', () => {
  const weights = PACK.loot_table?.['msm_b600:weights'] as Json;

  it('of a hand-computed table are within 2 points', () => {
    const step = lastStep(
      lootOdds(weights, CHEST, ctx(3), {
        rolls: 100_000,
        step: 25_000,
        cancel: { cancelled: false },
      }),
    );
    const chance = Object.fromEntries(step.rows.map((r) => [r.item, r.chance]));
    expect(Math.abs((chance['minecraft:stone'] ?? 0) - 0.1)).toBeLessThan(0.02);
    expect(Math.abs((chance['minecraft:dirt'] ?? 0) - 0.2)).toBeLessThan(0.02);
    expect(Math.abs((chance['minecraft:sand'] ?? 0) - 0.3)).toBeLessThan(0.02);
    expect(Math.abs((chance['minecraft:gravel'] ?? 0) - 0.4)).toBeLessThan(0.02);
    expect(step.rows.map((r) => r.item)[0]).toBe('minecraft:gravel');
    const uniform = lastStep(
      lootOdds(PACK.loot_table?.['msm_b600:count_uniform'] as Json, CHEST, ctx(), {
        rolls: 100_000,
        step: 100_000,
        cancel: { cancelled: false },
      }),
    );
    expect(uniform.rows[0]?.mean).toBeCloseTo(3.5, 1);
    for (const n of [2, 3, 4, 5])
      expect(Math.abs((uniform.rows[0]?.counts[n] ?? 0) / 100_000 - 0.25)).toBeLessThan(0.02);
  });

  it('come in steps and stop at the cancel token', () => {
    const cancel = { cancelled: false };
    const seen: number[] = [];
    for (const step of lootOdds(weights, CHEST, ctx(), { rolls: 1000, step: 250, cancel })) {
      seen.push(step.done);
      if (step.done === 500) cancel.cancelled = true;
    }
    expect(seen).toEqual([250, 500]);
    const full = [
      ...lootOdds(weights, CHEST, ctx(), { rolls: 1000, step: 300, cancel: { cancelled: false } }),
    ];
    expect(full.map((s) => s.done)).toEqual([300, 600, 900, 1000]);
    const counts = full[3]?.rows.map((r) => Object.values(r.counts).reduce((a, b) => a + b, 0));
    expect(new Set(counts)).toEqual(new Set([1000]));
  });

  it('of a seed do not change with a new seed beyond the tolerance', () => {
    const a = lastStep(
      lootOdds(weights, CHEST, ctx(1), {
        rolls: 50_000,
        step: 50_000,
        cancel: { cancelled: false },
      }),
    );
    const b = lastStep(
      lootOdds(weights, CHEST, ctx(2), {
        rolls: 50_000,
        step: 50_000,
        cancel: { cancelled: false },
      }),
    );
    for (const row of a.rows) {
      const other = b.rows.find((r) => r.item === row.item);
      expect(Math.abs(row.chance - (other?.chance ?? 0))).toBeLessThan(0.02);
    }
  });

  it('group durability left in twentieths and list enchantments per level', () => {
    const damaged = lastStep(
      lootOdds(PACK.loot_table?.['msm_b600:set_damage'] as Json, CHEST, ctx(), {
        rolls: 2000,
        step: 2000,
        cancel: { cancelled: false },
      }),
    );
    expect(damaged.rows.length).toBeGreaterThan(5);
    expect(
      damaged.rows.every((r) => r.damage !== undefined && r.damage >= 0.2 && r.damage <= 0.6),
    ).toBe(true);
    const books = lastStep(
      lootOdds(
        table(
          pool([item('book', { modifier: { type: 'enchant_randomly', options: 'test:sharp' } })]),
        ),
        CHEST,
        ctx(),
        { rolls: 3000, step: 3000, cancel: { cancelled: false } },
      ),
    );
    const levels = books.enchantments?.map((e) => e.level).sort();
    expect(levels).toEqual([1, 2, 3]);
    for (const e of books.enchantments ?? []) expect(Math.abs(e.chance - 1 / 3)).toBeLessThan(0.03);
  });

  it('list the parts used with how close each is', () => {
    const step = lastStep(
      lootOdds(PACK.loot_table?.['msm_b600:count_add'] as Json, CHEST, ctx(), {
        rolls: 10,
        step: 10,
        cancel: { cancelled: false },
      }),
    );
    expect(step.parts).toEqual(
      expect.arrayContaining([
        { kind: 'entry', type: 'item', fidelity: 'checked' },
        { kind: 'function', type: 'set_count', fidelity: 'checked' },
        { kind: 'number', type: 'uniform', fidelity: 'checked' },
      ]),
    );
  });
});

describe('enchantment providers', () => {
  it('single gives its enchantment at its level', () => {
    const result = rollEnchantmentProvider(
      'test:single',
      { id: 'minecraft:iron_sword', count: 1 },
      CHEST,
      ctx(),
    );
    expect(result.item.enchantments).toEqual({ 'test:sharp': 2 });
  });

  it('by_cost picks as the table would; by_cost_with_difficulty needs the world', () => {
    const byCost = {
      type: 'minecraft:by_cost',
      enchantments: ['test:sharp', 'test:blunt'],
      cost: { type: 'minecraft:uniform', min_inclusive: 5, max_inclusive: 10 },
    };
    const odds = lastStep(
      enchantmentProviderOdds(byCost, { id: 'minecraft:iron_sword', count: 1 }, CHEST, ctx(), {
        rolls: 4000,
        step: 4000,
        cancel: { cancelled: false },
      }),
    );
    expect(odds.unsupported).toEqual([]);
    const ids = new Set(odds.enchantments?.map((e) => e.enchantment));
    expect(ids).toEqual(new Set(['test:sharp', 'test:blunt']));
    const hard = rollEnchantmentProvider(
      {
        type: 'by_cost_with_difficulty',
        enchantments: 'test:sharp',
        min_cost: 5,
        max_cost_span: 10,
      },
      { id: 'minecraft:iron_sword', count: 1 },
      CHEST,
      ctx(),
    );
    expect(hard.unsupported[0]).toMatchObject({
      type: 'by_cost_with_difficulty',
      reason: 'needs_world',
    });
    expect(hard.item.uncertain).toBe(true);
  });
});

describe('loot additions', () => {
  it('add their pools after the table own, and the odds tell them apart', () => {
    const base = table(pool([item('stone')]));
    const additions = [
      {
        id: 'test:extra',
        data: { format: 1, tables: ['minecraft:blocks/stone'], pools: [pool([item('diamond')])] },
      },
      {
        id: 'test:other',
        data: { format: 1, tables: ['minecraft:chests/x'], pools: [pool([item('dirt')])] },
      },
    ];
    const withIt = withLootAdditions('blocks/stone', base, additions);
    expect(withIt.ownPools).toBe(1);
    expect(withIt.added).toEqual([{ addition: 'test:extra', pools: [1] }]);
    const odds = lastStep(
      lootOdds(withIt.table, CHEST, ctx(), { rolls: 10, step: 10, cancel: { cancelled: false } }),
    );
    expect(odds.rows.find((r) => r.item === 'minecraft:diamond')?.pools).toEqual([1]);
    expect(odds.rows.find((r) => r.item === 'minecraft:stone')?.pools).toEqual([0]);
  });
});

describe('trial spawners', () => {
  it('sums up the waves per player, the mobs and the rewards', () => {
    const lookup = (folder: string, id: string) => FILES[folder]?.[id];
    const summary = trialSpawnerSummary('msm_b600:waves', lookup, 3);
    expect(summary.waves).toEqual([
      { players: 1, totalMobs: 6, simultaneousMobs: 2 },
      { players: 2, totalMobs: 8, simultaneousMobs: 3 },
      { players: 3, totalMobs: 10, simultaneousMobs: 4 },
    ]);
    expect(summary.mobs).toEqual([
      { id: 'minecraft:zombie', weight: 3, share: 0.75 },
      { id: 'minecraft:skeleton', weight: 1, share: 0.25 },
    ]);
    expect(summary.rewards).toEqual([{ id: 'msm_b600:weights', weight: 1, share: 1 }]);
    expect(summary.defaults).toEqual([]);
    const bare = trialSpawnerSummary({}, lookup);
    expect(bare.defaults).toContain('total_mobs');
    expect(bare.waves[0]).toEqual({ players: 1 });
    expect(trialSpawnerSummary('test:nope', lookup).missing).toEqual(['test:nope']);
  });
});
