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

  it.each(KINDS)('%s reaches no unsupported node and accepts its full data', (kind) => {
    const node = target.resolveSchemaRef(GAMES_REFS[kind]);
    expect(unsupportedUnder(node)).toEqual([]);
    expect(errorsHere(FULL[kind], node)).toEqual([]);
  });
});
