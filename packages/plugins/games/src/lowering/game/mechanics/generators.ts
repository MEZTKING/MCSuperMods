/**
 * The mechanic `generators` of `msm:game` (ADR 0132 D2; B726, the spike's K12): places that drop
 * an item every few seconds while a round is played, up to a cap.
 *
 * No marker entities: each generator's place is known, so each has its own function and its own
 * second counter (`#<path>.generator.<i>` on the game's objective), raised by the round's
 * `second` hook; one line pair per generator per second, nothing per tick. A dropped stack is
 * counted by its `Item.count` (dropped items merge into one stack, so counting entities caps
 * nothing, K12), only the nearest stack of the generator's own item within 1.5 blocks; below the
 * cap, one more is summoned at the place's centre, still. A generator of a team drops only while
 * that team has a player in the round. A selector with a place only sees the source's dimension,
 * so each generator runs `in` the game's.
 *
 * Functions under `<ns>:msm_games/game/<path>/generators/`: `second` (hook `second`), `<i>` (one
 * generator's drop), `start` (hook `started`: counters to 0) and `clear` (hook `starting`: items
 * left lying at each generator from the round before removed). Items drop only in loaded
 * chunks, as a player near them keeps them.
 */
import type { Json, JsonObject, OutputFile } from '@msm/plugin-api';
import { blockPos, isRecord, num } from '../../shared-functions';
import { gameBuild } from '../build';
import { refOrUndefined } from '../names';
import type { MechanicLowering } from './index';
import { addGameIds, IdList, type MechanicIds, namesOf } from './kill-pair';

/** One generator of a `generators` mechanic, with its defaults. */
export interface GeneratorSettings {
  readonly at: readonly [number, number, number];
  readonly item: string;
  readonly every: number;
  readonly cap: number;
  readonly team?: string;
}

const ITEM_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/** Reads the generators of a `generators` mechanic; one without a usable item is left out. */
export function readGenerators(mechanic: JsonObject): GeneratorSettings[] {
  const list: Json[] = Array.isArray(mechanic.generators) ? mechanic.generators : [];
  return list.filter(isRecord).flatMap((entry) => {
    if (typeof entry.item !== 'string' || !ITEM_ID.test(entry.item)) return [];
    const team = refOrUndefined(entry.team);
    return [
      {
        at: blockPos(entry.at),
        item: entry.item,
        every: Math.min(3600, Math.max(1, Math.trunc(num(entry.every_seconds, 1)))),
        cap: Math.min(64, Math.max(1, Math.trunc(num(entry.cap, 16)))),
        ...(team === undefined ? {} : { team }),
      },
    ];
  });
}

/** The holder of generator `i`'s seconds. */
const counter = (i: number): string => `generator.${i}`;

/** Lowers the `generators` mechanic. */
export const lowerGenerators: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = gameBuild(context);
  const { game, names } = build;
  const objective = names.objective;
  const generators = readGenerators(mechanic);
  if (generators.length === 0) return [];
  const inGame = (command: string): string =>
    build.form('in_run', { dimension: game.dimension, command });
  const count = names.holder('generator.count');

  const second: string[] = [];
  const start: string[] = [];
  const clear: string[] = [];
  const files: OutputFile[] = [];
  generators.forEach((generator, i) => {
    const [x, y, z] = generator.at;
    const cx = x + 0.5;
    const cz = z + 0.5;
    let drop = inGame(build.run(`generators/${i}`));
    if (generator.team !== undefined) {
      drop = build.form('if_entity_run', {
        entities: `@a[tag=${names.tag('in')},team=${names.team(generator.team)}]`,
        command: drop,
      });
    }
    second.push(
      build.form('score_add', { holders: names.holder(counter(i)), objective, score: 1 }),
      build.form('if_score_run', {
        holder: names.holder(counter(i)),
        objective,
        range: `${generator.every}..`,
        command: drop,
      }),
    );
    start.push(build.setHolder(counter(i), 0));
    clear.push(
      inGame(
        build.form('kill', {
          entities: `@e[type=minecraft:item,x=${cx},y=${y},z=${cz},distance=..2]`,
        }),
      ),
    );
    files.push(
      build.file(`generators/${i}`, [
        build.setHolder(counter(i), 0),
        build.setHolder('generator.count', 0),
        build.form('as_run', {
          entities: `@e[type=minecraft:item,x=${cx},y=${y},z=${cz},distance=..1.5,sort=nearest,limit=1,nbt={Item:{id:"${generator.item}"}}]`,
          command: build.form('store_result_score_run', {
            holder: count,
            objective,
            command: build.form('data_get_entity', { entity: '@s', source_path: 'Item.count' }),
          }),
        }),
        build.form('if_score_run', {
          holder: count,
          objective,
          range: `..${generator.cap - 1}`,
          command: build.form('summon_item', { x: cx, y, z: cz, item: generator.item, count: 1 }),
        }),
      ]),
    );
  });
  files.push(
    build.file('generators/second', second),
    build.file('generators/start', start),
    build.file('generators/clear', clear),
    build.hookFile('second', [names.fn('generators/second')]),
    build.hookFile('started', [names.fn('generators/start')]),
    build.hookFile('starting', [names.fn('generators/clear')]),
  );
  return files;
};

/** The ids the `generators` mechanic writes, for `gamesGeneratedIds`. */
export const generatorsGeneratedIds: MechanicIds = (mechanic, element) => {
  const generators = readGenerators(mechanic);
  if (generators.length === 0) return {};
  return addGameIds(
    new IdList(),
    namesOf(element),
    ['second', 'start', 'clear', ...generators.map((_generator, i) => String(i))].map(
      (name) => `generators/${name}`,
    ),
    ['second', 'started', 'starting'],
  ).done();
};
