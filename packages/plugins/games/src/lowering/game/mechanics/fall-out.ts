/**
 * The mechanic `fall_out` of `msm:game` (ADR 0132 D2; B726, the spike's K10 and K11): a player
 * still in the round whose feet are below `below_y` has fallen out. Found by a selector box, not
 * a predicate (K10: a sixth to a thirteenth of the cost), checked every tick in the game's
 * dimension.
 *
 * The box is absolute, from the bottom {@link FALL_BOTTOM} to `below_y` and as wide as the world
 * (a selector's `dx`/`dz` default to one block round the source, so both are given), so it
 * catches a player wherever they are: `@a[x=-30000000,y=-4096,z=-30000000,dx=60000000,
 * dy=<below_y - 1 + 4096>,dz=60000000]`. A selector with a box only sees the source's
 * dimension, so the check runs `in` the game's.
 *
 * Functions under `<ns>:msm_games/game/<path>/fall_out/`:
 *
 * - `tick` (hook `tick`): runs `fell` as each player in, alive and not a spectator, in the box;
 * - `fell` (as the player): by `action`, the round's `out` (said to everyone), `kill`, or `back`;
 * - with `action: back`: `mark` (hook `player_in`) keeps where the player started the round on
 *   three scores (`data get entity @s Pos[i]`, once per round); `back` copies them into the
 *   storage `<ns>:msm_games/game/<path>/fall_out` and runs the macro function `back/tp`, which
 *   teleports the player to that block and then to its centre. A player with no start kept dies
 *   instead.
 */
import type { JsonObject, OutputFile } from '@msm/plugin-api';
import type { GameNames } from '../names';
import type { MechanicLowering } from './index';
import {
  addGameIds,
  IdList,
  type MechanicBuild,
  type MechanicIds,
  mechanicBuild,
  mechanicObjective,
  namesOf,
} from './kill-pair';

/** The bottom of the fall-out box: below every dimension's floor and the void below it. */
export const FALL_BOTTOM = -4096;

/** Half the world's width, the box's reach on `x` and `z`. */
const WORLD_EDGE = 30_000_000;

/** What happens to a player who falls out. */
export type FallOutAction = 'out' | 'die' | 'back';

/** The settings of a `fall_out` mechanic, with their defaults. */
export interface FallOutSettings {
  readonly belowY: number;
  readonly action: FallOutAction;
}

/** Reads a `fall_out` mechanic. */
export function readFallOut(mechanic: JsonObject): FallOutSettings {
  const below = typeof mechanic.below_y === 'number' ? Math.trunc(mechanic.below_y) : 0;
  const action = mechanic.action === 'die' || mechanic.action === 'back' ? mechanic.action : 'out';
  return { belowY: Math.min(2048, Math.max(-2048, below)), action };
}

/** The selector of the players of the round who have fallen below `belowY`. */
export function fallenSelector(names: GameNames, belowY: number): string {
  const dy = belowY - 1 - FALL_BOTTOM;
  return (
    `@a[tag=${names.tag('in')},tag=!${names.tag('dead')},gamemode=!spectator,` +
    `x=-${WORLD_EDGE},y=${FALL_BOTTOM},z=-${WORLD_EDGE},dx=${2 * WORLD_EDGE},dy=${dy},dz=${2 * WORLD_EDGE}]`
  );
}

/** The three objectives a player's start is kept on (`action: back`). */
export const fallOutObjectives = (namespace: string): readonly [string, string, string] => [
  mechanicObjective(namespace, 'fall_x'),
  mechanicObjective(namespace, 'fall_y'),
  mechanicObjective(namespace, 'fall_z'),
];

const AXES = ['x', 'y', 'z'] as const;

/** The files that put a fallen player back where they started the round. */
function backFiles(build: MechanicBuild): OutputFile[] {
  const { game, names } = build;
  const objectives = fallOutObjectives(game.namespace);
  const storage = build.storage('fall_out');
  const kept = (command: string, unless = false): string =>
    build.form(unless ? 'unless_score_run' : 'if_score_run', {
      holder: '@s',
      objective: objectives[0],
      range: '-2147483648..',
      command,
    });
  const mark = AXES.map((_axis, i) =>
    build.form('store_result_score_run', {
      holder: '@s',
      objective: objectives[i] as string,
      command: build.form('data_get_entity', { entity: '@s', source_path: `Pos[${i}]` }),
    }),
  );
  const back = [
    kept(build.run('fall_out/back/go')),
    kept(build.form('kill', { entities: '@s' }), true),
  ];
  const go = [
    ...AXES.map((axis, i) =>
      build.form('store_result_storage_run', {
        storage,
        nbt_path: axis,
        scale: 1,
        command: build.form('score_get', { holder: '@s', objective: objectives[i] as string }),
      }),
    ),
    build.form('function_with_storage', { function: names.fn('fall_out/back/tp'), storage }),
  ];
  // A macro line: `$(x)` and the others are filled from the storage when the function runs.
  const tp = [
    `$${build.form('teleport', { entities: '@s', x: '$(x)', y: '$(y)', z: '$(z)' })}`,
    build.form('at_run', {
      entities: '@s',
      command: build.form('teleport', { entities: '@s', x: '~0.5', y: '~', z: '~0.5' }),
    }),
  ];
  return [
    ...build.loadFiles(
      'fall_out/load',
      objectives.map((objective) => build.form('objective_add', { objective, criterion: 'dummy' })),
    ),
    build.file('fall_out/mark', mark),
    build.file('fall_out/back', back),
    build.file('fall_out/back/go', go),
    build.file('fall_out/back/tp', tp),
    build.hookFile('player_in', [names.fn('fall_out/mark')]),
  ];
}

/** Lowers the `fall_out` mechanic. */
export const lowerFallOut: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = mechanicBuild(context);
  const { game, names } = build;
  const { belowY, action } = readFallOut(mechanic);
  const tick = [
    build.form('in_run', {
      dimension: game.dimension,
      command: build.form('as_run', {
        entities: fallenSelector(names, belowY),
        command: build.run('fall_out/fell'),
      }),
    }),
  ];
  const fell: string[] = [];
  if (action === 'out') {
    fell.push(
      build.form('tellraw', {
        players: '@a',
        text: JSON.stringify([{ selector: '@s' }, { text: ' fell out.' }]),
      }),
      build.run('out'),
    );
  } else if (action === 'die') {
    fell.push(build.form('kill', { entities: '@s' }));
  } else {
    fell.push(build.run('fall_out/back'));
  }
  return [
    build.file('fall_out/tick', tick),
    build.file('fall_out/fell', fell),
    build.hookFile('tick', [names.fn('fall_out/tick')]),
    ...(action === 'back' ? backFiles(build) : []),
  ];
};

/** The ids the `fall_out` mechanic writes, for `gamesGeneratedIds`. */
export const fallOutGeneratedIds: MechanicIds = (mechanic, element) => {
  const names = namesOf(element);
  const back = readFallOut(mechanic).action === 'back';
  const list = addGameIds(
    new IdList(),
    names,
    ['tick', 'fell', ...(back ? ['load', 'mark', 'back', 'back/go', 'back/tp'] : [])].map(
      (name) => `fall_out/${name}`,
    ),
    back ? ['tick', 'player_in'] : ['tick'],
    back,
  );
  if (back) list.add('objective', ...fallOutObjectives(names.namespace));
  return list.done();
};
