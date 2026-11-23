/**
 * The things the library's flows, starters and examples make, in the words players use for them
 * (ADR 0124 D5): "sword: blade, katana", "mob: creature, monster, animal", slang and short forms
 * ("pick", "xp", "skyblock") and misspellings beyond the search's typo limits ("vehical"). A
 * group's idea is the word of the flow's title or of the choice that makes the thing, so the
 * search reaches the flow and fills the choice from any word of the group. British spellings
 * only where the search folds the American one itself (`armor`, `color`); American words that do
 * not fold are listed ("flashlight", "trash can" are not game words and are left out).
 *
 * Vanilla ids name the thing in vanilla; the host drops an id the open target lacks, and
 * `test/search.test.ts` checks every one against both targets.
 */

import type { SearchWordGroup } from '@msm/plugin-api';

/** Weapons, tools and armour. */
const GEAR: SearchWordGroup[] = [
  {
    idea: 'sword',
    same: ['blade', 'katana', 'sabre', 'cutlass', 'rapier', 'longsword', 'broadsword', 'dagger'],
    near: ['weapon', 'knife'],
    misspellings: ['sowrd', 'swrod', 'swoard'],
    vanillaIds: ['minecraft:iron_sword', 'minecraft:diamond_sword'],
  },
  {
    idea: 'pickaxe',
    same: ['pickax', 'mining pick'],
    slang: ['pick', 'picks'],
    phrases: ['pick axe'],
    misspellings: ['pikaxe', 'pickace', 'pickaxs'],
    vanillaIds: ['minecraft:iron_pickaxe'],
  },
  { idea: 'axe', same: ['hatchet', 'battle axe', 'battleaxe'], vanillaIds: ['minecraft:iron_axe'] },
  { idea: 'shovel', same: ['spade'], vanillaIds: ['minecraft:iron_shovel'] },
  { idea: 'hoe', same: ['scythe', 'sickle'], vanillaIds: ['minecraft:iron_hoe'] },
  {
    idea: 'spear',
    same: ['lance', 'javelin', 'pike', 'halberd', 'glaive'],
    vanillaIds: ['minecraft:iron_spear'],
  },
  { idea: 'mace', same: ['hammer', 'warhammer', 'club', 'flail'], vanillaIds: ['minecraft:mace'] },
  {
    idea: 'bow',
    same: ['longbow', 'shortbow'],
    near: ['archery', 'arrows'],
    vanillaIds: ['minecraft:bow'],
  },
  {
    idea: 'crossbow',
    same: ['arbalest'],
    slang: ['xbow'],
    misspellings: ['crosbow'],
    vanillaIds: ['minecraft:crossbow'],
  },
  { idea: 'shield', same: ['buckler'], near: ['block attacks'], vanillaIds: ['minecraft:shield'] },
  { idea: 'helmet', same: ['helm', 'hat', 'cap'], vanillaIds: ['minecraft:iron_helmet'] },
  {
    idea: 'chestplate',
    same: ['breastplate', 'chest plate', 'tunic', 'body armour'],
    vanillaIds: ['minecraft:iron_chestplate'],
  },
  {
    idea: 'leggings',
    same: ['pants', 'trousers', 'greaves'],
    vanillaIds: ['minecraft:iron_leggings'],
  },
  { idea: 'boots', same: ['shoes', 'sabatons'], vanillaIds: ['minecraft:iron_boots'] },
  {
    idea: 'armour',
    same: ['armor', 'armour set', 'suit of armour'],
    near: ['helmet', 'chestplate', 'leggings', 'boots', 'protection'],
    misspellings: ['armer', 'armur', 'armoor'],
  },
  {
    idea: 'horse armour',
    same: ['horse armor', 'barding'],
    vanillaIds: ['minecraft:iron_horse_armor'],
  },
  { idea: 'wolf armour', same: ['wolf armor', 'dog armour'], vanillaIds: ['minecraft:wolf_armor'] },
  {
    idea: 'tools',
    same: ['tool', 'toolset', 'tool set'],
    near: ['pickaxe', 'axe', 'shovel', 'hoe'],
  },
  {
    idea: 'gear',
    same: ['gear set', 'kit', 'equipment', 'loadout'],
    near: ['tools', 'armour', 'set'],
  },
  {
    idea: 'weapon',
    same: ['weapons', 'weaponry'],
    near: ['sword', 'bow', 'spear', 'mace', 'crossbow'],
    misspellings: ['wepon', 'weopon', 'weapen'],
  },
  {
    idea: 'enchantment',
    same: ['enchant', 'enchants', 'enchanted', 'enchanting'],
    slang: ['ench'],
    misspellings: ['enchantmant', 'enchantmint', 'enchantmen', 'enchantement'],
    vanillaIds: ['minecraft:enchanted_book'],
  },
  {
    idea: 'throwable',
    same: ['throwing', 'thrown', 'projectile'],
    near: ['grenade', 'boomerang', 'shuriken'],
  },
  { idea: 'boomerang', same: [], near: ['comes back', 'returns'] },
  { idea: 'grenade', same: ['bomb', 'explosive'], slang: ['nade'] },
  { idea: 'shuriken', same: ['throwing star', 'ninja star'] },
  {
    idea: 'totem',
    same: ['totem of undying', 'extra life', 'second life'],
    vanillaIds: ['minecraft:totem_of_undying'],
  },
  {
    idea: 'glider',
    same: ['elytra', 'wings', 'wingsuit', 'hang glider', 'cape'],
    misspellings: ['glyder', 'gilder', 'elitra', 'elytre'],
    vanillaIds: ['minecraft:elytra'],
  },
  {
    idea: 'armour trim',
    same: ['armor trim', 'trim', 'trims', 'smithing template'],
    vanillaIds: ['minecraft:coast_armor_trim_smithing_template'],
  },
  { idea: 'goat horn', same: ['horn', 'war horn', 'bugle'], vanillaIds: ['minecraft:goat_horn'] },
  {
    idea: 'backpack',
    same: ['bag', 'pouch', 'satchel', 'rucksack', 'knapsack', 'bundle', 'sack'],
    misspellings: ['backpak', 'bakpack'],
    vanillaIds: ['minecraft:bundle'],
  },
  {
    idea: 'wand',
    same: ['staff', 'sceptre', 'magic stick'],
    near: ['magic', 'wizard'],
    vanillaIds: ['minecraft:stick'],
  },
];

/** Blocks and block sets. */
const BLOCKS: SearchWordGroup[] = [
  {
    idea: 'block',
    same: ['cube'],
    misspellings: ['blok', 'blcok'],
  },
  {
    idea: 'ore',
    same: ['ores', 'mineral', 'vein', 'deposit'],
    near: ['gem', 'mining'],
    misspellings: ['oar'],
    vanillaIds: ['minecraft:iron_ore', 'minecraft:diamond_ore'],
  },
  { idea: 'tiles', same: ['tile', 'paving', 'floor'], near: ['bricks'] },
  {
    idea: 'wood set',
    same: ['wood type', 'new wood', 'tree type'],
    near: ['planks', 'log', 'stairs', 'slab', 'fence', 'door'],
  },
  { idea: 'log', same: ['logs', 'trunk'], vanillaIds: ['minecraft:oak_log'] },
  { idea: 'planks', same: ['plank', 'boards'], vanillaIds: ['minecraft:oak_planks'] },
  { idea: 'stairs', same: ['stair', 'steps', 'staircase'], vanillaIds: ['minecraft:stone_stairs'] },
  {
    idea: 'slab',
    same: ['slabs', 'half block', 'half slab'],
    vanillaIds: ['minecraft:stone_slab'],
  },
  { idea: 'wall', same: ['walls'], vanillaIds: ['minecraft:cobblestone_wall'] },
  { idea: 'fence', same: ['fences', 'railing'], vanillaIds: ['minecraft:oak_fence'] },
  { idea: 'fence gate', same: ['gate'], vanillaIds: ['minecraft:oak_fence_gate'] },
  { idea: 'door', same: ['doors'], vanillaIds: ['minecraft:oak_door'] },
  { idea: 'trapdoor', same: ['trap door', 'hatch'], vanillaIds: ['minecraft:oak_trapdoor'] },
  { idea: 'button', same: ['buttons'], vanillaIds: ['minecraft:stone_button'] },
  {
    idea: 'pressure plate',
    same: ['plate', 'pressure pad'],
    vanillaIds: ['minecraft:stone_pressure_plate'],
  },
  { idea: 'sign', same: ['signs', 'signpost', 'hanging sign'], vanillaIds: ['minecraft:oak_sign'] },
  {
    idea: 'stone set',
    same: ['new stone', 'stone type', 'rock type'],
    near: ['bricks', 'stairs', 'slab', 'wall', 'polished', 'pillar'],
  },
  { idea: 'pillar', same: ['column'], vanillaIds: ['minecraft:quartz_pillar'] },
  {
    idea: 'copper set',
    same: ['ageing metal', 'weathering', 'oxidising', 'oxidised', 'patina', 'rusting'],
    near: ['copper', 'waxed'],
    vanillaIds: ['minecraft:copper_block'],
  },
  { idea: 'waxed', same: ['wax', 'honeycomb wax'] },
  { idea: 'bars', same: ['iron bars', 'grate', 'grille'], vanillaIds: ['minecraft:iron_bars'] },
  {
    idea: 'lights',
    same: ['light', 'lamp', 'lamps', 'lighting', 'light source'],
    near: ['torch', 'lantern', 'candle', 'glowing'],
  },
  { idea: 'torch', same: ['torches', 'wall torch'], vanillaIds: ['minecraft:torch'] },
  { idea: 'lantern', same: ['lanterns', 'lamp post'], vanillaIds: ['minecraft:lantern'] },
  { idea: 'candle', same: ['candles'], vanillaIds: ['minecraft:candle'] },
  { idea: 'chain', same: ['chains'], vanillaIds: ['minecraft:iron_chain'] },
  { idea: 'bed', same: ['beds', 'bunk', 'cot', 'mattress'], vanillaIds: ['minecraft:red_bed'] },
  { idea: 'sleeping bag', same: ['bedroll', 'camping bed', 'straw bed'] },
  {
    idea: 'storage',
    same: [
      'crate',
      'chest',
      'box',
      'container',
      'barrel',
      'locker',
      'storage crate',
      'storage box',
    ],
    near: ['inventory', 'items'],
    vanillaIds: ['minecraft:chest', 'minecraft:barrel'],
  },
  { idea: 'shulker box', same: ['shulker'], vanillaIds: ['minecraft:shulker_box'] },
  { idea: 'double chest', same: ['big chest', 'large chest'] },
  {
    idea: 'ender chest',
    same: ['private chest', 'personal chest'],
    vanillaIds: ['minecraft:ender_chest'],
  },
  {
    idea: 'machine',
    same: [
      'machines',
      'furnace',
      'grinder',
      'crusher',
      'smelter',
      'oven',
      'processor',
      'generator',
    ],
    near: ['recipes', 'fuel', 'redstone', 'tech'],
    misspellings: ['machien', 'mashine'],
    vanillaIds: ['minecraft:furnace', 'minecraft:blast_furnace', 'minecraft:smoker'],
  },
  {
    idea: 'fluid',
    same: ['liquid', 'fluids', 'liquids', 'goo', 'oil', 'acid', 'juice'],
    near: ['water', 'lava', 'bucket'],
    misspellings: ['fluide', 'liqiud', 'liquad'],
  },
  { idea: 'bucket', same: ['buckets', 'pail'], vanillaIds: ['minecraft:bucket'] },
  { idea: 'cauldron', same: ['cauldrons'], vanillaIds: ['minecraft:cauldron'] },
  { idea: 'lake', same: ['lakes', 'pool', 'pond', 'spring'] },
  {
    idea: 'painting',
    same: ['paintings', 'picture', 'artwork', 'art', 'poster', 'portrait', 'canvas'],
    vanillaIds: ['minecraft:painting'],
  },
  {
    idea: 'banner pattern',
    same: ['banner', 'banners', 'flag', 'flags', 'emblem', 'loom pattern'],
    vanillaIds: ['minecraft:white_banner'],
  },
  {
    idea: 'pot pattern',
    same: ['pottery', 'sherd', 'sherds', 'shard', 'decorated pot', 'vase'],
    vanillaIds: ['minecraft:decorated_pot'],
  },
  {
    idea: 'flower pot',
    same: ['planter', 'plant pot', 'pot'],
    vanillaIds: ['minecraft:flower_pot'],
  },
  {
    idea: 'creative tab',
    same: ['creative menu', 'creative inventory', 'inventory tab', 'item group', 'tab'],
  },
];

/** Plants, crops and trees. */
const PLANTS: SearchWordGroup[] = [
  {
    idea: 'crop',
    same: ['crops', 'farm crop', 'vegetable', 'veggie', 'harvest'],
    near: ['farming', 'seeds', 'farmland', 'plant'],
    misspellings: ['corp'],
    vanillaIds: ['minecraft:wheat'],
  },
  { idea: 'seeds', same: ['seed'], vanillaIds: ['minecraft:wheat_seeds'] },
  {
    idea: 'berry bush',
    same: ['berries', 'berry', 'bush', 'shrub'],
    vanillaIds: ['minecraft:sweet_berries'],
  },
  {
    idea: 'tree',
    same: ['trees', 'sapling', 'saplings'],
    near: ['leaves', 'log', 'forest'],
    vanillaIds: ['minecraft:oak_sapling'],
  },
  { idea: 'leaves', same: ['leaf', 'foliage'], vanillaIds: ['minecraft:oak_leaves'] },
  {
    idea: 'plant',
    same: ['plants', 'flower', 'flowers', 'herb', 'weed'],
    near: ['crop', 'vine', 'grows'],
  },
  {
    idea: 'vines',
    same: ['vine', 'creeper vine', 'ivy', 'hanging plant'],
    vanillaIds: ['minecraft:vine', 'minecraft:weeping_vines', 'minecraft:twisting_vines'],
  },
  {
    idea: 'cave vines',
    same: ['glow berries', 'glowing berries'],
    vanillaIds: ['minecraft:glow_berries'],
  },
  { idea: 'kelp', same: ['seaweed', 'water plant', 'sea plant'], vanillaIds: ['minecraft:kelp'] },
  {
    idea: 'lichen',
    same: ['moss', 'glow lichen', 'fungus'],
    vanillaIds: ['minecraft:glow_lichen'],
  },
  { idea: 'cactus', same: ['cacti', 'cactuses', 'spiky plant'], vanillaIds: ['minecraft:cactus'] },
  { idea: 'sugar cane', same: ['cane', 'reed', 'reeds'], vanillaIds: ['minecraft:sugar_cane'] },
  { idea: 'bamboo', same: [], vanillaIds: ['minecraft:bamboo'] },
  {
    idea: 'dripleaf',
    same: ['big dripleaf', 'lily pad', 'tipping leaf'],
    vanillaIds: ['minecraft:big_dripleaf'],
  },
];

/** Food and magic. */
const FOOD_AND_MAGIC: SearchWordGroup[] = [
  {
    idea: 'food',
    same: ['snack', 'meal', 'dish', 'treat', 'fruit', 'edible', 'eat', 'eatable'],
    near: ['hunger', 'apple', 'cooking'],
    misspellings: ['fod', 'foood'],
    vanillaIds: ['minecraft:apple', 'minecraft:bread'],
  },
  {
    idea: 'cake',
    same: ['cakes', 'pie', 'pies', 'tart', 'dessert', 'gateau'],
    vanillaIds: ['minecraft:cake', 'minecraft:pumpkin_pie'],
  },
  {
    idea: 'consumable',
    same: ['drink', 'beverage', 'tonic', 'charm', 'trinket', 'amulet', 'talisman'],
    near: ['potion', 'food', 'effects'],
  },
  {
    idea: 'potion',
    same: ['potions', 'brew', 'elixir', 'flask', 'vial', 'philtre'],
    near: ['brewing', 'brewing stand', 'splash', 'lingering'],
    misspellings: ['poshun', 'potoin', 'poition'],
    vanillaIds: ['minecraft:potion', 'minecraft:brewing_stand'],
  },
  {
    idea: 'status effect',
    same: ['effect', 'effects', 'buff', 'debuff', 'mob effect', 'status'],
    near: ['potion', 'curse', 'blessing'],
  },
  {
    idea: 'particle',
    same: ['particles', 'sparkle', 'sparkles', 'spark', 'sparks', 'glitter', 'fx', 'vfx'],
    near: ['smoke', 'magic'],
    misspellings: ['partical', 'particel', 'partickle'],
  },
  { idea: 'magic', same: ['magical', 'spell', 'spells', 'sorcery', 'wizardry', 'mana'] },
  {
    idea: 'music disc',
    same: ['music', 'song', 'disc', 'record', 'tune', 'track', 'jukebox song', 'vinyl'],
    near: ['jukebox', 'sound'],
    misspellings: ['musik', 'disk'],
    vanillaIds: ['minecraft:music_disc_cat', 'minecraft:jukebox'],
  },
];

/** Mobs and vehicles. */
const MOBS: SearchWordGroup[] = [
  {
    idea: 'mob',
    same: [
      'mobs',
      'creature',
      'creatures',
      'monster',
      'monsters',
      'beast',
      'entity',
      'npc',
      'critter',
    ],
    near: ['animal', 'enemy'],
    misspellings: ['mobb', 'creture', 'monstor'],
  },
  { idea: 'animal', same: ['animals', 'wildlife'], near: ['mob', 'creature'] },
  { idea: 'enemy', same: ['enemies', 'hostile mob', 'baddie'], near: ['monster'] },
  {
    idea: 'pet',
    same: ['pets', 'tame', 'tamed', 'tameable', 'companion', 'buddy', 'sidekick', 'familiar'],
    slang: ['doggo', 'pupper', 'kitty', 'kitten', 'puppy'],
    near: ['dog', 'cat', 'follows'],
  },
  { idea: 'dog', same: ['dogs', 'hound', 'pup'], vanillaIds: ['minecraft:wolf'] },
  { idea: 'cat', same: ['cats'], vanillaIds: ['minecraft:cat'] },
  {
    idea: 'farm animal',
    same: ['livestock', 'cattle', 'farm mob'],
    near: ['cow', 'pig', 'sheep', 'chicken'],
  },
  { idea: 'pig', same: ['pigs', 'piggy', 'hog', 'boar', 'swine'], vanillaIds: ['minecraft:pig'] },
  { idea: 'cow', same: ['cows', 'bull', 'ox'], vanillaIds: ['minecraft:cow'] },
  { idea: 'chicken', same: ['chickens', 'hen', 'chick'], vanillaIds: ['minecraft:chicken'] },
  { idea: 'sheep', same: ['lamb', 'ram'], vanillaIds: ['minecraft:sheep'] },
  {
    idea: 'mount',
    same: ['ride', 'rideable', 'ridable', 'steed', 'saddle'],
    near: ['horse', 'riding'],
    vanillaIds: ['minecraft:saddle'],
  },
  {
    idea: 'horse',
    same: ['horses', 'pony', 'stallion', 'mare', 'unicorn'],
    vanillaIds: ['minecraft:horse'],
  },
  {
    idea: 'flying mob',
    same: ['flyer', 'flier', 'flying creature', 'flying monster'],
    near: ['bird', 'bat', 'dragon', 'fly'],
  },
  {
    idea: 'bird',
    same: ['birds', 'parrot', 'crow', 'owl', 'eagle', 'finch', 'pigeon'],
    vanillaIds: ['minecraft:parrot'],
  },
  { idea: 'bat', same: ['bats', 'moth', 'fairy', 'sprite', 'wisp'], vanillaIds: ['minecraft:bat'] },
  {
    idea: 'dragon',
    same: ['dragons', 'drake', 'wyvern', 'griffin', 'phoenix'],
    vanillaIds: ['minecraft:ender_dragon'],
  },
  { idea: 'fly', same: ['flying', 'flies', 'flight', 'soar', 'hover', 'airborne', 'winged'] },
  {
    idea: 'water mob',
    same: ['sea creature', 'sea monster', 'aquatic', 'water creature'],
    near: ['fish', 'dolphin', 'axolotl', 'swims'],
  },
  {
    idea: 'fish',
    same: ['fishes', 'minnow', 'shark', 'whale', 'eel', 'goldfish'],
    vanillaIds: ['minecraft:cod', 'minecraft:tropical_fish'],
  },
  { idea: 'dolphin', same: ['dolphins', 'porpoise', 'seal'], vanillaIds: ['minecraft:dolphin'] },
  { idea: 'axolotl', same: ['amphibian', 'salamander', 'newt'], vanillaIds: ['minecraft:axolotl'] },
  {
    idea: 'boss',
    same: ['bosses', 'boss fight', 'boss battle', 'miniboss', 'mini boss', 'titan'],
    near: ['boss bar', 'wither', 'dragon'],
    vanillaIds: ['minecraft:wither'],
  },
  {
    idea: 'merchant',
    same: [
      'trader',
      'shopkeeper',
      'shop',
      'seller',
      'vendor',
      'peddler',
      'wandering trader',
      'travelling merchant',
    ],
    near: ['trades', 'emeralds'],
    vanillaIds: ['minecraft:wandering_trader'],
  },
  {
    idea: 'villager',
    same: ['villagers', 'townsperson', 'villager job', 'profession'],
    near: ['village', 'trade'],
    misspellings: ['vilager', 'villiger'],
    vanillaIds: ['minecraft:villager'],
  },
  {
    idea: 'trade',
    same: ['trades', 'trading', 'deal', 'barter', 'buy', 'sell'],
    near: ['emerald'],
  },
  {
    idea: 'job',
    same: ['jobs', 'work', 'occupation', 'career', 'workbench', 'job site', 'job block'],
  },
  { idea: 'outfit', same: ['clothes', 'clothing', 'costume', 'robe', 'apron'], near: ['skin'] },
  {
    idea: 'skin',
    same: ['skins', 'coat', 'fur'],
    near: ['look', 'colour'],
  },
  {
    idea: 'zombie',
    same: ['zombies', 'undead'],
    misspellings: ['zombe', 'zomby'],
    vanillaIds: ['minecraft:zombie'],
  },
  {
    idea: 'skeleton',
    same: ['skeletons'],
    slang: ['skelly'],
    misspellings: ['skeliton', 'skeleten'],
    vanillaIds: ['minecraft:skeleton'],
  },
  {
    idea: 'creeper',
    same: ['creepers'],
    misspellings: ['creper', 'creaper'],
    vanillaIds: ['minecraft:creeper'],
  },
  {
    idea: 'golem',
    same: ['golems', 'guardian', 'construct', 'robot'],
    vanillaIds: ['minecraft:iron_golem'],
  },
  {
    idea: 'vehicle',
    same: ['vehicles', 'transport'],
    near: ['car', 'tank', 'plane', 'boat', 'drive'],
    misspellings: ['vehical', 'vehicel', 'vehicule', 'veicle', 'vechile'],
  },
  {
    idea: 'car',
    same: [
      'cars',
      'kart',
      'go-kart',
      'go kart',
      'truck',
      'van',
      'jeep',
      'automobile',
      'racer',
      'buggy',
      'motorbike',
    ],
    near: ['drive', 'driving', 'wheels'],
  },
  { idea: 'tank', same: ['tanks', 'panzer', 'armoured car'], near: ['turret', 'shells', 'cannon'] },
  {
    idea: 'plane',
    same: [
      'planes',
      'aeroplane',
      'airplane',
      'aircraft',
      'biplane',
      'jet',
      'helicopter',
      'airship',
    ],
    near: ['fly', 'pilot'],
  },
  {
    idea: 'boat',
    same: ['boats', 'motorboat', 'speedboat', 'ship', 'yacht', 'canoe', 'raft', 'jet ski'],
    vanillaIds: ['minecraft:oak_boat'],
  },
  { idea: 'drive', same: ['driving', 'drivable', 'driveable', 'steer'] },
];

/** Worlds, dimensions and packs. */
const WORLDS: SearchWordGroup[] = [
  {
    idea: 'dimension',
    same: ['dimensions', 'realm', 'plane of existence', 'other world', 'new world'],
    near: ['portal', 'world'],
    misspellings: ['dimention', 'dimenshun', 'demension', 'dimesion'],
  },
  {
    idea: 'portal',
    same: ['portals', 'gateway', 'warp gate', 'rift'],
    near: ['frame', 'nether portal'],
    misspellings: ['portel', 'portol'],
    vanillaIds: ['minecraft:nether_portal'],
  },
  {
    idea: 'world',
    same: [
      'world type',
      'world preset',
      'map',
      'terrain',
      'land',
      'generation',
      'worldgen',
      'world generation',
    ],
    near: ['biome', 'dimension'],
  },
  {
    idea: 'skyblock',
    same: ['sky block', 'void world', 'empty world'],
    phrases: ['empty sky', 'one island', 'start island', 'island in the sky'],
    near: ['void', 'sky'],
  },
  // The game flows' own ideas (B557): one block and sky islands have flows of their own now.
  { idea: 'one block', same: ['oneblock', 'single block'], near: ['skyblock'] },
  {
    idea: 'sky islands',
    same: ['sky island', 'floating island', 'floating islands'],
    near: ['skyblock', 'sky'],
  },
  { idea: 'void', same: ['empty', 'air world'] },
  {
    idea: 'islands',
    same: ['island', 'archipelago', 'atolls', 'ocean world', 'sea world'],
    near: ['sea', 'beach'],
  },
  {
    idea: 'mountains',
    same: ['mountain', 'peaks', 'cliffs', 'hills', 'highlands', 'alps', 'amplified'],
  },
  { idea: 'caves', same: ['cave', 'cavern', 'caverns', 'underground', 'underworld', 'cave world'] },
  { idea: 'one biome', same: ['single biome', 'one biome world', 'biome everywhere'] },
  {
    idea: 'biome',
    same: ['biomes', 'climate', 'environment', 'region'],
    misspellings: ['biom', 'bioem', 'byome'],
  },
  { idea: 'superflat', same: ['flat', 'flat world', 'flatland', 'super flat'] },
  { idea: 'nether', same: ['hell'], vanillaIds: ['minecraft:netherrack'] },
  { idea: 'end', same: ['the end', 'ender', 'end world'], vanillaIds: ['minecraft:end_stone'] },
  {
    idea: 'structure',
    same: [
      'structures',
      'building',
      'buildings',
      'house',
      'village',
      'hamlet',
      'dungeon',
      'ruins',
      'jigsaw',
    ],
    near: ['generates'],
  },
  {
    idea: 'loot',
    same: ['drop', 'drops', 'extra drop', 'loot table', 'reward', 'rewards'],
    near: ['dies', 'killed', 'chest loot'],
  },
  {
    idea: 'recipe',
    same: ['recipes', 'crafting', 'craft', 'crafted', 'smelting', 'smithing'],
    near: ['crafting table', 'furnace'],
    misspellings: ['recepie', 'receipe', 'recipie'],
  },
  {
    idea: 'data pack',
    same: ['datapack', 'datapacks', 'data packs', 'behaviour pack'],
    near: ['functions', 'mcfunction'],
  },
  {
    idea: 'resource pack',
    same: ['resourcepack', 'texture pack', 'texturepack', 'resource packs', 'textures'],
  },
  { idea: 'function', same: ['functions', 'mcfunction', 'command block', 'tick function'] },
  {
    idea: 'command',
    same: ['commands', 'slash command', 'chat command', 'custom command'],
    near: ['chat', 'operator'],
  },
  {
    idea: 'game rule',
    same: ['gamerule', 'gamerules', 'game rules', 'world setting', 'world option', 'toggle'],
  },
  {
    idea: 'script',
    same: ['scripts', 'scripted', 'code', 'coding', 'javascript', 'typescript', 'program'],
    near: ['behaviour'],
  },
  {
    idea: 'experience',
    same: ['experience points', 'xp orbs', 'experience orbs'],
    slang: ['xp', 'exp'],
    misspellings: ['experiance', 'expirience', 'experince'],
    vanillaIds: ['minecraft:experience_bottle'],
  },
  {
    idea: 'teleport',
    same: ['teleporter', 'teleports', 'teleportation', 'warp', 'blink'],
    slang: ['tp'],
  },
  { idea: 'mod', same: ['mods', 'modding', 'fabric mod', 'addon', 'add-on'], near: ['jar'] },
];

/** Every word group of the library's things (ADR 0124 D5). */
export const THINGS: SearchWordGroup[] = [
  ...GEAR,
  ...BLOCKS,
  ...PLANTS,
  ...FOOD_AND_MAGIC,
  ...MOBS,
  ...WORLDS,
];
