/** Adding to vanilla content, potions and more data kinds (B681; counts from constants, B682). */
import { andList, countWord } from './core';
import { notAvailable } from './not-available';

/** The mob variant kinds the paragraph names, with their words (in the prompt's order). */
export const MOB_VARIANT_PROMPT_KINDS = Object.freeze({
  'minecraft:wolf_variant': 'wolf',
  'minecraft:cat_variant': 'cat',
  'minecraft:pig_variant': 'pig',
  'minecraft:cow_variant': 'cow',
  'minecraft:chicken_variant': 'chicken',
  'minecraft:frog_variant': 'frog',
  'minecraft:zombie_nautilus_variant': 'zombie nautilus',
} as const);

/** The tag kinds of vanilla parity 2 the paragraph counts ("eight more tag kinds"), with their words. */
export const MORE_TAG_PROMPT_KINDS = Object.freeze({
  'minecraft:tag/banner_pattern': 'banner pattern',
  'minecraft:tag/dialog': 'dialog',
  'minecraft:tag/instrument': 'instrument',
  'minecraft:tag/point_of_interest_type': 'point of interest type',
  'minecraft:tag/potion': 'potion',
  'minecraft:tag/timeline': 'timeline',
  'minecraft:tag/worldgen/feature': 'worldgen feature',
  'minecraft:tag/worldgen/flat_level_generator_preset': 'flat level generator preset',
} as const);

/** The other data and resource pack kinds the paragraph names in words. */
export const MORE_DATA_PROMPT_KINDS = Object.freeze({
  'minecraft:enchantment_provider': 'enchantment providers',
  'minecraft:trial_spawner': 'trial spawners',
  'minecraft:timeline': 'timelines',
  'minecraft:world_clock': 'world clocks',
  'minecraft:font': 'fonts',
  'minecraft:atlas': 'atlases',
} as const);

const words = (record: Readonly<Record<string, string>>): string =>
  Object.values(record).join(', ');
export const VANILLA_ADDITIONS = `- Adding to vanilla content: to make something generate in vanilla biomes, write a "minecraft:worldgen/feature" (for an ore, type "minecraft:ore" with flat fields size, discard_chance_on_air_exposure and targets of { "target": { "predicate_type": "minecraft:tag_match", "tag": "minecraft:stone_ore_replaceables" }, "state": "<block id>" }, one for "minecraft:stone_ore_replaceables" and one for "minecraft:deepslate_ore_replaceables", the tags vanilla ores use, so the ore also replaces granite, diorite and andesite), a "minecraft:worldgen/placed_feature" that places it (count, in_square, height_range, biome) and an "msm:biome_addition" ({ format: 1, biomes: ids or "#" tags such as "#minecraft:is_overworld", features: [{ feature: <placed feature id>, step: "underground_ores" }], or spawns: [{ entity, category, weight, min_group, max_group }] }). Only newly generated chunks get the feature. To add a drop to a vanilla mob, block or chest without replacing its table, write an "msm:loot_addition" ({ format: 1, tables: [vanilla loot table ids], pools: [vanilla loot pools] }); the vanilla pools stay and a world data pack that replaces the table wins. Pools are checked against the target's vanilla loot pool, so read kind_schema: a pool has one "condition" (a predicate keyed by "type"; "minecraft:all_of" with "terms" for several) and entries take "modifier", not "conditions" or "functions". A furnace fuel or compostable item is the element-only "fuel": { "burn_seconds": n } or "compost": "30%" | "50%" | "65%" | "85%" | "100%" on an "msm:item" or on a block's "item"; never write the vanilla cooking_fuel or compostable components by hand. A new trade for a vanilla villager is a "minecraft:villager_trade" plus the vanilla tag "minecraft:<profession>/level_<n>" (kind "minecraft:tag/villager_trade") listing it; it is a candidate the villager may offer, not a certainty. Prefer the Custom ore (it generates by default), Extra drop and Villager trade starters when they match. Biome and loot additions need the Fabric mod jar export; vanilla packs leave them out.`;

export const POTIONS = `- Potions: a brewable potion is an "msm:potion" element (display_name; effects as { id, duration_ticks, amplifier }; "brewing" with a base potion, default "minecraft:awkward", and a reagent; optional "long" and "strong" variants, each with its own duration, amplifier and reagent; "splash" and "lingering" booleans, default true). It lowers to a registered potion, so it shows in the creative tabs, /give, loot and tipped arrows, and its colour comes from its effects. Never write brewing recipe files by hand for a project potion. Potions work only in the Fabric mod jar; a vanilla pack export leaves them out and MSM warns. Prefer the Potion creator flow (list_starters, then read kind_schema before writing data by hand); to brew an existing effect, propose an "msm:potion" for it.`;

export const MORE_DATA_KINDS = `- More data kinds, all plain files that also work in vanilla packs: mob variants (${words(MOB_VARIANT_PROMPT_KINDS)}) add a skin for a biome, so prefer the "Mob skin" flow; "minecraft:instrument" with a recipe whose result is "minecraft:goat_horn" is a new goat horn, so prefer the "Goat horn" flow; there are also kinds for ${andList(Object.values(MORE_DATA_PROMPT_KINDS))} (resource pack), and ${countWord(Object.keys(MORE_TAG_PROMPT_KINDS).length)} more tag kinds (${words(MORE_TAG_PROMPT_KINDS)}). Vanilla parity 3 adds "minecraft:decorated_pot_pattern" (a decorated pot face; prefer the "Pot pattern" flow), "minecraft:block_transformer" (what a tool does to a block; named "minecraft:axe", "minecraft:shovel" or "minecraft:hoe" it changes vanilla's tools), "minecraft:test_environment" and "minecraft:test_instance" (game tests for map makers, run with /test), "minecraft:sulfur_cube_archetype" (its fields differ between targets), "minecraft:context_int_provider" and "minecraft:context_float_provider" (named numbers the game reads, such as a compost chance; one named after a vanilla one changes it), and in the resource pack "minecraft:post_effect" (a screen effect), "minecraft:shader" (a shader program) and "minecraft:waypoint_style" (a locator bar dot). The .vsh, .fsh and .glsl files a shader names are raw files under shaders/ that the user imports (Import assets, Shaders); you cannot write them, MSM does not check them and a mistake shows only in the game. ${notAvailable('wolf-sound-variants')} Read kind_schema before use. A project sound in any vanilla sound field (a variant or an instrument) must be written as { "sound_id": "namespace:event" }.`;
