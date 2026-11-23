/**
 * The names every part of a game's lowering shares (ADR 0132 D1, D2; B724): the game's data
 * read once into a {@link GameModel}, its generated functions, hook tags, objectives, score
 * holders and entity tags. The round engine (`round.ts`, `lobby.ts`, `roles.ts`, `win/`) and the
 * mechanics (`mechanics/`, B725 and B726) take their names from here, so a name changes in one
 * place.
 *
 * A game `<ns>:<path>` writes under `<ns>:msm_games/game/<path>/`:
 *
 * - its state on the objective `<ns>.msm_game` (dummy): the holders `#<path>.state` (0 waiting,
 *   1 counting down, 2 playing, 3 ending), `#<path>.time` (seconds left of the countdown or the
 *   ending, seconds gone in a round), `#<path>.ticks`, `#<path>.round` (the round's number),
 *   `#<path>.made` (1 once the world has loaded the game) and the counts of the checks; each
 *   player's own score there is the number of the round they belong to (K15: a player whose
 *   number is not the round's joined in the middle);
 * - deaths on `<ns>.msm_deaths` (`deathCount`, K1), the deaths of this round on `<ns>.msm_died`
 *   (dummy), and, when players pick their team, the trigger `<ns>.msm_team` (K5);
 * - the entity tags `<ns>.game.<path>.<name>`: `player` (took part in this round), `in` (still
 *   in it), `out` (put out of it), `watching` (joined in the middle or over the most players),
 *   `winner`, `dead` (died, not yet respawned), `has_role`, `own_kit` (their role has a kit) and
 *   `role.<id>`;
 * - the hook tags of {@link GAME_HOOKS}, which Rules, stories and the mechanics fill.
 */
import type { Element, Json, JsonObject, ResourceLocation } from '@msm/plugin-api';
import {
  blockPos,
  dataOf,
  dotted,
  gamesFunctionId,
  holderOf,
  isRecord,
  num,
  splitId,
  str,
  teamName,
} from '../shared-functions';

/**
 * The hook tags of a game, `#<ns>:msm_games/game/<path>/<hook>`, in the order a round meets
 * them. Each is written empty with `merge: 'tag'`; a mechanic, a rule book or a story adds its
 * function by writing the same tag file. Hooks marked "as each player" run as that player
 * (`@s`); the others run as the server.
 *
 * - `lobby`: the game is waiting again (after a round, a stop or a countdown that stopped);
 * - `countdown`: the countdown before a round began;
 * - `starting`: a round is about to start, before players are dealt (rebuild a floor here);
 * - `player_in` (as each player): put into the round, after roles, teams and role kits; in an
 *   endless game also a player who joins later;
 * - `started`: the round started;
 * - `tick`: every tick while a round is played;
 * - `second`: every second while a round is played;
 * - `player_died` (as each player): a player in the round died;
 * - `player_respawned` (as each player): a player who died came back;
 * - `player_out` (as each player): put out of the round (by `out`); they watch as spectators
 *   unless a function of this hook sends them elsewhere;
 * - `player_back` (as each player): put back into the round (by `back`);
 * - `player_joined` (as each player): joined while a round was played (in an endless game they
 *   play, otherwise they watch);
 * - `won`: the round was won; the winners carry the `winner` tag;
 * - `ended`: the round ended, won or not;
 * - `stopped`: a round or countdown was stopped by `stop`.
 */
export const GAME_HOOKS = Object.freeze([
  'lobby',
  'countdown',
  'starting',
  'player_in',
  'started',
  'tick',
  'second',
  'player_died',
  'player_respawned',
  'player_out',
  'player_back',
  'player_joined',
  'won',
  'ended',
  'stopped',
] as const);

/** A hook of a game. */
export type GameHook = (typeof GAME_HOOKS)[number];

/** The states of a round, as `#<path>.state` holds them. */
export const GAME_STATES = Object.freeze({ waiting: 0, countdown: 1, playing: 2, ending: 3 });

/** How long a round's ending lasts before what comes after (the winners are shown). */
export const ENDING_SECONDS = 5;

/** The objective paths a game's generated objectives use: a project objective may not take them. */
export const GAME_RESERVED_OBJECTIVE_PATHS: readonly string[] = Object.freeze([
  'msm_game',
  'msm_deaths',
  'msm_died',
  'msm_team',
  // The mechanics' own (B725): hearts, the kept-out clock and the withdraw trigger.
  'msm_hearts',
  'msm_out_until',
  'msm_out_since',
  'msm_withdraw',
]);

/** The function of a kit `<ns>:<path>` that gives it to `@s`: `<ns>:msm_games/kit/<path>/give`. */
export function kitGiveFunction(kitId: string): ResourceLocation {
  const { namespace, path } = splitId(kitId);
  return gamesFunctionId(namespace, `kit/${path}/give`);
}

/** A timer's function, `<ns>:msm_games/timer/<path>/<name>`. */
export function timerFunction(timerId: string, name: string): ResourceLocation {
  const { namespace, path } = splitId(timerId);
  return gamesFunctionId(namespace, `timer/${path}/${name}`);
}

/** One role of a game. */
export interface GameRole {
  readonly id: string;
  readonly name: string;
  /** How many players get it, or `rest`. */
  readonly count: number | 'rest';
  /** An `msm:team` id. */
  readonly team?: string;
  /** An `msm:kit` id. */
  readonly kit?: string;
}

/** A game's lobby. */
export interface GameLobby {
  readonly spawn: readonly [number, number, number];
  /** An `msm:area` id. */
  readonly area?: string;
  readonly building?: {
    readonly structure: string;
    readonly at: readonly [number, number, number];
  };
  readonly teams: 'auto' | 'pick' | 'none';
}

/** A game's data, read once with its defaults. */
export interface GameModel {
  readonly id: string;
  readonly namespace: string;
  readonly path: string;
  readonly name: string;
  readonly dimension: string;
  readonly min: number;
  readonly max: number;
  readonly endless: boolean;
  readonly start: 'command' | 'enough_players' | 'world_start';
  readonly countdown: number;
  readonly length: number | undefined;
  readonly after: 'lobby' | 'stay' | 'next_round';
  readonly wins: readonly JsonObject[];
  readonly lobby: GameLobby | undefined;
  readonly roles: readonly GameRole[];
  readonly mechanics: readonly JsonObject[];
  /**
   * Every team the game names, in order and once each: the roles' teams, then the teams of the
   * mechanics (`team_base`'s bases, `generators`, `shop`). Last standing and score target by
   * teams count these.
   */
  readonly teams: readonly string[];
  /**
   * The teams the lobby splits players into evenly (or lets them pick): the mechanics' teams,
   * not the roles' (a role puts its players on its own team); none when the lobby's `teams` is
   * `none`. A game with no lobby splits as `auto`.
   */
  readonly splitTeams: readonly string[];
}

const ROLE_ID = /^[a-z0-9_]+$/;

const listOf = (value: Json | undefined): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const textOrUndefined = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const ELEMENT_ID = /^[a-z0-9_.-]+:[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

/**
 * A reference to a project element (a team, kit or area id), or `undefined` when it is absent or
 * not an id at all: the game's validator reports a broken one, and the lowering leaves it out.
 */
export const refOrUndefined = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && ELEMENT_ID.test(value) ? value : undefined;

/** The teams a game's mechanics name, in order. */
function mechanicTeams(mechanics: readonly JsonObject[]): string[] {
  const teams: string[] = [];
  for (const mechanic of mechanics) {
    const lists =
      mechanic.type === 'team_base'
        ? listOf(mechanic.bases)
        : mechanic.type === 'generators'
          ? listOf(mechanic.generators)
          : mechanic.type === 'shop'
            ? listOf(mechanic.shops)
            : [];
    for (const entry of lists) {
      const team = refOrUndefined(entry.team);
      if (team !== undefined) teams.push(team);
    }
  }
  return teams;
}

const unique = (list: readonly string[]): string[] => [...new Set(list)];

/** Whether a role id is lower case letters, digits and `_` (the names it makes need it). */
export const isRoleId = (id: string): boolean => ROLE_ID.test(id);

/** Reads a game element's data with its defaults (`GAME_DEFAULT` of `kinds/game.ts`). */
export function readGame(element: Element): GameModel {
  const { namespace, path } = splitId(element.id);
  const data = dataOf(element.data);
  const players = dataOf(data.players ?? null);
  const round = dataOf(data.round ?? null);
  const min = Math.max(1, Math.trunc(num(players.min, 2)));
  const max = Math.max(min, Math.trunc(num(players.max, 16)));
  const start = str(round.start, 'command');
  const after = str(round.after, 'stay');
  const lobbyData = isRecord(data.lobby) ? data.lobby : undefined;
  let lobby: GameLobby | undefined;
  if (lobbyData !== undefined) {
    const building = isRecord(lobbyData.building) ? lobbyData.building : undefined;
    const structure = textOrUndefined(building?.structure);
    const area = refOrUndefined(lobbyData.area);
    const teams = str(lobbyData.teams, 'auto');
    lobby = {
      spawn: blockPos(lobbyData.spawn),
      ...(area === undefined ? {} : { area }),
      ...(structure === undefined ? {} : { building: { structure, at: blockPos(building?.at) } }),
      teams: teams === 'pick' || teams === 'none' ? teams : 'auto',
    };
  }
  const roles: GameRole[] = [];
  const seen = new Set<string>();
  for (const role of listOf(data.roles)) {
    const id = str(role.id, '');
    // A role whose id would make a broken name, or a second role of the same id, is left out
    // (the game's validator reports both).
    if (!isRoleId(id) || seen.has(id)) continue;
    seen.add(id);
    const team = refOrUndefined(role.team);
    const kit = refOrUndefined(role.kit);
    roles.push({
      id,
      name: str(role.name, id),
      count: role.count === 'rest' ? 'rest' : Math.max(1, Math.trunc(num(role.count, 1))),
      ...(team === undefined ? {} : { team }),
      ...(kit === undefined ? {} : { kit }),
    });
  }
  const mechanics = listOf(data.mechanics);
  const roleTeams = roles.flatMap((role) => (role.team === undefined ? [] : [role.team]));
  const fromMechanics = unique(mechanicTeams(mechanics));
  const length = typeof round.length === 'number' ? Math.trunc(round.length) : undefined;
  return {
    id: element.id,
    namespace,
    path,
    name: str(data.name, 'Game'),
    dimension: str(data.dimension, 'minecraft:overworld'),
    min,
    max,
    endless: str(round.kind, 'rounds') === 'endless',
    start: start === 'enough_players' || start === 'world_start' ? start : 'command',
    countdown: Math.max(0, Math.trunc(num(round.countdown, 10))),
    length: length !== undefined && length > 0 ? length : undefined,
    after: after === 'lobby' || after === 'next_round' ? after : 'stay',
    wins: listOf(round.win),
    lobby,
    roles,
    mechanics,
    teams: unique([...roleTeams, ...fromMechanics]),
    splitTeams: lobby?.teams === 'none' ? [] : fromMechanics,
  };
}

/** The generated names of one game. */
export interface GameNames {
  /** The game's function `<ns>:msm_games/game/<path>/<name>`. */
  fn(name: string): ResourceLocation;
  /** The path below `msm_games/` of the game's function or hook `<name>`. */
  path(name: string): string;
  /** The objective of the game's state and each player's round: `<ns>.msm_game`. */
  readonly objective: string;
  /** The `deathCount` objective: `<ns>.msm_deaths`. */
  readonly deaths: string;
  /** The deaths in this round: `<ns>.msm_died`. */
  readonly died: string;
  /** The trigger players pick their team with: `<ns>.msm_team`. */
  readonly pick: string;
  /** A score holder of the game on {@link objective}: `#<path>.<name>`. */
  holder(name: string): string;
  /** An entity tag of the game: `<ns>.game.<path>.<name>`. */
  tag(name: string): string;
  /** The tag of a role's players. */
  roleTag(roleId: string): string;
  /** The plain team name of an `msm:team` id. */
  team(teamId: string): string;
}

/** The generated names of a game `<ns>:<path>`. */
export function gameNames(namespace: string, path: string): GameNames {
  const root = `game/${path}`;
  const tagRoot = `${namespace}.game.${dotted(path)}`;
  return {
    fn: (name) => gamesFunctionId(namespace, `${root}/${name}`),
    path: (name) => `${root}/${name}`,
    objective: `${namespace}.msm_game`,
    deaths: `${namespace}.msm_deaths`,
    died: `${namespace}.msm_died`,
    pick: `${namespace}.msm_team`,
    holder: (name) => holderOf(path, name),
    tag: (name) => `${tagRoot}.${name}`,
    roleTag: (roleId) => `${tagRoot}.role.${roleId}`,
    team: (teamId) => teamName(teamId),
  };
}
