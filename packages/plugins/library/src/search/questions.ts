/**
 * Hints for answering the library's flow questions from the words of a query (ADR 0124 D7,
 * B650 SQ6), by starter id and then question id:
 *
 * - `role`: `name` on each flow's name question (also where the label carries no "name", as the
 *   Fluid flow's "What is it called?"), `main-colour` on the colour the first colour word goes
 *   to, `main-number` where a bare number means one question ("a 500 boss").
 * - `words`: words that name a question beside its label, chiefly where the label has no word of
 *   its own ("Effect 1: seconds", "Damage blocked") or a second colour ("leaf", "patina").
 * - `after`: the clash rules 1 and 2 of B650 SQ6: a "from" question (an ingredient, a base, a
 *   machine recipe, a template item) takes a word only after "from", "of", "made of" or "with";
 *   a "like X" question only after "like" or "as".
 * - `never`: variants (rule 4), pictures and sound files.
 * - `sameAs`: questions that share a word by design (rule 5: the Tree's log and leaves, the Wood
 *   set's kind and its sounds).
 * - `appliesWhen`: questions that apply only to some answers of another (rule 7: the Weapon's
 *   attack damage only for melee weapons with their own numbers).
 * - `choiceWords`: extra words for choices whose label is not what people type.
 *
 * Every question id, choice value and `appliesWhen` value is checked against its starter in
 * `test/search.test.ts`; this file never imports the starters, so it stays data.
 */

import type { SearchQuestionHint } from '@msm/plugin-api';

type Hints = Record<string, SearchQuestionHint>;

/** The words before a "from" question's answer (B650 SQ6 rule 1). */
const FROM = ['from', 'of', 'made of', 'made from', 'with', 'using', 'out of'];
/** The words before a "like X" question's answer (rule 2). */
const LIKE = ['like', 'as', 'same as'];
/** The words before a place question's answer. */
const IN = ['in', 'near', 'around'];

const NAME: SearchQuestionHint = { role: 'name' };
const MAIN_COLOUR: SearchQuestionHint = { role: 'main-colour' };
const NEVER: SearchQuestionHint = { never: true };

/** Hints for `ids`, all `never` (pictures, sound files, variants). */
function never(ids: readonly string[]): Hints {
  return Object.fromEntries(ids.map((id) => [id, NEVER]));
}

/** The variant questions of a mob flow (rule 4: never answered from words). */
function variants(): Hints {
  const out: Hints = {};
  for (const n of [1, 2, 3]) {
    out[`variant_${n}_colour`] = NEVER;
    out[`variant_${n}_biome`] = NEVER;
  }
  out.variant_count = { words: ['variants', 'variant', 'kinds of', 'colour variants', 'versions'] };
  return out;
}

/** Words for the vanilla effects a flow's effect question offers, by effect id. */
const EFFECT_WORDS: Record<string, string[]> = {
  'minecraft:speed': ['fast', 'faster', 'swift', 'swiftness', 'quick', 'run faster'],
  'minecraft:haste': ['mine faster', 'dig faster', 'mining speed'],
  'minecraft:strength': ['strong', 'stronger', 'power', 'hit harder'],
  'minecraft:jump_boost': ['jump', 'jumping', 'leap', 'jump higher', 'bounce'],
  'minecraft:regeneration': ['regen', 'heal', 'heals', 'healing', 'health back'],
  'minecraft:resistance': ['tough', 'tougher', 'defence', 'protection'],
  'minecraft:fire_resistance': ['fireproof', 'fire proof', 'lava proof', 'no fire damage'],
  'minecraft:water_breathing': ['breathe underwater', 'underwater breathing', 'gills'],
  'minecraft:invisibility': ['invisible', 'invis', 'hidden', 'vanish'],
  'minecraft:night_vision': ['see in the dark', 'night sight', 'dark vision'],
  'minecraft:health_boost': ['extra hearts', 'more hearts', 'max health'],
  'minecraft:absorption': ['golden hearts', 'shield hearts'],
  'minecraft:saturation': ['full', 'not hungry'],
  'minecraft:slow_falling': ['feather fall', 'float down', 'no fall damage', 'parachute'],
  'minecraft:luck': ['lucky', 'good luck', 'fortune'],
  'minecraft:glowing': ['glow', 'outline', 'see through walls'],
  'minecraft:slowness': ['slow', 'slows', 'slower', 'freeze'],
  'minecraft:weakness': ['weak', 'weaker'],
  'minecraft:poison': ['poisonous', 'toxic', 'venom', 'poisons'],
  'minecraft:nausea': ['dizzy', 'sick', 'confused', 'wobbly'],
  'minecraft:levitation': ['float', 'floats', 'levitate', 'float up'],
};

/** The twenty effects the consumable, totem, throwable, enchantment and potion flows offer. */
const TWENTY_EFFECTS = [
  'minecraft:speed',
  'minecraft:haste',
  'minecraft:strength',
  'minecraft:jump_boost',
  'minecraft:regeneration',
  'minecraft:resistance',
  'minecraft:fire_resistance',
  'minecraft:water_breathing',
  'minecraft:invisibility',
  'minecraft:night_vision',
  'minecraft:health_boost',
  'minecraft:absorption',
  'minecraft:saturation',
  'minecraft:slow_falling',
  'minecraft:luck',
  'minecraft:glowing',
  'minecraft:slowness',
  'minecraft:weakness',
  'minecraft:poison',
  'minecraft:nausea',
];

/** `choiceWords` for an effect question offering `values`. */
function effectWords(values: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const value of values) {
    const words = EFFECT_WORDS[value];
    if (words !== undefined) out[value] = words;
  }
  return out;
}

/** Words for the stat changes of the status effect and potion flows. */
const STAT_WORDS: Record<string, string[]> = {
  'minecraft:movement_speed': ['walk speed', 'running speed', 'faster', 'speed'],
  'minecraft:attack_damage': ['damage', 'hit harder', 'stronger'],
  'minecraft:attack_speed': ['swing faster', 'attack faster'],
  'minecraft:max_health': ['hearts', 'more hearts', 'health'],
  'minecraft:armor': ['armour points', 'defence'],
  'minecraft:armor_toughness': ['toughness'],
  'minecraft:jump_strength': ['jump higher', 'jumping'],
  'minecraft:scale': ['bigger', 'smaller', 'grow', 'shrink', 'giant', 'tiny'],
  'minecraft:knockback_resistance': ['no knockback', 'unpushable'],
  'minecraft:block_break_speed': ['mine faster', 'break blocks faster'],
  'minecraft:gravity': ['low gravity', 'moon gravity', 'heavier'],
  'minecraft:luck': ['lucky', 'better loot'],
};

/** Words for the shared biome choices of the mob flows. */
const MOB_BIOME_WORDS: Record<string, string[]> = {
  forests: ['forest', 'woods', 'woodland'],
  plains: ['plains', 'meadow', 'grassland', 'fields'],
  taigas: ['taiga', 'pine forest', 'snowy forest'],
  jungles: ['jungle', 'rainforest'],
  savannas: ['savanna', 'savannah'],
  mountains: ['mountain', 'hills', 'peaks'],
  badlands: ['mesa', 'badland', 'canyon'],
  beaches: ['beach', 'shore', 'coast', 'seaside'],
  nowhere: ['spawn egg only', 'never spawns', 'egg only', 'does not spawn'],
};

const MOB_SPAWN: SearchQuestionHint = {
  words: ['spawns', 'lives', 'found', 'habitat'],
  after: IN,
  choiceWords: MOB_BIOME_WORDS,
};

/** The tree shapes of the Wood set and Tree flows. */
const TREE_SHAPE: SearchQuestionHint = {
  words: ['shape', 'grows like', 'tree shape'],
  choiceWords: {
    straight: ['normal', 'simple', 'plain', 'small'],
    fancy: ['big', 'tall', 'branching', 'branches', 'large'],
    forking: ['forked', 'forks', 'bent'],
    cherry: ['wide', 'drooping', 'weeping'],
    dark_oak: ['two by two', '2x2', 'thick', 'huge'],
  },
};

/** The forest-like biome choices of the Wood set, Tree and Crop flows. */
const TREE_BIOMES: SearchQuestionHint = {
  words: ['grows in', 'biomes'],
  after: IN,
  choiceWords: {
    '#minecraft:is_forest': ['forest', 'woods'],
    '#minecraft:is_taiga': ['taiga', 'pine forest'],
    '#minecraft:is_jungle': ['jungle', 'rainforest'],
    '#minecraft:is_savanna': ['savanna', 'savannah'],
    '#minecraft:is_overworld': ['everywhere', 'anywhere', 'all biomes', 'every biome'],
  },
};

const GROWS_IN_WORLD: SearchQuestionHint = {
  words: ['grows in the world', 'generates', 'natural', 'naturally', 'wild', 'worldgen'],
};

const PER_CHUNK: SearchQuestionHint = {
  words: ['trees per chunk', 'dense', 'density', 'how many trees', 'lots of trees'],
};

const NUTRITION: SearchQuestionHint = {
  words: ['hunger', 'hunger points', 'food points', 'filling', 'nutrition', 'drumsticks'],
};
const SATURATION: SearchQuestionHint = { words: ['saturation', 'saturating', 'stays full'] };
const ALWAYS_EAT: SearchQuestionHint = {
  words: ['always eat', 'eat any time', 'when full', 'not hungry', 'always edible'],
};
const NO_RECIPE = ['no recipe', 'not craftable', 'uncraftable'];
const RECIPE: SearchQuestionHint = { words: ['recipe', 'craftable', 'crafted', 'crafting recipe'] };

/** The dye colour choices of the Bed and Backpack flows. */
const DYE_CHOICES: Record<string, string[]> = {
  light_blue: ['sky blue', 'baby blue', 'pale blue'],
  lime: ['light green', 'lime green'],
  magenta: ['fuchsia'],
  gray: ['gray', 'dark grey', 'dark gray'],
  light_gray: ['light gray', 'silver', 'pale grey'],
  cyan: ['teal'],
  purple: ['violet'],
};

/** The vehicle flows' shared questions. */
function vehicle(name: string, extra: Hints = {}): Hints {
  return {
    [name]: NAME,
    colour: MAIN_COLOUR,
    paints: { words: ['paints', 'paint jobs', 'colour options', 'skins'] },
    speed: { words: ['fast', 'speed', 'top speed', 'blocks a second', 'quick'] },
    seats: { words: ['seats', 'seat', 'seater', 'passengers', 'people'] },
    needs_fuel: { words: ['fuel', 'needs fuel', 'refuel', 'petrol', 'gas'] },
    fuel: {
      words: ['runs on', 'fuel'],
      after: ['on', 'with', 'burns'],
      choiceWords: {
        coal: ['coal', 'charcoal'],
        blaze_rod: ['blaze', 'blaze rods'],
        dried_kelp_block: ['kelp', 'dried kelp'],
      },
      appliesWhen: { needs_fuel: [true] },
    },
    recipe: RECIPE,
    ...extra,
  };
}

/** The mob flows' shared questions. */
/**
 * The wear questions of the Weapon and Gear set flows (ADR 0127 D3): "Never wears out" and
 * "Starts with an enchantment" with its level; the enchantments' own names are their labels.
 */
const WEAR: Hints = {
  never_wears_out: {
    words: ['never wears out', 'unbreakable', 'never breaks', 'indestructible', 'lasts forever'],
  },
  starting_enchantment: {
    words: ['starts with', 'already enchanted', 'enchanted', 'comes enchanted'],
  },
  starting_enchantment_level: { words: ['enchantment level'] },
};

function mob(name: string, extra: Hints = {}): Hints {
  return {
    [name]: NAME,
    colour: MAIN_COLOUR,
    health: { words: ['health', 'hearts', 'hp', 'hit points', 'tough'] },
    spawn_biomes: MOB_SPAWN,
    ...variants(),
    ...extra,
  };
}

const MOB_PRESET: SearchQuestionHint = {
  words: ['model', 'shaped like', 'body'],
  choiceWords: {
    quadruped: ['four legs', 'four-legged', 'quadruped', 'animal'],
    bird: ['bird', 'beak', 'two legs'],
    flyer: ['round', 'flyer', 'bee-like', 'sprite'],
    biped: ['two-legged', 'humanoid', 'person', 'player-like', 'zombie-like'],
  },
};

/** Hints for `preset` limited to `values`. */
function preset(values: readonly string[]): SearchQuestionHint {
  const words = MOB_PRESET.choiceWords ?? {};
  return {
    words: MOB_PRESET.words ?? [],
    choiceWords: Object.fromEntries(values.map((value) => [value, words[value] ?? [value]])),
  };
}

const DIMENSION_TERRAIN: SearchQuestionHint = {
  words: ['terrain', 'land', 'landscape'],
  choiceWords: {
    overworld: ['normal', 'hills', 'mountains', 'like the overworld'],
    amplified: ['amplified', 'towering', 'huge mountains', 'spiky'],
    floating_islands: ['floating', 'sky islands', 'islands'],
    caves: ['cave', 'caves', 'underground', 'cavern'],
    nether: ['nether', 'hell', 'caverns'],
    end: ['end', 'ender'],
    flat: ['flat', 'superflat'],
  },
};

const DIMENSION_SKY: SearchQuestionHint = {
  words: ['sky', 'rules'],
  choiceWords: {
    day: ['day and night', 'normal sky', 'sunny'],
    caves: ['always dark', 'no sky', 'dark', 'no sunlight'],
    nether: ['haze', 'nether sky', 'fog'],
    end: ['end sky', 'starless'],
  },
};

const DIMENSION_BIOME: SearchQuestionHint = {
  words: ['biome'],
  choiceWords: {
    'minecraft:cherry_grove': ['cherry', 'blossom', 'pink trees'],
    'minecraft:snowy_plains': ['snow', 'snowy', 'ice', 'winter'],
    'minecraft:mushroom_fields': ['mushroom', 'mushrooms', 'no monsters', 'safe'],
    'minecraft:badlands': ['mesa', 'canyon'],
    'minecraft:dark_forest': ['dark', 'spooky'],
    'minecraft:crimson_forest': ['crimson', 'nether forest'],
    'minecraft:end_highlands': ['end', 'chorus'],
    mix: ['mixed', 'many biomes', 'all biomes', 'every biome'],
  },
};

/** Every question hint of the library, by starter id and then question id. */
export const QUESTIONS: Record<string, Hints> = {
  custom_ore: {
    ore_name: NAME,
    colour: MAIN_COLOUR,
    tool_tier: { words: ['pickaxe', 'pick', 'mined with', 'needs'] },
    make_block: { words: ['storage block', 'block of', 'gem block'] },
    drop_min: { words: ['drops', 'fewest', 'at least', 'minimum'] },
    drop_max: { words: ['drops', 'most', 'up to', 'maximum'] },
    generate: {
      words: ['generates', 'in the world', 'natural', 'naturally', 'worldgen', 'spawns'],
    },
    vein_preset: {
      after: LIKE,
      choiceWords: { own: ['my own', 'custom numbers'] },
    },
    vein_size: { words: ['vein size', 'big veins', 'size'], appliesWhen: { vein_preset: ['own'] } },
    veins_per_chunk: {
      words: ['veins', 'per chunk', 'common', 'how often'],
      appliesWhen: { vein_preset: ['own'] },
    },
    min_y: {
      words: ['lowest', 'below', 'from y', 'deepest'],
      appliesWhen: { vein_preset: ['own'] },
    },
    max_y: { words: ['highest', 'above', 'up to y'], appliesWhen: { vein_preset: ['own'] } },
  },
  'custom-sword': {
    sword_name: NAME,
    colour: { role: 'main-colour', words: ['blade'] },
    tool_tier: { words: ['tier', 'material'] },
    durability: { words: ['durability', 'uses', 'lasts', 'durable'] },
    ingredient: { after: FROM },
  },
  'gear-set': {
    ...WEAR,
    material_name: NAME,
    colour: MAIN_COLOUR,
    material_source: {
      words: ['comes from'],
      choiceWords: {
        ore: ['ore', 'gems', 'mined', 'new ore'],
        item: ['ingot', 'ingots', 'no ore', 'only the item'],
      },
    },
    pieces: {
      words: ['pieces', 'with', 'and'],
      choiceWords: {
        sword: ['swords', 'blade'],
        pickaxe: ['pick', 'pickaxes'],
        axe: ['axes', 'hatchet'],
        shovel: ['shovels', 'spade'],
        hoe: ['hoes'],
        helmet: ['helm', 'hat'],
        chestplate: ['chest plate', 'breastplate'],
        leggings: ['pants', 'trousers'],
        boots: ['shoes'],
        spear: ['spears', 'lance'],
        mace: ['maces', 'hammer'],
        bow: ['bows'],
        crossbow: ['crossbows'],
        shield: ['shields'],
        horse_armor: ['horse armour', 'horse armor'],
        wolf_armor: ['wolf armour', 'wolf armor', 'dog armour'],
      },
    },
    upgrade_from: {
      words: ['upgrade', 'upgraded', 'smithing', 'smithing table'],
      after: ['upgrade', 'upgrades', 'upgraded from', 'from'],
      choiceWords: {
        none: ['craft', 'crafted', 'from scratch'],
        iron: ['iron gear'],
        gold: ['golden gear', 'gold gear'],
        diamond: ['diamond gear'],
        netherite: ['netherite gear'],
        copper: ['copper gear'],
      },
    },
    trim_material: { words: ['trim material', 'armour trim', 'trims'] },
    tier: { words: ['tier', 'strength'] },
    custom_durability: {
      words: ['tool durability', 'durability', 'uses', 'lasts'],
      appliesWhen: { tier: ['custom'] },
    },
    custom_speed: {
      words: ['mining speed', 'mines fast', 'efficiency'],
      appliesWhen: { tier: ['custom'] },
    },
    custom_attack_damage_bonus: {
      words: ['damage', 'attack', 'damage bonus'],
      appliesWhen: { tier: ['custom'] },
    },
    custom_enchantment_value: {
      words: ['enchantability', 'enchantable', 'enchants well'],
      appliesWhen: { tier: ['custom'] },
    },
    mines_like: { after: LIKE, appliesWhen: { tier: ['custom'] } },
    armor_base: {
      after: LIKE,
      choiceWords: { chainmail: ['chain', 'chain mail'] },
    },
    armor_durability: {
      words: ['armour durability', 'armor durability'],
      appliesWhen: { armor_base: ['custom'] },
    },
    defense_helmet: {
      words: ['helmet armour', 'helmet points', 'helmet protection'],
      appliesWhen: { armor_base: ['custom'] },
    },
    defense_chestplate: {
      words: ['chestplate armour', 'chestplate points', 'chestplate protection'],
      appliesWhen: { armor_base: ['custom'] },
    },
    defense_leggings: {
      words: ['leggings armour', 'leggings points', 'leggings protection'],
      appliesWhen: { armor_base: ['custom'] },
    },
    defense_boots: {
      words: ['boots armour', 'boots points', 'boots protection'],
      appliesWhen: { armor_base: ['custom'] },
    },
    toughness: { words: ['toughness', 'tough'], appliesWhen: { armor_base: ['custom'] } },
    knockback_resistance: {
      words: ['knockback resistance', 'no knockback'],
      appliesWhen: { armor_base: ['custom'] },
    },
  },
  'simple-block': {
    block_name: NAME,
    colour: MAIN_COLOUR,
    pattern: {
      words: ['texture', 'looks'],
      choiceWords: {
        plain: ['smooth', 'plain', 'bevel', 'polished'],
        ore: ['ore', 'specks', 'speckled', 'spotted'],
      },
    },
    placement: {
      words: ['placed', 'facing'],
      choiceWords: {
        same: ['normal', 'same every way'],
        horizontal: ['faces', 'faces the player', 'rotates', 'directional', 'turns'],
        pillar: ['log', 'pillar', 'axis', 'like a log'],
      },
    },
    light_level: {
      words: ['light', 'glows', 'glowing', 'bright', 'brightness', 'light level', 'lit'],
    },
    hardness: { words: ['hard', 'hardness', 'tough', 'strong', 'unbreakable'] },
    tool: {
      words: ['mined with', 'tool', 'broken with'],
      choiceWords: { none: ['hand', 'by hand', 'any tool', 'fist'] },
    },
    min_tier: {
      words: ['tier', 'needs', 'or better'],
      choiceWords: {
        none: ['any tier'],
        stone: ['stone pickaxe', 'stone tools'],
        iron: ['iron pickaxe', 'iron tools'],
        diamond: ['diamond pickaxe', 'diamond tools'],
      },
    },
    drops_itself: { words: ['drops itself', 'drops', 'silk touch'] },
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
  },
  'wood-set': {
    wood_name: NAME,
    colour: { role: 'main-colour', words: ['wood', 'bark', 'planks'] },
    leaf_colour: { words: ['leaf', 'leaves', 'leafy', 'foliage'] },
    members: {
      words: ['with', 'blocks'],
      choiceWords: {
        wood: ['bark block', 'wood block'],
        stripped_log: ['stripped'],
        stripped_wood: ['stripped wood'],
        pressure_plate: ['plate', 'pressure plate'],
        fence_gate: ['gate'],
        trapdoor: ['trap door', 'hatch'],
      },
    },
    set_type: {
      words: ['kind of wood'],
      choiceWords: { wood: ['normal wood', 'oak-like', 'overworld wood'] },
    },
    wood_type: { words: ['sounds', 'sound'], sameAs: 'set_type' },
    door_sounds: {
      words: ['door sounds', 'door sound'],
      choiceWords: {
        wood: ['wooden door'],
        iron: ['metal', 'heavy', 'iron door'],
        copper: ['light metal', 'copper door'],
        barrel: ['thud', 'soft'],
      },
    },
    signs: { words: ['signs', 'sign'] },
    hanging_signs: { words: ['hanging signs', 'hanging sign'] },
    boats: { words: ['boat', 'boats', 'chest boat'] },
    leaf_tint: {
      words: ['leaf tint'],
      choiceWords: { none: ['own colours'], foliage: ['biome colour', 'tinted', 'grass colour'] },
    },
    tree_shape: TREE_SHAPE,
    grows: GROWS_IN_WORLD,
    biomes: TREE_BIOMES,
    trees_per_chunk: PER_CHUNK,
    ...never([
      'door_sound_file',
      'picture_bark',
      'picture_log_top',
      'picture_stripped_log',
      'picture_stripped_log_top',
      'picture_planks',
      'picture_door_top',
      'picture_door_bottom',
      'picture_trapdoor',
      'picture_leaves',
      'picture_sapling',
    ]),
  },
  'stone-set': {
    stone_name: NAME,
    colour: MAIN_COLOUR,
    tool_tier: { words: ['pickaxe', 'needs', 'mined with'] },
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
    ages: { words: ['ages', 'ageing', 'weathers', 'oxidises', 'copper-like', 'rusts'] },
    aged_colour: {
      words: ['ages to', 'turns', 'aged', 'weathered'],
      appliesWhen: { ages: [true] },
    },
    members: {
      words: ['with', 'blocks'],
      choiceWords: {
        block: ['base block'],
        polished: ['polished'],
        bricks: ['brick'],
        pillar: ['column', 'pillars'],
        pressure_plate: ['plate'],
      },
    },
    ...never([
      'picture_stone',
      'picture_polished',
      'picture_bricks',
      'picture_pillar_side',
      'picture_pillar_top',
    ]),
  },
  crop: {
    crop_name: NAME,
    plant: {
      choiceWords: {
        crop: ['crop', 'farm crop'],
        berry_bush: ['bush', 'berries', 'berry', 'shrub'],
      },
    },
    soil: {
      words: ['grows on', 'soil', 'planted on'],
      after: ['on', 'in'],
      choiceWords: {
        farmland: ['farm', 'tilled'],
        dirt: ['grass'],
        soul_sand: ['soul soil', 'nether'],
      },
    },
    colour: { role: 'main-colour', words: ['produce', 'fruit', 'vegetable'] },
    plant_colour: { words: ['plant', 'leaves', 'stem', 'stalk'] },
    stages: {
      words: ['stages', 'growth'],
      choiceWords: {
        four: ['potato', 'potatoes', 'carrot', 'carrots'],
        eight: ['wheat'],
        short: ['beetroot', 'beetroots', 'quick', 'fast growing'],
      },
    },
    produce: {
      words: ['planted from'],
      choiceWords: {
        seeds: ['seeds'],
        produce: ['like carrots', 'like potatoes', 'plant the produce'],
      },
    },
    seeds_name: { words: ['seeds called', 'seeds named'], after: ['seeds called', 'seeds named'] },
    nutrition: NUTRITION,
    saturation: SATURATION,
    harvest_max: { words: ['per harvest', 'harvest', 'yield'] },
    seeds_compost: {
      words: ['seeds compost', 'compost seeds'],
      after: ['seeds'],
      appliesWhen: { produce: ['seeds'] },
    },
    produce_compost: { words: ['compost', 'composter', 'compostable'] },
    villagers: { words: ['villagers', 'farmers', 'villager farming'] },
    wild: { words: ['wild', 'in the world', 'naturally', 'patches'] },
    wild_biomes: {
      after: IN,
      appliesWhen: { wild: [true] },
      choiceWords: {
        '#minecraft:is_forest': ['forest', 'woods'],
        '#minecraft:is_savanna': ['savanna', 'savannah'],
        '#minecraft:is_taiga': ['taiga'],
        '#minecraft:is_jungle': ['jungle'],
        '#minecraft:is_overworld': ['everywhere', 'anywhere'],
      },
    },
    wild_rarity: { words: ['rare', 'rarity', 'common', 'chunks'], appliesWhen: { wild: [true] } },
    ...never([
      'picture_stage0',
      'picture_stage1',
      'picture_stage2',
      'picture_stage3',
      'picture_stage4',
      'picture_stage5',
      'picture_stage6',
      'picture_stage7',
      'picture_seeds',
      'picture_produce',
    ]),
  },
  tree: {
    tree_name: NAME,
    tree_shape: TREE_SHAPE,
    log: { words: ['trunk', 'log'], choiceWords: { new: ['new log', 'own log'] } },
    leaves: {
      words: ['leaves'],
      sameAs: 'log',
      choiceWords: { new: ['new leaves', 'own leaves'] },
    },
    colour: { role: 'main-colour', words: ['wood', 'trunk', 'bark'] },
    leaf_colour: { words: ['leaf', 'leaves', 'leafy', 'foliage'] },
    leaf_tint: {
      words: ['leaf tint'],
      choiceWords: { none: ['own colours'], foliage: ['biome colour', 'tinted', 'grass colour'] },
    },
    grows: GROWS_IN_WORLD,
    biomes: TREE_BIOMES,
    trees_per_chunk: PER_CHUNK,
    ...never(['picture_bark', 'picture_log_top', 'picture_leaves', 'picture_sapling']),
  },
  'cave-plants': {
    plant_name: NAME,
    kind: {
      choiceWords: {
        cave_vine: ['cave vines', 'glow berries', 'berries', 'ceiling'],
        weeping: ['weeping', 'hangs down', 'strands'],
        twisting: ['twisting', 'grows up'],
        kelp: ['kelp', 'seaweed', 'underwater', 'water plant'],
        lichen: ['lichen', 'moss', 'spreads', 'glow lichen'],
      },
    },
    colour: MAIN_COLOUR,
    berry_colour: { words: ['berry', 'berries'], appliesWhen: { kind: ['cave_vine'] } },
    light: { words: ['glows', 'glowing', 'light', 'bright'] },
  },
  'desert-plants': {
    plant_name: NAME,
    kind: {
      choiceWords: {
        cane: ['sugar cane', 'cane', 'reed', 'reeds'],
        cactus: ['cactus', 'spiky', 'spiny', 'prickly'],
        bamboo: ['bamboo', 'stalk'],
        dripleaf: ['dripleaf', 'big leaf', 'tips'],
      },
    },
    colour: MAIN_COLOUR,
    height: {
      words: ['tall', 'height'],
      choiceWords: {
        usual: ['normal height'],
        taller: ['taller', 'very tall', 'twice as tall'],
        shorter: ['short', 'small'],
      },
    },
    uses: { words: ['crafts', 'uses', 'recipes', 'crafts like'] },
  },
  'flower-pot': {
    pot_name: NAME,
    colour: MAIN_COLOUR,
    plants: { words: ['takes', 'holds', 'for'] },
    ingredient: {
      after: FROM,
      choiceWords: {
        'minecraft:brick': ['brick', 'bricks'],
        'minecraft:clay_ball': ['clay'],
        'minecraft:copper_ingot': ['copper'],
        none: NO_RECIPE,
      },
    },
  },
  'copper-set': {
    metal_name: NAME,
    colour: { role: 'main-colour', words: ['metal'] },
    patina_colour: { words: ['patina', 'turns', 'oxidised', 'aged', 'weathered', 'rust'] },
    ingot: { words: ['ingot', 'ingots'] },
    members: {
      words: ['with', 'pieces'],
      choiceWords: {
        cut: ['cut', 'cut block'],
        rod: ['lightning rod', 'rod'],
        chest: ['chest', 'double chest'],
        pressure_plate: ['plate'],
        fence_gate: ['gate'],
      },
    },
    waxed: { words: ['waxed', 'wax'] },
  },
  lights: {
    light_name: NAME,
    members: {
      words: ['lights'],
      choiceWords: {
        torch: ['torches', 'wall torch'],
        lantern: ['lanterns', 'lamp'],
        chain: ['chains'],
        candle: ['candles'],
      },
    },
    flame_colour: { role: 'main-colour', words: ['flame', 'light', 'glow', 'fire'] },
    colour: { words: ['metal', 'frame', 'holder'] },
    particle: {
      words: ['flame', 'flames'],
      choiceWords: {
        'minecraft:flame': ['normal flame', 'orange flame'],
        'minecraft:soul_fire_flame': ['soul', 'blue flame', 'blue fire', 'soul fire'],
        'minecraft:copper_fire_flame': ['green flame', 'green fire', 'copper flame'],
        'minecraft:small_flame': ['small flame', 'candle flame', 'tiny flame'],
      },
    },
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
    picture: NEVER,
  },
  bed: {
    bed_name: NAME,
    kind: { choiceWords: { bed: ['bed'], sleeping_bag: ['sleeping bag', 'bedroll', 'straw bed'] } },
    colour: { role: 'main-colour', words: ['blanket', 'sheets'], choiceWords: DYE_CHOICES },
    recipe: RECIPE,
  },
  fluid: {
    fluid_name: NAME,
    behaves_like: {
      words: ['behaves'],
      choiceWords: {
        water: ['watery', 'swim', 'swimmable', 'like water'],
        lava: ['burns', 'hot', 'molten', 'like lava'],
        none: ['walk through', 'gas', 'mist', 'neither'],
      },
    },
    colour: MAIN_COLOUR,
    look: {
      words: ['pictures', 'looks'],
      choiceWords: {
        moving: ['moving', 'animated', 'flowing'],
        drawn: ['still', 'drawn', 'static'],
      },
    },
    picture: NEVER,
    light: { words: ['glows', 'glowing', 'light', 'bright'] },
    effect: {
      words: ['in it', 'touch', 'swim in'],
      choiceWords: {
        none: ['harmless'],
        'minecraft:regeneration': ['heals', 'healing', 'regeneration'],
        'minecraft:speed': ['speed', 'faster'],
        'minecraft:slowness': ['slows', 'slowness', 'sticky'],
        'minecraft:levitation': ['float', 'floats', 'levitation', 'levitate'],
        'minecraft:poison': ['poison', 'poisonous', 'toxic'],
      },
    },
    cauldron: { words: ['cauldron', 'cauldrons', 'bottle', 'bottles'] },
    speed: {
      words: ['flows', 'flow', 'flowing'],
      choiceWords: {
        usual: ['normal speed'],
        quick: ['quick', 'runny', 'fast flowing'],
        slow: ['thick', 'honey', 'viscous', 'slow flowing'],
      },
    },
    spread: {
      words: ['spreads', 'spread', 'reaches'],
      choiceWords: { usual: ['normal spread'], far: ['far', 'wide'], near: ['a little', 'short'] },
    },
    sources: {
      words: ['infinite', 'sources', 'pools'],
      choiceWords: { usual: ['normal sources'], yes: ['infinite'], no: ['finite', 'not infinite'] },
    },
    mixes_into: {
      words: ['mixes', 'turns into', 'water touches'],
      after: ['into', 'makes'],
      choiceWords: {
        none: ['does not mix'],
        obsidian: ['obsidian', 'cobblestone'],
        stone: ['stone'],
        basalt: ['basalt'],
        mud: ['mud'],
      },
    },
    lakes: { words: ['lakes', 'lake', 'pools in the world', 'generates'] },
    lake_biomes: {
      after: IN,
      appliesWhen: { lakes: [true] },
      choiceWords: {
        overworld: ['anywhere', 'everywhere'],
        deserts: ['desert'],
        swamps: ['swamp', 'marsh'],
        forests: ['forest', 'woods'],
        badlands: ['mesa'],
      },
    },
    lake_rarity: { words: ['rare', 'common', 'chunks'], appliesWhen: { lakes: [true] } },
  },
  'storage-crate': {
    crate_name: NAME,
    size: {
      words: ['size', 'rows'],
      choiceWords: {
        small: ['small', 'one row', 'tiny', '9 slots'],
        medium: ['medium', 'three rows', 'chest-sized', '27 slots'],
        large: ['large', 'big', 'six rows', '54 slots'],
      },
    },
    keep_contents: {
      words: ['keeps', 'keep contents', 'keeps its items', 'shulker', 'shulker box'],
    },
    double: { words: ['double', 'double chest', 'joins', 'side by side'] },
    per_player: { words: ['per player', 'private', 'ender chest', 'every player', 'personal'] },
    look: {
      words: ['look', 'made of'],
      choiceWords: { wood: ['wooden', 'barrel', 'wood'], stone: ['stone', 'rock'] },
    },
    colour: MAIN_COLOUR,
    ingredient: {
      after: FROM,
      choiceWords: { look: ['planks', 'cobblestone'], none: NO_RECIPE },
    },
    ...never(['picture_front', 'picture_front_open']),
  },
  machine: {
    machine_name: NAME,
    colour: MAIN_COLOUR,
    power: {
      words: ['power', 'powered', 'runs on'],
      choiceWords: {
        fuel: ['fuel', 'coal', 'burns'],
        redstone: ['redstone', 'signal', 'redstone powered'],
        always: ['always', 'free', 'no power', 'always on'],
      },
    },
    speed: { words: ['speed', 'faster', 'times as fast', 'quick'] },
    vanilla_types: {
      words: ['also', 'vanilla recipes', 'works like'],
      choiceWords: {
        'minecraft:smelting': ['furnace', 'smelts', 'smelting'],
        'minecraft:blasting': ['blast furnace', 'blasting', 'ores'],
        'minecraft:smoking': ['smoker', 'smoking', 'cooks food'],
        'minecraft:campfire_cooking': ['campfire'],
      },
    },
    recipe_1: machineRecipe(),
    recipe_2: machineRecipe(),
    recipe_3: machineRecipe(),
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
    ...never(['picture_front', 'picture_front_lit', 'picture_side', 'picture_top']),
  },
  food: {
    food_name: NAME,
    colour: MAIN_COLOUR,
    nutrition: NUTRITION,
    saturation: SATURATION,
    can_always_eat: ALWAYS_EAT,
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
  },
  cake: {
    cake_name: NAME,
    style: { choiceWords: { cake: ['cake', 'iced'], pie: ['pie', 'tart', 'crust'] } },
    colour: { role: 'main-colour', words: ['topping', 'icing', 'frosting'] },
    filling_colour: { words: ['filling', 'inside', 'jam'] },
    nutrition: { words: ['hunger per slice', 'hunger', 'per slice', 'filling'] },
    saturation: { words: ['saturation per slice', 'saturation'] },
    flavour: {
      words: ['flavour', 'flavoured', 'tastes'],
      choiceWords: {
        'minecraft:sweet_berries': ['berry', 'berries', 'sweet berry'],
        'minecraft:glow_berries': ['glow berry'],
        'minecraft:apple': ['apple'],
        'minecraft:melon_slice': ['melon'],
        'minecraft:cocoa_beans': ['chocolate', 'cocoa'],
        'minecraft:honey_bottle': ['honey'],
      },
    },
    recipe: RECIPE,
  },
  weapon: {
    weapon_name: NAME,
    colour: MAIN_COLOUR,
    weapon_type: {
      words: ['type', 'kind'],
      choiceWords: {
        sword: ['blade', 'katana', 'sabre', 'dagger', 'longsword'],
        spear: ['lance', 'javelin', 'pike', 'halberd'],
        mace: ['hammer', 'club', 'warhammer'],
        bow: ['longbow'],
        crossbow: ['xbow'],
        shield: ['buckler'],
      },
    },
    tier: { words: ['tier', 'material'] },
    durability: { words: ['durability', 'uses', 'lasts', 'durable'] },
    ...WEAR,
    custom_damage: {
      words: ['own damage', 'custom damage', 'set damage', 'own numbers'],
      appliesWhen: { weapon_type: ['sword', 'spear', 'mace'] },
    },
    attack_damage: {
      words: ['damage', 'attack', 'hits for', 'dmg', 'attack damage'],
      appliesWhen: { weapon_type: ['sword', 'spear', 'mace'], custom_damage: [true] },
    },
    attack_speed: {
      words: ['attack speed', 'swing speed', 'swings'],
      appliesWhen: { weapon_type: ['sword', 'spear', 'mace'], custom_damage: [true] },
    },
    draw_speed: {
      words: ['draw', 'draws', 'draw speed', 'charge', 'charges'],
      appliesWhen: { weapon_type: ['bow', 'crossbow'] },
    },
    velocity: {
      words: ['arrow speed', 'arrows fly', 'shoots fast', 'velocity'],
      appliesWhen: { weapon_type: ['bow', 'crossbow'] },
    },
    damage_multiplier: {
      words: ['damage', 'arrow damage', 'multiplier', 'times damage'],
      appliesWhen: { weapon_type: ['bow', 'crossbow'] },
    },
    block_delay: {
      words: ['seconds before blocking', 'raise time', 'block delay'],
      appliesWhen: { weapon_type: ['shield'] },
    },
    damage_reduction: {
      words: ['damage blocked', 'blocks', 'reduction', 'protection'],
      appliesWhen: { weapon_type: ['shield'] },
    },
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
  },
  consumable: {
    consumable_name: NAME,
    colour: MAIN_COLOUR,
    kind: {
      choiceWords: {
        food: ['food', 'eat', 'snack'],
        drink: ['drink', 'tonic', 'juice', 'beverage'],
        charm: ['charm', 'amulet', 'trinket', 'talisman'],
      },
    },
    nutrition: NUTRITION,
    saturation: SATURATION,
    can_always_eat: ALWAYS_EAT,
    seconds: { words: ['seconds to eat', 'eating time', 'drinking time', 'quick to eat'] },
    cooldown_seconds: { words: ['cooldown', 'cool down', 'recharge'] },
    returns_bottle: {
      words: ['bottle', 'glass bottle', 'returns a bottle'],
      appliesWhen: { kind: ['drink'] },
    },
    effect_1: { words: ['effect', 'gives'], choiceWords: effectWords(TWENTY_EFFECTS) },
    effect_1_seconds: { words: ['seconds', 'for', 'lasts'] },
    effect_1_level: { words: ['level'] },
    effect_1_chance: { words: ['chance', 'per cent'] },
    effect_2: { words: ['effect', 'and'], choiceWords: effectWords(TWENTY_EFFECTS) },
    effect_2_seconds: { words: ['seconds', 'for', 'lasts'] },
    effect_2_level: { words: ['level'] },
    effect_2_chance: { words: ['chance', 'per cent'] },
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
  },
  totem: {
    totem_name: NAME,
    colour: MAIN_COLOUR,
    clear_effects: { words: ['clears effects', 'clear effects', 'cleanses'] },
    effect_1: { words: ['effect', 'gives'], choiceWords: effectWords(TWENTY_EFFECTS) },
    effect_1_seconds: { words: ['seconds', 'for', 'lasts'] },
    effect_1_level: { words: ['level'] },
    effect_2: { words: ['effect', 'and'], choiceWords: effectWords(TWENTY_EFFECTS) },
    effect_2_seconds: { words: ['seconds', 'for', 'lasts'] },
    effect_2_level: { words: ['level'] },
    effect_3: { words: ['effect', 'and'], choiceWords: effectWords(TWENTY_EFFECTS) },
    effect_3_seconds: { words: ['seconds', 'for', 'lasts'] },
    effect_3_level: { words: ['level'] },
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
  },
  backpack: {
    bag_name: NAME,
    colour: MAIN_COLOUR,
    rows: { role: 'main-number', words: ['rows', 'row', 'slots'] },
    open: {
      words: ['open', 'opens'],
      choiceWords: { use: ['right click', 'click'], sneak_use: ['sneak', 'shift', 'crouch'] },
    },
    recipe: RECIPE,
    dye_recipe: { words: ['dye', 'dyed', 'dyeable', 'dye recipe'] },
    dye: { words: ['dye'], appliesWhen: { dye_recipe: [true] }, choiceWords: DYE_CHOICES },
  },
  'status-effect': {
    effect_name: NAME,
    colour: MAIN_COLOUR,
    category: {
      choiceWords: {
        beneficial: ['good', 'positive', 'buff', 'helpful'],
        harmful: ['bad', 'negative', 'debuff', 'curse'],
        neutral: ['neutral'],
      },
    },
    behaviour: {
      words: ['does'],
      choiceWords: {
        none: ['nothing extra'],
        heal: ['heals', 'healing', 'regenerates'],
        hurt: ['hurts', 'damages', 'harms'],
        particles: ['particles', 'sparkles'],
        function: ['function', 'runs a function', 'command'],
      },
    },
    amount: { words: ['amount', 'hearts', 'half hearts', 'heals for'] },
    interval_seconds: { words: ['every', 'seconds', 'how often', 'interval'] },
    faster_per_level: { words: ['stronger levels', 'faster per level'] },
    particle: {
      words: ['particles'],
      appliesWhen: { behaviour: ['particles'] },
      choiceWords: {
        'minecraft:end_rod': ['sparkles', 'sparkle'],
        'minecraft:heart': ['hearts', 'love'],
        'minecraft:happy_villager': ['green stars', 'stars'],
        'minecraft:flame': ['flames', 'fire'],
        'minecraft:snowflake': ['snow', 'snowflakes'],
        'minecraft:enchant': ['glyphs', 'runes', 'letters'],
        'minecraft:witch': ['witch', 'purple sparks'],
        'minecraft:electric_spark': ['electric', 'electricity', 'sparks'],
        'minecraft:smoke': ['smoke', 'smoky'],
      },
    },
    stat_1: { words: ['stat', 'changes'], choiceWords: STAT_WORDS },
    stat_1_amount: { words: ['amount per level', 'per level', 'per cent'] },
    stat_2: { words: ['stat', 'and'], choiceWords: STAT_WORDS },
    stat_2_amount: { words: ['amount per level', 'per level', 'per cent'] },
    source: {
      words: ['get it', 'players get'],
      choiceWords: {
        drink: ['drink', 'drinkable'],
        flask: ['flask', 'throwable', 'splash', 'throw'],
        potion: ['potion', 'brewed', 'brewing stand'],
        none: ['commands only'],
      },
    },
    seconds: { words: ['seconds', 'lasts', 'for', 'duration'] },
    level: { words: ['level', 'strength', 'amplifier'] },
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
    brew_ingredient: {
      after: ['brewed from', 'brewed with', 'brew with'],
      appliesWhen: { source: ['potion'] },
    },
  },
  potion: {
    potion_name: NAME,
    effect: {
      words: ['effect', 'gives'],
      choiceWords: {
        own: ['new effect', 'own effect', 'custom effect'],
        ...effectWords(TWENTY_EFFECTS),
      },
    },
    colour: MAIN_COLOUR,
    stat_1: {
      words: ['stat', 'changes'],
      choiceWords: STAT_WORDS,
      appliesWhen: { effect: ['own'] },
    },
    stat_1_amount: {
      words: ['amount per level', 'per level', 'per cent'],
      appliesWhen: { effect: ['own'] },
    },
    seconds: { words: ['seconds', 'lasts', 'for', 'duration'] },
    level: { words: ['level', 'strength', 'amplifier'] },
    base: {
      after: FROM,
      choiceWords: {
        'minecraft:awkward': ['awkward', 'nether wart'],
        'minecraft:mundane': ['mundane'],
        'minecraft:thick': ['thick'],
        'minecraft:water': ['water bottle'],
      },
    },
    ingredient: { after: FROM },
    longer: { words: ['longer', 'extended', 'redstone version', 'long version'] },
    long_seconds: {
      words: ['longer seconds', 'long version seconds'],
      appliesWhen: { longer: [true] },
    },
    stronger: { words: ['stronger', 'level two', 'glowstone version', 'strong version'] },
    strong_seconds: {
      words: ['stronger seconds', 'strong version seconds'],
      appliesWhen: { stronger: [true] },
    },
    splash: { words: ['splash', 'throwable', 'splash potion'] },
    lingering: { words: ['lingering', 'tipped arrows', 'cloud'] },
  },
  particle: {
    particle_name: NAME,
    look: {
      words: ['looks', 'shape'],
      choiceWords: {
        spark: ['spark', 'sparkle', 'star'],
        orb: ['orb', 'ball', 'bubble', 'dot'],
        puff: ['puff', 'smoke', 'cloud'],
        leaf: ['leaf', 'petal', 'petals'],
        own: ['my picture', 'own picture'],
      },
    },
    colour: MAIN_COLOUR,
    size: { words: ['size'], choiceWords: { small: ['tiny', 'little'], large: ['big', 'huge'] } },
    glows: { words: ['glows', 'glowing', 'emissive', 'bright'] },
    how_long: {
      words: ['lives', 'lasts', 'how long'],
      choiceWords: {
        short: ['short', 'brief', 'half a second'],
        medium: ['one second'],
        long: ['long', 'two seconds'],
      },
    },
    movement: {
      words: ['moves'],
      choiceWords: {
        floats: ['floats', 'rises', 'goes up'],
        drifts: ['drifts', 'wanders', 'blows'],
        falls: ['falls', 'drops', 'sinks'],
      },
    },
    fades: { words: ['fades', 'fade out', 'fading'] },
    show: {
      words: ['shown', 'show'],
      choiceWords: {
        block: ['around a block', 'block', 'ambient'],
        item: ['item', 'when used'],
        none: ['only the particle', 'particle command'],
      },
    },
  },
  throwable: {
    throwable_name: NAME,
    colour: MAIN_COLOUR,
    style: {
      choiceWords: {
        ball: ['ball', 'snowball', 'rock'],
        knife: ['knife', 'dagger', 'shuriken', 'throwing star'],
        boomerang: ['boomerang', 'comes back', 'returns'],
        bomb: ['bomb', 'grenade', 'explosive', 'bursts'],
      },
    },
    stack_size: { words: ['stack', 'stacks', 'stack size', 'per stack'] },
    damage: { words: ['damage', 'dmg', 'hits for'] },
    speed: { words: ['speed', 'fast', 'thrown fast'] },
    gravity: {
      words: ['weight', 'gravity', 'falls'],
      choiceWords: { floaty: ['light', 'floats', 'floaty'], heavy: ['heavy', 'drops fast'] },
    },
    hold_to_throw: { words: ['hold to throw', 'charge', 'charged throw'] },
    on_hit: {
      words: ['when it hits', 'on hit', 'hits'],
      choiceWords: {
        nothing: ['nothing more'],
        effect: ['gives an effect', 'effect'],
        knock_up: ['knocks up', 'launches', 'knock into the air'],
        place_block: ['places a block', 'place'],
        burst: ['bursts', 'explodes', 'bang', 'boom'],
      },
    },
    hit_effect: {
      words: ['effect'],
      appliesWhen: { on_hit: ['effect'] },
      choiceWords: effectWords(TWENTY_EFFECTS),
    },
    hit_effect_seconds: { words: ['seconds', 'for'], appliesWhen: { on_hit: ['effect'] } },
    hit_block: {
      words: ['places', 'block'],
      appliesWhen: { on_hit: ['place_block'] },
      choiceWords: {
        'minecraft:cobweb': ['web', 'cobweb', 'sticky'],
        'minecraft:snow': ['snow'],
        'minecraft:torch': ['torch', 'light'],
      },
    },
    burst_damage: {
      words: ['burst damage', 'explosion damage', 'blast'],
      appliesWhen: { on_hit: ['burst'] },
    },
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
  },
  enchantment: {
    enchantment_name: NAME,
    applies_to: {
      words: ['goes on', 'for'],
      choiceWords: {
        swords: ['sword', 'swords', 'blade'],
        bows: ['bow', 'bows'],
        crossbows: ['crossbow', 'crossbows'],
        armour: ['armour', 'armor', 'helmet', 'chestplate'],
        boots: ['boots', 'feet', 'shoes'],
        tools: ['tools', 'pickaxe', 'pick', 'axe', 'shovel'],
        everything: ['everything', 'anything', 'all items'],
      },
    },
    max_level: { role: 'main-number', words: ['highest level', 'max level', 'levels', 'level'] },
    effect: {
      words: ['does'],
      choiceWords: {
        damage: ['damage', 'sharpness', 'stronger hits'],
        knockback: ['knockback', 'knocks back', 'pushes'],
        fire: ['fire', 'fire aspect', 'burns', 'sets on fire', 'flame'],
        mob_effect: ['effect', 'poison', 'poisons', 'slows', 'wither'],
        durability: ['durability', 'unbreaking', 'lasts longer'],
        mining_speed: ['mining speed', 'efficiency', 'mines faster', 'digs faster'],
        // ADR 0127 D4.
        freeze_water: [
          'frost walker',
          'freezes water',
          'freeze water',
          'ice path',
          'walk on water',
          'frosted ice',
        ],
      },
    },
    hit_effect: {
      words: ['effect on hit', 'gives'],
      appliesWhen: { effect: ['mob_effect'] },
      choiceWords: effectWords(TWENTY_EFFECTS),
    },
    rarity: {
      words: ['rarity', 'rare'],
      choiceWords: {
        common: ['common', 'easy to get'],
        uncommon: ['uncommon'],
        rare: ['rare'],
        very_rare: ['very rare', 'legendary', 'treasure'],
      },
    },
    exclusive_with: {
      words: ['cannot be combined', 'incompatible', 'exclusive'],
      after: ['not with', 'incompatible with', 'exclusive with', 'combined with'],
      choiceWords: {
        damage: ['sharpness', 'smite'],
        armor: ['protection'],
        bow: ['infinity', 'mending'],
        crossbow: ['multishot', 'piercing'],
      },
    },
    in_enchanting_table: { words: ['enchanting table', 'enchantment table', 'table'] },
  },
  painting: {
    painting_name: NAME,
    author: { words: ['by', 'author', 'artist', 'painter'], after: ['by'] },
    size: {
      words: ['size', 'big'],
      choiceWords: {
        '1x1': ['1x1', 'small', 'one block'],
        '2x1': ['2x1', 'wide'],
        '1x2': ['1x2', 'tall'],
        '2x2': ['2x2'],
        '3x3': ['3x3'],
        '4x2': ['4x2'],
        '4x3': ['4x3'],
        '4x4': ['4x4', 'huge', 'large'],
      },
    },
    colour: MAIN_COLOUR,
  },
  'banner-pattern': {
    pattern_name: NAME,
    shape: { words: ['shape'] },
    colour: MAIN_COLOUR,
    ingredient: { after: FROM },
  },
  'armour-trim': {
    trim_name: NAME,
    style: {
      words: ['style'],
      choiceWords: {
        bands: ['stripes', 'striped', 'bands'],
        edges: ['edges', 'border', 'trimmed'],
        studs: ['studs', 'studded', 'dots'],
      },
    },
    template_item: { after: FROM },
    copy_block: { after: ['copied with', 'copy with', 'duplicated with'] },
    colour: MAIN_COLOUR,
  },
  glider: {
    glider_name: NAME,
    durability: { words: ['seconds of gliding', 'gliding time', 'durability', 'lasts'] },
    colour: MAIN_COLOUR,
    material: {
      after: FROM,
      choiceWords: {
        'minecraft:phantom_membrane': ['membrane', 'phantom'],
        'minecraft:leather': ['leather'],
        'minecraft:paper': ['paper'],
        'minecraft:breeze_rod': ['breeze'],
      },
    },
  },
  'pot-pattern': {
    pattern_name: NAME,
    picture: {
      words: ['picture', 'shows'],
      choiceWords: { sun: ['sun', 'sunrise'], fish: ['fish'], leaf: ['leaf', 'plant'] },
    },
    colour: MAIN_COLOUR,
    ingredient: { after: FROM },
  },
  'music-disc-item': {
    song_name: NAME,
    artist: { words: ['by', 'artist', 'band', 'singer'], after: ['by'] },
    length_seconds: { words: ['seconds long', 'length', 'long', 'minutes'] },
    comparator_output: { words: ['comparator', 'signal', 'redstone signal'] },
    colour: { role: 'main-colour', words: ['label'] },
    disc_type: {
      words: ['disc'],
      choiceWords: {
        item: ['new disc', 'mod', 'fabric', 'disc item'],
        vanilla: ['vanilla', 'disc 13', 'retexture', 'data pack', 'no mod'],
      },
    },
  },
  dimension: {
    dimension_name: NAME,
    terrain: DIMENSION_TERRAIN,
    biome: DIMENSION_BIOME,
    sky: { ...DIMENSION_SKY, after: ['sky', 'with'] },
    own_sky: { words: ['own sky', 'sky colour', 'custom sky'] },
    sky_colour: { words: ['sky'], appliesWhen: { own_sky: [true] } },
    fog_colour: { words: ['fog', 'mist', 'haze'], appliesWhen: { own_sky: [true] } },
    time: {
      words: ['time of day', 'time'],
      appliesWhen: { own_sky: [true] },
      choiceWords: {
        day: ['always day', 'noon', 'daylight'],
        night: ['always night', 'night', 'midnight', 'stars'],
      },
    },
    beds: {
      words: ['beds', 'sleep'],
      appliesWhen: { own_sky: [true] },
      choiceWords: {
        explode: ['beds explode', 'explode'],
        work: ['beds work', 'sleep', 'can sleep'],
      },
    },
    travel: {
      words: ['get there', 'travel', 'go there'],
      choiceWords: {
        item: ['key', 'key item', 'item'],
        command: ['command', 'teleport command'],
        portal: ['portal', 'gateway'],
      },
    },
    colour: { role: 'main-colour', words: ['key', 'portal'] },
  },
  'world-islands': {
    world_name: NAME,
    island_size: {
      words: ['islands', 'size'],
      choiceWords: {
        small: ['small', 'tiny'],
        medium: ['medium'],
        large: ['large', 'big', 'huge'],
      },
    },
    sea: {
      words: ['sea', 'ocean', 'water'],
      choiceWords: {
        little: ['mostly land', 'little sea'],
        some: ['half', 'some sea'],
        lots: ['lots of sea', 'far apart', 'mostly sea'],
      },
    },
    biomes: {
      words: ['grows', 'biomes'],
      choiceWords: {
        grass: ['grass', 'woods', 'green'],
        flowers: ['flowers', 'flowery'],
        cherry: ['cherry', 'blossom', 'pink'],
        jungle: ['jungle', 'tropical'],
        dry: ['sand', 'dry', 'desert', 'sandy'],
        snowy: ['snow', 'snowy', 'icy', 'frozen'],
        mushroom: ['mushroom', 'mushrooms', 'no monsters'],
      },
    },
    trees: {
      words: ['trees'],
      choiceWords: {
        few: ['few trees', 'bare'],
        many: ['many trees', 'lots of trees', 'forested'],
      },
    },
  },
  'world-mountains': {
    world_name: NAME,
    height: {
      words: ['tall', 'height', 'high'],
      choiceWords: {
        tall: ['tall'],
        taller: ['very tall', 'taller'],
        tallest: ['tallest', 'as tall as possible', 'max height', 'huge'],
      },
    },
    jagged: {
      words: ['jagged', 'rough'],
      choiceWords: {
        smooth: ['smooth', 'rounded', 'gentle'],
        rugged: ['rugged', 'rocky'],
        jagged: ['jagged', 'spiky', 'sharp', 'cliffs'],
      },
    },
    snow_line: {
      words: ['snow', 'snow line', 'snowy'],
      choiceWords: {
        low: ['lots of snow', 'snowy hills'],
        middle: ['halfway'],
        high: ['snow caps', 'peaks only'],
        none: ['no snow', 'snowless'],
      },
    },
    biomes: {
      words: ['grows', 'biomes'],
      choiceWords: {
        meadow: ['meadow', 'grass', 'flowers'],
        cherry: ['cherry', 'blossom', 'pink'],
        pine: ['pine', 'pines', 'spruce', 'conifers'],
        snowy_pine: ['snowy pine', 'snowy woods'],
        stony: ['bare', 'stone', 'rocky'],
        windswept: ['windswept', 'windy'],
      },
    },
  },
  'world-one-biome': {
    world_name: NAME,
    biome: {
      words: ['biome', 'all', 'everywhere'],
      choiceWords: {
        'minecraft:cherry_grove': ['cherry', 'blossom', 'pink'],
        'minecraft:snowy_plains': ['snow', 'snowy', 'winter', 'ice'],
        'minecraft:mushroom_fields': ['mushroom', 'mushrooms', 'no monsters'],
        'minecraft:badlands': ['mesa', 'canyon'],
        'minecraft:dark_forest': ['dark', 'spooky'],
        'minecraft:pale_garden': ['pale', 'creaking'],
      },
    },
    shape: {
      words: ['shape', 'land'],
      choiceWords: {
        hills: ['hills', 'hilly', 'gentle'],
        flat: ['flat', 'superflat'],
        overworld: ['normal', 'like the overworld', 'vanilla'],
      },
    },
  },
  'world-caves': {
    world_name: NAME,
    top: {
      words: ['top', 'roof'],
      choiceWords: {
        roof: ['roof', 'closed', 'ceiling', 'underground'],
        open: ['open', 'open sky', 'land on top'],
      },
    },
    rock: { words: ['rock', 'stone', 'made of'], after: ['of', 'made of', 'from'] },
    lakes: {
      words: ['lakes', 'lake'],
      choiceWords: { water: ['water'], lava: ['lava'], none: ['no lakes', 'dry'] },
    },
    glow: {
      words: ['glows', 'lit', 'light'],
      choiceWords: {
        glowstone: ['glowstone'],
        shroomlight: ['shroomlight'],
        none: ['dark', 'no light', 'pitch black', 'torches'],
      },
    },
  },
  'world-empty-sky': {
    world_name: NAME,
    biome: {
      words: ['biome'],
      choiceWords: {
        'minecraft:cherry_grove': ['cherry', 'blossom', 'pink'],
        'minecraft:snowy_plains': ['snow', 'snowy', 'ice'],
        'minecraft:mushroom_fields': ['mushroom', 'no monsters'],
      },
    },
  },
  portal: {
    portal_name: NAME,
    destination: {
      words: ['goes to', 'to', 'leads to'],
      after: ['to', 'into', 'leads to'],
      choiceWords: {
        new: ['new dimension', 'new world', 'own dimension'],
        'minecraft:the_nether': ['nether', 'hell'],
        'minecraft:the_end': ['end', 'the end'],
        other: ['another dimension', 'by id'],
      },
    },
    dimension_name: {
      words: ['dimension called', 'realm called'],
      after: ['dimension called', 'realm called'],
    },
    terrain: { ...DIMENSION_TERRAIN, appliesWhen: { destination: ['new'] } },
    biome: { ...DIMENSION_BIOME, appliesWhen: { destination: ['new'] } },
    sky: { ...DIMENSION_SKY, after: ['sky', 'with'], appliesWhen: { destination: ['new'] } },
    dimension_id: { never: true },
    frame: {
      words: ['frame', 'built from', 'made of'],
      after: ['frame of', 'built from', 'made of', 'from'],
      choiceWords: {
        new: ['new frame', 'own frame'],
        'minecraft:crying_obsidian': ['crying obsidian', 'obsidian'],
        'minecraft:gold_block': ['gold', 'golden'],
        'minecraft:quartz_block': ['quartz'],
        'minecraft:prismarine_bricks': ['prismarine'],
        'minecraft:purpur_block': ['purpur'],
      },
    },
    igniter: {
      words: ['light it', 'lit with', 'ignite', 'activated with'],
      after: ['lit with', 'light it with', 'activated with', 'with'],
      choiceWords: {
        'minecraft:flint_and_steel': ['flint and steel', 'lighter', 'fire'],
        key: ['key', 'key item'],
        'minecraft:fire_charge': ['fire charge', 'fireball'],
        'minecraft:ender_eye': ['eye of ender', 'ender eye', 'eye'],
      },
    },
    scale: {
      words: ['scale'],
      choiceWords: {
        '1': ['same scale', 'one to one', '1:1'],
        '8': ['like the nether', 'eight to one', '8:1'],
      },
    },
    overlay: { words: ['wobble', 'overlay', 'nausea', 'swirl'] },
    colour: MAIN_COLOUR,
    particles: {
      words: ['particles'],
      choiceWords: { portal: ['sparkles', 'portal particles'], dust: ['dust', 'coloured dust'] },
    },
    sounds: {
      words: ['sounds', 'sound'],
      choiceWords: { hum: ['hum', 'whoosh', 'noisy'], quiet: ['quiet', 'silent', 'no sound'] },
    },
  },
  'villager-trade': {
    profession: {
      words: ['villager', 'profession', 'job'],
      choiceWords: {
        armorer: ['armourer', 'armor smith'],
        cleric: ['priest'],
        fletcher: ['arrow maker', 'bow maker'],
        librarian: ['books', 'library'],
        mason: ['stone mason', 'builder'],
        toolsmith: ['blacksmith', 'smith'],
        wandering_trader: ['wandering trader', 'wanderer', 'travelling trader'],
      },
    },
    level: {
      words: ['level'],
      choiceWords: {
        '1': ['novice', 'beginner'],
        '2': ['apprentice'],
        '3': ['journeyman'],
        '4': ['expert'],
        '5': ['master'],
      },
    },
    direction: {
      choiceWords: { sells: ['sells', 'sell', 'selling'], buys: ['buys', 'buy', 'buying'] },
    },
    item: { after: ['sells', 'buys', 'for', 'trade'] },
    item_count: { words: ['items', 'how many'] },
    emeralds: { words: ['emeralds', 'emerald', 'price', 'costs'] },
    max_uses: { words: ['uses', 'restock', 'before restocking'] },
    xp: { words: ['villager experience', 'villager xp', 'xp'] },
  },
  'village-job': {
    job_name: NAME,
    colour: { role: 'main-colour', words: ['apron', 'clothes'] },
    metal_colour: { words: ['workbench', 'work block', 'job block'] },
    recipe: RECIPE,
    buys: { words: ['buys'], after: ['buys', 'buy', 'buying'] },
    buys_count: { words: ['for one emerald', 'per emerald'] },
    sells: { words: ['sells'], after: ['sells', 'sell', 'selling'] },
    sells_emeralds: { words: ['emeralds', 'price', 'costs'] },
    trades_like: { after: LIKE, choiceWords: { none: ['no vanilla trades', 'only its own'] } },
  },
  'villager-look': {
    look_name: NAME,
    place: {
      words: ['wear it', 'from'],
      after: IN,
      choiceWords: {
        cherry_grove: ['cherry', 'blossom'],
        meadow: ['meadow', 'meadows'],
        birch_forest: ['birch'],
        dark_forest: ['dark forest', 'dark'],
        mushroom: ['mushroom', 'mushrooms'],
        badlands: ['mesa', 'badlands'],
        flower_forest: ['flower', 'flowers', 'sunflower'],
      },
    },
    colour: { role: 'main-colour', words: ['clothes', 'robe', 'outfit'] },
    trim_colour: { words: ['hem', 'trim', 'edges'] },
    sash: { words: ['sash', 'belt'] },
  },
  'extra-drop': {
    table: {
      words: ['drops from', 'from'],
      after: ['from', 'when', 'kills', 'killing', 'breaking', 'in'],
      choiceWords: {
        'entities/zombie': ['zombie', 'zombies'],
        'entities/skeleton': ['skeleton', 'skeletons'],
        'entities/creeper': ['creeper', 'creepers'],
        'entities/spider': ['spider', 'spiders'],
        'entities/enderman': ['enderman', 'endermen'],
        'entities/cow': ['cow', 'cows'],
        'entities/pig': ['pig', 'pigs'],
        'entities/chicken': ['chicken', 'chickens'],
        'blocks/stone': ['stone'],
        'blocks/gravel': ['gravel'],
        'blocks/short_grass': ['grass', 'tall grass'],
        'blocks/oak_leaves': ['leaves', 'oak leaves'],
        'chests/simple_dungeon': ['dungeon', 'dungeon chest'],
        'chests/abandoned_mineshaft': ['mineshaft'],
        'chests/desert_pyramid': ['pyramid', 'desert temple'],
        'chests/buried_treasure': ['buried treasure', 'treasure'],
        'chests/village/village_weaponsmith': ['weaponsmith', 'village chest', 'blacksmith'],
      },
    },
    player_kill: { words: ['player kill', 'killed by a player', 'only players'] },
    item: { words: ['drops'], after: ['drops', 'drop', 'gives'] },
    count_min: { words: ['fewest', 'at least', 'minimum'] },
    count_max: { words: ['most', 'up to', 'maximum'] },
    chance: { words: ['chance', 'per cent', 'percent', 'rarely'] },
  },
  'mob-skin': {
    skin_name: NAME,
    animal: {
      words: ['for'],
      choiceWords: {
        wolf: ['dog', 'wolves'],
        cat: ['cats', 'kitty'],
        pig: ['pigs'],
        cow: ['cows'],
        chicken: ['chickens'],
        frog: ['frogs'],
      },
    },
    colour: MAIN_COLOUR,
    where: {
      words: ['appears'],
      choiceWords: { biome: ['in a biome'], everywhere: ['everywhere', 'anywhere'] },
    },
    biome: {
      after: IN,
      appliesWhen: { where: ['biome'] },
      choiceWords: {
        '#minecraft:is_forest': ['forest', 'woods'],
        '#minecraft:is_taiga': ['taiga'],
        '#minecraft:is_savanna': ['savanna'],
        '#minecraft:is_badlands': ['mesa', 'badlands'],
        '#minecraft:is_jungle': ['jungle'],
        'minecraft:snowy_taiga': ['snowy taiga'],
        'minecraft:cherry_grove': ['cherry'],
        'minecraft:swamp': ['swamp'],
      },
    },
  },
  'goat-horn': {
    horn_name: NAME,
    call: { words: ['sound', 'call'] },
    seconds: { words: ['seconds', 'per blow', 'cooldown'] },
    range: { words: ['heard from', 'range', 'blocks away', 'loud'] },
    ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
    goats_drop: { words: ['goats drop', 'goats', 'dropped by goats'] },
  },
  custom_mob: mob('mob_name', {
    arms: {
      words: ['arms'],
      choiceWords: { classic: ['classic', 'wide arms'], slim: ['slim', 'thin arms'] },
    },
    egg_colour: { words: ['spawn egg', 'egg'] },
    egg_spot_colour: { words: ['egg spots', 'spots'] },
    speed: { words: ['speed', 'fast', 'walking speed'] },
    behaviour: {
      words: ['behaviour'],
      choiceWords: {
        peaceful: ['peaceful', 'friendly', 'passive', 'harmless'],
        neutral: ['neutral', 'fights back'],
        hostile: ['hostile', 'evil', 'aggressive', 'attacks', 'enemy'],
        archer: ['archer', 'shoots arrows', 'shoots', 'ranged'],
      },
    },
    spawn_biomes: {
      words: ['spawns', 'lives', 'found'],
      after: IN,
      choiceWords: {
        '#minecraft:is_forest': ['forest', 'woods'],
        '#minecraft:is_taiga': ['taiga'],
        '#minecraft:is_jungle': ['jungle'],
        '#minecraft:is_savanna': ['savanna'],
        '#minecraft:is_mountain': ['mountain', 'mountains', 'hills'],
        '#minecraft:is_badlands': ['mesa', 'badlands'],
        '#minecraft:is_beach': ['beach', 'beaches', 'shore'],
      },
    },
  }),
  pet: mob('pet_name', {
    preset: preset(['quadruped', 'bird', 'flyer', 'biped']),
    taming_food: {
      words: ['tamed with', 'tame with', 'taming food'],
      after: ['tamed with', 'tame with', 'with'],
      choiceWords: {
        bones: ['bone', 'bones'],
        raw_fish: ['fish', 'raw fish'],
        seeds: ['seeds'],
        berries: ['berries'],
        apples: ['apple', 'apples'],
      },
    },
    sits: { words: ['sits', 'sit', 'stays'] },
    defends: { words: ['defends', 'protects', 'guards', 'fights for you'] },
    shoulder: { words: ['shoulder', 'on your shoulder', 'rides on your shoulder'] },
    shoulder_side: { words: ['which shoulder'], appliesWhen: { shoulder: [true] } },
    fetches: { words: ['fetches', 'brings items', 'fetch'] },
    digs: { words: ['digs', 'digs things up', 'dig'] },
    babies: { words: ['babies', 'breeds', 'baby'] },
    breeding_food: {
      words: ['bred with', 'breeding food'],
      after: ['bred with', 'breed with'],
      appliesWhen: { babies: [true] },
      choiceWords: {
        cooked_meat: ['meat', 'steak'],
        cooked_fish: ['fish'],
        wheat: ['wheat'],
        carrots: ['carrot', 'carrots'],
        golden_carrots: ['golden carrot', 'golden carrots'],
      },
    },
    speed: { words: ['speed', 'fast'] },
  }),
  'farm-animal': mob('animal_name', {
    preset: preset(['quadruped', 'bird']),
    breeding_food: {
      words: ['bred with', 'breeding food', 'eats'],
      after: ['bred with', 'breed with', 'eats'],
      choiceWords: {
        wheat: ['wheat'],
        seeds: ['seeds'],
        roots: ['carrots', 'potatoes', 'beetroots', 'roots'],
        grass: ['grass', 'ferns'],
      },
    },
    baby_size: { words: ['baby size', 'babies'] },
    drop: {
      words: ['drops'],
      after: ['drops', 'drop', 'gives'],
      choiceWords: {
        'minecraft:porkchop': ['pork', 'porkchop', 'bacon'],
        'minecraft:beef': ['beef', 'steak'],
        'minecraft:chicken': ['chicken meat'],
        'minecraft:mutton': ['mutton', 'lamb'],
        'minecraft:rabbit': ['rabbit'],
        'minecraft:leather': ['leather', 'hide'],
        'minecraft:feather': ['feather', 'feathers'],
        'minecraft:white_wool': ['wool'],
      },
    },
    drop_max: { words: ['most drops', 'drops up to'] },
    rideable: { words: ['ride', 'rideable', 'saddle', 'can be ridden'] },
    speed: { words: ['speed', 'fast'] },
  }),
  mount: mob('mount_name', {
    preset: preset(['quadruped', 'flyer']),
    needs_saddle: { words: ['saddle', 'needs a saddle'] },
    speed: { words: ['speed', 'fast', 'gallops'] },
    jump: { words: ['jump', 'jumps', 'jump strength'] },
    dashes: { words: ['dashes', 'dash', 'charges forward'] },
    owner_only: { words: ['owner only', 'only its owner', 'only me'] },
    flying: { words: ['flying', 'flies', 'fly', 'wings'] },
    carries_chest: { words: ['chest', 'carries a chest', 'storage', 'pack animal'] },
    chest_rows: { words: ['rows of storage', 'rows'], appliesWhen: { carries_chest: [true] } },
    needs_chest: { words: ['needs a chest'], appliesWhen: { carries_chest: [true] } },
  }),
  'wandering-merchant': {
    merchant_name: NAME,
    preset: preset(['biped', 'quadruped', 'bird', 'cube_creature']),
    colour: MAIN_COLOUR,
    ware_1: { words: ['sells'], after: ['sells', 'sell', 'selling'] },
    ware_1_count: { words: ['at a time', 'how many'] },
    ware_1_emeralds: { words: ['emeralds', 'price', 'costs'] },
    ware_2: { after: ['also sells', 'and'] },
    ware_2_count: { words: ['at a time', 'how many'] },
    ware_2_emeralds: { words: ['emeralds', 'price', 'costs'] },
    ware_3: { after: ['also sells', 'and'] },
    ware_3_count: { words: ['at a time', 'how many'] },
    ware_3_emeralds: { words: ['emeralds', 'price', 'costs'] },
    uses: { words: ['sales', 'runs out', 'uses'] },
    vanilla_wares: {
      words: ['wandering trader wares', 'vanilla wares', 'like the wandering trader'],
    },
    restock: {
      words: ['restocks', 'restock'],
      choiceWords: {
        twice_a_day: ['twice a day', 'daily'],
        work_site: ['work site', 'at a block'],
        never: ['never restocks', 'runs out'],
      },
    },
    work_site: { after: ['work site', 'restocks at'], appliesWhen: { restock: ['work_site'] } },
    demand: { words: ['prices rise', 'demand', 'supply and demand'] },
    remembers: { words: ['remembers', 'reputation', 'grudge'] },
    gift: {
      words: ['gift', 'likes'],
      after: ['gift', 'likes'],
      appliesWhen: { remembers: [true] },
    },
    barters: { words: ['barters', 'barter', 'gold', 'like a piglin'] },
    health: { words: ['health', 'hearts'] },
    speed: { words: ['speed', 'fast'] },
    spawn_biomes: MOB_SPAWN,
  },
  'flying-mob': mob('mob_name', {
    preset: preset(['flyer', 'bird']),
    behaviour: {
      words: ['behaviour'],
      choiceWords: {
        peaceful: ['peaceful', 'friendly', 'passive', 'harmless'],
        neutral: ['neutral', 'fights back'],
        hostile: ['hostile', 'evil', 'aggressive', 'swoops', 'attacks'],
        shooter: ['shooter', 'shoots', 'ranged', 'shoots arrows', 'fireballs'],
      },
    },
    flight: {
      words: ['flies', 'flight'],
      choiceWords: {
        fly: ['hovers', 'flies about'],
        hover: ['floats', 'like a ghast', 'ghast'],
        phase: ['through walls', 'like a vex', 'vex', 'ghost'],
      },
    },
    swoops: { words: ['swoops', 'dives', 'swoop'] },
    roosts: { words: ['roosts', 'hangs', 'upside down', 'sleeps by day'] },
    projectile: {
      words: ['shoots'],
      after: ['shoots', 'fires', 'throws'],
      appliesWhen: { behaviour: ['shooter'] },
      choiceWords: {
        'minecraft:arrow': ['arrow', 'arrows'],
        'minecraft:snowball': ['snowball', 'snowballs'],
        'minecraft:fire_charge': ['fireball', 'fireballs', 'fire charge'],
        'minecraft:wind_charge': ['wind', 'wind charge'],
        'minecraft:egg': ['egg', 'eggs'],
      },
    },
    flying_speed: { words: ['flying speed', 'speed', 'fast'] },
  }),
  'water-mob': mob('mob_name', {
    preset: {
      words: ['model', 'body'],
      choiceWords: { fish: ['fish'], quadruped: ['four legs', 'legs'] },
    },
    kind: {
      choiceWords: {
        fish: ['school', 'schools', 'fish-like'],
        dolphin: ['dolphin', 'dolphin-like', 'whale', 'breathes air'],
        amphibian: ['amphibian', 'axolotl', 'axolotl-like', 'walks and swims'],
      },
    },
    behaviour: {
      words: ['behaviour'],
      choiceWords: {
        peaceful: ['peaceful', 'friendly', 'harmless', 'shy'],
        neutral: ['neutral', 'fights back'],
        hostile: ['hostile', 'aggressive', 'attacks', 'shark-like'],
      },
    },
    bucket: { words: ['bucket', 'caught in a bucket', 'catch'] },
    plays_dead: { words: ['plays dead', 'play dead', 'fakes death'] },
    spawn_biomes: {
      words: ['spawns', 'lives', 'found'],
      after: IN,
      choiceWords: {
        oceans: ['ocean', 'sea'],
        rivers: ['river', 'stream'],
        swamps: ['swamp', 'marsh'],
        nowhere: ['spawn egg only', 'never spawns'],
      },
    },
  }),
  boss: {
    boss_name: NAME,
    preset: preset(['biped', 'quadruped']),
    colour: MAIN_COLOUR,
    size: {
      words: ['size'],
      choiceWords: {
        large: ['large', 'big'],
        huge: ['huge', 'twice'],
        giant: ['giant', 'massive', 'enormous', 'three times'],
      },
    },
    health: { role: 'main-number', words: ['health', 'hearts', 'hp', 'hit points'] },
    attacks: {
      words: ['attacks', 'fights'],
      choiceWords: {
        melee: ['melee', 'punches', 'close range'],
        ranged: ['ranged', 'shoots'],
        both: ['both', 'melee and ranged'],
      },
    },
    projectile: {
      words: ['shoots'],
      after: ['shoots', 'fires', 'throws'],
      appliesWhen: { attacks: ['ranged', 'both'] },
      choiceWords: {
        'minecraft:arrow': ['arrow', 'arrows'],
        'minecraft:snowball': ['snowball', 'snowballs'],
        'minecraft:fire_charge': ['fireball', 'fireballs', 'fire charge'],
        'minecraft:wind_charge': ['wind', 'wind charge'],
        'minecraft:egg': ['egg', 'eggs'],
      },
    },
    damage: {
      words: ['damage', 'hits for', 'melee damage'],
      appliesWhen: { attacks: ['melee', 'both'] },
    },
    drop: {
      words: ['drops'],
      after: ['drops', 'drop', 'gives'],
      choiceWords: {
        'minecraft:diamond': ['diamond', 'diamonds'],
        'minecraft:emerald': ['emerald', 'emeralds'],
        'minecraft:gold_ingot': ['gold'],
        'minecraft:netherite_scrap': ['netherite', 'scrap'],
        'minecraft:experience_bottle': ['xp', 'experience', 'bottles'],
      },
    },
    drop_max: { words: ['most drops', 'drops up to'] },
    bar_colour: { words: ['bar colour', 'boss bar colour', 'bar'] },
    bar_style: {
      words: ['bar style', 'notches'],
      choiceWords: {
        progress: ['smooth', 'plain bar'],
        notched_6: ['6 notches'],
        notched_10: ['10 notches'],
        notched_12: ['12 notches'],
        notched_20: ['20 notches'],
      },
    },
    darkens_sky: { words: ['darkens the sky', 'dark sky', 'darkens'] },
  },
  'vehicle-car': vehicle('car_name', {
    horn: { words: ['horn', 'honk', 'beep'] },
    boot: { words: ['boot', 'trunk', 'storage'] },
  }),
  'vehicle-tank': vehicle('tank_name', {
    cannon: { words: ['cannon', 'gun', 'turret', 'shoots'] },
    needs_shells: {
      words: ['shells', 'ammo', 'ammunition', 'needs loading'],
      appliesWhen: { cannon: [true] },
    },
  }),
  'vehicle-plane': vehicle('plane_name'),
  'vehicle-boat': vehicle('boat_name', {
    sound: {
      words: ['sounds like', 'sound'],
      choiceWords: {
        engine: ['engine', 'motor', 'motorboat'],
        paddle: ['paddle', 'rowing', 'canoe'],
      },
    },
    horn: { words: ['horn', 'honk', 'foghorn'] },
  }),
  'scripted-item': {
    item_name: NAME,
    colour: MAIN_COLOUR,
    cooldown_seconds: { words: ['cooldown', 'cool down', 'recharge'] },
    behaviour: {
      words: ['when used', 'does'],
      choiceWords: {
        heal: ['heals', 'heal', 'healing'],
        launch: ['launches', 'launch', 'jump', 'fling', 'boost'],
        lightning: ['lightning', 'thunder', 'smite', 'strikes'],
        effect: ['effect', 'gives an effect', 'buff'],
      },
    },
    heal_amount: {
      words: ['health restored', 'heals', 'hearts'],
      appliesWhen: { behaviour: ['heal'] },
    },
    launch_height: {
      words: ['launch height', 'blocks high', 'height'],
      appliesWhen: { behaviour: ['launch'] },
    },
    lightning_distance: {
      words: ['lightning distance', 'blocks away', 'range'],
      appliesWhen: { behaviour: ['lightning'] },
    },
    effect: {
      words: ['effect', 'gives'],
      appliesWhen: { behaviour: ['effect'] },
      choiceWords: effectWords([
        'minecraft:speed',
        'minecraft:strength',
        'minecraft:regeneration',
        'minecraft:jump_boost',
        'minecraft:night_vision',
        'minecraft:fire_resistance',
        'minecraft:resistance',
      ]),
    },
    effect_seconds: { words: ['seconds', 'for', 'lasts'], appliesWhen: { behaviour: ['effect'] } },
    effect_level: { words: ['level'], appliesWhen: { behaviour: ['effect'] } },
  },
  'custom-command': {
    command_name: NAME,
    who: {
      words: ['who', 'used by'],
      choiceWords: {
        everyone: ['everyone', 'all players', 'anyone'],
        operators: ['operators', 'ops', 'admins', 'op only'],
      },
    },
    message: { words: ['says', 'message', 'replies'], after: ['says', 'saying', 'replies'] },
    own_rule: { words: ['game rule', 'gamerule', 'toggle', 'turn on and off'] },
    action: {
      words: ['does'],
      choiceWords: {
        heal: ['heal', 'heals', 'healing'],
        effect: ['effect', 'gives an effect', 'buff'],
        item: ['item', 'gives an item', 'gives'],
        launch: ['launch', 'launches', 'jump', 'fling'],
      },
    },
    amount: { words: ['health restored', 'heals', 'hearts'], appliesWhen: { action: ['heal'] } },
    effect: {
      words: ['effect'],
      appliesWhen: { action: ['effect'] },
      choiceWords: effectWords([
        'minecraft:speed',
        'minecraft:night_vision',
        'minecraft:regeneration',
        'minecraft:jump_boost',
        'minecraft:fire_resistance',
        'minecraft:water_breathing',
      ]),
    },
    seconds: { words: ['seconds', 'for', 'lasts'], appliesWhen: { action: ['effect'] } },
    item: {
      words: ['item'],
      appliesWhen: { action: ['item'] },
      choiceWords: {
        'minecraft:bread': ['bread', 'food'],
        'minecraft:torch': ['torch', 'torches'],
        'minecraft:cookie': ['cookie', 'cookies'],
        'minecraft:arrow': ['arrow', 'arrows'],
        'minecraft:oak_log': ['log', 'logs', 'wood'],
      },
    },
    count: { words: ['how many', 'items'], appliesWhen: { action: ['item'] } },
  },
  'creative-tab': {
    tab_name: NAME,
    icon: { words: ['icon'], after: ['icon', 'with the icon'] },
    order: {
      words: ['order', 'sorted'],
      choiceWords: {
        as_listed: ['as listed'],
        by_name: ['by name', 'alphabetical', 'a to z', 'sorted'],
        by_hand: ['by hand', 'own order', 'my order'],
      },
    },
    extra_items: { words: ['vanilla items', 'also holds'], after: ['with', 'holds', 'also'] },
    first_block: { words: ['first block', 'a block'] },
    colour: { role: 'main-colour', words: ['block'] },
  },
  'game-rule': {
    rule_name: NAME,
    description: NEVER,
    kind: {
      words: ['holds'],
      choiceWords: {
        switch: ['on or off', 'switch', 'toggle', 'true or false'],
        number: ['number', 'whole number', 'value'],
      },
    },
    starts_on: { words: ['on by default', 'on in a new world', 'starts on', 'default on'] },
    number_default: {
      words: ['default', 'starts at', 'number in a new world'],
      appliesWhen: { kind: ['number'] },
    },
    number_min: { words: ['lowest', 'minimum', 'at least'], appliesWhen: { kind: ['number'] } },
    number_max: { words: ['highest', 'maximum', 'at most'], appliesWhen: { kind: ['number'] } },
    category: {
      words: ['listed under', 'category'],
      choiceWords: { misc: ['miscellaneous', 'other'], updates: ['world updates', 'ticks'] },
    },
    greets: { words: ['greets', 'greeting', 'welcome'] },
    greeting: {
      words: ['greeting', 'says'],
      after: ['says', 'saying'],
      appliesWhen: { greets: [true] },
    },
    counts: { words: ['counts', 'statistic', 'stat', 'count the greetings'] },
  },
  // The game flows (ADR 0117 D2; B557).
  skyblock: {
    game_name: NAME,
    island: {
      words: ['island', 'start on'],
      choiceWords: {
        classic: ['classic', 'corner', 'l shaped'],
        round: ['round', 'circle'],
        tiny: ['tiny', 'small'],
        own: ['my own', 'own building'],
      },
    },
    chest: {
      words: ['chest', 'in the chest', 'starts with'],
      choiceWords: {
        lava_ice: ['lava', 'ice', 'cobblestone generator'],
        bread: ['bread', 'food'],
        mushrooms: ['mushrooms'],
      },
    },
    mobs: { words: ['mobs', 'monsters spawn'] },
    nether: { words: ['nether'], choiceWords: { void: ['empty nether', 'void nether'] } },
    trades: { words: ['trades', 'wandering trader'] },
    recipes: { words: ['recipes', 'sand', 'gravel'] },
    generator: { words: ['generator', 'own liquid'] },
    generator_name: {
      words: ['liquid called'],
      after: ['liquid called'],
      appliesWhen: { generator: [true] },
    },
    generator_makes: { words: ['makes with water'], appliesWhen: { generator: [true] } },
    goals: { words: ['goals', 'advancements'] },
  },
  'one-block': {
    game_name: NAME,
    phases: {
      words: ['phases'],
      choiceWords: {
        deep_dark: ['deep dark', 'sculk'],
        nether: ['nether'],
        ocean: ['ocean', 'sea'],
        end: ['the end', 'end'],
      },
    },
    breaks: { role: 'main-number', words: ['breaks'] },
    chests: { words: ['chests'] },
    mobs: { words: ['mobs'] },
    loop: { words: ['loop', 'start again'] },
    world: {
      words: ['world'],
      choiceWords: { void: ['empty', 'void', 'sky'], vanilla: ['normal world', 'normal'] },
    },
  },
  'sky-islands': {
    game_name: NAME,
    islands: {
      words: ['islands'],
      choiceWords: { floating: ['floating'], end: ['end', 'end like'] },
    },
    biome: {
      words: ['biome'],
      choiceWords: {
        'minecraft:cherry_grove': ['cherry', 'blossom', 'pink'],
        'minecraft:snowy_plains': ['snow', 'snowy'],
        'minecraft:desert': ['desert', 'sand'],
        'minecraft:jungle': ['jungle'],
        'minecraft:mushroom_fields': ['mushroom', 'no monsters'],
      },
    },
    start_island: { words: ['start island'] },
  },
  'lucky-block': {
    block_name: NAME,
    loot: { words: ['prizes', 'loot'] },
    mob: { words: ['mob appears', 'spawns a mob'] },
    mob_kind: {
      words: ['which mob'],
      choiceWords: {
        'minecraft:zombie': ['zombie'],
        'minecraft:creeper': ['creeper'],
        'minecraft:skeleton': ['skeleton'],
        'minecraft:chicken': ['chicken'],
        'minecraft:pig': ['pig'],
      },
    },
    explosion: { words: ['explosion', 'explodes', 'boom'] },
    building: { words: ['building', 'house', 'hut'] },
    effect: { words: ['effect'] },
    effect_kind: {
      words: ['which effect'],
      choiceWords: {
        'minecraft:speed': ['speed', 'fast'],
        'minecraft:regeneration': ['healing', 'regeneration'],
        'minecraft:jump_boost': ['jump', 'jumps'],
        'minecraft:levitation': ['levitation', 'float'],
        'minecraft:blindness': ['blindness', 'blind'],
      },
    },
    colour: MAIN_COLOUR,
    mark: {
      words: ['mark', 'on it'],
      choiceWords: { question: ['question mark'], star: ['star'] },
    },
  },
  'adventure-map': {
    map_name: NAME,
    world: { words: ['world'], choiceWords: { flat: ['flat', 'superflat'] } },
    start_as: {
      words: ['start as', 'game mode'],
      choiceWords: { survival: ['survival'], creative: ['creative'] },
    },
    welcome: {
      words: ['welcome'],
      choiceWords: { dialog: ['welcome screen', 'dialog', 'screen'], none: ['no welcome'] },
    },
    welcome_text: { words: ['says'], after: ['says', 'saying'] },
    game_rules: {
      words: ['game rules', 'rules'],
      choiceWords: {
        no_griefing: ['no griefing', 'mob griefing'],
        keep_inventory: ['keep inventory'],
        always_day: ['always day', 'no night'],
        no_weather: ['no weather', 'no rain'],
        no_fall_damage: ['no fall damage'],
        no_monsters: ['no monsters', 'peaceful'],
      },
    },
    checkpoints: { role: 'main-number', words: ['checkpoints'] },
    goals: { words: ['goals', 'advancements'] },
  },
  'arena-game': {
    game_name: NAME,
    teams: {
      words: ['teams'],
      choiceWords: { '2': ['two teams'], '3': ['three teams'], '4': ['four teams'] },
    },
    size: {
      words: ['arena', 'size'],
      choiceWords: { small: ['small'], medium: ['medium'], large: ['large', 'big'] },
    },
    floor: {
      words: ['made of', 'floor'],
      choiceWords: {
        'minecraft:smooth_sandstone': ['sandstone'],
        'minecraft:polished_deepslate': ['deepslate'],
        'minecraft:quartz_block': ['quartz'],
      },
    },
    rebuild: { words: ['rebuild', 'reset'] },
    minutes: { role: 'main-number', words: ['minutes', 'round length'] },
    win_score: { words: ['score to win', 'to win', 'points to win'] },
    kit: {
      words: ['kit', 'players get'],
      choiceWords: {
        sword: ['sword', 'shield'],
        bow: ['bow', 'arrows'],
        snowballs: ['snowballs', 'snowball fight'],
        none: ['no kit', 'nothing'],
      },
    },
  },
  race: {
    race_name: NAME,
    checkpoints: { words: ['checkpoints'] },
    count: {
      words: ['timer'],
      choiceWords: {
        up: ['stopwatch', 'count up'],
        down: ['time limit', 'count down', 'countdown'],
      },
    },
    limit: {
      role: 'main-number',
      words: ['seconds', 'time limit'],
      appliesWhen: { count: ['down'] },
    },
    best: { words: ['best time', 'sidebar', 'leaderboard'] },
  },
  goals: {
    tab_name: NAME,
    goals: {
      words: ['goals'],
      choiceWords: {
        get_diamond: ['diamond'],
        defeat_dragon: ['dragon', 'ender dragon'],
        visit_nether: ['nether'],
        visit_end: ['the end'],
      },
    },
    icon: {
      words: ['picture', 'icon'],
      choiceWords: { flag: ['flag'], timer: ['timer', 'clock', 'stopwatch'] },
    },
    icon_colour: MAIN_COLOUR,
    background: {
      words: ['background', 'behind'],
      choiceWords: { nether: ['netherrack'], end: ['end stone'] },
    },
  },
};

/** A machine recipe question (B650 SQ6 rules 1 and 3: "from" words, filled in order). */
function machineRecipe(): SearchQuestionHint {
  return {
    words: ['recipe', 'turns', 'into'],
    after: ['turns', 'into', 'makes', 'grinds', 'crushes', 'recipe'],
    choiceWords: {
      gravel: ['gravel'],
      flint: ['flint'],
      bone_meal: ['bone meal', 'bones'],
      iron_ingot: ['iron', 'raw iron'],
      gold_ingot: ['gold', 'raw gold'],
      copper_ingot: ['copper', 'raw copper'],
      string: ['string', 'wool'],
      sugar: ['sugar', 'sugar cane'],
      none: NO_RECIPE,
    },
  };
}
