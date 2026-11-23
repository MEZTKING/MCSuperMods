/**
 * The mechanic `hearts` of `msm:game` (ADR 0132 D2; B725, the spike's K1 to K6): each player's
 * hearts on a score, the most health set from it by `attribute` through a macro function, hearts
 * moved from a player to their killer by the shared {@link killPairFiles}, the three endings at
 * zero, the Heart item, withdraw by `/trigger` and the revive item. A heart adds room for health,
 * not health (K2: raising the most never heals). Under `<ns>:msm_games/game/<path>/hearts/`:
 *
 * - `load` (every load): the objectives `<ns>.msm_hearts` (shown on the player list),
 *   `<ns>.msm_out_until` (kept out), `<ns>.msm_out_since` (revive) and the trigger
 *   `<ns>.msm_withdraw`;
 * - `apply` and the macro `set` (as a player): the most health from the hearts, never above the
 *   most hearts (K2: `base set` of hearts x 2);
 * - `join` (hook `player_in`): the starting hearts;
 * - `gain` (hook `kill_pair/scored`, as the killer): the hearts of a kill;
 * - `died` (hook `player_died`, as the player): the hearts lost, then `zero` at none left;
 * - `zero`: a spectator until the next round (the round's `out`), kept out for a time of the
 *   server running (K6: game time; the round's `out`, then `return` when the time is up) or a
 *   fresh start with some hearts;
 * - `tick` (hook `tick`): the kept-out clock and the withdraw trigger (K5);
 * - the Heart item: a recipe whose result carries components and an advancement on eating it
 *   (K4), `ate`; `withdraw` and `take` turn a heart into one (never below 1);
 * - the revive item: the same, `revive`, which brings back the player out longest of those
 *   online (K4);
 * - `clear` (hooks `ended` and `stopped`): most health back to 20 and the hearts forgotten.
 */
import type { Json, JsonObject, OutputFile } from '@msm/plugin-api';
import { bool, isRecord, num, str } from '../../shared-functions';
import { GAME_STATES } from '../names';
import type { MechanicLowering } from './index';
import {
  addGameIds,
  addKillPairIds,
  advancementOf,
  customDataKey,
  fillDataForm,
  heartsText,
  IdList,
  itemWith,
  KILLED_TAG,
  killPairFiles,
  type MechanicBuild,
  type MechanicIds,
  mechanicBuild,
  mechanicObjective,
  namesOf,
  plain,
  SCORED_HOOK,
  VICTIM_TAG,
} from './kill-pair';

/** The most health of a player with no hearts mechanic (vanilla's ten hearts). */
export const VANILLA_MOST_HEALTH = 20;

/** The highest score a holder can take, the start of a search for the lowest. */
const MAX_SCORE = 2_147_483_647;

/** A game item read with its defaults. */
interface GameItemSettings {
  readonly item: string;
  readonly name: string;
  readonly model?: string;
  readonly recipe?: { readonly pattern: readonly string[]; readonly key: Record<string, string> };
}

/** A hearts mechanic read with its defaults (the mock-up's Lifesteal). */
export interface HeartsSettings {
  readonly start: number;
  readonly most: number;
  readonly perKill: number;
  readonly otherDeaths: 'lose_heart' | 'keep';
  readonly atZero: 'spectate' | 'kept_out' | 'start_again';
  readonly keptOutSeconds: number;
  readonly startAgainHearts: number;
  readonly heartItem?: GameItemSettings;
  readonly withdraw: boolean;
  readonly revive?: { readonly item: GameItemSettings; readonly hearts: number };
}

const whole = (value: Json | undefined, fallback: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(num(value, fallback))));

function readItem(value: Json | undefined): GameItemSettings | undefined {
  if (!isRecord(value)) return undefined;
  const item = str(value.item, '');
  if (item === '') return undefined;
  const model = str(value.model, '');
  const recipe = isRecord(value.recipe) ? value.recipe : undefined;
  const pattern = Array.isArray(recipe?.pattern)
    ? recipe.pattern.filter((row): row is string => typeof row === 'string')
    : [];
  const key = isRecord(recipe?.key)
    ? Object.fromEntries(
        Object.entries(recipe.key).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};
  return {
    item,
    name: str(value.name, 'Item'),
    ...(model === '' ? {} : { model }),
    ...(pattern.length > 0 ? { recipe: { pattern, key } } : {}),
  };
}

/** Reads a hearts mechanic's settings with the defaults of the mock-up's Lifesteal. */
export function readHearts(mechanic: JsonObject): HeartsSettings {
  const most = whole(mechanic.most, 20, 1, 512);
  const atZero = str(mechanic.at_zero, 'spectate');
  const heartItem = readItem(mechanic.heart_item);
  const revive = isRecord(mechanic.revive) ? mechanic.revive : undefined;
  const reviveItem = readItem(revive?.item);
  return {
    start: Math.min(most, whole(mechanic.start, 10, 1, 512)),
    most,
    perKill: whole(mechanic.per_kill, 1, 1, 100),
    otherDeaths: str(mechanic.other_deaths, 'lose_heart') === 'keep' ? 'keep' : 'lose_heart',
    atZero: atZero === 'kept_out' || atZero === 'start_again' ? atZero : 'spectate',
    keptOutSeconds: whole(mechanic.kept_out_seconds, 3600, 1, 2_592_000),
    startAgainHearts: Math.min(most, whole(mechanic.start_again_hearts, 3, 1, 512)),
    ...(heartItem === undefined ? {} : { heartItem }),
    withdraw: bool(mechanic.withdraw, false) && heartItem !== undefined,
    ...(reviveItem === undefined
      ? {}
      : { revive: { item: reviveItem, hearts: Math.min(most, whole(revive?.hearts, 3, 1, 512)) } }),
  };
}

/** The components of a game item in a command (SNBT), in a fixed order. */
function itemComponents(item: GameItemSettings, dataKey: string): [string, string][] {
  return [
    ['minecraft:custom_name', plain(item.name, { italic: false })],
    ...(item.model === undefined
      ? []
      : ([['minecraft:item_model', JSON.stringify(item.model)]] as [string, string][])),
    ['minecraft:custom_data', `{${dataKey}:1b}`],
    ['minecraft:consumable', '{consume_seconds:1.0f,animation:"eat",has_consume_particles:false}'],
  ];
}

/** The same components in a recipe's result (JSON). */
function resultComponents(item: GameItemSettings, dataKey: string): JsonObject {
  return {
    'minecraft:custom_name': { text: item.name, italic: false },
    ...(item.model === undefined ? {} : { 'minecraft:item_model': item.model }),
    'minecraft:custom_data': { [dataKey]: true },
    'minecraft:consumable': {
      consume_seconds: 1.0,
      animation: 'eat',
      has_consume_particles: false,
    },
  };
}

/** A game item's files: its recipe (if any) and the advancement that sees it eaten. */
function itemFiles(
  build: MechanicBuild,
  item: GameItemSettings,
  dataKey: string,
  name: string,
  reward: string,
): OutputFile[] {
  const files: OutputFile[] = [
    build.jsonFile(
      'advancement',
      name,
      advancementOf(
        'used',
        fillDataForm(build.target, 'consume_item_with_data', {
          item: item.item,
          custom_data: `{${dataKey}:1b}`,
        }),
        build.names.fn(reward),
      ),
    ),
  ];
  if (item.recipe !== undefined) {
    files.push(
      build.jsonFile('recipe', name, {
        type: 'minecraft:crafting_shaped',
        pattern: [...item.recipe.pattern],
        key: { ...item.recipe.key },
        result: { id: item.item, count: 1, components: resultComponents(item, dataKey) },
      }),
    );
  }
  return files;
}

/** Lowers the `hearts` mechanic. */
export const lowerHearts: MechanicLowering = (mechanic, context): OutputFile[] => {
  const settings = readHearts(mechanic);
  const build = mechanicBuild(context);
  const { names, form } = build;
  const hearts = build.objectiveOf('hearts');
  const outUntil = build.objectiveOf('out_until');
  const outSince = build.objectiveOf('out_since');
  const withdraw = build.objectiveOf('withdraw');
  const storage = build.storage('hearts');
  const tag = names.tag;
  const fn = (name: string): string => `hearts/${name}`;
  const run = (name: string): string => build.run(fn(name));
  const ifScore = (range: string, command: string): string =>
    form('if_score_run', { holder: '@s', objective: hearts, range, command });
  const setHearts = (score: number): string =>
    form('score_set', { holders: '@s', objective: hearts, score });
  const ifSelf = (filter: string, command: string): string =>
    form('if_entity_run', { entities: `@s[${filter}]`, command });
  const self = { selector: '@s' };
  const keptOut = settings.atZero === 'kept_out';
  const revive = settings.revive;
  const heartKey = customDataKey(build.namespace, 'heart');
  const reviveKey = customDataKey(build.namespace, 'revive');
  const giveItem = (item: GameItemSettings, key: string): string =>
    form('give', { players: '@s', item: itemWith(item.item, itemComponents(item, key)), count: 1 });

  const load = [
    form('objective_add', {
      objective: hearts,
      criterion: 'dummy',
      display_name: plain('Hearts', { color: 'red' }),
    }),
    form('objective_display', { slot: 'list', objective: hearts }),
  ];
  if (keptOut) load.push(form('objective_add', { objective: outUntil, criterion: 'dummy' }));
  if (revive !== undefined) {
    load.push(form('objective_add', { objective: outSince, criterion: 'dummy' }));
  }
  if (settings.withdraw) {
    load.push(form('objective_add', { objective: withdraw, criterion: 'trigger' }));
  }

  // K2: the most health is hearts x 2 points, set through a macro from storage.
  const apply = [
    ifScore(`${settings.most + 1}..`, setHearts(settings.most)),
    form('store_result_storage_run', {
      storage,
      nbt_path: 'hp',
      scale: 2,
      command: form('score_get', { holder: '@s', objective: hearts }),
    }),
    form('function_with_storage', { function: names.fn(fn('set')), storage }),
  ];
  const set = [
    `$${form('attribute_base_set', { entity: '@s', attribute: 'minecraft:max_health', value: '$(hp)' })}`,
  ];

  const join = [
    setHearts(settings.start),
    form('tag_add', { entities: '@s', tag: tag('hearted') }),
    form('tag_remove', { entities: '@s', tag: tag('ran_out') }),
    ...(keptOut ? [form('tag_remove', { entities: '@s', tag: tag('kept_out') })] : []),
    run('apply'),
  ];

  const gain = [
    form('score_add', { holders: '@s', objective: hearts, score: settings.perKill }),
    run('apply'),
    build.tell('@a', [
      self,
      { text: ` took ${heartsText(settings.perKill)} from ` },
      { selector: `@a[tag=${tag(VICTIM_TAG)}]` },
      { text: '.' },
    ]),
  ];

  const died = [
    ifSelf(
      `tag=${tag(KILLED_TAG)}`,
      form('score_remove', { holders: '@s', objective: hearts, score: settings.perKill }),
    ),
    ...(settings.otherDeaths === 'lose_heart'
      ? [
          ifSelf(
            `tag=!${tag(KILLED_TAG)}`,
            form('score_remove', { holders: '@s', objective: hearts, score: 1 }),
          ),
        ]
      : []),
    form('tag_remove', { entities: '@s', tag: tag(KILLED_TAG) }),
    ifScore('..0', run('zero')),
    ifScore('1..', run('apply')),
  ];

  const stampOutSince =
    revive === undefined
      ? []
      : [
          form('store_result_score_run', {
            holder: '@s',
            objective: outSince,
            command: form('time_query_gametime', {}),
          }),
        ];
  const zero = [setHearts(0), build.tell('@a', [self, { text: ' has no hearts left.' }])];
  if (settings.atZero === 'start_again') {
    zero.push(
      setHearts(settings.startAgainHearts),
      run('apply'),
      build.tell('@s', { text: `You start again with ${heartsText(settings.startAgainHearts)}.` }),
    );
  } else {
    zero.push(form('tag_add', { entities: '@s', tag: tag('ran_out') }), ...stampOutSince);
    if (keptOut) {
      const minutes = Math.ceil(settings.keptOutSeconds / 60);
      zero.push(
        form('tag_add', { entities: '@s', tag: tag('kept_out') }),
        form('store_result_score_run', {
          holder: '@s',
          objective: outUntil,
          command: form('time_query_gametime', {}),
        }),
        form('score_add', {
          holders: '@s',
          objective: outUntil,
          score: settings.keptOutSeconds * 20,
        }),
        build.tell('@s', {
          text: `You are out for ${minutes === 1 ? 'a minute' : `${minutes} minutes`} of play on the server.`,
        }),
      );
    }
    zero.push(build.run('out'));
  }

  const backHearts = settings.startAgainHearts;
  const back = (count: number): string[] => [
    form('tag_remove', { entities: '@s', tag: tag('ran_out') }),
    ...(keptOut ? [form('tag_remove', { entities: '@s', tag: tag('kept_out') })] : []),
    setHearts(count),
    run('apply'),
    build.run('back'),
  ];

  const files: OutputFile[] = [
    ...build.loadFiles(fn('load'), load),
    build.file(fn('apply'), apply),
    build.file(fn('set'), set),
    build.file(fn('join'), join),
    build.onHook('player_in', fn('join')),
    ...killPairFiles(build),
    build.file(fn('gain'), gain),
    build.onHook(SCORED_HOOK, fn('gain')),
    build.file(fn('died'), died),
    build.onHook('player_died', fn('died')),
    build.file(fn('zero'), zero),
  ];

  const tick: string[] = [];
  if (keptOut) {
    tick.push(
      form('store_result_score_run', {
        holder: names.holder('hearts_now'),
        objective: names.objective,
        command: form('time_query_gametime', {}),
      }),
      form('as_if_score_compare_run', {
        entities: `@a[tag=${tag('kept_out')}]`,
        holder: '@s',
        objective: outUntil,
        comparison: '<=',
        holder_2: names.holder('hearts_now'),
        objective_2: names.objective,
        command: run('return'),
      }),
    );
    files.push(
      build.file(fn('return'), [
        ...back(backHearts),
        build.tell('@a', [self, { text: ` is back with ${heartsText(backHearts)}.` }]),
      ]),
    );
  }

  const heart = settings.heartItem;
  if (heart !== undefined) {
    const giveHeart = giveItem(heart, heartKey);
    files.push(
      ...itemFiles(build, heart, heartKey, 'heart', fn('ate')),
      build.file(fn('ate'), [
        form('advancement_revoke_only', { players: '@s', advancement: build.jsonId('heart') }),
        build.ifPlaying(run('ate/playing')),
        form('unless_score_run', {
          holder: names.holder('state'),
          objective: names.objective,
          range: String(GAME_STATES.playing),
          command: giveHeart,
        }),
      ]),
      build.file(fn('ate/playing'), [
        ifSelf(`tag=${tag('in')}`, run('ate/in')),
        ifSelf(`tag=!${tag('in')}`, giveHeart),
      ]),
      build.file(fn('ate/in'), [
        ifScore(`${settings.most}..`, run('ate/full')),
        ifScore(`..${settings.most - 1}`, run('ate/add')),
      ]),
      build.file(fn('ate/full'), [
        giveHeart,
        build.tell('@s', { text: `You already have the most hearts, ${settings.most}.` }),
      ]),
      build.file(fn('ate/add'), [
        form('score_add', { holders: '@s', objective: hearts, score: 1 }),
        run('apply'),
        build.tell('@s', { text: 'You gained a heart.' }),
      ]),
    );
    if (settings.withdraw) {
      tick.push(
        form('score_enable', { holders: `@a[tag=${tag('in')}]`, objective: withdraw }),
        form('as_run', {
          entities: `@a[tag=${tag('in')},scores={${withdraw}=1..}]`,
          command: run('withdraw'),
        }),
      );
      files.push(
        build.file(fn('withdraw'), [
          ifScore('2..', run('take')),
          ifScore('..1', build.tell('@s', { text: 'You need at least 2 hearts to withdraw one.' })),
          form('score_set', { holders: '@s', objective: withdraw, score: 0 }),
        ]),
        build.file(fn('take'), [
          form('score_remove', { holders: '@s', objective: hearts, score: 1 }),
          run('apply'),
          giveHeart,
        ]),
      );
    }
  }

  if (revive !== undefined) {
    const giveRevive = giveItem(revive.item, reviveKey);
    const outSelector = `@a[tag=${tag('ran_out')}]`;
    files.push(
      ...itemFiles(build, revive.item, reviveKey, 'revive', fn('revive')),
      build.file(fn('revive'), [
        form('advancement_revoke_only', { players: '@s', advancement: build.jsonId('revive') }),
        build.ifPlaying(run('revive/playing')),
        form('unless_score_run', {
          holder: names.holder('state'),
          objective: names.objective,
          range: String(GAME_STATES.playing),
          command: giveRevive,
        }),
      ]),
      build.file(fn('revive/playing'), [
        ifSelf(`tag=${tag('in')}`, run('revive/pick')),
        ifSelf(`tag=!${tag('in')}`, giveRevive),
      ]),
      build.file(fn('revive/pick'), [
        build.setHolder('hearts_out', 0),
        form('store_result_score_if_entity', {
          holder: names.holder('hearts_out'),
          objective: names.objective,
          entities: outSelector,
        }),
        build.ifHolder('hearts_out', '0', giveRevive),
        build.ifHolder(
          'hearts_out',
          '0',
          build.tell('@s', { text: 'Nobody here has run out of hearts.' }),
        ),
        build.ifHolder('hearts_out', '1..', run('revive/bring')),
      ]),
      // K4: the one out longest, among the players online.
      build.file(fn('revive/bring'), [
        build.setHolder('hearts_min', MAX_SCORE),
        form('score_operation', {
          holders: names.holder('hearts_min'),
          objective: names.objective,
          score_operation: '<',
          holder_2: outSelector,
          objective_2: outSince,
        }),
        form('as_if_score_compare_run', {
          entities: outSelector,
          holder: '@s',
          objective: outSince,
          comparison: '=',
          holder_2: names.holder('hearts_min'),
          objective_2: names.objective,
          command: run('revive/back'),
        }),
      ]),
      build.file(fn('revive/back'), [
        ...back(revive.hearts),
        build.tell('@a', [self, { text: ` was brought back with ${heartsText(revive.hearts)}.` }]),
      ]),
    );
  }

  if (tick.length > 0) files.push(build.file(fn('tick'), tick), build.onHook('tick', fn('tick')));

  files.push(
    build.file(fn('clear'), [
      form('as_run', { entities: `@a[tag=${tag('hearted')}]`, command: run('clear/one') }),
    ]),
    build.file(fn('clear/one'), [
      form('attribute_base_set', {
        entity: '@s',
        attribute: 'minecraft:max_health',
        value: VANILLA_MOST_HEALTH,
      }),
      form('score_reset', { holders: '@s', objective: hearts }),
      form('tag_remove', { entities: '@s', tag: tag('hearted') }),
      form('tag_remove', { entities: '@s', tag: tag('ran_out') }),
      ...(keptOut ? [form('tag_remove', { entities: '@s', tag: tag('kept_out') })] : []),
    ]),
    build.onHook('ended', fn('clear')),
    build.onHook('stopped', fn('clear')),
  );
  return files;
};

/** The ids the `hearts` mechanic of a game writes (functions, hooks, files, objectives, tags). */
export const heartsGeneratedIds: MechanicIds = (mechanic, element) => {
  const settings = readHearts(mechanic);
  const names = namesOf(element);
  const list = new IdList();
  const keptOut = settings.atZero === 'kept_out';
  const functions = ['load', 'apply', 'set', 'join', 'gain', 'died', 'zero', 'clear', 'clear/one'];
  const hooks = ['player_in', SCORED_HOOK, 'player_died', 'ended', 'stopped'];
  const objectives = ['hearts'];
  const tags = ['hearted', 'ran_out'];
  if (keptOut) {
    functions.push('return');
    objectives.push('out_until');
    tags.push('kept_out');
  }
  const heart = settings.heartItem;
  if (heart !== undefined) {
    functions.push('ate', 'ate/playing', 'ate/in', 'ate/full', 'ate/add');
    list.add('advancement', names.fn('heart'));
    if (heart.recipe !== undefined) list.add('recipe', names.fn('heart'));
    if (settings.withdraw) {
      functions.push('withdraw', 'take');
      objectives.push('withdraw');
    }
  }
  const revive = settings.revive;
  if (revive !== undefined) {
    functions.push('revive', 'revive/playing', 'revive/pick', 'revive/bring', 'revive/back');
    objectives.push('out_since');
    list.add('advancement', names.fn('revive'));
    if (revive.item.recipe !== undefined) list.add('recipe', names.fn('revive'));
  }
  if (keptOut || settings.withdraw) {
    functions.push('tick');
    hooks.push('tick');
  }
  addGameIds(
    list,
    names,
    functions.map((name) => `hearts/${name}`),
    hooks,
    true,
  );
  addKillPairIds(list, names);
  list.add('objective', ...objectives.map((name) => mechanicObjective(names.namespace, name)));
  list.add('tag', ...tags.map((name) => names.tag(name)));
  return list.done();
};
