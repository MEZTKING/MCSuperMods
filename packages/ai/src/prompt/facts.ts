/**
 * The flows and kinds the prompt names, in one place (ADR 0125 D7, B682), for the app's truth
 * test (B683): every flow by its library starter id with the title the text calls it and the
 * parameters the text names, and every kind id the text names. `@msm/ai` cannot read the
 * library or the plugin registry, so these are written here and checked there; the package's
 * own test checks that the text names each of them.
 *
 * The answers of existing flows that later batches added stay in their topic's constants
 * (`VILLAGERS_FLUIDS_FLOW_ANSWERS`, `PLANTS_STORAGE_FLOW_ANSWERS`, `MOBS_COMMANDS_FLOW_ANSWERS`,
 * `WORLD_FLOW_ANSWERS`), and the world flows' parameters in `WORLD_FLOW_ANSWERS`.
 */

/** A flow the prompt names: the title it calls it and the parameters it names. */
export interface PromptFlow {
  readonly title: string;
  readonly parameters: readonly string[];
}

const flow = (title: string, ...parameters: string[]): PromptFlow =>
  Object.freeze({ title, parameters: Object.freeze(parameters) });

/** Every library starter the prompt names, by id. */
export const PROMPT_FLOWS: Readonly<Record<string, PromptFlow>> = Object.freeze({
  // Effects, vanilla additions, potions, data kinds.
  'status-effect': flow('Status effect'),
  throwable: flow('Throwable'),
  custom_ore: flow('Custom ore'),
  'extra-drop': flow('Extra drop'),
  'villager-trade': flow('Villager trade'),
  potion: flow('Potion'),
  'mob-skin': flow('Mob skin'),
  'goat-horn': flow('Goat horn'),
  // Blocks, containers, portals, particles.
  'wood-set': flow('Wood set', 'wood_name'),
  'stone-set': flow('Stone set', 'stone_name'),
  crop: flow('Crop', 'crop_name'),
  tree: flow('Tree', 'tree_name'),
  'storage-crate': flow('Storage crate'),
  machine: flow('Machine'),
  portal: flow('Portal'),
  particle: flow('Particle'),
  // Mobs.
  pet: flow(
    'Pet',
    'pet_name',
    'preset',
    'taming_food',
    'sits',
    'defends',
    'babies',
    'breeding_food',
    'colour',
    'spawn_biomes',
    'variant_count',
  ),
  'farm-animal': flow('Farm animal', 'animal_name', 'breeding_food', 'drop', 'rideable'),
  mount: flow('Mount', 'mount_name', 'needs_saddle', 'owner_only', 'flying'),
  'flying-mob': flow('Flying mob', 'mob_name', 'behaviour'),
  'water-mob': flow('Water mob', 'mob_name', 'kind', 'behaviour'),
  boss: flow('Boss', 'boss_name', 'size', 'attacks', 'bar_colour', 'bar_style'),
  custom_mob: flow('Custom mob', 'behaviour'),
  // Vehicles.
  'vehicle-car': flow('Car', 'car_name', 'speed', 'seats', 'needs_fuel', 'horn'),
  'vehicle-tank': flow('Tank', 'tank_name'),
  'vehicle-plane': flow('Plane', 'plane_name'),
  'vehicle-boat': flow('Boat', 'boat_name'),
  // Vanilla parity 2.
  lights: flow('Lights', 'light_name', 'members'),
  bed: flow('Bed', 'bed_name', 'kind', 'colour'),
  cake: flow('Cake', 'cake_name'),
  'copper-set': flow('Copper set', 'metal_name', 'members'),
  backpack: flow('Backpack', 'bag_name', 'rows'),
  'custom-command': flow('Custom command', 'command_name'),
  'creative-tab': flow('Creative tab', 'tab_name'),
  'wandering-merchant': flow(
    'Wandering merchant',
    'merchant_name',
    'ware_1',
    'ware_3',
    'vanilla_wares',
    'restock',
  ),
  'village-job': flow('Village job', 'job_name', 'buys', 'sells', 'trades_like'),
  fluid: flow('Fluid', 'fluid_name', 'behaves_like', 'colour'),
  dimension: flow('Dimension', 'dimension_name'),
  // Vanilla parity 3.
  'cave-plants': flow('Cave plants', 'plant_name', 'kind', 'colour', 'berry_colour', 'light'),
  'desert-plants': flow('Desert plants', 'plant_name', 'kind', 'colour', 'height', 'uses'),
  'flower-pot': flow('Flower pot', 'pot_name', 'colour', 'plants', 'ingredient'),
  'banner-pattern': flow('Banner pattern', 'pattern_name', 'shape', 'colour', 'ingredient'),
  'armour-trim': flow('Armour trim', 'trim_name', 'style', 'template_item', 'copy_block', 'colour'),
  glider: flow('Glider', 'glider_name', 'durability', 'colour', 'material'),
  'pot-pattern': flow('Pot pattern', 'pattern_name', 'picture', 'colour', 'ingredient'),
  'villager-look': flow('Villager look', 'look_name', 'place', 'colour', 'trim_colour', 'sash'),
  'game-rule': flow(
    'Game rule',
    'rule_name',
    'description',
    'kind',
    'starts_on',
    'number_default',
    'number_min',
    'number_max',
    'category',
    'greets',
    'greeting',
    'counts',
  ),
  // Make a world (parameters in WORLD_FLOW_ANSWERS).
  'world-islands': flow('Islands', 'world_name'),
  'world-mountains': flow('Tall mountains', 'world_name'),
  'world-one-biome': flow('One biome everywhere', 'world_name'),
  'world-caves': flow('Caves only', 'world_name'),
  'world-empty-sky': flow('Empty sky with a start island', 'world_name'),
  // Games (B561; the games topic's GAMES_PROMPT_FLOWS).
  skyblock: flow(
    'Skyblock',
    'game_name',
    'island',
    'chest',
    'nether',
    'trades',
    'recipes',
    'goals',
    'generator',
    'generator_name',
    'generator_makes',
  ),
  'one-block': flow('One block', 'phases', 'breaks', 'world'),
  'sky-islands': flow('Sky islands', 'islands', 'biome', 'start_island'),
  'lucky-block': flow('Lucky block', 'block_name', 'mob_kind', 'effect_kind'),
  'adventure-map': flow('Adventure map', 'start_as', 'welcome', 'game_rules', 'checkpoints'),
  'arena-game': flow('Arena game', 'teams', 'size', 'minutes', 'win_score', 'kit'),
  race: flow('Race', 'checkpoints', 'count', 'limit', 'best'),
  goals: flow('Goals', 'goals', 'icon'),
});

/** Every element kind id the prompt names (the plugin registry's ids). */
export const PROMPT_KINDS = Object.freeze([
  'msm:mod',
  'msm:block',
  'msm:item',
  'msm:entity',
  'msm:script',
  'msm:effect',
  'msm:potion',
  'msm:particle',
  'msm:biome_addition',
  'msm:loot_addition',
  'msm:rules',
  'msm:vehicle',
  'msm:key_bind',
  'msm:hud',
  'msm:command',
  'msm:creative_tab',
  'msm:game_rule',
  'msm:stat',
  'msm:fluid',
  'msm:villager_profession',
  'msm:villager_type',
  'msm:vanilla_block_rules',
  'msm:world_setup',
  'msm:one_block',
  'msm:team',
  'msm:objective',
  'msm:timer',
  'msm:area',
  'minecraft:worldgen/feature',
  'minecraft:worldgen/placed_feature',
  'minecraft:worldgen/noise_settings',
  'minecraft:worldgen/world_preset',
  'minecraft:villager_trade',
  'minecraft:tag/villager_trade',
  'minecraft:trade_set',
  'minecraft:instrument',
  'minecraft:dimension_type',
  'minecraft:particle',
  'minecraft:decorated_pot_pattern',
  'minecraft:block_transformer',
  'minecraft:test_environment',
  'minecraft:test_instance',
  'minecraft:sulfur_cube_archetype',
  'minecraft:context_int_provider',
  'minecraft:context_float_provider',
  'minecraft:post_effect',
  'minecraft:shader',
  'minecraft:waypoint_style',
]);
