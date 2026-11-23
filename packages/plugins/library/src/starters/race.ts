/**
 * The Race Creator flow (ADR 0117 D2, ADR 0113 D5 to D7; B557): a race from a start through
 * checkpoints to a finish, timed on the action bar, the best time on the sidebar. Everything lowers
 * to plain data pack files, so it works in a vanilla data pack.
 *
 * It makes the start, the checkpoints and the finish as `msm:area`s (columns five blocks wide
 * through the whole height, 48 blocks apart east of the spawn, so the land under them does not
 * matter; move them onto your course in the Area Studio), a `msm:timer` (counting up as a
 * stopwatch, or down from a time limit), a `msm:objective` for each runner's best time on the
 * sidebar if chosen, and for each area a hidden advancement granted when a player stands in it (a
 * `minecraft:location` criterion testing the entity tag the area gives the players inside, so
 * moving an area moves its line) whose reward is a function of the race:
 *
 * - the start's (`started`) starts the clock afresh and takes back the other lines' advancements,
 *   then its own, so it fires again while the runner stands there: the clock runs from the moment
 *   they leave;
 * - a checkpoint's says its number in chat;
 * - the finish's (`finished`), only while the clock runs, stops it, shows the time and keeps it as
 *   the runner's best when it beats the last.
 *
 * With a time limit the timer's end runs `time_up`, which tells everyone. The timer is shared by
 * every player (ADR 0113 D6): one runner at a time, or everyone at once. The functions call the
 * games kinds' own functions and read the timer's score by the names the games plugin writes
 * (B552).
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  stringValue,
} from '../content/parameters';
import { GAME_KINDS, gamesFunction, inAreaCriterion } from './skyblock';

/** How far apart the start, the checkpoints and the finish are, east of the spawn. */
const STEP = 48;

/** The Race flow's questions, groups "Race" and "Time". */
export const RACE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'race_name',
    label: 'What is your race called?',
    description: 'Ids derive from it: Sky Sprint gives sky_sprint.',
    group: 'Race',
    type: 'string',
    default: 'Sky Sprint',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'checkpoints',
    label: 'Checkpoints between the start and the finish',
    group: 'Race',
    type: 'number',
    default: 2,
    min: 0,
    max: 5,
    step: 1,
  },
  {
    id: 'count',
    label: 'Timer',
    group: 'Time',
    type: 'choice',
    default: 'up',
    choices: [
      { value: 'up', label: 'Count up: a stopwatch' },
      { value: 'down', label: 'Count down from a time limit' },
    ],
  },
  {
    id: 'limit',
    label: 'Time limit in seconds',
    description: 'For a timer that counts down; a stopwatch stops after an hour.',
    group: 'Time',
    type: 'number',
    default: 120,
    min: 10,
    max: 3600,
    step: 10,
  },
  {
    id: 'best',
    label: 'Best time on the sidebar',
    group: 'Time',
    type: 'boolean',
    default: true,
  },
]);

/** `/` as `.`, as the games kinds name objectives and score holders. */
const dotted = (path: string): string => path.replace(/\//g, '.');

export function raceBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(RACE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'race_name'));
  const id = name.id;
  const count = Math.max(0, Math.min(5, Math.round(numberValue(values, 'checkpoints'))));
  const down = stringValue(values, 'count') === 'down';
  const seconds = down
    ? Math.max(10, Math.min(3600, Math.round(numberValue(values, 'limit'))))
    : 3600;
  const best = booleanValue(values, 'best');
  const timerPath = `${id}/clock`;
  const timer = rl(namespace, timerPath);
  const bestObjective = rl(namespace, `${id}/best`);
  const bestName = `${namespace}.${dotted(`${id}/best`)}`;
  const timers = `${namespace}.msm_timers`;
  const clock = `#${dotted(timerPath)}`;
  const fn = (path: string): ResourceLocation => rl(namespace, `${id}/${path}`);
  const line = (path: string): ResourceLocation => rl(namespace, `${id}/lines/${path}`);

  // The lines: an area, its hidden advancement and the function the advancement runs.
  const lines = [
    { path: 'start', title: 'Start', x: 0 },
    ...Array.from({ length: count }, (_, index) => ({
      path: `checkpoint_${index + 1}`,
      title: `Checkpoint ${index + 1}`,
      x: (index + 1) * STEP,
    })),
    { path: 'finish', title: 'Finish', x: (count + 1) * STEP },
  ];
  const rewardOf = (path: string): ResourceLocation =>
    path === 'start' ? fn('started') : path === 'finish' ? fn('finished') : fn(`passed_${path}`);
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.display}, a race`),
  ];
  for (const entry of lines) {
    const area = rl(namespace, `${id}/${entry.path}`);
    const reward = rewardOf(entry.path);
    elements.push(
      element(
        area,
        GAME_KINDS.area,
        {
          name: entry.title,
          dimension: 'minecraft:overworld',
          from: [entry.x - 2, -64, -2],
          to: [entry.x + 2, 319, 2],
        },
        `${entry.title}: a column five blocks wide through the whole height of the overworld, ${entry.x === 0 ? 'at the spawn' : `${entry.x} blocks east of the spawn`}. Its tick function tags the players inside, and the line's advancement tests that tag, so moving the area in the Area Studio moves the line. Move it onto your course.`,
      ),
      element(
        line(entry.path),
        KINDS.advancement,
        {
          criteria: { reached: inAreaCriterion(area) },
          rewards: { function: reward },
        },
        `The ${entry.title.toLowerCase()} line, hidden (no display): granted when a player stands in ${area} (the entity tag its tick function gives the players inside), it runs ${reward} as that player.`,
      ),
    );
  }

  const others = lines.filter((entry) => entry.path !== 'start');
  elements.push(
    element(
      fn('started'),
      KINDS.function,
      {
        lines: [
          `# The start line of ${name.display}: run as a runner standing in the start`,
          `function ${gamesFunction(namespace, `timer/${timerPath}/start`)}`,
          ...others.map((entry) => `advancement revoke @s only ${line(entry.path)}`),
          `advancement revoke @s only ${line('start')}`,
        ],
      },
      "Starts the clock afresh while a runner stands in the start, and takes back the lines' advancements so they fire again this run; it takes back its own last, so it fires again a moment later while the runner is still there. The clock therefore runs from the moment they leave.",
    ),
  );
  for (const entry of others.filter((other) => other.path !== 'finish')) {
    elements.push(
      element(
        fn(`passed_${entry.path}`),
        KINDS.function,
        { lines: [`tellraw @s {"text":"${entry.title}","color":"aqua"}`] },
        `Says "${entry.title}" in the runner's chat when they pass it.`,
      ),
    );
  }
  const finished = [
    `# The finish line of ${name.display}: run as the runner, only while the clock runs`,
    `execute unless score ${clock}.on ${timers} matches 1 run return 0`,
    `function ${gamesFunction(namespace, `timer/${timerPath}/stop`)}`,
    'title @s title {"text":"Finished!","color":"gold"}',
    `title @s subtitle [{"score":{"name":"${clock}","objective":"${timers}"}},{"text":" ${down ? 'seconds left' : 'seconds'}"}]`,
  ];
  if (best) {
    finished.push(
      `execute unless score @s ${bestName} matches 1.. run scoreboard players operation @s ${bestName} = ${clock} ${timers}`,
      `scoreboard players operation @s ${bestName} ${down ? '>' : '<'} ${clock} ${timers}`,
    );
  }
  elements.push(
    element(
      fn('finished'),
      KINDS.function,
      { lines: finished },
      `Run when a runner reaches the finish, while the clock runs: stops it and shows the ${down ? 'time left' : 'time'}${best ? `, and keeps it in ${bestName} when it is ${down ? 'more than' : 'less than'} their best so far` : ''}.`,
    ),
    element(
      timer,
      GAME_KINDS.timer,
      {
        name: down ? 'Time left' : 'Time',
        seconds,
        count: down ? 'down' : 'up',
        show: 'action_bar',
        colour: 'white',
        repeat: false,
        starts: 'manual',
        ...(down ? { on_end: fn('time_up') } : {}),
      },
      down
        ? `The race's time limit: ${seconds} seconds counting down on the action bar, started by the start line; when the time is up it runs ${fn('time_up')}.`
        : 'The race clock: a stopwatch counting the seconds up on the action bar (up to an hour), started by the start line and stopped at the finish.',
    ),
  );
  if (down) {
    elements.push(
      element(
        fn('time_up'),
        KINDS.function,
        { lines: ['title @a title {"text":"Time is up!","color":"red"}'] },
        'Run by the timer when the time limit is up: tells everyone.',
      ),
    );
  }
  if (best) {
    elements.push(
      element(
        bestObjective,
        GAME_KINDS.objective,
        { criterion: 'dummy', name: 'Best time', display: 'sidebar', render: 'integer' },
        `Each runner's best ${down ? 'time left' : 'time'} in seconds, on the sidebar, kept by the finish line's function.`,
      ),
    );
  }
  return { elements, assets: [] };
}
