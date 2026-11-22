/**
 * Loot functions and item modifiers (B605, ADR 0120 D3): a modifier is one function, a list of
 * functions and item modifier ids, or one id (`modifier` of a table, pool or entry; an item
 * modifier file). Each function is applied to each stack on its own, its `condition` tried for
 * that stack. Item modifiers are loot functions, so the item modifier view uses this code too.
 *
 * Fidelity (B600 2S1, 2S3): checked on the real server: `set_count` (with `add`),
 * `limit_count`, `apply_bonus` (its three formulas), `enchanted_count_increase` (with `limit`;
 * the level is the killer's weapon's, not a tool's), `explosion_decay` (each item kept with
 * 1 / power, only when the explosion decays drops), `set_damage` (the fraction of durability
 * left), `enchant_randomly`, `enchant_with_levels`, `sequence`, `set_name`, `set_lore`,
 * `set_enchantments`, `furnace_smelt`, `set_components`. About right (written from their fields):
 * `set_item`, `discard` and the component setters. Only in the game (reported, the stack left as
 * it was): the functions that copy from a block entity or an entity, maps, random dyes and
 * potions, and container contents.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { Env } from '../predicates/env.js';
import { testItem } from '../predicates/subjects.js';
import { addEnchantments, enchantRandomly, enchantWithLevels } from './enchant.js';
import { floatValue, intProvider, intValue } from './numbers.js';
import {
  asNumber,
  asObject,
  check,
  fullId,
  idList,
  type LootFidelity,
  levelOf,
  listOf,
  lookupFile,
  MAX_DEPTH,
  nextInt,
  type RollState,
  report,
  tainted,
  typeName,
  use,
  type WorkStack,
} from './state.js';

type Apply = (state: RollState, fn: JsonObject, stack: WorkStack, path: string) => void;

interface FunctionHandler {
  readonly fidelity: LootFidelity;
  readonly apply?: Apply;
  /** Why a type only the game runs is not worked out (default: not supported). */
  readonly reason?: 'needs_world';
}

/** Sets a component on a stack. */
function setComponent(stack: WorkStack, key: string, value: Json): void {
  stack.components = { ...(stack.components ?? {}), [key]: value };
}

/** A component of a stack. */
function component(stack: WorkStack, key: string): Json | undefined {
  return stack.components?.[key];
}

/** A list changed by a list operation (`mode`: append, insert, replace_all, replace_section). */
function listOperation(old: readonly Json[], added: readonly Json[], fn: JsonObject): Json[] {
  const mode = typeof fn.mode === 'string' ? fn.mode : 'append';
  const offset = Math.max(0, Math.min(old.length, asNumber(fn.offset) ?? 0));
  switch (mode) {
    case 'replace_all':
      return [...added];
    case 'insert':
      return [...old.slice(0, offset), ...added, ...old.slice(offset)];
    case 'replace_section': {
      const size = asNumber(fn.size) ?? added.length;
      return [...old.slice(0, offset), ...added, ...old.slice(offset + size)];
    }
    default:
      return [...old, ...added];
  }
}

/** The tool's level of an enchantment (`apply_bonus`). */
function toolLevel(state: RollState, enchantment: Json | undefined): number {
  return typeof enchantment === 'string'
    ? levelOf(state.situation.tool?.enchantments, enchantment)
    : 0;
}

/** The killer's weapon's level of an enchantment (`enchanted_count_increase`). */
function attackerLevel(state: RollState, enchantment: Json | undefined): number {
  return typeof enchantment === 'string'
    ? levelOf(state.situation.killer?.weapon?.enchantments, enchantment)
    : 0;
}

/** The item a furnace makes of an item: the caller's reader, else the project's and vanilla recipes. */
function smelted(state: RollState, id: string, path: string): string | undefined {
  const given = state.ctx.smelt?.(id);
  if (given) return fullId(given);
  let table = state.cache.get('smelt') as Map<string, string> | undefined;
  if (!table) {
    const recipes = state.ctx.ids?.('recipe');
    if (!recipes) {
      report(state, 'function', 'furnace_smelt', path, 'missing_file');
      return undefined;
    }
    table = new Map();
    for (const recipeId of recipes) {
      const recipe = asObject(lookupFile(state, 'recipe', recipeId));
      if (!recipe || typeName(recipe.type) !== 'smelting') continue;
      const result = asObject(recipe.result)?.id ?? recipe.result;
      if (typeof result !== 'string') continue;
      for (const input of idList(state, 'item', recipe.ingredient, path)) {
        if (!table.has(input)) table.set(input, fullId(result));
      }
    }
    state.cache.set('smelt', table);
  }
  return table.get(id);
}

/** A count limit's bound (`limit_count`'s `min` or `max`). */
function bound(state: RollState, value: Json | undefined, path: string): number | undefined {
  return value === undefined ? undefined : intValue(state, value, path);
}

/** Whether a stack passes `filtered`'s item predicate (B604's item predicate test). */
function matches(
  state: RollState,
  predicate: Json | undefined,
  stack: WorkStack,
  path: string,
): boolean {
  const env: Env = { situation: state.situation, ctx: state.ctx, unsupported: [], refs: [] };
  const answer = testItem(stack, predicate, path, env);
  for (const note of env.unsupported) report(state, note.kind, note.type, note.path, note.reason);
  if (answer === 'unknown') state.taint = true;
  return answer !== 'no';
}

const FUNCTIONS: Readonly<Record<string, FunctionHandler>> = {
  apply_bonus: {
    fidelity: 'checked',
    apply(state, fn, stack, path) {
      const level = toolLevel(state, fn.enchantment);
      const formula = typeName(fn.formula);
      const parameters = asObject(fn.parameters) ?? {};
      if (formula === 'ore_drops') {
        if (level > 0) stack.count *= Math.max(0, nextInt(state.random, level + 2) - 1) + 1;
      } else if (formula === 'uniform_bonus_count') {
        const multiplier = asNumber(parameters.bonusMultiplier) ?? 1;
        if (level > 0) stack.count += nextInt(state.random, level * multiplier + 1);
      } else if (formula === 'binomial_with_bonus_count') {
        const trials = level + (asNumber(parameters.extra) ?? 0);
        const p = asNumber(parameters.probability) ?? 0;
        for (let i = 0; i < trials; i += 1) if (state.random.next() < p) stack.count += 1;
      } else {
        report(state, 'formula', formula || 'no formula', `${path}/formula`, 'not_supported');
      }
    },
  },
  copy_components: { fidelity: 'only_in_game', reason: 'needs_world' },
  copy_custom_data: { fidelity: 'only_in_game', reason: 'needs_world' },
  copy_name: { fidelity: 'only_in_game', reason: 'needs_world' },
  copy_state: {
    fidelity: 'about_right',
    apply(state, fn, stack, path) {
      const block = state.situation.block;
      if (!block) {
        report(state, 'function', 'copy_state', path, 'needs_world');
        return;
      }
      const wanted = listOf(fn.properties).filter((p): p is string => typeof p === 'string');
      const picked: JsonObject = {};
      for (const name of wanted) {
        const value = block.state?.[name];
        if (value !== undefined) picked[name] = value;
      }
      setComponent(stack, 'minecraft:block_state', picked);
    },
  },
  discard: {
    fidelity: 'about_right',
    apply(_state, _fn, stack) {
      stack.count = 0;
    },
  },
  enchant_randomly: { fidelity: 'checked', apply: enchantRandomly },
  enchant_with_levels: { fidelity: 'checked', apply: enchantWithLevels },
  enchanted_count_increase: {
    fidelity: 'checked',
    apply(state, fn, stack, path) {
      const level = attackerLevel(state, fn.enchantment);
      if (level <= 0) return;
      stack.count += Math.round(level * floatValue(state, fn.count, `${path}/count`));
      const limit = asNumber(fn.limit) ?? 0;
      if (limit > 0) stack.count = Math.min(stack.count, limit);
    },
  },
  exploration_map: { fidelity: 'only_in_game', reason: 'needs_world' },
  explosion_decay: {
    fidelity: 'checked',
    apply(state, _fn, stack) {
      const explosion = state.situation.explosion;
      if (!explosion?.decays || explosion.power <= 0) return;
      const keep = 1 / explosion.power;
      let kept = 0;
      for (let i = 0; i < stack.count; i += 1) if (state.random.next() <= keep) kept += 1;
      stack.count = kept;
    },
  },
  fill_player_head: { fidelity: 'only_in_game', reason: 'needs_world' },
  filtered: {
    fidelity: 'about_right',
    apply(state, fn, stack, path) {
      const pass = matches(state, fn.item_filter, stack, `${path}/item_filter`);
      const branch = pass ? (fn.on_pass ?? fn.modifier) : fn.on_fail;
      const key = pass ? (fn.on_pass === undefined ? 'modifier' : 'on_pass') : 'on_fail';
      if (branch !== undefined) applyToStack(state, branch, stack, `${path}/${key}`);
    },
  },
  furnace_smelt: {
    fidelity: 'checked',
    apply(state, _fn, stack, path) {
      const result = smelted(state, stack.id, path);
      if (result) stack.id = result;
    },
  },
  limit_count: {
    fidelity: 'checked',
    apply(state, fn, stack, path) {
      const limit = fn.limit;
      if (typeof limit === 'number') {
        stack.count = Math.min(stack.count, limit);
        return;
      }
      const object = asObject(limit) ?? {};
      const min = bound(state, object.min, `${path}/limit/min`);
      const max = bound(state, object.max, `${path}/limit/max`);
      if (min !== undefined) stack.count = Math.max(stack.count, min);
      if (max !== undefined) stack.count = Math.min(stack.count, max);
    },
  },
  modify_contents: { fidelity: 'only_in_game' },
  sequence: {
    fidelity: 'checked',
    apply(state, fn, stack, path) {
      applyToStack(state, fn.functions, stack, `${path}/functions`);
    },
  },
  set_attributes: {
    fidelity: 'about_right',
    apply(state, fn, stack, path) {
      const old = asObject(component(stack, 'minecraft:attribute_modifiers'));
      const before =
        fn.replace === false && Array.isArray(old?.modifiers) ? old.modifiers : ([] as Json[]);
      const added: Json[] = [];
      for (const [i, item] of listOf(fn.modifiers).entries()) {
        const modifier = asObject(item);
        if (!modifier) continue;
        const slots = listOf(modifier.slot);
        const slot = slots.length > 0 ? slots[nextInt(state.random, slots.length)] : 'any';
        added.push({
          amount: floatValue(state, modifier.amount, `${path}/modifiers/${i}/amount`),
          attribute: modifier.attribute ?? null,
          id: modifier.id ?? null,
          operation: modifier.operation ?? null,
          slot: slot ?? 'any',
        });
      }
      setComponent(stack, 'minecraft:attribute_modifiers', { modifiers: [...before, ...added] });
    },
  },
  set_banner_pattern: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const old = component(stack, 'minecraft:banner_patterns');
      const before = fn.append === true && Array.isArray(old) ? old : [];
      setComponent(stack, 'minecraft:banner_patterns', [...before, ...listOf(fn.patterns)]);
    },
  },
  set_book_cover: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const book = { ...(asObject(component(stack, 'minecraft:written_book_content')) ?? {}) };
      for (const key of ['title', 'author', 'generation']) {
        const value = fn[key];
        if (value !== undefined) book[key] = value;
      }
      setComponent(stack, 'minecraft:written_book_content', book);
    },
  },
  set_components: {
    fidelity: 'checked',
    apply(_state, fn, stack) {
      const patch = asObject(fn.components) ?? {};
      const next = { ...(stack.components ?? {}) };
      for (const [key, value] of Object.entries(patch)) {
        if (key.startsWith('!')) {
          delete next[fullId(key.slice(1))];
          if (fullId(key.slice(1)) === 'minecraft:enchantments') delete stack.enchantments;
        } else if (fullId(key) === 'minecraft:enchantments' && asObject(value)) {
          const levels = asObject(asObject(value)?.levels) ?? asObject(value) ?? {};
          stack.enchantments = Object.fromEntries(
            Object.entries(levels)
              .filter((pair): pair is [string, number] => typeof pair[1] === 'number')
              .map(([id, level]) => [fullId(id), level]),
          );
        } else {
          next[fullId(key)] = value;
        }
      }
      stack.components = next;
    },
  },
  set_contents: { fidelity: 'only_in_game' },
  set_count: {
    fidelity: 'checked',
    apply(state, fn, stack, path) {
      const n = intValue(state, fn.count, `${path}/count`);
      stack.count = fn.add === true ? stack.count + n : n;
    },
  },
  set_custom_data: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const old = asObject(component(stack, 'minecraft:custom_data'));
      const tag = asObject(fn.tag);
      setComponent(
        stack,
        'minecraft:custom_data',
        tag ? { ...(old ?? {}), ...tag } : (fn.tag ?? null),
      );
    },
  },
  set_custom_model_data: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const data = { ...(asObject(component(stack, 'minecraft:custom_model_data')) ?? {}) };
      for (const key of ['floats', 'flags', 'strings', 'colors']) {
        const value = fn[key];
        if (value === undefined) continue;
        const operation = asObject(value);
        const values = operation ? listOf(operation.values) : listOf(value);
        const old = Array.isArray(data[key]) ? (data[key] as Json[]) : [];
        data[key] = listOperation(old, values, operation ?? { mode: 'replace_all' });
      }
      setComponent(stack, 'minecraft:custom_model_data', data);
    },
  },
  set_damage: {
    fidelity: 'checked',
    apply(state, fn, stack, path) {
      const value = floatValue(state, fn.damage, `${path}/damage`);
      const left = fn.add === true ? (stack.damage ?? 1) + value : value;
      stack.damage = Math.min(1, Math.max(0, left));
    },
  },
  set_enchantments: {
    fidelity: 'checked',
    apply(state, fn, stack, path) {
      const given = asObject(fn.enchantments) ?? {};
      const levels: Record<string, number> = {};
      for (const [id, value] of Object.entries(given)) {
        const level = intValue(state, value, `${path}/enchantments/${id}`);
        const before = fn.add === true ? levelOf(stack.enchantments, id) : 0;
        levels[fullId(id)] = Math.min(255, before + level);
      }
      addEnchantments(stack, levels);
    },
  },
  set_firework_explosion: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const explosion = { ...(asObject(component(stack, 'minecraft:firework_explosion')) ?? {}) };
      for (const [key, value] of Object.entries(fn)) {
        if (key !== 'function' && key !== 'type' && key !== 'condition') explosion[key] = value;
      }
      setComponent(stack, 'minecraft:firework_explosion', explosion);
    },
  },
  set_fireworks: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const fireworks = { ...(asObject(component(stack, 'minecraft:fireworks')) ?? {}) };
      if (fn.flight_duration !== undefined) fireworks.flight_duration = fn.flight_duration;
      const explosions = asObject(fn.explosions);
      if (explosions) {
        const old = Array.isArray(fireworks.explosions) ? fireworks.explosions : [];
        fireworks.explosions = listOperation(old, listOf(explosions.values), explosions);
      }
      setComponent(stack, 'minecraft:fireworks', fireworks);
    },
  },
  set_instrument: {
    fidelity: 'about_right',
    apply(state, fn, stack, path) {
      const options = idList(state, 'instrument', fn.options, `${path}/options`);
      if (options.length === 0) return;
      setComponent(
        stack,
        'minecraft:instrument',
        options[nextInt(state.random, options.length)] ?? null,
      );
    },
  },
  set_item: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      if (typeof fn.item === 'string') stack.id = fullId(fn.item);
    },
  },
  set_loot_table: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const loot: JsonObject = { loot_table: fn.name ?? null };
      if (fn.seed !== undefined) loot.seed = fn.seed;
      setComponent(stack, 'minecraft:container_loot', loot);
    },
  },
  set_lore: {
    fidelity: 'checked',
    apply(_state, fn, stack) {
      const old = component(stack, 'minecraft:lore');
      setComponent(
        stack,
        'minecraft:lore',
        listOperation(Array.isArray(old) ? old : [], listOf(fn.lore), fn),
      );
    },
  },
  set_name: {
    fidelity: 'checked',
    apply(_state, fn, stack) {
      const target = fn.target === 'item_name' ? 'minecraft:item_name' : 'minecraft:custom_name';
      if (fn.name !== undefined) setComponent(stack, target, fn.name);
    },
  },
  set_ominous_bottle_amplifier: {
    fidelity: 'about_right',
    apply(state, fn, stack, path) {
      const amplifier = intValue(state, fn.amplifier, `${path}/amplifier`);
      setComponent(
        stack,
        'minecraft:ominous_bottle_amplifier',
        Math.min(4, Math.max(0, amplifier)),
      );
    },
  },
  set_potion: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      if (typeof fn.id !== 'string') return;
      const contents = { ...(asObject(component(stack, 'minecraft:potion_contents')) ?? {}) };
      contents.potion = fullId(fn.id);
      setComponent(stack, 'minecraft:potion_contents', contents);
    },
  },
  set_random_dyes: { fidelity: 'only_in_game' },
  set_random_potion: { fidelity: 'only_in_game' },
  set_stew_effect: {
    fidelity: 'about_right',
    apply(state, fn, stack, path) {
      const effects = listOf(fn.effects);
      if (effects.length === 0) return;
      const i = nextInt(state.random, effects.length);
      const effect = asObject(effects[i]) ?? {};
      const duration = intProvider(state, effect.duration, `${path}/effects/${i}/duration`);
      setComponent(stack, 'minecraft:suspicious_stew_effects', [
        { duration, id: effect.type ?? null },
      ]);
    },
  },
  set_writable_book_pages: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const book = { ...(asObject(component(stack, 'minecraft:writable_book_content')) ?? {}) };
      const old = Array.isArray(book.pages) ? book.pages : [];
      book.pages = listOperation(old, listOf(fn.pages), fn);
      setComponent(stack, 'minecraft:writable_book_content', book);
    },
  },
  set_written_book_pages: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const book = { ...(asObject(component(stack, 'minecraft:written_book_content')) ?? {}) };
      const old = Array.isArray(book.pages) ? book.pages : [];
      book.pages = listOperation(old, listOf(fn.pages), fn);
      setComponent(stack, 'minecraft:written_book_content', book);
    },
  },
  toggle_tooltips: {
    fidelity: 'about_right',
    apply(_state, fn, stack) {
      const display = { ...(asObject(component(stack, 'minecraft:tooltip_display')) ?? {}) };
      const hidden = new Set(
        listOf(display.hidden_components).filter((v): v is string => typeof v === 'string'),
      );
      for (const [key, shown] of Object.entries(asObject(fn.toggles) ?? {})) {
        if (shown === false) hidden.add(fullId(key));
        else hidden.delete(fullId(key));
      }
      display.hidden_components = [...hidden].sort();
      setComponent(stack, 'minecraft:tooltip_display', display);
    },
  },
};

/** Every loot function type the evaluator knows, with how close it is to the game. */
export const LOOT_FUNCTION_SUPPORT: Readonly<Record<string, LootFidelity>> = Object.fromEntries(
  Object.entries(FUNCTIONS).map(([type, handler]) => [type, handler.fidelity]),
);

/** Applies one function to one stack (its condition tried for that stack). */
function applyFunction(state: RollState, fn: JsonObject, stack: WorkStack, path: string): void {
  const type = typeName(fn.type);
  const handler = FUNCTIONS[type];
  const touched = tainted(state, () => {
    if (!check(state, fn.condition, `${path}/condition`)) return;
    if (!handler) {
      report(state, 'function', type || 'no type', path, 'not_supported');
      return;
    }
    use(state, 'function', type, handler.fidelity);
    if (!handler.apply) {
      report(state, 'function', type, path, handler.reason ?? 'not_supported');
      return;
    }
    handler.apply(state, fn, stack, path);
  });
  if (touched) stack.uncertain = true;
}

/**
 * Applies a modifier (one function, an item modifier id, or a list of both) to one stack,
 * in order.
 */
export function applyToStack(
  state: RollState,
  modifier: Json | undefined,
  stack: WorkStack,
  path: string,
  depth = 0,
): void {
  if (modifier === undefined || modifier === null) return;
  if (Array.isArray(modifier)) {
    for (const [i, item] of modifier.entries()) {
      applyToStack(state, item, stack, `${path}/${i}`, depth);
    }
    return;
  }
  if (typeof modifier === 'string') {
    const id = fullId(modifier);
    const file = lookupFile(state, 'item_modifier', id);
    if (file === undefined || depth >= MAX_DEPTH) {
      report(state, 'reference', id, path, file === undefined ? 'missing_file' : 'not_supported');
      stack.uncertain = true;
      return;
    }
    applyToStack(state, file, stack, `${path}=>${id}`, depth + 1);
    return;
  }
  const fn = asObject(modifier);
  if (fn) applyFunction(state, fn, stack, path);
}

/** Applies a modifier to every stack. */
export function applyModifier(
  state: RollState,
  modifier: Json | undefined,
  stacks: WorkStack[],
  path: string,
): void {
  if (modifier === undefined) return;
  for (const stack of stacks) applyToStack(state, modifier, stack, path);
}
