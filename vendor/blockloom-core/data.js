const BASE_MATERIALS = [
  { id: 'stone', name: 'Stone', group: 'Stone', base: '#858585', type: 'stone', keywords: ['stone', 'rock', 'boulder'] },
  { id: 'cobblestone', name: 'Cobblestone', group: 'Stone', base: '#81837d', type: 'cobble', keywords: ['cobblestone', 'cobble', 'rocky'] },
  { id: 'deepslate', name: 'Deepslate', group: 'Stone', base: '#4d4e55', type: 'deepslate', keywords: ['deepslate', 'slate', 'deep stone'] },
  { id: 'gravel', name: 'Gravel', group: 'Stone', base: '#898680', type: 'gravel', keywords: ['gravel', 'pebbles', 'pebble'] },
  { id: 'bricks', name: 'Bricks', group: 'Stone', base: '#9e6350', type: 'bricks', keywords: ['brick', 'bricks', 'masonry'] },
  { id: 'obsidian', name: 'Obsidian', group: 'Stone', base: '#292334', type: 'obsidian', keywords: ['obsidian', 'voidstone'] },
  { id: 'dirt', name: 'Dirt', group: 'Earth', base: '#7b5940', type: 'dirt', keywords: ['dirt', 'soil', 'earth', 'mud', 'loam'] },
  { id: 'grass_block', name: 'Grass Block', group: 'Earth', base: '#71994f', type: 'grass', dirt: '#79573d', keywords: ['grass', 'turf', 'lawn', 'grass block', 'grassblock'] },
  { id: 'sand', name: 'Sand', group: 'Earth', base: '#d5c28e', type: 'sand', keywords: ['sand', 'desert', 'dune'] },
  { id: 'snow', name: 'Snow', group: 'Earth', base: '#e6eeee', type: 'snow', keywords: ['snow', 'snowy', 'arctic'] },
  { id: 'ice', name: 'Ice', group: 'Earth', base: '#8ab8cc', type: 'ice', keywords: ['ice', 'frozen', 'glacier'] },
  { id: 'moss_block', name: 'Moss Block', group: 'Earth', base: '#6e8a3f', type: 'moss', keywords: ['moss block', 'mossblock', 'mossy block'] },
  { id: 'oak_planks', name: 'Oak Planks', group: 'Wood', base: '#a87b4d', type: 'planks', keywords: ['plank', 'planks', 'wooden', 'wood planks', 'floorboard', 'board'] },
  { id: 'oak_log', name: 'Oak Log', group: 'Wood', base: '#6f5037', type: 'log', keywords: ['log', 'bark', 'tree trunk', 'timber', 'wood log'] },
  { id: 'leaves', name: 'Leaves', group: 'Wood', base: '#588541', type: 'leaves', keywords: ['leaves', 'leaf', 'foliage', 'canopy'] },
  { id: 'netherrack', name: 'Netherrack', group: 'Other', base: '#763438', type: 'netherrack', keywords: ['netherrack', 'nether', 'hellstone', 'infernal'] },
  { id: 'end_stone', name: 'End Stone', group: 'Other', base: '#d9dda0', type: 'endstone', keywords: ['end stone', 'endstone', 'end'] },
  { id: 'prismarine', name: 'Prismarine', group: 'Other', base: '#589a8b', type: 'prismarine', keywords: ['prismarine', 'ocean', 'aquatic'] },
  { id: 'terracotta', name: 'Terracotta', group: 'Other', base: '#9b6048', type: 'terracotta', keywords: ['terracotta', 'clay', 'adobe'] },
  { id: 'wool', name: 'Wool', group: 'Other', base: '#e7e0d4', type: 'wool', keywords: ['wool', 'fabric', 'cloth', 'carpet'] },
  { id: 'gold_ore', name: 'Gold Ore', group: 'Ores', base: '#817d73', accent: '#f0c94f', type: 'ore', ore: 'gold', keywords: ['gold ore', 'gold', 'gilded ore'] },
  { id: 'diamond_ore', name: 'Diamond Ore', group: 'Ores', base: '#7d8583', accent: '#57ddd4', type: 'ore', ore: 'diamond', keywords: ['diamond ore', 'diamond', 'diamonds'] },
  { id: 'redstone_ore', name: 'Redstone Ore', group: 'Ores', base: '#7d6b6b', accent: '#d84a3e', type: 'ore', ore: 'redstone', keywords: ['redstone ore', 'redstone', 'ruby ore'] },
  { id: 'emerald_ore', name: 'Emerald Ore', group: 'Ores', base: '#7c8376', accent: '#39cc72', type: 'ore', ore: 'emerald', keywords: ['emerald ore', 'emerald', 'emeralds'] },
  { id: 'copper_ore', name: 'Copper Ore', group: 'Ores', base: '#837c70', accent: '#d08758', type: 'ore', ore: 'copper', keywords: ['copper ore', 'copper', 'verdigris'] },
  { id: 'lapis_ore', name: 'Lapis Ore', group: 'Ores', base: '#7d7d78', accent: '#3f6fd2', type: 'ore', ore: 'lapis', keywords: ['lapis ore', 'lapis', 'azure ore'] },
];
const DYE_COLORS = [
  { id: 'white', name: 'White', hex: '#e9ecec' },
  { id: 'orange', name: 'Orange', hex: '#f07613' },
  { id: 'magenta', name: 'Magenta', hex: '#bd44b3' },
  { id: 'light_blue', name: 'Light Blue', hex: '#3aafd9' },
  { id: 'yellow', name: 'Yellow', hex: '#f8c627' },
  { id: 'lime', name: 'Lime', hex: '#70b919' },
  { id: 'pink', name: 'Pink', hex: '#ed8dac' },
  { id: 'gray', name: 'Gray', hex: '#3e4447' },
  { id: 'light_gray', name: 'Light Gray', hex: '#8e8e86' },
  { id: 'cyan', name: 'Cyan', hex: '#158991' },
  { id: 'purple', name: 'Purple', hex: '#792aac' },
  { id: 'blue', name: 'Blue', hex: '#35399d' },
  { id: 'brown', name: 'Brown', hex: '#724728' },
  { id: 'green', name: 'Green', hex: '#546d1b' },
  { id: 'red', name: 'Red', hex: '#a12722' },
  { id: 'black', name: 'Black', hex: '#141519' },
];


const colorVariants = DYE_COLORS.map((color) => ([
  {
    id: `stained_glass_${color.id}`,
    name: `${color.name} Stained Glass`,
    group: 'Glass',
    base: color.hex,
    type: 'stained_glass',
    keywords: [`${color.name.toLowerCase()} stained glass`, `stained glass ${color.name.toLowerCase()}`, `${color.name.toLowerCase()} glass`],
  },
  {
    id: `concrete_${color.id}`,
    name: `${color.name} Concrete`,
    group: 'Concrete',
    base: color.hex,
    type: 'concrete',
    keywords: [`${color.name.toLowerCase()} concrete`, `concrete ${color.name.toLowerCase()}`],
  },
  ...(color.id === 'white' ? [] : [{
    id: `wool_${color.id}`,
    name: `${color.name} Wool`,
    group: 'Wool',
    base: color.hex,
    type: 'wool',
    keywords: [`${color.name.toLowerCase()} wool`, `wool ${color.name.toLowerCase()}`],
  }]),
])).flat();

const FAMILY_MATERIALS = [
  { id: 'stone_bricks', name: 'Stone Bricks', group: 'Stone', base: '#8d8d89', type: 'bricks', keywords: ['stone bricks', 'stone brick', 'stonebrick'] },
  { id: 'nether_bricks', name: 'Nether Bricks', group: 'Stone', base: '#401a1d', type: 'bricks', keywords: ['nether bricks', 'nether brick'] },
  { id: 'mud_bricks', name: 'Mud Bricks', group: 'Stone', base: '#89624f', type: 'bricks', keywords: ['mud bricks', 'mud brick'] },
  { id: 'glass', name: 'Glass', group: 'Glass', base: '#d9eeee', type: 'glass', keywords: ['glass', 'clear glass', 'window'] },
  { id: 'iron_block', name: 'Iron Block', group: 'Metal', base: '#d8d8d8', accent: '#eeeeee', type: 'metal', keywords: ['iron block', 'block of iron', 'iron'] },
  { id: 'gold_block', name: 'Gold Block', group: 'Metal', base: '#f4c84c', accent: '#fff09e', type: 'metal', keywords: ['gold block', 'block of gold', 'gold'] },
  { id: 'diamond_block', name: 'Diamond Block', group: 'Metal', base: '#5edbd4', accent: '#c4fff9', type: 'metal', keywords: ['diamond block', 'block of diamond', 'diamond block'] },
  { id: 'emerald_block', name: 'Emerald Block', group: 'Metal', base: '#34c86f', accent: '#b4ffcf', type: 'metal', keywords: ['emerald block', 'block of emerald'] },
  { id: 'redstone_block', name: 'Redstone Block', group: 'Metal', base: '#b0191c', accent: '#ff5b4d', type: 'metal', keywords: ['redstone block', 'block of redstone'] },
  { id: 'lapis_block', name: 'Lapis Block', group: 'Metal', base: '#3355b8', accent: '#82a7ff', type: 'metal', keywords: ['lapis block', 'block of lapis'] },
  { id: 'netherite_block', name: 'Netherite Block', group: 'Metal', base: '#3a3238', accent: '#6b5a62', type: 'metal', keywords: ['netherite block', 'block of netherite'] },
  { id: 'copper_block', name: 'Copper Block', group: 'Metal', base: '#c06a45', accent: '#f2a06b', type: 'copper', stage: 0, keywords: ['copper block', 'block of copper'] },
  { id: 'exposed_copper', name: 'Exposed Copper', group: 'Metal', base: '#a77a62', accent: '#d7a17e', type: 'copper', stage: 1, keywords: ['exposed copper', 'exposed copper block'] },
  { id: 'weathered_copper', name: 'Weathered Copper', group: 'Metal', base: '#5f8b70', accent: '#9fc49e', type: 'copper', stage: 2, keywords: ['weathered copper', 'weathered copper block'] },
  { id: 'oxidized_copper', name: 'Oxidized Copper', group: 'Metal', base: '#4d8b76', accent: '#8ed0b5', type: 'copper', stage: 3, keywords: ['oxidized copper', 'oxidized copper block'] },
  { id: 'leaves_cutout', name: 'Cutout Leaves', group: 'Wood', base: '#4f833d', type: 'leaves_cutout', keywords: ['cutout leaves', 'transparent leaves', 'leaves cutout', 'leaf cutout'] },
];

export const MATERIALS = [...BASE_MATERIALS, ...FAMILY_MATERIALS, ...colorVariants];
const MATERIAL_BY_ID = new Map(MATERIALS.map((material) => [material.id, material]));
export const getMaterial = (id) => MATERIAL_BY_ID.get(id) || MATERIALS[1];

export const MATERIAL_GROUPS = ['Stone', 'Earth', 'Wood', 'Glass', 'Wool', 'Concrete', 'Metal', 'Ores', 'Other'];

export const MATERIAL_WORDS = [...MATERIALS]
  .flatMap((material) => material.keywords.map((word) => ({
    id: material.id,
    word,
    priority: material.type === 'ore' ? 3 : 2,
  })))
  .sort((a, b) => b.word.length - a.word.length);

export const MODIFIER_WORDS = [
  { id: 'mossy', label: 'Mossy', words: ['mossy', 'moss covered', 'moss-covered', 'overgrown', 'lichen'] },
  { id: 'cracked', label: 'Cracked', words: ['cracked', 'fractured', 'fissured', 'broken'] },
  { id: 'glowing', label: 'Glowing', words: ['glowing', 'glow', 'emissive', 'luminous', 'neon', 'magical'] },
  { id: 'frosted', label: 'Frosted', words: ['frosted', 'frozen over', 'icy', 'snowy', 'rime'] },
  { id: 'ancient', label: 'Ancient', words: ['ancient', 'weathered', 'eroded', 'old', 'ruined', 'antique'] },
  { id: 'burned', label: 'Charred', words: ['burned', 'burnt', 'charred', 'scorched', 'ashen'] },
  { id: 'gilded', label: 'Gilded', words: ['gilded', 'gold flecked', 'gold-flecked', 'brass', 'ornate'] },
  { id: 'flecked', label: 'Flecked', words: ['fleck', 'flecks', 'flake', 'flakes', 'speck', 'specks', 'vein', 'veins'] },
  { id: 'crystal', label: 'Crystals', words: ['crystal', 'crystals', 'crystalline', 'gem', 'gems', 'geode', 'shard', 'shards'] },
  { id: 'wet', label: 'Wet', words: ['wet', 'damp', 'rain soaked', 'rain-soaked', 'glossy'] },
  { id: 'flowery', label: 'Flowery', words: ['flowery', 'flowers', 'flower', 'blooming', 'blossom'] },
];

export const COLOR_WORDS = [
  { name: 'Cyan', hex: '#54e0d8', hue: 178, sat: 0.62, words: ['cyan', 'turquoise', 'aqua'] },
  { name: 'Blue', hex: '#5688dd', hue: 219, sat: 0.62, words: ['blue', 'azure', 'cobalt'] },
  { name: 'Sapphire', hex: '#3f65c9', hue: 224, sat: 0.7, words: ['sapphire'] },
  { name: 'Teal', hex: '#3fbfa7', hue: 170, sat: 0.58, words: ['teal'] },
  { name: 'Green', hex: '#67c95f', hue: 116, sat: 0.58, words: ['green', 'verdant'] },
  { name: 'Emerald', hex: '#32c971', hue: 146, sat: 0.65, words: ['emerald'] },
  { name: 'Lime', hex: '#afe85c', hue: 84, sat: 0.68, words: ['lime'] },
  { name: 'Purple', hex: '#a578dd', hue: 274, sat: 0.56, words: ['purple', 'violet', 'amethyst'] },
  { name: 'Magenta', hex: '#d956b6', hue: 314, sat: 0.64, words: ['magenta', 'fuchsia'] },
  { name: 'Pink', hex: '#eb81ab', hue: 337, sat: 0.58, words: ['pink', 'rose', 'blush'] },
  { name: 'Red', hex: '#df4e49', hue: 2, sat: 0.7, words: ['red', 'crimson', 'ruby', 'scarlet'] },
  { name: 'Orange', hex: '#ec904c', hue: 26, sat: 0.7, words: ['orange', 'tangerine'] },
  { name: 'Amber', hex: '#e7b44e', hue: 41, sat: 0.72, words: ['amber', 'honey'] },
  { name: 'Gold', hex: '#eec94f', hue: 47, sat: 0.74, words: ['golden', 'gold flecked', 'gold-flecked'] },
  { name: 'Yellow', hex: '#eadf5b', hue: 56, sat: 0.7, words: ['yellow', 'sunny'] },
  { name: 'White', hex: '#edf1ed', hue: 120, sat: 0.03, words: ['white', 'pale', 'ivory', 'snow white'], light: 0.16 },
  { name: 'Black', hex: '#27272d', hue: 240, sat: 0.07, words: ['black', 'dark', 'onyx'], light: -0.14 },
  { name: 'Brown', hex: '#8a5e42', hue: 25, sat: 0.35, words: ['brown', 'chocolate', 'umber'] },
  { name: 'Silver', hex: '#c7ced0', hue: 200, sat: 0.07, words: ['silver', 'steel', 'chrome'] },
];

export const FINISHES = [
  { id: 'rugged', label: 'Rugged', note: 'Gritty, high-contrast grain' },
  { id: 'balanced', label: 'Balanced', note: 'Classic Minecraft density' },
  { id: 'smooth', label: 'Smooth', note: 'Clean, low-noise surfaces' },
];

export const FINISH_CONFIG = {
  rugged: { grain: 1.2, depth: 1.16, dither: 1.25, clutter: 1.25 },
  balanced: { grain: 1, depth: 1, dither: 1, clutter: 1 },
  smooth: { grain: 0.38, depth: 0.82, dither: 0.35, clutter: 0.7 },
};
