/**
 * Lowering of a game's lobby and teams (ADR 0132 D1; B724, the spike's K16): where players wait
 * and how they are put into teams.
 *
 * - `lobby/send` (with a lobby): brings every player to the lobby's spawn in adventure mode and,
 *   when players pick their team, says how; `lobby/arrive` does the same for one player the game
 *   has not met yet (no round number), run while it waits; `lobby/build` places the lobby's
 *   building, tried each second while the game waits until it is placed.
 * - `lobby/keep` (with a lobby area, every tick while waiting or counting down): puts back a
 *   player in survival or adventure who walked out of the area (the area's own tick tags who is
 *   inside it).
 * - `teams/split` (when the game splits players into teams, at the round's start): players who
 *   picked a team with `/trigger <ns>.msm_team set <n>` join the n-th team, then everyone still
 *   without a team joins the smallest team one at a time in a random order (`teams/smallest`,
 *   K16: 17 players went 9 and 8, differently each run). A player put on a team by their role
 *   is not split.
 * - `teams/count` (a game with teams): `#<path>.teams`, the number of the game's teams with a
 *   player still in, for last standing by teams.
 */
import type { OutputFile } from '@msm/plugin-api';
import { areaTag, titleOf } from '../shared-functions';
import { type GameBuild, gameBuild } from './build';
import type { GameLoweringContext } from './mechanics/index';
import type { GameModel } from './names';

/** Whether players pick their team (the lobby's `pick`, with teams to pick from). */
export const picksTeams = (game: GameModel): boolean =>
  game.lobby?.teams === 'pick' && game.splitTeams.length > 0;

/** Whether the lobby keeps its players in its area. */
export const keepsInLobby = (game: GameModel): boolean => game.lobby?.area !== undefined;

/** The lines that say how to pick a team, to `players`. */
export function pickInfoLines(build: GameBuild, players: string): string[] {
  const { game, names } = build;
  if (!picksTeams(game)) return [];
  const choices = game.splitTeams
    .map((team, i) => `set ${i + 1} for ${titleOf(team.slice(team.indexOf(':') + 1))}`)
    .join(', ');
  return [build.say(players, `Pick a team with /trigger ${names.pick}: ${choices}.`)];
}

/** The lines run every second while waiting or counting down: the team pick is armed (K5). */
export function lobbySecondLines(build: GameBuild): string[] {
  return picksTeams(build.game)
    ? [build.form('score_enable', { holders: '@a', objective: build.names.pick })]
    : [];
}

/** The files of the game's lobby and teams; none for a game with neither. */
export function lobbyFiles(context: GameLoweringContext): OutputFile[] {
  const build = gameBuild(context);
  const { game, names } = build;
  const files: OutputFile[] = [];
  const inDimension = (command: string): string =>
    build.form('in_run', { dimension: game.dimension, command });

  const lobby = game.lobby;
  if (lobby !== undefined) {
    const [x, y, z] = lobby.spawn;
    const toSpawn = (entities: string): string =>
      inDimension(build.form('teleport', { entities, x: x + 0.5, y, z: z + 0.5 }));
    const send = [
      toSpawn('@a'),
      build.form('game_mode', { game_mode: 'adventure', players: '@a' }),
      ...pickInfoLines(build, '@a'),
    ];
    const arrive = [
      build.form('score_operation', {
        holders: '@s',
        objective: names.objective,
        score_operation: '=',
        holder_2: names.holder('round'),
        objective_2: names.objective,
      }),
      toSpawn('@s'),
      build.form('game_mode', { game_mode: 'adventure', players: '@s' }),
      ...pickInfoLines(build, '@s'),
    ];
    files.push(build.file('lobby/arrive', arrive));
    if (lobby.building !== undefined) {
      // `place template` needs its chunks loaded, so the building is tried each second while
      // the game waits until it is placed (`#<path>.built`, 1 once it is).
      const [bx, by, bz] = lobby.building.at;
      files.push(
        build.file('lobby/build', [
          inDimension(
            build.form('store_result_score_run', {
              holder: names.holder('built'),
              objective: names.objective,
              command: build.form('place_template', {
                template: lobby.building.structure,
                x: bx,
                y: by,
                z: bz,
              }),
            }),
          ),
        ]),
      );
    }
    files.push(build.file('lobby/send', send));
    if (lobby.area !== undefined) {
      const inside = areaTag(lobby.area);
      files.push(
        build.file('lobby/keep', [
          inDimension(
            build.form('teleport', {
              entities: `@a[tag=!${inside},gamemode=!creative,gamemode=!spectator]`,
              x: x + 0.5,
              y,
              z: z + 0.5,
            }),
          ),
        ]),
      );
    }
  }

  if (game.splitTeams.length > 0) {
    const split: string[] = [];
    if (picksTeams(game)) {
      game.splitTeams.forEach((team, i) => {
        split.push(
          build.form('team_join', {
            team: names.team(team),
            members: `@a[tag=${names.tag('in')},team=,scores={${names.pick}=${i + 1}}]`,
          }),
        );
      });
      split.push(build.form('score_reset', { holders: '@a', objective: names.pick }));
    }
    split.push(
      build.form('as_run', {
        entities: `@a[tag=${names.tag('in')},team=,sort=random]`,
        command: build.run('teams/smallest'),
      }),
    );
    files.push(build.file('teams/split', split), ...smallestTeamFiles(build));
  }

  if (game.teams.length > 0) {
    const count = [build.setHolder('teams', 0)];
    for (const team of game.teams) {
      count.push(
        build.form('if_entity_run', {
          entities: `@a[tag=${names.tag('in')},team=${names.team(team)}]`,
          command: build.form('score_add', {
            holders: names.holder('teams'),
            objective: names.objective,
            score: 1,
          }),
        }),
      );
    }
    files.push(build.file('teams/count', count));
  }
  return files;
}

/** `teams/smallest`, run as a player: joins the split team with the fewest players still in. */
function smallestTeamFiles(build: GameBuild): OutputFile[] {
  const { game, names } = build;
  const objective = names.objective;
  const teamCount = (i: number): string => names.holder(`team${i}`);
  const min = names.holder('min');
  const lines: string[] = [];
  game.splitTeams.forEach((team, i) => {
    lines.push(...build.count(`team${i}`, `@a[tag=${names.tag('in')},team=${names.team(team)}]`));
  });
  lines.push(
    build.form('score_operation', {
      holders: min,
      objective,
      score_operation: '=',
      holder_2: teamCount(0),
      objective_2: objective,
    }),
  );
  for (let i = 1; i < game.splitTeams.length; i += 1) {
    lines.push(
      build.form('score_operation', {
        holders: min,
        objective,
        score_operation: '<',
        holder_2: teamCount(i),
        objective_2: objective,
      }),
    );
  }
  // Joining sets `#min` to -1, which no count equals, so only the first smallest team is joined.
  const files: OutputFile[] = [];
  game.splitTeams.forEach((team, i) => {
    lines.push(
      build.form('if_score_compare_run', {
        holder: teamCount(i),
        objective,
        comparison: '=',
        holder_2: min,
        objective_2: objective,
        command: build.run(`teams/join/${i}`),
      }),
    );
    files.push(
      build.file(`teams/join/${i}`, [
        build.form('team_join', { team: names.team(team), members: '@s' }),
        build.setHolder('min', -1),
      ]),
    );
  });
  return [build.file('teams/smallest', lines), ...files];
}
