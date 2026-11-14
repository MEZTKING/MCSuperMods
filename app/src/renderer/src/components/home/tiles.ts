/**
 * Home's "Make something" tiles (ADR 0083 D2, ADR 0086 D8) under their headings, and what each
 * opens: "Surprise me", Creator flows by flow id (the library's starters with `creator`), other
 * library starters by id, the Rule book, the picture painter or the AI helper. A tile whose
 * flows and starters are all unavailable on the project's target is hidden.
 * Pure: no DOM, so it runs in Node tests.
 *
 * @packageDocumentation
 */

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
const choices = (flowIds: string[], starterIds: string[]): MakeTileAction => ({
  type: 'flows',
  flowIds,
  starterIds,
});

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
    sentence: 'A new block, an ore or a stone with stairs and slabs.',
    group: 'blocks',
    action: flows('simple-block', 'custom_ore', 'stone-set'),
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
    sentence: 'Something to throw, or a totem that saves you.',
    group: 'blocks',
    action: flows('throwable', 'totem'),
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
    sentence: 'Helmet, chestplate, leggings and boots of a new material.',
    group: 'blocks',
    action: flows('gear-set'),
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
    label: 'Make a painting',
    sentence: 'A painting of your own picture to hang on a wall.',
    group: 'looks',
    action: flows('painting'),
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
