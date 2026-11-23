/**
 * `games.*` project validators of `msm:game` (ADR 0132 D1, D2, D6; B724). Pure; they read the
 * project's games, teams, kits, areas, timers and objectives. Each mechanic's own checks are in
 * `validators-mechanics/` (B725, B726), run here for every mechanic a game has; the checks of
 * the `hearts` mechanic B722 left to validators (withdraw needs the Heart item, the fields "at
 * zero" needs) are here. Codes:
 *
 * - `games.too-many-games` (error): a second game in the project; a mod has one (D6).
 * - `games.game.players` (error): a game whose fewest players are more than its most.
 * - `games.game.never-ends` (error): a game in rounds with no way to end: no win condition and
 *   no length.
 * - `games.game.role-id` (error): a role id that is not lower case letters, digits and `_`.
 * - `games.game.duplicate-role` (error): two roles with the same id.
 * - `games.game.rest-twice` (error): more than one role whose count is `rest`.
 * - `games.game.too-many-roles` (error when the roles need more players than the most, warning
 *   when more than the fewest): the roles' counts add up to more players than a round may have.
 * - `games.game.duplicate-mechanic` (error): a mechanic a game has twice.
 * - `games.game.unknown-mechanic` (error): a mechanic this plugin does not know; it does nothing.
 * - `games.game.unknown-reference` (error): a team, kit, area, timer or objective the project
 *   does not have.
 * - `games.game.unknown-role` (error): a win condition naming a role the game does not have.
 * - `games.game.time-up-winner` (error): a timer win whose winner needs a field it lacks (the
 *   highest score needs `objective`, a role needs `role`).
 * - `games.game.time-up-never` (warning): a timer win with no timer in a round with no length.
 * - `games.game.no-teams` (warning): a win by teams in a game that names no teams; it counts
 *   players.
 * - `games.game.no-lobby` (warning): a round that goes back to the lobby in a game with none; it
 *   stays where it is.
 * - `games.game.lobby-spawn-outside` (warning): a lobby spawn outside the lobby's area, so the
 *   lobby keeps putting its players back.
 * - `games.game.play-area-unused` (info): the round's play area: players are not spread over it
 *   yet (the target lists no `spreadplayers` form).
 * - `games.game.reserved-name` (error): a project objective whose path a game's generated
 *   objectives use.
 * - `games.game.withdraw-needs-heart` (error): hearts with withdraw but no Heart item.
 * - `games.game.at-zero-needs` (error): hearts kept out with no time, or started again with no
 *   number of hearts.
 */
import type { Element, Json, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { gameKind } from './kinds/game';
import { MECHANIC_TYPES, type MechanicType } from './lowering/game/mechanics/index';
import { GAME_RESERVED_OBJECTIVE_PATHS, isRoleId } from './lowering/game/names';
import { blockPos, dataOf, isRecord } from './lowering/shared-functions';
import { MECHANIC_CHECKS } from './validators-mechanics/index';

/** Every code the game validator reports itself (the mechanics' checks add their own). */
export const GAME_PROBLEM_CODES = Object.freeze([
  'games.too-many-games',
  'games.game.players',
  'games.game.never-ends',
  'games.game.role-id',
  'games.game.duplicate-role',
  'games.game.rest-twice',
  'games.game.too-many-roles',
  'games.game.duplicate-mechanic',
  'games.game.unknown-mechanic',
  'games.game.unknown-reference',
  'games.game.unknown-role',
  'games.game.time-up-winner',
  'games.game.time-up-never',
  'games.game.no-teams',
  'games.game.no-lobby',
  'games.game.lobby-spawn-outside',
  'games.game.play-area-unused',
  'games.game.reserved-name',
  'games.game.withdraw-needs-heart',
  'games.game.at-zero-needs',
] as const);

type GameCode = (typeof GAME_PROBLEM_CODES)[number];

const TEAM = 'msm:team';
const KIT = 'msm:kit';
const AREA = 'msm:area';
const TIMER = 'msm:timer';
const OBJECTIVE = 'msm:objective';

/** The element kinds a game names by id, with the word a message uses for each. */
const REFERENCE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  [TEAM]: 'team',
  [KIT]: 'kit',
  [AREA]: 'area',
  [TIMER]: 'timer',
  [OBJECTIVE]: 'objective',
});

const problem = (
  severity: Problem['severity'],
  code: GameCode,
  element: Element,
  path: string | undefined,
  message: string,
): Problem => ({
  severity,
  code,
  elementId: element.id,
  ...(path === undefined ? {} : { path }),
  message,
});

const listOf = (value: Json | undefined): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/** The mechanics of one game with their pointers. */
function mechanicsOf(game: Element): { mechanic: JsonObject; path: string }[] {
  const list = dataOf(game.data).mechanics;
  if (!Array.isArray(list)) return [];
  return list.flatMap((mechanic, index) =>
    isRecord(mechanic) ? [{ mechanic, path: `/mechanics/${index}` }] : [],
  );
}

/** The checks of one game against the project's elements. */
function checkGame(game: Element, elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  const report = (
    severity: Problem['severity'],
    code: GameCode,
    path: string | undefined,
    message: string,
  ): void => {
    problems.push(problem(severity, code, game, path, message));
  };
  const data = dataOf(game.data);
  const players = dataOf(data.players ?? null);
  const round = dataOf(data.round ?? null);
  const min = typeof players.min === 'number' ? players.min : undefined;
  const max = typeof players.max === 'number' ? players.max : undefined;
  if (min !== undefined && max !== undefined && min > max) {
    report(
      'error',
      'games.game.players',
      '/players',
      `The fewest players (${min}) is more than the most (${max}). Make the fewest no more than the most.`,
    );
  }

  const ids = new Map<string, Set<string>>();
  for (const kind of Object.keys(REFERENCE_WORDS)) {
    ids.set(kind, new Set(elements.filter((one) => one.kind === kind).map((one) => one.id)));
  }
  const reference = (value: Json | undefined, kind: string, path: string): void => {
    if (typeof value !== 'string' || ids.get(kind)?.has(value) === true) return;
    report(
      'error',
      'games.game.unknown-reference',
      path,
      `The ${REFERENCE_WORDS[kind]} ${JSON.stringify(value)} is not one of your project's ${REFERENCE_WORDS[kind]}s. Pick one, or make it first.`,
    );
  };

  // Roles.
  const roles = listOf(data.roles);
  const roleIds = new Set<string>();
  let rests = 0;
  let counted = 0;
  listOf(data.roles).forEach((role, i) => {
    const path = `/roles/${i}`;
    const id = typeof role.id === 'string' ? role.id : '';
    if (!isRoleId(id)) {
      report(
        'error',
        'games.game.role-id',
        `${path}/id`,
        `The role id ${JSON.stringify(id)} may have only lower case letters, digits and _.`,
      );
    } else if (roleIds.has(id)) {
      report(
        'error',
        'games.game.duplicate-role',
        `${path}/id`,
        `Two roles are called "${id}". Give each its own id.`,
      );
    }
    roleIds.add(id);
    if (role.count === 'rest') {
      rests += 1;
      if (rests === 2) {
        report(
          'error',
          'games.game.rest-twice',
          `${path}/count`,
          'Only one role can go to everyone left over ("rest"). Give this one a number.',
        );
      }
    } else if (typeof role.count === 'number') {
      counted += role.count;
    }
    reference(role.team, TEAM, `${path}/team`);
    reference(role.kit, KIT, `${path}/kit`);
  });
  if (roles.length > 0 && max !== undefined && counted > max) {
    report(
      'error',
      'games.game.too-many-roles',
      '/roles',
      `The roles need ${counted} players, more than a round can have (${max}). Lower their counts or raise the most players.`,
    );
  } else if (roles.length > 0 && min !== undefined && counted > min) {
    report(
      'warning',
      'games.game.too-many-roles',
      '/roles',
      `The roles need ${counted} players, more than the fewest a round starts with (${min}); with fewer, the last roles get nobody.`,
    );
  }

  // The round and its win conditions.
  const wins = listOf(round.win);
  const length = round.length;
  if (round.kind !== 'endless' && wins.length === 0 && typeof length !== 'number') {
    report(
      'error',
      'games.game.never-ends',
      '/round/win',
      'A game in rounds needs a way to end: add a way to win, or give the round a length.',
    );
  }
  reference(round.play_area, AREA, '/round/play_area');
  if (typeof round.play_area === 'string') {
    report(
      'info',
      'games.game.play-area-unused',
      '/round/play_area',
      'Players are not spread over the play area yet: they start the round where they stand.',
    );
  }
  const teamsNamed = gameTeamsNamed(data, roles);
  wins.forEach((win, i) => {
    const path = `/round/win/${i}`;
    const role = (field: string): void => {
      const value = win[field];
      if (typeof value === 'string' && !roleIds.has(value)) {
        report(
          'error',
          'games.game.unknown-role',
          `${path}/${field}`,
          `The role ${JSON.stringify(value)} is not one of this game's roles.`,
        );
      }
    };
    if ((win.type === 'last_standing' || win.type === 'score_target') && win.by === 'teams') {
      if (!teamsNamed) {
        report(
          'warning',
          'games.game.no-teams',
          `${path}/by`,
          'This game names no teams (in its roles or its team bases, generators and shops), so players are counted on their own.',
        );
      }
    }
    if (win.type === 'role_dies') {
      role('role');
      role('winner');
    }
    if (win.type === 'advancement') role('role');
    if (win.type === 'score_target') reference(win.objective, OBJECTIVE, `${path}/objective`);
    if (win.type === 'timer_ends') {
      reference(win.timer, TIMER, `${path}/timer`);
      if (win.winner === 'top_score') {
        if (win.objective === undefined) {
          report(
            'error',
            'games.game.time-up-winner',
            `${path}/objective`,
            'The highest score wins: pick the objective whose score counts.',
          );
        } else reference(win.objective, OBJECTIVE, `${path}/objective`);
      }
      if (win.winner === 'role') {
        if (win.role === undefined) {
          report(
            'error',
            'games.game.time-up-winner',
            `${path}/role`,
            'A role wins: pick which role.',
          );
        } else role('role');
      }
      if (win.timer === undefined && typeof length !== 'number') {
        report(
          'warning',
          'games.game.time-up-never',
          path,
          'No timer is named and the round has no length, so the time is never up.',
        );
      }
    }
  });
  if (round.after === 'lobby' && !isRecord(data.lobby)) {
    report(
      'warning',
      'games.game.no-lobby',
      '/round/after',
      'The round goes back to the lobby, but the game has no lobby: players stay where they are.',
    );
  }

  // The lobby.
  if (isRecord(data.lobby)) {
    const lobby = data.lobby;
    reference(lobby.area, AREA, '/lobby/area');
    const area = elements.find((one) => one.kind === AREA && one.id === lobby.area);
    if (area !== undefined) {
      const spawn = blockPos(lobby.spawn);
      const from = blockPos(dataOf(area.data).from);
      const to = blockPos(dataOf(area.data).to);
      const inside = spawn.every(
        (n, i) =>
          n >= Math.min(from[i] as number, to[i] as number) &&
          n <= Math.max(from[i] as number, to[i] as number),
      );
      if (!inside) {
        report(
          'warning',
          'games.game.lobby-spawn-outside',
          '/lobby/spawn',
          `The lobby's spawn is outside its area ${area.id}, so players would be put back over and over. Move the spawn inside the area.`,
        );
      }
    }
  }

  // Mechanics: each known one at most once, and the hearts fields B722 left to this check.
  const seen = new Set<string>();
  for (const { mechanic, path } of mechanicsOf(game)) {
    const type = mechanic.type;
    if (typeof type !== 'string' || !(MECHANIC_TYPES as readonly string[]).includes(type)) {
      report(
        'error',
        'games.game.unknown-mechanic',
        `${path}/type`,
        `${JSON.stringify(type)} is not a mechanic this version knows, so it does nothing.`,
      );
      continue;
    }
    if (seen.has(type)) {
      report(
        'error',
        'games.game.duplicate-mechanic',
        `${path}/type`,
        `The game has the mechanic "${type}" twice. Keep one and put all its settings there.`,
      );
    }
    seen.add(type);
    if (type === 'hearts') problems.push(...checkHeartsFields(game, mechanic, path));
  }
  return problems;
}

/** Whether a game names any team (the teams its round counts). */
function gameTeamsNamed(data: JsonObject, roles: readonly JsonObject[]): boolean {
  if (roles.some((role) => typeof role.team === 'string')) return true;
  return listOf(data.mechanics).some((mechanic) => {
    const entries =
      mechanic.type === 'team_base'
        ? listOf(mechanic.bases)
        : mechanic.type === 'generators'
          ? listOf(mechanic.generators)
          : mechanic.type === 'shop'
            ? listOf(mechanic.shops)
            : [];
    return entries.some((entry) => typeof entry.team === 'string');
  });
}

/** The hearts fields B722 left to the validators (ADR 0132 D9). */
function checkHeartsFields(game: Element, hearts: JsonObject, path: string): Problem[] {
  const problems: Problem[] = [];
  if (hearts.withdraw === true && !isRecord(hearts.heart_item)) {
    problems.push(
      problem(
        'error',
        'games.game.withdraw-needs-heart',
        game,
        `${path}/withdraw`,
        'Players can only withdraw a heart as a Heart item: describe the Heart item, or turn withdrawing off.',
      ),
    );
  }
  if (hearts.at_zero === 'kept_out' && typeof hearts.kept_out_seconds !== 'number') {
    problems.push(
      problem(
        'error',
        'games.game.at-zero-needs',
        game,
        `${path}/kept_out_seconds`,
        'Say how long a player with no hearts left is kept out.',
      ),
    );
  }
  if (hearts.at_zero === 'start_again' && typeof hearts.start_again_hearts !== 'number') {
    problems.push(
      problem(
        'error',
        'games.game.at-zero-needs',
        game,
        `${path}/start_again_hearts`,
        'Say how many hearts a player with none left starts again with.',
      ),
    );
  }
  return problems;
}

/** The game validator: each game's own checks, its mechanics' checks and the project's. */
export const gameValidator: ProjectValidator = {
  id: 'msm.games.game',
  kinds: [gameKind.id, TEAM, KIT, AREA, TIMER, OBJECTIVE],
  validate: (input) => {
    const problems: Problem[] = [];
    const games = input.elements.filter((element) => element.kind === gameKind.id);
    games.forEach((game, i) => {
      if (i > 0) {
        problems.push(
          problem(
            'error',
            'games.too-many-games',
            game,
            undefined,
            `A mod has one game, and this is number ${i + 1} (${games[0]?.id} is the first). Make it its own mod, or join the two.`,
          ),
        );
      }
      problems.push(...checkGame(game, input.elements));
      for (const { mechanic, path } of mechanicsOf(game)) {
        const type = mechanic.type;
        if (typeof type !== 'string' || !Object.hasOwn(MECHANIC_CHECKS, type)) continue;
        const check = MECHANIC_CHECKS[type as MechanicType];
        problems.push(...check(mechanic, { game, path, input }));
      }
    });
    if (games.length > 0) {
      for (const objective of input.elements.filter((element) => element.kind === OBJECTIVE)) {
        const path = objective.id.slice(objective.id.indexOf(':') + 1);
        if (GAME_RESERVED_OBJECTIVE_PATHS.includes(path)) {
          problems.push(
            problem(
              'error',
              'games.game.reserved-name',
              objective,
              undefined,
              `A game keeps its own scores in an objective called ${path}. Give this one another id.`,
            ),
          );
        }
      }
    }
    return problems;
  },
};
