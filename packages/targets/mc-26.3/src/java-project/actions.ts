/**
 * Events and actions (ADR 0025 D4): each event of a definition becomes a private method
 * `event_<name>(ServerLevel level, BlockPos base, Vec3 origin, Player player, Entity entity,
 * int depth)` on the owning class, whose body is the actions as straight-line calls to the
 * generated `Actions` helpers. Mirrors the runtime's `EventRunner.run`: the depth guard
 * first (16), then the actions in order; `trigger_event` is a direct call with `depth + 1`;
 * `play_animation` calls `triggerAnim` on entities and is left out with a comment elsewhere
 * (the runtime drops it at load); `apply_effect` (ADR 0044 D2) gives its effect to `self` (the
 * player, else the entity of an entity definition) or `other` (the player for block and item
 * events; for entity events the player, or the mob an entity hits through `on_attack`, passed
 * as an extra `LivingEntity other` parameter only to entity definitions that need it).
 *
 * @packageDocumentation
 */

import { indent, type JavaFile, javaFloat, javaInt, javaString } from './java';
import { eventMethodNames } from './names';
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
  'apply_effect',
  'launch',
] as const;

/** The default `play_animation` controller (the runtime's `TRIGGERED_CONTROLLER`). */
export const TRIGGERED_CONTROLLER = 'msm_triggered';

/** The parsed `events` object of a definition. */
export interface Events {
  /** Action readers per event id, ids sorted. */
  readonly byId: ReadonlyMap<string, readonly Reader[]>;
  /** Method name per event id. */
  readonly methods: ReadonlyMap<string, string>;
  /**
   * Whether the event methods take a `LivingEntity other` parameter after `entity`: entity
   * definitions with an `apply_effect` whose target is `other` (blocks and items use `player`).
   */
  readonly otherParameter: boolean;
  /** Whether any action is `apply_effect` (the `Actions` helper then has `applyEffect`). */
  readonly appliesEffects: boolean;
  /** Whether any action is `launch` (the `Actions` helper then has `launch`, ADR 0052). */
  readonly launches: boolean;
}

/**
 * Reads and checks a definition's `events`: every event has an `actions` list, every action
 * a known `type`, every `trigger_event` names a declared event.
 */
export function readEvents(definition: Reader, kind: EventOwnerKind): Events {
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
        if (!byId.has(target))
          action.fail(`trigger_event names event ${target}, which is not declared in events`);
      }
    }
  }
  let appliesEffects = false;
  let launches = false;
  let otherTarget = false;
  for (const actions of byId.values()) {
    for (const action of actions) {
      const type = action.requiredString('type');
      if (type !== 'apply_effect' && type !== 'launch') continue;
      if (type === 'apply_effect') appliesEffects = true;
      else launches = true;
      if (effectTarget(action) === 'other') otherTarget = true;
    }
  }
  return {
    byId,
    methods: eventMethodNames([...byId.keys()]),
    otherParameter: kind === 'entity' && otherTarget,
    appliesEffects,
    launches,
  };
}

/** The `target` of an `apply_effect`: `self` (the default) or `other`. */
function effectTarget(action: Reader): string {
  const target = action.string('target', 'self');
  if (target !== 'self' && target !== 'other') {
    action.fail(`target '${target}' is not one of self, other`);
  }
  return target;
}

/**
 * The duration in ticks of `seconds`, as the runtime's `Math.round(seconds * 20)` over Java
 * floats.
 */
export function ticksOf(seconds: number): number {
  return Math.round(Math.fround(Math.fround(seconds) * 20));
}

/**
 * The method name of an event a component names; fails when the event is not declared.
 *
 * @param reader - The component, for the error message.
 * @param events - The definition's events.
 * @param id - The event id.
 */
export function eventMethod(reader: Reader, events: Events, id: string): string {
  return (
    events.methods.get(id) ?? reader.fail(`names event ${id}, which is not declared in events`)
  );
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
        out.push([
          action.string('controller', TRIGGERED_CONTROLLER),
          action.requiredString('animation'),
        ]);
      }
    }
  }
  return out;
}

/**
 * A call of an event method from a trigger.
 *
 * @param method - The event method name.
 * @param args - `level, base, origin, player, entity` expressions, plus `other` when the
 *   events take it ({@link Events.otherParameter}).
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
export function eventMethods(
  file: JavaFile,
  events: Events,
  kind: EventOwnerKind,
  actionsClass: string,
): string[] {
  if (events.byId.size === 0) return [];
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const vec3 = file.use('net.minecraft.world.phys.Vec3');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const entity = file.use('net.minecraft.world.entity.Entity');
  const other = events.otherParameter
    ? `, ${file.use('net.minecraft.world.entity.LivingEntity')} other`
    : '';
  const lines: string[] = [];
  for (const [id, actions] of events.byId) {
    const method = events.methods.get(id) as string;
    lines.push(
      '',
      `/** Event {@code ${id}}. */`,
      `private void ${method}(${serverLevel} level, ${blockPos} base, ${vec3} origin, ${player} player, ${entity} entity${other}, int depth) {`,
    );
    const body: string[] = [
      `if (${actionsClass}.tooDeep(OWNER, ${javaString(id)}, depth)) {`,
      '    return;',
      '}',
    ];
    for (const action of actions) {
      body.push(...actionLines(file, action, events, kind, actionsClass));
    }
    lines.push(...indent(body), '}');
  }
  return lines;
}

function actionLines(
  file: JavaFile,
  action: Reader,
  events: Events,
  kind: EventOwnerKind,
  actions: string,
): string[] {
  const type = action.requiredString('type');
  switch (type) {
    case 'run_function':
      action.onlyKeys(['type', 'function'], 'run_function field');
      return [
        `${actions}.runFunction(OWNER, level, origin, player, ${javaString(action.requiredString('function'))});`,
      ];
    case 'spawn_particle': {
      action.onlyKeys(['type', 'particle', 'count', 'spread', 'speed'], 'spawn_particle field');
      const particle = javaString(action.requiredString('particle'));
      const count = javaInt(action.integer('count', 1));
      const spread = javaFloat(action.number('spread', 0));
      const speed = javaFloat(action.number('speed', 0));
      return [
        `${actions}.spawnParticle(OWNER, level, origin, ${particle}, ${count}, ${spread}, ${speed});`,
      ];
    }
    case 'set_block_state': {
      action.onlyKeys(['type', 'state', 'offset'], 'set_block_state field');
      const state = javaString(action.requiredString('state'));
      const offset = offsetOf(action);
      return [
        `${actions}.setBlockState(OWNER, level, base, ${state}, ${offset.map(javaInt).join(', ')});`,
      ];
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
      const other = events.otherParameter ? ', other' : '';
      return [`${method}(level, base, origin, player, entity${other}, depth + 1);`];
    }
    case 'play_animation': {
      action.onlyKeys(['type', 'animation', 'controller'], 'play_animation field');
      const animation = action.requiredString('animation');
      const controller = action.string('controller', TRIGGERED_CONTROLLER);
      if (kind === 'entity')
        return [`triggerAnim(${javaString(controller)}, ${javaString(animation)});`];
      return [
        `// play_animation '${animation.replace(/[\r\n]/g, ' ')}' left out: only entities with GeckoLib play animations.`,
      ];
    }
    case 'apply_effect': {
      action.onlyKeys(['type', 'effect', 'seconds', 'amplifier', 'target'], 'apply_effect field');
      const effect = javaString(action.requiredString('effect'));
      const seconds = action.requiredNumber('seconds');
      if (seconds < 0) action.fail('seconds must be at least 0');
      const amplifier = action.integer('amplifier', 0);
      if (amplifier < 0 || amplifier > 255) action.fail('amplifier must be 0 to 255');
      let target: string;
      if (effectTarget(action) === 'other') {
        target = events.otherParameter ? 'other' : 'player';
      } else if (kind === 'entity') {
        const living = file.use('net.minecraft.world.entity.LivingEntity');
        target = `player != null ? player : entity instanceof ${living} living ? living : null`;
      } else {
        target = 'player';
      }
      return [
        `${actions}.applyEffect(OWNER, ${target}, ${effect}, ${javaInt(ticksOf(seconds))}, ${javaInt(amplifier)});`,
      ];
    }
    case 'launch': {
      action.onlyKeys(['type', 'strength', 'direction', 'up', 'add', 'target'], 'launch field');
      const strength = action.requiredNumber('strength');
      if (strength < 0 || strength > 10) action.fail('strength must be 0 to 10');
      const direction = action.string('direction', 'look');
      if (!['look', 'horizontal', 'up'].includes(direction)) {
        action.fail(`direction '${direction}' is not one of look, horizontal, up`);
      }
      const up = action.optionalNumber('up') ?? 0;
      if (up < -10 || up > 10) action.fail('up must be -10 to 10');
      const add = action.boolean('add', false);
      let target: string;
      if (effectTarget(action) === 'other') {
        target = events.otherParameter ? 'other' : 'player';
      } else if (kind === 'entity') {
        target = 'player != null ? player : entity';
      } else {
        target = 'player';
      }
      return [
        `${actions}.launch(${target}, ${javaFloat(strength)}, ${javaString(direction)}, ${javaFloat(up)}, ${add});`,
      ];
    }
    default:
      return action.fail(`action type '${type}' cannot be ejected`);
  }
}

function offsetOf(action: Reader): [number, number, number] {
  const raw = action.value.offset;
  if (raw === undefined) return [0, 0, 0];
  if (
    !Array.isArray(raw) ||
    raw.length !== 3 ||
    raw.some((n) => typeof n !== 'number' || !Number.isInteger(n))
  ) {
    return action.fail('offset must be three integers');
  }
  return raw as [number, number, number];
}
