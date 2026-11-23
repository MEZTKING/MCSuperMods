// Fixtures for the answer reader's tests (B659): flows with the question shapes of the library's
// 62 flows that B650's answer cases (docs/reference/spikes/b650, SQ6 and SQ12) reach, and the
// hints, behaviours and words of the shapes B654 and B655 wrote. Copied as data, never imported:
// the search package imports no plugin. Vanilla ids use the made-up namespace `base:`.
import type {
  JsonObject,
  PluginSearchData,
  SearchBehaviour,
  SearchQuestionHint,
  SearchVocabulary,
} from '@msm/plugin-api';
import type { SearchEntry, SearchQuestion } from '../../src';

type Q = SearchQuestion;
type Hints = Record<string, SearchQuestionHint>;

const choice = (id: string, label: string, choices: [string, string][]): Q => ({
  id,
  label,
  type: 'choice',
  choices: choices.map(([value, l]) => ({ value, label: l })),
});
const set = (id: string, label: string, choices: [string, string][]): Q => ({
  ...choice(id, label, choices),
  type: 'set',
});
const text = (id: string, label: string): Q => ({ id, label, type: 'string' });
const colour = (id: string, label: string): Q => ({ id, label, type: 'colour' });
const yesNo = (id: string, label: string): Q => ({ id, label, type: 'boolean' });
const number = (id: string, label: string, min: number, max: number): Q => ({
  id,
  label,
  type: 'number',
  min,
  max,
});
const image = (id: string, label: string): Q => ({ id, label, type: 'image' });

const FROM = ['from', 'of', 'made of', 'made from', 'with', 'using', 'out of'];
const LIKE = ['like', 'as', 'same as'];
const NAME: SearchQuestionHint = { role: 'name' };
const MAIN_COLOUR: SearchQuestionHint = { role: 'main-colour' };
const NEVER: SearchQuestionHint = { never: true };
const NO_RECIPE = ['no recipe', 'not craftable', 'uncraftable'];

const TIERS: [string, string][] = [
  ['wood', 'Wood'],
  ['stone', 'Stone'],
  ['copper', 'Copper'],
  ['iron', 'Iron'],
  ['gold', 'Gold'],
  ['diamond', 'Diamond'],
  ['netherite', 'Netherite'],
];
const INGREDIENTS: [string, string][] = [
  ['none', 'No recipe'],
  ['base:emerald', 'Emerald'],
  ['base:diamond', 'Diamond'],
  ['base:iron_ingot', 'Iron ingot'],
  ['base:gold_ingot', 'Gold ingot'],
  ['base:netherite_ingot', 'Netherite ingot'],
];
const EFFECTS: [string, string][] = [
  ['base:speed', 'Speed'],
  ['base:regeneration', 'Regeneration'],
  ['base:poison', 'Poison'],
  ['base:night_vision', 'Night vision'],
];
const EFFECT_WORDS: Record<string, string[]> = {
  'base:speed': ['fast', 'faster', 'swift'],
  'base:regeneration': ['regen', 'heal', 'heals'],
  'base:poison': ['poisonous', 'toxic'],
  'base:night_vision': ['see in the dark'],
};
const DYES: [string, string][] = [
  ['white', 'White'],
  ['red', 'Red'],
  ['blue', 'Blue'],
  ['light_blue', 'Light blue'],
  ['green', 'Green'],
  ['cyan', 'Cyan'],
];
const WOODS: [string, string][] = [
  ['oak', 'Oak'],
  ['birch', 'Birch'],
  ['cherry', 'Cherry'],
  ['new', 'Its own'],
];

interface Flow {
  readonly starter: string;
  readonly title: string;
  readonly sort?: string;
  readonly defaults?: Record<string, string | number | boolean>;
  readonly questions: Q[];
  readonly hints: Hints;
  readonly source?: 'flow' | 'starter';
  readonly words?: string[];
}

export const FLOWS: Flow[] = [
  {
    starter: 'weapon',
    title: 'Weapon',
    sort: 'item',
    defaults: { weapon_type: 'spear', tier: 'iron', custom_damage: false },
    questions: [
      text('weapon_name', 'Weapon name'),
      colour('colour', 'Colour'),
      choice('weapon_type', 'Type', [
        ['sword', 'Sword'],
        ['spear', 'Spear'],
        ['mace', 'Mace'],
        ['bow', 'Bow'],
        ['crossbow', 'Crossbow'],
        ['shield', 'Shield'],
      ]),
      choice('tier', 'Material tier', TIERS),
      number('durability', 'Durability', 1, 5000),
      yesNo('custom_damage', 'Set damage and speed yourself'),
      number('attack_damage', 'Attack damage', 0, 30),
      number('attack_speed', 'Attack speed', -3.9, 0),
      number('draw_speed', 'Draw speed', 0.5, 3),
      number('damage_multiplier', 'Arrow damage multiplier', 0, 5),
      number('damage_reduction', 'Damage blocked', 0, 1),
      choice('ingredient', 'Crafted from', INGREDIENTS),
      image('picture', 'Picture'),
    ],
    hints: {
      weapon_name: NAME,
      colour: MAIN_COLOUR,
      weapon_type: {
        words: ['type', 'kind'],
        choiceWords: { sword: ['blade', 'katana'], mace: ['hammer', 'club'], bow: ['longbow'] },
      },
      tier: { words: ['tier', 'material'] },
      durability: { words: ['durability', 'uses', 'lasts', 'durable'] },
      custom_damage: {
        words: ['own damage', 'custom damage', 'set damage', 'own numbers'],
        appliesWhen: { weapon_type: ['sword', 'spear', 'mace'] },
      },
      attack_damage: {
        words: ['damage', 'attack', 'hits for', 'dmg', 'attack damage'],
        appliesWhen: { weapon_type: ['sword', 'spear', 'mace'], custom_damage: [true] },
      },
      attack_speed: {
        words: ['attack speed', 'swing speed'],
        appliesWhen: { weapon_type: ['sword', 'spear', 'mace'], custom_damage: [true] },
      },
      draw_speed: {
        words: ['draw', 'draw speed'],
        appliesWhen: { weapon_type: ['bow', 'crossbow'] },
      },
      damage_multiplier: {
        words: ['damage', 'arrow damage', 'multiplier'],
        appliesWhen: { weapon_type: ['bow', 'crossbow'] },
      },
      damage_reduction: {
        words: ['damage blocked', 'blocks', 'reduction'],
        appliesWhen: { weapon_type: ['shield'] },
      },
      ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
      picture: NEVER,
    },
  },
  {
    starter: 'custom-sword',
    title: 'Custom sword',
    source: 'starter',
    sort: 'item',
    questions: [
      text('sword_name', 'Sword name'),
      colour('colour', 'Blade colour'),
      choice('tool_tier', 'Tier', TIERS),
      number('durability', 'Durability', 1, 5000),
      choice('ingredient', 'Crafted from', INGREDIENTS),
    ],
    hints: {
      sword_name: NAME,
      colour: { role: 'main-colour', words: ['blade'] },
      tool_tier: { words: ['tier', 'material'] },
      durability: { words: ['durability', 'uses'] },
      ingredient: { after: FROM },
    },
  },
  {
    starter: 'gear-set',
    title: 'Gear set',
    sort: 'item',
    defaults: { tier: 'iron', armor_base: 'iron' },
    questions: [
      text('material_name', 'Material name'),
      colour('colour', 'Colour'),
      set('pieces', 'Pieces', [
        ['sword', 'Sword'],
        ['pickaxe', 'Pickaxe'],
        ['axe', 'Axe'],
        ['helmet', 'Helmet'],
        ['boots', 'Boots'],
      ]),
      choice('tier', 'Tool tier', [...TIERS, ['custom', 'My own numbers']]),
      number('custom_durability', 'Tool durability', 1, 10000),
      choice('mines_like', 'Mines like', TIERS),
      choice('armor_base', 'Armour like', [
        ['leather', 'Leather'],
        ['chainmail', 'Chainmail'],
        ['iron', 'Iron'],
        ['gold', 'Gold'],
        ['diamond', 'Diamond'],
        ['custom', 'My own numbers'],
      ]),
    ],
    hints: {
      material_name: NAME,
      colour: MAIN_COLOUR,
      pieces: {
        words: ['pieces', 'with', 'and'],
        choiceWords: { sword: ['swords'], pickaxe: ['pick', 'pickaxes'], helmet: ['helm', 'hat'] },
      },
      tier: { words: ['tier', 'strength'] },
      custom_durability: {
        words: ['tool durability', 'durability', 'uses', 'lasts'],
        appliesWhen: { tier: ['custom'] },
      },
      mines_like: { after: LIKE, appliesWhen: { tier: ['custom'] } },
      armor_base: { after: LIKE, choiceWords: { chainmail: ['chain', 'chain mail'] } },
    },
  },
  {
    starter: 'simple-block',
    title: 'Simple block',
    sort: 'block',
    questions: [
      text('block_name', 'Block name'),
      colour('colour', 'Colour'),
      number('light_level', 'Light level', 0, 15),
      number('hardness', 'Hardness', 0, 50),
      choice('min_tier', 'Pickaxe needed', [
        ['none', 'Any'],
        ['stone', 'Stone'],
        ['iron', 'Iron'],
        ['diamond', 'Diamond'],
      ]),
      yesNo('drops_itself', 'Drops itself'),
      choice('ingredient', 'Crafted from', [
        ['none', 'No recipe'],
        ['base:stone', 'Stone'],
        ['base:diamond', 'Diamond'],
      ]),
    ],
    hints: {
      block_name: NAME,
      colour: MAIN_COLOUR,
      light_level: { words: ['light', 'glows', 'glowing', 'bright', 'light level', 'lit'] },
      hardness: { words: ['hard', 'hardness', 'tough'] },
      min_tier: {
        words: ['tier', 'needs', 'or better'],
        choiceWords: {
          none: ['any tier'],
          stone: ['stone pickaxe'],
          iron: ['iron pickaxe'],
          diamond: ['diamond pickaxe'],
        },
      },
      drops_itself: { words: ['drops itself', 'silk touch'] },
      ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
    },
  },
  {
    starter: 'custom_ore',
    title: 'Custom ore',
    sort: 'block',
    questions: [
      text('ore_name', 'Ore name'),
      colour('colour', 'Colour'),
      choice('tool_tier', 'Pickaxe needed', [
        ['stone', 'Stone'],
        ['iron', 'Iron'],
        ['diamond', 'Diamond'],
      ]),
      choice('vein_preset', 'Veins', [
        ['iron', 'Like iron'],
        ['diamond', 'Like diamond'],
        ['own', 'My own numbers'],
      ]),
      number('drop_min', 'Fewest dropped', 1, 64),
      number('drop_max', 'Most dropped', 1, 64),
    ],
    hints: {
      ore_name: NAME,
      colour: MAIN_COLOUR,
      tool_tier: { words: ['pickaxe', 'pick', 'mined with', 'needs'] },
      vein_preset: { after: LIKE, choiceWords: { own: ['my own', 'custom numbers'] } },
      drop_min: { words: ['drops', 'fewest', 'at least', 'minimum'] },
      drop_max: { words: ['drops', 'most', 'up to', 'maximum'] },
    },
  },
  {
    starter: 'flying-mob',
    title: 'Flying mob',
    sort: 'mob',
    questions: [
      text('mob_name', 'Mob name'),
      colour('colour', 'Colour'),
      number('health', 'Health', 1, 1024),
      choice('behaviour', 'What it does', [
        ['peaceful', 'Peaceful'],
        ['hostile', 'Hostile'],
        ['shooter', 'Shoots at you'],
      ]),
      choice('flight', 'How it flies', [
        ['fly', 'Flies about'],
        ['hover', 'Hovers'],
      ]),
      choice('projectile', 'What it shoots', [
        ['base:arrow', 'Arrow'],
        ['base:snowball', 'Snowball'],
      ]),
      colour('variant_1_colour', 'Variant 1 colour'),
    ],
    hints: {
      mob_name: NAME,
      colour: MAIN_COLOUR,
      health: { words: ['health', 'hearts', 'hp'] },
      behaviour: {
        words: ['behaviour'],
        choiceWords: {
          peaceful: ['friendly', 'passive'],
          hostile: ['evil', 'aggressive'],
          shooter: ['shoots', 'ranged'],
        },
      },
      flight: { words: ['flies', 'flight'], choiceWords: { hover: ['floats'] } },
      projectile: {
        after: ['shoots', 'fires', 'throws'],
        appliesWhen: { behaviour: ['shooter'] },
        choiceWords: { 'base:arrow': ['arrows'] },
      },
      variant_1_colour: NEVER,
    },
  },
  {
    starter: 'mount',
    title: 'Mount',
    sort: 'mob',
    questions: [
      text('mount_name', 'Mount name'),
      colour('colour', 'Colour'),
      number('health', 'Health', 1, 1024),
      yesNo('flying', 'Flies'),
      yesNo('needs_saddle', 'Needs a saddle'),
    ],
    hints: {
      mount_name: NAME,
      colour: MAIN_COLOUR,
      health: { words: ['health', 'hearts'] },
      flying: { words: ['flying', 'flies', 'fly', 'wings'] },
      needs_saddle: { words: ['saddle', 'needs a saddle'] },
    },
  },
  {
    starter: 'farm-animal',
    title: 'Farm animal',
    sort: 'mob',
    questions: [text('animal_name', 'Animal name'), yesNo('rideable', 'You can ride it')],
    hints: { animal_name: NAME, rideable: { words: ['rideable', 'saddle'] } },
  },
  {
    starter: 'bed',
    title: 'Bed',
    sort: 'block',
    questions: [
      text('bed_name', 'Bed name'),
      choice('kind', 'Kind', [
        ['bed', 'Bed'],
        ['sleeping_bag', 'Sleeping bag'],
      ]),
      choice('colour', 'Blanket colour', DYES),
    ],
    hints: {
      bed_name: NAME,
      kind: { choiceWords: { sleeping_bag: ['bedroll'] } },
      colour: {
        role: 'main-colour',
        words: ['blanket', 'sheets'],
        choiceWords: { light_blue: ['sky blue', 'baby blue'], cyan: ['teal'] },
      },
    },
  },
  {
    starter: 'tree',
    title: 'Tree',
    sort: 'block',
    questions: [
      text('tree_name', 'Tree name'),
      choice('log', 'Log', WOODS),
      choice('leaves', 'Leaves', WOODS),
      colour('colour', 'Wood colour'),
      colour('leaf_colour', 'Leaf colour'),
    ],
    hints: {
      tree_name: NAME,
      log: { words: ['trunk', 'log'], choiceWords: { new: ['new log', 'own log'] } },
      leaves: { words: ['leaves'], sameAs: 'log', choiceWords: { new: ['new leaves'] } },
      colour: { role: 'main-colour', words: ['wood', 'trunk', 'bark'] },
      leaf_colour: { words: ['leaf', 'leaves', 'foliage'] },
    },
  },
  {
    starter: 'consumable',
    title: 'Consumable',
    sort: 'item',
    questions: [
      text('consumable_name', 'Name'),
      colour('colour', 'Colour'),
      number('seconds', 'Seconds to eat', 0.1, 30),
      choice('effect_1', 'Effect 1', EFFECTS),
      number('effect_1_seconds', 'Effect 1: seconds', 1, 600),
      choice('effect_2', 'Effect 2', EFFECTS),
      number('effect_2_seconds', 'Effect 2: seconds', 1, 600),
      choice('ingredient', 'Crafted from', INGREDIENTS),
    ],
    hints: {
      consumable_name: NAME,
      colour: MAIN_COLOUR,
      seconds: { words: ['seconds to eat', 'eating time'] },
      effect_1: { words: ['effect', 'gives'], choiceWords: EFFECT_WORDS },
      effect_1_seconds: { words: ['seconds', 'for', 'lasts'] },
      effect_2: { words: ['effect', 'and'], choiceWords: EFFECT_WORDS },
      effect_2_seconds: { words: ['seconds', 'for', 'lasts'] },
      ingredient: { after: FROM, choiceWords: { none: NO_RECIPE } },
    },
  },
  {
    starter: 'crop',
    title: 'Crop',
    sort: 'block',
    defaults: { produce: 'seeds' },
    questions: [
      text('crop_name', 'Crop name'),
      choice('produce', 'Planted from', [
        ['seeds', 'Seeds'],
        ['produce', 'The produce'],
      ]),
      text('seeds_name', 'Seeds name'),
      number('seeds_compost', 'Seeds compost chance', 0, 100),
      number('produce_compost', 'Produce compost chance', 0, 100),
    ],
    hints: {
      crop_name: NAME,
      produce: { words: ['planted from'], choiceWords: { produce: ['like carrots'] } },
      seeds_name: { words: ['seeds called'], after: ['seeds called', 'seeds named'] },
      seeds_compost: {
        words: ['seeds compost', 'compost seeds'],
        after: ['seeds'],
        appliesWhen: { produce: ['seeds'] },
      },
      produce_compost: { words: ['compost', 'composter', 'compostable'] },
    },
  },
  {
    starter: 'villager-trade',
    title: 'Villager trade',
    sort: 'item',
    questions: [
      choice('direction', 'The villager', [
        ['sells', 'Sells it'],
        ['buys', 'Buys it'],
      ]),
      text('item', 'Item'),
      number('emeralds', 'Emeralds', 1, 64),
    ],
    hints: {
      direction: { choiceWords: { sells: ['sells', 'sell'], buys: ['buys', 'buy'] } },
      item: { after: ['sells', 'buys', 'for', 'trade'] },
      emeralds: { words: ['emeralds', 'emerald', 'price', 'costs'] },
    },
  },
  {
    starter: 'extra-drop',
    title: 'Extra drop',
    questions: [
      choice('table', 'Dropped by', [
        ['entities/zombie', 'Zombie'],
        ['blocks/gravel', 'Gravel'],
      ]),
      text('item', 'Item'),
      number('count_min', 'Fewest', 1, 64),
      number('count_max', 'Most', 1, 64),
    ],
    hints: {
      table: {
        after: ['from', 'when', 'kills', 'breaking'],
        choiceWords: { 'entities/zombie': ['zombies'] },
      },
      item: { words: ['drops'], after: ['drops', 'drop', 'gives'] },
      count_min: { words: ['fewest', 'at least'] },
      count_max: { words: ['most', 'up to'] },
    },
  },
  {
    starter: 'backpack',
    title: 'Backpack',
    sort: 'item',
    questions: [
      text('bag_name', 'Bag name'),
      colour('colour', 'Colour'),
      number('rows', 'Rows', 1, 6),
      yesNo('recipe', 'Crafting recipe'),
    ],
    hints: {
      bag_name: NAME,
      colour: MAIN_COLOUR,
      rows: { role: 'main-number', words: ['rows', 'row', 'slots'] },
      recipe: { words: ['recipe', 'craftable', 'crafted'] },
    },
  },
  {
    starter: 'scripted-item',
    title: 'Scripted item',
    sort: 'item',
    words: ['wand', 'staff', 'magic item'],
    questions: [text('item_name', 'Item name'), colour('colour', 'Colour')],
    hints: { item_name: NAME, colour: MAIN_COLOUR },
  },
  {
    starter: 'enchantment',
    title: 'Enchantment',
    questions: [
      text('enchantment_name', 'Enchantment name'),
      choice('effect', 'What it does', [
        ['fire', 'Set the target on fire'],
        ['mob_effect', 'Give the target an effect'],
      ]),
    ],
    hints: { enchantment_name: NAME },
  },
];

/** The flows as entries: a flow's action names its starter. */
export function flowEntries(): SearchEntry[] {
  return FLOWS.map((flow) => ({
    id: `${flow.source ?? 'flow'}:${flow.starter}`,
    source: flow.source ?? 'flow',
    title: flow.title,
    available: true,
    questions: flow.questions,
    ...(flow.words !== undefined ? { words: flow.words } : {}),
    action:
      flow.source === 'starter'
        ? { type: 'new-project', starter: flow.starter }
        : { type: 'make', flow: flow.starter },
    preview: { type: 'none' },
  }));
}

/** Facts of the flows by starter id: sorts and defaults. */
export function flowFacts(): Record<
  string,
  { sort?: string; defaults?: Record<string, string | number | boolean> }
> {
  const out: Record<
    string,
    { sort?: string; defaults?: Record<string, string | number | boolean> }
  > = {};
  for (const flow of FLOWS) {
    out[flow.starter] = {
      ...(flow.sort !== undefined ? { sort: flow.sort } : {}),
      ...(flow.defaults !== undefined ? { defaults: flow.defaults } : {}),
    };
  }
  return out;
}

const thingRule = (key: string, trigger: string, step: JsonObject): JsonObject => ({
  do: [step],
  key,
  name: key,
  when: { subject: '$thing', trigger },
});

/** Behaviours of the shapes B654 (flows, answers, companions) and B655 (one rule per sort) wrote. */
export const BEHAVIOURS: SearchBehaviour[] = [
  {
    id: 'sets-on-fire',
    phrases: ['sets mobs on fire', 'sets on fire', 'burns mobs'],
    sentence: 'An enchantment for it that sets the target on fire.',
    appliesTo: ['item'],
    beside: { starter: 'enchantment', values: { effect: 'fire', for: '$thing' } },
  },
  {
    id: 'poisons',
    phrases: ['poisons', 'poisons mobs'],
    sentence: 'An enchantment for it that poisons the target.',
    appliesTo: ['item'],
    beside: { starter: 'enchantment', values: { effect: 'mob_effect' } },
  },
  {
    id: 'ride',
    phrases: ['you can ride', 'can be ridden', 'rideable'],
    sentence: 'You can ride it and steer it.',
    appliesTo: ['mob'],
    flows: ['mount'],
    answers: { 'farm-animal': { rideable: true } },
  },
  {
    id: 'flies',
    phrases: ['flies', 'can fly'],
    sentence: 'It flies.',
    appliesTo: ['mob'],
    flows: ['flying-mob'],
    answers: { mount: { flying: true } },
  },
  {
    id: 'glows',
    phrases: ['glows', 'gives light', 'lights up'],
    sentence: 'It gives light.',
    appliesTo: ['block'],
    answers: { 'simple-block': { light_level: 15 } },
  },
  {
    id: 'block-drops-xp',
    phrases: ['drops xp', 'drops experience'],
    sentence: 'When a player breaks it, it gives experience.',
    appliesTo: ['block'],
    rule: thingRule('block_drops_xp', 'block_broken', { amount: 5, step: 'give_experience' }),
  },
  {
    id: 'mob-drops-xp',
    phrases: ['drops xp', 'drops experience'],
    sentence: 'When it dies, it gives experience.',
    appliesTo: ['mob'],
    rule: thingRule('mob_drops_xp', 'mob_died', { amount: 5, step: 'give_experience' }),
  },
  {
    id: 'block-explodes',
    phrases: ['explodes', 'blows up'],
    sentence: 'When a player breaks it, it explodes.',
    appliesTo: ['block'],
    rule: thingRule('block_explodes', 'block_broken', { power: 3, step: 'explode' }),
  },
  {
    id: 'item-explodes',
    phrases: ['explodes', 'blows up'],
    sentence: 'When a player uses it, it explodes.',
    appliesTo: ['item'],
    rule: thingRule('item_explodes', 'item_used', { power: 3, step: 'explode' }),
  },
  {
    id: 'item-teleports',
    phrases: ['teleports you', 'teleports'],
    sentence: 'When a player uses it, it teleports them where they look.',
    appliesTo: ['item'],
    rule: thingRule('item_teleports', 'item_used', { step: 'teleport' }),
  },
  {
    id: 'item-single-use',
    phrases: ['single use', 'breaks after one use'],
    sentence: 'When a player uses it, it is used up.',
    appliesTo: ['item'],
    rule: {
      do: [{ item: '$thing', step: 'take_item' }],
      key: 'item_single_use',
      name: 'item single use',
      when: { subject: '$thing', trigger: 'item_used' },
    },
  },
];

export const VOCABULARY: SearchVocabulary = {
  words: [
    { idea: 'netherite', same: [], misspellings: ['netherrite'] },
    { idea: 'pickaxe', same: ['pick axe'], slang: ['pick'] },
    { idea: 'sword', same: ['blade'] },
    { idea: 'pig', same: ['piggy'], vanillaIds: ['base:pig'] },
    { idea: 'diamond', same: ['diamonds'], vanillaIds: ['base:diamond'] },
    { idea: 'bone', same: ['bones'], vanillaIds: ['base:bone'] },
    // An idea whose word is not the thing's name (B666: "custom ore" read as an ore's id).
    { idea: 'gem', same: ['gems'], vanillaIds: ['base:diamond'] },
    { idea: 'experience', same: [], slang: ['xp'] },
    { idea: 'wand', same: ['staff'] },
    { idea: 'animal', same: ['creature'] },
    { idea: 'block', same: [] },
    { idea: 'mob', same: ['monster'] },
  ],
  colours: [
    { names: ['blue', 'dark blue'], colour: '#3c44aa' },
    { names: ['light blue', 'sky blue'], colour: '#3ab3da' },
    { names: ['red', 'crimson'], colour: '#b02e26' },
    { names: ['green'], colour: '#5e7c16' },
    { names: ['white'], colour: '#f9fffe' },
    { names: ['teal', 'cyan'], colour: '#169c9c' },
    { names: ['gold', 'golden'], colour: '#fcdb4a' },
    { names: ['emerald'], colour: '#17dd62' },
    { names: ['diamond'], colour: '#4aedd9' },
    { names: ['iron'], colour: '#d8d8d8' },
  ],
};

/** The plugin data the reader is given: hints by starter and the behaviours. */
export function pluginData(): PluginSearchData {
  const questions: Record<string, Hints> = {};
  for (const flow of FLOWS) questions[flow.starter] = flow.hints;
  return { vocabulary: VOCABULARY, behaviours: BEHAVIOURS, questions };
}
