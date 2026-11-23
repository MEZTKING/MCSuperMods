/**
 * The mechanic `team_base` of `msm:game` (ADR 0132 D2; B726, the spike's K11): each team has a
 * base with a bed; while the bed stands its players come back at the base, once it is broken a
 * player of that team who dies is out.
 *
 * K11: `spawnpoint` keeps its point after the bed is gone, so the game decides "no bed, out"
 * itself when a player dies, by testing the bed's foot (`#minecraft:beds[part=foot]`; breaking
 * either half removes both). A respawn wait puts the dead player into spectator before they
 * press respawn (the round sees the death at once), and back into survival at the base after
 * `respawn_seconds`, counted down each second on the objective `<ns>.msm_respawn`.
 *
 * Functions under `<ns>:msm_games/game/<path>/team_base/`, the bases numbered `<j>` in order:
 *
 * - `spawn` (hook `player_in`, as the player): their team's spawn point, in the game's dimension;
 * - `start` (hook `started`): every bed counted as standing (`#<path>.bed.<j>` 1);
 * - `second` (hook `second`): a bed found gone is told to everyone once (`lost/<j>`); players
 *   waiting count down and come `back` at 0;
 * - `died` (hook `player_died`, as the player) and `died/<j>`: the bed stands: `wait` (with a
 *   wait) or nothing (they come back at the spawn point); the bed is gone: the round's `out`;
 * - `wait`, `back`: the wait as above; `back` teleports the player to their team's spawn;
 * - `left` (hook `player_out`): a player put out stops waiting; `end` (hooks `ended`, `stopped`):
 *   players still waiting are put back in survival.
 */
import type { Json, JsonObject, OutputFile } from '@msm/plugin-api';
import { blockPos, isRecord, splitId, titleOf } from '../../shared-functions';
import { refOrUndefined } from '../names';
import type { MechanicLowering } from './index';
import {
  addGameIds,
  IdList,
  type MechanicIds,
  mechanicBuild,
  mechanicObjective,
  namesOf,
} from './kill-pair';

/** One base of a `team_base` mechanic. */
export interface TeamBaseSettings {
  readonly team: string;
  readonly bed: readonly [number, number, number];
  readonly spawn: readonly [number, number, number];
}

/** Reads the bases of a `team_base` mechanic (one whose team is not an id is left out). */
export function readTeamBases(mechanic: JsonObject): TeamBaseSettings[] {
  const list: Json[] = Array.isArray(mechanic.bases) ? mechanic.bases : [];
  return list.filter(isRecord).flatMap((entry) => {
    const team = refOrUndefined(entry.team);
    return team === undefined
      ? []
      : [{ team, bed: blockPos(entry.bed), spawn: blockPos(entry.spawn) }];
  });
}

/** The seconds a dead player waits as a spectator, 0 to 60. */
export const respawnSeconds = (mechanic: JsonObject): number =>
  typeof mechanic.respawn_seconds === 'number'
    ? Math.min(60, Math.max(0, Math.trunc(mechanic.respawn_seconds)))
    : 0;

/** The objective the respawn wait counts down on. */
export const respawnObjective = (namespace: string): string =>
  mechanicObjective(namespace, 'respawn');

/** The tag of a player waiting to come back. */
const WAITING = 'team_base.waiting';

/** The bed's foot, as a block predicate. */
const BED_FOOT = '#minecraft:beds[part=foot]';

/** Lowers the `team_base` mechanic. */
export const lowerTeamBase: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = mechanicBuild(context);
  const { game, names } = build;
  const bases = readTeamBases(mechanic);
  if (bases.length === 0) return [];
  const wait = respawnSeconds(mechanic);
  const objective = names.objective;
  const respawn = respawnObjective(game.namespace);
  const waiting = names.tag(WAITING);
  const inGame = (command: string): string =>
    build.form('in_run', { dimension: game.dimension, command });
  const member = (team: string): string => `@s[team=${names.team(team)}]`;

  const spawn: string[] = [];
  const start: string[] = [];
  const second: string[] = [];
  const died: string[] = [];
  const back = [
    build.form('tag_remove', { entities: '@s', tag: waiting }),
    build.form('game_mode', { game_mode: 'survival', players: '@s' }),
  ];
  const files: OutputFile[] = [];
  bases.forEach((base, j) => {
    const [bx, by, bz] = base.bed;
    const [sx, sy, sz] = base.spawn;
    const bed = names.holder(`bed.${j}`);
    const teamName = titleOf(splitId(base.team).path);
    spawn.push(
      inGame(build.form('spawn_point', { players: member(base.team), x: sx, y: sy, z: sz })),
    );
    start.push(build.setHolder(`bed.${j}`, 1));
    second.push(
      build.form('if_score_run', {
        holder: bed,
        objective,
        range: '1',
        command: inGame(
          build.form('unless_block_run', {
            x: bx,
            y: by,
            z: bz,
            block_predicate: BED_FOOT,
            command: build.run(`team_base/lost/${j}`),
          }),
        ),
      }),
    );
    died.push(
      build.form('if_entity_run', {
        entities: member(base.team),
        command: build.run(`team_base/died/${j}`),
      }),
    );
    back.push(
      inGame(
        build.form('teleport', { entities: member(base.team), x: sx + 0.5, y: sy, z: sz + 0.5 }),
      ),
    );
    const diedHere: string[] = [];
    if (wait > 0) {
      diedHere.push(
        build.form('in_if_block_run', {
          dimension: game.dimension,
          x: bx,
          y: by,
          z: bz,
          block: BED_FOOT,
          command: build.run('team_base/wait'),
        }),
      );
    }
    diedHere.push(
      inGame(
        build.form('unless_block_run', {
          x: bx,
          y: by,
          z: bz,
          block_predicate: BED_FOOT,
          command: build.run('out'),
        }),
      ),
    );
    files.push(
      build.file(`team_base/died/${j}`, diedHere),
      build.file(`team_base/lost/${j}`, [
        build.setHolder(`bed.${j}`, 0),
        build.say('@a', `${teamName}'s bed was broken: its players no longer come back.`),
      ]),
    );
  });

  if (wait > 0) {
    second.push(
      build.form('score_remove', { holders: `@a[tag=${waiting}]`, objective: respawn, score: 1 }),
      build.form('as_run', {
        entities: `@a[tag=${waiting},tag=${names.tag('in')},scores={${respawn}=..0}]`,
        command: build.run('team_base/back'),
      }),
    );
    files.push(
      ...build.loadFiles('team_base/load', [
        build.form('objective_add', { objective: respawn, criterion: 'dummy' }),
      ]),
      build.file('team_base/wait', [
        build.form('game_mode', { game_mode: 'spectator', players: '@s' }),
        build.form('tag_add', { entities: '@s', tag: waiting }),
        build.form('score_set', { holders: '@s', objective: respawn, score: wait }),
        build.say('@s', `You come back at your base in ${wait} seconds.`),
      ]),
      build.file('team_base/back', back),
      build.file('team_base/left', [build.form('tag_remove', { entities: '@s', tag: waiting })]),
      build.file('team_base/end', [
        build.form('game_mode', { game_mode: 'survival', players: `@a[tag=${waiting}]` }),
        build.form('tag_remove', { entities: '@a', tag: waiting }),
      ]),
      build.hookFile('player_out', [names.fn('team_base/left')]),
      build.hookFile('ended', [names.fn('team_base/end')]),
      build.hookFile('stopped', [names.fn('team_base/end')]),
    );
  }
  files.push(
    build.file('team_base/spawn', spawn),
    build.file('team_base/start', start),
    build.file('team_base/second', second),
    build.file('team_base/died', died),
    build.hookFile('player_in', [names.fn('team_base/spawn')]),
    build.hookFile('started', [names.fn('team_base/start')]),
    build.hookFile('second', [names.fn('team_base/second')]),
    build.hookFile('player_died', [names.fn('team_base/died')]),
  );
  return files;
};

/** The ids the `team_base` mechanic writes, for `gamesGeneratedIds`. */
export const teamBaseGeneratedIds: MechanicIds = (mechanic, element) => {
  const names = namesOf(element);
  const bases = readTeamBases(mechanic);
  if (bases.length === 0) return {};
  const waits = respawnSeconds(mechanic) > 0;
  const functions = [
    'spawn',
    'start',
    'second',
    'died',
    ...bases.flatMap((_base, j) => [`died/${j}`, `lost/${j}`]),
    ...(waits ? ['load', 'wait', 'back', 'left', 'end'] : []),
  ];
  const hooks = [
    'player_in',
    'started',
    'second',
    'player_died',
    ...(waits ? ['player_out', 'ended', 'stopped'] : []),
  ];
  const list = addGameIds(
    new IdList(),
    names,
    functions.map((name) => `team_base/${name}`),
    hooks,
    waits,
  );
  if (waits) {
    list.add('objective', respawnObjective(names.namespace)).add('tag', names.tag(WAITING));
  }
  return list.done();
};
