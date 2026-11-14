/**
 * Home's "Make something" tiles (ADR 0083 D2), in the ADR's order, and what each opens: Creator
 * flows by flow id (the library's starters with `creator`), the Rule book, the picture painter
 * or the AI helper. A tile whose flows are all unavailable on the project's target is hidden.
 * Pure: no DOM, so it runs in Node tests.
 *
 * @packageDocumentation
 */

/** What a tile opens. */
export type MakeTileAction =
  /** The Creator with these flows (one flow opens it directly; several open a chooser). */
  | { readonly type: 'flows'; readonly flowIds: readonly string[] }
  /** The project's Rule book (created on first use). */
  | { readonly type: 'rules' }
  /** The picture painter, for a new picture. */
  | { readonly type: 'paint' }
  /** The AI helper's Build mode. */
  | { readonly type: 'ai' };

/** One "Make something" tile. */
export interface MakeTile {
  /** Stable id; the tile's test id is `home-tile-<id>`. */
  readonly id: string;
  /** The tile's words. */
  readonly label: string;
  /** One short sentence under the label. */
  readonly sentence: string;
  readonly action: MakeTileAction;
}

const flows = (...flowIds: string[]): MakeTileAction => ({ type: 'flows', flowIds });

/** The tiles, in the order Home shows them. */
export const MAKE_TILES: readonly MakeTile[] = [
  {
    id: 'block',
    label: 'Make a block',
    sentence: 'A new block, an ore, stone bricks, a crate or a machine.',
    action: flows('simple-block', 'custom_ore', 'stone-set', 'storage-crate', 'machine'),
  },
  {
    id: 'item',
    label: 'Make an item',
    sentence: 'Something to throw, a totem, a music disc or a horn.',
    action: flows('throwable', 'totem', 'music-disc-item', 'goat-horn'),
  },
  {
    id: 'tool',
    label: 'Make a tool or weapon',
    sentence: 'A sword, a whole set of tools, or a new enchantment.',
    action: flows('weapon', 'gear-set', 'enchantment'),
  },
  {
    id: 'armour',
    label: 'Make armour',
    sentence: 'Helmet, chestplate, leggings and boots of a new material.',
    action: flows('gear-set'),
  },
  {
    id: 'food',
    label: 'Make food',
    sentence: 'Something to eat or drink.',
    action: flows('food', 'consumable'),
  },
  {
    id: 'mob',
    label: 'Make a mob',
    sentence: 'A new creature, a flying or swimming one, or a boss.',
    action: flows('custom_mob', 'flying-mob', 'water-mob', 'boss', 'mob-skin'),
  },
  {
    id: 'pet',
    label: 'Make a pet or animal',
    sentence: 'A pet to tame, a farm animal or something to ride.',
    action: flows('pet', 'farm-animal', 'mount'),
  },
  {
    id: 'plant',
    label: 'Make a plant or tree',
    sentence: 'A crop to grow, a tree, or a whole set of wood.',
    action: flows('crop', 'tree', 'wood-set'),
  },
  {
    id: 'potion',
    label: 'Make a potion or effect',
    sentence: 'A potion to brew, a new effect, or sparkles.',
    action: flows('potion', 'status-effect', 'particle'),
  },
  {
    id: 'portal',
    label: 'Make a portal',
    sentence: 'A portal frame, or a whole new world to travel to.',
    action: flows('portal', 'dimension'),
  },
  {
    id: 'rules',
    label: 'Make things happen',
    sentence: 'Rules: when something happens, do something. No code needed.',
    action: { type: 'rules' },
  },
  {
    id: 'paint',
    label: 'Paint a picture',
    sentence: 'Draw a new picture, pixel by pixel.',
    action: { type: 'paint' },
  },
  {
    id: 'ai',
    label: 'Build with the AI helper',
    sentence: 'Say what you want and let the AI helper build it.',
    action: { type: 'ai' },
  },
];

/** What decides which tiles show. */
export interface TileAvailability {
  /** Whether the Creator flow can be used on the project's target. */
  flowAvailable(flowId: string): boolean;
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
}

/** The tiles Home shows: flow tiles with at least one available flow, and the others when on. */
export function shownTiles(
  availability: TileAvailability,
  tiles: readonly MakeTile[] = MAKE_TILES,
): ShownTile[] {
  const out: ShownTile[] = [];
  for (const tile of tiles) {
    switch (tile.action.type) {
      case 'flows': {
        const flowIds = tile.action.flowIds.filter((id) => availability.flowAvailable(id));
        if (flowIds.length > 0) out.push({ tile, flowIds });
        break;
      }
      case 'rules':
        if (availability.rules) out.push({ tile, flowIds: [] });
        break;
      case 'ai':
        if (availability.ai) out.push({ tile, flowIds: [] });
        break;
      default:
        out.push({ tile, flowIds: [] });
    }
  }
  return out;
}
