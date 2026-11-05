/**
 * Events and actions (ADR 0025 D4): each event of a definition becomes a private method
 * `event_<name>(ServerLevel level, BlockPos base, Vec3 origin, Player player, Entity entity,
 * int depth)` on the owning class, whose body is the actions as straight-line calls to the
 * generated `Actions` helpers. Mirrors the runtime's `EventRunner.run`: the depth guard
 * first (16), then the actions in order; `trigger_event` is a direct call with `depth + 1`;
 * `play_animation` calls `triggerAnim` on entities and is left out with a comment elsewhere
 * (the runtime drops it at load).
 *
 * @packageDocumentation
 */

import { eventMethodNames } from './names';
import { indent, type JavaFile, javaFloat, javaInt, javaString } from './java';
import type { Reader } from './read';

/** Where an event's definition lives. */
export type EventOwnerKind = 'block' | 'item' | 'entity';

/** Action types the generator writes. `run_script` is removed by the exporter beforehand. */
export const ACTION_TYPES = [
  'run_function',
  'spawn_particle',
  'set_block_state',
  'give_item',
  'play_sound',
  'trigger_event',
  'play_animation',
] as const;

/** The default `play_animation` controller (the runtime's `TRIGGERED_CONTROLLER`). */
export const TRIGGERED_CONTROLLER = 'msm_triggered';

/** The parsed `events` object of a definition. */
export interface Events {
  /** Action readers per event id, ids sorted. */
  readonly byId: ReadonlyMap<string, readonly Reader[]>;
  /** Method name per event id. */
  readonly methods: ReadonlyMap<string, string>;
}

/**
 * Reads and checks a definition's `events`: every event has an `actions` list, every action
 * a known `type`, every `trigger_event` names a declared event.
 */
export function readEvents(definition: Reader): Events {
  const events = definition.object('events');
  const byId = new Map<string, Reader[]>();
  if (events !== undefined) {
    for (const id of events.keys()) {
      const event = events.requiredObject(id);
      event.onlyKeys(['actions'], 'event key');
      if (!event.has('actions')) event.fail('actions is missing');
      const actions = event.objects('actions');
      for (const action of actions) {
        const type = action.requiredString('type');
        if (!(ACTION_TYPES as readonly string[]).includes(type)) {
          action.fail(`action type '${type}' cannot be ejected`);
        }
      }
      byId.set(id, actions);
    }
  }
  for (const actions of byId.values()) {
    for (const action of actions) {
      if (action.requiredString('type') === 'trigger_event') {
        const target = action.requiredString('event');
        if (!byId.has(target)) action.fail(`trigger_event names event ${target}, which is not declared in events`);
      }
    }
  }
  return { byId, methods: eventMethodNames([...byId.keys()]) };
}

/**
 * The method name of an event a component names; fails when the event is not declared.
 *
 * @param reader - The component, for the error message.
 * @param events - The definition's events.
 * @param id - The event id.
 */
export function eventMethod(reader: Reader, events: Events, id: string): string {
  return events.methods.get(id) ?? reader.fail(`names event ${id}, which is not declared in events`);
}

/** Whether any action of the events needs the `Actions` helper class. */
export function usesActions(events: Events): boolean {
  for (const actions of events.byId.values()) {
    for (const action of actions) {
      const type = action.requiredString('type');
      if (type !== 'trigger_event' && type !== 'play_animation') return true;
    }
  }
  return false;
}

/** Every `play_animation` of the events as `[controller, animation]`, events in id order. */
export function playAnimations(events: Events): [string, string][] {
  const out: [string, string][] = [];
  for (const actions of events.byId.values()) {
    for (const action of actions) {
      if (action.requiredString('type') === 'play_animation') {
        out.push([action.string('controller', TRIGGERED_CONTROLLER), action.requiredString('animation')]);
      }
    }
  }
  return out;
}

/**
 * A call of an event method from a trigger.
 *
 * @param method - The event method name.
 * @param args - `level, base, origin, player, entity` expressions.
 */
export function fireCall(method: string, args: string): string {
  return `${method}(${args}, 1);`;
}

/**
 * The event methods of a definition, sorted by event id.
 *
 * @param file - The file the methods go into (imports are added to it).
 * @param events - The definition's events.
 * @param kind - The owner's kind; only entities play animations.
 * @param actionsClass - The simple name of the `Actions` helper class as seen from `file`.
 */
export function eventMethods(file: JavaFile, events: Events, kind: EventOwnerKind, actionsClass: string): string[] {
  if (events.byId.size === 0) return [];
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const vec3 = file.use('net.minecraft.world.phys.Vec3');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const entity = file.use('net.minecraft.world.entity.Entity');
  const lines: string[] = [];
  for (const [id, actions] of events.byId) {
    const method = events.methods.get(id) as string;
    lines.push(
      '',
      `/** Event {@code ${id}}. */`,
      `private void ${method}(${serverLevel} level, ${blockPos} base, ${vec3} origin, ${player} player, ${entity} entity, int depth) {`,
    );
    const body: string[] = [
      `if (${actionsClass}.tooDeep(OWNER, ${javaString(id)}, depth)) {`,
      '    return;',
      '}',
    ];
    for (const action of actions) body.push(...actionLines(action, events, kind, actionsClass));
    lines.push(...indent(body), '}');
  }
  return lines;
}

function actionLines(action: Reader, events: Events, kind: EventOwnerKind, actions: string): string[] {
  const type = action.requiredString('type');
  switch (type) {
    case 'run_function':
      action.onlyKeys(['type', 'function'], 'run_function field');
      return [`${actions}.runFunction(OWNER, level, origin, player, ${javaString(action.requiredString('function'))});`];
    case 'spawn_particle': {
      action.onlyKeys(['type', 'particle', 'count', 'spread', 'speed'], 'spawn_particle field');
      const particle = javaString(action.requiredString('particle'));
      const count = javaInt(action.integer('count', 1));
      const spread = javaFloat(action.number('spread', 0));
      const speed = javaFloat(action.number('speed', 0));
      return [`${actions}.spawnParticle(OWNER, level, origin, ${particle}, ${count}, ${spread}, ${speed});`];
    }
    case 'set_block_state': {
      action.onlyKeys(['type', 'state', 'offset'], 'set_block_state field');
      const state = javaString(action.requiredString('state'));
      const offset = offsetOf(action);
      return [`${actions}.setBlockState(OWNER, level, base, ${state}, ${offset.map(javaInt).join(', ')});`];
    }
    case 'give_item':
      action.onlyKeys(['type', 'item', 'count'], 'give_item field');
      return [
        `${actions}.giveItem(OWNER, level, player, ${javaString(action.requiredString('item'))}, ${javaInt(action.integer('count', 1))});`,
      ];
    case 'play_sound': {
      action.onlyKeys(['type', 'sound', 'volume', 'pitch'], 'play_sound field');
      const sound = javaString(action.requiredString('sound'));
      const volume = javaFloat(action.number('volume', 1));
      const pitch = javaFloat(action.number('pitch', 1));
      return [`${actions}.playSound(OWNER, level, origin, entity, ${sound}, ${volume}, ${pitch});`];
    }
    case 'trigger_event': {
      action.onlyKeys(['type', 'event'], 'trigger_event field');
      const method = eventMethod(action, events, action.requiredString('event'));
      return [`${method}(level, base, origin, player, entity, depth + 1);`];
    }
    case 'play_animation': {
      action.onlyKeys(['type', 'animation', 'controller'], 'play_animation field');
      const animation = action.requiredString('animation');
      const controller = action.string('controller', TRIGGERED_CONTROLLER);
      if (kind === 'entity') return [`triggerAnim(${javaString(controller)}, ${javaString(animation)});`];
      return [`// play_animation '${animation.replace(/[\r\n]/g, ' ')}' left out: only entities with GeckoLib play animations.`];
    }
    default:
      return action.fail(`action type '${type}' cannot be ejected`);
  }
}

function offsetOf(action: Reader): [number, number, number] {
  const raw = action.value.offset;
  if (raw === undefined) return [0, 0, 0];
  if (!Array.isArray(raw) || raw.length !== 3 || raw.some((n) => typeof n !== 'number' || !Number.isInteger(n))) {
    return action.fail('offset must be three integers');
  }
  return raw as [number, number, number];
}
