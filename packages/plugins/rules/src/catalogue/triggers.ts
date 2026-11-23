/**
 * The triggers of format 1 (ADR 0082 D4). Definition triggers set a trigger component of a
 * project block, item, mob or effect (ADR 0025, 0028, 0055, 0056, 0061, 0074, 0075, 0077);
 * their actors and action targets follow the runtime's `EventContext` factories (ADR 0058 D1).
 * Script-only triggers use a Script API event (ADR 0032, 0065).
 */
import type {
  ActionTarget,
  Actor,
  SlotSpec,
  TriggerComponent,
  TriggerEntry,
  TriggerGroup,
  TriggerOptionMapping,
} from './types';

export const BLOCK_KIND = 'msm:block';
export const ITEM_KIND = 'msm:item';
export const ENTITY_KIND = 'msm:entity';
export const EFFECT_KIND = 'msm:effect';
export const KEY_BIND_KIND = 'msm:key_bind';
export const VEHICLE_KIND = 'msm:vehicle';
export const COMMAND_KIND = 'msm:command';
/** The games kinds Rules reads and fires through the function bridge (ADR 0113, ADR 0115). */
export const AREA_KIND = 'msm:area';
export const TIMER_KIND = 'msm:timer';
export const ONE_BLOCK_KIND = 'msm:one_block';
export const TEAM_KIND = 'msm:team';
export const OBJECTIVE_KIND = 'msm:objective';

const SUBJECT_BLOCK: SlotSpec = { name: 'subject', type: 'block' };
const SUBJECT_ITEM: SlotSpec = { name: 'subject', type: 'item' };
const SUBJECT_MOB: SlotSpec = { name: 'subject', type: 'mob' };
const SUBJECT_EFFECT: SlotSpec = { name: 'subject', type: 'effect' };
const SUBJECT_KEY: SlotSpec = { name: 'subject', type: 'key' };
const SUBJECT_VEHICLE: SlotSpec = { name: 'subject', type: 'vehicle' };
const SUBJECT_COMMAND: SlotSpec = { name: 'subject', type: 'command' };
const SUBJECT_AREA: SlotSpec = { name: 'subject', type: 'area' };
const SUBJECT_TIMER: SlotSpec = { name: 'subject', type: 'timer' };
const SUBJECT_ONE_BLOCK: SlotSpec = { name: 'subject', type: 'one_block' };
/** The one block's phase, 1 to 64 in the order of its `phases`; absent means every phase. */
const PHASE: SlotSpec = {
  name: 'phase',
  type: 'number',
  optional: true,
  min: 1,
  max: 64,
  whole: true,
  prefix: 'in phase',
};

const COOLDOWN: SlotSpec = {
  name: 'cooldown_seconds',
  type: 'seconds',
  optional: true,
  min: 0,
  max: 3600,
};
const CHANCE: SlotSpec = { name: 'chance', type: 'number', optional: true, min: 0, max: 1 };
const INTERVAL: SlotSpec = {
  name: 'interval_seconds',
  type: 'seconds',
  optional: true,
  min: 0.25,
  max: 3600,
};
const EFFECT_INTERVAL: SlotSpec = { ...INTERVAL, min: 0.05 };
/** A key bind's `cooldown_ticks` and `hold_interval_ticks` go up to 1200 ticks (a minute). */
const KEY_COOLDOWN: SlotSpec = { ...COOLDOWN, max: 60 };
const KEY_INTERVAL: SlotSpec = { ...INTERVAL, min: 0.05, max: 60 };
const HAND: SlotSpec = {
  name: 'hand',
  type: 'choice',
  optional: true,
  choices: [
    { value: 'main', label: 'in the main hand' },
    { value: 'off', label: 'in the off hand' },
    { value: 'either', label: 'in either hand' },
  ],
};
const MESSAGE: SlotSpec = {
  name: 'message_contains',
  type: 'text',
  optional: true,
  prefix: 'with a message containing',
};

const cooldown = (min = 0, max?: number): TriggerOptionMapping => ({
  option: 'cooldown_seconds',
  field: 'cooldown_ticks',
  convert: 'ticks',
  min,
  ...(max === undefined ? {} : { max }),
});
const interval = (min: number, field = 'interval_ticks', max?: number): TriggerOptionMapping => ({
  option: 'interval_seconds',
  field,
  convert: 'ticks',
  min,
  ...(max === undefined ? {} : { max }),
});
const chance: TriggerOptionMapping = { option: 'chance', field: 'chance', convert: 'copy' };
const hand: TriggerOptionMapping = { option: 'hand', field: 'hand', convert: 'copy' };

interface Spec {
  id: string;
  label: string;
  sentence: string;
  group: TriggerGroup;
  slots: readonly SlotSpec[];
  subject?: TriggerEntry['subject'];
  subjectOptional?: boolean;
  subjectKinds?: readonly string[];
  definition?: TriggerComponent;
  options?: readonly TriggerOptionMapping[];
  scriptEvent?: string;
  actors: readonly Actor[];
  actorLabels?: Partial<Record<Actor, string>>;
  actionTargets?: Partial<Record<Actor, ActionTarget>>;
  hasPlace?: boolean;
  hereIsBlock?: boolean;
  cancellable?: boolean;
  mobDead?: boolean;
  playerGone?: boolean;
  signal?: TriggerEntry['signal'];
}

const trigger = (spec: Spec): TriggerEntry =>
  Object.freeze({
    id: spec.id,
    label: spec.label,
    sentence: spec.sentence,
    slots: Object.freeze([...spec.slots]),
    veryEasy: true,
    group: spec.group,
    subject: spec.subject ?? 'none',
    subjectOptional: spec.subjectOptional ?? false,
    subjectKinds: Object.freeze([...(spec.subjectKinds ?? [])]),
    ...(spec.definition === undefined ? {} : { definition: Object.freeze({ ...spec.definition }) }),
    options: Object.freeze([...(spec.options ?? [])]),
    ...(spec.scriptEvent === undefined ? {} : { scriptEvent: spec.scriptEvent }),
    actors: Object.freeze([...spec.actors]),
    actorLabels: Object.freeze({ ...(spec.actorLabels ?? {}) }),
    actionTargets: Object.freeze({ ...(spec.actionTargets ?? {}) }),
    hasPlace: spec.hasPlace ?? true,
    hereIsBlock: spec.hereIsBlock ?? false,
    cancellable: spec.cancellable ?? false,
    ...(spec.mobDead === true ? { mobDead: true } : {}),
    ...(spec.playerGone === true ? { playerGone: true } : {}),
    ...(spec.signal === undefined ? {} : { signal: spec.signal }),
  });

/** A block definition trigger. */
const block = (spec: Omit<Spec, 'subject' | 'subjectKinds' | 'hereIsBlock'>): TriggerEntry =>
  trigger({ ...spec, subject: 'block', subjectKinds: [BLOCK_KIND], hereIsBlock: true });

const item = (spec: Omit<Spec, 'subject' | 'subjectKinds'>): TriggerEntry =>
  trigger({ ...spec, subject: 'item', subjectKinds: [ITEM_KIND] });

const mob = (spec: Omit<Spec, 'subject' | 'subjectKinds' | 'group'>): TriggerEntry =>
  trigger({ ...spec, group: 'mobs', subject: 'mob', subjectKinds: [ENTITY_KIND] });

const effect = (spec: Omit<Spec, 'subject' | 'subjectKinds' | 'group' | 'actors'>): TriggerEntry =>
  trigger({
    ...spec,
    group: 'effects',
    subject: 'effect',
    subjectKinds: [EFFECT_KIND],
    // `forEffect`: the holder is self, other and the player when it is one (ADR 0055 D3).
    actors: ['mob', 'player'],
    actorLabels: { mob: 'the one with the effect', player: 'the player with the effect' },
    actionTargets: { mob: 'self' },
  });

const player = (spec: Omit<Spec, 'group' | 'actors'>): TriggerEntry =>
  trigger({ ...spec, group: 'players', actors: ['player'] });

/**
 * A key bind trigger (ADR 0088 D6): the event goes in the key bind's own top-level field; the
 * presser is the player, `self` and `other` (`EventContext.forItem`), and "here" is the player.
 * Script books listen to the Script API 1.5 key events where there is one.
 */
const key = (spec: Omit<Spec, 'subject' | 'subjectKinds' | 'group' | 'actors'>): TriggerEntry =>
  trigger({
    ...spec,
    group: 'keys',
    subject: 'key',
    subjectKinds: [KEY_BIND_KIND],
    actors: ['player'],
    actionTargets: { player: 'self' },
  });

/**
 * A vehicle trigger (ADR 0090 D11): the vehicle is the event's entity and "here", the player is
 * `self` and `other` (`EventContext.forEntity(level, vehicle, player)`), so actions reach the
 * player only. Script books listen to the Script API 1.5 vehicle events.
 */
const vehicle = (spec: Omit<Spec, 'subject' | 'subjectKinds' | 'group'>): TriggerEntry =>
  trigger({
    ...spec,
    group: 'vehicles',
    subject: 'vehicle',
    subjectKinds: [VEHICLE_KIND],
    actionTargets: { player: 'self' },
  });

/** A stepper, placer, traveller or entity inside: the player when it is one, any entity as other. */
const ACTOR_ENTITY = { other: 'other' } as const;

export const TRIGGERS: readonly TriggerEntry[] = Object.freeze([
  block({
    id: 'block_used',
    label: 'A player uses the block',
    sentence: 'When a player uses {subject}',
    group: 'blocks',
    slots: [SUBJECT_BLOCK],
    definition: { component: 'msm:on_interact' },
    actors: ['player'],
    actionTargets: { player: 'self' },
  }),
  block({
    id: 'block_stepped_on',
    label: 'Something steps on the block',
    sentence: 'When something steps on {subject}',
    group: 'blocks',
    slots: [SUBJECT_BLOCK, COOLDOWN],
    definition: { component: 'msm:on_step' },
    options: [cooldown()],
    actors: ['player', 'other'],
    actorLabels: { other: 'whoever stepped on it', player: 'the player who stepped on it' },
    actionTargets: ACTOR_ENTITY,
  }),
  block({
    id: 'block_broken',
    label: 'A player breaks the block',
    sentence: 'When a player breaks {subject}',
    group: 'blocks',
    slots: [SUBJECT_BLOCK],
    definition: { component: 'msm:on_break' },
    actors: ['player'],
    actionTargets: { player: 'self' },
  }),
  block({
    id: 'block_placed',
    label: 'The block is placed',
    sentence: 'When {subject} is placed',
    group: 'blocks',
    slots: [SUBJECT_BLOCK],
    definition: { component: 'msm:on_place' },
    actors: ['player', 'other'],
    actorLabels: { other: 'whoever placed it', player: 'the player who placed it' },
    actionTargets: ACTOR_ENTITY,
  }),
  block({
    id: 'block_random_tick',
    label: 'The block gets a random tick',
    sentence: 'Now and then (on a random tick) at {subject}',
    group: 'blocks',
    slots: [SUBJECT_BLOCK, CHANCE],
    definition: { component: 'msm:on_random_tick' },
    options: [chance],
    actors: [],
  }),
  block({
    id: 'block_entity_inside',
    label: 'Something is inside the block',
    sentence: 'When something is inside {subject}',
    group: 'blocks',
    slots: [SUBJECT_BLOCK, COOLDOWN],
    definition: { component: 'msm:on_entity_inside' },
    options: [cooldown(5)],
    actors: ['player', 'other'],
    actorLabels: { other: 'whoever is inside it', player: 'the player inside it' },
    actionTargets: ACTOR_ENTITY,
  }),
  block({
    id: 'block_powered',
    label: 'The block is powered by redstone',
    sentence: 'When {subject} is powered by redstone',
    group: 'blocks',
    slots: [SUBJECT_BLOCK],
    definition: { component: 'msm:redstone', field: 'on_powered' },
    actors: [],
  }),
  block({
    id: 'block_unpowered',
    label: 'The block stops being powered',
    sentence: 'When {subject} stops being powered',
    group: 'blocks',
    slots: [SUBJECT_BLOCK],
    definition: { component: 'msm:redstone', field: 'on_unpowered' },
    actors: [],
  }),
  block({
    id: 'container_opened',
    label: 'A player opens the container',
    sentence: 'When a player opens {subject}',
    group: 'containers',
    slots: [SUBJECT_BLOCK],
    definition: { component: 'msm:container', field: 'on_open', required: true },
    actors: ['player'],
    actionTargets: { player: 'self' },
  }),
  block({
    id: 'container_closed',
    label: 'A player closes the container',
    sentence: 'When a player closes {subject}',
    group: 'containers',
    slots: [SUBJECT_BLOCK],
    definition: { component: 'msm:container', field: 'on_close', required: true },
    actors: ['player'],
    actionTargets: { player: 'self' },
  }),
  block({
    id: 'machine_started',
    label: 'The machine starts working',
    sentence: 'When {subject} starts working',
    group: 'machines',
    slots: [SUBJECT_BLOCK],
    definition: { component: 'msm:machine', field: 'on_start', required: true },
    actors: [],
  }),
  block({
    id: 'machine_finished',
    label: 'The machine finishes',
    sentence: 'When {subject} finishes working',
    group: 'machines',
    slots: [SUBJECT_BLOCK],
    definition: { component: 'msm:machine', field: 'on_finish', required: true },
    actors: [],
  }),
  trigger({
    id: 'portal_travelled',
    label: 'Something travels through the portal',
    sentence: 'When something travels through {subject}',
    group: 'portals',
    slots: [SUBJECT_BLOCK],
    subject: 'block',
    subjectKinds: [BLOCK_KIND],
    definition: { field: 'on_travel', blockType: 'portal' },
    actors: ['player', 'other'],
    actorLabels: { other: 'the traveller', player: 'the player who travelled' },
    actionTargets: ACTOR_ENTITY,
  }),
  item({
    id: 'item_used',
    label: 'A player uses the item',
    sentence: 'When a player uses {subject}',
    group: 'items',
    slots: [SUBJECT_ITEM, COOLDOWN],
    definition: { component: 'msm:on_use' },
    options: [cooldown()],
    actors: ['player'],
    actionTargets: { player: 'self' },
  }),
  item({
    id: 'item_used_on_block',
    label: 'A player uses the item on a block',
    sentence: 'When a player uses {subject} on a block',
    group: 'items',
    slots: [SUBJECT_ITEM, COOLDOWN],
    definition: { component: 'msm:on_use_on_block' },
    options: [cooldown()],
    actors: ['player'],
    actionTargets: { player: 'self' },
    hereIsBlock: true,
  }),
  item({
    id: 'item_hit_mob',
    label: 'The item hits a mob',
    sentence: 'When {subject} hits a mob',
    group: 'items',
    slots: [SUBJECT_ITEM],
    definition: { component: 'msm:on_hit' },
    actors: ['player', 'other'],
    actorLabels: { other: 'the mob hit', player: 'the player holding it' },
    actionTargets: { other: 'other' },
  }),
  item({
    id: 'item_held',
    label: 'Every few seconds while the item is held',
    sentence: 'Every {interval_seconds} while {subject} is held {hand}',
    group: 'items',
    slots: [INTERVAL, SUBJECT_ITEM, HAND],
    definition: { component: 'msm:while_held' },
    options: [interval(5), hand],
    actors: ['player'],
    actorLabels: { player: 'the player holding it' },
  }),
  item({
    id: 'item_worn',
    label: 'Every few seconds while the item is worn',
    sentence: 'Every {interval_seconds} while {subject} is worn',
    group: 'items',
    slots: [INTERVAL, SUBJECT_ITEM],
    definition: { component: 'msm:while_worn', needs: 'msm:armor' },
    options: [interval(5)],
    actors: ['player'],
    actorLabels: { player: 'the player wearing it' },
  }),
  item({
    id: 'thrown_hit_mob',
    label: 'The thrown item hits a mob',
    sentence: 'When thrown {subject} hits a mob',
    group: 'thrown',
    slots: [SUBJECT_ITEM],
    definition: {
      component: 'msm:throwable',
      field: 'on_hit_entity',
      fieldIsObject: true,
      required: true,
    },
    actors: ['player', 'other'],
    actorLabels: { other: 'the mob hit', player: 'the player who threw it' },
    actionTargets: { other: 'other' },
  }),
  item({
    id: 'thrown_hit_block',
    label: 'The thrown item hits a block',
    sentence: 'When thrown {subject} hits a block',
    group: 'thrown',
    slots: [SUBJECT_ITEM],
    definition: {
      component: 'msm:throwable',
      field: 'on_hit_block',
      fieldIsObject: true,
      required: true,
    },
    actors: ['player'],
    actorLabels: { player: 'the player who threw it' },
    hereIsBlock: true,
  }),
  mob({
    id: 'mob_hurt',
    label: 'The mob is hurt',
    sentence: 'When {subject} is hurt',
    slots: [SUBJECT_MOB],
    definition: { component: 'msm:on_hurt' },
    actors: ['mob', 'player'],
    actorLabels: { player: 'the player who hurt it' },
    actionTargets: { player: 'other' },
  }),
  mob({
    id: 'mob_died',
    label: 'The mob dies',
    sentence: 'When {subject} dies',
    slots: [SUBJECT_MOB],
    definition: { component: 'msm:on_death' },
    actors: ['mob', 'player'],
    actorLabels: { player: 'the player who killed it' },
    actionTargets: { player: 'other' },
    mobDead: true,
  }),
  mob({
    id: 'mob_used',
    label: 'A player uses the mob',
    sentence: 'When a player uses {subject}',
    slots: [SUBJECT_MOB],
    definition: { component: 'msm:on_interact' },
    actors: ['mob', 'player'],
    actionTargets: { player: 'other' },
  }),
  mob({
    id: 'mob_attacked',
    label: 'The mob attacks',
    sentence: 'When {subject} attacks',
    slots: [SUBJECT_MOB],
    definition: { component: 'msm:attack', field: 'on_attack', required: true },
    actors: ['mob', 'other', 'player'],
    actorLabels: { other: 'the one it hit', player: 'the player it hit' },
    actionTargets: { other: 'other' },
  }),
  mob({
    id: 'mob_every',
    label: 'Every few seconds while the mob is alive',
    sentence: 'Every {interval_seconds} while {subject} is alive',
    slots: [INTERVAL, SUBJECT_MOB],
    definition: { component: 'msm:on_tick' },
    options: [interval(5)],
    actors: ['mob'],
    actionTargets: { mob: 'self' },
  }),
  mob({
    id: 'mob_spawned',
    label: 'The mob spawns',
    sentence: 'When {subject} spawns',
    slots: [SUBJECT_MOB],
    definition: { component: 'msm:on_spawn' },
    actors: ['mob'],
    actionTargets: { mob: 'self' },
  }),
  effect({
    id: 'effect_started',
    label: 'The effect starts',
    sentence: 'When {subject} starts',
    slots: [SUBJECT_EFFECT],
    definition: { component: 'msm:on_start' },
  }),
  effect({
    id: 'effect_every',
    label: 'Every few seconds while the effect lasts',
    sentence: 'Every {interval_seconds} while {subject} lasts',
    slots: [EFFECT_INTERVAL, SUBJECT_EFFECT],
    definition: { component: 'msm:on_tick' },
    options: [interval(1)],
  }),
  effect({
    id: 'effect_ended',
    label: 'The effect ends',
    sentence: 'When {subject} ends',
    slots: [SUBJECT_EFFECT],
    definition: { component: 'msm:on_end' },
  }),
  player({
    id: 'player_joined',
    label: 'A player joins',
    sentence: 'When a player joins',
    slots: [],
    scriptEvent: 'player.join',
  }),
  player({
    id: 'player_left',
    label: 'A player leaves',
    sentence: 'When a player leaves',
    slots: [],
    scriptEvent: 'player.leave',
    playerGone: true,
  }),
  player({
    id: 'player_respawned',
    label: 'A player respawns',
    sentence: 'When a player respawns',
    slots: [],
    scriptEvent: 'player.respawn',
  }),
  player({
    id: 'player_chatted',
    label: 'A player chats',
    sentence: 'When a player chats {message_contains}',
    slots: [MESSAGE],
    scriptEvent: 'player.chat',
    cancellable: true,
  }),
  player({
    id: 'player_changed_dimension',
    label: 'A player changes dimension',
    sentence: 'When a player changes dimension',
    slots: [],
    scriptEvent: 'player.changeDimension',
  }),
  player({
    id: 'player_every',
    label: 'Every few seconds for each player',
    sentence: 'Every {interval_seconds} for each player',
    slots: [INTERVAL],
    scriptEvent: 'player.tick',
  }),
  // Getting on and off (B458): no Script API event, so the script looks at each player's
  // `vehicle` (Script API 1.6) every quarter of a second; "other" is what they got on or off.
  trigger({
    id: 'player_mounted',
    label: 'A player gets on something',
    sentence: 'When a player gets on something',
    group: 'players',
    slots: [],
    scriptEvent: 'player.tick',
    actors: ['player', 'other'],
    actorLabels: { other: 'what they got on' },
  }),
  trigger({
    id: 'player_dismounted',
    label: 'A player gets off something',
    sentence: 'When a player gets off something',
    group: 'players',
    slots: [],
    scriptEvent: 'player.tick',
    actors: ['player', 'other'],
    actorLabels: { other: 'what they got off' },
  }),
  // The R10 triggers (ADR 0111 D3): Script API 1.7 events of the runtime's own hooks. The
  // crafted, picked up and eaten item may be any item, vanilla or the project's, or left out.
  trigger({
    id: 'player_crafted',
    label: 'A player crafts',
    sentence: 'When a player crafts {subject}',
    group: 'players',
    slots: [{ ...SUBJECT_ITEM, optional: true }],
    subject: 'item',
    subjectOptional: true,
    scriptEvent: 'item.crafted',
    actors: ['player'],
    actorLabels: { player: 'the player who crafted it' },
  }),
  trigger({
    id: 'player_picked_up',
    label: 'A player picks up',
    sentence: 'When a player picks up {subject}',
    group: 'players',
    slots: [{ ...SUBJECT_ITEM, optional: true }],
    subject: 'item',
    subjectOptional: true,
    scriptEvent: 'item.picked_up',
    actors: ['player'],
    actorLabels: { player: 'the player who picked it up' },
  }),
  trigger({
    id: 'player_ate',
    label: 'A player eats',
    sentence: 'When a player eats or drinks {subject}',
    group: 'players',
    slots: [{ ...SUBJECT_ITEM, optional: true }],
    subject: 'item',
    subjectOptional: true,
    scriptEvent: 'player.ate',
    actors: ['player'],
    actorLabels: { player: 'the player who ate it' },
  }),
  player({
    id: 'player_slept',
    label: 'A player goes to sleep',
    sentence: 'When a player goes to sleep',
    slots: [],
    scriptEvent: 'player.slept',
  }),
  player({
    id: 'player_woke',
    label: 'A player wakes up',
    sentence: 'When a player wakes up',
    slots: [],
    scriptEvent: 'player.woke',
  }),
  trigger({
    id: 'player_advancement',
    label: 'A player gets an advancement',
    sentence: 'When a player gets {subject}',
    group: 'players',
    slots: [{ name: 'subject', type: 'advancement', optional: true }],
    subject: 'advancement',
    subjectOptional: true,
    scriptEvent: 'player.advancement',
    actors: ['player'],
    actorLabels: { player: 'the player who got it' },
  }),
  // A project command (ADR 0096 D1, D5): plain rules go into the command's own `event`, whose
  // self and other are the source (B454), the rest through `run_script`; a command that runs a
  // function cannot also run an event, so its rules listen to the Script API 1.6 `command`
  // event instead.
  trigger({
    id: 'command_used',
    label: 'A player types the command',
    sentence: 'When a player types the command {subject}',
    group: 'players',
    slots: [SUBJECT_COMMAND],
    subject: 'command',
    subjectKinds: [COMMAND_KIND],
    definition: { field: 'event', bridge: true, unusableWith: 'function' },
    scriptEvent: 'command',
    actors: ['player'],
    actorLabels: { player: 'the player who typed it' },
    actionTargets: { player: 'self' },
  }),
  key({
    id: 'key_pressed',
    label: 'A player presses the key',
    sentence: 'When a player presses {subject}',
    slots: [SUBJECT_KEY, KEY_COOLDOWN],
    definition: { field: 'msm:on_press' },
    options: [cooldown(0, 1200)],
    scriptEvent: 'key.pressed',
    actorLabels: { player: 'the player who pressed it' },
  }),
  key({
    id: 'key_released',
    label: 'A player lets go of the key',
    sentence: 'When a player lets go of {subject}',
    slots: [SUBJECT_KEY],
    definition: { field: 'msm:on_release' },
    scriptEvent: 'key.released',
    actorLabels: { player: 'the player who let go' },
  }),
  key({
    id: 'key_held',
    label: 'While a player holds the key',
    sentence: 'Every {interval_seconds} while a player holds {subject}',
    slots: [KEY_INTERVAL, SUBJECT_KEY],
    definition: { field: 'msm:while_held' },
    options: [interval(1, 'hold_interval_ticks', 1200)],
    actorLabels: { player: 'the player holding it' },
  }),
  vehicle({
    id: 'vehicle_mounted',
    label: 'Someone gets in the vehicle',
    sentence: 'When someone gets in {subject}',
    slots: [SUBJECT_VEHICLE],
    definition: { field: 'on_mount' },
    scriptEvent: 'vehicle.mounted',
    actors: ['player'],
    actorLabels: { player: 'the player who got in' },
  }),
  vehicle({
    id: 'vehicle_dismounted',
    label: 'Someone gets out of the vehicle',
    sentence: 'When someone gets out of {subject}',
    slots: [SUBJECT_VEHICLE],
    definition: { field: 'on_dismount' },
    scriptEvent: 'vehicle.dismounted',
    actors: ['player'],
    actorLabels: { player: 'the player who got out' },
  }),
  vehicle({
    id: 'vehicle_fired',
    label: 'The vehicle fires',
    sentence: 'When {subject} fires',
    slots: [SUBJECT_VEHICLE],
    definition: { list: 'weapons', field: 'on_fire', required: true },
    scriptEvent: 'vehicle.fired',
    actors: ['player'],
    actorLabels: { player: 'the player who fired' },
  }),
  vehicle({
    id: 'vehicle_destroyed',
    label: 'The vehicle is destroyed',
    sentence: 'When {subject} is destroyed',
    slots: [SUBJECT_VEHICLE],
    definition: { field: 'on_destroy' },
    scriptEvent: 'vehicle.destroyed',
    actors: ['player'],
    actorLabels: { player: 'the player who destroyed it' },
  }),
  vehicle({
    id: 'vehicle_every',
    label: 'Every few seconds while the vehicle is driven',
    sentence: 'Every {interval_seconds} while {subject} is driven',
    slots: [INTERVAL, SUBJECT_VEHICLE],
    definition: { field: 'on_tick', fieldIsObject: true },
    options: [interval(5, 'interval')],
    scriptEvent: 'player.tick',
    actors: ['player'],
    actorLabels: { player: 'the driver' },
  }),
  // The games kinds (ADR 0115 D4): their functions fire these through the function bridge
  // (D5), the project's signal command, whose Script API `command` event the rules listen to.
  trigger({
    id: 'area_entered',
    label: 'A player enters the area',
    sentence: 'When a player enters {subject}',
    group: 'players',
    slots: [SUBJECT_AREA],
    subject: 'area',
    subjectKinds: [AREA_KIND],
    scriptEvent: 'command',
    signal: 'enter',
    actors: ['player'],
    actorLabels: { player: 'the player who came in' },
  }),
  trigger({
    id: 'area_left',
    label: 'A player leaves the area',
    sentence: 'When a player leaves {subject}',
    group: 'players',
    slots: [SUBJECT_AREA],
    subject: 'area',
    subjectKinds: [AREA_KIND],
    scriptEvent: 'command',
    signal: 'leave',
    actors: ['player'],
    actorLabels: { player: 'the player who went out' },
  }),
  trigger({
    id: 'timer_ended',
    label: 'A timer ends',
    sentence: 'When {subject} ends',
    group: 'world',
    slots: [SUBJECT_TIMER],
    subject: 'timer',
    subjectKinds: [TIMER_KIND],
    scriptEvent: 'command',
    signal: 'end',
    actors: [],
    hasPlace: false,
  }),
  trigger({
    id: 'one_block_broken',
    label: 'The one block is broken',
    sentence: 'When {subject} is broken {phase}',
    group: 'blocks',
    slots: [SUBJECT_ONE_BLOCK, PHASE],
    subject: 'one_block',
    subjectKinds: [ONE_BLOCK_KIND],
    scriptEvent: 'command',
    signal: 'break',
    // The one block's tick function sees the break, not who made it (B552).
    actors: [],
    hasPlace: false,
  }),
  trigger({
    id: 'world_started',
    label: 'The world starts',
    sentence: 'When the world starts',
    group: 'world',
    slots: [],
    scriptEvent: 'server.started',
    actors: [],
    hasPlace: false,
  }),
  trigger({
    id: 'world_every',
    label: 'Every few seconds',
    sentence: 'Every {interval_seconds}',
    group: 'world',
    slots: [INTERVAL],
    scriptEvent: 'server.tick',
    actors: [],
    hasPlace: false,
  }),
  // Every ServerExplosion (ADR 0096 D3): TNT, creepers, fireballs, beds, `World.explode`.
  trigger({
    id: 'explosion',
    label: 'Something explodes',
    sentence: 'When something explodes',
    group: 'world',
    slots: [],
    scriptEvent: 'world.explosion',
    actors: ['other'],
    actorLabels: { other: 'what exploded' },
    cancellable: true,
  }),
  trigger({
    id: 'any_block_used',
    label: 'A player uses any block',
    sentence: 'When a player uses {subject}',
    group: 'any',
    slots: [{ ...SUBJECT_BLOCK, optional: true }],
    subject: 'block',
    subjectOptional: true,
    scriptEvent: 'block.interact',
    actors: ['player'],
    hereIsBlock: true,
    cancellable: true,
  }),
  trigger({
    id: 'any_block_broken',
    label: 'A player breaks any block',
    sentence: 'When a player breaks {subject}',
    group: 'any',
    slots: [{ ...SUBJECT_BLOCK, optional: true }],
    subject: 'block',
    subjectOptional: true,
    scriptEvent: 'block.break',
    actors: ['player'],
    hereIsBlock: true,
    cancellable: true,
  }),
  // Placing by a player (ADR 0096 D3); dispensers, endermen and commands are not seen.
  trigger({
    id: 'any_block_placed',
    label: 'A player places a block',
    sentence: 'When a player places {subject}',
    group: 'any',
    slots: [{ ...SUBJECT_BLOCK, optional: true }],
    subject: 'block',
    subjectOptional: true,
    scriptEvent: 'block.place',
    actors: ['player'],
    hereIsBlock: true,
    cancellable: true,
  }),
  trigger({
    id: 'any_item_used',
    label: 'A player uses any item',
    sentence: 'When a player uses {subject}',
    group: 'any',
    slots: [{ ...SUBJECT_ITEM, optional: true }],
    subject: 'item',
    subjectOptional: true,
    scriptEvent: 'item.use',
    actors: ['player'],
    cancellable: true,
  }),
  trigger({
    id: 'any_mob_hurt',
    label: 'Any mob is hurt',
    sentence: 'When {subject} is hurt',
    group: 'any',
    slots: [{ ...SUBJECT_MOB, optional: true }],
    subject: 'mob',
    subjectOptional: true,
    scriptEvent: 'entity.hurt',
    actors: ['mob', 'other', 'player'],
    actorLabels: { other: 'the attacker', player: 'the player who hurt it' },
    cancellable: true,
  }),
  trigger({
    id: 'any_mob_died',
    label: 'Any mob dies',
    sentence: 'When {subject} dies',
    group: 'any',
    slots: [{ ...SUBJECT_MOB, optional: true }],
    subject: 'mob',
    subjectOptional: true,
    scriptEvent: 'entity.death',
    actors: ['mob', 'other', 'player'],
    actorLabels: { other: 'the killer', player: 'the player who killed it' },
    mobDead: true,
  }),
  trigger({
    id: 'any_mob_used',
    label: 'A player uses any mob',
    sentence: 'When a player uses {subject}',
    group: 'any',
    slots: [{ ...SUBJECT_MOB, optional: true }],
    subject: 'mob',
    subjectOptional: true,
    scriptEvent: 'entity.interact',
    actors: ['mob', 'player'],
    cancellable: true,
  }),
]);
