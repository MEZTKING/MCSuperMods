/**
 * Test helpers for the loot evaluator (B605): a data lookup over files given in the test with
 * B604's tag resolver and conditions, and a stand-in condition tester written from the B600
 * spike's observations (2S1, 2S3), kept to show that the loot code takes any tester through
 * `LootContext.testCondition` and treats its unknown answers honestly.
 */

import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import type { Answer, ConditionTester, LootContext, Situation } from '../../src/index.js';
import { createTagResolver, SimRandom } from '../../src/index.js';

/** Files by folder (`loot_table`, `predicate`, `enchantment`, `tags/item`, ...) and full id. */
export type FakeFiles = Record<string, Record<string, Json>>;

const full = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

function levelOf(enchantments: Readonly<Record<string, number>> | undefined, id: string): number {
  if (!enchantments) return 0;
  return enchantments[full(id)] ?? enchantments[full(id).slice('minecraft:'.length)] ?? 0;
}

function chanceOf(value: Json | undefined): number {
  if (typeof value === 'number') return value;
  const object = value as JsonObject | undefined;
  return typeof object?.value === 'number' ? object.value : 0;
}

function linear(value: Json | undefined, level: number): number {
  if (typeof value === 'number') return value;
  const object = (value ?? {}) as JsonObject;
  return Number(object.base ?? 0) + Number(object.per_level_above_first ?? 0) * (level - 1);
}

/** The stand-in for B604's condition tester. */
export function fakeConditions(files: FakeFiles): ConditionTester {
  const test = (c: Json | undefined, s: Situation, ctx: LootContext): Answer => {
    if (c === undefined) return 'yes';
    if (Array.isArray(c)) {
      let answer: Answer = 'yes';
      for (const part of c) {
        const one = test(part, s, ctx);
        if (one === 'no') return 'no';
        if (one === 'unknown') answer = 'unknown';
      }
      return answer;
    }
    if (typeof c === 'string') {
      const file = files.predicate?.[full(c)];
      return file === undefined ? 'unknown' : test(file, s, ctx);
    }
    const o = c as JsonObject;
    const type = String(o.type ?? '').replace(/^minecraft:/, '');
    const r = ctx.random;
    switch (type) {
      case 'random_chance':
        return r.next() < chanceOf(o.chance) ? 'yes' : 'no';
      case 'random_chance_with_enchanted_bonus': {
        const level = levelOf(s.killer?.weapon?.enchantments, String(o.enchantment));
        const chance =
          level > 0 ? linear(o.enchanted_chance, level) : chanceOf(o.unenchanted_chance);
        return r.next() < chance ? 'yes' : 'no';
      }
      case 'table_bonus': {
        const level = levelOf(s.tool?.enchantments, String(o.enchantment));
        const chances = (o.chances as number[]) ?? [];
        return r.next() < (chances[Math.min(level, chances.length - 1)] ?? 0) ? 'yes' : 'no';
      }
      case 'survives_explosion':
        if (!s.explosion?.decays) return 'yes';
        return r.next() <= 1 / s.explosion.power ? 'yes' : 'no';
      case 'killed_by_player':
        return s.killer?.player ? 'yes' : 'no';
      case 'match_tool': {
        const predicate = (o.predicate ?? {}) as JsonObject;
        const keys = Object.keys(predicate);
        if (keys.length === 0) return s.tool ? 'yes' : 'no';
        const subs = (predicate.predicates ?? {}) as JsonObject;
        const list = subs['minecraft:enchantments'] as JsonObject[] | undefined;
        if (keys.join() !== 'predicates' || !list) return 'unknown';
        if (!s.tool) return 'no';
        return list.every(
          (e) =>
            levelOf(s.tool?.enchantments, String(e.enchantments)) >=
            Number((e.levels as JsonObject)?.min ?? 1),
        )
          ? 'yes'
          : 'no';
      }
      case 'inverted': {
        const inner = test(o.term, s, ctx);
        return inner === 'unknown' ? 'unknown' : inner === 'yes' ? 'no' : 'yes';
      }
      case 'all_of':
        return test(o.terms, s, ctx);
      case 'any_of': {
        let answer: Answer = 'no';
        for (const part of (o.terms as Json[]) ?? []) {
          const one = test(part, s, ctx);
          if (one === 'yes') return 'yes';
          if (one === 'unknown') answer = 'unknown';
        }
        return answer;
      }
      default:
        return 'unknown';
    }
  };
  return (condition, situation, ctx) => {
    const answer = test(condition, situation, ctx as LootContext);
    const type =
      typeof condition === 'object' && condition !== null && !Array.isArray(condition)
        ? String(condition.type ?? '')
        : String(condition);
    return {
      answer,
      parts: { path: '', type, answer, parts: [] },
      unsupported:
        answer === 'unknown' ? [{ kind: 'condition', type, path: '', reason: 'needs_world' }] : [],
    };
  };
}

/**
 * A loot context over fake files with a seeded random source: B604's tag resolver and condition
 * tester by default (`stand-in: true` uses the stand-in conditions above instead).
 */
export function fakeContext(
  files: FakeFiles,
  types: TargetFacts,
  seed = 1,
  extra: Partial<LootContext> & { readonly standIn?: boolean } = {},
): LootContext {
  const lookup = (folder: string, id: string): Json | undefined => files[folder]?.[full(id)];
  const tags = createTagResolver(lookup);
  const { standIn, ...rest } = extra;
  return {
    random: new SimRandom(seed),
    lookup,
    resolveTag: (registry, id) => tags(registry, id.replace(/^#/, '')),
    types,
    ids: (folder) => Object.keys(files[folder] ?? {}),
    ...(standIn ? { testCondition: fakeConditions(files) } : {}),
    ...rest,
  };
}

/** The game's key of a stack in the B600 results: item, enchantments, damage step. */
export function spikeKey(
  stack: { id: string; enchantments?: Readonly<Record<string, number>>; damage?: number },
  maxDamage: number | undefined,
): string {
  let key = stack.id;
  const parts = Object.entries(stack.enchantments ?? {}).map(
    ([id, level]) => `${id.split(':')[1]}${level}`,
  );
  if (parts.length > 0) key += `|${parts.sort().join(',')}`;
  if (stack.damage !== undefined && maxDamage) {
    const lost = Math.round((1 - stack.damage) * maxDamage);
    if (lost > 0) key += `|dmg${Math.floor((lost * 20) / maxDamage)}`;
  }
  return key;
}
