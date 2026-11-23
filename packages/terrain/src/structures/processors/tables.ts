/**
 * Block tables of the processors that carry their own (B638), written from what the spike B634's
 * before-and-after worlds showed for its 40 candidate blocks on both targets (results
 * `processors-*.json`, fixtures `blackstone`, `age0`, `age50`, `age100`, `lava`). Nothing here is
 * read from the game's code; a block the spike did not try is left unchanged by these tables.
 */

/** `blackstone_replace`: the same fixed table in all 18 placements; other inputs unchanged. */
export const BLACKSTONE_TABLE: Readonly<Record<string, string>> = Object.freeze({
  'minecraft:stone': 'minecraft:polished_blackstone',
  'minecraft:cobblestone': 'minecraft:blackstone',
  'minecraft:mossy_cobblestone': 'minecraft:blackstone',
  'minecraft:stone_bricks': 'minecraft:polished_blackstone_bricks',
  'minecraft:mossy_stone_bricks': 'minecraft:polished_blackstone_bricks',
  'minecraft:cracked_stone_bricks': 'minecraft:cracked_polished_blackstone_bricks',
  'minecraft:chiseled_stone_bricks': 'minecraft:chiseled_polished_blackstone',
  'minecraft:stone_stairs': 'minecraft:polished_blackstone_stairs',
  'minecraft:cobblestone_stairs': 'minecraft:blackstone_stairs',
  'minecraft:stone_brick_stairs': 'minecraft:polished_blackstone_brick_stairs',
  'minecraft:stone_slab': 'minecraft:polished_blackstone_slab',
  'minecraft:smooth_stone_slab': 'minecraft:polished_blackstone_slab',
  'minecraft:cobblestone_slab': 'minecraft:blackstone_slab',
  'minecraft:stone_brick_slab': 'minecraft:polished_blackstone_brick_slab',
  'minecraft:cobblestone_wall': 'minecraft:blackstone_wall',
  'minecraft:stone_brick_wall': 'minecraft:polished_blackstone_brick_wall',
  'minecraft:iron_bars': 'minecraft:iron_chain',
});

/** Whether a replaced block keeps its properties (stairs, slabs and walls keep their shape). */
export function keepsShape(id: string): boolean {
  return id.endsWith('_stairs') || id.endsWith('_slab') || id.endsWith('_wall');
}

/**
 * `block_age`, about right. What the worlds showed, per group of the candidates:
 * - whole stone blocks (stone, stone bricks, chiseled stone bricks): stay about half the time,
 *   else a block or stairs, mossy with chance `mossiness` (cracked stone bricks or stone brick
 *   stairs; mossy stone bricks or mossy stone brick stairs);
 * - stairs of the stone family: stay about half the time, else a slab or stairs (stone or stone
 *   brick slab; mossy stone brick slab or stairs with chance `mossiness`);
 * - slabs and walls of the stone family: their mossy stone brick form with chance `mossiness`;
 * - obsidian: now and then crying obsidian.
 */
export const AGE_WHOLE = new Set([
  'minecraft:stone',
  'minecraft:stone_bricks',
  'minecraft:chiseled_stone_bricks',
]);
export const AGE_STAIRS = new Set([
  'minecraft:stone_stairs',
  'minecraft:cobblestone_stairs',
  'minecraft:stone_brick_stairs',
]);
export const AGE_SLABS = new Set([
  'minecraft:stone_slab',
  'minecraft:smooth_stone_slab',
  'minecraft:cobblestone_slab',
  'minecraft:stone_brick_slab',
]);
export const AGE_WALLS = new Set(['minecraft:cobblestone_wall', 'minecraft:stone_brick_wall']);
/** The share of obsidian that turned crying (0 to 2 of 6 in the worlds). */
export const AGE_CRYING_CHANCE = 0.15;

/** Name endings of blocks that do not fill their cell (`lava_submerged_block`). */
const PARTIAL_ENDINGS = [
  '_slab',
  '_stairs',
  '_wall',
  '_button',
  '_pressure_plate',
  '_fence',
  '_fence_gate',
  '_pane',
  '_door',
  '_trapdoor',
  '_sign',
  '_carpet',
  '_torch',
  '_rail',
  '_bars',
  'chest',
  'lantern',
  'chain',
  'ladder',
  'torch',
  'rail',
  'lever',
];

/**
 * Whether a block fills its cell, by name (MSM's own rule): the spike saw slabs, stairs, walls,
 * buttons, plates, bars and a chest left out over lava and whole blocks placed.
 */
export function isFullBlock(id: string): boolean {
  const name = id.slice(id.indexOf(':') + 1);
  return !PARTIAL_ENDINGS.some((end) => name.endsWith(end));
}
