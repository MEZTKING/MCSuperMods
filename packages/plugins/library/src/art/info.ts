/**
 * The recipe table's types (ADR 0092 D7, D9): what a recipe is, what a look asks for and what a
 * drawing gives back. The rows themselves live in the family files under `recipes/`, each
 * with its drawing function or none (a stub, drawn by the placeholder until its brief draws
 * it); `table.ts` joins them. Pure, no Node APIs.
 *
 * @packageDocumentation
 */

import type { PlaceholderPattern, Rgb } from '../assets/png';
import type { ArtImage } from './colour';

/**
 * Every recipe of ADR 0092 D7, by family: blocks, items, worn pictures, icons and particles.
 * The order is the table's order (`ART_RECIPE_INFO`), the contact sheet's and the dialog's.
 */
export const ART_RECIPE_IDS = Object.freeze([
  // Blocks
  'plain',
  'stone',
  'cobblestone',
  'polished_stone',
  'bricks',
  'pillar_side',
  'pillar_top',
  'ore',
  'deepslate_ore',
  'block',
  'block_front',
  'bark',
  'log_top',
  'stripped_log',
  'stripped_log_top',
  'planks',
  'door_top',
  'door_bottom',
  'trapdoor',
  'leaves',
  'sapling',
  'crop_stage0',
  'crop_stage1',
  'crop_stage2',
  'crop_stage3',
  'portal',
  'portal_frame',
  'dirt',
  'grass_top',
  'grass_side',
  'sand',
  'gravel',
  // Plants and pots (B518)
  'strand',
  'stalk',
  'lichen',
  'dripleaf',
  'pot',
  // Items
  'gem',
  'ingot',
  'disc',
  'spawn_egg',
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'spear',
  'mace',
  'knife',
  'boomerang',
  'ball',
  'bow',
  'bow_pulling_0',
  'bow_pulling_1',
  'bow_pulling_2',
  'crossbow',
  'crossbow_pulling_0',
  'crossbow_pulling_1',
  'crossbow_pulling_2',
  'crossbow_arrow',
  'crossbow_firework',
  'shield',
  'bottle',
  'flask',
  'totem',
  'smithing_template',
  'horse_armor',
  'wolf_armor',
  'helmet',
  'chestplate',
  'leggings',
  'boots',
  'fruit',
  'pie',
  'seeds',
  'produce',
  // Pattern items (B508)
  'pattern_sheet',
  'pottery_sherd',
  'glider',
  // Worn pictures
  'armor_layer_1',
  'armor_layer_2',
  'horse_armor_layer',
  'wolf_armor_layer',
  // Pattern pictures (B508)
  'banner_pattern',
  'shield_pattern',
  'trim_layer_1',
  'trim_layer_2',
  'glider_wings',
  'pot_pattern',
  // Icons and particles
  'effect_icon',
  'particle_spark',
  'particle_orb',
  'particle_puff',
  'particle_leaf',
] as const);

/** The id of a recipe: one kind of picture the generator draws (ADR 0092 D7). */
export type ArtRecipeId = (typeof ART_RECIPE_IDS)[number];

/**
 * What a picture is for: a block face (`block`), an item (`item`), a worn or mob texture
 * (`entity`), an effect icon (`icon`) or a particle picture (`particle`).
 */
export type ArtPictureKind = 'block' | 'item' | 'entity' | 'icon' | 'particle';

/** How much shade noise a drawing has: half (`smooth`), as tuned (`normal`) or 1.5 times. */
export type ArtDetail = 'smooth' | 'normal' | 'rough';

/** The noise factor of each {@link ArtDetail} (ADR 0092 D9). */
export const DETAIL_NOISE: Readonly<Record<ArtDetail, number>> = Object.freeze({
  smooth: 0.5,
  normal: 1,
  rough: 1.5,
});

/** One row of the recipe table (ADR 0092 D7). */
export interface ArtRecipeInfo {
  /** The recipe's id. */
  readonly id: ArtRecipeId;
  /** The recipe in words, for the Draw dialog's tiles ("Sword", "Planks", "Leaves"). */
  readonly label: string;
  /** What the picture is for. */
  readonly kind: ArtPictureKind;
  /** Width of one frame in pixels. */
  readonly width: number;
  /** Height of one frame in pixels. */
  readonly height: number;
  /** The number of frames (4 for particles, 1 otherwise). */
  readonly frames: number;
  /** How many colours the recipe takes: the main colour, and for some a second colour. */
  readonly colours: 1 | 2;
  /** The finishes the recipe offers (empty when it has none); the first is the default. */
  readonly finishes: readonly string[];
  /** Whether the picture tiles (its wrap-around seams look like its inside). */
  readonly tiles: boolean;
  /** Whether the picture has a dark one-pixel outline (items) or none (blocks). */
  readonly outline: boolean;
  /** Whether the recipe draws its own picture; a stub (`false`) falls back to the placeholder. */
  readonly drawn: boolean;
}

/** A look the user picks (ADR 0092 D9): what to draw, in which colours, how and which variation. */
export interface ArtLook {
  /** What to draw. */
  readonly recipe: ArtRecipeId;
  /** The main colour. */
  readonly colour: Rgb;
  /** The second colour, for recipes that take one; each has its own default. */
  readonly accent?: Rgb | undefined;
  /** One of the recipe's finishes; defaults to its first. */
  readonly finish?: string | undefined;
  /** How much shade noise; defaults to `normal`. */
  readonly detail?: ArtDetail | undefined;
  /** The variation; the same look always gives the same bytes. Defaults to 0. */
  readonly seed?: number | undefined;
}

/**
 * A drawing: `frames` pictures of `width` by `height`, one after the other in `data` (a
 * vertical strip, row-major RGBA, 4 bytes per pixel).
 */
export interface ArtPixels {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly data: Uint8Array;
}

/** What a recipe's drawing function gets: the look resolved to numbers. */
export interface DrawContext {
  /** The main colour. */
  readonly colour: Rgb;
  /** The second colour as asked, or undefined (the recipe picks its default). */
  readonly accent: Rgb | undefined;
  /** The finish as asked, or the recipe's first finish, or undefined when it has none. */
  readonly finish: string | undefined;
  /** The noise factor ({@link DETAIL_NOISE}). */
  readonly noise: number;
  /** The variation seed. */
  readonly seed: number;
  /** The hue shift in degrees at the ends of a ramp. */
  readonly hueShift: number;
}

/**
 * A recipe's drawing function. It returns one picture (an {@link ArtImage}) for one-frame
 * recipes, or an {@link ArtPixels} strip of every frame.
 */
export type ArtDrawer = (context: DrawContext) => ArtImage | ArtPixels;

/** A row of the table with its drawing function (none for a stub) and its placeholder. */
export interface ArtRecipeEntry {
  readonly info: ArtRecipeInfo;
  /** The placeholder pattern a stub draws, and that a drawing replaces. */
  readonly fallback: PlaceholderPattern;
  /** The drawing; undefined for a stub. */
  readonly draw: ArtDrawer | undefined;
}

/** The parts of a row a family file writes; the rest follow from the kind. */
export interface RecipeRow {
  readonly id: ArtRecipeId;
  readonly label: string;
  readonly kind: ArtPictureKind;
  /** The placeholder pattern this recipe stands in for (stubs draw it). */
  readonly fallback: PlaceholderPattern;
  readonly width?: number;
  readonly height?: number;
  readonly frames?: number;
  readonly colours?: 1 | 2;
  readonly finishes?: readonly string[];
  /** Defaults to false. */
  readonly tiles?: boolean;
  /** Defaults to true for items and false otherwise. */
  readonly outline?: boolean;
}

/**
 * A table entry from a family file's row: 16 by 16, one frame, one colour, no finish unless
 * the row says otherwise; `drawn` is true exactly when `draw` is given.
 */
export function recipeEntry(row: RecipeRow, draw?: ArtDrawer): ArtRecipeEntry {
  return Object.freeze({
    info: Object.freeze({
      id: row.id,
      label: row.label,
      kind: row.kind,
      width: row.width ?? 16,
      height: row.height ?? 16,
      frames: row.frames ?? 1,
      colours: row.colours ?? 1,
      finishes: Object.freeze([...(row.finishes ?? [])]),
      tiles: row.tiles ?? false,
      outline: row.outline ?? row.kind === 'item',
      drawn: draw !== undefined,
    }),
    fallback: row.fallback,
    draw,
  });
}
