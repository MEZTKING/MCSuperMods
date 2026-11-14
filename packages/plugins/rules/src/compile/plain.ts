/**
 * Plain rules (ADR 0082 D3): a rule without conditions whose every step is an "(A)" step with a
 * matching target and plain numbers compiles to format actions (`action.mcdoc`) only. The
 * mapping of each "(A)" step:
 *
 * | Step | Action | Plain when |
 * |---|---|---|
 * | `give_item` | `give_item` | `who` is the player and the trigger has one; `count` a whole number |
 * | `heal`, `hurt` | `heal`, `damage` | `who` has an action target on the trigger; `amount` a number |
 * | `launch` | `launch` | as `heal`; `strength` and `up` numbers |
 * | `give_effect` | `apply_effect` | as `heal`; `seconds` a number; `amplifier` is `level` minus 1 |
 * | `place_block` | `set_block_state` | the trigger's "here" is a block; `where` is here, above here or a whole offset from here |
 * | `run_function` | `run_function` | always |
 * | `light_portal` | `light_portal` | `where` is here |
 * | `play_sound` | `play_sound` | `where` is here |
 * | `spawn_particles` | `spawn_particle` | `where` is here |
 * | `play_animation` | `play_animation` | the trigger has the mob (mob triggers) |
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { asArray, asObject, conditionList, num, stepList, str } from '../book';
import { stepById, type TriggerEntry } from '../catalogue';

/** Whether `rule` has conditions that hold it back. */
export const hasConditions = (rule: JsonObject): boolean =>
  conditionList(asObject(rule.only_if)).conditions.length > 0;

const isWhole = (value: number): boolean => Number.isInteger(value);

/** `[x, y, z]` from `here` for a plain `set_block_state`, or undefined. */
function blockOffset(where: Json | undefined): [number, number, number] | undefined {
  if (where === undefined || where === 'here') return [0, 0, 0];
  if (where === 'above_here') return [0, 1, 0];
  const object = asObject(where);
  if (str(object, 'place') !== 'offset') return undefined;
  const from = object?.from;
  if (from !== undefined && from !== 'here') return undefined;
  const offset = asArray(object?.offset);
  if (offset.length !== 3 || !offset.every((part) => typeof part === 'number' && isWhole(part))) {
    return undefined;
  }
  return offset as [number, number, number];
}

const atHere = (step: JsonObject): boolean => step.where === undefined || step.where === 'here';

/** The action target of `who` on `trigger`, or undefined when it has none. */
function targetOf(step: JsonObject, trigger: TriggerEntry, fallback: string): string | undefined {
  const who = step.who ?? fallback;
  if (who === 'player' || who === 'mob' || who === 'other') return trigger.actionTargets[who];
  return undefined;
}

/** The format action of one step, or undefined when the step is not plain on `trigger`. */
export function plainAction(step: JsonObject, trigger: TriggerEntry): JsonObject | undefined {
  const id = str(step, 'step') ?? '';
  const entry = stepById(id);
  if (entry?.action === undefined) return undefined;
  switch (id) {
    case 'give_item': {
      const who = step.who ?? 'player';
      const count = step.count;
      if (who !== 'player' || !trigger.actors.includes('player')) return undefined;
      if (count !== undefined && (typeof count !== 'number' || !isWhole(count) || count < 1)) {
        return undefined;
      }
      const item = str(step, 'item');
      if (item === undefined) return undefined;
      return { type: 'give_item', item, ...(count === undefined ? {} : { count }) };
    }
    case 'heal':
    case 'hurt': {
      const target = targetOf(step, trigger, 'player');
      const amount = step.amount;
      if (target === undefined || typeof amount !== 'number') return undefined;
      return { type: entry.action, amount, target };
    }
    case 'launch': {
      const target = targetOf(step, trigger, 'player');
      const strength = step.strength;
      const up = step.up;
      if (target === undefined || typeof strength !== 'number') return undefined;
      if (up !== undefined && typeof up !== 'number') return undefined;
      const direction = str(step, 'direction');
      return {
        type: 'launch',
        strength,
        ...(direction === undefined ? {} : { direction }),
        ...(up === undefined ? {} : { up }),
        target,
      };
    }
    case 'give_effect': {
      const target = targetOf(step, trigger, 'player');
      const seconds = step.seconds;
      const effect = str(step, 'effect');
      if (target === undefined || typeof seconds !== 'number' || effect === undefined) {
        return undefined;
      }
      const level = num(step, 'level');
      return {
        type: 'apply_effect',
        effect,
        seconds,
        ...(level === undefined || level <= 1 ? {} : { amplifier: Math.round(level) - 1 }),
        target,
      };
    }
    case 'place_block': {
      const offset = blockOffset(step.where);
      const block = str(step, 'block');
      if (!trigger.hereIsBlock || offset === undefined || block === undefined) return undefined;
      return {
        type: 'set_block_state',
        state: block,
        ...(offset.every((part) => part === 0) ? {} : { offset }),
      };
    }
    case 'run_function': {
      const fn = str(step, 'function');
      return fn === undefined ? undefined : { type: 'run_function', function: fn };
    }
    case 'light_portal': {
      const portal = str(step, 'portal');
      return portal === undefined || !atHere(step) ? undefined : { type: 'light_portal', portal };
    }
    case 'play_sound': {
      const sound = str(step, 'sound');
      if (sound === undefined || !atHere(step)) return undefined;
      const volume = num(step, 'volume');
      const pitch = num(step, 'pitch');
      return {
        type: 'play_sound',
        sound,
        ...(volume === undefined ? {} : { volume }),
        ...(pitch === undefined ? {} : { pitch }),
      };
    }
    case 'spawn_particles': {
      const particle = step.particle;
      if (particle === undefined || !atHere(step)) return undefined;
      const count = num(step, 'count');
      const spread = num(step, 'spread');
      const speed = num(step, 'speed');
      return {
        type: 'spawn_particle',
        particle,
        ...(count === undefined ? {} : { count }),
        ...(spread === undefined ? {} : { spread }),
        ...(speed === undefined ? {} : { speed }),
      };
    }
    case 'play_animation': {
      const animation = str(step, 'animation');
      if (animation === undefined || trigger.group !== 'mobs') return undefined;
      const controller = str(step, 'controller');
      return {
        type: 'play_animation',
        animation,
        ...(controller === undefined ? {} : { controller }),
      };
    }
    default:
      return undefined;
  }
}

/** The format actions of a plain rule, in order, or undefined when the rule needs a script. */
export function plainActions(rule: JsonObject, trigger: TriggerEntry): JsonObject[] | undefined {
  if (hasConditions(rule)) return undefined;
  const actions: JsonObject[] = [];
  for (const { step } of stepList(rule)) {
    const action = plainAction(step, trigger);
    if (action === undefined) return undefined;
    actions.push(action);
  }
  return actions;
}
