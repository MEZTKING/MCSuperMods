import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  collectReferences,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  MSM_TYPE_PATHS,
  validateJson,
} from '../src/index';

/**
 * The rule book format (ADR 0082 D2, D5, D8), `::msm::rules::RuleBook` in
 * `mcdoc/msm/rules.mcdoc`. Rule books are editor-only (the runtime never reads them), so their
 * cases live here rather than in the conformance corpus the runtime shares.
 */
const index = createSchemaIndex({ ref: 'empty', mcdoc: {}, dispatchers: {} }, { mcVersion: '1.0' });
const schema = index.resolveSchemaRef(MSM_SCHEMA_REFS.rules);

const check = (value: Json) => validateJson(value, schema);
const errors = (value: Json): string[] =>
  check(value)
    .filter((p) => p.severity === 'error')
    .map((p) => `${p.path} ${p.code}`);

/** A book with one rule whose `do` is `steps`. */
const bookWith = (steps: Json[], extra: Record<string, Json> = {}): Json => ({
  format: 1,
  rules: [
    {
      do: steps,
      key: 'r',
      when: { subject: 'mymod:ruby_block', trigger: 'block_used' },
      ...extra,
    },
  ],
});

/** The ADR 0082 D2 example. */
const EXAMPLE: Json = {
  counters: [{ name: 'clicks', scope: 'player', start: 0 }],
  format: 1,
  rules: [
    {
      do: [
        { count: 2, item: 'mymod:ruby', step: 'give_item', who: 'player' },
        { sound: 'minecraft:block.note_block.chime', step: 'play_sound', where: 'here' },
      ],
      key: 'ruby_gift',
      name: 'Ruby gift',
      only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
      when: { subject: 'mymod:ruby_block', trigger: 'block_used' },
    },
  ],
};

/** The trigger ids of ADR 0082 D4, in snake case. */
const TRIGGERS = [
  'block_used',
  'block_stepped_on',
  'block_broken',
  'block_placed',
  'block_random_tick',
  'block_entity_inside',
  'block_powered',
  'block_unpowered',
  'container_opened',
  'container_closed',
  'machine_started',
  'machine_finished',
  'portal_travelled',
  'item_used',
  'item_used_on_block',
  'item_hit_mob',
  'item_held',
  'item_worn',
  'thrown_hit_mob',
  'thrown_hit_block',
  'mob_hurt',
  'mob_died',
  'mob_used',
  'mob_attacked',
  'mob_every',
  'mob_spawned',
  'effect_started',
  'effect_every',
  'effect_ended',
  'player_joined',
  'player_left',
  'player_respawned',
  'player_chatted',
  'player_changed_dimension',
  'player_every',
  'world_started',
  'world_every',
  'any_block_used',
  'any_block_broken',
  'any_item_used',
  'any_mob_hurt',
  'any_mob_died',
  'any_mob_used',
  'key_pressed',
  'key_released',
  'key_held',
  'vehicle_mounted',
  'vehicle_dismounted',
  'vehicle_fired',
  'vehicle_destroyed',
  'vehicle_every',
  'player_mounted',
  'player_dismounted',
  'command_used',
  'explosion',
  'any_block_placed',
];

/** Triggers with no subject at all (script-only player and world triggers). */
const NO_SUBJECT = new Set([
  'player_joined',
  'player_left',
  'player_respawned',
  'player_chatted',
  'player_changed_dimension',
  'player_every',
  'world_started',
  'world_every',
  'player_mounted',
  'player_dismounted',
  'explosion',
]);

/** One valid case of every step of ADR 0082 D5 (logic steps included). */
const STEPS: Record<string, Json> = {
  give_item: { item: 'mymod:ruby', step: 'give_item' },
  take_item: {
    count: { max: 3, min: 1, value: 'random' },
    item: 'minecraft:emerald',
    step: 'take_item',
  },
  heal: { amount: 4, step: 'heal', who: 'other' },
  hurt: { amount: 2, step: 'hurt', who: { radius: 8, who: 'players_nearby' } },
  feed: { food: 6, saturation: 2, step: 'feed' },
  give_experience: { amount: 1, levels: true, step: 'give_experience' },
  set_game_mode: { mode: 'adventure', step: 'set_game_mode' },
  teleport: { step: 'teleport', to: { from: 'player', offset: [0, 10, 0], place: 'offset' } },
  launch: { direction: 'up', step: 'launch', strength: 1.5, up: 0.5 },
  show_message: {
    step: 'show_message',
    text: ['You clicked ', { counter: 'clicks', scope: 'player', value: 'counter' }, ' times'],
  },
  show_hud: { hud: 'mymod:mana', step: 'show_hud' },
  hide_hud: { hud: 'mymod:mana', step: 'hide_hud', who: 'every_player' },
  set_hud: { hud: 'mymod:mana', step: 'set_hud', value: { value: 'vehicle_fuel' } },
  show_title: {
    step: 'show_title',
    subtitle: ['Well done'],
    title: ['Hello'],
    who: 'every_player',
  },
  show_action_bar: { step: 'show_action_bar', text: ['Health: ', { value: 'player_health' }] },
  give_effect: { effect: 'minecraft:speed', level: 2, seconds: 10, step: 'give_effect' },
  remove_effect: { effect: 'minecraft:poison', step: 'remove_effect' },
  place_block: { block: 'minecraft:gold_block', step: 'place_block', where: 'above_here' },
  remove_block: {
    drop_items: true,
    step: 'remove_block',
    where: { distance: 6, place: 'player_looking' },
  },
  spawn_mob: { count: 2, mob: 'minecraft:zombie', step: 'spawn_mob', where: 'mob' },
  drop_item: { item: 'minecraft:diamond', step: 'drop_item' },
  explode: { break_blocks: false, fire: true, power: 3, step: 'explode' },
  set_weather: { seconds: 60, step: 'set_weather', weather: 'thunder' },
  run_function: { function: 'mymod:reward', step: 'run_function' },
  run_command: { command: ['say hi'], step: 'run_command' },
  light_portal: { portal: 'mymod:sky_portal', step: 'light_portal' },
  play_sound: {
    pitch: 1.2,
    sound: 'minecraft:block.note_block.chime',
    step: 'play_sound',
    volume: 0.5,
  },
  spawn_particles: {
    count: 20,
    particle: { color: [1, 0, 0], scale: 1, type: 'minecraft:dust' },
    speed: 0.1,
    spread: 0.5,
    step: 'spawn_particles',
  },
  play_animation: { animation: 'wave', step: 'play_animation' },
  remove_mob: { step: 'remove_mob' },
  show_boss_bar: {
    bar: 'guard',
    color: 'red',
    max: 20,
    step: 'show_boss_bar',
    title: ['Guard'],
    value: { value: 'player_health' },
    visible: true,
  },
  wait: { seconds: 0.5, step: 'wait' },
  stop_normal_action: { step: 'stop_normal_action' },
  set_counter: { amount: 0, counter: 'clicks', scope: 'player', step: 'set_counter' },
  add_to_counter: {
    amount: { a: { value: 'player_level' }, b: 2, op: '*', value: 'math' },
    counter: 'clicks',
    scope: 'player',
    step: 'add_to_counter',
  },
  take_from_counter: { amount: 1, counter: 'kills', scope: 'world', step: 'take_from_counter' },
  if: {
    conditions: [{ condition: 'is_night' }],
    else: [{ step: 'wait', seconds: 1 }],
    match: 'any',
    step: 'if',
    do: [{ item: 'minecraft:torch', step: 'give_item' }],
  },
  stop_placing: { step: 'stop_placing' },
  stop_explosion: { step: 'stop_explosion' },
  keep_blocks_safe: { step: 'keep_blocks_safe' },
  ride: { mount: 'mob', step: 'ride', who: 'other' },
  dismount: { step: 'dismount' },
  repeat: { do: [{ amount: 1, step: 'heal' }], step: 'repeat', times: 3 },
  for_each_player: {
    do: [{ step: 'show_message', text: ['Boo'] }],
    radius: 16,
    step: 'for_each_player',
  },
};

/** One valid case of every condition of ADR 0082 D5. */
const CONDITIONS: Record<string, Json> = {
  player_sneaking: { condition: 'player_sneaking' },
  player_in_creative: { condition: 'player_in_creative', not: true },
  player_holding: { condition: 'player_holding', hand: 'off', item: 'minecraft:shield' },
  player_has_item: { condition: 'player_has_item', count: 3, item: 'mymod:ruby' },
  player_health: { compare: 'at_most', condition: 'player_health', number: 6 },
  player_food: { compare: 'less_than', condition: 'player_food', number: 10 },
  player_level: { compare: 'at_least', condition: 'player_level', number: 5 },
  chance: { condition: 'chance', percent: 25 },
  is_day: { condition: 'is_day' },
  is_night: { condition: 'is_night' },
  is_raining: { condition: 'is_raining' },
  is_thundering: { condition: 'is_thundering', not: true },
  block_is: { block: 'minecraft:grass_block', condition: 'block_is', where: 'above_here' },
  mob_is: { condition: 'mob_is', mob: 'minecraft:zombie' },
  is_riding: { condition: 'is_riding', mount: 'minecraft:horse', who: 'player' },
  is_facing: { condition: 'is_facing', direction: 'up', of: 'here' },
  caused_by: { cause: 'block', condition: 'caused_by' },
  dimension_is: { condition: 'dimension_is', dimension: 'minecraft:the_nether' },
  counter: {
    compare: 'more_than',
    condition: 'counter',
    counter: 'clicks',
    number: { counter: 'best', scope: 'world', value: 'counter' },
    scope: 'player',
  },
};

/** One valid case of every value of ADR 0082 D2, D5. */
const VALUES: Record<string, Json> = {
  random: { max: 6, min: 1, value: 'random', whole: true },
  counter: { counter: 'clicks', scope: 'mob', value: 'counter' },
  player_health: { value: 'player_health' },
  player_food: { value: 'player_food' },
  player_level: { value: 'player_level' },
  player_position: { axis: 'y', value: 'player_position' },
  player_count: { value: 'player_count' },
  time_of_day: { value: 'time_of_day' },
  vehicle_fuel: { value: 'vehicle_fuel' },
  vehicle_damage: { value: 'vehicle_damage' },
  vehicle_ammo: { value: 'vehicle_ammo', weapon: 'cannon' },
  facing: { of: 'player', value: 'facing' },
  math: { a: { max: 3, min: 1, value: 'random' }, b: 2, op: '+', value: 'math' },
};

/** A nested step: `outer` holding `inner` in its `do`. */
const nest = (outer: 'if' | 'repeat' | 'for_each_player', inner: Json): Json => {
  switch (outer) {
    case 'if':
      return { conditions: [], match: 'all', step: 'if', do: [inner] };
    case 'repeat':
      return { do: [inner], step: 'repeat', times: 2 };
    default:
      return { do: [inner], step: 'for_each_player' };
  }
};

describe('rule book schema (ADR 0082 D2)', () => {
  it('resolves through msm:rules to the RuleBook struct', () => {
    expect(MSM_TYPE_PATHS.rules).toBe('::msm::rules::RuleBook');
    expect(schema).toBe(index.resolve(MSM_TYPE_PATHS.rules));
    expect(schema.kind).toBe('struct');
  });

  it('accepts the ADR example and an empty book', () => {
    expect(check(EXAMPLE)).toEqual([]);
    expect(check({ format: 1, rules: [] })).toEqual([]);
    expect(check({ counters: [], format: 1, rules: [] })).toEqual([]);
  });

  it('rejects another format, missing rules and unknown top-level fields', () => {
    expect(errors({ format: 2, rules: [] })).toContain('/format schema.invalid-literal');
    expect(errors({ format: 1 })).toContain('/rules schema.missing-field');
    expect(errors({ format: 1, rules: [], extra: true })).toContain('/extra schema.unknown-field');
  });

  it('checks rule fields: key length, enabled, name', () => {
    expect(errors(bookWith([], { enabled: false, name: 'Off' }))).toEqual([]);
    expect(errors(bookWith([], { key: '' }))).toContain('/rules/0/key schema.invalid-length');
    expect(errors(bookWith([], { key: 'k'.repeat(33) }))).toContain(
      '/rules/0/key schema.invalid-length',
    );
    expect(errors(bookWith([], { enabled: 'no' }))).toContain(
      '/rules/0/enabled schema.type-mismatch',
    );
    expect(errors({ format: 1, rules: [{ do: [], key: 'r' }] })).toContain(
      '/rules/0/when schema.missing-field',
    );
  });

  it('checks counters', () => {
    expect(errors({ counters: [{ name: 'c', scope: 'world' }], format: 1, rules: [] })).toEqual([]);
    expect(errors({ counters: [{ name: 'c', scope: 'team' }], format: 1, rules: [] })).toContain(
      '/counters/0/scope schema.invalid-enum',
    );
    expect(errors({ counters: [{ scope: 'player' }], format: 1, rules: [] })).toContain(
      '/counters/0/name schema.missing-field',
    );
  });
});

describe('rule book triggers (ADR 0082 D4)', () => {
  it('lists every trigger id', () => {
    const trigger = index.resolve('::msm::rules::Trigger');
    expect(trigger.kind).toBe('enum');
    if (trigger.kind === 'enum') {
      expect(trigger.values.map((v) => v.value).sort()).toEqual([...TRIGGERS].sort());
    }
  });

  it.each(TRIGGERS)('accepts %s with or without a subject as it allows', (trigger) => {
    const subject =
      trigger.includes('item') || trigger.startsWith('thrown')
        ? 'mymod:wand'
        : trigger.includes('mob')
          ? 'mymod:guard'
          : trigger.startsWith('effect')
            ? 'mymod:glow'
            : trigger.startsWith('key')
              ? 'mymod:dash'
              : trigger.startsWith('vehicle')
                ? 'mymod:tank'
                : 'mymod:ruby_block';
    const when = (withSubject: boolean): Json => ({
      ...(withSubject ? { subject } : {}),
      trigger,
    });
    const book = (withSubject: boolean): Json => ({
      format: 1,
      rules: [{ do: [], key: 'r', when: when(withSubject) }],
    });
    if (NO_SUBJECT.has(trigger)) {
      expect(errors(book(false))).toEqual([]);
      expect(errors(book(true))).toContain('/rules/0/when/subject schema.unknown-field');
    } else if (trigger.startsWith('any_')) {
      expect(errors(book(false))).toEqual([]);
      expect(errors(book(true))).toEqual([]);
    } else {
      expect(errors(book(true))).toEqual([]);
      expect(errors(book(false))).toContain('/rules/0/when/subject schema.missing-field');
    }
  });

  it('keeps key options within what a key bind takes (B424)', () => {
    const keyBook = (trigger: string, options: Json): Json => ({
      format: 1,
      rules: [{ do: [], key: 'r', when: { options, subject: 'mymod:dash', trigger } }],
    });
    expect(errors(keyBook('key_pressed', { cooldown_seconds: 60 }))).toEqual([]);
    expect(errors(keyBook('key_pressed', { cooldown_seconds: 61 }))).not.toEqual([]);
    expect(errors(keyBook('key_held', { interval_seconds: 0.05 }))).toEqual([]);
    expect(errors(keyBook('key_held', { interval_seconds: 61 }))).not.toEqual([]);
    expect(errors(keyBook('key_released', { cooldown_seconds: 1 }))).not.toEqual([]);
  });

  it('checks the B458 conditions and steps', () => {
    const conditionBook = (condition: Json): Json => ({
      format: 1,
      rules: [
        {
          do: [],
          key: 'r',
          only_if: { conditions: [condition], match: 'all' },
          when: { trigger: 'explosion' },
        },
      ],
    });
    expect(errors(conditionBook({ cause: 'minecraft:creeper', condition: 'caused_by' }))).toEqual(
      [],
    );
    expect(errors(conditionBook({ condition: 'caused_by' }))).not.toEqual([]);
    expect(errors(conditionBook({ condition: 'is_facing', direction: 'sideways' }))).not.toEqual(
      [],
    );
    expect(errors(conditionBook({ condition: 'is_facing' }))).not.toEqual([]);
    const stepBook = (step: Json): Json => ({
      format: 1,
      rules: [{ do: [step], key: 'r', when: { trigger: 'player_mounted' } }],
    });
    expect(errors(stepBook({ step: 'ride' }))).not.toEqual([]);
    expect(errors(stepBook({ mount: 'every_player', step: 'ride' }))).not.toEqual([]);
  });

  it('rejects an unknown trigger', () => {
    expect(
      errors({ format: 1, rules: [{ do: [], key: 'r', when: { trigger: 'block_sneezed' } }] }),
    ).toContain('/rules/0/when/trigger schema.invalid-enum');
  });

  it('checks options per trigger', () => {
    const book = (when: Json): Json => ({ format: 1, rules: [{ do: [], key: 'r', when }] });
    expect(
      errors(
        book({
          options: { hand: 'either', interval_seconds: 2 },
          subject: 'mymod:wand',
          trigger: 'item_held',
        }),
      ),
    ).toEqual([]);
    expect(
      errors(
        book({ options: { cooldown_seconds: 1 }, subject: 'mymod:wand', trigger: 'item_used' }),
      ),
    ).toEqual([]);
    expect(
      errors(book({ options: { chance: 0.1 }, subject: 'mymod:b', trigger: 'block_random_tick' })),
    ).toEqual([]);
    expect(
      errors(book({ options: { message_contains: 'hello' }, trigger: 'player_chatted' })),
    ).toEqual([]);
    expect(errors(book({ options: { interval_seconds: 5 }, trigger: 'world_every' }))).toEqual([]);
    expect(
      errors(
        book({ options: { interval_seconds: 0.05 }, subject: 'mymod:e', trigger: 'effect_every' }),
      ),
    ).toEqual([]);
    // Options a trigger does not have, and out-of-range values.
    expect(
      errors(book({ options: { hand: 'main' }, subject: 'mymod:wand', trigger: 'item_used' })),
    ).toContain('/rules/0/when/options/hand schema.unknown-field');
    expect(
      errors(book({ options: { chance: 2 }, subject: 'mymod:b', trigger: 'block_random_tick' })),
    ).toContain('/rules/0/when/options/chance schema.out-of-range');
    expect(errors(book({ options: { interval_seconds: 0.1 }, trigger: 'player_every' }))).toContain(
      '/rules/0/when/options/interval_seconds schema.out-of-range',
    );
    expect(errors(book({ options: { cooldown_seconds: 1 }, trigger: 'player_joined' }))).toContain(
      '/rules/0/when/options schema.unknown-field',
    );
  });

  it('collects subject references with their registries', () => {
    const refs = (when: Json) =>
      collectReferences({ format: 1, rules: [{ do: [], key: 'r', when }] }, schema).map(
        (r) => `${r.path} ${r.registry} ${r.id}`,
      );
    expect(refs({ subject: 'mymod:ruby_block', trigger: 'block_used' })).toEqual([
      '/rules/0/when/subject block mymod:ruby_block',
    ]);
    expect(refs({ subject: 'mymod:wand', trigger: 'item_held' })).toEqual([
      '/rules/0/when/subject item mymod:wand',
    ]);
    expect(refs({ subject: 'minecraft:zombie', trigger: 'any_mob_died' })).toEqual([
      '/rules/0/when/subject entity_type minecraft:zombie',
    ]);
    expect(refs({ subject: 'mymod:glow', trigger: 'effect_started' })).toEqual([
      '/rules/0/when/subject mob_effect mymod:glow',
    ]);
  });
});

describe('rule book steps (ADR 0082 D5)', () => {
  it('lists every step id', () => {
    const kinds = (path: string): string[] => {
      const node = index.resolve(path);
      return node.kind === 'enum' ? node.values.map((v) => String(v.value)) : [];
    };
    const all = [
      ...kinds('::msm::rules::PlainStepKind'),
      ...kinds('::msm::rules::LogicStepKind'),
    ].sort();
    expect(all).toEqual(Object.keys(STEPS).sort());
    expect(kinds('::msm::rules::StepKind').sort()).toEqual(all);
    expect(kinds('::msm::rules::LogicStepKind').sort()).toEqual([
      'for_each_player',
      'if',
      'repeat',
    ]);
  });

  it.each(Object.entries(STEPS))('accepts a valid %s step', (_id, step) => {
    expect(check(bookWith([step]))).toEqual([]);
  });

  it('rejects an unknown step id', () => {
    expect(errors(bookWith([{ step: 'dance' }]))).toContain(
      '/rules/0/do/0/step schema.invalid-enum',
    );
  });

  it('rejects unknown fields and missing required fields of a step', () => {
    expect(errors(bookWith([{ item: 'mymod:ruby', step: 'give_item', colour: 'red' }]))).toContain(
      '/rules/0/do/0/colour schema.unknown-field',
    );
    expect(errors(bookWith([{ step: 'give_item' }]))).toContain(
      '/rules/0/do/0/item schema.missing-field',
    );
    // A leaf step does not take a logic step's fields.
    expect(errors(bookWith([{ item: 'mymod:ruby', step: 'give_item', else: [] }]))).toContain(
      '/rules/0/do/0/else schema.unknown-field',
    );
  });

  it('checks the caps of repeat, for each player, wait and steps per list', () => {
    expect(errors(bookWith([{ do: [], step: 'repeat', times: 100 }]))).toEqual([]);
    expect(errors(bookWith([{ do: [], step: 'repeat', times: 101 }]))).toContain(
      '/rules/0/do/0/times schema.out-of-range',
    );
    expect(errors(bookWith([{ do: [], step: 'repeat', times: 0 }]))).toContain(
      '/rules/0/do/0/times schema.out-of-range',
    );
    expect(errors(bookWith([{ do: [], radius: 65, step: 'for_each_player' }]))).toContain(
      '/rules/0/do/0/radius schema.out-of-range',
    );
    expect(errors(bookWith([{ seconds: 0.01, step: 'wait' }]))).toContain(
      '/rules/0/do/0/seconds schema.out-of-range',
    );
    expect(errors(bookWith([{ seconds: 3601, step: 'wait' }]))).toContain(
      '/rules/0/do/0/seconds schema.out-of-range',
    );
    const many = Array.from({ length: 51 }, () => ({ seconds: 1, step: 'wait' }));
    expect(errors(bookWith(many))).toContain('/rules/0/do schema.invalid-length');
  });

  it('accepts three levels of nesting with every logic step at levels 1 and 2', () => {
    const outers = ['if', 'repeat', 'for_each_player'] as const;
    for (const a of outers) {
      for (const b of outers) {
        const book = bookWith([nest(a, nest(b, { item: 'mymod:ruby', step: 'give_item' }))]);
        expect(errors(book), `${a} > ${b}`).toEqual([]);
      }
    }
  });

  it('rejects a step nested four deep', () => {
    const outers = ['if', 'repeat', 'for_each_player'] as const;
    for (const c of outers) {
      const deep = nest('if', nest('repeat', nest(c, { item: 'mymod:ruby', step: 'give_item' })));
      // Level 1 `if`, level 2 `repeat`, level 3 `c`, whose step would be at level 4.
      expect(errors(bookWith([deep])), c).toContain(
        '/rules/0/do/0/do/0/do/0/step schema.invalid-enum',
      );
    }
  });

  it('checks the steps inside else and inside nested lists', () => {
    expect(
      errors(
        bookWith([
          {
            conditions: [{ condition: 'is_day' }],
            else: [{ step: 'dance' }],
            match: 'all',
            step: 'if',
            do: [],
          },
        ]),
      ),
    ).toContain('/rules/0/do/0/else/0/step schema.invalid-enum');
    expect(errors(bookWith([nest('repeat', nest('repeat', { step: 'give_item' }))]))).toContain(
      '/rules/0/do/0/do/0/do/0/item schema.missing-field',
    );
  });

  it('checks places and who', () => {
    const step = (where: Json): Json => ({ block: 'minecraft:stone', step: 'place_block', where });
    for (const where of ['here', 'above_here', 'in_front_of_here', 'player', 'mob']) {
      expect(errors(bookWith([step(where)]))).toEqual([]);
    }
    expect(errors(bookWith([step({ place: 'player_looking' })]))).toEqual([]);
    expect(errors(bookWith([step('sky')]))).toContain('/rules/0/do/0/where schema.no-union-match');
    expect(errors(bookWith([step({ offset: [1, 2], place: 'offset' })])).length).toBeGreaterThan(0);
    expect(
      errors(bookWith([step({ distance: 65, place: 'player_looking' })])).length,
    ).toBeGreaterThan(0);
    const who = (value: Json): Json => ({ amount: 1, step: 'heal', who: value });
    for (const value of ['player', 'mob', 'other', 'every_player']) {
      expect(errors(bookWith([who(value)]))).toEqual([]);
    }
    expect(errors(bookWith([who({ radius: 65, who: 'players_nearby' })])).length).toBeGreaterThan(
      0,
    );
    expect(errors(bookWith([who('everyone')])).length).toBeGreaterThan(0);
  });

  it('collects picked ids inside steps', () => {
    const refs = collectReferences(
      bookWith([
        nest('repeat', { item: 'mymod:ruby', step: 'give_item' }),
        { mob: 'minecraft:zombie', step: 'spawn_mob' },
        { effect: 'minecraft:speed', seconds: 1, step: 'give_effect' },
        { sound: 'minecraft:block.bell.use', step: 'play_sound' },
        { function: 'mymod:go', step: 'run_function' },
      ]),
      schema,
    ).map((r) => `${r.path} ${r.registry}`);
    expect(refs).toEqual(
      expect.arrayContaining([
        '/rules/0/do/0/do/0/item item',
        '/rules/0/do/1/mob entity_type',
        '/rules/0/do/2/effect mob_effect',
        '/rules/0/do/3/sound sound_event',
        '/rules/0/do/4/function function',
      ]),
    );
  });
});

describe('rule book conditions (ADR 0082 D5)', () => {
  it('lists every condition id', () => {
    const node = index.resolve('::msm::rules::ConditionKind');
    expect(node.kind === 'enum' ? node.values.map((v) => v.value).sort() : []).toEqual(
      Object.keys(CONDITIONS).sort(),
    );
  });

  it.each(Object.entries(CONDITIONS))('accepts a valid %s condition', (_id, condition) => {
    expect(check(bookWith([], { only_if: { conditions: [condition], match: 'any' } }))).toEqual([]);
  });

  it('rejects an unknown condition, a bad match and a bad not', () => {
    const only = (conditions: Json[], match: Json = 'all'): string[] =>
      errors(bookWith([], { only_if: { conditions, match } }));
    expect(only([{ condition: 'is_purple' }])).toContain(
      '/rules/0/only_if/conditions/0/condition schema.invalid-enum',
    );
    expect(only([], 'some')).toContain('/rules/0/only_if/match schema.invalid-enum');
    expect(only([{ condition: 'is_day', not: 'yes' }])).toContain(
      '/rules/0/only_if/conditions/0/not schema.type-mismatch',
    );
    expect(only([{ condition: 'chance', percent: 150 }])).toContain(
      '/rules/0/only_if/conditions/0/percent schema.out-of-range',
    );
    expect(only([{ compare: 'about', condition: 'player_health', number: 1 }])).toContain(
      '/rules/0/only_if/conditions/0/compare schema.invalid-enum',
    );
    expect(only([{ condition: 'is_day', item: 'minecraft:stone' }])).toContain(
      '/rules/0/only_if/conditions/0/item schema.unknown-field',
    );
  });
});

describe('rule book values (ADR 0082 D2, D5)', () => {
  it('lists every value id', () => {
    const node = index.resolve('::msm::rules::ValueKind');
    expect(node.kind === 'enum' ? node.values.map((v) => v.value).sort() : []).toEqual(
      Object.keys(VALUES).sort(),
    );
  });

  it.each(Object.entries(VALUES))('accepts %s in a number slot and a text slot', (_id, value) => {
    expect(check(bookWith([{ amount: value, step: 'heal' }]))).toEqual([]);
    expect(check(bookWith([{ step: 'show_message', text: ['Value: ', value] }]))).toEqual([]);
  });

  it('allows math one level deep only', () => {
    const math = (a: Json): Json => ({ a, b: 1, op: '-', value: 'math' });
    expect(errors(bookWith([{ amount: math(2), step: 'heal' }]))).toEqual([]);
    expect(errors(bookWith([{ amount: math(math(2)), step: 'heal' }]))).toContain(
      '/rules/0/do/0/amount/a/value schema.invalid-enum',
    );
  });

  it('rejects an unknown value, a bad operator and a text slot that is not a list', () => {
    expect(
      errors(bookWith([{ amount: { value: 'moon_phase' }, step: 'heal' }])).length,
    ).toBeGreaterThan(0);
    expect(
      errors(bookWith([{ amount: { a: 1, b: 2, op: '^', value: 'math' }, step: 'heal' }])).length,
    ).toBeGreaterThan(0);
    expect(errors(bookWith([{ step: 'show_message', text: 'hi' }]))).toContain(
      '/rules/0/do/0/text schema.type-mismatch',
    );
  });
});
