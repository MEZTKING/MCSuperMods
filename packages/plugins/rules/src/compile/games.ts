/**
 * Rules for games (ADR 0115): the names Rules shares with the games kinds' lowering, the
 * command forms its steps, conditions and values write, and the function bridge.
 *
 * Names (the contract with `@msm/plugin-games` of B552, which Rules may not import; each
 * `<path>` of a holder, tag or game name has its `/` written as `.`):
 *
 * - a project team or objective `<ns>:<path>` is the game's `<ns>.<path>`; a plain name is used
 *   as it is;
 * - a player in a project area carries the entity tag `<ns>.area.<path>`;
 * - a project timer keeps on the objective `<ns>.msm_timers` the holders `#<path>` (seconds left
 *   counting down, seconds gone counting up) and `#<path>.on` (1 while it runs), and has the
 *   functions `<ns>:msm_games/timer/<path>/start` and `/stop`;
 * - a project area has `<ns>:msm_games/area/<path>/clear` and, with `reset`, `/reset`;
 * - a project one block keeps its phase, from 0, as `#<path>.phase` on `<ns>.msm_one_block`;
 * - a project game (B724) has the functions `<ns>:msm_games/game/<path>/start` and `/end` (run
 *   by the server; `end` makes the players tagged `<ns>.game.<dotted path>.winner` win) and
 *   `/out` (run as a player: puts them out of the round); a player still in its round carries
 *   the tag `<ns>.game.<dotted path>.in`; with the `hearts` mechanic (B725) a player's hearts
 *   are their score on `<ns>.msm_hearts` and `/hearts/apply`, run as them, sets their most
 *   health from it;
 * - a project kit (B724) has `<ns>:msm_games/kit/<path>/give`, run as the player who gets it.
 *
 * The function bridge (ADR 0115 D5, as built): the games kinds' functions run hook function
 * tags, empty and merged (`merge: 'tag'`): `#<ns>:msm_games/area/<path>/entered` and `/left`
 * (as the player), `#<ns>:msm_games/timer/<path>/ended` and
 * `#<ns>:msm_games/one_block/<path>/broken` (from the server, before the break is counted), and
 * a game's `#<ns>:msm_games/game/<path>/started` and `/ended` (from the server, B724).
 * When a rule listens, the rule book's lowering writes the same tag with an optional entry, the
 * function `<ns>:msm_rules/signal/<kind>/<path>/<event>`, whose one line runs the project's
 * signal command `/msm_signal_<host ns> <word>` (`<host ns>:msm_signal`, permission 2, one
 * `word` argument `signal`); its Script API `command` event fires the rules. A rule on one phase
 * of a one block gets its own function, `.../broken/<phase>`, whose line runs the command only
 * `execute if score` the one block is in that phase. The word is `<event><phase>+<ns>+<path>`
 * with each `/` of the path written as `+`.
 *
 * Command text comes from `TargetFacts.commands.forms` (plugin API 1.22.0), the five forms
 * Rules once kept as its own fallbacks (`if_entity`, `if_score_run`, `set_world_spawn`,
 * `spawn_point`, `set_fire`) included since plugin API 1.26.0.
 */
import type { CommandFormName, TargetFacts } from '@msm/plugin-api';
import type { SignalName } from '../catalogue';

const pathOf = (id: string): string => id.slice(id.indexOf(':') + 1);
const namespaceOf = (id: string): string => id.slice(0, id.indexOf(':'));
const dotted = (path: string): string => path.replaceAll('/', '.');

/** The game's name of a team or objective: `<ns>.<path>` for a project id, else as given. */
export function gameName(id: string): string {
  if (!id.includes(':')) return id;
  return `${namespaceOf(id)}.${dotted(pathOf(id))}`;
}

/** The entity tag a player in a project area carries: `<ns>.area.<path>`. */
export const areaTag = (areaId: string): string =>
  `${namespaceOf(areaId)}.area.${dotted(pathOf(areaId))}`;

/** A function of a project timer (`start` or `stop`). */
export const timerFunction = (timerId: string, part: 'start' | 'stop'): string =>
  `${namespaceOf(timerId)}:msm_games/timer/${pathOf(timerId)}/${part}`;

/** The objective of a namespace's timers: `<ns>.msm_timers`. */
export const timersObjective = (timerId: string): string => `${namespaceOf(timerId)}.msm_timers`;

/** A timer's score holder: `#<path>` (its time) or `#<path>.on` (1 while it runs). */
export const timerHolder = (timerId: string, on = false): string =>
  `#${dotted(pathOf(timerId))}${on ? '.on' : ''}`;

/** A function of a project area: `reset` (with `reset` data) or `clear`. */
export const areaFunction = (areaId: string, part: 'reset' | 'clear'): string =>
  `${namespaceOf(areaId)}:msm_games/area/${pathOf(areaId)}/${part}`;

/** The objective of a namespace's one blocks: `<ns>.msm_one_block`. */
export const oneBlockObjective = (id: string): string => `${namespaceOf(id)}.msm_one_block`;

/** A one block's phase holder, its phase counted from 0: `#<path>.phase`. */
export const oneBlockPhaseHolder = (id: string): string => `#${dotted(pathOf(id))}.phase`;

/** A function of a project game: `start`, `end`, `out` or `hearts/apply` (B724, B725). */
export const gameFunction = (
  gameId: string,
  part: 'start' | 'end' | 'out' | 'hearts/apply',
): string => `${namespaceOf(gameId)}:msm_games/game/${pathOf(gameId)}/${part}`;

/** An entity tag of a project game: `<ns>.game.<dotted path>.<name>` (`in`, `winner`). */
export const gameTag = (gameId: string, name: 'in' | 'winner'): string =>
  `${namespaceOf(gameId)}.game.${dotted(pathOf(gameId))}.${name}`;

/** The hearts objective of a game's namespace (the `hearts` mechanic): `<ns>.msm_hearts`. */
export const heartsObjective = (gameId: string): string => `${namespaceOf(gameId)}.msm_hearts`;

/** The function of a project kit that gives it to `@s`: `<ns>:msm_games/kit/<path>/give`. */
export const kitGiveFunction = (kitId: string): string =>
  `${namespaceOf(kitId)}:msm_games/kit/${pathOf(kitId)}/give`;

/** The attribute "Set most hearts" changes without a game: two points of it are one heart. */
export const MOST_HEALTH_ATTRIBUTE = 'minecraft:max_health';

/** The path of the signal command in its namespace: the command is `<ns>:msm_signal`. */
export const SIGNAL_COMMAND_PATH = 'msm_signal';
/** The name of the signal command's one argument (a `word`). */
export const SIGNAL_ARGUMENT = 'signal';
/** The permission level of the signal command: operators, functions and command blocks. */
export const SIGNAL_PERMISSION = 2;

/** The signal command's id for the project whose host namespace is `namespace`. */
export const signalCommandId = (namespace: string): string => `${namespace}:${SIGNAL_COMMAND_PATH}`;

/** The signal command's literal: `msm_signal_<namespace>`, other characters as `_`. */
export function signalLiteral(namespace: string): string {
  return `msm_signal_${namespace.replace(/[^a-z0-9_]/g, '_')}`.slice(0, 64);
}

/** One thing a games kind's function signals, as the bridge names it. */
export interface Signal {
  /** The games element (an area, timer or one block). */
  readonly subject: string;
  /** What happened. */
  readonly on: SignalName;
  /** The one block's phase, from 1; absent for every phase. */
  readonly phase?: number;
}

/** The hook folder and name of each signal (B552's hook tags). */
const HOOKS: Readonly<Record<SignalName, { folder: string; hook: string }>> = {
  enter: { folder: 'area', hook: 'entered' },
  leave: { folder: 'area', hook: 'left' },
  end: { folder: 'timer', hook: 'ended' },
  break: { folder: 'one_block', hook: 'broken' },
  game_start: { folder: 'game', hook: 'started' },
  game_end: { folder: 'game', hook: 'ended' },
};

/** The hook tag a games kind's function runs: `#<ns>:msm_games/<kind>/<path>/<hook>`. */
export function signalTagId(signal: Signal): string {
  const { folder, hook } = HOOKS[signal.on];
  return `${namespaceOf(signal.subject)}:msm_games/${folder}/${pathOf(signal.subject)}/${hook}`;
}

/** The rule book's function in that tag: `<ns>:msm_rules/signal/<kind>/<path>/<hook>[/<phase>]`. */
export function signalFunctionId(signal: Signal): string {
  const { folder, hook } = HOOKS[signal.on];
  const phase = signal.phase === undefined ? '' : `/${signal.phase}`;
  return `${namespaceOf(signal.subject)}:msm_rules/signal/${folder}/${pathOf(signal.subject)}/${hook}${phase}`;
}

/** The signal command's word: `<signal><phase>+<ns>+<path>`, each `/` of the path as `+`. */
export const signalWord = (signal: Signal): string =>
  `${signal.on}${signal.phase ?? ''}+${namespaceOf(signal.subject)}+${pathOf(signal.subject).replaceAll('/', '+')}`;

/** Every form name Rules writes. */
export type RulesFormName = CommandFormName;

/** The template of `name` on `target`, or undefined when the target has no game kit forms. */
export function commandForm(target: TargetFacts, name: RulesFormName): string | undefined {
  return target.commands?.forms?.[name];
}

/**
 * The forms each new catalogue entry writes (ADR 0115 D1 to D3), by entry id: what the rules
 * tests fill and check with the offline checker on both targets.
 */
export const RULES_ENTRY_FORMS: Readonly<Record<string, readonly RulesFormName[]>> = Object.freeze({
  drop_loot: ['loot_spawn'],
  give_loot: ['loot_give'],
  place_structure: ['place_template'],
  join_team: ['team_join'],
  leave_team: ['team_leave'],
  set_score: ['score_set'],
  add_to_score: ['score_add'],
  set_world_spawn: ['set_world_spawn'],
  set_spawn_point: ['spawn_point'],
  set_on_fire: ['set_fire'],
  set_world_border: ['worldborder_set', 'worldborder_set_over_seconds', 'worldborder_center'],
  in_area: ['if_entity'],
  on_team: ['if_entity'],
  score_at_least: ['score_get'],
  score: ['score_get'],
  team_size: ['if_entity'],
  timer_running: ['score_get'],
  timer_left: ['score_get'],
  one_block_broken: ['if_score_run'],
  // Rules 4 for games (B729).
  set_most_hearts: ['score_set', 'run_function', 'attribute_base_set'],
  add_most_hearts: [
    'score_add',
    'score_remove',
    'if_score_run',
    'run_function',
    'attribute_base_set',
  ],
  give_kit: ['run_function'],
  take_out_of_game: ['run_function'],
  start_game: ['run_function'],
  end_game: ['tag_add', 'run_function'],
  only_one_left: ['if_entity'],
});

/** A piece of command text: literal words, or a TypeScript expression of a string or number. */
export type Piece = { readonly text: string } | { readonly code: string };

const PLACEHOLDER = /<([a-z0-9_]+)>|\[([a-z0-9_]+)\]/g;

/**
 * Fills a form: every `<name>` with its piece, every `[name]` with its piece when given (and
 * left out, with the space before it, when not). Returns undefined when a required piece is
 * missing. The form's words are never changed.
 */
export function fillForm(
  form: string,
  values: Readonly<Record<string, Piece | undefined>>,
): Piece[] | undefined {
  const pieces: Piece[] = [];
  let last = 0;
  let missing = false;
  for (const match of form.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0;
    let literalText = form.slice(last, index);
    last = index + match[0].length;
    const required = match[1];
    const name = required ?? match[2] ?? '';
    const value = values[name];
    if (value === undefined) {
      if (required !== undefined) missing = true;
      // An optional part left out takes the space before it.
      if (literalText.endsWith(' ')) literalText = literalText.slice(0, -1);
      if (literalText.length > 0) pieces.push({ text: literalText });
      continue;
    }
    if (literalText.length > 0) pieces.push({ text: literalText });
    pieces.push(value);
  }
  if (missing) return undefined;
  const tail = form.slice(last);
  if (tail.length > 0) pieces.push({ text: tail });
  return pieces;
}

/** The command text of pieces that are all literal words, or undefined. */
export function piecesText(pieces: readonly Piece[]): string | undefined {
  let text = '';
  for (const piece of pieces) {
    if (!('text' in piece)) return undefined;
    text += piece.text;
  }
  return text;
}
