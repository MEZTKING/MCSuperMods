/**
 * Hand-written games for the tests of the mechanics `elimination`, `fall_out`, `floor`,
 * `team_base`, `generators`, `shop`, `border` and `kit_on` (B726): a floor game (Spleef-like), a
 * floor in two `fill` parts with a fall that puts players back, a patterned floor placed from a
 * building, a four-team bed game with twelve generators, traders and menus (the K19 cost case),
 * and team bases with no wait. Each mechanic appears with its optional fields and without.
 *
 * A floor's box reaches the lowering through `floorAreaPatches` (the plugin's project expander
 * once registered), so the tests lower {@link expandedSamples}.
 */
import type { Element, Json, JsonObject } from '@msm/plugin-api';
import { floorAreaPatches } from '../../../src/lowering/game/mechanics/floor';
import { type GameSample, sampleElement } from '../samples';

const game = (
  name: string,
  data: Record<string, Json>,
  mechanics: readonly JsonObject[],
): GameSample => ({
  name,
  kind: 'msm:game',
  id: `demo:${name}`,
  data: {
    type: 'custom',
    name: name.replace(/^./, (c) => c.toUpperCase()),
    players: { min: 2, max: 16 },
    round: {
      kind: 'rounds',
      start: 'command',
      countdown: 0,
      length: 600,
      win: [{ type: 'last_standing', by: 'players' }],
      after: 'stay',
    },
    mechanics: [...mechanics],
    ...data,
  },
});

const TEAMS = ['red', 'blue', 'green', 'yellow'] as const;

/** Four islands round the middle, a bed and a spawn each. */
const BASES = TEAMS.map((team, j) => {
  const x = j % 2 === 0 ? 40 : -40;
  const z = j < 2 ? 40 : -40;
  return { team: `demo:${team}`, bed: [x, 64, z], spawn: [x, 65, z + 3] };
});

/** Twelve generators: iron and gold at each island, two diamonds and an emerald in the middle. */
const GENERATORS: JsonObject[] = [
  ...BASES.flatMap((base, j) => {
    const [x, y, z] = base.bed as [number, number, number];
    return [
      {
        at: [x + 3, y, z],
        item: 'minecraft:iron_ingot',
        every_seconds: 1,
        cap: 48,
        team: `demo:${TEAMS[j]}`,
      },
      {
        at: [x - 3, y, z],
        item: 'minecraft:gold_ingot',
        every_seconds: 6,
        cap: 16,
        team: `demo:${TEAMS[j]}`,
      },
    ];
  }),
  { at: [10, 70, 0], item: 'minecraft:diamond', every_seconds: 30, cap: 4 },
  { at: [-10, 70, 0], item: 'minecraft:diamond', every_seconds: 30, cap: 4 },
  { at: [0, 72, 0], item: 'minecraft:emerald', every_seconds: 60, cap: 2 },
  { at: [0, 72, 4], item: 'minecraft:emerald', every_seconds: 60, cap: 2 },
];

const SWORD: JsonObject = {
  item: 'minecraft:stone_sword',
  count: 1,
  components: {
    'minecraft:custom_name': { text: 'Team sword', italic: false },
    'minecraft:unbreakable': {},
  },
};

/** The games, one per mechanic setting worth pinning. */
export const B726_SAMPLES: readonly GameSample[] = [
  game('spleef', { type: 'spleef', lobby: { spawn: [0, 80, 0], teams: 'none' } }, [
    {
      type: 'floor',
      area: 'demo:snow_floor',
      block: 'minecraft:snow_block',
      tool: 'minecraft:diamond_shovel',
      drops: false,
    },
    { type: 'fall_out', below_y: 60, action: 'out' },
    { type: 'kit_on', start: 'demo:captain_kit' },
    {
      type: 'border',
      size: 64,
      centre: [16, 16],
      shrink: { to: 16, seconds: 120, after_seconds: 60 },
    },
  ]),
  game('layers', {}, [
    {
      type: 'floor',
      area: 'demo:big_floor',
      block: 'minecraft:snow_block',
      tool: 'minecraft:netherite_shovel',
      drops: true,
    },
    { type: 'fall_out', below_y: 0, action: 'back' },
  ]),
  game('pattern', { dimension: 'minecraft:the_nether' }, [
    {
      type: 'floor',
      area: 'demo:nether_floor',
      block: 'minecraft:packed_ice',
      tool: 'minecraft:diamond_pickaxe',
      drops: false,
      structure: 'demo:floor_pattern',
    },
    { type: 'fall_out', below_y: 30, action: 'die' },
  ]),
  game(
    'beds',
    {
      type: 'bed_wars',
      players: { min: 4, max: 16 },
      round: {
        kind: 'rounds',
        start: 'command',
        countdown: 0,
        win: [{ type: 'last_standing', by: 'teams' }],
        after: 'lobby',
      },
      lobby: { spawn: [0, 120, 0], teams: 'auto' },
    },
    [
      { type: 'team_base', bases: BASES, respawn_seconds: 5 },
      { type: 'generators', generators: GENERATORS },
      {
        type: 'shop',
        shops: [
          {
            name: 'Middle trader',
            at: [0, 65, 8],
            way: 'trader',
            offers: [
              { cost: { item: 'minecraft:iron_ingot', count: 4 }, gives: SWORD },
              {
                cost: { item: 'minecraft:gold_ingot', count: 2 },
                cost_b: { item: 'minecraft:iron_ingot', count: 1 },
                gives: { item: 'minecraft:white_wool', count: 16 },
              },
            ],
          },
          {
            name: 'Red shop',
            at: [43, 65, 43],
            way: 'menu',
            team: 'demo:red',
            offers: [
              { cost: { item: 'minecraft:iron_ingot', count: 4 }, gives: SWORD },
              {
                cost: { item: 'minecraft:gold_ingot', count: 3 },
                gives: { item: 'minecraft:shears', count: 1 },
              },
            ],
          },
          {
            name: 'Block shop',
            at: [0, 65, -8],
            way: 'menu',
            offers: [
              {
                cost: { item: 'minecraft:iron_ingot', count: 2 },
                cost_b: { item: 'minecraft:gold_ingot', count: 1 },
                gives: { item: 'minecraft:end_stone', count: 12 },
              },
            ],
          },
        ],
      },
      { type: 'border', size: 200 },
      { type: 'kit_on', start: 'demo:hunter_kit', respawn: 'demo:runner_kit' },
      { type: 'fall_out', below_y: 20, action: 'die' },
      { type: 'elimination', lives: 3, out: 'lobby', announce: true },
    ],
  ),
  game('bases', { lobby: { spawn: [0, 100, 0], teams: 'auto' } }, [
    {
      type: 'team_base',
      bases: [
        { team: 'demo:red', bed: [10, 64, 0], spawn: [10, 65, 2] },
        { team: 'demo:blue', bed: [-10, 64, 0], spawn: [-10, 65, 2] },
      ],
      respawn_seconds: 0,
    },
    { type: 'elimination', lives: 1, out: 'spectate', announce: false },
    { type: 'border', size: 300, shrink: { to: 50, seconds: 600 } },
    { type: 'kit_on', respawn: 'demo:hunter_kit' },
  ]),
];

/** The pieces the samples name besides the round engine's (`../samples.ts` `PIECES`). */
export const B726_PIECES: readonly GameSample[] = [
  { name: 'green', kind: 'msm:team', id: 'demo:green', data: { name: 'Green', colour: 'green' } },
  {
    name: 'yellow',
    kind: 'msm:team',
    id: 'demo:yellow',
    data: { name: 'Yellow', colour: 'yellow' },
  },
  {
    name: 'snow_floor',
    kind: 'msm:area',
    id: 'demo:snow_floor',
    data: {
      name: 'Snow floor',
      dimension: 'minecraft:overworld',
      from: [0, 64, 0],
      to: [31, 64, 31],
    },
  },
  {
    name: 'big_floor',
    kind: 'msm:area',
    id: 'demo:big_floor',
    data: {
      name: 'Big floor',
      dimension: 'minecraft:overworld',
      from: [-100, 10, -50],
      to: [99, 11, 49],
    },
  },
  {
    name: 'nether_floor',
    kind: 'msm:area',
    id: 'demo:nether_floor',
    data: {
      name: 'Nether floor',
      dimension: 'minecraft:the_nether',
      from: [0, 40, 0],
      to: [15, 40, 15],
    },
  },
];

/** The ids the samples use that no sample lowers. */
export const B726_EXTRA_IDS: Readonly<Record<string, readonly string[]>> = {
  structure: ['demo:floor_pattern'],
};

/** A copy of `element` with the patches of the floor expander applied. */
export function expanded(element: Element, elements: readonly Element[]): Element {
  const patches = floorAreaPatches(elements).filter((patch) => patch.elementId === element.id);
  if (patches.length === 0) return element;
  const data = structuredClone(element.data) as JsonObject;
  for (const patch of patches) {
    let at: Json = data;
    for (const step of patch.path.slice(0, -1))
      at = (at as Record<string, Json>)[step as never] as Json;
    (at as Record<string, Json>)[patch.path[patch.path.length - 1] as never] = patch.value;
  }
  return { ...element, data };
}

/** Every sample game as the lowering sees it: with its floor's box. */
export function expandedSamples(pieces: readonly GameSample[]): Element[] {
  const elements = [...B726_SAMPLES, ...pieces, ...B726_PIECES].map(sampleElement);
  return B726_SAMPLES.map((sample) => expanded(sampleElement(sample), elements));
}
