/** The plants and storage topic (moved from system-prompt.ts, B681; wording unchanged). */
import { list } from './core';

/**
 * The plant, pot, storage, sound and vanilla block rule templates of vanilla parity 3 batch 1
 * (ADR 0112 D2, B518), in the plugin's order; `app/test/ai-plants-storage.test.ts` pins them.
 * The copper-like rod is among {@link VANILLA_PARITY_PROMPT_TEMPLATES}.
 */
export const PLANTS_STORAGE_PROMPT_TEMPLATES = Object.freeze([
  'msm_block_berry_vine',
  'msm_block_water_strand',
  'msm_block_hanging_strand',
  'msm_block_cane',
  'msm_block_cactus',
  'msm_block_bamboo_stalk',
  'msm_block_glowing_lichen',
  'msm_block_tipping_leaf',
  'msm_block_flower_pot',
  'msm_block_double_chest',
  'msm_block_player_chest',
  'msm_block_own_sounds',
  'msm_block_door_own_sounds',
  'msm_vanilla_block_rules',
]);

/** The answers of existing flows that vanilla parity 3 batch 1 added, by flow (B518). */
export const PLANTS_STORAGE_FLOW_ANSWERS = Object.freeze({
  'storage-crate': Object.freeze(['double', 'per_player']),
  'wood-set': Object.freeze(['door_sounds', 'door_sound_file']),
  'copper-set': Object.freeze(['members']),
} as const);

/**
 * The problem codes of the plant, pot, storage, sound and vanilla block rule validators the
 * prompt explains (ADRs 0103 to 0105); pinned against the plugin's code lists.
 */
export const PLANTS_STORAGE_PROMPT_CODES = Object.freeze([
  'blocks-items.dripleaf-grows-into-missing',
  'blocks-items.dripleaf-grows-into-big',
  'blocks-items.dripleaf-tilt-small',
  'blocks-items.dripleaf-grows-into-not-big',
  'blocks-items.column-min-above-max',
  'blocks-items.water-plant-feature-dry',
  'blocks-items.water-plant-grows-down',
  'blocks-items.berries-ignore-bonemeal',
  'blocks-items.pot-plant-repeated',
  'blocks-items.pot-plant-unfit',
  'blocks-items.pot-plant-also-potted',
  'blocks-items.potted-plant-pot-not-pot',
  'blocks-items.double-chest-layout',
  'blocks-items.double-chest-type',
  'blocks-items.per-player-conflict',
  'blocks-items.per-player-hoppers',
  'blocks-items.ageing-container-mismatch',
  'blocks-items.machine-cannot-age',
  'blocks-items.block-sound-unknown',
  'blocks-items.block-sounds-partial',
  'blocks-items.block-sounds-range',
  'blocks-items.sound-type-unknown',
  'blocks-items.set-type-field-unused',
  'blocks-items.vanilla-pair-override',
  'blocks-items.vanilla-rule-duplicate',
  'blocks-items.vanilla-rule-same-block',
  'blocks-items.vanilla-rule-project-block',
]);

/**
 * Vanilla parity 3 batch 1 (ADRs 0103 to 0106, ADR 0112 D2): growing and climbing plants,
 * project flower pots, own sounds and set types, flattening and tilling, rules for vanilla
 * blocks, the four data-only flows, and the limits in plain words (B522).
 */
export const PLANTS_AND_STORAGE = `- Growing and climbing plants: an "msm:block" also takes the types "growing_plant" (a tip that leaves a strand behind it as it grows, as kelp, weeping, twisting and cave vines do: direction "up" or "down"; max_age 0 to 25, the age a placed tip starts at, so a strand grows at most 26 blocks; growth_chance 0 to 1 a random tick; bonemeal_growth { min, max }; needs_water, kelp-like: placed only in water, always waterlogged and growing up; berries { item, light }, picked by using it and glowing while ripe, where bone meal ripens the berries instead of growing it; climbable; soil, 1 to 16 block ids or "#" tags, default any solid face), "column_plant" (style "cane", "cactus" or "bamboo"; max_height 1 to 32, default 3, bamboo 16; min_height, the shortest stop, never above max_height; soil, default vanilla's tags for the style, target_facts blocks.plantSoils; needs_water_nearby, default true for cane; touch_damage, default 1 for cactus; bamboo grows from a shoot, with leaves near its top), "multiface" (covers any side of the blocks around it, as glow lichen: light, default 7; spreads with bone meal, default true; waterloggable, default true), "dripleaf" (size "big": a leaf on a stem that tips under whoever stands on it after tilt_ticks [2, 10, 10] and grows a block taller with bone meal; size "small": two blocks high, with grows_into, a big dripleaf of this project, which bone meal turns it into) and "flower_pot" (an empty pot of the project's own; plants: 1 to 64 vanilla or project plant blocks that have an item and are not two blocks high; vanilla's flower pot is not changed and takes none of them). A "potted_plant" takes pot (default "minecraft:flower_pot"), so a project plant goes into a project pot; never also list it in that pot's plants. Texture slots: growing_plant head and body (with berries also head_berries and body_berries); column_plant all for cane, side, top and bottom for cactus, stalk, leaves_small, leaves_large and shoot for bamboo; multiface all; dripleaf top, side, tip and stem (small: top, side, stem_top and stem_bottom); flower_pot pot, dirt and item. MSM makes the strand "<id>_plant", a bamboo's shoot "<id>_shoot", a big dripleaf's stem "<id>_stem" and a pot's potted blocks "<pot path>_<plant path>" itself: never create elements with those ids.
- Own sounds and set types: "block_sounds" on an "msm:block" ({ break, step, place, hit, fall, each a vanilla or project sound event, volume 0 to 10, pitch 0.25 to 4 }) gives a block its own sounds; the events left out are its "sound_type"'s (any vanilla sound type name of target_facts blocks.soundTypes). Where target_facts blocks.soundModel is "block_sound_set" MSM writes the sounds as a data entry and a change shows after the world is opened again. A door, trapdoor, button or pressure plate's set_type can be an object of its own: { base (a vanilla set type, default "wood", the source of every unset field), sounds { open, close, press, release }, can_open_by_hand, can_open_by_wind_charge, arrows_press, plate_sensitivity "everything" (items too, as wooden plates) or "mobs" (as stone plates) }; a button or plate uses only press and release, a door or trapdoor only open and close. Block components "msm:flattenable" ({ into }: a shovel makes it into another block, as dirt into a path) and "msm:tillable" ({ into, drops? }: a hoe, as dirt into farmland), beside "msm:strippable"; both need air above the block. Rules for Minecraft's own blocks are the addition kind "msm:vanilla_block_rules" ({ format: 1, strip, flatten, till (with drops), wax, age (block and next) and burn (block, burn_odds and ignite_odds, 0 to 300), each a list of { block, into } }); never give a project block a rule there: use its components instead. A rule for a block vanilla already pairs (an axe strips oak logs, a shovel makes grass into a path) replaces vanilla's and warns; "age" rules work only for blocks that already age as copper, and only on some targets: on the others the game skips them with a warning in its log, so tell the user to check it in the game.
- Prefer the flows for these, run with add_starter: "Cave plants" (cave-plants: plant_name, kind "cave_vine", "weeping", "twisting", "kelp" or "lichen", colour, berry_colour, light), "Desert plants" (desert-plants: plant_name, kind "cane", "cactus", "bamboo" or "dripleaf", colour, height "usual", "taller" or "shorter", uses), "Flower pot" (flower-pot: pot_name, colour, plants, ingredient), the Storage crate answers ${list(PLANTS_STORAGE_FLOW_ANSWERS['storage-crate'])}, the Wood set answers ${list(PLANTS_STORAGE_FLOW_ANSWERS['wood-set'])} ("wood", "iron", "copper" or "barrel", or an Ogg file of the user's own) and the Copper set's members, which now also take rod, button, pressure_plate, fence, fence_gate, wall and chest (a chest that joins into a double chest). Four flows work in plain vanilla packs: "Banner pattern" (banner-pattern: pattern_name, shape, colour, ingredient), "Armour trim" (armour-trim: trim_name, style, template_item, copy_block, colour), "Glider" (glider: glider_name, durability, colour, material) and "Pot pattern" (pot-pattern: pattern_name, picture, colour, ingredient); their pattern item, template, glider and sherd are vanilla items with components, so a plain item of the same type also works where a recipe names it. Templates: ${list(PLANTS_STORAGE_PROMPT_TEMPLATES)}. Read kind_schema for "msm:block" or "msm:vanilla_block_rules" before writing by hand.
- Limits to tell the user plainly: these plants, pots, storage options, own sounds and rules for vanilla blocks need the Fabric mod jar (vanilla packs leave them out, "export.needs-jar" for the rules) and a game restart; a project pot holds only the plants it lists, and a plant that vanilla pots with a model of its own (cactus, bamboo, azalea) looks flat in it; taking a plant out of a pot does not count towards "flowers potted"; a small dripleaf needs a big dripleaf of the project; a plant that lives in water placed by a world feature needs a water check in that feature; vine-like strands drop only to shears or Silk Touch, or sometimes by luck, and glow-lichen-like plants and small dripleaves only to shears; lightning ignores waxed blocks, walks only through project blocks, and project rods do not attract it (only vanilla's lightning rod does); copper golems do not wax or scrape project blocks; a double chest always holds water; a per-player chest's contents follow the player, not the block, one store per block id; a machine cannot age; a spawner takes a project mob from its spawn egg; the Java project export leaves out the rules for vanilla blocks ("export.not-in-eject") and skips listed pot plants that are missing or two blocks high.
- Explain and fix their problems in plain words: "blocks-items.dripleaf-grows-into-missing", "blocks-items.dripleaf-grows-into-big", "blocks-items.dripleaf-grows-into-not-big" and "blocks-items.dripleaf-tilt-small" (a small leaf needs grows_into naming a big dripleaf of the project, and only a big one tilts), "blocks-items.column-min-above-max" (lower min_height), "blocks-items.water-plant-feature-dry" (place it only where there is water), "blocks-items.water-plant-grows-down" (make it grow up), "blocks-items.berries-ignore-bonemeal" (remove bonemeal_growth or the berries), "blocks-items.pot-plant-repeated", "blocks-items.pot-plant-unfit" and "blocks-items.pot-plant-also-potted" (each plant once, with an item, one block high, and not also potted by a potted_plant naming that pot), "blocks-items.potted-plant-pot-not-pot" (pot must be a flower pot), "blocks-items.double-chest-layout" and "blocks-items.double-chest-type" (3 rows, no keep_contents, type block or horizontal), "blocks-items.per-player-conflict" (not with keep_contents or double), "blocks-items.per-player-hoppers" (a note: hoppers and comparators reach nothing), "blocks-items.ageing-container-mismatch" (give every stage the same slots), "blocks-items.machine-cannot-age" (a machine never ages or is waxed: remove msm:weathering and msm:waxable from it), "blocks-items.block-sound-unknown" (a vanilla sound or one in the project's sounds), "blocks-items.block-sounds-partial" and "blocks-items.block-sounds-range" (notes on targets with data-driven sounds: give every event, a pitch of at most 2 and no volume of 0), "blocks-items.sound-type-unknown" (pick a name of target_facts blocks.soundTypes), "blocks-items.set-type-field-unused" (a note: remove the field), "blocks-items.vanilla-pair-override" (a note: the rule replaces vanilla's pair), "blocks-items.vanilla-rule-duplicate" and "blocks-items.vanilla-rule-same-block" (keep one rule, pick another block) and "blocks-items.vanilla-rule-project-block" (use the block's own component).`;
