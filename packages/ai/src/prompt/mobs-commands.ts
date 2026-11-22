/** The mobs and commands topic (moved from system-prompt.ts, B681; wording unchanged). */
import { list } from './core';

/** The templates of vanilla parity 3 batch 2 the prompt names (ADRs 0107, 0109 to 0111; B530, B531, B535). */
export const MOBS_COMMANDS_PROMPT_TEMPLATES = Object.freeze([
  'msm_entity_bucket_fish',
  'msm_entity_hovering',
  'msm_entity_swooping',
  'msm_entity_phasing',
  'msm_entity_roosting',
  'msm_entity_collector',
  'msm_entity_digger',
  'msm_entity_barterer',
  'msm_entity_dash_mount',
  'msm_villager_type',
  'msm_item_boat',
  'msm_game_rule_switch',
  'msm_game_rule_number',
  'msm_stat_counter',
  'msm_stat_time',
]);

/** The answers of existing flows that vanilla parity 3 batch 2 added, by flow (B539). */
export const MOBS_COMMANDS_FLOW_ANSWERS = Object.freeze({
  'wandering-merchant': Object.freeze(['remembers', 'gift', 'demand', 'work_site', 'barters']),
  pet: Object.freeze(['shoulder_side', 'fetches', 'digs']),
  'water-mob': Object.freeze(['bucket', 'plays_dead']),
  'flying-mob': Object.freeze(['flight', 'swoops', 'roosts']),
  mount: Object.freeze(['dashes']),
  fluid: Object.freeze(['mixes_into', 'cauldron']),
  'wood-set': Object.freeze(['boats']),
  'custom-command': Object.freeze(['own_rule']),
  'creative-tab': Object.freeze(['extra_items']),
} as const);

/**
 * The problem codes of fish buckets, flight, habits, boats, fluid cauldrons and mixing, game
 * rules, statistics and hand-ordered tabs the prompt explains (ADRs 0108 to 0111); in the
 * plugins' order.
 */
export const MOBS_COMMANDS_PROMPT_CODES = Object.freeze([
  'entities.bucketable-needs-swim',
  'entities.bucket-fields-unused',
  'entities.dash-needs-walk',
  'entities.swoop-needs-flight',
  'entities.hover-height-unused',
  'entities.habit-loot-table-unknown',
  'entities.dig-block-unknown',
  'entities.collect-without-owner',
  'blocks-items.boat-chest-clash',
  'blocks-items.boat-planks-missing',
  'blocks-items.boat-texture-missing',
  'blocks-items.boat-fields-unused',
  'blocks-items.cauldron-id-clash',
  'blocks-items.cauldron-levels-ignored',
  'blocks-items.fluid-mixing-empty',
  'blocks-items.fluid-mixing-self',
  'blocks-items.fluid-mixing-duplicate',
  'blocks-items.fluid-mixing-liquid-result',
  'blocks-items.creative-tab-items-unused',
  'blocks-items.creative-tab-items-missing',
  'blocks-items.creative-tab-item-unknown',
  'blocks-items.creative-tab-item-repeated',
  'game-rules.min-above-max',
  'game-rules.default-out-of-range',
  'game-rules.range-on-boolean',
  'game-rules.vanilla-clash',
  'game-rules.vanilla-name',
  'game-rules.no-name',
]);

/**
 * Vanilla parity 3 batch 2 (ADRs 0107 to 0111, ADR 0112 D2): fish buckets, flight modes and
 * habits, the dash, boats, the R10 triggers and the new Rules ids in words, Script API 1.7, the
 * two new flows and the new answers, and the limits N10 to N26 in plain words (B543).
 */
export const MOBS_AND_COMMANDS = `- Fish buckets, flight and habits: "msm:bucketable" ({ item_name, the bucket's language key; water, default true: a water bucket takes the mob and letting it out pours the water, false: an empty bucket takes it and lets it out dry }) on a mob whose movement mode is "swim" makes the item "<id>_bucket" (stacks to 1; keeps the mob's name, health and variant; in the Tools and Utilities tab), named by the mob's bucket_display_name (default "Bucket of " and its name) and drawn by its bucket_texture; never create an element with that id. Goals: "swoop" (speed, height 2 to 32 above the target before the dive, targets, must_see, retaliate; for "fly", "hover" and "phase" mobs, with "msm:attack"), "roost" (daylight, default true; when_idle; range 1 to 16: hangs upside down under a block, as a bat, and lets go when a player comes within 4 blocks or it is hurt), "collect_items" (speed, range 1 to 64, note_blocks: picks up items like the one a player gave it and brings them to its owner or to a note block it heard, as an allay; items its owner threw are left alone), "dig_items" (dig_blocks, loot_table, interval_ticks at least 20, speed: digs on those blocks and drops a roll of the table, as a sniffer), "play_dead" (below_health 0.01 to 1, ticks 20 to 1200, regenerates: lies still and is not a target, as an axolotl) and "barter" (item, loot_table, ticks 1 to 1200, from_ground: takes the item, holds it, then drops a roll of the table, as a piglin). "msm:rideable" takes dash { power 0.1 to 5, 1 is about 7 blocks at a full jump bar; cooldown_ticks } on a walking or amphibious mount, in place of its jump, as a camel. Prefer the templates for these and read kind_schema for "msm:entity" before writing goals by hand.
- Boats: the "msm:boat" component on an "msm:item" ({ chest, raft, wood_texture }) makes the item a boat of vanilla's behaviour and look (paddling, ice, two seats; a raft as vanilla's bamboo raft), placed on water and by dispensers as vanilla's; with chest it also makes the chest boat "<wood>_chest_boat" ("<wood>_chest_raft" for a raft), where <wood> is the item's path without "_boat" or "_raft": never create an element with that id. Its pictures are "<namespace>:entity/boat/<wood>" (128 by 64) and "<namespace>:entity/chest_boat/<wood>" (128 by 128), set with boat_textures { boat, chest_boat, chest_boat_item }; wood_texture names the wood they are drawn from, and a vanilla wood ("minecraft:oak") reuses vanilla's pictures. MSM writes the recipe from "<wood>_planks", the "#minecraft:boats" and "#minecraft:chest_boats" tags and chest_boat_display_name (default the name and " with Chest"). A boat stacks to 1 and cannot also have "msm:food", "msm:throwable" or another use of its own. Prefer the Wood set's "Has boats" answer (boats) or the template msm_item_boat.
- Rules, batch 2: "player_crafted", "player_picked_up" and "player_ate" take an optional item subject and "player_advancement" an optional advancement (no subject: any); "player_slept" and "player_woke" have none. Crafters and dispensers do not fire "player_crafted", and the recipe advancements that unlock recipe book entries do not fire "player_advancement". The value "command_argument" ({ "value": "command_argument", "name", "axis" "x", "y" or "z" for a position }) works only on "command_used" and reads only the argument types integer, number, position, block_position, word, text, player (its name), entity (its UUID), item, block, dimension and effect; other types reach the command's function or script only. "open_dialog" (dialog, who) is plain; "set_game_rule" (game_rule, value), "add_to_stat" (amount, stat, who), the conditions "game_rule" (game_rule, compare, value) and "stat_at_least" (stat, number) need a script, which the rule book writes. Game rule and statistic ids keep their namespace ("mypack:allow_heal").
- Script API 1.7 adds world.gameRule(id) (true or false, a whole number, or undefined) and world.setGameRule(id, value), player.stat(id) and player.addStat(id, amount) (returns the new value), player.openDialog(id) (false when there is no such dialog), event.args in a project command's own event (the typed values by argument name), and the events item.crafted ({ player, item, count }, once per craft of a shift-click), item.picked_up ({ player, item, count }), player.ate ({ player, item }, only a meal eaten to the end), player.slept and player.woke ({ player, pos }) and player.advancement ({ player, advancement }). Read the script API tool for exact signatures. These events come from the runtime's own hooks, and rules on them always compile to a script, so the Java project export leaves those rules out ("rules.not-in-eject"), as it leaves out every script.
- Prefer the flows, run with add_starter: "Villager look" (villager-look: look_name, place "cherry_grove", "meadow", "birch_forest", "dark_forest", "mushroom", "badlands" or "flower_forest", colour, trim_colour, sash; it dresses zombie villagers too) and "Game rule" (game-rule: rule_name, description, kind "switch" or "number", starts_on, number_default, number_min, number_max, category, greets and greeting for a rule book that greets joining players while it is on, counts for a statistic of the greetings), and the new answers of existing flows: Wandering merchant ${list(MOBS_COMMANDS_FLOW_ANSWERS['wandering-merchant'])} (restock "work_site" is "Twice a day, at a block near it"), Pet ${list(MOBS_COMMANDS_FLOW_ANSWERS.pet)}, Water mob ${list(MOBS_COMMANDS_FLOW_ANSWERS['water-mob'])}, Flying mob ${list(MOBS_COMMANDS_FLOW_ANSWERS['flying-mob'])} ("fly", "hover" or "phase"), Mount ${list(MOBS_COMMANDS_FLOW_ANSWERS.mount)}, Fluid ${list(MOBS_COMMANDS_FLOW_ANSWERS.fluid)}, Wood set ${list(MOBS_COMMANDS_FLOW_ANSWERS['wood-set'])}, Custom command ${list(MOBS_COMMANDS_FLOW_ANSWERS['custom-command'])} (a game rule "<namespace>:allow_<name>" that turns the command on and off) and Creative tab ${list(MOBS_COMMANDS_FLOW_ANSWERS['creative-tab'])} (with order "by_hand"). Templates: ${list(MOBS_COMMANDS_PROMPT_TEMPLATES)}; the mob and boat templates name pictures after the element that stay missing until the user adds them.
- Limits to tell the user plainly: new villager looks, boats, game rules and statistics are fixed at the game's start (restart in Play); fish buckets are for swimming mobs only; two shoulder pets a player; game rules are on or off or a whole number, and statistics count with vanilla's three formats; all of this needs the Fabric mod jar (vanilla packs leave it out), and the Java project export includes the liquids, cauldrons, bottles, jobs, villager looks, traders, storage, shoulder pets, fish buckets, flight, habits, boats, settings and counts. Try it shows the looks and plays traders' prices, buckets, shoulders, hovering, boats and cauldrons roughly, and says mixing and the six new events as lines of "What happened"; how things look and feel is checked in the game.
- Explain and fix their problems in plain words: "entities.bucketable-needs-swim" (give the mob movement mode "swim" or remove the bucket), "entities.bucket-fields-unused" (add "msm:bucketable" or remove bucket_display_name and bucket_texture), "entities.dash-needs-walk" (a dash needs a walking or amphibious mount), "entities.swoop-needs-flight" (give the mob "fly", "hover" or "phase"), "entities.hover-height-unused" (set mode "hover" or remove hover_height), "entities.habit-loot-table-unknown" (make the loot table or pick a vanilla one), "entities.dig-block-unknown" (name a block or tag that exists), "entities.collect-without-owner" (a note: make it tameable or keep note_blocks on), "blocks-items.boat-chest-clash" (the chest boat's id is taken: rename one), "blocks-items.boat-planks-missing" (make "<wood>_planks", as the Wood set does), "blocks-items.boat-texture-missing" (draw the 128 by 64 or 128 by 128 picture, or point wood_texture at a vanilla wood), "blocks-items.boat-fields-unused" (add "msm:boat" or chest, or remove the fields), "blocks-items.cauldron-id-clash" (rename the fluid or the element that takes "<id>_cauldron"), "blocks-items.cauldron-levels-ignored" (a note: a lava-like fluid's cauldron is full only), "blocks-items.fluid-mixing-empty" (give the rule source or flowing), "blocks-items.fluid-mixing-self" (name the other liquid), "blocks-items.fluid-mixing-duplicate" (merge the two rules), "blocks-items.fluid-mixing-liquid-result" (pick a solid block), "blocks-items.creative-tab-items-unused" (set order "by_hand" or remove items), "blocks-items.creative-tab-items-missing" (list the items), "blocks-items.creative-tab-item-unknown" (fix or remove the id), "blocks-items.creative-tab-item-repeated" (list each item once), "game-rules.min-above-max" and "game-rules.default-out-of-range" (fix min, max and default), "game-rules.range-on-boolean" (remove min and max), "game-rules.vanilla-clash" (use the project's namespace), "game-rules.vanilla-name" (a note: players type the namespace, "/gamerule <namespace>:<name>") and "game-rules.no-name" (give it a display_name).`;
