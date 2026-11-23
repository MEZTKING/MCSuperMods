/**
 * Element kinds contributed by `@msm/plugin-games` (ADR 0113 D2 to D7): `msm:world_setup`,
 * `msm:one_block`, `msm:team`, `msm:objective`, `msm:timer` and `msm:area`, each with its schema
 * in `@msm/schemas`' `games.mcdoc` (B549). The kinds are editor-only: they lower to plain data
 * pack files (B551 and B552 fill the lowering; until then each kind lowers to nothing).
 */
import type { ElementKind, Json } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerArea } from '../lowering/area';
import { lowerObjective } from '../lowering/objective';
import { lowerOneBlock } from '../lowering/one-block';
import { lowerTeam } from '../lowering/team';
import { lowerTimer } from '../lowering/timer';

/** The kind ids this plugin contributes, in order. */
export const GAMES_KIND_IDS = [
  'msm:world_setup',
  'msm:one_block',
  'msm:team',
  'msm:objective',
  'msm:timer',
  'msm:area',
] as const;

/** A kind id of this plugin. */
export type GamesKindId = (typeof GAMES_KIND_IDS)[number];

/** Lowering until B551 and B552: no files yet. */
const lowerNothing = (): [] => [];

/**
 * A void world in survival on normal, the game rules left as they are (ADR 0113 D2, ADR 0114
 * D1). No start structure: the flows and the Studio add one.
 */
const WORLD_SETUP_DEFAULT: Json = {
  world: { type: 'void', nether: 'vanilla', end: 'vanilla' },
  spawn_radius: 0,
  game_mode: 'survival',
  difficulty: 'normal',
  game_rules: {},
};

/** One block at the origin with one looping phase of grass, dirt and logs (ADR 0113 D3). */
const ONE_BLOCK_DEFAULT: Json = {
  at: [0, 64, 0],
  phases: [
    {
      name: 'Plains',
      breaks: 100,
      blocks: [
        { block: 'minecraft:grass_block', weight: 4 },
        { block: 'minecraft:dirt', weight: 4 },
        { block: 'minecraft:oak_log', weight: 2 },
      ],
      mob_chance: 0,
      chest_chance: 0,
    },
  ],
  loop: true,
  announce: true,
};

/** A white team with vanilla's own option defaults (ADR 0113 D4). */
const TEAM_DEFAULT: Json = {
  name: 'My team',
  colour: 'white',
  friendly_fire: true,
  see_invisible_friends: true,
  name_tags: 'always',
  collision: 'always',
};

/** A dummy objective shown on the sidebar (ADR 0113 D5). */
const OBJECTIVE_DEFAULT: Json = {
  criterion: 'dummy',
  name: 'Score',
  display: 'sidebar',
  render: 'integer',
};

/** A five-minute countdown on a white boss bar, started by a step (ADR 0113 D6). */
const TIMER_DEFAULT: Json = {
  seconds: 300,
  count: 'down',
  show: 'boss_bar',
  colour: 'white',
  repeat: false,
  starts: 'manual',
};

/** A 16-block cube at the origin of the Overworld (ADR 0113 D7). */
const AREA_DEFAULT: Json = {
  name: 'My area',
  dimension: 'minecraft:overworld',
  from: [0, 64, 0],
  to: [15, 79, 15],
};

/** A games kind: no registry of its own beyond its id, lowered by the games plugin. */
const gamesKind = (id: GamesKindId, schema: string, folder: string, defaultData: Json) =>
  ({ id, schema, folder, defaultData, lower: lowerNothing }) satisfies ElementKind;

/** How the game's world starts: at most one per project (ADR 0113 D2). */
export const worldSetupKind: ElementKind = gamesKind(
  'msm:world_setup',
  MSM_SCHEMA_REFS.worldSetup,
  'world_setup',
  WORLD_SETUP_DEFAULT,
);
/** A one-block position and its phases (ADR 0113 D3). */
export const oneBlockKind: ElementKind = {
  ...gamesKind('msm:one_block', MSM_SCHEMA_REFS.oneBlock, 'one_block', ONE_BLOCK_DEFAULT),
  lower: lowerOneBlock,
};
/** A team (ADR 0113 D4). */
export const teamKind: ElementKind = {
  ...gamesKind('msm:team', MSM_SCHEMA_REFS.team, 'team', TEAM_DEFAULT),
  lower: lowerTeam,
};
/** A scoreboard objective (ADR 0113 D5). */
export const objectiveKind: ElementKind = {
  ...gamesKind('msm:objective', MSM_SCHEMA_REFS.objective, 'objective', OBJECTIVE_DEFAULT),
  lower: lowerObjective,
};
/** A timer in whole seconds (ADR 0113 D6). */
export const timerKind: ElementKind = {
  ...gamesKind('msm:timer', MSM_SCHEMA_REFS.timer, 'timer', TIMER_DEFAULT),
  lower: lowerTimer,
};
/** A box that knows when players walk in or out (ADR 0113 D7). */
export const areaKind: ElementKind = {
  ...gamesKind('msm:area', MSM_SCHEMA_REFS.area, 'area', AREA_DEFAULT),
  lower: lowerArea,
};

/** Every kind this plugin contributes, in the order of {@link GAMES_KIND_IDS}. */
export const gamesKinds: readonly ElementKind[] = Object.freeze([
  worldSetupKind,
  oneBlockKind,
  teamKind,
  objectiveKind,
  timerKind,
  areaKind,
]);
