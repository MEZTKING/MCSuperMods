/**
 * Tool and tier names and the vanilla block tags they lower to (ADR 0025 D5). Mining with the
 * right tool and the tier needed for drops are vanilla block tags, not registry properties:
 * `minecraft:mineable/<tool>` and `minecraft:needs_<tier>_tool`. Every tag name here is checked
 * against each built-in target's vendored block tags in the tests; the validator
 * `blocks-items.unknown-tool-tier` checks a tier against the target's
 * `minecraft:incorrect_for_<tier>_tool` tag, so a target without a tier reports it.
 */

/** Tools whose `minecraft:mineable/<tool>` tag a block can join. */
export const BLOCK_TOOLS = Object.freeze(['pickaxe', 'axe', 'shovel', 'hoe'] as const);

/** Tool tiers of the MSM definition format, as written in element data. */
export const TOOL_TIERS = Object.freeze([
  'wood',
  'stone',
  'copper',
  'iron',
  'diamond',
  'gold',
  'netherite',
] as const);

/** A tool tier name. */
export type ToolTier = (typeof TOOL_TIERS)[number];

const isToolTier = (tier: string): tier is ToolTier =>
  (TOOL_TIERS as readonly string[]).includes(tier);

/**
 * The tier's name in vanilla tag ids, which say `wooden` where the format says `wood`.
 */
export function vanillaTierName(tier: string): string {
  return tier === 'wood' ? 'wooden' : tier;
}

/**
 * The block tag a tool tier's tool material refuses to mine: `incorrect_for_<tier>_tool`.
 * A target knows a tier exactly when it has this tag.
 */
export function incorrectForTierTag(tier: string): string {
  return `minecraft:incorrect_for_${vanillaTierName(tier)}_tool`;
}

/**
 * The `needs_<tier>_tool` tag a block with `min_tier` joins, by mining level: wood and gold
 * mine everything that needs no tag; copper mines what stone mines; netherite what diamond
 * mines. Vanilla has needs tags for stone, iron and diamond only.
 */
const NEEDS_TIER_TAG: Readonly<Record<ToolTier, string | undefined>> = Object.freeze({
  wood: undefined,
  gold: undefined,
  stone: 'needs_stone_tool',
  copper: 'needs_stone_tool',
  iron: 'needs_iron_tool',
  diamond: 'needs_diamond_tool',
  netherite: 'needs_diamond_tool',
});

/**
 * The path of the needs-tier tag (under `minecraft:`) for `tier`, or `undefined` when the
 * tier needs no tag or is unknown (the validator reports unknown tiers).
 */
export function needsTierTag(tier: string): string | undefined {
  return isToolTier(tier) ? NEEDS_TIER_TAG[tier] : undefined;
}

/** Every needs-tier tag path {@link needsTierTag} can return, sorted. */
export const NEEDS_TIER_TAGS: readonly string[] = Object.freeze(
  [...new Set(Object.values(NEEDS_TIER_TAG).filter((tag) => tag !== undefined))].sort(),
);
