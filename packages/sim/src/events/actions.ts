/**
 * Event actions (B396): runs the actions of an event in order, as the runtime's `EventRunner`
 * does (ADR 0025 D4), on the Try it area. What each action does here (ADR 0085 D5, D6):
 *
 * | Action | Here |
 * |---|---|
 * | `set_block_state` | placed in the area, relative to the event's base block |
 * | `give_item` | into a simple hotbar inventory of nine slots; what does not fit is said |
 * | `trigger_event` | runs the other event, at most 16 deep |
 * | `play_sound`, `spawn_particle`, `play_animation` | effects for the view |
 * | `apply_effect`, `damage`, `heal` | a log line and a chip; what they do is said once |
 * | `launch` | pushes the player or the mob by its vector, with a chip |
 * | `light_portal`, `run_function`, `run_script` | "Only in Minecraft" |
 *
 * Whom an action affects follows the runtime's `self` and `other` (`EffectTarget`): `self` is
 * the event's player, else its mob; `other` is the other entity of the event.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import type { BlockCatalogue } from '../blocks/catalogue.js';
import { updateNeighbours } from '../blocks/neighbours.js';
import type { EntityWorld } from '../entities/entity-world.js';
import type { SimRandom } from '../entities/wander.js';
import type { PlayerController } from '../player/controller.js';
import { lookDirection } from '../player/pick.js';
import type { BlockPos, BlockState, SimEffect, SimOrigin, Vec3 } from '../types.js';
import { freezeState, type SimWorld } from '../world/sim-world.js';
import { type EventOwner, plainName, pointerOf, type RuleRef } from './definitions.js';
import type { SimTrace, TraceEntry } from './trace.js';

/** How the simulation treats each action type of the format (`ActionType` in `action.mcdoc`). */
export type ActionHandling = 'runs' | 'effect' | 'chip' | 'onlyInMinecraft';

/**
 * Every action type of the format at the Rules batch's close (ADR 0082 F13) and what Try it does
 * with it. A test walks the schema's `ActionType` enum and fails on a name missing here.
 */
export const SIM_ACTIONS: Readonly<Record<string, ActionHandling>> = Object.freeze({
  run_function: 'onlyInMinecraft',
  spawn_particle: 'effect',
  set_block_state: 'runs',
  give_item: 'runs',
  play_sound: 'effect',
  trigger_event: 'runs',
  play_animation: 'effect',
  run_script: 'onlyInMinecraft',
  apply_effect: 'chip',
  launch: 'runs',
  damage: 'chip',
  heal: 'chip',
  light_portal: 'onlyInMinecraft',
});

/** `trigger_event` chains nest at most this deep; the fired event is depth 1 (as the runtime). */
export const MAX_EVENT_DEPTH = 16;

/** The slots of the simple hotbar inventory `give_item` fills. */
export const INVENTORY_SLOTS = 9;

/** The stack size of an item the simulation knows nothing about (vanilla items). */
export const DEFAULT_STACK_SIZE = 64;

/** Someone an action can affect: the player or a mob by its entity id. */
export type Actor = { readonly kind: 'player' } | { readonly kind: 'mob'; readonly id: number };

/** The player as an {@link Actor}. */
export const PLAYER: Actor = Object.freeze({ kind: 'player' });

/**
 * The context of one firing, as the runtime's `EventContext`: the block `set_block_state`
 * offsets from, where sounds and particles go, and who is involved.
 */
export interface EventContext {
  /** The kind of definition the event belongs to. */
  readonly source: 'block' | 'item' | 'entity';
  /** The block `set_block_state` offsets are relative to. */
  readonly base: BlockPos;
  /** Where sounds and particles happen. */
  readonly origin: Vec3;
  /** Whether the event has the player (the user). */
  readonly player: boolean;
  /** The event's mob: the owner of an entity event, or a mob that stepped on or into a block. */
  readonly entity?: number;
  /** The event's block, when there is one. */
  readonly block?: BlockPos;
  /** The other entity of the event (`target: other`). */
  readonly other?: Actor;
}

/** One stack in the inventory. */
export interface ItemStack {
  readonly id: string;
  readonly count: number;
}

/**
 * The simple hotbar inventory `give_item` fills (B396): nine slots, stacks up to each item's
 * `max_stack_size` (64 for blocks and items the simulation does not know). B398 shows it.
 */
export class SimInventory {
  private readonly items: (ItemStack | null)[] = new Array(INVENTORY_SLOTS).fill(null);
  private maxStackOf: (id: string) => number;

  constructor(maxStackOf: (id: string) => number = () => DEFAULT_STACK_SIZE) {
    this.maxStackOf = maxStackOf;
  }

  /** Takes a new stack size lookup after a live edit; stacks stay as they are. */
  setStackSizes(maxStackOf: (id: string) => number): void {
    this.maxStackOf = maxStackOf;
  }

  /** The slots, left to right; `null` for an empty one. */
  get slots(): readonly (ItemStack | null)[] {
    return this.items;
  }

  /** How many of an item the inventory holds. */
  count(id: string): number {
    return this.items.reduce((sum, stack) => sum + (stack?.id === id ? stack.count : 0), 0);
  }

  /** Adds items, filling stacks of the same item first, then empty slots; returns what is left. */
  give(id: string, count: number): number {
    const max = Math.max(1, this.maxStackOf(id));
    let left = count;
    for (let i = 0; i < this.items.length && left > 0; i++) {
      const stack = this.items[i];
      if (stack?.id !== id || stack.count >= max) continue;
      const add = Math.min(left, max - stack.count);
      this.items[i] = Object.freeze({ id, count: stack.count + add });
      left -= add;
    }
    for (let i = 0; i < this.items.length && left > 0; i++) {
      if (this.items[i] !== null) continue;
      const add = Math.min(left, max);
      this.items[i] = Object.freeze({ id, count: add });
      left -= add;
    }
    return left;
  }

  /** Empties every slot ("Clear the area"). */
  clear(): void {
    this.items.fill(null);
  }
}

/** Display names the actions use. */
export interface ActionNames {
  /** An item's or block's name in plain words. */
  item(id: string): string;
  /** A mob's name in plain words. */
  mob(id: number): string;
  /** A mob effect's name in plain words. */
  effect(id: string): string;
}

/** What the actions work on: the area, its player and mobs, and where they report. */
export interface ActionHost {
  readonly world: SimWorld;
  catalogue(): BlockCatalogue;
  readonly player: PlayerController;
  readonly entities: EntityWorld;
  readonly inventory: SimInventory;
  readonly trace: SimTrace;
  /** The seeded generator particle spread uses. */
  readonly random: SimRandom;
  readonly names: ActionNames;
  /** Sends an effect to the view. */
  effect(effect: SimEffect): void;
  /** The rules behind each action of an owner's event, by action index. */
  rulesFor(owner: EventOwner, eventId: string): ReadonlyMap<number, readonly RuleRef[]>;
  /** Called when an action names a project definition (an effect), to say its triggers. */
  mentioned(kind: 'effect', id: string): void;
}

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const str = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** `Chime` from `minecraft:block.note_block.chime`; `Ruby Chime` from `mymod:ruby_chime`. */
export function soundName(id: string): string {
  const path = id.slice(id.indexOf(':') + 1);
  const last = path.slice(path.lastIndexOf('.') + 1);
  return plainName(`x:${last}`);
}

/** `End Rod` from `minecraft:end_rod`. */
export const particleName = (id: string): string => plainName(id);

/** Roman numerals for effect levels up to 10, else the number. */
function level(amplifier: number): string {
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return roman[amplifier] ?? String(amplifier + 1);
}

/** `3 seconds`, `1 second`, `0.5 seconds`. */
export function secondsWords(seconds: number): string {
  const rounded = Math.round(seconds * 100) / 100;
  return `${rounded} ${rounded === 1 ? 'second' : 'seconds'}`;
}

/** `1 heart`, `2.5 hearts` from half hearts. */
function heartsWords(halfHearts: number): string {
  const hearts = Math.round((halfHearts / 2) * 100) / 100;
  return `${hearts} ${hearts === 1 ? 'heart' : 'hearts'}`;
}

/** Parses `ns:id[a=b,c=d]` into a state; `null` when it is not one. */
export function parseBlockState(text: string): BlockState | null {
  const match = /^([a-z0-9_.-]+:[a-z0-9_./-]+|[a-z0-9_./-]+)(?:\[([^\]]*)\])?$/.exec(text.trim());
  if (match === null) return null;
  const rawName = match[1] as string;
  const name = rawName.includes(':') ? rawName : `minecraft:${rawName}`;
  const properties: Record<string, string> = {};
  const list = match[2];
  if (list !== undefined && list.trim() !== '') {
    for (const pair of list.split(',')) {
      const [key, value] = pair.split('=').map((part) => part.trim());
      if (key === undefined || value === undefined || key === '' || value === '') return null;
      properties[key] = value;
    }
  }
  return freezeState({ name, properties });
}

/** The ids `set_block_state` treats as removing the block. */
const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/** A normal random number (Box–Muller) from the seeded generator. */
function gaussian(random: SimRandom): number {
  const u = Math.max(random.next(), 1e-12);
  const v = random.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Who `self` and `other` mean in a context (the runtime's `livingTarget`). */
export function resolveTarget(target: Json | undefined, ctx: EventContext): Actor | undefined {
  if (target === 'other') return ctx.other;
  if (ctx.player) return PLAYER;
  return ctx.entity === undefined ? undefined : { kind: 'mob', id: ctx.entity };
}

/** One firing of an event: what the actions need besides the host. */
export interface Firing {
  readonly owner: EventOwner;
  readonly ctx: EventContext;
}

/**
 * Runs an event of an owner with its context; returns the trace entries it made. Unknown event
 * ids and chains deeper than {@link MAX_EVENT_DEPTH} stop with a line, as the runtime logs them.
 */
export function runEvent(
  host: ActionHost,
  firing: Firing,
  eventId: string,
  depth = 1,
): TraceEntry[] {
  const made: TraceEntry[] = [];
  const { owner } = firing;
  const base: SimOrigin = { elementId: owner.id, eventId };
  if (depth > MAX_EVENT_DEPTH) {
    made.push(
      host.trace.add({
        kind: 'skipped',
        text: `${owner.displayName}: a chain of events deeper than ${MAX_EVENT_DEPTH} stopped before "${eventId}".`,
        origin: base,
        depth,
      }),
    );
    return made;
  }
  const actions = owner.events.get(eventId);
  if (actions === undefined) {
    made.push(
      host.trace.add({
        kind: 'skipped',
        text: `${owner.displayName} has no event "${eventId}"; nothing ran.`,
        origin: base,
        depth,
      }),
    );
    return made;
  }
  const rules = host.rulesFor(owner, eventId);
  actions.forEach((action, index) => {
    const refs = rules.get(index) ?? [];
    const first = refs[0];
    const origin: SimOrigin = {
      ...base,
      pointer: pointerOf(['events', eventId, 'actions', String(index)]),
      ...(first === undefined ? {} : { ruleKey: first.key, ruleBook: first.book }),
    };
    made.push(...runAction(host, firing, action, index, origin, refs, depth));
  });
  return made;
}

function runAction(
  host: ActionHost,
  firing: Firing,
  action: JsonObject,
  index: number,
  origin: SimOrigin,
  refs: readonly RuleRef[],
  depth: number,
): TraceEntry[] {
  const { ctx, owner } = firing;
  const type = str(action.type) ?? '';
  const add = (
    kind: TraceEntry['kind'],
    text: string,
    at: SimOrigin = origin,
    extra: Pick<TraceEntry, 'ranEvent'> = {},
  ): TraceEntry =>
    host.trace.add({
      kind,
      text,
      origin: at,
      action: type,
      actionIndex: index,
      depth,
      ...(ctx.block === undefined ? {} : { pos: ctx.block }),
      ...extra,
    });
  const actorName = (actor: Actor): string =>
    actor.kind === 'player' ? 'you' : host.names.mob(actor.id);
  const mobThere = (actor: Actor | undefined): boolean =>
    actor !== undefined &&
    (actor.kind === 'player' || host.entities.entity(actor.id) !== undefined);
  const chip = (text: string, actor: Actor): void =>
    host.effect({
      kind: 'chip',
      id: text,
      target: actor.kind === 'player' ? 'player' : actor.id,
      origin,
    });

  switch (type) {
    case 'play_sound': {
      const sound = str(action.sound) ?? '';
      host.effect({
        kind: 'sound',
        id: sound,
        position: ctx.origin,
        volume: num(action.volume, 1),
        pitch: num(action.pitch, 1),
        origin,
      });
      return [add('action', `Played sound ${soundName(sound)}.`)];
    }
    case 'spawn_particle': {
      const particle = action.particle;
      const options = isRecord(particle) ? particle : undefined;
      const id = options !== undefined ? (str(options.type) ?? '') : (str(particle) ?? '');
      const count = Math.min(1000, Math.max(1, Math.floor(num(action.count, 1))));
      const spread = Math.max(0, num(action.spread, 0));
      const speed = Math.max(0, num(action.speed, 0));
      const motion =
        Array.isArray(action.motion) && action.motion.length === 3
          ? {
              x: num(action.motion[0], 0),
              y: num(action.motion[1], 0),
              z: num(action.motion[2], 0),
            }
          : undefined;
      for (let i = 0; i < count; i++) {
        const position = {
          x: ctx.origin.x + gaussian(host.random) * spread,
          y: ctx.origin.y + gaussian(host.random) * spread,
          z: ctx.origin.z + gaussian(host.random) * spread,
        };
        const velocity = motion ?? {
          x: gaussian(host.random) * speed,
          y: gaussian(host.random) * speed,
          z: gaussian(host.random) * speed,
        };
        host.effect({
          kind: 'particle',
          id,
          position,
          velocity,
          ...(options === undefined ? {} : { options }),
          origin,
        });
      }
      return [
        add(
          'action',
          `Showed ${count} ${particleName(id)} ${count === 1 ? 'particle' : 'particles'}.`,
        ),
      ];
    }
    case 'set_block_state': {
      const text = str(action.state) ?? '';
      const parsed = parseBlockState(text);
      const offset = Array.isArray(action.offset) ? action.offset : [];
      const pos = {
        x: ctx.base.x + Math.trunc(num(offset[0], 0)),
        y: ctx.base.y + Math.trunc(num(offset[1], 0)),
        z: ctx.base.z + Math.trunc(num(offset[2], 0)),
      };
      const where = `${pos.x}, ${pos.y}, ${pos.z}`;
      if (parsed === null) {
        return [add('skipped', `"${text}" is not a block state; nothing was placed.`)];
      }
      if (!host.world.inBounds(pos)) {
        return [add('skipped', `${where} is outside the test area; nothing was placed there.`)];
      }
      const catalogue = host.catalogue();
      if (AIR.has(parsed.name)) {
        host.world.set(pos, null);
        updateNeighbours(host.world, catalogue, pos);
        return [add('action', `Removed the block at ${where}.`)];
      }
      const block = catalogue.blockFor(parsed.name);
      const state = block === undefined ? null : catalogue.normalise(parsed);
      if (block === undefined || state === null) {
        return [
          add('onlyInMinecraft', `place ${parsed.name} (a block of another mod) at ${where}`),
        ];
      }
      const withProps = catalogue.withProperties(state, parsed.properties);
      host.world.set(pos, withProps);
      updateNeighbours(host.world, catalogue, pos);
      return [add('action', `Placed ${block.displayName} at ${where}.`)];
    }
    case 'give_item': {
      const item = str(action.item) ?? '';
      const count = Math.max(1, Math.floor(num(action.count, 1)));
      const name = host.names.item(item);
      if (!ctx.player) {
        return [add('skipped', `Gave no ${name}: there is no player in this event.`)];
      }
      const left = host.inventory.give(item, count);
      const out = [add('action', `Gave you ${count - left} ${name}.`)];
      if (left > 0) {
        out.push(add('onlyInMinecraft', `${left} ${name} that did not fit dropping at your feet`));
      }
      return out;
    }
    case 'trigger_event': {
      const next = str(action.event) ?? '';
      const out = [
        add('action', `Ran ${owner.displayName}'s event "${next}" too.`, origin, {
          ranEvent: next,
        }),
      ];
      out.push(...runEvent(host, firing, next, depth + 1));
      return out;
    }
    case 'play_animation': {
      const animation = str(action.animation) ?? '';
      if (owner.kind !== 'entity' || ctx.entity === undefined) {
        return [
          add(
            'skipped',
            `${owner.displayName}: "play animation" works only on mobs; the game drops it here.`,
          ),
        ];
      }
      if (host.entities.entity(ctx.entity) === undefined) {
        return [
          add('skipped', `${owner.displayName} is gone; animation "${animation}" did not play.`),
        ];
      }
      host.effect({
        kind: 'animation',
        id: animation,
        target: ctx.entity,
        controller: str(action.controller) ?? 'msm_triggered',
        origin,
      });
      return [add('action', `${host.names.mob(ctx.entity)} played animation "${animation}".`)];
    }
    case 'apply_effect':
    case 'damage':
    case 'heal': {
      const target = resolveTarget(action.target, ctx);
      if (target === undefined || !mobThere(target)) {
        return [
          add('skipped', `${actionWords(type, action, host)}: no one to affect in this event.`),
        ];
      }
      const who = actorName(target);
      const words = actionWords(type, action, host);
      if (type === 'apply_effect') host.mentioned('effect', str(action.effect) ?? '');
      chip(words, target);
      const out = [add('action', `${capitalise(who)}: ${words}.`)];
      out.push(
        add(
          'onlyInMinecraft',
          type === 'apply_effect'
            ? `what ${host.names.effect(str(action.effect) ?? '')} does (the preview shows a chip)`
            : 'health, damage and healing (the preview shows a chip)',
        ),
      );
      return out;
    }
    case 'launch': {
      const target = resolveTarget(action.target, ctx);
      if (target === undefined || !mobThere(target)) {
        return [add('skipped', 'Launched no one: there is no one to push in this event.')];
      }
      const push = launchVector(host, target, action);
      const additive = action.add === true;
      if (target.kind === 'player') host.player.launch(push, additive);
      else host.entities.entity(target.id)?.launch(push, additive);
      const speed = Math.round(Math.hypot(push.x, push.y, push.z) * 100) / 100;
      chip(`Launched at ${speed} blocks a tick`, target);
      return [add('action', `Launched ${actorName(target)} at ${speed} blocks a tick.`)];
    }
    case 'light_portal': {
      const portal = str(action.portal) ?? '';
      return [add('onlyInMinecraft', `light the frame of ${host.names.item(portal)}`)];
    }
    case 'run_function':
      return [add('onlyInMinecraft', `run function ${str(action.function) ?? ''}`)];
    case 'run_script': {
      const handler = str(action.handler) ?? '';
      if (refs.length === 0) {
        return [add('onlyInMinecraft', `run script action ${handler}`)];
      }
      return refs.map((ref) =>
        add(
          'onlyInMinecraft',
          `rule ${ref.name === undefined ? `"${ref.key}"` : `"${ref.name}"`} (it needs a script)`,
          { ...origin, ruleKey: ref.key, ruleBook: ref.book },
        ),
      );
    }
    default:
      return [add('onlyInMinecraft', `an action the preview does not know ("${type}")`)];
  }
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The chip's words of an `apply_effect`, `damage` or `heal`. */
function actionWords(type: string, action: JsonObject, host: ActionHost): string {
  if (type === 'apply_effect') {
    const amplifier = Math.max(0, Math.floor(num(action.amplifier, 0)));
    const name = host.names.effect(str(action.effect) ?? '');
    const lv = amplifier > 0 ? ` ${level(amplifier)}` : '';
    return `${name}${lv} for ${secondsWords(Math.max(0, num(action.seconds, 0)))}`;
  }
  const amount = Math.max(0, num(action.amount, 0));
  return type === 'damage' ? `Hurt by ${heartsWords(amount)}` : `Healed by ${heartsWords(amount)}`;
}

/** The push of a `launch` (ADR 0052): `strength` along `direction`, plus `up`. */
function launchVector(host: ActionHost, target: Actor, action: JsonObject): Vec3 {
  const strength = Math.min(10, Math.max(0, num(action.strength, 0)));
  const up = Math.min(10, Math.max(-10, num(action.up, 0)));
  const mob = target.kind === 'mob' ? host.entities.entity(target.id) : undefined;
  const yaw = target.kind === 'player' ? host.player.yaw : (mob?.yaw ?? 0);
  const pitch = target.kind === 'player' ? host.player.pitch : 0;
  const look = lookDirection(yaw, pitch);
  let direction: Vec3;
  switch (action.direction) {
    case 'up':
      direction = { x: 0, y: 1, z: 0 };
      break;
    case 'horizontal': {
      const length = Math.hypot(look.x, look.z);
      direction =
        length < 1e-3 ? { x: 0, y: 0, z: 0 } : { x: look.x / length, y: 0, z: look.z / length };
      break;
    }
    default:
      direction = look;
  }
  return { x: direction.x * strength, y: direction.y * strength + up, z: direction.z * strength };
}
