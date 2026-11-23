import { readdirSync, readFileSync } from 'node:fs';
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  MSM_TYPE_PATHS,
  parseVanillaMcdocSymbols,
  type SchemaIndex,
  type SchemaNode,
  type VanillaMcdocSymbols,
  validateJson,
} from '../src/index';

/**
 * The games kinds' format (ADR 0113 D2 to D7, `mcdoc/msm/games.mcdoc`, B549) and the vanilla
 * overlay (`mcdoc/msm/vanilla_overlay.mcdoc`: the `dimension_origin` structure placement B547
 * measured). The games kinds are editor-only (the games plugin lowers them to data pack files),
 * so their cases live here rather than in the conformance corpus the runtime shares.
 */
const index = createSchemaIndex({ ref: 'empty', mcdoc: {}, dispatchers: {} }, { mcVersion: '1.0' });

const errorsOf = (value: Json, node: SchemaNode): string[] =>
  validateJson(value, node)
    .filter((p) => p.severity === 'error')
    .map((p) => `${p.path} ${p.code}`);

const GAMES_REFS = {
  'msm:world_setup': MSM_SCHEMA_REFS.worldSetup,
  'msm:one_block': MSM_SCHEMA_REFS.oneBlock,
  'msm:team': MSM_SCHEMA_REFS.team,
  'msm:objective': MSM_SCHEMA_REFS.objective,
  'msm:timer': MSM_SCHEMA_REFS.timer,
  'msm:area': MSM_SCHEMA_REFS.area,
  'msm:game': MSM_SCHEMA_REFS.game,
  'msm:kit': MSM_SCHEMA_REFS.kit,
} as const;

type GamesKind = keyof typeof GAMES_REFS;

const errors = (kind: GamesKind, value: Json): string[] =>
  errorsOf(value, index.resolveSchemaRef(GAMES_REFS[kind]));

/** The smallest valid data of each kind. */
const MINIMAL: Record<GamesKind, Json> = {
  'msm:world_setup': {
    world: { type: 'void', nether: 'vanilla', end: 'vanilla' },
    game_mode: 'survival',
    difficulty: 'normal',
    game_rules: {},
  },
  'msm:one_block': {
    at: [0, 64, 0],
    phases: [
      {
        name: 'Plains',
        breaks: 100,
        blocks: [{ block: 'minecraft:dirt', weight: 1 }],
        mob_chance: 0,
        chest_chance: 0,
      },
    ],
    loop: true,
    announce: true,
  },
  'msm:team': {
    name: 'Red',
    colour: 'red',
    friendly_fire: true,
    see_invisible_friends: true,
    name_tags: 'always',
    collision: 'always',
  },
  'msm:objective': {
    criterion: 'dummy',
    name: 'Score',
    display: 'none',
    render: 'integer',
  },
  'msm:timer': {
    seconds: 60,
    count: 'down',
    show: 'boss_bar',
    colour: 'white',
    repeat: false,
    starts: 'manual',
  },
  'msm:area': {
    name: 'Arena',
    dimension: 'minecraft:overworld',
    from: [0, 64, 0],
    to: [15, 79, 15],
  },
  'msm:game': {
    type: 'custom',
    name: 'My game',
    players: { min: 1, max: 16 },
    round: { kind: 'endless', start: 'world_start', countdown: 0, win: [], after: 'stay' },
    mechanics: [],
  },
  'msm:kit': { name: 'Starter', items: [], clear_first: false },
};

/** Every optional field of each kind filled in. */
const FULL: Record<GamesKind, Json> = {
  'msm:world_setup': {
    world: {
      type: 'flat',
      layers: [
        { block: 'minecraft:bedrock', height: 1 },
        { block: 'minecraft:grass_block', height: 1 },
      ],
      biome: 'mygame:sky',
      nether: 'void',
      end: 'void',
    },
    start: { structure: 'mygame:island', at: [0, 64, 0], spawn: [2, 3, 2], when: 'first_join' },
    spawn_radius: 0,
    game_mode: 'adventure',
    difficulty: 'hard',
    game_rules: { 'minecraft:keep_inventory': true, respawn_radius: 0, 'mygame:lives': 3 },
    new_player: {
      items: [
        { item: 'minecraft:lava_bucket', count: 1 },
        { item: 'minecraft:ice', count: 2, slot: 'hotbar.1' },
      ],
      message: 'Welcome to the sky!',
      dialog: 'mygame:welcome',
      effects: [
        { effect: 'minecraft:slow_falling', seconds: 30, amplifier: 0, hide_particles: true },
      ],
    },
    goals: 'mygame:goals/root',
  },
  'msm:one_block': {
    at: [0, 64, 0],
    dimension: 'minecraft:overworld',
    phases: [
      {
        name: 'Plains',
        breaks: 100,
        blocks: [
          { block: 'minecraft:dirt', weight: 5 },
          { block: 'minecraft:oak_log', weight: 2 },
        ],
        mobs: [{ mob: 'minecraft:cow', weight: 1 }],
        mob_chance: 0.05,
        chest_chance: 0.02,
        chest_loot: 'mygame:chests/plains',
      },
    ],
    loop: false,
    announce: false,
  },
  'msm:team': {
    name: 'Blue',
    colour: 'blue',
    friendly_fire: false,
    see_invisible_friends: true,
    name_tags: 'hideForOtherTeams',
    collision: 'pushOwnTeam',
    prefix: '[B] ',
    suffix: ' *',
  },
  'msm:objective': {
    criterion: 'minecraft.mined:minecraft.stone',
    name: 'Stone mined',
    display: 'sidebar.team.red',
    render: 'hearts',
    number_format: { type: 'styled', colour: 'yellow', bold: true },
  },
  'msm:timer': {
    name: 'Time left',
    seconds: 86_400,
    count: 'up',
    show: 'action_bar',
    colour: 'red',
    on_end: 'mygame:time_up',
    repeat: true,
    starts: 'world_start',
  },
  'msm:area': {
    name: 'Arena',
    dimension: 'minecraft:the_nether',
    from: [0, 64, 0],
    to: [47, 111, 47],
    reset: { structures: [{ structure: 'mygame:arena', at: [0, 64, 0] }] },
  },
  'msm:game': {
    type: 'bed_wars',
    name: 'Island beds',
    dimension: 'minecraft:overworld',
    players: { min: 4, max: 16 },
    round: {
      kind: 'rounds',
      start: 'enough_players',
      countdown: 10,
      length: 1800,
      play_area: 'mygame:islands',
      win: [
        { type: 'last_standing', by: 'teams' },
        { type: 'role_dies', role: 'runner', winner: 'hunter' },
        { type: 'advancement', advancement: 'minecraft:end/kill_dragon', role: 'runner' },
        { type: 'score_target', objective: 'mygame:captures', target: 3, by: 'teams' },
        {
          type: 'timer_ends',
          timer: 'mygame:round',
          winner: 'top_score',
          objective: 'mygame:kills',
        },
      ],
      after: 'lobby',
    },
    lobby: {
      spawn: [0, 100, 0],
      area: 'mygame:lobby',
      building: { structure: 'mygame:lobby', at: [-8, 99, -8] },
      teams: 'auto',
    },
    roles: [
      { id: 'runner', name: 'Runner', count: 1, team: 'mygame:runners', kit: 'mygame:runner' },
      { id: 'hunter', name: 'Hunter', count: 'rest', team: 'mygame:hunters' },
    ],
    mechanics: [
      {
        type: 'hearts',
        start: 10,
        most: 20,
        per_kill: 1,
        other_deaths: 'lose_heart',
        at_zero: 'kept_out',
        kept_out_seconds: 3600,
        start_again_hearts: 3,
        heart_item: {
          item: 'minecraft:red_dye',
          name: 'Heart',
          model: 'minecraft:heart_of_the_sea',
          recipe: {
            pattern: ['DND', 'NTN', 'DND'],
            key: {
              D: 'minecraft:diamond_block',
              N: 'minecraft:netherite_scrap',
              T: 'minecraft:totem_of_undying',
            },
          },
        },
        withdraw: true,
        revive: { item: { item: 'minecraft:beacon', name: 'Revive beacon' }, hearts: 3 },
      },
      {
        type: 'tracker',
        holder: 'hunter',
        target: 'runner',
        every_seconds: 1,
        other_dimension: 'last_place',
        name: 'Tracker',
      },
      { type: 'head_start', held: 'hunter', seconds: 30, blind: true },
      { type: 'elimination', lives: 1, out: 'spectate', announce: true },
      { type: 'fall_out', below_y: 40, action: 'die' },
      {
        type: 'floor',
        area: 'mygame:floor',
        block: 'minecraft:snow_block',
        tool: 'minecraft:diamond_shovel',
        drops: false,
        structure: 'mygame:floor',
      },
      {
        type: 'team_base',
        bases: [{ team: 'mygame:red', bed: [20, 64, 0], spawn: [22, 64, 0] }],
        respawn_seconds: 5,
      },
      {
        type: 'generators',
        generators: [
          {
            at: [20, 64, 4],
            item: 'minecraft:iron_ingot',
            every_seconds: 1,
            cap: 16,
            team: 'mygame:red',
          },
        ],
      },
      {
        type: 'shop',
        shops: [
          {
            name: 'Item shop',
            at: [18, 64, 4],
            way: 'trader',
            team: 'mygame:red',
            offers: [
              {
                cost: { item: 'minecraft:iron_ingot', count: 4 },
                cost_b: { item: 'minecraft:gold_ingot', count: 1 },
                gives: {
                  item: 'minecraft:iron_sword',
                  count: 1,
                  components: { 'minecraft:custom_name': 'Team sword' },
                },
              },
            ],
          },
        ],
      },
      {
        type: 'border',
        size: 5000,
        centre: [0, 0],
        shrink: { to: 50, seconds: 600, after_seconds: 300 },
      },
      { type: 'kit_on', start: 'mygame:start', respawn: 'mygame:respawn' },
    ],
  },
  'msm:kit': {
    name: 'Fighter',
    items: [
      {
        item: 'minecraft:iron_sword',
        count: 1,
        slot: 'hotbar.0',
        components: { 'minecraft:unbreakable': {} },
      },
      { item: 'minecraft:cooked_beef', count: 16 },
    ],
    armour: {
      head: { item: 'minecraft:iron_helmet' },
      chest: { item: 'minecraft:iron_chestplate' },
      legs: { item: 'minecraft:iron_leggings' },
      feet: { item: 'minecraft:iron_boots', count: 1 },
    },
    off_hand: { item: 'minecraft:shield' },
    effects: [{ effect: 'minecraft:speed', seconds: 60, amplifier: 1, hide_particles: true }],
    clear_first: true,
  },
};

const KINDS = Object.keys(GAMES_REFS) as GamesKind[];

describe('games kinds format (ADR 0113 D2 to D7)', () => {
  it('resolves each schema reference to its games struct', () => {
    for (const kind of KINDS) {
      expect(GAMES_REFS[kind]).toBe(kind);
      expect(index.resolveSchemaRef(GAMES_REFS[kind]).kind).toBe('struct');
    }
    expect(index.resolveSchemaRef(MSM_SCHEMA_REFS.worldSetup)).toBe(
      index.resolve(MSM_TYPE_PATHS.worldSetup),
    );
  });

  it.each(KINDS)('%s accepts its smallest data', (kind) => {
    expect(errors(kind, MINIMAL[kind])).toEqual([]);
  });

  it.each(KINDS)('%s accepts every optional field', (kind) => {
    expect(errors(kind, FULL[kind])).toEqual([]);
  });

  it.each(KINDS)('%s refuses an unknown field', (kind) => {
    expect(errors(kind, { ...(MINIMAL[kind] as object), colour_of_sky: 1 })).toEqual([
      '/colour_of_sky schema.unknown-field',
    ]);
  });

  it('world_setup: refuses a missing world, an unknown world type and bad start positions', () => {
    const base = MINIMAL['msm:world_setup'] as Record<string, Json>;
    const { world: _world, ...noWorld } = base;
    expect(errors('msm:world_setup', noWorld)).toEqual(['/world schema.missing-field']);
    expect(
      errors('msm:world_setup', {
        ...base,
        world: { type: 'moon', nether: 'vanilla', end: 'void' },
      }),
    ).toEqual(['/world/type schema.invalid-enum']);
    expect(
      errors('msm:world_setup', { ...base, start: { structure: 'mygame:island', spawn: [0, 1] } }),
    ).toEqual(['/start/spawn schema.invalid-length']);
    expect(
      errors('msm:world_setup', {
        ...base,
        start: { structure: 'mygame:island', spawn: [0, 1, 0], when: 'later' },
      }),
    ).toEqual(['/start/when schema.invalid-enum']);
  });

  it('world_setup: refuses a negative spawn radius, a game rule text value and an empty kit count', () => {
    const base = MINIMAL['msm:world_setup'] as Record<string, Json>;
    expect(errors('msm:world_setup', { ...base, spawn_radius: -1 })).toEqual([
      '/spawn_radius schema.out-of-range',
    ]);
    expect(errors('msm:world_setup', { ...base, game_rules: { keep_inventory: 'yes' } })).toEqual([
      '/game_rules/keep_inventory schema.no-union-match',
    ]);
    expect(
      errors('msm:world_setup', {
        ...base,
        new_player: { items: [{ item: 'minecraft:dirt', count: 0 }] },
      }),
    ).toEqual(['/new_player/items/0/count schema.out-of-range']);
    expect(errors('msm:world_setup', { ...base, game_mode: 'hardcore' })).toEqual([
      '/game_mode schema.invalid-enum',
    ]);
  });

  it('one_block: refuses no phases, a zero weight and a chance above 1', () => {
    const base = MINIMAL['msm:one_block'] as Record<string, Json>;
    const phase = (base.phases as Json[])[0] as Record<string, Json>;
    expect(errors('msm:one_block', { ...base, phases: [] })).toEqual([
      '/phases schema.invalid-length',
    ]);
    expect(
      errors('msm:one_block', {
        ...base,
        phases: [{ ...phase, blocks: [{ block: 'minecraft:dirt', weight: 0 }] }],
      }),
    ).toEqual(['/phases/0/blocks/0/weight schema.out-of-range']);
    expect(errors('msm:one_block', { ...base, phases: [{ ...phase, mob_chance: 1.5 }] })).toEqual([
      '/phases/0/mob_chance schema.out-of-range',
    ]);
    expect(errors('msm:one_block', { ...base, phases: [{ ...phase, breaks: 0 }] })).toEqual([
      '/phases/0/breaks schema.out-of-range',
    ]);
  });

  it('team: refuses an unknown colour and a camel-case option it does not know', () => {
    const base = MINIMAL['msm:team'] as Record<string, Json>;
    expect(errors('msm:team', { ...base, colour: 'pink' })).toEqual([
      '/colour schema.invalid-enum',
    ]);
    expect(errors('msm:team', { ...base, name_tags: 'hide_for_other_teams' })).toEqual([
      '/name_tags schema.invalid-enum',
    ]);
    expect(errors('msm:team', { ...base, friendly_fire: 'no' })).toEqual([
      '/friendly_fire schema.type-mismatch',
    ]);
  });

  it('objective: refuses an unknown display slot and a fixed number format without its text', () => {
    const base = MINIMAL['msm:objective'] as Record<string, Json>;
    expect(errors('msm:objective', { ...base, display: 'sidebar.team.pink' })).toEqual([
      '/display schema.invalid-enum',
    ]);
    expect(errors('msm:objective', { ...base, number_format: { type: 'fixed' } })).toEqual([
      '/number_format/text schema.missing-field',
    ]);
    expect(errors('msm:objective', { ...base, number_format: { type: 'blank' } })).toEqual([]);
    expect(
      errors('msm:objective', { ...base, number_format: { type: 'fixed', text: '-' } }),
    ).toEqual([]);
    expect(errors('msm:objective', { ...base, criterion: '' })).toEqual([
      '/criterion schema.invalid-length',
    ]);
  });

  it('timer: takes 1 to 86,400 whole seconds', () => {
    const base = MINIMAL['msm:timer'] as Record<string, Json>;
    expect(errors('msm:timer', { ...base, seconds: 1 })).toEqual([]);
    expect(errors('msm:timer', { ...base, seconds: 0 })).toEqual(['/seconds schema.out-of-range']);
    expect(errors('msm:timer', { ...base, seconds: 86_401 })).toEqual([
      '/seconds schema.out-of-range',
    ]);
    expect(errors('msm:timer', { ...base, seconds: 1.5 })).toEqual(['/seconds schema.not-integer']);
    expect(errors('msm:timer', { ...base, colour: 'black' })).toEqual([
      '/colour schema.invalid-enum',
    ]);
  });

  it('area: refuses a missing corner and a reset with no structures', () => {
    const base = MINIMAL['msm:area'] as Record<string, Json>;
    const { to: _to, ...noTo } = base;
    expect(errors('msm:area', noTo)).toEqual(['/to schema.missing-field']);
    expect(errors('msm:area', { ...base, reset: { structures: [] } })).toEqual([
      '/reset/structures schema.invalid-length',
    ]);
    expect(errors('msm:area', { ...base, from: [0, 64.5, 0] })).toEqual([
      '/from/1 schema.not-integer',
    ]);
  });
});

/**
 * The cases of `msm:game` and `msm:kit` (ADR 0132 D1 to D3, B722): a valid and an invalid case
 * for each mechanic and each kind of win, played inside the smallest game. The field names are
 * the contract of the lowering (B724 to B726) and the Game Studio (B732).
 */
const gameWith = (extra: Record<string, Json>): Json => ({
  ...(MINIMAL['msm:game'] as Record<string, Json>),
  ...extra,
});

interface Case {
  readonly valid: Json;
  readonly invalid: Json;
  readonly error: string;
}

const MECHANIC_CASES: Record<string, Case> = {
  hearts: {
    valid: {
      type: 'hearts',
      start: 10,
      most: 20,
      per_kill: 1,
      at_zero: 'spectate',
      withdraw: false,
    },
    invalid: {
      type: 'hearts',
      start: 0,
      most: 20,
      per_kill: 1,
      at_zero: 'spectate',
      withdraw: false,
    },
    error: '/mechanics/0/start schema.out-of-range',
  },
  tracker: {
    valid: {
      type: 'tracker',
      holder: 'hunter',
      target: 'runner',
      every_seconds: 1,
      other_dimension: 'spin',
    },
    invalid: {
      type: 'tracker',
      holder: 'hunter',
      target: 'runner',
      every_seconds: 1,
      other_dimension: 'portal',
    },
    error: '/mechanics/0/other_dimension schema.invalid-enum',
  },
  head_start: {
    valid: { type: 'head_start', held: 'hunter', seconds: 30, blind: false },
    invalid: { type: 'head_start', held: 'hunter', seconds: 601, blind: false },
    error: '/mechanics/0/seconds schema.out-of-range',
  },
  elimination: {
    valid: { type: 'elimination', lives: 3, out: 'lobby', announce: false },
    invalid: { type: 'elimination', lives: 3, out: 'lobby' },
    error: '/mechanics/0/announce schema.missing-field',
  },
  fall_out: {
    valid: { type: 'fall_out', below_y: -20, action: 'out' },
    invalid: { type: 'fall_out', below_y: -20, action: 'sink' },
    error: '/mechanics/0/action schema.invalid-enum',
  },
  floor: {
    valid: {
      type: 'floor',
      area: 'mygame:floor',
      block: 'minecraft:snow_block',
      tool: 'minecraft:diamond_shovel',
      drops: false,
    },
    invalid: {
      type: 'floor',
      block: 'minecraft:snow_block',
      tool: 'minecraft:diamond_shovel',
      drops: false,
    },
    error: '/mechanics/0/area schema.missing-field',
  },
  team_base: {
    valid: {
      type: 'team_base',
      bases: [{ team: 'mygame:blue', bed: [0, 64, 0], spawn: [2, 64, 0] }],
      respawn_seconds: 0,
    },
    invalid: { type: 'team_base', bases: [], respawn_seconds: 0 },
    error: '/mechanics/0/bases schema.invalid-length',
  },
  generators: {
    valid: {
      type: 'generators',
      generators: [{ at: [0, 64, 0], item: 'minecraft:emerald', every_seconds: 30, cap: 4 }],
    },
    invalid: {
      type: 'generators',
      generators: [{ at: [0, 64, 0], item: 'minecraft:emerald', every_seconds: 30, cap: 65 }],
    },
    error: '/mechanics/0/generators/0/cap schema.out-of-range',
  },
  shop: {
    valid: {
      type: 'shop',
      shops: [
        {
          name: 'Shop',
          at: [0, 64, 0],
          way: 'menu',
          offers: [
            {
              cost: { item: 'minecraft:gold_ingot', count: 2 },
              gives: { item: 'minecraft:white_wool', count: 16 },
            },
          ],
        },
      ],
    },
    invalid: {
      type: 'shop',
      shops: [{ name: 'Shop', at: [0, 64, 0], way: 'menu', offers: [] }],
    },
    error: '/mechanics/0/shops/0/offers schema.invalid-length',
  },
  border: {
    valid: { type: 'border', size: 200 },
    invalid: { type: 'border', size: 200, centre: [0, 64, 0] },
    error: '/mechanics/0/centre schema.invalid-length',
  },
  kit_on: {
    valid: { type: 'kit_on', start: 'mygame:fighter' },
    invalid: { type: 'kit_on', start: '' },
    error: '/mechanics/0/start schema.invalid-length',
  },
};

const WIN_CASES: Record<string, Case> = {
  last_standing: {
    valid: { type: 'last_standing', by: 'players' },
    invalid: { type: 'last_standing', by: 'everyone' },
    error: '/round/win/0/by schema.invalid-enum',
  },
  role_dies: {
    valid: { type: 'role_dies', role: 'runner', winner: 'hunter' },
    invalid: { type: 'role_dies', role: 'runner' },
    error: '/round/win/0/winner schema.missing-field',
  },
  advancement: {
    valid: { type: 'advancement', advancement: 'minecraft:end/kill_dragon' },
    invalid: { type: 'advancement' },
    error: '/round/win/0/advancement schema.missing-field',
  },
  score_target: {
    valid: { type: 'score_target', objective: 'mygame:points', target: 10, by: 'teams' },
    invalid: { type: 'score_target', objective: 'mygame:points', target: 0, by: 'teams' },
    error: '/round/win/0/target schema.out-of-range',
  },
  timer_ends: {
    valid: { type: 'timer_ends', winner: 'still_in' },
    invalid: { type: 'timer_ends', winner: 'whoever' },
    error: '/round/win/0/winner schema.invalid-enum',
  },
};

describe('game and kit format (ADR 0132 D1 to D3)', () => {
  const round = (MINIMAL['msm:game'] as Record<string, Json>).round as Record<string, Json>;
  const roundWith = (extra: Record<string, Json>): Json =>
    gameWith({ round: { ...round, ...extra } });

  it('has a case for every mechanic and every kind of win the schema knows', () => {
    const enumValues = (path: string): string[] => {
      const node = index.resolve(path);
      return node.kind === 'enum' ? node.values.map((v) => String(v.value)).sort() : [];
    };
    expect(Object.keys(MECHANIC_CASES).sort()).toEqual(enumValues('::msm::games::MechanicType'));
    expect(Object.keys(WIN_CASES).sort()).toEqual(enumValues('::msm::games::WinType'));
  });

  it.each(Object.entries(MECHANIC_CASES))('mechanic %s: a valid and an invalid case', (_, c) => {
    expect(errors('msm:game', gameWith({ mechanics: [c.valid] }))).toEqual([]);
    expect(errors('msm:game', gameWith({ mechanics: [c.invalid] }))).toEqual([c.error]);
  });

  it.each(Object.entries(WIN_CASES))('win %s: a valid and an invalid case', (_, c) => {
    expect(errors('msm:game', roundWith({ win: [c.valid] }))).toEqual([]);
    expect(errors('msm:game', roundWith({ win: [c.invalid] }))).toEqual([c.error]);
  });

  it('refuses an unknown mechanic, game type and round start', () => {
    expect(errors('msm:game', gameWith({ mechanics: [{ type: 'jetpacks' }] }))).toEqual([
      '/mechanics/0/type schema.invalid-enum',
      '/mechanics/0/type schema.unknown-dispatch-key',
    ]);
    expect(errors('msm:game', gameWith({ type: 'tag' }))).toEqual(['/type schema.invalid-enum']);
    expect(errors('msm:game', roundWith({ start: 'whenever' }))).toEqual([
      '/round/start schema.invalid-enum',
    ]);
    expect(errors('msm:game', roundWith({ countdown: 601 }))).toEqual([
      '/round/countdown schema.out-of-range',
    ]);
  });

  it('takes a role count as a number or rest', () => {
    const role = { id: 'seeker', name: 'Seeker', count: 2 };
    expect(errors('msm:game', gameWith({ roles: [role] }))).toEqual([]);
    expect(errors('msm:game', gameWith({ roles: [{ ...role, count: 'rest' }] }))).toEqual([]);
    expect(errors('msm:game', gameWith({ roles: [{ ...role, count: 'all' }] }))).toEqual([
      '/roles/0/count schema.no-union-match',
    ]);
    expect(errors('msm:game', gameWith({ roles: [{ ...role, count: 0 }] }))).toEqual([
      '/roles/0/count schema.out-of-range',
    ]);
  });

  it('refuses a lobby without its spawn and a player count above 100', () => {
    expect(errors('msm:game', gameWith({ lobby: { teams: 'none' } }))).toEqual([
      '/lobby/spawn schema.missing-field',
    ]);
    expect(errors('msm:game', gameWith({ players: { min: 1, max: 101 } }))).toEqual([
      '/players/max schema.out-of-range',
    ]);
  });

  it('kit: refuses a stack of none, an unknown armour slot and a missing clear_first', () => {
    const base = MINIMAL['msm:kit'] as Record<string, Json>;
    expect(errors('msm:kit', { ...base, items: [{ item: 'minecraft:stone', count: 0 }] })).toEqual([
      '/items/0/count schema.out-of-range',
    ]);
    expect(
      errors('msm:kit', { ...base, armour: { body: { item: 'minecraft:diamond_horse_armor' } } }),
    ).toEqual(['/armour/body schema.unknown-field']);
    const { clear_first: _clear, ...noClear } = base;
    expect(errors('msm:kit', noClear)).toEqual(['/clear_first schema.missing-field']);
  });
});

describe('vanilla overlay (synthetic export)', () => {
  const symbolsWith = (members: Record<string, unknown>): VanillaMcdocSymbols =>
    ({
      ref: 'x',
      mcdoc: {
        '::java::Vanilla': {
          kind: 'struct',
          fields: [{ kind: 'pair', key: 'salt', type: { kind: 'int' } }],
        },
      },
      dispatchers: { 'minecraft:structure_placement': members },
    }) as unknown as VanillaMcdocSymbols;

  it('adds dimension_origin to a vanilla dispatcher that lacks it', () => {
    const synthetic = createSchemaIndex(
      symbolsWith({ random_spread: { kind: 'reference', path: '::java::Vanilla' } }),
      { mcVersion: '1.0' },
    );
    expect(synthetic.dispatcherKeys('minecraft:structure_placement')).toEqual([
      'dimension_origin',
      'random_spread',
    ]);
    const member = synthetic.dispatch('minecraft:structure_placement', 'dimension_origin');
    expect(member?.kind).toBe('struct');
    expect(member?.kind === 'struct' ? member.fields : undefined).toEqual([]);
  });

  it('lets the vanilla export win when it has the member itself', () => {
    const synthetic = createSchemaIndex(
      symbolsWith({ dimension_origin: { kind: 'reference', path: '::java::Vanilla' } }),
      { mcVersion: '1.0' },
    );
    expect(synthetic.dispatch('minecraft:structure_placement', 'dimension_origin')).toBe(
      synthetic.resolve('::java::Vanilla'),
    );
  });
});

/**
 * The vendored exports of every built-in target (`packages/targets/mc-<version>/`), read by
 * path: this package cannot depend on `@msm/targets`.
 */
const TARGETS_DIR = new URL('../../targets/', import.meta.url);
const TARGETS: (readonly [string, string])[] = readdirSync(TARGETS_DIR)
  .filter((name) => name.startsWith('mc-'))
  .sort()
  .map((name) => [name.slice('mc-'.length), `${name}/vendor/vanilla-mcdoc/symbols.json`] as const);

const indexFor = (mcVersion: string, path: string): SchemaIndex =>
  createSchemaIndex(
    parseVanillaMcdocSymbols(JSON.parse(readFileSync(new URL(path, TARGETS_DIR), 'utf8'))),
    { mcVersion },
  );

/** Every `unsupported` node reachable from `root` (as the targets' coverage test walks). */
function unsupportedUnder(root: SchemaNode): string[] {
  const seen = new Set<SchemaNode>();
  const found: string[] = [];
  const stack: SchemaNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as SchemaNode;
    if (seen.has(node)) continue;
    seen.add(node);
    switch (node.kind) {
      case 'unsupported':
        found.push(`${node.rawKind}: ${node.reason}`);
        break;
      case 'struct':
        for (const field of node.fields) {
          stack.push(field.type);
          if (field.keyType) stack.push(field.keyType);
        }
        stack.push(...node.spreads);
        break;
      case 'list':
        stack.push(node.item);
        break;
      case 'tuple':
        stack.push(...node.items);
        break;
      case 'union':
        stack.push(...node.members);
        break;
      case 'reference':
        stack.push(node.resolve());
        break;
      case 'dispatcher':
        for (const key of node.keys()) {
          const member = node.dispatch(key);
          if (member) stack.push(member);
        }
        break;
      default:
        break;
    }
  }
  return found;
}

it('finds the built-in targets', () => {
  expect(TARGETS.length).toBeGreaterThanOrEqual(2);
});

describe.each(TARGETS)('vanilla overlay and games kinds on %s', (mcVersion, path) => {
  const target = indexFor(mcVersion, path);
  const structureSet = target.resolveSchemaRef('resource:worldgen/structure_set');
  const errorsHere = (value: Json, node: SchemaNode) =>
    validateJson(value, node)
      .filter((p) => p.severity === 'error')
      .map((p) => `${p.path} ${p.code}`);

  it('lists dimension_origin beside the vendored placements', () => {
    expect(target.dispatcherKeys('minecraft:structure_placement')).toEqual(
      expect.arrayContaining(['concentric_rings', 'dimension_origin', 'random_spread']),
    );
    const member = target.dispatch('minecraft:structure_placement', 'dimension_origin');
    expect(member?.kind === 'struct' ? member.fields : undefined).toEqual([]);
  });

  it('validates a structure set placed once at the origin (B547, Y1)', () => {
    const set: Json = {
      structures: [{ structure: 'mygame:start', weight: 1 }],
      placement: { type: 'minecraft:dimension_origin' },
    };
    expect(errorsHere(set, structureSet)).toEqual([]);
    // The game ignores these keys; the form says they do nothing.
    expect(
      errorsHere(
        { ...(set as object), placement: { type: 'minecraft:dimension_origin', salt: 1 } },
        structureSet,
      ),
    ).toEqual(['/placement/salt schema.unknown-field']);
  });

  it('reaches no unsupported node from a structure set', () => {
    expect(unsupportedUnder(structureSet)).toEqual([]);
  });

  it("checks a kit's item components against the target's own", () => {
    const kit = target.resolveSchemaRef(MSM_SCHEMA_REFS.kit);
    const stack = { item: 'minecraft:stone', count: 1 };
    expect(
      errorsHere(
        {
          name: 'K',
          clear_first: false,
          items: [{ ...stack, components: { 'minecraft:max_stack_size': 16 } }],
        },
        kit,
      ),
    ).toEqual([]);
    expect(
      errorsHere(
        {
          name: 'K',
          clear_first: false,
          items: [{ ...stack, components: { 'minecraft:max_stack_size': 'lots' } }],
        },
        kit,
      ).length,
    ).toBeGreaterThan(0);
  });

  it.each(KINDS)('%s reaches no unsupported node and accepts its full data', (kind) => {
    const node = target.resolveSchemaRef(GAMES_REFS[kind]);
    expect(unsupportedUnder(node)).toEqual([]);
    expect(errorsHere(FULL[kind], node)).toEqual([]);
  });
});
