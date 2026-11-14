/**
 * The test world's setup function, `msm-dev/setup.mcfunction` (ADR 0084 D2): plain vanilla
 * commands the runtime runs as the server at the world spawn when a player joins the test world.
 *
 * The file has two sections, each started by a marker comment line:
 *
 * - {@link SETUP_SECTION} (new world only): game rules (time stopped at noon, weather stopped,
 *   no natural mob spawning, keep inventory), a 21 by 21 test area around the spawn (smooth
 *   stone floor, a sign, a lever, a button, a pressure plate, redstone dust and a lamp, a 3 by
 *   3 water pool, a grass and a farmland patch, a fenced pen with a gate) and the project's
 *   first nine items in the nearest player's hotbar.
 * - {@link REFILL_SECTION} (new world, after the setup, and every later Play): the chests by
 *   the spawn, one stack of every project item, refilled slot by slot.
 *
 * Every line succeeds on a flat world whatever ran before (chests are placed only where none
 * is, unused slots are emptied, chests no longer needed are removed only when present), so the
 * runtime may treat any failed line as an error. Game rule ids are version facts
 * (`TargetFacts.dev.gameRules`) passed in.
 */

/** Marks the lines run once, on a new world. */
export const SETUP_SECTION = '# msm:setup';
/** Marks the lines run on a new world after the setup, and on every later Play. */
export const REFILL_SECTION = '# msm:refill';

/** Chests by the spawn: two rows of nine single chests. */
export const SETUP_CHEST_COUNT = 18;
/** Slots of a single chest. */
export const SETUP_CHEST_SLOTS = 27;
/** Items in the hotbar. */
export const SETUP_HOTBAR_SLOTS = 9;

/** The game rules the setup sets: registry ids of the `game_rule` registry (F7). */
export interface DevGameRuleIds {
  advanceTime: string;
  advanceWeather: string;
  spawnMobs: string;
  keepInventory: string;
}

/** One item for the chests (and, for the first nine, the hotbar). */
export interface SetupItem {
  /** `namespace:path`. */
  id: string;
  /** The stack size (1 to 99, at most the item's own maximum); 1 when absent. */
  count?: number;
}

/** A block position. */
export interface SetupPos {
  x: number;
  y: number;
  z: number;
}

/** Input of {@link setupFunctionLines}. */
export interface SetupFunctionInput {
  gameRules: DevGameRuleIds;
  /** Project items, block items and spawn eggs, in the order to show them. */
  items: readonly SetupItem[];
  /**
   * The spawn: the block the player stands in, above the area's floor. Absent: positions are
   * relative to where the function runs (`~`), which is the spawn when the runtime runs it.
   */
  spawn?: SetupPos;
}

/** The function's lines by section. */
export interface SetupFunction {
  setup: string[];
  refill: string[];
  /** Items left out because the chests are full. */
  leftOut: number;
}

const ITEM_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const RULE_ID = /^(?:minecraft:)?([a-z0-9_.]+)$/;

/** The setup and refill lines. Throws on an invalid item id, count or game rule id. */
export function setupFunctionLines(input: SetupFunctionInput): SetupFunction {
  const pos = position(input.spawn);
  const items = input.items.map(checkItem);
  const rule = (id: string, value: boolean): string => `gamerule ${ruleName(id)} ${value}`;

  const setup: string[] = [
    'time set 6000',
    rule(input.gameRules.advanceTime, false),
    'weather clear',
    rule(input.gameRules.advanceWeather, false),
    rule(input.gameRules.spawnMobs, false),
    rule(input.gameRules.keepInventory, true),
    // Floor, 21 by 21 under the spawn.
    `fill ${pos(-10, -1, -10)} ${pos(10, -1, 10)} minecraft:smooth_stone`,
    // Water pool, farmland beside it (kept moist) and grass, set into the floor.
    `fill ${pos(-9, -1, -9)} ${pos(-7, -1, -7)} minecraft:water`,
    `fill ${pos(-6, -1, -9)} ${pos(-4, -1, -7)} minecraft:farmland`,
    `fill ${pos(-3, -1, -9)} ${pos(-1, -1, -7)} minecraft:grass_block`,
    // Sign facing the spawn.
    `setblock ${pos(0, 0, 3)} minecraft:oak_sign[rotation=8]{front_text:{messages:["","MCSuperMods","test area",""]}}`,
    // Lever, dust, lamp, dust and button in a row; a pressure plate by the lamp.
    `setblock ${pos(-4, 0, 6)} minecraft:lever[face=floor,facing=east]`,
    `fill ${pos(-3, 0, 6)} ${pos(-1, 0, 6)} minecraft:redstone_wire`,
    `setblock ${pos(0, 0, 6)} minecraft:redstone_lamp`,
    `setblock ${pos(1, 0, 6)} minecraft:redstone_wire`,
    `setblock ${pos(2, 0, 6)} minecraft:stone_button[face=floor,facing=west]`,
    `setblock ${pos(0, 0, 7)} minecraft:stone_pressure_plate`,
    // Fenced pen with a gate on its north side.
    `fill ${pos(4, 0, 3)} ${pos(9, 0, 3)} minecraft:oak_fence`,
    `fill ${pos(4, 0, 9)} ${pos(9, 0, 9)} minecraft:oak_fence`,
    `fill ${pos(4, 0, 4)} ${pos(4, 0, 8)} minecraft:oak_fence`,
    `fill ${pos(9, 0, 4)} ${pos(9, 0, 8)} minecraft:oak_fence`,
    `setblock ${pos(6, 0, 3)} minecraft:oak_fence_gate[facing=south]`,
  ];
  items.slice(0, SETUP_HOTBAR_SLOTS).forEach((item, slot) => {
    setup.push(`item replace entity @p hotbar.${slot} with ${stack(item)}`);
  });

  const refill: string[] = [];
  const capacity = SETUP_CHEST_COUNT * SETUP_CHEST_SLOTS;
  const chestsNeeded = Math.ceil(Math.min(items.length, capacity) / SETUP_CHEST_SLOTS);
  for (let chest = 0; chest < SETUP_CHEST_COUNT; chest++) {
    const at = pos(-4 + (chest % 9), 0, -2 - 2 * Math.floor(chest / 9));
    if (chest >= chestsNeeded) {
      refill.push(`execute if block ${at} minecraft:chest run setblock ${at} minecraft:air`);
      continue;
    }
    refill.push(
      `execute unless block ${at} minecraft:chest run setblock ${at} minecraft:chest[facing=south]`,
    );
    for (let slot = 0; slot < SETUP_CHEST_SLOTS; slot++) {
      const item = items[chest * SETUP_CHEST_SLOTS + slot];
      refill.push(
        `item replace block ${at} container.${slot} with ${item === undefined ? 'minecraft:air' : stack(item)}`,
      );
    }
  }
  return { setup, refill, leftOut: Math.max(0, items.length - capacity) };
}

/** The file's text: a header, then each section after its marker. */
export function setupFunctionText(fn: SetupFunction): string {
  return [
    '# MCSuperMods test world (written by MCSuperMods; changes are replaced at the next Play)',
    SETUP_SECTION,
    ...fn.setup,
    REFILL_SECTION,
    ...fn.refill,
    '',
  ].join('\n');
}

function position(spawn: SetupPos | undefined): (dx: number, dy: number, dz: number) => string {
  if (spawn === undefined) {
    const rel = (d: number): string => (d === 0 ? '~' : `~${d}`);
    return (dx, dy, dz) => `${rel(dx)} ${rel(dy)} ${rel(dz)}`;
  }
  for (const value of [spawn.x, spawn.y, spawn.z]) {
    if (!Number.isSafeInteger(value)) throw new Error('The spawn must be whole block numbers.');
  }
  return (dx, dy, dz) => `${spawn.x + dx} ${spawn.y + dy} ${spawn.z + dz}`;
}

function ruleName(id: string): string {
  const match = RULE_ID.exec(id);
  if (match?.[1] === undefined) throw new Error(`${JSON.stringify(id)} is not a game rule id.`);
  return match[1];
}

function checkItem(item: SetupItem): Required<SetupItem> {
  if (!ITEM_ID.test(item.id)) throw new Error(`${JSON.stringify(item.id)} is not an item id.`);
  const count = item.count ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 99) {
    throw new Error(`The stack size of ${item.id} must be 1 to 99.`);
  }
  return { id: item.id, count };
}

function stack(item: Required<SetupItem>): string {
  return item.count === 1 ? item.id : `${item.id} ${item.count}`;
}
