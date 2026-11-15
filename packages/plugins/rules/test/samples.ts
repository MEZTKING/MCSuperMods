/**
 * One sample rule per catalogue entry (every trigger, step, condition, value, place and "who"),
 * used by the golden, schema and type-check tests. Each sample is a rule book with one rule.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { CONDITIONS, PLACES, STEPS, TRIGGERS, VALUES, WHO } from '../src/catalogue';

export interface Sample {
  readonly name: string;
  readonly rules: Json[];
  readonly counters?: Json[];
}

const CHIME = { sound: 'minecraft:block.note_block.chime', step: 'play_sound' };
const GIVE = { count: 2, item: 'demo:ruby', step: 'give_item' };
const COUNTERS: Json[] = [
  { name: 'clicks', scope: 'player', start: 0 },
  { name: 'goal', scope: 'world', start: 10 },
  { name: 'hits', scope: 'world' },
  { name: 'anger', scope: 'mob', start: 1 },
];

const rule = (when: JsonObject, steps: Json[], onlyIf?: JsonObject): JsonObject => ({
  do: steps,
  key: 'sample',
  ...(onlyIf === undefined ? {} : { only_if: onlyIf }),
  when,
});

/** The subject and options of each trigger's sample. */
const TRIGGER_WHEN: Record<string, JsonObject> = {
  block_used: { subject: 'demo:plain_block' },
  block_stepped_on: { options: { cooldown_seconds: 1 }, subject: 'demo:plain_block' },
  block_broken: { subject: 'demo:plain_block' },
  block_placed: { subject: 'demo:plain_block' },
  block_random_tick: { options: { chance: 0.5 }, subject: 'demo:plain_block' },
  block_entity_inside: { options: { cooldown_seconds: 1 }, subject: 'demo:plain_block' },
  block_powered: { subject: 'demo:plain_block' },
  block_unpowered: { subject: 'demo:plain_block' },
  container_opened: { subject: 'demo:crate' },
  container_closed: { subject: 'demo:crate' },
  machine_started: { subject: 'demo:press' },
  machine_finished: { subject: 'demo:press' },
  portal_travelled: { subject: 'demo:gate' },
  item_used: { options: { cooldown_seconds: 2 }, subject: 'demo:wand' },
  item_used_on_block: { subject: 'demo:wand' },
  item_hit_mob: { subject: 'demo:wand' },
  item_held: { options: { hand: 'either', interval_seconds: 2 }, subject: 'demo:wand' },
  item_worn: { options: { interval_seconds: 5 }, subject: 'demo:helmet' },
  thrown_hit_mob: { subject: 'demo:dart' },
  thrown_hit_block: { subject: 'demo:dart' },
  mob_hurt: { subject: 'demo:guard' },
  mob_died: { subject: 'demo:guard' },
  mob_used: { subject: 'demo:guard' },
  mob_attacked: { subject: 'demo:guard' },
  mob_every: { options: { interval_seconds: 3 }, subject: 'demo:guard' },
  mob_spawned: { subject: 'demo:guard' },
  effect_started: { subject: 'demo:glow' },
  effect_every: { options: { interval_seconds: 0.5 }, subject: 'demo:glow' },
  effect_ended: { subject: 'demo:glow' },
  player_joined: {},
  player_left: {},
  player_respawned: {},
  player_chatted: { options: { message_contains: 'Hello' } },
  player_changed_dimension: {},
  player_every: { options: { interval_seconds: 2 } },
  player_mounted: {},
  player_dismounted: {},
  command_used: { subject: 'demo:hello' },
  key_pressed: { options: { cooldown_seconds: 1.5 }, subject: 'demo:dash' },
  key_released: { subject: 'demo:dash' },
  key_held: { options: { interval_seconds: 0.25 }, subject: 'demo:dash' },
  vehicle_mounted: { subject: 'demo:tank' },
  vehicle_dismounted: { subject: 'demo:tank' },
  vehicle_fired: { subject: 'demo:tank' },
  vehicle_destroyed: { subject: 'demo:tank' },
  vehicle_every: { options: { interval_seconds: 2 }, subject: 'demo:tank' },
  world_started: {},
  world_every: { options: { interval_seconds: 10 } },
  explosion: {},
  any_block_used: { subject: 'minecraft:stone' },
  any_block_broken: { subject: 'minecraft:stone' },
  any_block_placed: { subject: 'minecraft:tnt' },
  any_item_used: { subject: 'minecraft:stick' },
  any_mob_hurt: { subject: 'minecraft:zombie' },
  any_mob_died: {},
  any_mob_used: { subject: 'minecraft:cow' },
};

const when = (trigger: string): JsonObject => ({ ...TRIGGER_WHEN[trigger], trigger });

const triggerSample = (trigger: string): Json[] => {
  if (trigger === 'world_started' || trigger === 'world_every') {
    return [{ seconds: 30, step: 'set_weather', weather: 'clear' }];
  }
  if (trigger.startsWith('player_') || trigger.startsWith('any_')) {
    return [{ step: 'show_message', text: ['Something happened.'] }];
  }
  return [CHIME];
};

/** The trigger and steps of each step's sample. */
const STEP_SAMPLES: Record<string, { trigger: string; steps: Json[] }> = {
  give_item: { trigger: 'block_used', steps: [GIVE] },
  take_item: {
    trigger: 'block_used',
    steps: [{ count: 1, item: 'minecraft:diamond', step: 'take_item' }],
  },
  heal: { trigger: 'block_used', steps: [{ amount: 4, step: 'heal' }] },
  hurt: { trigger: 'block_used', steps: [{ amount: 2, step: 'hurt', who: 'player' }] },
  feed: { trigger: 'block_used', steps: [{ food: 6, saturation: 2, step: 'feed' }] },
  give_experience: {
    trigger: 'block_used',
    steps: [{ amount: 3, levels: true, step: 'give_experience' }],
  },
  set_game_mode: { trigger: 'block_used', steps: [{ mode: 'creative', step: 'set_game_mode' }] },
  teleport: { trigger: 'block_used', steps: [{ step: 'teleport', to: 'above_here' }] },
  launch: {
    trigger: 'block_stepped_on',
    steps: [{ direction: 'up', step: 'launch', strength: 1, up: 0.5, who: 'other' }],
  },
  show_message: { trigger: 'block_used', steps: [{ step: 'show_message', text: ['Hello!'] }] },
  show_title: {
    trigger: 'player_joined',
    steps: [{ step: 'show_title', subtitle: ['to the mod'], title: ['Welcome'] }],
  },
  show_action_bar: {
    trigger: 'block_used',
    steps: [{ step: 'show_action_bar', text: ['Ready'] }],
  },
  show_hud: { trigger: 'key_pressed', steps: [{ hud: 'demo:mana', step: 'show_hud' }] },
  hide_hud: {
    trigger: 'vehicle_dismounted',
    steps: [{ hud: 'demo:mana', step: 'hide_hud', who: 'player' }],
  },
  set_hud: {
    trigger: 'vehicle_fired',
    steps: [
      {
        hud: 'demo:mana',
        step: 'set_hud',
        value: { value: 'vehicle_ammo', weapon: 'cannon' },
      },
    ],
  },
  give_effect: {
    trigger: 'item_used',
    steps: [{ effect: 'minecraft:speed', level: 2, seconds: 10, step: 'give_effect' }],
  },
  remove_effect: {
    trigger: 'item_used',
    steps: [{ effect: 'minecraft:poison', step: 'remove_effect' }],
  },
  place_block: {
    trigger: 'block_used',
    steps: [{ block: 'minecraft:gold_block', step: 'place_block', where: 'above_here' }],
  },
  remove_block: {
    trigger: 'block_used',
    steps: [{ step: 'remove_block', where: 'above_here' }],
  },
  spawn_mob: {
    trigger: 'block_used',
    steps: [{ count: 2, mob: 'minecraft:zombie', step: 'spawn_mob', where: 'above_here' }],
  },
  drop_item: {
    trigger: 'block_broken',
    steps: [{ count: 3, item: 'minecraft:emerald', step: 'drop_item' }],
  },
  explode: { trigger: 'block_used', steps: [{ fire: true, power: 2, step: 'explode' }] },
  set_weather: {
    trigger: 'item_used',
    steps: [{ seconds: 60, step: 'set_weather', weather: 'rain' }],
  },
  run_function: {
    trigger: 'block_used',
    steps: [{ function: 'demo:reward', step: 'run_function' }],
  },
  run_command: {
    trigger: 'block_used',
    steps: [{ command: ['say ', { value: 'player_level' }], step: 'run_command' }],
  },
  light_portal: { trigger: 'block_used', steps: [{ portal: 'demo:gate', step: 'light_portal' }] },
  play_sound: {
    trigger: 'block_used',
    steps: [{ ...CHIME, pitch: 1.2, volume: 0.8 }],
  },
  spawn_particles: {
    trigger: 'block_used',
    steps: [
      {
        count: 8,
        particle: { color: [1, 0, 0], scale: 1, type: 'minecraft:dust' },
        spread: 0.5,
        step: 'spawn_particles',
      },
    ],
  },
  play_animation: { trigger: 'mob_used', steps: [{ animation: 'wave', step: 'play_animation' }] },
  remove_mob: { trigger: 'mob_used', steps: [{ step: 'remove_mob' }] },
  show_boss_bar: {
    trigger: 'mob_hurt',
    steps: [
      { amount: 1, counter: 'hits', scope: 'world', step: 'add_to_counter' },
      {
        bar: 'guard',
        color: 'red',
        max: 10,
        step: 'show_boss_bar',
        title: ['Guard hits: ', { counter: 'hits', scope: 'world', value: 'counter' }],
        value: { counter: 'hits', scope: 'world', value: 'counter' },
        who: { radius: 32, who: 'players_nearby' },
      },
    ],
  },
  if: {
    trigger: 'block_used',
    steps: [
      {
        conditions: [{ condition: 'player_sneaking' }],
        do: [GIVE],
        else: [{ step: 'show_message', text: ['Sneak to get a ruby.'] }],
        match: 'all',
        step: 'if',
      },
    ],
  },
  repeat: {
    trigger: 'block_used',
    steps: [
      {
        do: [CHIME, { seconds: 0.5, step: 'wait' }],
        step: 'repeat',
        times: 3,
      },
      { step: 'show_message', text: ['Done.'] },
    ],
  },
  for_each_player: {
    trigger: 'world_every',
    steps: [
      {
        do: [{ step: 'show_action_bar', text: ['Level ', { value: 'player_level' }] }],
        step: 'for_each_player',
      },
    ],
  },
  wait: {
    trigger: 'mob_every',
    steps: [CHIME, { seconds: 2, step: 'wait' }, { animation: 'wave', step: 'play_animation' }],
  },
  stop_placing: {
    trigger: 'any_block_placed',
    steps: [{ step: 'stop_placing' }, { step: 'show_message', text: ['Not here.'] }],
  },
  stop_explosion: { trigger: 'explosion', steps: [{ step: 'stop_explosion' }] },
  keep_blocks_safe: { trigger: 'explosion', steps: [{ step: 'keep_blocks_safe' }, CHIME] },
  ride: { trigger: 'mob_used', steps: [{ mount: 'mob', step: 'ride' }] },
  dismount: { trigger: 'player_mounted', steps: [{ step: 'dismount' }] },
  stop_normal_action: {
    trigger: 'any_block_broken',
    steps: [{ step: 'stop_normal_action' }, { step: 'show_message', text: ['This stone stays.'] }],
  },
  set_counter: {
    trigger: 'block_used',
    steps: [{ amount: 0, counter: 'clicks', scope: 'player', step: 'set_counter' }],
  },
  add_to_counter: {
    trigger: 'block_used',
    steps: [{ amount: 1, counter: 'clicks', scope: 'player', step: 'add_to_counter' }],
  },
  take_from_counter: {
    trigger: 'mob_hurt',
    steps: [{ amount: 1, counter: 'anger', scope: 'mob', step: 'take_from_counter' }],
  },
};

/** The trigger and condition of each condition's sample. */
const CONDITION_SAMPLES: Record<
  string,
  { trigger: string; condition: JsonObject; steps?: Json[] }
> = {
  player_sneaking: { trigger: 'block_used', condition: {} },
  player_in_creative: { trigger: 'block_used', condition: { not: true } },
  player_holding: { trigger: 'block_used', condition: { hand: 'either', item: 'demo:wand' } },
  player_has_item: { trigger: 'block_used', condition: { count: 3, item: 'minecraft:diamond' } },
  player_health: { trigger: 'block_used', condition: { compare: 'at_most', number: 6 } },
  player_food: { trigger: 'block_used', condition: { compare: 'less_than', number: 10 } },
  player_level: { trigger: 'block_used', condition: { compare: 'at_least', number: 5 } },
  chance: { trigger: 'block_used', condition: { percent: 25 } },
  is_day: { trigger: 'block_used', condition: {} },
  is_night: { trigger: 'block_used', condition: {} },
  is_raining: { trigger: 'block_used', condition: {} },
  is_thundering: { trigger: 'block_used', condition: { not: true } },
  block_is: {
    trigger: 'block_used',
    condition: { block: 'minecraft:grass_block', where: { offset: [0, -1, 0], place: 'offset' } },
  },
  mob_is: { trigger: 'item_hit_mob', condition: { mob: 'minecraft:zombie' } },
  is_riding: { trigger: 'player_every', condition: { mount: 'minecraft:horse' } },
  is_facing: { trigger: 'block_used', condition: { direction: 'north' } },
  caused_by: {
    trigger: 'explosion',
    condition: { cause: 'minecraft:creeper' },
    steps: [{ step: 'keep_blocks_safe' }],
  },
  dimension_is: { trigger: 'block_used', condition: { dimension: 'minecraft:the_nether' } },
  counter: {
    trigger: 'block_used',
    condition: {
      compare: 'at_least',
      counter: 'clicks',
      number: { counter: 'goal', scope: 'world', value: 'counter' },
      scope: 'player',
    },
  },
};

const VALUE_SAMPLES: Record<string, JsonObject> = {
  random: { max: 6, min: 1, value: 'random' },
  counter: { counter: 'clicks', scope: 'player', value: 'counter' },
  player_health: { value: 'player_health' },
  player_food: { value: 'player_food' },
  player_level: { value: 'player_level' },
  player_position: { axis: 'y', value: 'player_position' },
  player_count: { value: 'player_count' },
  time_of_day: { value: 'time_of_day' },
  vehicle_fuel: { value: 'vehicle_fuel' },
  vehicle_damage: { value: 'vehicle_damage' },
  vehicle_ammo: { value: 'vehicle_ammo' },
  facing: { of: 'here', value: 'facing' },
  math: {
    a: { counter: 'clicks', scope: 'player', value: 'counter' },
    b: 2,
    op: '/',
    value: 'math',
  },
};

const PLACE_SAMPLES: Record<string, { trigger: string; where: Json }> = {
  here: { trigger: 'block_used', where: 'here' },
  above_here: { trigger: 'block_used', where: 'above_here' },
  in_front_of_here: { trigger: 'block_used', where: 'in_front_of_here' },
  player: { trigger: 'block_used', where: 'player' },
  mob: { trigger: 'mob_used', where: 'mob' },
  player_looking: { trigger: 'item_used', where: { distance: 10, place: 'player_looking' } },
  offset: { trigger: 'block_used', where: { from: 'player', offset: [1, 0, 1], place: 'offset' } },
};

const WHO_SAMPLES: Record<string, { trigger: string; who: Json }> = {
  player: { trigger: 'block_used', who: 'player' },
  mob: { trigger: 'mob_used', who: 'mob' },
  other: { trigger: 'item_hit_mob', who: 'other' },
  every_player: { trigger: 'block_used', who: 'every_player' },
  players_nearby: { trigger: 'block_used', who: { radius: 8, who: 'players_nearby' } },
};

const need = <T>(table: Record<string, T>, id: string): T => {
  const value = table[id];
  if (value === undefined) throw new Error(`no sample for ${id}`);
  return value;
};

/**
 * Rules on the key and vehicle triggers that are not plain, so they become listeners of the
 * Script API 1.5 events (or, for a held key, a `run_script` handler) beside a plain rule (B424).
 */
const LISTENER_SAMPLES: readonly Sample[] = [
  {
    name: 'listener-key_pressed',
    rules: [
      {
        do: [
          { amount: 1, counter: 'clicks', scope: 'player', step: 'add_to_counter' },
          {
            hud: 'demo:mana',
            step: 'set_hud',
            text: ['Dashes: ', { counter: 'clicks', scope: 'player', value: 'counter' }],
          },
        ],
        key: 'sample',
        when: { subject: 'demo:dash', trigger: 'key_pressed' },
      },
    ],
    counters: COUNTERS,
  },
  {
    name: 'listener-key_held',
    rules: [
      {
        do: [{ seconds: 1, step: 'wait' }, CHIME],
        key: 'sample',
        when: { subject: 'demo:dash', trigger: 'key_held' },
      },
    ],
  },
  {
    name: 'listener-vehicle_mounted',
    rules: [
      {
        do: [{ step: 'show_message', text: ['Fuel: ', { value: 'vehicle_fuel' }] }],
        key: 'sample',
        when: { subject: 'demo:tank', trigger: 'vehicle_mounted' },
      },
    ],
  },
  {
    name: 'listener-vehicle_every',
    rules: [
      {
        do: [{ hud: 'demo:mana', step: 'show_hud' }],
        key: 'sample',
        when: { options: { interval_seconds: 1 }, subject: 'demo:tank', trigger: 'vehicle_every' },
      },
      {
        do: [{ step: 'show_action_bar', text: ['Low on fuel'] }],
        key: 'low',
        only_if: {
          conditions: [
            {
              compare: 'less_than',
              condition: 'counter',
              counter: 'goal',
              number: { value: 'vehicle_fuel' },
              scope: 'world',
            },
          ],
          match: 'all',
        },
        when: { subject: 'demo:tank', trigger: 'vehicle_every' },
      },
    ],
    counters: COUNTERS,
  },
  {
    name: 'listener-vehicle_destroyed',
    rules: [
      {
        do: [{ power: 3, step: 'explode', where: 'above_here' }],
        key: 'sample',
        when: { subject: 'demo:tank', trigger: 'vehicle_destroyed' },
      },
    ],
  },
  // B458: a command's rules that are not plain go through `run_script` in its event; a command
  // that runs a function listens to the Script API 1.6 `command` event.
  {
    name: 'listener-command_used',
    rules: [
      {
        do: [{ step: 'show_message', text: ['You face ', { of: 'player', value: 'facing' }] }],
        key: 'sample',
        when: { subject: 'demo:hello', trigger: 'command_used' },
      },
      {
        do: [CHIME],
        key: 'warp',
        when: { subject: 'demo:warp', trigger: 'command_used' },
      },
    ],
  },
  {
    name: 'listener-explosion',
    rules: [
      {
        do: [{ step: 'keep_blocks_safe' }],
        key: 'sample',
        only_if: {
          conditions: [{ cause: 'minecraft:creeper', condition: 'caused_by' }],
          match: 'all',
        },
        when: { trigger: 'explosion' },
      },
      {
        do: [{ step: 'stop_explosion' }],
        key: 'beds',
        only_if: { conditions: [{ cause: 'block', condition: 'caused_by' }], match: 'all' },
        when: { trigger: 'explosion' },
      },
    ],
  },
  {
    name: 'listener-conveyor',
    rules: [
      {
        do: [{ step: 'teleport', to: 'in_front_of_here' }],
        key: 'sample',
        only_if: {
          conditions: [{ condition: 'is_facing', direction: 'east', of: 'here' }],
          match: 'all',
        },
        when: {
          options: { cooldown_seconds: 0.5 },
          subject: 'demo:plain_block',
          trigger: 'block_stepped_on',
        },
      },
    ],
  },
];

/** Every sample, named `<section>-<id>`. */
export const SAMPLES: readonly Sample[] = Object.freeze([
  ...TRIGGERS.map((trigger) => ({
    name: `trigger-${trigger.id}`,
    rules: [rule(when(trigger.id), triggerSample(trigger.id))],
  })),
  ...STEPS.map((step) => {
    const sample = need(STEP_SAMPLES, step.id);
    return {
      name: `step-${step.id}`,
      rules: [rule(when(sample.trigger), sample.steps)],
      counters: COUNTERS,
    };
  }),
  ...CONDITIONS.map((condition) => {
    const sample = need(CONDITION_SAMPLES, condition.id);
    return {
      name: `condition-${condition.id}`,
      rules: [
        rule(when(sample.trigger), sample.steps ?? [GIVE], {
          conditions: [{ ...sample.condition, condition: condition.id }],
          match: 'all',
        }),
      ],
      counters: COUNTERS,
    };
  }),
  ...VALUES.map((value) => ({
    name: `value-${value.id}`,
    rules: [
      rule(when('block_used'), [
        { step: 'show_message', text: ['Value: ', need(VALUE_SAMPLES, value.id)] },
      ]),
    ],
    counters: COUNTERS,
  })),
  ...PLACES.map((place) => {
    const sample = need(PLACE_SAMPLES, place.id);
    return {
      name: `place-${place.id}`,
      rules: [
        rule(when(sample.trigger), [
          { mob: 'minecraft:chicken', step: 'spawn_mob', where: sample.where },
        ]),
      ],
    };
  }),
  ...WHO.map((who) => {
    const sample = need(WHO_SAMPLES, who.id);
    return {
      name: `who-${who.id}`,
      rules: [rule(when(sample.trigger), [{ amount: 4, step: 'heal', who: sample.who }])],
    };
  }),
  ...LISTENER_SAMPLES,
]);
