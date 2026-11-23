/**
 * The ids the games lowering writes (B551b), so the app's registry view and the mcfunction
 * checker know them as they know other kinds' companion ids: a project with games kinds exports
 * with no false "Unknown ... id" warning.
 */
import type { Element } from '@msm/plugin-api';
import { oneBlockPhaseFunctionNames } from './one-block';
import {
  areaTag,
  dataOf,
  gamesFunctionId,
  isRecord,
  objectiveName,
  oneBlocksObjective,
  splitId,
  str,
  teamName,
  timersObjective,
} from './shared-functions';
import { timerBossBar } from './timer';
import { worldSetupGeneratedIds } from './world-setup';
import { readWorldSetup } from './world-setup-files';

/**
 * The checker categories of {@link gamesGeneratedIds} that are not registries: objective, team
 * and entity tag names (plain, as written) and boss bar ids. The mcfunction checker takes them;
 * the registry view has no use for them.
 */
export const GAMES_CHECKER_CATEGORIES: readonly string[] = Object.freeze([
  'objective',
  'team',
  'tag',
  'bossbar',
]);

/**
 * The ids a games element's lowering writes, by registry as the app's registry view and the
 * mcfunction checker name them: `function`, `tag/function` (without `#`, `minecraft:load` and
 * `minecraft:tick` included), `predicate` (an area's `location_check`), the world setup's
 * {@link worldSetupGeneratedIds} and its `tag/worldgen/world_preset` entry `minecraft:normal`,
 * and the {@link GAMES_CHECKER_CATEGORIES}: `objective` (`<ns>.<path>`, `<ns>.msm_timers`,
 * `<ns>.msm_one_block`), `team` (`<ns>.<path>`), `tag` (an area's `<ns>.area.<path>` and its
 * `.now`) and `bossbar` (a timer's `<ns>:msm_games/timer/<path>`). Sorted, without duplicates;
 * empty for another kind or an element that cannot be lowered.
 */
export function gamesGeneratedIds(element: Element): Record<string, string[]> {
  const ids = new Map<string, Set<string>>();
  const add = (category: string, ...list: string[]): void => {
    const set = ids.get(category) ?? new Set<string>();
    for (const id of list) set.add(id);
    ids.set(category, set);
  };
  try {
    collect(element, add);
  } catch {
    return {};
  }
  return Object.fromEntries(
    [...ids]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([category, set]) => [category, [...set].sort()]),
  );
}

type Add = (category: string, ...ids: string[]) => void;

function collect(element: Element, add: Add): void {
  if (element.kind === 'msm:world_setup') {
    for (const [registry, list] of Object.entries(worldSetupGeneratedIds(element))) {
      add(registry, ...list);
    }
    const { namespace } = splitId(element.id);
    add('tag/function', gamesFunctionId(namespace, 'load'), 'minecraft:load');
    const world = readWorldSetup(element).world;
    if (
      world.type === 'void' ||
      world.type === 'flat' ||
      world.type === 'sky_islands' ||
      (world.type === 'preset' && world.preset !== undefined)
    ) {
      add('tag/worldgen/world_preset', 'minecraft:normal');
    }
    return;
  }
  const { namespace, path } = splitId(element.id);
  const data = dataOf(element.data);
  const fns = (folder: string, names: readonly string[]): string[] =>
    names.map((name) => gamesFunctionId(namespace, `${folder}/${path}/${name}`));
  const phaseTags = (...phases: ('load' | 'tick')[]): void => {
    for (const phase of phases) {
      add('tag/function', gamesFunctionId(namespace, phase), `minecraft:${phase}`);
    }
  };
  switch (element.kind) {
    case 'msm:team':
      add('function', ...fns('team', ['load']));
      phaseTags('load');
      add('team', teamName(element.id));
      return;
    case 'msm:objective':
      add('function', ...fns('objective', ['load']));
      phaseTags('load');
      add('objective', objectiveName(element.id));
      return;
    case 'msm:timer':
      add('function', ...fns('timer', ['load', 'tick', 'start', 'stop', 'second', 'end']));
      phaseTags('load', 'tick');
      add('tag/function', gamesFunctionId(namespace, `timer/${path}/ended`));
      add('objective', timersObjective(namespace));
      if (str(data.show, 'boss_bar') === 'boss_bar') add('bossbar', timerBossBar(namespace, path));
      return;
    case 'msm:area': {
      add('predicate', gamesFunctionId(namespace, `area/${path}`));
      add(
        'function',
        ...fns('area', [
          'tick',
          'entered',
          'left',
          'clear',
          ...(isRecord(data.reset) ? ['reset'] : []),
        ]),
      );
      phaseTags('tick');
      add(
        'tag/function',
        gamesFunctionId(namespace, `area/${path}/entered`),
        gamesFunctionId(namespace, `area/${path}/left`),
      );
      const inside = areaTag(element.id);
      add('tag', inside, `${inside}.now`);
      return;
    }
    case 'msm:one_block':
      add(
        'function',
        ...fns('one_block', ['load', 'tick', 'next', ...oneBlockPhaseFunctionNames(data)]),
      );
      phaseTags('load', 'tick');
      add('tag/function', gamesFunctionId(namespace, `one_block/${path}/broken`));
      add('objective', oneBlocksObjective(namespace));
      return;
    default:
      return;
  }
}
