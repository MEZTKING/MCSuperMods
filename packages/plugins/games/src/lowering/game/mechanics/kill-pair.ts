/**
 * The shared `kill_pair` piece of `msm:game` (ADR 0132 D2 as amended by B720 K3; B725): who
 * killed whom, for the mechanics that move something from a player's killer to the player
 * (`hearts`). And the few names and helpers the mechanics of B725 share.
 *
 * **The route (B725's choice, recorded in ADR 0132's findings).** B720 measured two advancement
 * triggers, but only one of them as a filter: the killer's `minecraft:player_killed_entity` with
 * the 26.x one-condition `entity` form (`TargetFacts.dataForms.player_killed_entity` and
 * `entity_is_type`, plugin API 1.27.0). The victim's `minecraft:entity_killed_player` was written
 * under `killing_entity`, which is not a field of that criterion (the vendored mcdoc's field is
 * `entity`), so its condition was never shown to filter, and B723 left it out of the facts. So
 * the pair is made from what was measured:
 *
 * - the killer's advancement `<ns>:msm_games/game/<path>/kill_pair` fires as the killer, at the
 *   killer, inside the victim's death: the victim's `deathCount` is already counted (K3: the
 *   victim's reward runs first with its deaths at 1, then the killer's), and the round engine has
 *   not yet seen it (it reads `<ns>.msm_deaths` in the next tick function and sets it back to 0);
 * - its reward (`kill_pair/killer`) revokes the advancement to arm it again and, while a round is
 *   played and the killer is in it, tags the victim `killed`: the nearest player in the round
 *   whose death the round engine has not yet seen and who is not already tagged;
 * - then it runs the hook `#<ns>:msm_games/game/<path>/kill_pair/scored` as the killer (the
 *   mechanics add their killer's side to it), while the victim also carries the tag `victim`;
 * - the victim's side runs in the round's own hook `player_died` (as the victim), where a player
 *   tagged `killed` was killed by a player; a mechanic removes the tag there when it is done.
 *
 * Limit: when two players die in the same tick, one by another player and one not, the one
 * nearer the killer counts as the kill. Every other death is paired exactly.
 *
 * **Names.** A game's names and its hooks are the round engine's (`../names.ts`, `../build.ts`,
 * B724); {@link mechanicBuild} adds the few things the mechanics write besides: their own
 * objectives (`<ns>.msm_<name>`), storages, hook tags, load functions and JSON files.
 */
import type {
  CommandFormName,
  DataFormName,
  Element,
  Json,
  JsonObject,
  OutputFile,
  ResourceLocation,
  TargetFacts,
} from '@msm/plugin-api';
import {
  fillForm,
  GAMES_FUNCTION_ROOT,
  GamesLoweringError,
  gamesFunctionId,
  hookTagFile,
  isRecord,
  sharedFunctionFiles,
  splitId,
  textComponent,
} from '../../shared-functions';
import { type GameBuild, gameBuild } from '../build';
import { type GameHook, type GameModel, type GameNames, gameNames } from '../names';
import type { GameLoweringContext } from './index';

/** What a mechanic writes with: the round engine's {@link GameBuild} and a few additions. */
export interface MechanicBuild extends GameBuild {
  /** The game's namespace. */
  readonly namespace: string;
  /** The line that runs a hook tag of the game: a round hook or a mechanic's own. */
  hookOf(name: GameHook | string): string;
  /** `command` while a round is played. */
  ifPlaying(command: string): string;
  /** `command` when a holder of the game's objective matches `range`. */
  ifHolder(name: string, range: string, command: string): string;
  /** A tellraw of a text component (JSON) to `players`. */
  tell(players: string, text: Json): string;
  /** The game's function `name` added to the hook `hook` (a merged tag file). */
  onHook(hook: GameHook | string, name: string): OutputFile;
  /** The game's hook tag `hook`, empty: a mechanic's own hook, for others to fill. */
  ownHookFile(hook: string): OutputFile;
  /** A function of the game run at every load (it joins the plugin's `load` tag). */
  loadFiles(name: string, lines: readonly string[]): OutputFile[];
  /** A JSON file of the game: `data/<ns>/<folder>/msm_games/game/<path>/<name>.json`. */
  jsonFile(folder: 'advancement' | 'recipe', name: string, contents: Json): OutputFile;
  /** The id of that JSON file. */
  jsonId(name: string): ResourceLocation;
  /** A storage of the game: `<ns>:msm_games/game/<path>/<name>`. */
  storage(name: string): ResourceLocation;
  /** A generated objective of the namespace: `<ns>.msm_<name>`. */
  objectiveOf(name: string): string;
}

/** The objective a mechanic's own objective `name` gets: `<ns>.msm_<name>`. */
export const mechanicObjective = (namespace: string, name: string): string =>
  `${namespace}.msm_${name}`;

/** The build helpers of the game being lowered. */
export function mechanicBuild(context: GameLoweringContext): MechanicBuild {
  const base = gameBuild(context);
  const { names, target, game } = base;
  const namespace = game.namespace;
  const form = (
    name: CommandFormName,
    values: Readonly<Record<string, string | number | boolean>>,
  ): string => fillForm(target, name, values);
  const ifHolder = (name: string, range: string, command: string): string =>
    form('if_score_run', {
      holder: names.holder(name),
      objective: names.objective,
      range,
      command,
    });
  return {
    ...base,
    namespace,
    hookOf: (name) => form('run_function', { function: `#${names.fn(name)}` }),
    ifPlaying: (command) => base.ifState('playing', command),
    ifHolder,
    tell: (players, text) => form('tellraw', { players, text: JSON.stringify(text) }),
    onHook: (hook, name) => hookTagFile(target, namespace, names.path(hook), [names.fn(name)]),
    ownHookFile: (hook) => hookTagFile(target, namespace, names.path(hook)),
    loadFiles: (name, lines) =>
      sharedFunctionFiles(target, namespace, [{ phase: 'load', path: names.path(name), lines }]),
    jsonFile: (folder, name, contents) => ({
      path: `data/${namespace}/${target.folders.data[folder]}/${GAMES_FUNCTION_ROOT}/game/${game.path}/${name}.json`,
      contents,
      layer: 'datapack',
      schema: `resource:${folder}`,
    }),
    jsonId: (name) => names.fn(name),
    storage: (name) => names.fn(name),
    objectiveOf: (name) => mechanicObjective(namespace, name),
  };
}

/** The game model and names of the game being lowered, for checks and generated ids. */
export type { GameModel, GameNames };

/**
 * Fills one of the target's data forms (`TargetFacts.dataForms`, plugin API 1.27.0): every JSON
 * string whose whole text is `<name>` becomes `values[name]`.
 *
 * @throws {@link GamesLoweringError} If the target has no such form or a value is missing.
 */
export function fillDataForm(
  target: TargetFacts,
  name: DataFormName,
  values: Readonly<Record<string, Json>>,
): Json {
  const form = target.dataForms?.[name];
  if (form === undefined) {
    throw new GamesLoweringError(
      `The target ${target.id} has no data form "${name}" (plugin API 1.27.0), so the game cannot be lowered for it.`,
    );
  }
  const fill = (value: Json): Json => {
    if (typeof value === 'string') {
      const key = /^<([a-z0-9_]+)>$/.exec(value)?.[1];
      if (key === undefined) return value;
      const filled = values[key];
      if (filled === undefined) {
        throw new GamesLoweringError(`The data form "${name}" needs a value for <${key}>.`);
      }
      return filled;
    }
    if (Array.isArray(value)) return value.map(fill);
    if (isRecord(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fill(item)]));
    }
    return value;
  };
  return fill(form);
}

/** An advancement whose one criterion is `criterion` and whose reward runs `reward`. */
export const advancementOf = (
  criterionName: string,
  criterion: Json,
  reward: ResourceLocation,
): Json => ({ criteria: { [criterionName]: criterion }, rewards: { function: reward } });

/** The tag of a player killed by another player this tick, until a mechanic has paid for it. */
export const KILLED_TAG = 'killed';

/** The tag of the player being paired, only while the hook {@link SCORED_HOOK} runs. */
export const VICTIM_TAG = 'victim';

/** The mechanic's own hook run as the killer once a pair is made. */
export const SCORED_HOOK = 'kill_pair/scored';

/** The name of the kill pair's advancement (and of its file below the game's folder). */
export const KILL_PAIR_ADVANCEMENT = 'kill_pair';

/** The selector of the player a kill is paired with, from the killer's place. */
export const victimSelector = (names: GameNames): string =>
  `@a[tag=${names.tag('in')},tag=!${names.tag(KILLED_TAG)},scores={${names.deaths}=1..},sort=nearest,limit=1]`;

/**
 * The kill pair's files: the advancement, the killer's reward, the pairing, the hook
 * `kill_pair/scored` (empty, for the mechanics to fill) and the line that clears the tag at the
 * start of a round. A game lowers them once, from the one mechanic that needs them.
 */
export function killPairFiles(build: MechanicBuild): OutputFile[] {
  const { names, target, form } = build;
  const killed = names.tag(KILLED_TAG);
  const advancement = build.jsonId(KILL_PAIR_ADVANCEMENT);
  const criterion = fillDataForm(target, 'player_killed_entity', {
    entity_condition: fillDataForm(target, 'entity_is_type', { entity_type: 'minecraft:player' }),
  });
  const killer = [
    form('advancement_revoke_only', { players: '@s', advancement }),
    build.ifPlaying(build.run('kill_pair/in_round')),
  ];
  const inRound = [
    form('if_entity_run', {
      entities: `@s[tag=${names.tag('in')}]`,
      command: build.run('kill_pair/pair'),
    }),
  ];
  const victim = victimSelector(names);
  const victimNow = names.tag(VICTIM_TAG);
  const pair = [
    build.setHolder('kill_paired', 0),
    form('store_result_score_if_entity', {
      holder: names.holder('kill_paired'),
      objective: names.objective,
      entities: victim,
    }),
    form('tag_add', { entities: victim, tag: victimNow }),
    form('tag_add', { entities: `@a[tag=${victimNow}]`, tag: killed }),
    build.ifHolder('kill_paired', '1..', build.hookOf(SCORED_HOOK)),
    form('tag_remove', { entities: '@a', tag: victimNow }),
  ];
  const clear = [form('tag_remove', { entities: '@a', tag: killed })];
  return [
    build.jsonFile(
      'advancement',
      KILL_PAIR_ADVANCEMENT,
      advancementOf('killed_player', criterion, build.names.fn('kill_pair/killer')),
    ),
    build.file('kill_pair/killer', killer),
    build.file('kill_pair/in_round', inRound),
    build.file('kill_pair/pair', pair),
    build.file('kill_pair/clear', clear),
    build.onHook('starting', 'kill_pair/clear'),
    build.ownHookFile(SCORED_HOOK),
  ];
}

/** The text of `count` hearts: "a heart", "2 hearts". */
export const heartsText = (count: number): string => (count === 1 ? 'a heart' : `${count} hearts`);

/** A plain text component with `extra` fields, as JSON text. */
export const plain = (text: string, extra: Record<string, Json> = {}): string =>
  textComponent(text, extra);

/** A custom data key unique to the namespace: `msm_<what>_<ns with non-word characters as _>`. */
export const customDataKey = (namespace: string, what: string): string =>
  `msm_${what}_${namespace.replace(/[^a-z0-9_]/g, '_')}`;

/** An item argument with components, written in order: `item[a=b,c=d]`. */
export const itemWith = (
  item: string,
  components: readonly (readonly [string, string])[],
): string =>
  components.length === 0
    ? item
    : `${item}[${components.map(([name, value]) => `${name}=${value}`).join(',')}]`;

/**
 * The ids a mechanic's files declare, by the categories of the games plugin's generated ids
 * (`gamesGeneratedIds`): `function`, `tag/function`, `advancement`, `recipe`, and the plain names
 * `objective` and `tag` their lines make. Sorted, without duplicates.
 */
export function generatedIdsOf(
  files: readonly OutputFile[],
  target: TargetFacts,
): Record<string, string[]> {
  const ids = new Map<string, Set<string>>();
  const add = (category: string, id: string): void => {
    const set = ids.get(category) ?? new Set<string>();
    set.add(id);
    ids.set(category, set);
  };
  const { data } = target.folders;
  const folders: readonly [string, string][] = [
    ['tag/function', `${data.tags}/${data.function}`],
    ['function', data.function],
    ['advancement', data.advancement],
    ['recipe', data.recipe],
  ];
  for (const file of files) {
    const match = /^data\/([^/]+)\/(.+)\.(json|mcfunction)$/.exec(file.path);
    if (match === null) continue;
    const [, namespace, rest] = match as unknown as [string, string, string];
    const found = folders.find(([, folder]) => rest.startsWith(`${folder}/`));
    if (found !== undefined) add(found[0], `${namespace}:${rest.slice(found[1].length + 1)}`);
    if (file.language !== 'mcfunction' || !(file.contents instanceof Uint8Array)) continue;
    for (const line of new TextDecoder().decode(file.contents).split('\n')) {
      for (const objective of line.matchAll(/scoreboard objectives add (\S+)/g)) {
        add('objective', objective[1] as string);
      }
      for (const tag of line.matchAll(/\btag \S+ (?:add|remove) (\S+)/g))
        add('tag', tag[1] as string);
    }
  }
  return Object.fromEntries(
    [...ids]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([category, set]) => [category, [...set].sort()]),
  );
}

/** The ids one mechanic of a game writes, by the categories of {@link generatedIdsOf}. */
export type MechanicIds = (mechanic: JsonObject, element: Element) => Record<string, string[]>;

/** Collects ids by category, then gives them sorted and without duplicates. */
export class IdList {
  private readonly ids = new Map<string, Set<string>>();

  /** Adds `ids` to `category`. */
  add(category: string, ...ids: readonly string[]): this {
    const set = this.ids.get(category) ?? new Set<string>();
    for (const id of ids) set.add(id);
    this.ids.set(category, set);
    return this;
  }

  /** The ids, by category in order, each list sorted. */
  done(): Record<string, string[]> {
    return Object.fromEntries(
      [...this.ids]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([category, set]) => [category, [...set].sort()]),
    );
  }
}

/** The names of a game element, for its mechanics' generated ids. */
export function namesOf(element: Element): GameNames & { readonly namespace: string } {
  const { namespace, path } = splitId(element.id);
  return { ...gameNames(namespace, path), namespace };
}

/**
 * Adds the ids the shared parts write: the game's functions `names` (below
 * `<ns>:msm_games/game/<path>/`), its hook tags `hooks`, and the plugin's `load` tags when
 * `load` is set.
 */
export function addGameIds(
  list: IdList,
  names: GameNames & { readonly namespace: string },
  functions: readonly string[],
  hooks: readonly string[],
  load = false,
): IdList {
  list.add('function', ...functions.map((name) => names.fn(name)));
  list.add('tag/function', ...hooks.map((hook) => names.fn(hook)));
  if (load) list.add('tag/function', gamesFunctionId(names.namespace, 'load'), 'minecraft:load');
  return list;
}

/** The functions, hooks and tags of the kill pair. */
export function addKillPairIds(
  list: IdList,
  names: GameNames & { readonly namespace: string },
): void {
  addGameIds(
    list,
    names,
    ['kill_pair/killer', 'kill_pair/in_round', 'kill_pair/pair', 'kill_pair/clear'],
    ['starting', SCORED_HOOK],
  );
  list.add('advancement', names.fn(KILL_PAIR_ADVANCEMENT));
  list.add('tag', names.tag(KILLED_TAG), names.tag(VICTIM_TAG));
}
