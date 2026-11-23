/**
 * The mechanic `floor` of `msm:game` (ADR 0132 D2; B726, the spike's K10 and K17): a floor that
 * players break under each other, rebuilt for every round. Players in the round play in adventure
 * mode with a tool whose `can_break` names only the floor's block (a diamond or netherite shovel
 * breaks snow at once, K10), and broken floor blocks drop nothing unless `drops` (the game rule
 * `block_drops`, K10, set while a round is played and back to `true` after).
 *
 * The floor's box is its `area`'s. A kind lowers one element at a time and cannot read the area,
 * so the box reaches the lowering as the mechanic's `from` and `to`, written onto the game's copy
 * before lowering by {@link floorAreaExpander} (a project expander, as the rule book's, ADR 0082
 * D9). Without them the floor is not rebuilt (the check says so); everything else works.
 *
 * Functions under `<ns>:msm_games/game/<path>/floor/`:
 *
 * - `rebuild` (hook `starting`, before players are dealt): the box filled with `block` by `fill`
 *   (cut into parts of at most {@link FILL_LIMIT} blocks), or the `structure` placed at the box's
 *   low corner by `place template`; both in the game's dimension, and both need the chunks
 *   loaded (K10, B547 Y3);
 * - `start` (hook `started`): `block_drops` off when the floor does not drop;
 * - `ready` (hooks `player_in`, `player_respawned`, `player_back`, as the player): marks the
 *   player to get the tool; `tick` (hook `tick`) gives each marked player still in the round the
 *   tool and adventure mode a tick later, so a kit given on the same hook (which may clear the
 *   inventory first) never takes it away;
 * - `end` (hooks `ended`, `stopped`): `block_drops` back on, marks taken off.
 */
import type {
  Element,
  ElementPatch,
  Json,
  JsonObject,
  OutputFile,
  ProjectExpander,
} from '@msm/plugin-api';
import { itemArgument } from '../../kit';
import { blockPos, bool, dataOf, isRecord } from '../../shared-functions';
import { type GameBuild, gameBuild } from '../build';
import type { MechanicLowering } from './index';
import { addGameIds, IdList, type MechanicIds, namesOf } from './kill-pair';

/** The most blocks one `fill` changes (B547). */
export const FILL_LIMIT = 32_768;

/** A box of blocks, both corners included. */
export interface FloorBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** The settings of a `floor` mechanic, with their defaults. */
export interface FloorSettings {
  readonly block: string;
  readonly tool: string;
  readonly drops: boolean;
  readonly structure?: string;
  /** The floor's box, once the area's corners reached the mechanic. */
  readonly box?: FloorBox;
}

const ID = /^#?[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const isPos = (value: Json | undefined): boolean =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === 'number' && Number.isInteger(n));

/** The box between two corners, each axis ordered. */
export function boxOf(from: readonly number[], to: readonly number[]): FloorBox {
  const lo = from.map((n, i) => Math.min(n, to[i] as number));
  const hi = from.map((n, i) => Math.max(n, to[i] as number));
  return {
    min: [lo[0], lo[1], lo[2]] as [number, number, number],
    max: [hi[0], hi[1], hi[2]] as [number, number, number],
  };
}

/** Reads a `floor` mechanic. */
export function readFloor(mechanic: JsonObject): FloorSettings {
  const block =
    typeof mechanic.block === 'string' && ID.test(mechanic.block)
      ? mechanic.block
      : 'minecraft:snow_block';
  const tool =
    typeof mechanic.tool === 'string' && ID.test(mechanic.tool)
      ? mechanic.tool
      : 'minecraft:diamond_shovel';
  const structure =
    typeof mechanic.structure === 'string' && ID.test(mechanic.structure)
      ? mechanic.structure
      : undefined;
  const box =
    isPos(mechanic.from) && isPos(mechanic.to)
      ? boxOf(blockPos(mechanic.from), blockPos(mechanic.to))
      : undefined;
  return {
    block,
    tool,
    drops: bool(mechanic.drops, false),
    ...(structure === undefined ? {} : { structure }),
    ...(box === undefined ? {} : { box }),
  };
}

/** The number of blocks in a box. */
export const boxVolume = (box: FloorBox): number =>
  box.max.reduce((product, n, i) => product * (n - (box.min[i] as number) + 1), 1);

/**
 * A box cut into boxes of at most {@link FILL_LIMIT} blocks, each cut across its longest side,
 * in order from the low corner.
 */
export function fillParts(box: FloorBox): FloorBox[] {
  if (boxVolume(box) <= FILL_LIMIT) return [box];
  const sizes = box.max.map((n, i) => n - (box.min[i] as number) + 1);
  const axis = sizes.indexOf(Math.max(...sizes));
  const cut = (box.min[axis] as number) + Math.floor((sizes[axis] as number) / 2) - 1;
  const lowMax = [...box.max] as [number, number, number];
  lowMax[axis] = cut;
  const highMin = [...box.min] as [number, number, number];
  highMin[axis] = cut + 1;
  return [
    ...fillParts({ min: box.min, max: lowMax }),
    ...fillParts({ min: highMin, max: box.max }),
  ];
}

/** The lines that rebuild the floor in its box. */
function rebuildLines(build: GameBuild, settings: FloorSettings, box: FloorBox): string[] {
  const inGame = (command: string): string =>
    build.form('in_run', { dimension: build.game.dimension, command });
  if (settings.structure !== undefined) {
    const [x, y, z] = box.min;
    return [inGame(build.form('place_template', { template: settings.structure, x, y, z }))];
  }
  return fillParts(box).map(({ min, max }) =>
    inGame(
      build.form('fill', {
        x1: min[0],
        y1: min[1],
        z1: min[2],
        x2: max[0],
        y2: max[1],
        z2: max[2],
        block: settings.block,
      }),
    ),
  );
}

/** The tag of a player who gets the tool at the next tick. */
const READY = 'floor.ready';

/** The game rule that keeps broken floor blocks from dropping. */
const DROPS_RULE = 'block_drops';

/** Whether the target names the drops rule among the game types' rules. */
const hasDropsRule = (build: GameBuild): boolean =>
  build.target.gameRules?.forGames?.includes(DROPS_RULE) === true;

/** Lowers the `floor` mechanic. */
export const lowerFloor: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = gameBuild(context);
  const { names } = build;
  const settings = readFloor(mechanic);
  const ready = names.tag(READY);
  const tool = itemArgument(settings.tool, { 'minecraft:can_break': { blocks: settings.block } });
  const offDrops = !settings.drops && hasDropsRule(build);
  const files: OutputFile[] = [
    build.file('floor/ready', [build.form('tag_add', { entities: '@s', tag: ready })]),
    build.file('floor/tick', [
      build.form('as_run', {
        entities: `@a[tag=${ready},tag=${names.tag('in')},tag=!${names.tag('dead')}]`,
        command: build.run('floor/tool'),
      }),
    ]),
    build.file('floor/tool', [
      build.form('tag_remove', { entities: '@s', tag: ready }),
      build.form('game_mode', { game_mode: 'adventure', players: '@s' }),
      build.form('give', { players: '@s', item: tool, count: 1 }),
    ]),
    build.file('floor/end', [
      ...(offDrops ? [build.form('game_rule', { rule: DROPS_RULE, rule_value: 'true' })] : []),
      build.form('tag_remove', { entities: '@a', tag: ready }),
    ]),
    build.hookFile('player_in', [names.fn('floor/ready')]),
    build.hookFile('player_respawned', [names.fn('floor/ready')]),
    build.hookFile('player_back', [names.fn('floor/ready')]),
    build.hookFile('tick', [names.fn('floor/tick')]),
    build.hookFile('ended', [names.fn('floor/end')]),
    build.hookFile('stopped', [names.fn('floor/end')]),
  ];
  if (offDrops) {
    files.push(
      build.file('floor/start', [
        build.form('game_rule', { rule: DROPS_RULE, rule_value: 'false' }),
      ]),
      build.hookFile('started', [names.fn('floor/start')]),
    );
  }
  if (settings.box !== undefined) {
    files.push(
      build.file('floor/rebuild', rebuildLines(build, settings, settings.box)),
      build.hookFile('starting', [names.fn('floor/rebuild')]),
    );
  }
  return files;
};

/** The ids the `floor` mechanic writes, for `gamesGeneratedIds` (every built-in target has the drops rule). */
export const floorGeneratedIds: MechanicIds = (mechanic, element) => {
  const settings = readFloor(mechanic);
  const functions = ['ready', 'tick', 'tool', 'end'];
  const hooks = ['player_in', 'player_respawned', 'player_back', 'tick', 'ended', 'stopped'];
  if (!settings.drops) {
    functions.push('start');
    hooks.push('started');
  }
  if (settings.box !== undefined) {
    functions.push('rebuild');
    hooks.push('starting');
  }
  const names = namesOf(element);
  return addGameIds(
    new IdList(),
    names,
    functions.map((name) => `floor/${name}`),
    hooks,
  )
    .add('tag', names.tag(READY))
    .done();
};

/**
 * The project expander that gives each game's `floor` mechanic its area's corners (`from` and
 * `to`) on the copy that is lowered, so the floor can be rebuilt: a kind lowers one element at a
 * time and cannot read the area itself. A floor that already has both corners, or whose area the
 * project does not have, is left as it is (the check reports a missing area).
 *
 * Registered in the plugin's `projectExpanders`; the schema's `FloorMechanic` takes `from?` and
 * `to?`.
 */
export const floorAreaExpander: ProjectExpander = {
  id: 'msm.games.floor-area',
  kinds: ['msm:game', 'msm:area'],
  expand: ({ elements }) => ({ patches: floorAreaPatches(elements), problems: [] }),
};

/** The patches of {@link floorAreaExpander}. */
export function floorAreaPatches(elements: readonly Element[]): ElementPatch[] {
  const areas = new Map<string, JsonObject>(
    elements.filter((one) => one.kind === 'msm:area').map((one) => [one.id, dataOf(one.data)]),
  );
  const patches: ElementPatch[] = [];
  for (const game of elements.filter((one) => one.kind === 'msm:game')) {
    const mechanics = dataOf(game.data).mechanics;
    if (!Array.isArray(mechanics)) continue;
    mechanics.forEach((mechanic, index) => {
      if (!isRecord(mechanic) || mechanic.type !== 'floor') return;
      if (isPos(mechanic.from) && isPos(mechanic.to)) return;
      const area = typeof mechanic.area === 'string' ? areas.get(mechanic.area) : undefined;
      if (area === undefined || !isPos(area.from) || !isPos(area.to)) return;
      const origin = { elementId: game.id, pointer: `/mechanics/${index}/area` };
      for (const corner of ['from', 'to'] as const) {
        patches.push({
          elementId: game.id,
          path: ['mechanics', index, corner],
          value: area[corner] as Json,
          origin,
        });
      }
    });
  }
  return patches;
}
