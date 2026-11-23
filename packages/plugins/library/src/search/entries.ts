/**
 * Extra doors to the library's own flows and examples (ADR 0124 D13): things known by another
 * name than the flow that makes them ("Elytra" is the Glider flow, "Sleeping bag" the Bed flow
 * with its kind answered, "Skyblock" the Skyblock flow of the game modes plan, B557), each opening the flow with the answers that make that thing. An entry is
 * available when the thing it opens is (the flow's own `supports`).
 *
 * Every starter, example, question and value named here is checked in `test/search.test.ts`;
 * every answer must pass the wizard's own check.
 */

import type { Json, SearchEntryContribution } from '@msm/plugin-api';

/** An entry that opens `starter` with `values`. */
function flow(
  id: string,
  title: string,
  sentence: string,
  starter: string,
  values: Record<string, Json>,
  words?: string[],
): SearchEntryContribution {
  const entry: SearchEntryContribution = {
    id,
    title,
    sentence,
    opens: { type: 'starter', id: starter, values },
  };
  if (words !== undefined) entry.words = words;
  return entry;
}

/** An entry that opens the example `example`. */
function example(
  id: string,
  title: string,
  sentence: string,
  opens: string,
  words?: string[],
): SearchEntryContribution {
  const entry: SearchEntryContribution = {
    id,
    title,
    sentence,
    opens: { type: 'example', id: opens },
  };
  if (words !== undefined) entry.words = words;
  return entry;
}

const WEAPONS: SearchEntryContribution[] = [
  flow(
    'sword',
    'Sword',
    'A new sword with its own name, colour and tier.',
    'weapon',
    { weapon_type: 'sword' },
    ['blade', 'katana', 'sabre'],
  ),
  flow(
    'spear',
    'Spear',
    'A new spear with its thrust and jab attacks.',
    'weapon',
    { weapon_type: 'spear' },
    ['lance', 'javelin'],
  ),
  flow(
    'mace',
    'Mace',
    'A new mace that hits harder the further you fall.',
    'weapon',
    { weapon_type: 'mace' },
    ['hammer', 'warhammer'],
  ),
  flow(
    'bow',
    'Bow',
    'A new bow with its own draw speed and arrow damage.',
    'weapon',
    { weapon_type: 'bow' },
    ['longbow', 'archery'],
  ),
  flow(
    'crossbow',
    'Crossbow',
    'A new crossbow with its own charge speed and arrow damage.',
    'weapon',
    { weapon_type: 'crossbow' },
  ),
  flow(
    'shield',
    'Shield',
    'A new shield that blocks attacks.',
    'weapon',
    { weapon_type: 'shield' },
    ['buckler'],
  ),
  flow(
    'armour',
    'Armour',
    'A helmet, chestplate, leggings and boots of a new material.',
    'gear-set',
    { pieces: ['helmet', 'chestplate', 'leggings', 'boots'] },
    ['armor', 'armour set', 'suit'],
  ),
  flow(
    'tools',
    'Tools',
    'A sword, pickaxe, axe, shovel and hoe of a new material.',
    'gear-set',
    { pieces: ['sword', 'pickaxe', 'axe', 'shovel', 'hoe'] },
    ['toolset', 'tool set'],
  ),
  flow('pickaxe', 'Pickaxe', 'A pickaxe of a new material.', 'gear-set', { pieces: ['pickaxe'] }, [
    'pick',
    'pickax',
  ]),
  flow(
    'horse-armour',
    'Horse armour',
    'Horse armour of a new material.',
    'gear-set',
    { pieces: ['horse_armor'] },
    ['horse armor'],
  ),
  flow('elytra', 'Elytra', 'Wings to wear on your chest and glide with.', 'glider', {}, [
    'wings',
    'wingsuit',
  ]),
  flow(
    'grenade',
    'Grenade',
    'A bomb you throw that bursts where it lands.',
    'throwable',
    { style: 'bomb', on_hit: 'burst' },
    ['bomb', 'nade'],
  ),
  flow('boomerang', 'Boomerang', 'A boomerang that comes back when it lands.', 'throwable', {
    style: 'boomerang',
  }),
  flow(
    'throwing-knife',
    'Throwing knife',
    'A knife you throw and pick up again.',
    'throwable',
    { style: 'knife' },
    ['shuriken', 'throwing star'],
  ),
  flow(
    'fire-aspect',
    'Fire enchantment',
    'An enchantment for swords that sets the target on fire.',
    'enchantment',
    { effect: 'fire', applies_to: 'swords' },
    ['fire aspect', 'flame'],
  ),
  flow(
    'magic-wand',
    'Magic wand',
    'An item that does something when used: heals, launches or strikes lightning.',
    'scripted-item',
    {},
    ['wand', 'staff', 'spell'],
  ),
  flow(
    'lightning-staff',
    'Lightning staff',
    'A staff that strikes lightning where you look.',
    'scripted-item',
    { behaviour: 'lightning' },
    ['thunder', 'zeus'],
  ),
];

const BLOCKS: SearchEntryContribution[] = [
  flow(
    'sleeping-bag',
    'Sleeping bag',
    'A sleeping bag that follows the straw bed rule.',
    'bed',
    { kind: 'sleeping_bag' },
    ['bedroll'],
  ),
  flow(
    'glowing-block',
    'Glowing block',
    'A block that gives off light.',
    'simple-block',
    { light_level: 15 },
    ['light block', 'lamp block'],
  ),
  flow(
    'shulker-box',
    'Shulker-like box',
    'A crate that keeps its contents when broken, as a shulker box does.',
    'storage-crate',
    { keep_contents: true },
    ['shulker'],
  ),
  flow(
    'ender-chest',
    'Private chest',
    'A crate that holds different things for every player, as an ender chest does.',
    'storage-crate',
    { per_player: true },
    ['ender chest'],
  ),
  flow('double-chest', 'Double chest', 'A crate that joins into a double chest.', 'storage-crate', {
    double: true,
    size: 'medium',
  }),
  flow(
    'furnace',
    'Furnace',
    'A machine that burns fuel and smelts, with recipes of its own.',
    'machine',
    { power: 'fuel', vanilla_types: ['minecraft:smelting'] },
    ['smelter', 'oven'],
  ),
  flow(
    'grinder',
    'Grinder',
    'A machine that grinds cobblestone into gravel and gravel into flint.',
    'machine',
    { recipe_1: 'gravel', recipe_2: 'flint' },
    ['crusher', 'mill'],
  ),
  flow('torch', 'Torch', 'A torch with its wall torch, in your colour of flame.', 'lights', {
    members: ['torch'],
  }),
  flow('lantern', 'Lantern', 'A lantern of your own.', 'lights', { members: ['lantern'] }),
  flow('candle', 'Candle', 'A candle of your own.', 'lights', { members: ['candle'] }),
  flow(
    'soul-torch',
    'Blue flame torch',
    'A torch with a blue flame, as a soul torch.',
    'lights',
    { members: ['torch'], particle: 'minecraft:soul_fire_flame' },
    ['soul torch'],
  ),
  flow(
    'berry-bush',
    'Berry bush',
    'A bush with berries you pick again and again.',
    'crop',
    { plant: 'berry_bush' },
    ['berries', 'shrub'],
  ),
  flow(
    'cactus',
    'Cactus',
    'A spiny plant that grows on sand.',
    'desert-plants',
    { kind: 'cactus' },
    ['cacti'],
  ),
  flow(
    'sugar-cane',
    'Sugar cane',
    'A cane that grows tall next to water.',
    'desert-plants',
    { kind: 'cane' },
    ['reed'],
  ),
  flow('bamboo', 'Bamboo', 'A woody stalk with leaves.', 'desert-plants', { kind: 'bamboo' }),
  flow(
    'big-dripleaf',
    'Big dripleaf',
    'A big leaf that tips when you stand on it.',
    'desert-plants',
    { kind: 'dripleaf' },
  ),
  flow(
    'cave-vines',
    'Cave vines',
    'Vines that hang from the ceiling with glowing berries.',
    'cave-plants',
    { kind: 'cave_vine' },
    ['glow berries'],
  ),
  flow('weeping-vines', 'Weeping vines', 'Vines that hang down in long strands.', 'cave-plants', {
    kind: 'weeping',
  }),
  flow('twisting-vines', 'Twisting vines', 'Vines that grow up from the ground.', 'cave-plants', {
    kind: 'twisting',
  }),
  flow(
    'kelp',
    'Kelp',
    'A water plant that grows up as kelp does.',
    'cave-plants',
    { kind: 'kelp' },
    ['seaweed'],
  ),
  flow(
    'glow-lichen',
    'Glow lichen',
    'A lichen that spreads over any side of a block and glows.',
    'cave-plants',
    { kind: 'lichen' },
    ['moss'],
  ),
  flow(
    'lava-like-fluid',
    'Lava-like liquid',
    'A new liquid that burns, glows and flows slowly, as lava does.',
    'fluid',
    { behaves_like: 'lava' },
    ['molten'],
  ),
  flow(
    'honey-fluid',
    'Thick liquid',
    'A new liquid that flows slowly, like honey.',
    'fluid',
    { speed: 'slow' },
    ['honey', 'slime'],
  ),
  flow('pie', 'Pie', 'A pie eaten a slice at a time.', 'cake', { style: 'pie' }, ['tart']),
  flow(
    'lightning-rod',
    'Lightning rod',
    'A metal that ages as copper does, with a rod like a lightning rod.',
    'copper-set',
    { members: ['block', 'rod'] },
  ),
];

const MOBS: SearchEntryContribution[] = [
  flow(
    'dog',
    'Dog',
    'A four-legged pet that you tame with bones and that follows you.',
    'pet',
    { preset: 'quadruped', taming_food: 'bones' },
    ['puppy', 'doggo', 'wolf'],
  ),
  flow(
    'cat',
    'Cat',
    'A four-legged pet that you tame with fish.',
    'pet',
    { preset: 'quadruped', taming_food: 'raw_fish' },
    ['kitty', 'kitten'],
  ),
  flow(
    'parrot',
    'Shoulder bird',
    'A bird pet that rides on your shoulder.',
    'pet',
    { preset: 'bird', shoulder: true, taming_food: 'seeds' },
    ['parrot'],
  ),
  flow(
    'horse',
    'Horse',
    'A four-legged mount you ride with a saddle.',
    'mount',
    { preset: 'quadruped' },
    ['pony', 'steed'],
  ),
  flow(
    'dragon',
    'Flying mount',
    'A mount that flies where you steer it.',
    'mount',
    { flying: true, preset: 'flyer' },
    ['dragon', 'griffin'],
  ),
  flow('bird', 'Bird', 'A bird that flies about.', 'flying-mob', { preset: 'bird' }, ['birds']),
  flow(
    'ghast-like',
    'Floating mob',
    'A mob that floats above the ground and shoots fire charges, as a ghast does.',
    'flying-mob',
    { flight: 'hover', behaviour: 'shooter', projectile: 'minecraft:fire_charge' },
    ['ghast'],
  ),
  flow(
    'vex-like',
    'Ghost',
    'A mob that flies through walls when it charges, as a vex does.',
    'flying-mob',
    { flight: 'phase', behaviour: 'hostile' },
    ['vex', 'spirit', 'phantom'],
  ),
  flow(
    'bat-like',
    'Roosting flyer',
    'A flyer that hangs under blocks by day.',
    'flying-mob',
    { roosts: true },
    ['bat'],
  ),
  flow('dolphin', 'Dolphin', 'A swimmer that comes up for air.', 'water-mob', { kind: 'dolphin' }),
  flow('axolotl', 'Axolotl', 'An amphibian that walks and swims and plays dead.', 'water-mob', {
    kind: 'amphibian',
    plays_dead: true,
  }),
  flow('shark', 'Shark', 'A fish that attacks players in the water.', 'water-mob', {
    kind: 'fish',
    behaviour: 'hostile',
  }),
  flow(
    'monster',
    'Monster',
    'A hostile mob that hunts players in the dark.',
    'custom_mob',
    { behaviour: 'hostile' },
    ['enemy', 'zombie-like'],
  ),
  flow(
    'archer-mob',
    'Archer mob',
    'A hostile mob that shoots arrows from a distance.',
    'custom_mob',
    { behaviour: 'archer' },
    ['skeleton-like'],
  ),
  flow(
    'giant-boss',
    'Giant boss',
    'A boss three times as big as a player.',
    'boss',
    { size: 'giant' },
    ['giant', 'titan'],
  ),
  flow(
    'shopkeeper',
    'Shopkeeper',
    'A mob that sells things for emeralds.',
    'wandering-merchant',
    {},
    ['shop', 'trader'],
  ),
  flow(
    'blacksmith',
    'Blacksmith job',
    'A village job that trades as a toolsmith does.',
    'village-job',
    { trades_like: 'toolsmith' },
    ['smith'],
  ),
];

const WORLDS: SearchEntryContribution[] = [
  flow(
    'skyblock',
    'Skyblock',
    'A game on a small island with a chest in an empty sky.',
    'skyblock',
    {},
    ['sky block', 'void world'],
  ),
  flow(
    'oneblock',
    'One block',
    'A game on one block that turns into the next each time you break it.',
    'one-block',
    {},
    ['oneblock', 'one block'],
  ),
  flow(
    'pvp-arena',
    'PvP arena',
    'Two teams fighting rounds in an arena, with points on the sidebar.',
    'arena-game',
    { teams: '2' },
    ['pvp', 'team fight'],
  ),
  flow(
    'parkour',
    'Parkour race',
    'A timed run through checkpoints, the best times on the sidebar.',
    'race',
    {},
    ['parkour', 'time trial'],
  ),
  flow(
    'superflat-biome',
    'Flat world',
    'A flat world of one biome.',
    'world-one-biome',
    { shape: 'flat' },
    ['superflat', 'flat land'],
  ),
  flow(
    'nether-dimension',
    'Nether-like dimension',
    'A new dimension of nether-like caverns.',
    'dimension',
    { terrain: 'nether' },
    ['hell'],
  ),
  flow(
    'floating-islands',
    'Floating islands',
    'A new dimension of floating islands over the void.',
    'dimension',
    { terrain: 'floating_islands' },
    ['sky islands', 'aether'],
  ),
  flow(
    'nether-portal',
    'Portal to the Nether',
    'A portal of your own that leads to the Nether.',
    'portal',
    { destination: 'minecraft:the_nether' },
  ),
  flow('end-portal', 'Portal to the End', 'A portal of your own that leads to the End.', 'portal', {
    destination: 'minecraft:the_end',
  }),
  flow(
    'heal-command',
    '/heal command',
    'A command players type to heal.',
    'custom-command',
    { action: 'heal' },
    ['heal'],
  ),
];

const EXAMPLES: SearchEntryContribution[] = [
  example(
    'lucky-block',
    'Lucky block',
    'A block that does something random when broken, made with Rules.',
    'example_msm_rules',
    ['random block'],
  ),
  example(
    'sky-farm',
    'Skyblock farm',
    'A ready-made Skyblock on a round island with food in the chest.',
    'example_game_cloud_farm',
    ['sky farm'],
  ),
  example(
    'furniture',
    'Furniture',
    'Cottage furniture and lights: beds, lanterns, signs and more.',
    'example_popular_cottage_furniture',
    ['chairs', 'tables', 'decor'],
  ),
  example(
    'rocket-boots',
    'Rocket boots',
    'Boots that launch you up, made with Rules.',
    'example_popular_rocket_boots',
    ['jet boots', 'jetpack'],
  ),
  example(
    'coordinates',
    'Coordinates on screen',
    'Your position shown on the screen all the time.',
    'example_popular_coordinates_bar',
    ['coords', 'position'],
  ),
  example(
    'first-mod',
    'A whole first mod',
    'An ore, tools, armour, trims, advancements and world generation in one mod.',
    'example_popular_glowshard',
    ['complete mod', 'full mod'],
  ),
  example(
    'loot-crate',
    'Treasure crate',
    'A crate that fills with loot in a structure.',
    'example_msm_loot_crate',
    ['treasure chest'],
  ),
  example(
    'teleport-staff',
    'Teleport staff',
    'A staff that teleports you where you look, as a script.',
    'example_msm_teleport_staff',
    ['ender staff', 'blink'],
  ),
];

/** Every entry of the library (ADR 0124 D13). */
export const ENTRIES: SearchEntryContribution[] = [
  ...WEAPONS,
  ...BLOCKS,
  ...MOBS,
  ...WORLDS,
  ...EXAMPLES,
];
