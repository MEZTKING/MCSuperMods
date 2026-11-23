/**
 * The helpers every part of a game's lowering writes its lines with (B724): the game read once
 * ({@link GameModel}), its names ({@link GameNames}) and short ways to fill the target's command
 * forms (`target.commands.forms`, plugin API 1.22.0 to 1.27.0). Every command goes through
 * {@link fillForm}; nothing here writes command text of its own.
 */
import type {
  CommandFormName,
  Element,
  OutputFile,
  ResourceLocation,
  TargetFacts,
} from '@msm/plugin-api';
import {
  fillForm,
  functionFile,
  hookTagFile,
  runHook,
  textComponent,
} from '../shared-functions';
import type { GameLoweringContext } from './mechanics/index';
import {
  GAME_STATES,
  type GameHook,
  type GameModel,
  type GameNames,
  gameNames,
  readGame,
} from './names';

/** A round's state by name. */
export type GameState = keyof typeof GAME_STATES;

/** What a part of a game's lowering writes with. */
export interface GameBuild {
  readonly game: GameModel;
  readonly names: GameNames;
  readonly target: TargetFacts;
  /** Fills one of the target's command forms. */
  form(name: CommandFormName, values: Readonly<Record<string, string | number | boolean>>): string;
  /** The line that runs the game's function `name`. */
  run(name: string): string;
  /** The line that runs a function by id (or a `#` tag). */
  runId(id: ResourceLocation | string): string;
  /** The line that runs the game's hook tag. */
  hook(hook: GameHook): string;
  /** `command` when the round is in `state` (or one of the states of a range such as `0..1`). */
  ifState(state: GameState | string, command: string): string;
  /** Sets a holder of the game on its objective. */
  setHolder(name: string, score: number): string;
  /**
   * Counts `entities` into a holder of the game: set to 0 first, so the count is 0 when none
   * is found whatever `execute store` does with a test that fails.
   */
  count(name: string, entities: string): string[];
  /** A tellraw of a plain text to `players`. */
  say(players: string, text: string): string;
  /** The game's function file `name`. */
  file(name: string, lines: readonly string[]): OutputFile;
  /** The game's hook tag file, empty or with `values`. */
  hookFile(hook: GameHook, values?: readonly string[]): OutputFile;
}

const cache = new WeakMap<Element, WeakMap<TargetFacts, GameBuild>>();

/** The build helpers of the game being lowered (made once per element and target). */
export function gameBuild(context: GameLoweringContext): GameBuild {
  const { element, target } = context;
  const byTarget = cache.get(element) ?? new WeakMap<TargetFacts, GameBuild>();
  cache.set(element, byTarget);
  const known = byTarget.get(target);
  if (known !== undefined) return known;
  const game = readGame(element);
  const names = gameNames(game.namespace, game.path);
  const form: GameBuild['form'] = (name, values) => fillForm(target, name, values);
  const build: GameBuild = {
    game,
    names,
    target,
    form,
    run: (name) => form('run_function', { function: names.fn(name) }),
    runId: (id) => form('run_function', { function: id }),
    hook: (hook) => runHook(target, game.namespace, names.path(hook)),
    ifState: (state, command) =>
      form('if_score_run', {
        holder: names.holder('state'),
        objective: names.objective,
        range: state in GAME_STATES ? GAME_STATES[state as GameState] : state,
        command,
      }),
    setHolder: (name, score) =>
      form('score_set', { holders: names.holder(name), objective: names.objective, score }),
    count: (name, entities) => [
      form('score_set', { holders: names.holder(name), objective: names.objective, score: 0 }),
      form('store_result_score_if_entity', {
        holder: names.holder(name),
        objective: names.objective,
        entities,
      }),
    ],
    say: (players, text) => form('tellraw', { players, text: textComponent(text) }),
    file: (name, lines) => functionFile(target, game.namespace, names.path(name), lines),
    hookFile: (hook, values = []) => hookTagFile(target, game.namespace, names.path(hook), values),
  };
  byTarget.set(target, build);
  return build;
}
