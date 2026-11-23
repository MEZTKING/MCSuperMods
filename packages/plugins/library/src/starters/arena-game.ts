/**
 * The Arena game Creator flow (ADR 0117 D2, ADR 0113 D4 to D7; B557): teams fighting rounds in an
 * arena, with points on the sidebar, a round timer on the boss bar and the arena rebuilt after
 * each round. All of it is plain data pack files, so it works in a vanilla data pack.
 *
 * It makes two to four `msm:team`s (red, blue, green, yellow, team mates cannot hurt each other),
 * a `msm:objective` of player kills on the sidebar, a `msm:timer` of the round counting down on a
 * red boss bar whose end runs the round's end function, the arena (a
 * `minecraft:structure_template` box of a floor and low walls drawn here from vanilla blocks,
 * floating high above the spawn so the land does not matter), a `msm:area` round it that rebuilds
 * it, and two functions: `start` (splits the players into teams at random, clears the points,
 * builds the arena afresh, sends everyone in with the kit and starts the timer; run it with
 * `/function`) and `round_end` (names the players with the points to win, and rebuilds the arena
 * at once if chosen). The functions call the games kinds' own functions by their generated names (B552).
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  StarterParameter,
} from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  stringValue,
} from '../content/parameters';
import { BoxBuilder, type Pos } from '../content/structures';
import { GAME_KINDS } from './skyblock';

/** The teams, in the order they are added. */
export const ARENA_TEAMS: readonly { path: string; name: string; colour: string }[] = Object.freeze(
  [
    { path: 'red', name: 'Red', colour: 'red' },
    { path: 'blue', name: 'Blue', colour: 'blue' },
    { path: 'green', name: 'Green', colour: 'green' },
    { path: 'yellow', name: 'Yellow', colour: 'yellow' },
  ],
);

/** The arena sizes: the side of its square floor. */
const SIZES: Readonly<Record<string, { side: number; label: string }>> = {
  small: { side: 16, label: 'Small (16 by 16)' },
  medium: { side: 24, label: 'Medium (24 by 24)' },
  large: { side: 32, label: 'Large (32 by 32)' },
};

/** The floors. */
const FLOORS: readonly { value: string; label: string; wall: string }[] = [
  { value: 'minecraft:stone_bricks', label: 'Stone bricks', wall: 'minecraft:mossy_stone_bricks' },
  { value: 'minecraft:smooth_sandstone', label: 'Sandstone', wall: 'minecraft:cut_sandstone' },
  { value: 'minecraft:polished_deepslate', label: 'Deepslate', wall: 'minecraft:deepslate_tiles' },
  { value: 'minecraft:quartz_block', label: 'Quartz', wall: 'minecraft:quartz_pillar[axis=y]' },
];

/** The kits: what each player gets at the start of a round. */
const KITS: readonly { value: string; label: string; items: readonly [string, number][] }[] = [
  {
    value: 'sword',
    label: 'A sword and a shield',
    items: [
      ['minecraft:iron_sword', 1],
      ['minecraft:shield', 1],
      ['minecraft:bread', 8],
    ],
  },
  {
    value: 'bow',
    label: 'A bow and arrows',
    items: [
      ['minecraft:bow', 1],
      ['minecraft:arrow', 32],
      ['minecraft:stone_sword', 1],
      ['minecraft:bread', 8],
    ],
  },
  {
    value: 'snowballs',
    label: 'Snowballs',
    items: [['minecraft:snowball', 64]],
  },
  { value: 'none', label: 'Nothing', items: [] },
];

/** The height of the arena box: the floor and three blocks of air and walls above it. */
const ARENA_HEIGHT = 5;
/** The arena floor's height. */
const ARENA_Y = 100;
/** How many times the start function picks one player for each team. */
const TEAM_ROUNDS = 8;

/** The Arena game flow's questions, groups "Game", "Arena" and "Rounds". */
export const ARENA_GAME_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'game_name',
    label: 'What is your game called?',
    description: 'Ids derive from it: Arena gives arena.',
    group: 'Game',
    type: 'string',
    default: 'Arena',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'teams',
    label: 'Teams',
    description: 'Red and blue, then green and yellow.',
    group: 'Game',
    type: 'choice',
    default: '2',
    choices: [
      { value: '2', label: 'Two teams' },
      { value: '3', label: 'Three teams' },
      { value: '4', label: 'Four teams' },
    ],
  },
  {
    id: 'size',
    label: 'The arena',
    group: 'Arena',
    type: 'choice',
    default: 'medium',
    choices: Object.entries(SIZES).map(([value, { label }]) => ({ value, label })),
  },
  {
    id: 'floor',
    label: 'What it is made of',
    group: 'Arena',
    type: 'choice',
    default: 'minecraft:stone_bricks',
    choices: FLOORS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'rebuild',
    label: 'Rebuild as soon as a round ends',
    description: 'The arena is always built afresh when a round starts.',
    group: 'Arena',
    type: 'boolean',
    default: true,
  },
  {
    id: 'minutes',
    label: 'Round length in minutes',
    group: 'Rounds',
    type: 'number',
    default: 5,
    min: 1,
    max: 30,
    step: 1,
  },
  {
    id: 'win_score',
    label: 'Score to win',
    description: 'Players with at least this many defeats when the time is up win the round.',
    group: 'Rounds',
    type: 'number',
    default: 5,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    id: 'kit',
    label: 'What new players get',
    group: 'Rounds',
    type: 'choice',
    default: 'sword',
    choices: KITS.map(({ value, label }) => ({ value, label })),
  },
]);

/** The arena box: a floor, walls three high round it, air above the floor (cleared each round). */
function arenaTemplate(side: number, floor: string, wall: string) {
  const builder = new BoxBuilder([side, ARENA_HEIGHT, side]);
  builder.fill([0, 0, 0], [side - 1, 0, side - 1], floor);
  for (let y = 1; y < ARENA_HEIGHT; y += 1) {
    for (let x = 0; x < side; x += 1) {
      for (let z = 0; z < side; z += 1) {
        const edge = x === 0 || z === 0 || x === side - 1 || z === side - 1;
        builder.set([x, y, z], edge && y <= 3 ? wall : 'minecraft:air');
      }
    }
  }
  for (const [x, z] of [
    [0, 0],
    [side - 1, 0],
    [0, side - 1],
    [side - 1, side - 1],
  ] as const) {
    builder.set([x, 4, z], 'minecraft:lantern[hanging=false,waterlogged=false]');
  }
  return builder.build();
}

/** `/` as `.`, as the games kinds name teams and objectives (`<ns>.<path>`). */
const dotted = (namespace: string, path: string): string =>
  `${namespace}.${path.replace(/\//g, '.')}`;

export function arenaGameBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(ARENA_GAME_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'game_name'));
  const id = name.id;
  const teamCount = Math.max(2, Math.min(4, Number(stringValue(values, 'teams')) || 2));
  const teams = ARENA_TEAMS.slice(0, teamCount);
  const side = (SIZES[stringValue(values, 'size')] ?? (SIZES.medium as { side: number })).side;
  const floor =
    FLOORS.find((entry) => entry.value === stringValue(values, 'floor')) ??
    (FLOORS[0] as (typeof FLOORS)[number]);
  const rebuild = booleanValue(values, 'rebuild');
  const minutes = Math.max(1, Math.min(30, Math.round(numberValue(values, 'minutes'))));
  const winScore = Math.max(1, Math.min(100, Math.round(numberValue(values, 'win_score'))));
  const kit =
    KITS.find((entry) => entry.value === stringValue(values, 'kit')) ??
    (KITS[0] as (typeof KITS)[number]);

  const corner: Pos = [-Math.floor(side / 2), ARENA_Y, -Math.floor(side / 2)];
  const far: Pos = [corner[0] + side - 1, ARENA_Y + ARENA_HEIGHT - 1, corner[2] + side - 1];
  const centre: Pos = [
    corner[0] + Math.floor(side / 2),
    ARENA_Y + 1,
    corner[2] + Math.floor(side / 2),
  ];
  const template = rl(namespace, `${id}/arena_build`);
  const area = rl(namespace, `${id}/arena`);
  const points = rl(namespace, `${id}/points`);
  const timer = rl(namespace, `${id}/round`);
  const start = rl(namespace, `${id}/start`);
  const roundEnd = rl(namespace, `${id}/round_end`);
  const objective = dotted(namespace, `${id}/points`);
  const areaPath = `${id}/arena`;
  const timerPath = `${id}/round`;
  const gamesFunction = (path: string): string => `${namespace}:msm_games/${path}`;

  const startLines = [
    `# Starts a round of ${name.display}: run with /function ${start}`,
    'team leave @a',
  ];
  for (let round = 0; round < TEAM_ROUNDS; round += 1) {
    for (const team of teams) {
      startLines.push(`team join ${dotted(namespace, `${id}/${team.path}`)} @r[team=]`);
    }
  }
  startLines.push(`scoreboard players set @a ${objective} 0`);
  startLines.push(`function ${gamesFunction(`area/${areaPath}/reset`)}`);
  startLines.push(`tp @a ${centre.join(' ')}`, 'clear @a');
  for (const [item, count] of kit.items) startLines.push(`give @a ${item} ${count}`);
  startLines.push(
    `function ${gamesFunction(`timer/${timerPath}/start`)}`,
    'title @a title {"text":"Fight!","color":"gold"}',
  );

  const endLines = [
    `# Runs when the round of ${name.display} ends (the timer's on_end)`,
    'title @a title {"text":"Round over","color":"gold"}',
    `execute as @a[scores={${objective}=${winScore}..}] run tellraw @a [{"selector":"@s"},{"text":" wins the round!","color":"gold"}]`,
  ];
  if (rebuild) endLines.push(`function ${gamesFunction(`area/${areaPath}/reset`)}`);

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.display}, an arena game`),
    ...teams.map((team) =>
      element(
        rl(namespace, `${id}/${team.path}`),
        GAME_KINDS.team,
        {
          name: team.name,
          colour: team.colour,
          friendly_fire: false,
          see_invisible_friends: true,
          name_tags: 'always',
          collision: 'pushOtherTeams',
          prefix: `[${team.name}] `,
        },
        `The ${team.name.toLowerCase()} team: ${team.colour} names with a [${team.name}] tag, team mates cannot hurt each other. It is made when the world loads, and the start function puts players on it.`,
      ),
    ),
    element(
      points,
      GAME_KINDS.objective,
      { criterion: 'playerKillCount', name: 'Defeats', display: 'sidebar', render: 'integer' },
      `The points: how many players each player has defeated, counted by the game (playerKillCount) and shown on the sidebar. The start function sets them to 0; at the end of a round, players with ${winScore} or more win.`,
    ),
    element(
      timer,
      GAME_KINDS.timer,
      {
        name: 'Round',
        seconds: minutes * 60,
        count: 'down',
        show: 'boss_bar',
        colour: 'red',
        on_end: roundEnd,
        repeat: false,
        starts: 'manual',
      },
      `The round: ${minutes} minute${minutes === 1 ? '' : 's'} counting down on a red boss bar. The start function starts it; when the time is up it runs ${roundEnd}.`,
    ),
    element(
      template,
      KINDS.structureTemplate,
      arenaTemplate(side, floor.value, floor.wall),
      `The arena: a ${side} by ${side} floor of ${floor.label.toLowerCase()} with walls three blocks high and a lantern on each corner, and air above the floor, so placing it again clears what players built. Drawn from vanilla blocks named by id.`,
    ),
    element(
      area,
      GAME_KINDS.area,
      {
        name: name.display,
        dimension: 'minecraft:overworld',
        from: [...corner],
        to: [...far],
        reset: { structures: [{ structure: template, at: [...corner] }] },
      },
      `The arena's area, floating at height ${ARENA_Y} above the spawn so the land does not matter. Resetting it removes the mobs and items in it and places ${template} again: the start function does that, and so does the end of a round if chosen. It also knows when players walk in or out.`,
    ),
    element(
      start,
      KINDS.function,
      { lines: startLines },
      `Starts a round: takes everyone off their team and puts them on the ${teams.map((team) => team.name.toLowerCase()).join(', ')} teams in turn at random, sets the points to 0, builds the arena afresh, sends everyone to its middle with ${kit.label.toLowerCase()} and starts the round timer. Run it with /function ${start}.`,
    ),
    element(
      roundEnd,
      KINDS.function,
      { lines: endLines },
      `Ends a round, run by the timer when the time is up: names the players with ${winScore} or more defeats${rebuild ? ' and rebuilds the arena' : ''}. Run ${start} again for the next round.`,
    ),
  ];
  return { elements, assets: [] };
}
