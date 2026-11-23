/**
 * The mechanic `border` of `msm:game` (ADR 0132 D2; B726): a world border round the game, in the
 * game's dimension. Set when a round has started, shrunk `after_seconds` into the round over
 * `seconds` (the round's `#<path>.time` counts the seconds gone), and set back to its size when
 * the round ends or is stopped, so the next round starts in the whole arena.
 *
 * Functions under `<ns>:msm_games/game/<path>/border/`: `start` (hook `started`), `second` (hook
 * `second`, only for a shrink that waits), `end` (hooks `ended` and `stopped`).
 */
import type { Json, JsonObject, OutputFile } from '@msm/plugin-api';
import { isRecord, num } from '../../shared-functions';
import { gameBuild } from '../build';
import type { MechanicLowering } from './index';
import { addGameIds, IdList, type MechanicIds, namesOf } from './kill-pair';

/** The largest border Minecraft draws. */
export const MAX_BORDER = 59_999_968;

const width = (value: Json | undefined, fallback: number): number =>
  Math.min(MAX_BORDER, Math.max(1, Math.trunc(num(value, fallback))));

/** The settings of a `border` mechanic, with their defaults. */
export interface BorderSettings {
  readonly size: number;
  readonly centre: readonly [number, number];
  readonly shrink?: { readonly to: number; readonly seconds: number; readonly after: number };
}

/** Reads a `border` mechanic. */
export function readBorder(mechanic: JsonObject): BorderSettings {
  const size = width(mechanic.size, 1000);
  const centre =
    Array.isArray(mechanic.centre) &&
    mechanic.centre.length === 2 &&
    mechanic.centre.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? ([
          Math.trunc(mechanic.centre[0] as number),
          Math.trunc(mechanic.centre[1] as number),
        ] as const)
      : ([0, 0] as const);
  const shrink = isRecord(mechanic.shrink) ? mechanic.shrink : undefined;
  return {
    size,
    centre,
    ...(shrink === undefined
      ? {}
      : {
          shrink: {
            to: width(shrink.to, size),
            seconds: Math.min(86_400, Math.max(1, Math.trunc(num(shrink.seconds, 60)))),
            after: Math.min(86_400, Math.max(0, Math.trunc(num(shrink.after_seconds, 0)))),
          },
        }),
  };
}

/** Lowers the `border` mechanic. */
export const lowerBorder: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = gameBuild(context);
  const { game, names } = build;
  const { size, centre, shrink } = readBorder(mechanic);
  const inGame = (command: string): string =>
    build.form('in_run', { dimension: game.dimension, command });
  const shrinkLine = (to: number, seconds: number): string =>
    inGame(build.form('worldborder_set_over_seconds', { width: to, seconds }));
  const start = [
    inGame(build.form('worldborder_center', { x: centre[0], z: centre[1] })),
    inGame(build.form('worldborder_set', { width: size })),
  ];
  const files: OutputFile[] = [];
  if (shrink !== undefined && shrink.after === 0) {
    start.push(shrinkLine(shrink.to, shrink.seconds));
  } else if (shrink !== undefined) {
    files.push(
      build.file('border/second', [
        build.form('if_score_run', {
          holder: names.holder('time'),
          objective: names.objective,
          range: String(shrink.after),
          command: shrinkLine(shrink.to, shrink.seconds),
        }),
      ]),
      build.hookFile('second', [names.fn('border/second')]),
    );
  }
  files.push(
    build.file('border/start', start),
    build.file('border/end', [inGame(build.form('worldborder_set', { width: size }))]),
    build.hookFile('started', [names.fn('border/start')]),
    build.hookFile('ended', [names.fn('border/end')]),
    build.hookFile('stopped', [names.fn('border/end')]),
  );
  return files;
};

/** The ids the `border` mechanic writes, for `gamesGeneratedIds`. */
export const borderGeneratedIds: MechanicIds = (mechanic, element) => {
  const { shrink } = readBorder(mechanic);
  const waits = shrink !== undefined && shrink.after > 0;
  return addGameIds(
    new IdList(),
    namesOf(element),
    ['start', 'end', ...(waits ? ['second'] : [])].map((name) => `border/${name}`),
    ['started', 'ended', 'stopped', ...(waits ? ['second'] : [])],
  ).done();
};
