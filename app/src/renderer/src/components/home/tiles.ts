/**
 * Home's "Make something" tiles (ADR 0083 D2, ADR 0086 D8, ADR 0091 D4, ADR 0101 D4) under their headings,
 * and what each opens: "Surprise me", Creator flows by flow id (the library's starters with
 * `creator`), other library starters by id, the Rule book, the picture painter or the AI helper.
 * A tile whose flows and starters are all unavailable on the project's target is hidden.
 * Pure: no DOM, so it runs in Node tests.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------------------------
// Very easy picks (ADR 0101 D4): the new kinds of block and item that "Make a block" and "Make
// an item" offer, in plain words and without ids. Each pick opens a Creator flow; a pick whose
// flow the library does not have (or the target cannot make) is not shown.
// ---------------------------------------------------------------------------------------------

/** One pick of a Home tile's chooser: a Creator flow under plain words. */
export interface VeryEasyPick {
  /** Stable id; the card's test id stays the flow's (`creator-flow-<flowId>`). */
  readonly id: string;
  /** The Creator flow (a library starter id) the pick opens. */
  readonly flowId: string;
  /** The card's words. */
  readonly label: string;
  /** One short sentence under the label. */
  readonly sentence: string;
}

/** The new kinds of block "Make a block" offers (ADR 0101 D4, plan "Very easy wording"). */
export const MAKE_BLOCK_PICKS: readonly VeryEasyPick[] = [
  {
    id: 'lights',
    flowId: 'lights',
    label: 'Lights',
    sentence: 'Torches, lanterns, chains and candles.',
  },
  { id: 'bed', flowId: 'bed', label: 'Bed', sentence: 'A bed or sleeping bag.' },
  { id: 'cake', flowId: 'cake', label: 'Cake', sentence: 'Eat it a slice at a time.' },
  {
    id: 'sign',
    flowId: 'wood-set',
    label: 'Sign',
    sentence: 'Write on it. Comes with a whole set of wood.',
  },
  {
    id: 'berry-bush',
    flowId: 'crop',
    label: 'Bush with berries',
    sentence: 'A plant to grow and pick. Choose "Bush with berries".',
  },
  {
    id: 'copper',
    flowId: 'copper-set',
    label: 'Ages like copper',
    sentence: 'Blocks that slowly turn green, and stay as they are when waxed.',
  },
];

/** The new kinds of item "Make an item" offers (ADR 0101 D4). */
export const MAKE_ITEM_PICKS: readonly VeryEasyPick[] = [
  {
    id: 'bag',
    flowId: 'backpack',
    label: 'A bag that holds things',
    sentence: 'Opens when you right-click it.',
  },
];

/** The flow ids of `picks`, in order, without repeats. */
export function pickFlowIds(picks: readonly VeryEasyPick[]): string[] {
  return [...new Set(picks.map((pick) => pick.flowId))];
}

/** The pick of `flowId` among the tile picks, or `undefined`. */
export function veryEasyPickOf(
  flowId: string,
  picks: readonly VeryEasyPick[] = [...MAKE_BLOCK_PICKS, ...MAKE_ITEM_PICKS],
): VeryEasyPick | undefined {
  return picks.find((pick) => pick.flowId === flowId);
}

/** What a tile opens. */
export type MakeTileAction =
  /**
   * The Creator with these flows (one flow opens it directly; several open a chooser), or, with
   * `starterIds` (library starters that are not Creator flows), a chooser of flows and starters
   * where a starter is added to the mod at once (ADR 0086 D8).
   */
  | {
      readonly type: 'flows';
      readonly flowIds: readonly string[];
      readonly starterIds?: readonly string[];
      /**
       * Plain words for some of the flows' cards (ADR 0101 D4): the Creator's picker shows a
       * pick's label and sentence on its flow's card.
       */
      readonly picks?: readonly VeryEasyPick[];
    }
  /** "Surprise me": a random mod (ADR 0086). */
  | { readonly type: 'surprise' }
  /** The project's Rule book (created on first use). */
  | { readonly type: 'rules' }
  /** The picture painter, for a new picture. */
  | { readonly type: 'paint' }
  /** The AI helper's Build mode. */
  | { readonly type: 'ai' };

/** The headings Home groups its tiles under, in order (ADR 0086 D8). */
export const TILE_GROUPS = [
  { id: 'start', title: 'Start here' },
  { id: 'blocks', title: 'Blocks and items' },
  { id: 'creatures', title: 'Creatures' },
  { id: 'vehicles', title: 'Vehicles' },
  { id: 'magic', title: 'Magic' },
  { id: 'worlds', title: 'Worlds' },
  { id: 'looks', title: 'Looks and sounds' },
  { id: 'more', title: 'Rules and help' },
] as const;

/** A tile group id. */
export type TileGroup = (typeof TILE_GROUPS)[number]['id'];

/** One "Make something" tile. */
export interface MakeTile {
  /** Stable id; the tile's test id is `home-tile-<id>`. */
  readonly id: string;
  /** The tile's words. */
  readonly label: string;
  /** One short sentence under the label. */
  readonly sentence: string;
  /** The heading the tile sits under. */
  readonly group: TileGroup;
  readonly action: MakeTileAction;
}

const flows = (...flowIds: string[]): MakeTileAction => ({ type: 'flows', flowIds });
/** A flows action with Very easy picks: `flowIds` then the picks' flows, without repeats. */
const withPicks = (flowIds: string[], picks: readonly VeryEasyPick[]): MakeTileAction => ({
  type: 'flows',
  flowIds: [...new Set([...flowIds, ...pickFlowIds(picks)])],
  picks,
});
const choices = (flowIds: string[], starterIds: string[]): MakeTileAction => ({
  type: 'flows',
  flowIds,
  starterIds,
});

/**
 * The vehicle flows "Make a vehicle" offers (ADR 0091 D4), in the order of its "What kind?"
 * picker: Car, Tank, Plane and Boat. The Creator opens on its flow picker with just these four
 * cards (`creator-flow-<id>`); each flow asks the name first and makes the vehicle with its
 * defaults when nothing else is changed.
 */
export const VEHICLE_FLOW_IDS = ['vehicle-car', 'vehicle-tank', 'vehicle-plane', 'vehicle-boat'];

/**
 * The Creator flow "Make a trader" opens (ADR 0101 D2, D4): the library's Wandering merchant
 * flow, whose questions are "What does it sell?" (an item, then "For how many emeralds?"),
 * "What does it look like?" and "What is it called?". The tile is hidden while the library has
 * no such flow.
 */
export const TRADER_FLOW_ID = 'wandering-merchant';

/** The tiles, in the order Home shows them (ADR 0083 D2, ADR 0086 D8). */
export const MAKE_TILES: readonly MakeTile[] = [
  {
    id: 'surprise',
    label: 'Surprise me',
    sentence: 'Not sure what to make? Get a random mod to start from.',
    group: 'start',
    action: { type: 'surprise' },
  },
  {
    id: 'block',
    label: 'Make a block',
    sentence: 'A new block, an ore, stone with stairs, lights, a bed, a cake, a sign or a liquid.',
    group: 'blocks',
    // The Very easy picks (ADR 0101 D4) follow the first three; flows not in the library are hidden.
    action: withPicks(['simple-block', 'custom_ore', 'stone-set', 'fluid'], MAKE_BLOCK_PICKS),
  },
  {
    id: 'machine',
    label: 'Make a chest or machine',
    sentence: 'A crate that stores things, or a machine that cooks or grinds them.',
    group: 'blocks',
    action: flows('storage-crate', 'machine'),
  },
  {
    id: 'item',
    label: 'Make an item',
    sentence:
      'Something to throw, a totem that saves you, wings to glide or a bag that holds things.',
    group: 'blocks',
    action: withPicks(['throwable', 'totem', 'glider'], MAKE_ITEM_PICKS),
  },
  {
    id: 'tool',
    label: 'Make a tool or weapon',
    sentence: 'A sword, a whole set of tools, or a new enchantment.',
    group: 'blocks',
    action: flows('weapon', 'gear-set', 'enchantment'),
  },
  {
    id: 'armour',
    label: 'Make armour',
    sentence: 'Helmet, chestplate, leggings and boots of a new material, or a new trim.',
    group: 'blocks',
    action: flows('gear-set', 'armour-trim'),
  },
  {
    id: 'food',
    label: 'Make food',
    sentence: 'Something to eat or drink.',
    group: 'blocks',
    action: flows('food', 'consumable'),
  },
  {
    id: 'plant',
    label: 'Make a plant or tree',
    sentence: 'A crop to grow, a tree, or a whole set of wood.',
    group: 'blocks',
    action: flows('crop', 'tree', 'wood-set'),
  },
  {
    id: 'recipe',
    label: 'Make a recipe',
    sentence: 'Ready-made crafting, smelting and stonecutting recipes to change.',
    group: 'blocks',
    action: choices([], ['recipe_pack']),
  },
  {
    id: 'mob',
    label: 'Make a mob',
    sentence: 'A new creature, a flying or swimming one, or a boss.',
    group: 'creatures',
    action: flows('custom_mob', 'flying-mob', 'water-mob', 'boss'),
  },
  {
    id: 'pet',
    label: 'Make a pet or animal',
    sentence: 'A pet to tame, a farm animal or something to ride.',
    group: 'creatures',
    action: flows('pet', 'farm-animal', 'mount'),
  },
  {
    id: 'trader',
    label: 'Make a trader',
    sentence: 'A mob that trades with you, or a new job for villagers.',
    group: 'creatures',
    action: flows(TRADER_FLOW_ID, 'village-job'),
  },
  {
    id: 'vehicle',
    label: 'Make a vehicle',
    sentence: 'Cars, tanks, planes and boats you can drive.',
    group: 'vehicles',
    action: flows(...VEHICLE_FLOW_IDS),
  },
  {
    id: 'potion',
    label: 'Make a potion or effect',
    sentence: 'A potion to brew or a new effect.',
    group: 'magic',
    action: flows('potion', 'status-effect'),
  },
  {
    id: 'sparkles',
    label: 'Make sparkles',
    sentence: 'Particles of your own around a block or from an item.',
    group: 'magic',
    action: flows('particle'),
  },
  {
    id: 'wand',
    label: 'Make a magic wand',
    sentence: 'A wand that heals, throws you up, calls lightning or gives an effect.',
    group: 'magic',
    action: flows('scripted-item'),
  },
  {
    id: 'portal',
    label: 'Make a portal',
    sentence: 'A portal frame, or a whole new world to travel to.',
    group: 'worlds',
    action: flows('portal', 'dimension'),
  },
  {
    id: 'world',
    label: 'Make a world or biome',
    sentence: 'A new world to explore, or a new biome with its own trees.',
    group: 'worlds',
    action: choices(['dimension'], ['custom_biome']),
  },
  {
    id: 'building',
    label: 'Make a building',
    sentence: 'A small village of huts and lamp posts that appears in forests.',
    group: 'worlds',
    action: choices([], ['jigsaw_structure']),
  },
  {
    id: 'drops',
    label: 'Change drops and trades',
    sentence: 'An extra drop from a mob, block or chest, or a new villager trade.',
    group: 'worlds',
    action: flows('extra-drop', 'villager-trade'),
  },
  {
    id: 'looks',
    label: 'Change how Minecraft looks',
    sentence: 'A new skin for a wolf, cat or pig, or a new look for a vanilla item.',
    group: 'looks',
    action: choices(['mob-skin'], ['resource_pack']),
  },
  {
    id: 'painting',
    label: 'Make a painting or pattern',
    sentence: 'A painting of your own picture, a pattern for banners or a picture for pots.',
    group: 'looks',
    action: flows('painting', 'banner-pattern', 'pot-pattern'),
  },
  {
    id: 'sound',
    label: 'Make a sound or music',
    sentence: 'A music disc with your own song, or a goat horn call.',
    group: 'looks',
    action: flows('music-disc-item', 'goat-horn'),
  },
  {
    id: 'paint',
    label: 'Paint a picture',
    sentence: 'Draw a new picture, pixel by pixel.',
    group: 'looks',
    action: { type: 'paint' },
  },
  {
    id: 'commands',
    label: 'Make your mod do something',
    sentence: 'A command players type, or a creative tab of your own.',
    group: 'more',
    action: flows('custom-command', 'creative-tab'),
  },
  {
    id: 'rules',
    label: 'Make things happen',
    sentence: 'Rules: when something happens, do something. No code needed.',
    group: 'more',
    action: { type: 'rules' },
  },
  {
    id: 'ai',
    label: 'Build with the AI helper',
    sentence: 'Say what you want and let the AI helper build it.',
    group: 'more',
    action: { type: 'ai' },
  },
];

/** What decides which tiles show. */
export interface TileAvailability {
  /** Whether the Creator flow can be used on the project's target. */
  flowAvailable(flowId: string): boolean;
  /** Whether a library starter (not a flow) can be added on the project's target. */
  starterAvailable?(starterId: string): boolean;
  /** Whether "Surprise me" can make anything (default: yes). */
  surprise?: boolean;
  /** Whether the project can hold rule books (the rules kind is registered). */
  rules: boolean;
  /** Whether the AI helper is available. */
  ai: boolean;
}

/** A shown tile, with the flows it offers on this target (for flow tiles). */
export interface ShownTile {
  readonly tile: MakeTile;
  /** The available flows, in the tile's order (empty for the other tiles). */
  readonly flowIds: readonly string[];
  /** The available starters of a flows tile, in the tile's order (usually empty). */
  readonly starterIds: readonly string[];
}

/**
 * The tiles Home shows: flow tiles with at least one available flow or starter, and the others
 * when on.
 */
export function shownTiles(
  availability: TileAvailability,
  tiles: readonly MakeTile[] = MAKE_TILES,
): ShownTile[] {
  const out: ShownTile[] = [];
  for (const tile of tiles) {
    switch (tile.action.type) {
      case 'flows': {
        const flowIds = tile.action.flowIds.filter((id) => availability.flowAvailable(id));
        const starterIds = (tile.action.starterIds ?? []).filter(
          (id) => availability.starterAvailable?.(id) ?? false,
        );
        if (flowIds.length + starterIds.length > 0) out.push({ tile, flowIds, starterIds });
        break;
      }
      case 'surprise':
        if (availability.surprise ?? true) out.push({ tile, flowIds: [], starterIds: [] });
        break;
      case 'rules':
        if (availability.rules) out.push({ tile, flowIds: [], starterIds: [] });
        break;
      case 'ai':
        if (availability.ai) out.push({ tile, flowIds: [], starterIds: [] });
        break;
      default:
        out.push({ tile, flowIds: [], starterIds: [] });
    }
  }
  return out;
}
