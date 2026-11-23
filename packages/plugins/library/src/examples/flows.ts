/**
 * An example for every flow (ADR 0129 D2): one themed thing made by each Creator flow and
 * content starter that no other example was built from, with answers of its own, so Home's
 * gallery can show a real thing for every card. Each is the flow's own bundle for those answers
 * (as the Creator builds it), without the `pack.mcmeta` and `msm:mod` elements (an example is
 * copied into a project that has them), and works on the targets its flow does. Each is
 * mirrored as a project of its own under `examples/flows/<name>/`.
 *
 * {@link FLOW_EXAMPLE_IDS} names, for every starter and Creator flow but the blank project, the
 * example that shows what it makes: one of these, or an older example built from the same flow
 * (the wood set, the crusher, the world and game examples, the starter projects).
 *
 * @packageDocumentation
 */
import type { BundleContext, ContentBundle, ExampleProject, Json } from '@msm/plugin-api';
import { KINDS } from '../content/bundle';
import { libraryStarters } from '../starters/index';
import { defineExample } from './define';

/** The prefix of the ids of these examples; the rest is the mirror folder's name. */
export const FLOW_EXAMPLE_PREFIX = 'example_flow_';

/** The starters with no example: the blank project makes nothing to show (ADR 0129 D2). */
export const STARTERS_WITHOUT_EXAMPLE: readonly string[] = Object.freeze(['blank']);

interface FlowExampleInput {
  /** The starter or Creator flow it is made with. */
  flow: string;
  /** The rest of the id, also the mirror folder (`example_flow_<slug>`). */
  slug: string;
  title: string;
  description: string;
  kind: string;
  category: string;
  tags: string[];
  /** The flow's answers; the rest are its defaults. */
  values: Readonly<Record<string, Json>>;
}

/** The starter of a flow, by id. */
function starterOf(id: string) {
  const starter = libraryStarters.find((entry) => entry.id === id);
  if (starter === undefined) throw new Error(`No library starter ${id}`);
  return starter;
}

/** An example made by a flow, without its pack and mod elements, on the flow's targets. */
function fromFlow(input: FlowExampleInput): ExampleProject {
  const starter = starterOf(input.flow);
  const build = (context: BundleContext): ContentBundle => {
    const bundle = starter.build({ ...context, values: { ...input.values } }) as ContentBundle;
    return {
      elements: bundle.elements.filter(
        (entry) => entry.kind !== KINDS.pack && entry.kind !== KINDS.mod,
      ),
      assets: bundle.assets,
    };
  };
  return defineExample({
    id: `${FLOW_EXAMPLE_PREFIX}${input.slug}`,
    title: input.title,
    description: `${input.description} Made with the ${starter.title} ${starter.creator === undefined ? 'starter' : 'flow'}.`,
    kind: input.kind,
    category: input.category,
    tags: ['flow', ...input.tags],
    ...(starter.supports === undefined ? {} : { supports: starter.supports }),
    build,
  });
}

const BLOCKS = 'Blocks';
const ITEMS = 'Items';
const ENTITIES = 'Entities';
const VEHICLES = 'Vehicles';

/** The flow examples, in gallery order: blocks, items and gear, magic, worlds, mobs, vehicles. */
export const flowExamples: readonly ExampleProject[] = Object.freeze([
  fromFlow({
    flow: 'simple-block',
    slug: 'moss_bricks',
    title: 'Moss bricks',
    description:
      'Green bricks mined with a pickaxe that drop themselves, crafted from cobblestone.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['block', 'building', 'mod'],
    values: {
      block_name: 'Moss Bricks',
      colour: '#5a8a3c',
      hardness: 2,
      ingredient: 'minecraft:cobblestone',
    },
  }),
  fromFlow({
    flow: 'lights',
    slug: 'amethyst_lights',
    title: 'Amethyst lights',
    description:
      'A torch, a lantern, a chain and a candle in amethyst purple with small lilac flames.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['lights', 'torch', 'lantern', 'candle', 'mod'],
    values: {
      light_name: 'Amethyst',
      members: ['torch', 'lantern', 'chain', 'candle'],
      flame_colour: '#c890ff',
      colour: '#6a4a9a',
      particle: 'minecraft:small_flame',
      ingredient: 'minecraft:amethyst_shard',
    },
  }),
  fromFlow({
    flow: 'bed',
    slug: 'camp_sleeping_bag',
    title: 'Camp sleeping bag',
    description: 'A green sleeping bag to sleep in and set your spawn point, crafted with wool.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['bed', 'sleeping bag', 'furniture', 'mod'],
    values: { bed_name: 'Camp', kind: 'sleeping_bag', colour: 'green' },
  }),
  fromFlow({
    flow: 'fluid',
    slug: 'glow_honey',
    title: 'Glow honey',
    description:
      'A slow golden liquid that glows and heals what swims in it, with its bucket and its cauldron.',
    kind: 'msm:fluid',
    category: BLOCKS,
    tags: ['fluid', 'liquid', 'bucket', 'cauldron', 'mod'],
    values: {
      fluid_name: 'Glow Honey',
      colour: '#e8a828',
      light: 6,
      effect: 'minecraft:regeneration',
      speed: 'slow',
      spread: 'near',
      cauldron: true,
    },
  }),
  fromFlow({
    flow: 'cake',
    slug: 'chocolate_pie',
    title: 'Chocolate pie',
    description: 'A pie with a chocolate filling eaten slice by slice, baked with cocoa beans.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['cake', 'pie', 'food', 'mod'],
    values: {
      cake_name: 'Chocolate Pie',
      style: 'pie',
      colour: '#d0a070',
      filling_colour: '#5a3420',
      nutrition: 3,
      saturation: 0.2,
      flavour: 'minecraft:cocoa_beans',
    },
  }),
  fromFlow({
    flow: 'food',
    slug: 'golden_pear',
    title: 'Golden pear',
    description: 'A golden pear that fills six hunger points, crafted from an apple.',
    kind: KINDS.item,
    category: ITEMS,
    tags: ['food', 'fruit', 'mod'],
    values: {
      food_name: 'Golden Pear',
      colour: '#e8c040',
      nutrition: 6,
      saturation: 1,
      ingredient: 'minecraft:apple',
    },
  }),
  fromFlow({
    flow: 'custom-sword',
    slug: 'frost_blade',
    title: 'Frost blade',
    description: 'An icy diamond-tier sword that lasts longer than a diamond one.',
    kind: KINDS.item,
    category: ITEMS,
    tags: ['sword', 'weapon', 'mod'],
    values: {
      sword_name: 'Frost Blade',
      colour: '#8fd3ff',
      tool_tier: 'diamond',
      durability: 1800,
      ingredient: 'minecraft:diamond',
    },
  }),
  fromFlow({
    flow: 'weapon',
    slug: 'storm_mace',
    title: 'Storm mace',
    description: 'A heavy blue mace that hits harder the further you fall before the blow.',
    kind: KINDS.item,
    category: ITEMS,
    tags: ['mace', 'weapon', 'mod'],
    values: {
      weapon_name: 'Storm Mace',
      colour: '#5c8cd0',
      weapon_type: 'mace',
      tier: 'diamond',
      durability: 800,
      ingredient: 'minecraft:diamond',
    },
  }),
  fromFlow({
    flow: 'consumable',
    slug: 'sky_tonic',
    title: 'Sky tonic',
    description:
      'A pale blue drink that makes you fall slowly and jump higher, and gives its bottle back.',
    kind: KINDS.item,
    category: ITEMS,
    tags: ['drink', 'consumable', 'effects', 'mod'],
    values: {
      consumable_name: 'Sky Tonic',
      colour: '#78b8f0',
      kind: 'drink',
      effect_1: 'minecraft:slow_falling',
      effect_1_seconds: 45,
      effect_2: 'minecraft:jump_boost',
      effect_2_seconds: 45,
      ingredient: 'minecraft:glow_berries',
    },
  }),
  fromFlow({
    flow: 'totem',
    slug: 'ember_totem',
    title: 'Ember totem',
    description:
      'An orange totem that saves you from death and keeps you safe from fire for a while.',
    kind: KINDS.item,
    category: ITEMS,
    tags: ['totem', 'death protection', 'mod'],
    values: {
      totem_name: 'Ember Totem',
      colour: '#e05a20',
      effect_3: 'minecraft:fire_resistance',
      effect_3_seconds: 120,
      ingredient: 'minecraft:emerald',
    },
  }),
  fromFlow({
    flow: 'backpack',
    slug: 'explorer_pack',
    title: 'Explorer pack',
    description: 'A moss-green backpack that holds two rows of items, opened by using it.',
    kind: KINDS.item,
    category: ITEMS,
    tags: ['backpack', 'bag', 'inventory', 'mod'],
    values: { bag_name: 'Explorer Pack', colour: '#5a6e3a', rows: 2 },
  }),
  fromFlow({
    flow: 'glider',
    slug: 'leaf_glider',
    title: 'Leaf glider',
    description: 'Green wings of leather worn on the back to glide like elytra.',
    kind: KINDS.itemDefinition,
    category: ITEMS,
    tags: ['glider', 'elytra', 'wings'],
    values: {
      glider_name: 'Leaf Glider',
      colour: '#4c9a3c',
      durability: 300,
      material: 'minecraft:leather',
    },
  }),
  fromFlow({
    flow: 'enchantment',
    slug: 'venom_edge',
    title: 'Venom edge',
    description: 'A sword enchantment that poisons what it hits, up to level three.',
    kind: KINDS.enchantment,
    category: 'Enchantments',
    tags: ['enchantment', 'poison'],
    values: {
      enchantment_name: 'Venom Edge',
      applies_to: 'swords',
      effect: 'mob_effect',
      hit_effect: 'minecraft:poison',
      max_level: 3,
      rarity: 'rare',
    },
  }),
  fromFlow({
    flow: 'armour-trim',
    slug: 'frost_studs',
    title: 'Frost studs',
    description: 'An armour trim of icy studs, its template copied with prismarine.',
    kind: KINDS.trimPattern,
    category: 'Armour trims',
    tags: ['armour trim', 'smithing'],
    values: {
      trim_name: 'Frost Studs',
      style: 'studs',
      template_item: 'minecraft:prismarine_shard',
      copy_block: 'minecraft:prismarine',
      colour: '#58c8d0',
    },
  }),
  fromFlow({
    flow: 'goat-horn',
    slug: 'mountain_echo',
    title: 'Mountain echo',
    description: 'A goat horn with a call that carries far, crafted with copper.',
    kind: KINDS.instrument,
    category: 'Goat horns',
    tags: ['goat horn', 'instrument', 'sound'],
    values: {
      horn_name: 'Mountain Echo',
      call: 'minecraft:item.goat_horn.sound.2',
      seconds: 5,
      ingredient: 'minecraft:copper_ingot',
    },
  }),
  fromFlow({
    flow: 'music-disc-item',
    slug: 'night_drive',
    title: 'Night drive',
    description: 'A deep blue music disc for the jukebox, with its song and its own picture.',
    kind: KINDS.jukeboxSong,
    category: 'Music',
    tags: ['music disc', 'jukebox', 'song', 'mod'],
    values: { song_name: 'Night Drive', artist: 'MSM', length_seconds: 150, colour: '#2c3c8c' },
  }),
  fromFlow({
    flow: 'painting',
    slug: 'mountain_dawn',
    title: 'Mountain dawn',
    description: 'A two by two painting of a dawn sky, drawn for you, to hang on a wall.',
    kind: KINDS.paintingVariant,
    category: 'Decorations',
    tags: ['painting', 'decoration'],
    values: { painting_name: 'Mountain Dawn', author: 'MSM', size: '2x2', colour: '#e07840' },
  }),
  fromFlow({
    flow: 'banner-pattern',
    slug: 'ocean_ring',
    title: 'Ocean ring',
    description: 'A banner pattern of a blue ring, put on banners and shields with its item.',
    kind: KINDS.bannerPattern,
    category: 'Decorations',
    tags: ['banner', 'pattern', 'shield'],
    values: {
      pattern_name: 'Ocean Ring',
      shape: 'ring',
      colour: '#2c7cc0',
      ingredient: 'minecraft:glow_ink_sac',
    },
  }),
  fromFlow({
    flow: 'pot-pattern',
    slug: 'fish_tale',
    title: 'Fish tale',
    description: 'A pottery sherd with a fish on it that decorates the sides of a pot.',
    kind: 'minecraft:decorated_pot_pattern',
    category: 'Decorations',
    tags: ['pot', 'pottery sherd', 'decoration'],
    values: {
      pattern_name: 'Fish Tale',
      picture: 'fish',
      colour: '#3c8cc8',
      ingredient: 'minecraft:lapis_lazuli',
    },
  }),
  fromFlow({
    flow: 'creative-tab',
    slug: 'garden_tab',
    title: 'Garden tab',
    description:
      'A creative tab of its own with a block, a flower pot and a lantern, shown with an emerald.',
    kind: 'msm:creative_tab',
    category: ITEMS,
    tags: ['creative tab', 'inventory', 'mod'],
    values: {
      tab_name: 'Garden',
      icon: 'minecraft:emerald',
      extra_items: ['minecraft:flower_pot', 'minecraft:lantern'],
      colour: '#5aa03c',
    },
  }),
  fromFlow({
    flow: 'status-effect',
    slug: 'frost_skin',
    title: 'Frost skin',
    description:
      'An effect that leaves snowflakes around you and makes you quicker, drunk from its bottle.',
    kind: KINDS.effect,
    category: 'Effects',
    tags: ['status effect', 'particles', 'mod'],
    values: {
      effect_name: 'Frost Skin',
      colour: '#a0e0ff',
      category: 'beneficial',
      behaviour: 'particles',
      particle: 'minecraft:snowflake',
    },
  }),
  fromFlow({
    flow: 'potion',
    slug: 'feather_fall',
    title: 'Feather fall',
    description:
      'A potion of slow falling brewed from a feather, with longer, stronger, splash and lingering kinds.',
    kind: KINDS.potion,
    category: 'Potions',
    tags: ['potion', 'brewing', 'mod'],
    values: {
      potion_name: 'Feather Fall',
      effect: 'minecraft:slow_falling',
      colour: '#f0ecd0',
      ingredient: 'minecraft:feather',
    },
  }),
  fromFlow({
    flow: 'particle',
    slug: 'snow_glitter',
    title: 'Snow glitter',
    description: 'Pale sparkles that fall slowly from a block of their own.',
    kind: 'msm:particle',
    category: 'Particles',
    tags: ['particle', 'sparkle', 'mod'],
    values: {
      particle_name: 'Snow Glitter',
      look: 'spark',
      colour: '#d8f0ff',
      size: 'small',
      movement: 'falls',
      show: 'block',
    },
  }),
  fromFlow({
    flow: 'scripted-item',
    slug: 'storm_staff',
    title: 'Storm staff',
    description:
      'A staff that calls lightning where you look, then waits a little before the next.',
    kind: KINDS.script,
    category: 'Scripts',
    tags: ['script', 'wand', 'lightning', 'mod'],
    values: {
      item_name: 'Storm Staff',
      colour: '#5c8cd0',
      behaviour: 'lightning',
      cooldown_seconds: 3,
    },
  }),
  fromFlow({
    flow: 'custom-command',
    slug: 'feast_command',
    title: 'Feast command',
    description: 'A command, /feast, that gives every player eight cookies and a kind word.',
    kind: 'msm:command',
    category: 'Commands',
    tags: ['command', 'mod'],
    values: {
      command_name: 'feast',
      action: 'item',
      item: 'minecraft:cookie',
      count: 8,
      message: 'Enjoy the feast.',
    },
  }),
  fromFlow({
    flow: 'game-rule',
    slug: 'night_greeting',
    title: 'Night greeting',
    description:
      'A game rule, on at first, that greets players as they join, and a statistic that counts the greetings.',
    kind: 'msm:game_rule',
    category: 'Commands',
    tags: ['game rule', 'statistic', 'rules', 'mod'],
    values: {
      rule_name: 'Night Greeting',
      description: 'Whether players are wished a good night when they join.',
      greeting: 'Good evening, and sleep well!',
      counts: true,
    },
  }),
  fromFlow({
    flow: 'extra-drop',
    slug: 'skeleton_bones',
    title: 'Skeleton bone blocks',
    description: 'Skeletons killed by a player sometimes drop a whole bone block.',
    kind: KINDS.lootAddition,
    category: 'Additions',
    tags: ['loot', 'drops', 'mod'],
    values: {
      table: 'entities/skeleton',
      item: 'minecraft:bone_block',
      count_max: 2,
      chance: 20,
    },
  }),
  fromFlow({
    flow: 'villager-trade',
    slug: 'spyglass_trade',
    title: 'Spyglass trade',
    description: 'Librarians at their second level sell a spyglass for six emeralds.',
    kind: KINDS.villagerTrade,
    category: 'Villager trades',
    tags: ['villager', 'trade'],
    values: {
      profession: 'librarian',
      level: '2',
      item: 'minecraft:spyglass',
      item_count: 1,
      emeralds: 6,
    },
  }),
  fromFlow({
    flow: 'village-job',
    slug: 'beekeeper',
    title: 'Beekeeper',
    description:
      'A village job with a workbench of its own as its work site, buying honeycomb and selling honey.',
    kind: 'msm:villager_profession',
    category: 'Villagers',
    tags: ['villager', 'job', 'profession', 'mod'],
    values: {
      job_name: 'Beekeeper',
      colour: '#d8a030',
      metal_colour: '#a08050',
      buys: 'minecraft:honeycomb',
      sells: 'minecraft:honey_bottle',
      trades_like: 'farmer',
    },
  }),
  fromFlow({
    flow: 'villager-look',
    slug: 'desert_rose_villagers',
    title: 'Desert rose villagers',
    description: 'Villagers born in the badlands wear red robes with a pale sash.',
    kind: 'msm:villager_type',
    category: 'Villagers',
    tags: ['villager', 'look', 'mod'],
    values: {
      look_name: 'Desert Rose',
      place: 'badlands',
      colour: '#c86040',
      trim_colour: '#f0d8a0',
    },
  }),
  fromFlow({
    flow: 'mob-skin',
    slug: 'snow_coat_cat',
    title: 'Snow coat cat',
    description: 'A white cat coat that cats born in snowy taigas wear.',
    kind: KINDS.catVariant,
    category: 'Mob variants',
    tags: ['cat', 'mob variant', 'skin'],
    values: {
      skin_name: 'Snow Coat',
      animal: 'cat',
      colour: '#e8eef4',
      biome: 'minecraft:snowy_taiga',
    },
  }),
  fromFlow({
    flow: 'dimension',
    slug: 'frost_realm',
    title: 'Frost realm',
    description: 'A world of floating snowy islands under a pale sky, reached with its own key.',
    kind: KINDS.dimension,
    category: 'Worldgen',
    tags: ['dimension', 'world', 'mod'],
    values: {
      dimension_name: 'Frost Realm',
      terrain: 'floating_islands',
      biome: 'minecraft:snowy_plains',
      own_sky: true,
      sky_colour: '#c8e0ff',
      fog_colour: '#e8f0ff',
      colour: '#8fd3ff',
    },
  }),
  fromFlow({
    flow: 'custom_mob',
    slug: 'stone_sentinel',
    title: 'Stone sentinel',
    description: 'A grey golem from the mountains that fights back when hurt, with its spawn egg.',
    kind: KINDS.entity,
    category: ENTITIES,
    tags: ['mob', 'golem', 'mod'],
    values: {
      mob_name: 'Stone Sentinel',
      colour: '#7a7f86',
      egg_colour: '#7a7f86',
      egg_spot_colour: '#3c4046',
      health: 40,
      spawn_biomes: '#minecraft:is_mountain',
    },
  }),
  fromFlow({
    flow: 'pet',
    slug: 'frost_wolf',
    title: 'Frost wolf',
    description:
      'A pale wolf tamed with bones that sits, follows and defends you, found in taigas.',
    kind: KINDS.entity,
    category: ENTITIES,
    tags: ['pet', 'tameable', 'mod'],
    values: {
      pet_name: 'Frost Wolf',
      colour: '#d0e4f0',
      taming_food: 'bones',
      spawn_biomes: 'taigas',
    },
  }),
  fromFlow({
    flow: 'farm-animal',
    slug: 'clover_sheep',
    title: 'Clover sheep',
    description: 'A woolly animal of the plains bred with wheat that drops white wool.',
    kind: KINDS.entity,
    category: ENTITIES,
    tags: ['farm animal', 'breeding', 'mod'],
    values: {
      animal_name: 'Clover Sheep',
      colour: '#ece8dc',
      drop: 'minecraft:white_wool',
      drop_max: 2,
    },
  }),
  fromFlow({
    flow: 'wandering-merchant',
    slug: 'spice_trader',
    title: 'Spice trader',
    description: 'A travelling trader in a rust-red coat who sells cocoa beans and sugar.',
    kind: KINDS.entity,
    category: ENTITIES,
    tags: ['trader', 'merchant', 'mod'],
    values: {
      merchant_name: 'Spice Trader',
      colour: '#c06030',
      ware_1: 'minecraft:cocoa_beans',
      ware_1_count: 8,
      ware_2: 'minecraft:sugar',
      ware_2_count: 8,
      ware_2_emeralds: 1,
    },
  }),
  fromFlow({
    flow: 'flying-mob',
    slug: 'ember_bat',
    title: 'Ember bat',
    description: 'An orange flyer that hangs from the ceiling by day and flies about at night.',
    kind: KINDS.entity,
    category: ENTITIES,
    tags: ['flying mob', 'mod'],
    values: { mob_name: 'Ember Bat', colour: '#d05020', roosts: true, spawn_biomes: 'mountains' },
  }),
  fromFlow({
    flow: 'water-mob',
    slug: 'lantern_fish',
    title: 'Lantern fish',
    description: 'A golden fish of the oceans that you can catch in a bucket.',
    kind: KINDS.entity,
    category: ENTITIES,
    tags: ['fish', 'water mob', 'bucket', 'mod'],
    values: { mob_name: 'Lantern Fish', colour: '#f0c040', bucket: true },
  }),
  fromFlow({
    flow: 'boss',
    slug: 'frost_giant',
    title: 'Frost giant',
    description:
      'A huge boss with a blue boss bar that swings and throws snowballs, and drops diamonds.',
    kind: KINDS.entity,
    category: ENTITIES,
    tags: ['boss', 'boss bar', 'mod'],
    values: {
      boss_name: 'Frost Giant',
      colour: '#a0d0f0',
      attacks: 'both',
      projectile: 'minecraft:snowball',
      bar_colour: 'blue',
    },
  }),
  fromFlow({
    flow: 'vehicle-car',
    slug: 'ember_kart',
    title: 'Ember kart',
    description: 'A quick one-seat kart in ember orange with a horn.',
    kind: 'msm:vehicle',
    category: VEHICLES,
    tags: ['vehicle', 'car', 'mod'],
    values: { car_name: 'Ember Kart', colour: '#e05a20', speed: 12, seats: 1, boot: false },
  }),
  fromFlow({
    flow: 'vehicle-tank',
    slug: 'desert_tank',
    title: 'Desert tank',
    description: 'A sand-coloured tank with a cannon that fires shells.',
    kind: 'msm:vehicle',
    category: VEHICLES,
    tags: ['vehicle', 'tank', 'mod'],
    values: { tank_name: 'Desert Tank', colour: '#c8a060' },
  }),
  fromFlow({
    flow: 'vehicle-plane',
    slug: 'sky_hopper',
    title: 'Sky hopper',
    description: 'A red two-seat plane that burns coal as it flies.',
    kind: 'msm:vehicle',
    category: VEHICLES,
    tags: ['vehicle', 'plane', 'mod'],
    values: { plane_name: 'Sky Hopper', colour: '#c41c34' },
  }),
  fromFlow({
    flow: 'vehicle-boat',
    slug: 'paddle_steamer',
    title: 'Paddle steamer',
    description: 'A wooden boat for four with a paddle wheel and a horn.',
    kind: 'msm:vehicle',
    category: VEHICLES,
    tags: ['vehicle', 'boat', 'mod'],
    values: { boat_name: 'Paddle Steamer', colour: '#8c5a2e', seats: 4, sound: 'paddle' },
  }),
]);

/**
 * The example that shows what each starter and Creator flow makes (ADR 0129 D2), by starter id;
 * every starter but {@link STARTERS_WITHOUT_EXAMPLE} has one. The older examples are those built
 * from the flow itself; the rest are {@link flowExamples}.
 */
export const FLOW_EXAMPLE_IDS: Readonly<Record<string, string>> = Object.freeze({
  // The starter projects (`starterExamples`).
  resource_pack: 'starter_resource_pack',
  data_pack: 'starter_data_pack',
  combined: 'starter_combined',
  custom_ore: 'starter_custom_ore',
  recipe_pack: 'starter_recipe_pack',
  music_disc: 'starter_music_disc',
  function_starter: 'starter_function_starter',
  custom_biome: 'starter_custom_biome',
  jigsaw_structure: 'starter_jigsaw_structure',
  worldgen_pack: 'starter_worldgen_pack',
  scripted_ore: 'starter_scripted_ore',
  // Older examples built from the flow.
  'gear-set': 'example_popular_glowshard',
  'wood-set': 'example_msm_wood_set',
  'stone-set': 'example_msm_stone_set',
  crop: 'example_msm_crop',
  tree: 'example_msm_tree',
  'cave-plants': 'example_msm_ember_vines',
  'desert-plants': 'example_msm_dune_reed',
  'flower-pot': 'example_msm_clay_planter',
  'copper-set': 'example_msm_bronze_fittings',
  'storage-crate': 'example_msm_shulker_crate',
  machine: 'example_msm_ore_crusher',
  throwable: 'example_popular_boomerang',
  mount: 'example_popular_ember_drake',
  portal: 'example_msm_sky_portal',
  'world-islands': 'example_world_coral_isles',
  'world-mountains': 'example_world_frost_peaks',
  'world-one-biome': 'example_world_endless_blossom',
  'world-caves': 'example_world_ember_caverns',
  'world-empty-sky': 'example_world_cloud_realm',
  skyblock: 'example_game_cloud_farm',
  'one-block': 'example_game_deep_block',
  'sky-islands': 'example_game_blossom_isles',
  'lucky-block': 'example_game_star_block',
  'adventure-map': 'example_game_crystal_road',
  'arena-game': 'example_game_four_kingdoms',
  race: 'example_game_canyon_dash',
  goals: 'example_game_explorer',
  // The flow examples above.
  'simple-block': 'example_flow_moss_bricks',
  lights: 'example_flow_amethyst_lights',
  bed: 'example_flow_camp_sleeping_bag',
  fluid: 'example_flow_glow_honey',
  cake: 'example_flow_chocolate_pie',
  food: 'example_flow_golden_pear',
  'custom-sword': 'example_flow_frost_blade',
  weapon: 'example_flow_storm_mace',
  consumable: 'example_flow_sky_tonic',
  totem: 'example_flow_ember_totem',
  backpack: 'example_flow_explorer_pack',
  glider: 'example_flow_leaf_glider',
  enchantment: 'example_flow_venom_edge',
  'armour-trim': 'example_flow_frost_studs',
  'goat-horn': 'example_flow_mountain_echo',
  'music-disc-item': 'example_flow_night_drive',
  painting: 'example_flow_mountain_dawn',
  'banner-pattern': 'example_flow_ocean_ring',
  'pot-pattern': 'example_flow_fish_tale',
  'creative-tab': 'example_flow_garden_tab',
  'status-effect': 'example_flow_frost_skin',
  potion: 'example_flow_feather_fall',
  particle: 'example_flow_snow_glitter',
  'scripted-item': 'example_flow_storm_staff',
  'custom-command': 'example_flow_feast_command',
  'game-rule': 'example_flow_night_greeting',
  'extra-drop': 'example_flow_skeleton_bones',
  'villager-trade': 'example_flow_spyglass_trade',
  'village-job': 'example_flow_beekeeper',
  'villager-look': 'example_flow_desert_rose_villagers',
  'mob-skin': 'example_flow_snow_coat_cat',
  dimension: 'example_flow_frost_realm',
  custom_mob: 'example_flow_stone_sentinel',
  pet: 'example_flow_frost_wolf',
  'farm-animal': 'example_flow_clover_sheep',
  'wandering-merchant': 'example_flow_spice_trader',
  'flying-mob': 'example_flow_ember_bat',
  'water-mob': 'example_flow_lantern_fish',
  boss: 'example_flow_frost_giant',
  'vehicle-car': 'example_flow_ember_kart',
  'vehicle-tank': 'example_flow_desert_tank',
  'vehicle-plane': 'example_flow_sky_hopper',
  'vehicle-boat': 'example_flow_paddle_steamer',
});
