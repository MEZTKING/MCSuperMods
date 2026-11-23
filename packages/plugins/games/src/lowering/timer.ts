/**
 * Lowering of `msm:timer` (ADR 0113 D6, limit M9: whole seconds). A timer `<ns>:<path>` keeps its
 * values on the objective `<ns>.msm_timers` (shared by the namespace's timers), as three score
 * holders: `#<path>` (the time shown: seconds left counting down, seconds gone counting up),
 * `#<path>.on` (1 while it runs, 0 when stopped) and `#<path>.ticks` (ticks into the second).
 * The functions under `<ns>:msm_games/timer/<path>/`:
 *
 * - `load` (joins the plugin's load): makes the objective and the boss bar
 *   `<ns>:msm_games/timer/<path>` if missing, sets its colour, name and maximum, and the first
 *   time the world loads marks the timer stopped (or starts it, for `starts: world_start`);
 * - `tick` (joins the plugin's tick): counts the ticks while it runs and calls `second` every 20;
 * - `start` and `stop`, which Rules (B553) and the project's functions call;
 * - `second`: counts one second, shows the time and calls `end` when it is up;
 * - `end`: starts it again (`repeat`) or stops it, then runs `on_end` and the hook
 *   `#<ns>:msm_games/timer/<path>/ended`.
 */
import type { Element, OutputFile, TargetFacts } from '@msm/plugin-api';
import {
  bool,
  dataOf,
  fillForm,
  functionFile,
  gamesFunctionId,
  holderOf,
  hookTagFile,
  num,
  runHook,
  type SharedContribution,
  sharedFunctionFiles,
  splitId,
  str,
  textComponent,
  timersObjective,
  titleOf,
} from './shared-functions';

/** The boss bar id of a timer: `<ns>:msm_games/timer/<path>`. */
export const timerBossBar = (namespace: string, path: string): string =>
  gamesFunctionId(namespace, `timer/${path}`);

/** Lowers a timer to its functions, its hook tag and the tag entries that run it. */
export function lowerTimer(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitId(element.id);
  const data = dataOf(element.data);
  const seconds = Math.trunc(num(data.seconds, 300));
  const down = str(data.count, 'down') !== 'up';
  const show = str(data.show, 'boss_bar');
  const repeat = bool(data.repeat, false);
  const objective = timersObjective(namespace);
  const value = holderOf(path);
  const on = holderOf(path, 'on');
  const ticks = holderOf(path, 'ticks');
  const bossbar = timerBossBar(namespace, path);
  const title = str(data.name, titleOf(path));
  const fn = (name: string): string => gamesFunctionId(namespace, `timer/${path}/${name}`);
  const getValue = fillForm(target, 'score_get', { holder: value, objective });
  const storeBar = fillForm(target, 'bossbar_store_value', { bossbar, command: getValue });

  const load = [fillForm(target, 'objective_add', { objective, criterion: 'dummy' })];
  if (show === 'boss_bar') {
    load.push(
      fillForm(target, 'bossbar_add', { bossbar, text: textComponent(title) }),
      fillForm(target, 'bossbar_name', { bossbar, text: textComponent(title) }),
      fillForm(target, 'bossbar_colour', { bossbar, bossbar_colour: str(data.colour, 'white') }),
      fillForm(target, 'bossbar_max', { bossbar, max: seconds }),
    );
  }
  if (str(data.starts, 'manual') === 'world_start') {
    load.push(`execute unless score ${on} ${objective} matches 0..1 run function ${fn('start')}`);
  }
  load.push(
    `execute unless score ${on} ${objective} matches 0..1 run ${fillForm(target, 'score_set', {
      holders: on,
      objective,
      score: 0,
    })}`,
  );

  const tick = [
    `execute if score ${on} ${objective} matches 1 run ${fillForm(target, 'score_add', {
      holders: ticks,
      objective,
      score: 1,
    })}`,
    `execute if score ${on} ${objective} matches 1 if score ${ticks} ${objective} matches 20.. run function ${fn('second')}`,
  ];

  const start = [
    fillForm(target, 'score_set', { holders: value, objective, score: down ? seconds : 0 }),
    fillForm(target, 'score_set', { holders: ticks, objective, score: 0 }),
    fillForm(target, 'score_set', { holders: on, objective, score: 1 }),
  ];
  const stop = [fillForm(target, 'score_set', { holders: on, objective, score: 0 })];
  if (show === 'boss_bar') {
    start.push(
      storeBar,
      fillForm(target, 'bossbar_players', { bossbar, players: '@a' }),
      fillForm(target, 'bossbar_visible', { bossbar, boolean: true }),
    );
    stop.push(fillForm(target, 'bossbar_visible', { bossbar, boolean: false }));
  }

  // `scoreboard players add` takes no negative number and the forms have no `remove`, so the
  // count down is the one plain `scoreboard players remove` line.
  const second = [
    fillForm(target, 'score_set', { holders: ticks, objective, score: 0 }),
    down
      ? `scoreboard players remove ${value} ${objective} 1`
      : fillForm(target, 'score_add', { holders: value, objective, score: 1 }),
  ];
  if (show === 'boss_bar') {
    second.push(storeBar, fillForm(target, 'bossbar_players', { bossbar, players: '@a' }));
  } else if (show === 'action_bar') {
    const parts = [
      ...(data.name === undefined ? [] : [{ text: `${title} ` }]),
      { score: { name: value, objective } },
      { text: 's' },
    ];
    second.push(fillForm(target, 'actionbar', { players: '@a', text: JSON.stringify(parts) }));
  }
  second.push(
    down
      ? `execute if score ${value} ${objective} matches ..0 run function ${fn('end')}`
      : `execute if score ${value} ${objective} matches ${seconds}.. run function ${fn('end')}`,
  );

  const end = [`function ${fn(repeat ? 'start' : 'stop')}`];
  if (typeof data.on_end === 'string' && data.on_end !== '') end.push(`function ${data.on_end}`);
  end.push(runHook(namespace, `timer/${path}/ended`));

  const contributions: SharedContribution[] = [
    { phase: 'load', path: `timer/${path}/load`, lines: load },
    { phase: 'tick', path: `timer/${path}/tick`, lines: tick },
  ];
  return [
    ...sharedFunctionFiles(target, namespace, contributions),
    functionFile(target, namespace, `timer/${path}/start`, start),
    functionFile(target, namespace, `timer/${path}/stop`, stop),
    functionFile(target, namespace, `timer/${path}/second`, second),
    functionFile(target, namespace, `timer/${path}/end`, end),
    hookTagFile(target, namespace, `timer/${path}/ended`),
  ];
}
