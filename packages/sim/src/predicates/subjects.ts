/**
 * The predicates inside conditions (B604): items, entities, places, blocks and damage, tried on
 * what the situation holds. Each answers yes, no or unknown; whatever needs the world (light,
 * structures, NBT, nearby entities, movement) answers unknown and is noted.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { bareName, normaliseId } from '../tags/lookup.js';
import type { Answer, EntitySample, ItemSample } from './api.js';
import { allOf, answerOf, type Env, objectOf, pointer, report } from './env.js';
import { inBounds } from './numbers.js';
import { componentOf, entityFields, storedEnchantments } from './situation.js';

/**
 * Whether `id` is one of `ids`: an id, a `#tag` of `registry`, or a list of ids. A tag the
 * resolver drops (or that has no file, such as a vanilla tag before the Minecraft folder is set
 * up) answers unknown and is noted.
 */
export function matchesIds(
  id: string,
  ids: Json | undefined,
  registry: string,
  path: string,
  env: Env,
): Answer {
  const full = normaliseId(id);
  if (typeof ids === 'string') {
    if (ids.startsWith('#')) {
      const tag = env.ctx.resolveTag(registry, ids.slice(1));
      if (tag.dropped) {
        report(env, 'reference', ids, path, 'missing_file');
        return 'unknown';
      }
      return answerOf(tag.members.some((member) => member.id === full));
    }
    return answerOf(normaliseId(ids) === full);
  }
  if (Array.isArray(ids)) {
    return answerOf(ids.some((entry) => typeof entry === 'string' && normaliseId(entry) === full));
  }
  return 'yes';
}

function sameJson(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => sameJson(value, b[i]));
  }
  const ao = a as JsonObject;
  const bo = b as JsonObject;
  const keys = Object.keys(ao);
  return keys.length === Object.keys(bo).length && keys.every((key) => sameJson(ao[key], bo[key]));
}

/** The enchantment entries of an item predicate (`minecraft:enchantments`, stored ones). */
function enchantmentsMatch(
  held: Readonly<Record<string, number>>,
  entries: Json | undefined,
  path: string,
  env: Env,
): Answer {
  if (!Array.isArray(entries)) return 'yes';
  const answers = entries.map((raw, i): Answer => {
    const entry = objectOf(raw) ?? {};
    const answers: Answer[] = [];
    for (const [key, level] of Object.entries(held)) {
      const idAnswer =
        entry.enchantments === undefined
          ? 'yes'
          : matchesIds(
              key,
              entry.enchantments,
              'enchantment',
              pointer(pointer(path, i), 'enchantments'),
              env,
            );
      const levelFits = entry.levels === undefined ? level >= 1 : inBounds(level, entry.levels);
      answers.push(idAnswer === 'unknown' ? 'unknown' : answerOf(idAnswer === 'yes' && levelFits));
    }
    if (answers.includes('yes')) return 'yes';
    return answers.includes('unknown') ? 'unknown' : 'no';
  });
  return allOf(answers);
}

/** An item predicate on an item; no item answers no (as the game, B600). */
export function testItem(
  item: ItemSample | undefined,
  predicate: Json | undefined,
  path: string,
  env: Env,
): Answer {
  if (item === undefined) return 'no';
  const object = objectOf(predicate) ?? {};
  const answers: Answer[] = [];
  if (object.items !== undefined) {
    answers.push(matchesIds(item.id, object.items, 'item', pointer(path, 'items'), env));
  }
  if (object.count !== undefined) answers.push(answerOf(inBounds(item.count, object.count)));
  const exact = objectOf(object.components);
  if (exact !== undefined) {
    for (const [key, value] of Object.entries(exact)) {
      const keyPath = pointer(pointer(path, 'components'), key);
      if (normaliseId(key) === 'minecraft:enchantments' && item.components === undefined) {
        const held: JsonObject = {};
        for (const [id, level] of Object.entries(item.enchantments ?? {}))
          held[normaliseId(id)] = level;
        const wanted: JsonObject = {};
        for (const [id, level] of Object.entries(objectOf(value) ?? {}))
          wanted[normaliseId(id)] = level;
        answers.push(answerOf(sameJson(held, wanted)));
        continue;
      }
      const has = componentOf(item, key);
      if (has === undefined) {
        // The item's default components are the game's: not known here.
        report(env, 'condition', `item component ${normaliseId(key)}`, keyPath, 'not_supported');
        answers.push('unknown');
      } else {
        answers.push(answerOf(sameJson(has, value)));
      }
    }
  }
  const predicates = objectOf(object.predicates);
  if (predicates !== undefined) {
    for (const [key, value] of Object.entries(predicates)) {
      const keyPath = pointer(pointer(path, 'predicates'), key);
      const name = normaliseId(key);
      if (name === 'minecraft:enchantments') {
        answers.push(enchantmentsMatch(item.enchantments ?? {}, value, keyPath, env));
      } else if (name === 'minecraft:stored_enchantments') {
        answers.push(enchantmentsMatch(storedEnchantments(item), value, keyPath, env));
      } else {
        report(env, 'condition', `item predicate ${name}`, keyPath, 'not_supported');
        answers.push('unknown');
      }
    }
  }
  return allOf(answers);
}

/** The flags an entity predicate can ask about. */
const FLAGS: readonly string[] = [
  'is_on_fire',
  'is_sneaking',
  'is_sprinting',
  'is_swimming',
  'is_baby',
  'is_on_ground',
  'is_flying',
  'is_in_water',
  'is_fall_flying',
];

/** The entity sub-predicates tried here; every other one is noted as needing the world. */
export const ENTITY_PREDICATES_HANDLED: readonly string[] = [
  'effects',
  'entity_tags',
  'entity_type',
  'equipment',
  'flags',
  'location',
  'team',
];

/** An entity predicate on an entity (the situation holds it). */
export function testEntity(
  entity: EntitySample,
  predicate: Json | undefined,
  path: string,
  env: Env,
): Answer {
  const object = objectOf(predicate) ?? {};
  const fields = entityFields(entity);
  const answers: Answer[] = [];
  for (const [rawKey, value] of Object.entries(object)) {
    const key = bareName(rawKey) === 'type' ? 'entity_type' : bareName(rawKey);
    const keyPath = pointer(path, rawKey);
    const unknown = (reason: 'needs_world' | 'not_supported' = 'needs_world'): void => {
      report(env, 'condition', `entity ${key}`, keyPath, reason);
      answers.push('unknown');
    };
    switch (key) {
      case 'entity_type':
        answers.push(matchesIds(entity.type, value, 'entity_type', keyPath, env));
        break;
      case 'flags': {
        for (const [flag, wanted] of Object.entries(objectOf(value) ?? {})) {
          if (typeof wanted !== 'boolean' || !FLAGS.includes(flag)) continue;
          const held = fields.flags?.[flag];
          if (held === undefined) {
            report(env, 'condition', `entity flag ${flag}`, pointer(keyPath, flag), 'needs_world');
            answers.push('unknown');
          } else {
            answers.push(answerOf(held === wanted));
          }
        }
        break;
      }
      case 'team':
        if (fields.team === undefined) unknown();
        else answers.push(answerOf(typeof value === 'string' && fields.team === value));
        break;
      case 'equipment': {
        if (fields.equipment === undefined) {
          unknown();
          break;
        }
        for (const [slot, itemPredicate] of Object.entries(objectOf(value) ?? {})) {
          answers.push(
            testItem(fields.equipment[slot], itemPredicate, pointer(keyPath, slot), env),
          );
        }
        break;
      }
      case 'effects': {
        if (fields.effects === undefined) {
          unknown();
          break;
        }
        const held = new Map(
          Object.entries(fields.effects).map(([id, effect]) => [normaliseId(id), effect]),
        );
        for (const [id, raw] of Object.entries(objectOf(value) ?? {})) {
          const effect = held.get(normaliseId(id));
          const wanted = objectOf(raw) ?? {};
          if (effect === undefined) {
            answers.push('no');
            continue;
          }
          if (wanted.ambient !== undefined || wanted.visible !== undefined) {
            report(
              env,
              'condition',
              'entity effect ambient or visible',
              pointer(keyPath, id),
              'needs_world',
            );
            answers.push('unknown');
            continue;
          }
          answers.push(
            answerOf(
              inBounds(effect.amplifier, wanted.amplifier) &&
                inBounds(effect.duration, wanted.duration),
            ),
          );
        }
        break;
      }
      case 'entity_tags': {
        if (fields.tags === undefined) {
          unknown();
          break;
        }
        const tags = objectOf(value) ?? {};
        const list = (field: string): string[] =>
          Array.isArray(tags[field])
            ? ((tags[field] as Json[]).filter((t) => typeof t === 'string') as string[])
            : [];
        const held = fields.tags;
        const anyOf = list('any_of');
        if (anyOf.length > 0) answers.push(answerOf(anyOf.some((tag) => held.includes(tag))));
        answers.push(answerOf(list('all_of').every((tag) => held.includes(tag))));
        answers.push(answerOf(!list('none_of').some((tag) => held.includes(tag))));
        break;
      }
      case 'location':
        answers.push(testLocation(value, keyPath, env, fields.position));
        break;
      default:
        unknown();
    }
  }
  return allOf(answers);
}

/**
 * A location predicate at the situation's place (offset by `offset`): position, biome and
 * dimension; light, structures, blocks, fluids, smoke and the sky need the world.
 */
export function testLocation(
  predicate: Json | undefined,
  path: string,
  env: Env,
  position?: readonly [number, number, number],
  offset: readonly [number, number, number] = [0, 0, 0],
): Answer {
  const object = objectOf(predicate) ?? {};
  const { situation } = env;
  const answers: Answer[] = [];
  for (const [key, value] of Object.entries(object)) {
    const keyPath = pointer(path, key);
    switch (key) {
      case 'position': {
        const at = position ?? situation.position;
        if (at === undefined) {
          report(env, 'condition', 'location position', keyPath, 'needs_world');
          answers.push('unknown');
          break;
        }
        const axes = objectOf(value) ?? {};
        (['x', 'y', 'z'] as const).forEach((axis, i) => {
          if (axes[axis] === undefined) return;
          answers.push(answerOf(inBounds((at[i] ?? 0) + (offset[i] ?? 0), axes[axis])));
        });
        break;
      }
      case 'biomes':
        if (situation.biome === undefined) {
          report(env, 'condition', 'location biome', keyPath, 'needs_world');
          answers.push('unknown');
        } else {
          answers.push(matchesIds(situation.biome, value, 'worldgen/biome', keyPath, env));
        }
        break;
      case 'dimension':
        if (situation.dimension === undefined) {
          report(env, 'condition', 'location dimension', keyPath, 'needs_world');
          answers.push('unknown');
        } else {
          answers.push(
            answerOf(
              typeof value === 'string' && normaliseId(value) === normaliseId(situation.dimension),
            ),
          );
        }
        break;
      default:
        report(env, 'condition', `location ${key}`, keyPath, 'needs_world');
        answers.push('unknown');
    }
  }
  return allOf(answers);
}

/** A block predicate on the situation's block; no block answers no. */
export function testBlock(predicate: Json | undefined, path: string, env: Env): Answer {
  const block = env.situation.block;
  if (block === undefined) return 'no';
  const object = objectOf(predicate) ?? {};
  const answers: Answer[] = [];
  for (const [key, value] of Object.entries(object)) {
    const keyPath = pointer(path, key);
    if (key === 'blocks') {
      answers.push(matchesIds(block.id, value, 'block', keyPath, env));
    } else if (key === 'state') {
      for (const [property, wanted] of Object.entries(objectOf(value) ?? {})) {
        if (block.state === undefined) {
          report(env, 'condition', 'block state', pointer(keyPath, property), 'not_supported');
          answers.push('unknown');
          continue;
        }
        const held = block.state[property];
        if (held === undefined) {
          answers.push('no');
          continue;
        }
        const range = objectOf(wanted);
        if (range !== undefined) {
          const number = Number(held);
          const fits =
            Number.isFinite(number) &&
            (range.min === undefined || number >= Number(range.min)) &&
            (range.max === undefined || number <= Number(range.max));
          answers.push(answerOf(fits));
        } else {
          answers.push(answerOf(String(wanted) === held));
        }
      }
    } else {
      report(env, 'condition', `block ${key}`, keyPath, 'needs_world');
      answers.push('unknown');
    }
  }
  return allOf(answers);
}

/** A damage source predicate on the situation's damage; no damage answers no (as the game). */
export function testDamage(predicate: Json | undefined, path: string, env: Env): Answer {
  const { damage, killer, directKiller } = env.situation;
  if (damage === undefined) return 'no';
  const object = objectOf(predicate) ?? {};
  const answers: Answer[] = [];
  for (const [key, value] of Object.entries(object)) {
    const keyPath = pointer(path, key);
    switch (key) {
      case 'tags': {
        const list = Array.isArray(value) ? value : [];
        list.forEach((raw, i) => {
          const entry = objectOf(raw) ?? {};
          const inTag = matchesIds(
            damage.type,
            entry.id,
            'damage_type',
            pointer(pointer(keyPath, i), 'id'),
            env,
          );
          if (inTag === 'unknown') answers.push('unknown');
          else answers.push(answerOf((inTag === 'yes') === (entry.expected !== false)));
        });
        break;
      }
      case 'source_entity':
        answers.push(killer === undefined ? 'no' : testEntity(killer, value, keyPath, env));
        break;
      case 'direct_entity':
        answers.push(
          directKiller === undefined ? 'no' : testEntity(directKiller, value, keyPath, env),
        );
        break;
      case 'is_direct': {
        if (directKiller === undefined || killer === undefined) {
          report(env, 'condition', 'damage is_direct', keyPath, 'needs_world');
          answers.push('unknown');
          break;
        }
        const direct = directKiller.type === killer.type;
        answers.push(answerOf(direct === (value === true)));
        break;
      }
      default:
        report(env, 'condition', `damage ${key}`, keyPath, 'not_supported');
        answers.push('unknown');
    }
  }
  return allOf(answers);
}
