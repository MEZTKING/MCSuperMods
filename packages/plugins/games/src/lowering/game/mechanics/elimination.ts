/**
 * The mechanic `elimination` of `msm:game` (ADR 0132 D2; B726): a player is out of the round
 * after a number of deaths. It counts on the round's own deaths of this round (`<ns>.msm_died`,
 * raised by the round before its `player_died` hook runs) and puts the player out with the
 * round's `out` (spectator, hook `player_out`).
 *
 * Functions under `<ns>:msm_games/game/<path>/elimination/`:
 *
 * - `died` (hook `player_died`, as the player): out at `lives` deaths, otherwise the lives left
 *   are told to the player;
 * - `lives_left`: tells the player how many lives they have left;
 * - `out`: tells everyone (with `announce`), then the round's `out`; with `out: lobby` and a
 *   lobby, the player is marked to be sent there;
 * - `respawned` (hook `player_respawned`) and `to_lobby`: a marked player who presses respawn is
 *   brought to the lobby's spawn in adventure mode (a dead player cannot be moved, so the move
 *   waits for the respawn); `clear` (hooks `ended`, `stopped`) takes the mark off.
 *
 * `out: lobby` in a game with no lobby is `spectate` (the check says so).
 */
import type { JsonObject, OutputFile } from '@msm/plugin-api';
import { bool, num } from '../../shared-functions';
import { gameBuild } from '../build';
import { type GameModel, readGame } from '../names';
import type { MechanicLowering } from './index';
import { addGameIds, IdList, type MechanicIds, namesOf } from './kill-pair';

/** The settings of an `elimination` mechanic, with their defaults. */
export interface EliminationSettings {
  readonly lives: number;
  readonly toLobby: boolean;
  readonly announce: boolean;
}

/** Reads an `elimination` mechanic of `game`. */
export function readElimination(game: GameModel, mechanic: JsonObject): EliminationSettings {
  return {
    lives: Math.min(100, Math.max(1, Math.trunc(num(mechanic.lives, 1)))),
    toLobby: mechanic.out === 'lobby' && game.lobby !== undefined,
    announce: bool(mechanic.announce, true),
  };
}

/** The tag of a player who goes to the lobby at their next respawn. */
const LOBBY_MARK = 'elimination.to_lobby';

/** The holder the lives left are worked out on. */
const LEFT = 'elimination.left';

/** Lowers the `elimination` mechanic. */
export const lowerElimination: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = gameBuild(context);
  const { game, names } = build;
  const { lives, toLobby, announce } = readElimination(game, mechanic);
  const objective = names.objective;

  const died = [
    build.form('if_score_run', {
      holder: '@s',
      objective: names.died,
      range: `${lives}..`,
      command: build.run('elimination/out'),
    }),
  ];
  const files: OutputFile[] = [];
  if (lives > 1) {
    died.push(
      build.form('if_score_run', {
        holder: '@s',
        objective: names.died,
        range: `..${lives - 1}`,
        command: build.run('elimination/lives_left'),
      }),
    );
    files.push(
      build.file('elimination/lives_left', [
        build.setHolder(LEFT, lives),
        build.form('score_operation', {
          holders: names.holder(LEFT),
          objective,
          score_operation: '-=',
          holder_2: '@s',
          objective_2: names.died,
        }),
        build.form('tellraw', {
          players: '@s',
          text: JSON.stringify([
            { text: 'Lives left: ' },
            { score: { name: names.holder(LEFT), objective } },
            { text: ` of ${lives}.` },
          ]),
        }),
      ]),
    );
  }

  const out: string[] = [];
  if (announce) {
    out.push(
      build.form('tellraw', {
        players: '@a',
        text: JSON.stringify([{ selector: '@s' }, { text: ' is out of the round.' }]),
      }),
    );
  }
  if (toLobby) out.push(build.form('tag_add', { entities: '@s', tag: names.tag(LOBBY_MARK) }));
  out.push(build.run('out'));

  files.push(
    build.file('elimination/died', died),
    build.file('elimination/out', out),
    build.hookFile('player_died', [names.fn('elimination/died')]),
  );

  const lobby = game.lobby;
  if (toLobby && lobby !== undefined) {
    const [x, y, z] = lobby.spawn;
    files.push(
      build.file('elimination/respawned', [
        build.form('if_entity_run', {
          entities: `@s[tag=${names.tag(LOBBY_MARK)}]`,
          command: build.run('elimination/to_lobby'),
        }),
      ]),
      build.file('elimination/to_lobby', [
        build.form('tag_remove', { entities: '@s', tag: names.tag(LOBBY_MARK) }),
        build.form('in_run', {
          dimension: game.dimension,
          command: build.form('teleport', { entities: '@s', x: x + 0.5, y, z: z + 0.5 }),
        }),
        build.form('game_mode', { game_mode: 'adventure', players: '@s' }),
      ]),
      build.file('elimination/clear', [
        build.form('tag_remove', { entities: '@a', tag: names.tag(LOBBY_MARK) }),
      ]),
      build.hookFile('player_respawned', [names.fn('elimination/respawned')]),
      build.hookFile('ended', [names.fn('elimination/clear')]),
      build.hookFile('stopped', [names.fn('elimination/clear')]),
    );
  }
  return files;
};

/** The ids the `elimination` mechanic writes, for `gamesGeneratedIds`. */
export const eliminationGeneratedIds: MechanicIds = (mechanic, element) => {
  const names = namesOf(element);
  const { lives, toLobby } = readElimination(readGame(element), mechanic);
  const functions = ['died', 'out', ...(lives > 1 ? ['lives_left'] : [])];
  const hooks = ['player_died'];
  if (toLobby) {
    functions.push('respawned', 'to_lobby', 'clear');
    hooks.push('player_respawned', 'ended', 'stopped');
  }
  const list = addGameIds(
    new IdList(),
    names,
    functions.map((name) => `elimination/${name}`),
    hooks,
  );
  if (toLobby) list.add('tag', names.tag(LOBBY_MARK));
  return list.done();
};
