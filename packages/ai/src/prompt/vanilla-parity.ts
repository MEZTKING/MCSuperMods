/** The vanilla parity topic (moved from system-prompt.ts, B681; wording unchanged). */
import { list } from './core';

/** The vanilla parity templates (ADR 0101 D7): block types, ageing, bags, commands and tabs. */
export const VANILLA_PARITY_PROMPT_TEMPLATES = Object.freeze([
  'msm_block_sleeping_bag',
  'msm_block_pie',
  'msm_block_berry_bush',
  'msm_block_tall_flower',
  'msm_block_rope_ladder',
  'msm_block_torch',
  'msm_block_lantern',
  'msm_block_chain',
  'msm_block_candle',
  'msm_block_wooden_sign',
  'msm_block_hanging_sign',
  'msm_block_potted_sapling',
  'msm_block_sea_pickle',
  'msm_block_vine',
  'msm_block_rug',
  'msm_block_snow_layers',
  'msm_block_glow_rod',
  'msm_block_melon_stem',
  'msm_block_cocoa_pod',
  'msm_block_scaffold',
  'msm_block_copper_block',
  'msm_block_copper_rod',
  'msm_block_waterlogged_lamp',
  'msm_item_satchel',
  'msm_item_pouch',
  'msm_item_quiver_bundle',
  'msm_command_help',
  'msm_command_hop',
  'msm_creative_tab',
  'msm_creative_tab_by_hand',
]);

/** The Creator flows the two paragraphs name, with their name parameter. */
export const NEW_FLOW_PROMPT_IDS = Object.freeze({
  'vehicle-car': 'car_name',
  'vehicle-tank': 'tank_name',
  'vehicle-plane': 'plane_name',
  'vehicle-boat': 'boat_name',
  lights: 'light_name',
  bed: 'bed_name',
  cake: 'cake_name',
  'copper-set': 'metal_name',
  backpack: 'bag_name',
  'custom-command': 'command_name',
  'creative-tab': 'tab_name',
  'wandering-merchant': 'merchant_name',
  'village-job': 'job_name',
  fluid: 'fluid_name',
  dimension: 'dimension_name',
  // Vanilla parity 3, batch 1 (ADR 0112 D2; B508, B518).
  'cave-plants': 'plant_name',
  'desert-plants': 'plant_name',
  'flower-pot': 'pot_name',
  'banner-pattern': 'pattern_name',
  'armour-trim': 'trim_name',
  glider: 'glider_name',
  'pot-pattern': 'pattern_name',
  // Vanilla parity 3, batch 2 (ADR 0112 D2; B539).
  'villager-look': 'look_name',
  'game-rule': 'rule_name',
  // Live world generation (ADR 0119 D11; B586).
  'world-islands': 'world_name',
  'world-mountains': 'world_name',
  'world-one-biome': 'world_name',
  'world-caves': 'world_name',
  'world-empty-sky': 'world_name',
} as const);

export const VANILLA_PARITY = `- Vanilla block types: an "msm:block" also takes the types "bed" (rule "bed" or "straw_bed", colour), "cake" (food { nutrition, saturation } per slice, on_eat), "berry_bush" (berry item required, harvest, hurts), "tall_plant" (two blocks high; bonemeal "drop_copy" or "none"), "potted_plant" (plant block required; no item unless one is given), "vine" (spreads), "sea_pickle", "carpet", "layers" (as snow), "cocoa" (support), "candle", "ladder", "torch" (particle), "lantern" (stands or hangs), "chain", "rod" (as the end rod), "sign" and "hanging_sign" (wood_type required), "stem" (fruit block required, soil, fruit_soil) and "scaffolding". Texture slots: ladder, torch, carpet, layers, rod, sea_pickle and vine all or texture; lantern and chain also item; bed bed and item; cake top, bottom, side, inside and item; berry_bush and cocoa stages, a list; tall_plant top and bottom; sign sign and hanging_sign hanging_gui (also the edit screen's picture), both with item; potted_plant plant; candle candle, lit and item; stem stem and attached; scaffolding top, side and bottom. MSM makes the wall torch and wall signs "<id>_wall" and the attached stem "<id>_attached" itself: never create elements with those ids. Components: "msm:waterloggable" ({}) lets a block of type block, pillar, horizontal or directional hold water, containers and machines included (ladders, lanterns, chains, signs, candles, sea pickles, scaffolding and double chests hold water by themselves); "msm:weathering" ({ stage "unaffected", "exposed", "weathered" or "oxidized", next: the next stage's block of the same type, absent at the last }) ages a block as copper does, on the types block, pillar, horizontal, directional, slab, stairs, door, trapdoor, pane, chain, lantern, rod, button, pressure_plate, fence, fence_gate and wall, and on containers (a copper-chest-like block keeps its contents as it ages; give every stage the same slots), and lightning scrapes it back as it does copper; "msm:waxable" ({ into }), only with weathering, lets honeycomb wax it into a block of the same type without weathering, which an axe turns back. Machines cannot age, a waxed block must not age and belongs to one block, and two blocks cannot age into the same block.
- Bags and bundles: "msm:item_inventory" on an "msm:item" ({ layout "chest" with rows 1 to 6, "hopper" or "dispenser"; open "use" or "sneak_use"; open_sound, close_sound; on_open and on_close events }) makes a bag that keeps what is put in it; "msm:bundle" ({}) makes a bundle like vanilla's, with bundle_textures { closed, open_back, open_front }. Both need max_stack_size 1 and cannot also be a tool, weapon, armour, shield, throwable, food or consumable; bags never go into bags, bundles or shulker boxes, and shulker boxes never go into a bag.
- Commands and creative tabs: a command players type is an "msm:command" element: name without the slash (a to z, 0 to 9 and _), aliases (up to 4), permission (0 every player, the default, to 4; 2 is operators), arguments (up to 8) of { name, type "integer", "number", "word", "text", "boolean", "player", "players", "entity", "position", "block_position", "item", "block", "dimension", "time", "team_colour", "hex_colour", "rotation", "angle", "uuid", "objective", "score_holder", "score_holders", "item_predicate", "block_predicate", "effect", "enchantment", "biome", "biome_or_tag", "structure", "structure_or_tag", "entity_type", "particle", "game_mode", "text_component", "int_range", "identifier", "team", "slot", "nbt", "message", "dialog", "loot_table", "advancement" or "recipe", min and max on numbers only, optional } with optional ones and "text" or "message" last (the types from "dimension" on need the runtime release that ships them), then either function (a function given the arguments as macros $(name)) or event (an event in its events whose player is the one who typed it), never both, and feedback_text, the message back. A creative tab is an "msm:creative_tab" element (icon item, display_name, order "as_listed" or "by_name", or "by_hand" with items, a list of item ids in the order the tab shows them, the tab's other items after them); items join it by naming its id in creative_tab (item.creative_tab on a block). A game rule is an "msm:game_rule" element (kind "boolean" or "integer", default, min and max on integers only, category "player", "mobs", "spawning", "drops", "updates", "chat" or "misc", display_name, description), set in game with /gamerule <namespace>:<path>; a statistic is an "msm:stat" element (formatter "default", "distance" in centimetres or "time" in ticks, display_name), counted per player, its scoreboard criterion "minecraft.custom:<namespace>.<path>"; both need the runtime release that ships them. Tell the user plainly: a command named like a vanilla command (target_facts commands lists them) or one from another mod is not registered under that name; argument text reaches a function as raw macro text, so quotes or backslashes in it can break the function's command; player arguments take names or selectors; functions run at permission level 2 whatever the player's own level; "as_listed" is the order the game registers things (block items, then items, then spawn eggs, each by mod id and file path), not the project's order; a tab whose icon is unknown shows no picture. New and changed commands work after /reload; a new creative tab, block or item needs a restart.
- Prefer the flows for these: "Lights" (lights: light_name, members torch, lantern, chain and candle), "Bed" (bed: bed_name, kind "bed" or "sleeping_bag", colour), "Cake" (cake: cake_name), "Copper set" (copper-set: metal_name; four stages with waxed copies), "Backpack" (backpack: bag_name, rows), "Custom command" (custom-command: command_name) and "Creative tab" (creative-tab: tab_name), run with add_starter, and the templates ${list(VANILLA_PARITY_PROMPT_TEMPLATES)}; read kind_schema for "msm:block", "msm:item", "msm:command" or "msm:creative_tab" before writing by hand. All of them need the Fabric mod jar: vanilla packs leave them out ("export.needs-jar" for commands and tabs), while the Java project export includes them.`;
