/**
 * The mechanic `tracker` of `msm:game` (ADR 0132 D2; B725, the spike's K7): a compass, given to
 * the players of one role, that points at a player of another role, pointed again every few
 * seconds (once a second by default). K7's form: the target's `Pos` read once into storage (each
 * read of a player's data writes the whole player, so it is done once per refresh, not once per
 * holder), then one macro call per dimension that points every holder's compass there with an
 * inline `set_components` modifier writing `minecraft:lodestone_tracker` (main hand and off hand).
 *
 * Dimensions: the overworld, the Nether, the End and the game's own dimension. Each refresh, in
 * each of them, a player of the target role who is there (`execute in <dimension>` with a
 * `distance=0..` selector, which only finds players of that dimension) is read into the
 * dimension's storage `<ns>:msm_games/game/<path>/tracker/<dimension namespace>/<path>`. Then,
 * with `other_dimension`:
 *
 * - `last_place`: the holders in each dimension point at a target there now, or at the last place
 *   a target was seen in that dimension this round (its portal, mostly); in a dimension no target
 *   has been in, the compass is left as it was;
 * - `spin`: the holders in a dimension with a target point at it; the others point at the target
 *   read last, in its own dimension, so their needle spins (client drawing; an in-game check).
 *
 * A target role of several players: in each dimension one of them is followed (the first found).
 * Under `<ns>:msm_games/game/<path>/tracker/`: `equip` (hooks `player_in`, `player_respawned`)
 * and `give` (a compass when the holder has none), `second` (hook `second`), `point`, `read/<d>`,
 * the macro `set`, and `reset` (hook `starting`).
 */
import type { CommandFragmentName, OutputFile, TargetFacts } from '@msm/plugin-api';
import { GamesLoweringError, num, str } from '../../shared-functions';
import { readGame } from '../names';
import type { MechanicLowering } from './index';
import {
  addGameIds,
  customDataKey,
  IdList,
  itemWith,
  type MechanicBuild,
  type MechanicIds,
  mechanicBuild,
  namesOf,
  plain,
} from './kill-pair';

/** The vanilla dimensions a tracker always covers. */
export const TRACKER_DIMENSIONS = Object.freeze([
  'minecraft:overworld',
  'minecraft:the_nether',
  'minecraft:the_end',
]);

/** The hand slots a tracker is pointed in (K7). */
export const TRACKER_SLOTS = Object.freeze(['weapon.mainhand', 'weapon.offhand']);

const PLACEHOLDER = /<([a-z_0-9]+)>/g;

/**
 * Fills one of the target's command fragments (`target.commands.fragments`, plugin API 1.27.0).
 *
 * @throws {@link GamesLoweringError} If the target has no such fragment or a value is missing.
 */
export function fillFragment(
  target: TargetFacts,
  name: CommandFragmentName,
  values: Readonly<Record<string, string | number>>,
): string {
  const fragment = target.commands?.fragments?.[name];
  if (fragment === undefined) {
    throw new GamesLoweringError(
      `The target ${target.id} has no command fragment "${name}" (plugin API 1.27.0), so the game cannot be lowered for it.`,
    );
  }
  return fragment.replace(PLACEHOLDER, (_whole, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new GamesLoweringError(`The command fragment "${name}" needs a value for <${key}>.`);
    }
    return String(value);
  });
}

/** A dimension's storage and function name: `minecraft:the_nether` to `minecraft/the_nether`. */
const dimensionPath = (dimension: string): string => dimension.replace(':', '/');

/** The dimensions a game's tracker covers: the vanilla three and the game's own. */
export function trackerDimensions(build: MechanicBuild): string[] {
  const own = build.game.dimension;
  return TRACKER_DIMENSIONS.includes(own) ? [...TRACKER_DIMENSIONS] : [...TRACKER_DIMENSIONS, own];
}

/** Lowers the `tracker` mechanic; nothing when its roles are not the game's. */
export const lowerTracker: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = mechanicBuild(context);
  const { names, form, target } = build;
  const holderRole = build.game.roles.find((role) => role.id === str(mechanic.holder, ''));
  const targetRole = build.game.roles.find((role) => role.id === str(mechanic.target, ''));
  if (holderRole === undefined || targetRole === undefined || holderRole === targetRole) return [];
  const every = Math.min(60, Math.max(1, Math.trunc(num(mechanic.every_seconds, 1))));
  const spin = str(mechanic.other_dimension, 'last_place') === 'spin';
  const name = str(mechanic.name, '');
  const fn = (path: string): string => `tracker/${path}`;
  const run = (path: string): string => build.run(fn(path));
  const key = customDataKey(build.namespace, 'tracker');
  const compass = itemWith('minecraft:compass', [
    ['minecraft:custom_data', `{${key}:1b}`],
    ...(name === ''
      ? []
      : ([['minecraft:custom_name', plain(name, { italic: false })]] as [string, string][])),
  ]);
  const predicate = `minecraft:compass[minecraft:custom_data~{${key}:1b}]`;
  const inRound = names.tag('in');
  const holders = `@a[tag=${names.roleTag(holderRole.id)},tag=${inRound},distance=0..]`;
  const targets = `@a[tag=${names.roleTag(targetRole.id)},tag=${inRound},distance=0..,limit=1]`;
  const dimensions = trackerDimensions(build);
  const storageOf = (dimension: string): string => build.storage(fn(dimensionPath(dimension)));
  const current = build.storage(fn('current'));
  const seen = (i: number): string => `tracker_seen_${i}`;
  const now = (i: number): string => `tracker_now_${i}`;
  const pointAt = (storage: string): string =>
    form('function_with_storage', { function: names.fn(fn('set')), storage });

  const equip = [
    form('if_entity_run', {
      entities: `@s[tag=${names.roleTag(holderRole.id)},tag=${inRound}]`,
      command: run('give'),
    }),
  ];
  const give = [
    form('store_result_score_run', {
      holder: names.holder('tracker_has'),
      objective: names.objective,
      command: form('clear', { players: '@s', item_predicate: predicate, max_count: 0 }),
    }),
    build.ifHolder('tracker_has', '0', form('give', { players: '@s', item: compass, count: 1 })),
  ];
  const second = [
    form('score_add', {
      holders: names.holder('tracker_s'),
      objective: names.objective,
      score: 1,
    }),
    build.ifHolder('tracker_s', `${every}..`, run('point')),
  ];

  const point = [
    build.setHolder('tracker_s', 0),
    ...dimensions.map((_dimension, i) => build.setHolder(now(i), 0)),
    ...(spin ? [build.setHolder('tracker_found', 0)] : []),
    ...dimensions.map((dimension) =>
      form('in_run', {
        dimension,
        command: form('as_run', {
          entities: targets,
          command: run(`read/${dimensionPath(dimension)}`),
        }),
      }),
    ),
  ];
  dimensions.forEach((dimension, i) => {
    const here = form('in_run', { dimension, command: pointAt(storageOf(dimension)) });
    if (!spin) {
      point.push(build.ifHolder(seen(i), '1', here));
      return;
    }
    point.push(
      build.ifHolder(now(i), '1', here),
      form('if_score_if_score_run', {
        holder: names.holder(now(i)),
        objective: names.objective,
        range: '0',
        holder_2: names.holder('tracker_found'),
        objective_2: names.objective,
        range_2: '1',
        command: form('in_run', { dimension, command: pointAt(current) }),
      }),
    );
  });

  // K7: one read of the target's position into storage, its parts as whole numbers.
  const axes = ['x', 'y', 'z'] as const;
  const readFiles = dimensions.map((dimension, i) => {
    const storage = storageOf(dimension);
    const copy = (into: string): string[] =>
      axes.map((axis, a) =>
        form('store_result_storage_run', {
          storage: into,
          nbt_path: axis,
          scale: 1,
          command: form('data_get_storage', { storage, nbt_path: `p[${a}]` }),
        }),
      );
    const dim = (into: string): string =>
      form('storage_set_value', { storage: into, nbt_path: 'dim', nbt: JSON.stringify(dimension) });
    return build.file(fn(`read/${dimensionPath(dimension)}`), [
      form('storage_set_from_entity', {
        storage,
        nbt_path: 'p',
        entity: '@s',
        source_path: 'Pos',
      }),
      ...copy(storage),
      dim(storage),
      build.setHolder(seen(i), 1),
      build.setHolder(now(i), 1),
      ...(spin ? [...copy(current), dim(current), build.setHolder('tracker_found', 1)] : []),
    ]);
  });

  // The macro, run `in` the dimension whose holders it points: `distance=0..` keeps it there.
  const modifier = fillFragment(target, 'lodestone_tracker_modifier', {
    dimension: '$(dim)',
    x: '$(x)',
    y: '$(y)',
    z: '$(z)',
  });
  const set = TRACKER_SLOTS.map(
    (slot) =>
      `$${form('as_run', {
        entities: holders,
        command: form('if_items_run', {
          entities: '@s',
          item_slots: slot,
          item_predicate: predicate,
          command: form('item_modify_entity', {
            entities: '@s',
            item_slot: slot,
            item_modifier: modifier,
          }),
        }),
      })}`,
  );

  const reset = [
    build.setHolder('tracker_s', 0),
    ...dimensions.map((_dimension, i) => build.setHolder(seen(i), 0)),
  ];

  return [
    build.file(fn('equip'), equip),
    build.onHook('player_in', fn('equip')),
    build.onHook('player_respawned', fn('equip')),
    build.file(fn('give'), give),
    build.file(fn('second'), second),
    build.onHook('second', fn('second')),
    build.file(fn('point'), point),
    ...readFiles,
    build.file(fn('set'), set),
    build.file(fn('reset'), reset),
    build.onHook('starting', fn('reset')),
  ];
};

/** The ids the `tracker` mechanic of a game writes. */
export const trackerGeneratedIds: MechanicIds = (mechanic, element) => {
  const game = readGame(element);
  const holder = str(mechanic.holder, '');
  const target = str(mechanic.target, '');
  if (
    holder === target ||
    !game.roles.some((role) => role.id === holder) ||
    !game.roles.some((role) => role.id === target)
  ) {
    return {};
  }
  const names = namesOf(element);
  const dimensions = TRACKER_DIMENSIONS.includes(game.dimension)
    ? [...TRACKER_DIMENSIONS]
    : [...TRACKER_DIMENSIONS, game.dimension];
  return addGameIds(
    new IdList(),
    names,
    [
      'equip',
      'give',
      'second',
      'point',
      'set',
      'reset',
      ...dimensions.map((dimension) => `read/${dimensionPath(dimension)}`),
    ].map((name) => `tracker/${name}`),
    ['player_in', 'player_respawned', 'second', 'starting'],
  ).done();
};
