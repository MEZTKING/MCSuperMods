/**
 * Conditions by type id (B604; ADR 0120 D4). The type ids are the data's own `type` (or the older
 * `condition`), read without `minecraft:`; this file holds no version literal. The types a target
 * lists (`loot_condition_type`) are either handled in {@link CONDITIONS} or named in
 * {@link CONDITIONS_ONLY_IN_THE_GAME} with plain words (the schema walk checks both targets).
 *
 * Checked on the real server by B600: `random_chance`, `random_chance_with_enchanted_bonus`,
 * `table_bonus`, `survives_explosion`, `killed_by_player`, `match_tool` (enchantments),
 * `inverted`, `all_of`, `any_of`, `weather_check`, `time_check`, `entity_properties` (type,
 * flags), `entity_scores`, `int_value_check`, `location_check` (position, biome) and predicate
 * ids. About right (written from the fields): `match_block`, `float_value_check`, the rest of
 * `match_tool`'s item predicate, `damage_source_properties` within the situation's damage.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { normaliseId } from '../tags/lookup.js';
import type { Answer, PartResult } from './api.js';
import {
  allOf,
  answerOf,
  anyOf,
  chanceAllOf,
  chanceAnyOf,
  type Env,
  fixedChance,
  not,
  objectOf,
  part,
  pointer,
  report,
  typeOf,
} from './env.js';
import { floatValue, inRange, intValue, levelValue } from './numbers.js';
import { enchantmentLevel, entityFields, entityFor } from './situation.js';
import { testBlock, testDamage, testEntity, testItem, testLocation } from './subjects.js';

/** Works out one condition of a given type. */
export type ConditionHandler = (condition: JsonObject, path: string, env: Env) => PartResult;

/** Plain words for the condition types only the game can answer. */
export const CONDITIONS_ONLY_IN_THE_GAME: Readonly<Record<string, string>> = {
  enchantment_active_check:
    "Whether an enchantment is active: only inside an enchantment's own effects, in the game.",
  environment_attribute_check:
    'An environment attribute of the world at a place: only the game knows it.',
};

/** A part that draws one random number with a known chance of yes. */
function draw(path: string, type: string, chance: number, env: Env): PartResult {
  const answer = answerOf(env.ctx.random.next() < chance);
  return part(path, type, answer, [], Math.min(1, Math.max(0, chance)));
}

/** A part that does not draw. */
function settled(path: string, type: string, answer: Answer, parts: readonly PartResult[] = []) {
  return part(path, type, answer, parts, fixedChance(answer));
}

/** A part whose answer came from a drawn number (its chance is not worked out). */
function sampled(path: string, type: string, answer: Answer, random: boolean): PartResult {
  return random ? part(path, type, answer) : settled(path, type, answer);
}

function unknownPart(path: string, type: string): PartResult {
  return part(path, type, 'unknown');
}

/** A list of conditions (or ids), all of which must pass. */
function listPart(list: readonly Json[], path: string, type: string, env: Env): PartResult {
  const parts = list.map((term, i) => testCondition(term, pointer(path, i), env));
  return part(path, type, allOf(parts.map((p) => p.answer)), parts, chanceAllOf(parts));
}

/** The conditions handled, by type id without `minecraft:`. */
export const CONDITIONS: Readonly<Record<string, ConditionHandler>> = {
  all_of(condition, path, env) {
    const terms = condition.terms;
    if (Array.isArray(terms)) return listPart(terms, pointer(path, 'terms'), 'all_of', env);
    const only = testCondition(terms, pointer(path, 'terms'), env);
    return part(path, 'all_of', only.answer, [only], only.chance);
  },
  any_of(condition, path, env) {
    const terms = Array.isArray(condition.terms) ? condition.terms : [condition.terms ?? null];
    const parts = terms.map((term, i) =>
      testCondition(
        term,
        Array.isArray(condition.terms)
          ? pointer(pointer(path, 'terms'), i)
          : pointer(path, 'terms'),
        env,
      ),
    );
    return part(path, 'any_of', anyOf(parts.map((p) => p.answer)), parts, chanceAnyOf(parts));
  },
  inverted(condition, path, env) {
    const inner = testCondition(condition.term, pointer(path, 'term'), env);
    return part(
      path,
      'inverted',
      not(inner.answer),
      [inner],
      inner.chance === undefined ? undefined : 1 - inner.chance,
    );
  },
  random_chance(condition, path, env) {
    const chance = floatValue(condition.chance, pointer(path, 'chance'), env);
    if (chance === undefined) return unknownPart(path, 'random_chance');
    const result = draw(path, 'random_chance', chance.value, env);
    return chance.random ? part(path, 'random_chance', result.answer) : result;
  },
  random_chance_with_enchanted_bonus(condition, path, env) {
    const type = 'random_chance_with_enchanted_bonus';
    // The attacker's weapon, not a tool (B600: Fortune on a mining tool changed nothing).
    const enchantment = typeof condition.enchantment === 'string' ? condition.enchantment : '';
    const level = enchantmentLevel(env.situation.killer?.weapon, enchantment);
    const unenchanted =
      typeof condition.unenchanted_chance === 'number' ? condition.unenchanted_chance : 0;
    const chance =
      level > 0
        ? levelValue(condition.enchanted_chance, level, pointer(path, 'enchanted_chance'), env)
        : unenchanted;
    if (chance === undefined) return unknownPart(path, type);
    return draw(path, type, chance, env);
  },
  table_bonus(condition, path, env) {
    const enchantment = typeof condition.enchantment === 'string' ? condition.enchantment : '';
    const chances = Array.isArray(condition.chances)
      ? condition.chances.filter((c): c is number => typeof c === 'number')
      : [];
    if (chances.length === 0) {
      report(env, 'condition', 'table_bonus', pointer(path, 'chances'), 'not_supported');
      return unknownPart(path, 'table_bonus');
    }
    // No tool is level 0 (B600: the game answered with the first chance).
    const level = enchantmentLevel(env.situation.tool, enchantment);
    return draw(path, 'table_bonus', chances[Math.min(level, chances.length - 1)] ?? 0, env);
  },
  survives_explosion(_condition, path, env) {
    const explosion = env.situation.explosion;
    // Only an explosion whose cause decays drops (B600: a block's did, TNT's did not).
    if (explosion === undefined || !explosion.decays || explosion.power <= 0) {
      return settled(path, 'survives_explosion', 'yes');
    }
    return draw(path, 'survives_explosion', 1 / explosion.power, env);
  },
  killed_by_player(condition, path, env) {
    const killed = env.situation.killer?.player === true;
    // `inverse` is the older form; the game answers no without a killer (B600).
    return settled(
      path,
      'killed_by_player',
      answerOf(condition.inverse === true ? !killed : killed),
    );
  },
  match_tool(condition, path, env) {
    const answer = testItem(
      env.situation.tool,
      condition.predicate,
      pointer(path, 'predicate'),
      env,
    );
    return settled(path, 'match_tool', answer);
  },
  match_block(condition, path, env) {
    // The block predicate's fields sit in the condition itself.
    const { type: _type, condition: _condition, ...predicate } = condition;
    return settled(path, 'match_block', testBlock(predicate, path, env));
  },
  weather_check(condition, path, env) {
    const weather = env.situation.weather;
    if (weather === undefined) {
      report(env, 'condition', 'weather_check', path, 'needs_world');
      return unknownPart(path, 'weather_check');
    }
    const answers: Answer[] = [];
    if (typeof condition.raining === 'boolean')
      answers.push(answerOf(weather.raining === condition.raining));
    if (typeof condition.thundering === 'boolean') {
      answers.push(answerOf(weather.thundering === condition.thundering));
    }
    return settled(path, 'weather_check', allOf(answers));
  },
  time_check(condition, path, env) {
    const time = env.situation.time;
    const clock = typeof condition.clock === 'string' ? normaliseId(condition.clock) : undefined;
    if (time === undefined || (clock !== undefined && normaliseId(time.clock) !== clock)) {
      report(env, 'condition', 'time_check', path, 'needs_world');
      return unknownPart(path, 'time_check');
    }
    const period =
      typeof condition.period === 'number' && condition.period > 0 ? condition.period : 0;
    const ticks = period > 0 ? ((time.ticks % period) + period) % period : time.ticks;
    const result = inRange(ticks, condition.value, 'int', pointer(path, 'value'), env);
    return sampled(path, 'time_check', result.answer, result.random);
  },
  entity_properties(condition, path, env) {
    const found = entityFor(condition.entity, env.situation);
    if (found.status === 'unknown') {
      report(
        env,
        'condition',
        `entity ${String(condition.entity)}`,
        pointer(path, 'entity'),
        'needs_world',
      );
      return unknownPart(path, 'entity_properties');
    }
    if (found.status === 'none') return settled(path, 'entity_properties', 'no');
    const answer = testEntity(found.entity, condition.predicate, pointer(path, 'predicate'), env);
    return settled(path, 'entity_properties', answer);
  },
  entity_scores(condition, path, env) {
    const found = entityFor(condition.entity, env.situation);
    if (found.status === 'unknown') {
      report(
        env,
        'condition',
        `entity ${String(condition.entity)}`,
        pointer(path, 'entity'),
        'needs_world',
      );
      return unknownPart(path, 'entity_scores');
    }
    if (found.status === 'none') return settled(path, 'entity_scores', 'no');
    const scores = entityFields(found.entity).scores ?? {};
    const answers: Answer[] = [];
    let random = false;
    for (const [objective, range] of Object.entries(objectOf(condition.scores) ?? {})) {
      const scorePath = pointer(pointer(path, 'scores'), objective);
      const score = scores[objective];
      if (score === undefined) {
        report(env, 'condition', `score ${objective}`, scorePath, 'needs_world');
        answers.push('unknown');
        continue;
      }
      const result = inRange(score, range, 'int', scorePath, env);
      random ||= result.random;
      answers.push(result.answer);
    }
    return sampled(path, 'entity_scores', allOf(answers), random);
  },
  int_value_check(condition, path, env) {
    const value = intValue(condition.value, pointer(path, 'value'), env);
    if (value === undefined) return unknownPart(path, 'int_value_check');
    const result = inRange(
      value.value,
      condition.range ?? condition.test,
      'int',
      pointer(path, 'test'),
      env,
    );
    return sampled(path, 'int_value_check', result.answer, value.random || result.random);
  },
  float_value_check(condition, path, env) {
    const value = floatValue(condition.value, pointer(path, 'value'), env);
    if (value === undefined) return unknownPart(path, 'float_value_check');
    const result = inRange(value.value, condition.test, 'float', pointer(path, 'test'), env);
    return sampled(path, 'float_value_check', result.answer, value.random || result.random);
  },
  location_check(condition, path, env) {
    const offset: [number, number, number] = [
      typeof condition.offsetX === 'number' ? condition.offsetX : 0,
      typeof condition.offsetY === 'number' ? condition.offsetY : 0,
      typeof condition.offsetZ === 'number' ? condition.offsetZ : 0,
    ];
    const answer = testLocation(
      condition.predicate,
      pointer(path, 'predicate'),
      env,
      undefined,
      offset,
    );
    return settled(path, 'location_check', answer);
  },
  damage_source_properties(condition, path, env) {
    const answer = testDamage(condition.predicate, pointer(path, 'predicate'), env);
    return settled(path, 'damage_source_properties', answer);
  },
};

/** A predicate named by id: its file is read through the context's lookup. */
function reference(id: string, path: string, env: Env): PartResult {
  if (id.startsWith('#')) {
    report(env, 'reference', id, path, 'not_supported');
    return unknownPart(path, 'reference');
  }
  const full = normaliseId(id);
  const key = `predicate:${full}`;
  if (env.refs.includes(key)) {
    report(env, 'reference', full, path, 'not_supported');
    return unknownPart(path, 'reference');
  }
  const file = env.ctx.lookup(env.ctx.types.folders.data.predicate, full);
  if (file === undefined) {
    report(env, 'reference', full, path, 'missing_file');
    return unknownPart(path, 'reference');
  }
  const inner = testCondition(file, `${full}#`, { ...env, refs: [...env.refs, key] });
  return part(path, 'reference', inner.answer, [inner], inner.chance);
}

/**
 * Works out a condition: an object with a `type`, a list (all must pass) or a predicate id. A
 * type neither handled nor known is unknown and noted (`not_supported`); a type only the game
 * answers is unknown and noted (`needs_world`).
 */
export function testCondition(condition: Json | undefined, path: string, env: Env): PartResult {
  if (condition === undefined) return settled(path, 'none', 'yes');
  if (typeof condition === 'string') return reference(condition, path, env);
  if (Array.isArray(condition)) return listPart(condition, path, 'all_of', env);
  const object = objectOf(condition);
  const type = object === undefined ? undefined : typeOf(object);
  if (object === undefined || type === undefined) {
    report(env, 'condition', 'missing', path, 'not_supported');
    return unknownPart(path, 'missing');
  }
  const handler = Object.hasOwn(CONDITIONS, type) ? CONDITIONS[type] : undefined;
  if (handler === undefined) {
    const reason = Object.hasOwn(CONDITIONS_ONLY_IN_THE_GAME, type)
      ? 'needs_world'
      : 'not_supported';
    report(env, 'condition', type, path, reason);
    return unknownPart(path, type);
  }
  return handler(object, path, env);
}
