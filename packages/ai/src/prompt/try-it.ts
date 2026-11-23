/**
 * The Try it topic (B402; made true by B682, F8 d): what the in-app preview can and cannot show,
 * so the helper never calls it a proof. Its commands and functions are B606's: the chat box runs
 * the game's own commands and the project's functions, and an event's run_function runs its
 * function (B613). Every list and number is a constant the app's truth test (B683) pins to
 * `@msm/sim` and the Try it view.
 */
import { countWord, list, quoted } from './core';

/** The area's size in blocks (`AREA_SIZE_X`, `AREA_SIZE_Z`, `AREA_SIZE_Y` of `@msm/sim`). */
export const TRY_IT_PROMPT_AREA = Object.freeze({ x: 48, z: 48, y: 32 });

/** The grounds' labels, in the picker's order (`GROUND_CHOICES` of the Try it view). */
export const TRY_IT_PROMPT_GROUNDS = Object.freeze([
  'Grid',
  'Flat world',
  'Quick world',
  'From my world',
  'My world generation',
  'Empty sky',
  'One of my buildings',
]);

/** The tools the paragraph names (the tool strip of the Try it view). */
export const TRY_IT_PROMPT_TOOLS = Object.freeze([
  'Grow',
  'Power',
  'Water',
  'Explode',
  'Lightning',
  'Clear the area',
]);

/** The game's own commands the chat box runs (`VANILLA_COMMANDS` of `@msm/sim`, B606). */
export const TRY_IT_PROMPT_COMMANDS = Object.freeze([
  'clear',
  'clone',
  'data',
  'dialog',
  'effect',
  'execute',
  'fill',
  'function',
  'give',
  'kill',
  'particle',
  'place',
  'playsound',
  'random',
  'return',
  'say',
  'schedule',
  'scoreboard',
  'setblock',
  'summon',
  'tag',
  'teleport',
  'tellraw',
  'time',
  'title',
  'tp',
]);

/** The most commands one tick runs (`TICK_COMMAND_CAP` of `@msm/sim`). */
export const TRY_IT_PROMPT_TICK_COMMANDS = 10_000;

/** The longest a script call may take, in seconds (`SCRIPT_BUDGET_MS` of the script worker). */
export const TRY_IT_PROMPT_SCRIPT_SECONDS = 2;

/** The labels the paragraph quotes (the toolbar, the strip and the log of the Try it view). */
export const TRY_IT_PROMPT_LABELS = Object.freeze({
  button: 'Try it',
  play: 'Play in Minecraft',
  log: 'What happened',
  onlyInMinecraft: 'Only in Minecraft',
  runEveryTime: 'Run every time',
});

const L = TRY_IT_PROMPT_LABELS;
const A = TRY_IT_PROMPT_AREA;

export const TRY_IT = `- Try it (the "${L.button}" button in the toolbar, or F6) is a small test area inside the app, ${A.x} by ${A.z} blocks and ${A.y} high, run by MSM's own simulation, not Minecraft, on the grounds ${quoted(TRY_IT_PROMPT_GROUNDS)}. It shows how blocks, spawn eggs, particles, portals, vehicles, keys and on-screen elements look and behave roughly. Its ${countWord(TRY_IT_PROMPT_TOOLS.length)} tools are ${quoted(TRY_IT_PROMPT_TOOLS)}: plants grow only with its Grow tool, one bone meal at a time, Power only switches a block's powered or lit look, and its Lightning tool only scrapes blocks that age. "${L.log}" lists what the rules, events, scripts and commands did, and what only the game can do as "${L.onlyInMinecraft}". Its chat box (T, or /) runs the project's commands and of the game's own ${list(TRY_IT_PROMPT_COMMANDS)} (any other command or form is said by name), and it runs the project's functions with macros, the "#minecraft:load" tag at the start and after an edit or "Clear the area", the "#minecraft:tick" tag and schedules, at most ${TRY_IT_PROMPT_TICK_COMMANDS} commands a tick, in one Overworld with a clear sky and the player's health and hunger fixed; an event's run_function action, so also a plain rule's run_function step, runs the project's function as the event's player, else its mob. It cannot prove a behaviour: mobs only wander (no health, attacks or drops), walking is approximate, redstone, survival, loot, light, flowing liquids and other dimensions are not there, world generation only on "My world generation" (above), Minecraft's own sounds are only named, and scripts and logic rules run in a sandbox where whatever needs the game is only said (a call over ${TRY_IT_PROMPT_SCRIPT_SECONDS} seconds is stopped; a rule's chance follows "${L.runEveryTime}" or a seeded roll). Never tell a user that Try it proved, tested or confirmed a behaviour. Say what it showed, and that the real check is "${L.play}".`;
