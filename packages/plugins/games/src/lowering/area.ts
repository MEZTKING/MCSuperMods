/**
 * Lowering of `msm:area` (ADR 0113 D7, limit M8: boxes only). An area `<ns>:<path>` lowers to:
 *
 * - the predicate `<ns>:msm_games/area/<path>`: a `minecraft:location_check` on the dimension and
 *   the box, whose bounds are inclusive on exact coordinates (B547 Y11), so the box of blocks
 *   `from` to `to` is `min` to `max + 1` on each axis;
 * - a tick function (joins the plugin's tick) that tests every player at its own position, tags
 *   those who entered with `<ns>.area.<path>` and runs `entered`, and takes the tag off those
 *   who left and runs `left`; the two run the hooks `#<ns>:msm_games/area/<path>/entered` and
 *   `.../left` as the player;
 * - `clear`: every entity but players in the box removed (the `dx` selector, B547 Y12), and, with
 *   `reset`, `reset`: `clear`, then each structure placed with `place template` in order.
 *   `place template` needs the chunks loaded, as they are while a player is there (B547 Y3).
 */
import type { Element, Json, OutputFile, TargetFacts } from '@msm/plugin-api';
import {
  areaTag,
  blockPos,
  dataOf,
  fillForm,
  functionFile,
  GAMES_FUNCTION_ROOT,
  gamesFunctionId,
  hookTagFile,
  isRecord,
  runHook,
  type SharedContribution,
  sharedFunctionFiles,
  splitId,
  str,
} from './shared-functions';

/** The schema of the area's predicate file. */
export const PREDICATE_SCHEMA = 'resource:predicate';

/** The low and high corners of an area's box, each axis ordered. */
export function areaBox(data: Json): { min: number[]; max: number[] } {
  const object = dataOf(data);
  const from = blockPos(object.from);
  const to = blockPos(object.to);
  return {
    min: from.map((n, i) => Math.min(n, to[i] as number)),
    max: from.map((n, i) => Math.max(n, to[i] as number)),
  };
}

/** The `location_check` predicate of an area. */
export function areaPredicate(data: Json): Json {
  const { min, max } = areaBox(data);
  const axis = (i: number): Json => ({ min: min[i] as number, max: (max[i] as number) + 1 });
  return {
    type: 'minecraft:location_check',
    predicate: {
      dimension: str(dataOf(data).dimension, 'minecraft:overworld'),
      position: { x: axis(0), y: axis(1), z: axis(2) },
    },
  };
}

/** Lowers an area to its predicate, functions, hooks and the tag entries that run it. */
export function lowerArea(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitId(element.id);
  const data = dataOf(element.data);
  const dimension = str(data.dimension, 'minecraft:overworld');
  const inside = areaTag(element.id);
  const now = `${inside}.now`;
  const fn = (name: string): string => gamesFunctionId(namespace, `area/${path}/${name}`);
  const predicate = gamesFunctionId(namespace, `area/${path}`);
  const { min, max } = areaBox(element.data);
  const [x, y, z] = min as [number, number, number];
  const [dx, dy, dz] = max.map((n, i) => n - (min[i] as number));

  const runFunction = (name: string): string =>
    fillForm(target, 'run_function', { function: fn(name) });
  const tick = [
    fillForm(target, 'as_at_if_predicate_run', {
      entities: '@a',
      anchor: '@s',
      predicate,
      command: fillForm(target, 'tag_add', { entities: '@s', tag: now }),
    }),
    fillForm(target, 'as_run', {
      entities: `@a[tag=${now},tag=!${inside}]`,
      command: runFunction('entered'),
    }),
    fillForm(target, 'as_run', {
      entities: `@a[tag=!${now},tag=${inside}]`,
      command: runFunction('left'),
    }),
    fillForm(target, 'tag_remove', { entities: `@a[tag=${now}]`, tag: now }),
  ];
  const entered = [
    fillForm(target, 'tag_add', { entities: '@s', tag: inside }),
    runHook(target, namespace, `area/${path}/entered`),
  ];
  const left = [
    fillForm(target, 'tag_remove', { entities: '@s', tag: inside }),
    runHook(target, namespace, `area/${path}/left`),
  ];
  const clear = [
    fillForm(target, 'in_run', {
      dimension,
      command: fillForm(target, 'kill', {
        entities: `@e[type=!minecraft:player,x=${x},y=${y},z=${z},dx=${dx},dy=${dy},dz=${dz}]`,
      }),
    }),
  ];

  const contributions: SharedContribution[] = [
    { phase: 'tick', path: `area/${path}/tick`, lines: tick },
  ];
  const files: OutputFile[] = [
    {
      path: `data/${namespace}/${target.folders.data.predicate}/${GAMES_FUNCTION_ROOT}/area/${path}.json`,
      contents: areaPredicate(element.data),
      layer: 'datapack',
      schema: PREDICATE_SCHEMA,
    },
    ...sharedFunctionFiles(target, namespace, contributions),
    functionFile(target, namespace, `area/${path}/entered`, entered),
    functionFile(target, namespace, `area/${path}/left`, left),
    functionFile(target, namespace, `area/${path}/clear`, clear),
    hookTagFile(target, namespace, `area/${path}/entered`),
    hookTagFile(target, namespace, `area/${path}/left`),
  ];

  const reset = isRecord(data.reset) ? data.reset : undefined;
  if (reset !== undefined) {
    const lines = [runFunction('clear')];
    const structures = Array.isArray(reset.structures) ? reset.structures : [];
    for (const entry of structures) {
      if (!isRecord(entry) || typeof entry.structure !== 'string') continue;
      const [sx, sy, sz] = blockPos(entry.at);
      const place = fillForm(target, 'place_template', {
        template: entry.structure,
        x: sx,
        y: sy,
        z: sz,
      });
      lines.push(fillForm(target, 'in_run', { dimension, command: place }));
    }
    files.push(functionFile(target, namespace, `area/${path}/reset`, lines));
  }
  return files;
}
