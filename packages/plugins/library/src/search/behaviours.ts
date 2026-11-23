/**
 * What a made thing does, read from a clause after "that", "which" or "when" (ADR 0124 D7,
 * B650 SQ12), where the library's own flows make it: the flow itself ("a mob you can ride": the
 * Mount flow), answers of the flow being made ("a block that glows": light level 15) or one
 * companion flow ("a sword that sets mobs on fire": the Enchantment flow's "Set the target on
 * fire" for swords). Behaviours that are one Rules rule ("drops xp", "explodes", "teleports
 * you") are the rules plugin's (B655).
 *
 * The gaps B650 found were closed by ADR 0127: setting a mob on fire is the Rules step Set on
 * fire, so "sets mobs on fire" is the rules plugin's behaviour (one rule on the made item) and
 * only "fire aspect" stays here as the Enchantment flow beside it; "never wears out" is the
 * Weapon and Gear set flows' own answer; a Frost Walker-like effect is the Enchantment flow's
 * boots choice (`questions.ts`, `keywords.ts`).
 *
 * Every starter, question and value named here is checked against the library's starters in
 * `test/search.test.ts`, and every answer must pass the wizard's own check.
 */

import type { SearchBehaviour } from '@msm/plugin-api';

/** Behaviours that are a companion Enchantment flow made beside an item. */
const ENCHANTMENTS: SearchBehaviour[] = [
  {
    id: 'sets-on-fire',
    phrases: ['fire aspect', 'has fire aspect'],
    sentence:
      'An enchantment for it that sets the target on fire, offered at the enchanting table.',
    appliesTo: ['item'],
    beside: { starter: 'enchantment', values: { effect: 'fire', applies_to: 'swords' } },
  },
  {
    id: 'poisons',
    phrases: ['poisons', 'poisons mobs', 'is poisonous', 'poison blade', 'venomous'],
    sentence: 'An enchantment for it that poisons the target, offered at the enchanting table.',
    appliesTo: ['item'],
    beside: {
      starter: 'enchantment',
      values: { effect: 'mob_effect', hit_effect: 'minecraft:poison', applies_to: 'swords' },
    },
  },
  {
    id: 'slows',
    phrases: ['slows mobs', 'slows down', 'slows enemies', 'freezes mobs'],
    sentence:
      'An enchantment for it that gives the target Slowness, offered at the enchanting table.',
    appliesTo: ['item'],
    beside: {
      starter: 'enchantment',
      values: { effect: 'mob_effect', hit_effect: 'minecraft:slowness', applies_to: 'swords' },
    },
  },
  {
    id: 'weakens',
    phrases: ['weakens mobs', 'makes mobs weak', 'weakens'],
    sentence:
      'An enchantment for it that gives the target Weakness, offered at the enchanting table.',
    appliesTo: ['item'],
    beside: {
      starter: 'enchantment',
      values: { effect: 'mob_effect', hit_effect: 'minecraft:weakness', applies_to: 'swords' },
    },
  },
  {
    id: 'knocks-back',
    phrases: ['knocks back', 'knockback', 'knocks mobs back', 'pushes mobs away'],
    sentence: 'An enchantment for it with extra knockback, offered at the enchanting table.',
    appliesTo: ['item'],
    beside: { starter: 'enchantment', values: { effect: 'knockback', applies_to: 'swords' } },
  },
  {
    id: 'extra-damage',
    phrases: ['does extra damage', 'hits harder', 'extra damage', 'sharper'],
    sentence: 'An enchantment for it with extra damage, offered at the enchanting table.',
    appliesTo: ['item'],
    beside: { starter: 'enchantment', values: { effect: 'damage', applies_to: 'swords' } },
  },
  {
    id: 'mines-faster',
    phrases: ['mines faster', 'digs faster', 'breaks blocks faster', 'mines quickly'],
    sentence: 'An enchantment for tools that mines faster, offered at the enchanting table.',
    appliesTo: ['item'],
    beside: { starter: 'enchantment', values: { effect: 'mining_speed', applies_to: 'tools' } },
  },
  {
    id: 'lasts-longer',
    phrases: ['lasts longer', 'breaks less', 'more durable', 'wears out slowly'],
    sentence: 'An enchantment for it with extra durability, offered at the enchanting table.',
    appliesTo: ['item'],
    beside: { starter: 'enchantment', values: { effect: 'durability', applies_to: 'everything' } },
  },
];

/** Behaviours that are answers of the flow being made (ADR 0127 D3). */
const WEAR: SearchBehaviour[] = [
  {
    id: 'never-wears-out',
    phrases: ['never wears out', 'never breaks', 'is unbreakable', 'lasts forever'],
    sentence: 'It never wears out, as with the Unbreakable tag.',
    appliesTo: ['item'],
    answers: { weapon: { never_wears_out: true }, 'gear-set': { never_wears_out: true } },
  },
];

/** Behaviours that are a flow of their own. */
const FLOWS: SearchBehaviour[] = [
  {
    id: 'ride',
    phrases: ['you can ride', 'can ride', 'can be ridden', 'to ride', 'rideable', 'you ride'],
    sentence: 'You can ride it and steer it.',
    appliesTo: ['mob'],
    flows: ['mount'],
    answers: { 'farm-animal': { rideable: true } },
  },
  {
    id: 'flies',
    phrases: ['flies', 'can fly', 'that fly', 'flying', 'fly'],
    sentence: 'It flies.',
    appliesTo: ['mob'],
    flows: ['flying-mob'],
    answers: { mount: { flying: true } },
  },
  {
    id: 'follows',
    phrases: ['follows you', 'follows me', 'you can tame', 'can be tamed', 'is tame'],
    sentence: 'You can tame it, and it follows you.',
    appliesTo: ['mob'],
    flows: ['pet'],
  },
  {
    id: 'swims',
    phrases: ['swims', 'lives in water', 'lives in the sea', 'can swim'],
    sentence: 'It swims in water.',
    appliesTo: ['mob'],
    flows: ['water-mob'],
  },
  {
    id: 'trades',
    phrases: ['trades with you', 'sells things', 'sells items', 'you can trade with'],
    sentence: 'It trades with you for emeralds.',
    appliesTo: ['mob'],
    flows: ['wandering-merchant'],
  },
  {
    id: 'eat',
    phrases: ['you can eat', 'can be eaten', 'is edible'],
    sentence: 'You can eat it.',
    appliesTo: ['item'],
    flows: ['food'],
  },
  {
    id: 'gives-effects-when-eaten',
    phrases: ['gives effects when eaten', 'gives you effects', 'gives buffs'],
    sentence: 'Eating or drinking it gives effects.',
    appliesTo: ['item'],
    flows: ['consumable'],
  },
  {
    id: 'stores',
    phrases: [
      'stores items',
      'holds items',
      'keeps items',
      'has an inventory',
      'you can put things in',
    ],
    sentence: 'It stores items.',
    appliesTo: ['block', 'item'],
    flows: ['storage-crate', 'backpack'],
  },
  {
    id: 'grows',
    phrases: ['grows', 'you can plant', 'can be planted', 'you can farm'],
    sentence: 'You plant it and it grows.',
    appliesTo: ['block'],
    flows: ['crop', 'tree'],
  },
  {
    id: 'sleep',
    phrases: ['you can sleep in', 'you sleep in', 'sets your spawn'],
    sentence: 'You sleep in it and it sets your spawn.',
    appliesTo: ['block'],
    flows: ['bed'],
  },
  {
    id: 'saves-from-death',
    phrases: ['saves you from death', 'stops you dying', 'revives you', 'gives an extra life'],
    sentence: 'It saves its holder from death, as a totem of undying does.',
    appliesTo: ['item'],
    flows: ['totem'],
  },
  {
    id: 'glides',
    phrases: ['glides', 'lets you glide', 'lets you fly', 'you can glide with'],
    sentence: 'Worn on your chest, it lets you glide.',
    appliesTo: ['item'],
    flows: ['glider'],
  },
  {
    id: 'thrown',
    phrases: ['you can throw', 'can be thrown', 'you throw'],
    sentence: 'You throw it.',
    appliesTo: ['item'],
    flows: ['throwable'],
  },
  {
    id: 'ages',
    phrases: ['ages', 'ages like copper', 'oxidises', 'weathers', 'turns green'],
    sentence: 'It slowly ages in four stages, as copper does.',
    appliesTo: ['block'],
    flows: ['copper-set'],
    answers: { 'stone-set': { ages: true } },
  },
  {
    id: 'drive',
    phrases: ['you can drive', 'can be driven', 'you drive'],
    sentence: 'You drive it on the ground.',
    appliesTo: ['vehicle'],
    flows: ['vehicle-car'],
  },
];

/** Behaviours that are answers of the flow being made. */
const ANSWERS: SearchBehaviour[] = [
  {
    id: 'glows',
    phrases: [
      'glows',
      'glow',
      'gives light',
      'gives off light',
      'lights up',
      'shines',
      'is bright',
    ],
    sentence: 'It gives off light at level 15.',
    appliesTo: ['block'],
    answers: {
      'simple-block': { light_level: 15 },
      'cave-plants': { light: 15 },
      fluid: { light: 15 },
    },
  },
  {
    id: 'shoots-arrows',
    phrases: ['shoots arrows', 'shoots at you', 'is an archer', 'shoots'],
    sentence: 'It shoots arrows at players.',
    appliesTo: ['mob'],
    answers: {
      custom_mob: { behaviour: 'archer' },
      'flying-mob': { behaviour: 'shooter', projectile: 'minecraft:arrow' },
      boss: { attacks: 'ranged', projectile: 'minecraft:arrow' },
    },
  },
  {
    id: 'shoots-fireballs',
    phrases: ['shoots fireballs', 'throws fireballs', 'spits fire', 'breathes fire'],
    sentence: 'It shoots fire charges at players.',
    appliesTo: ['mob'],
    answers: {
      'flying-mob': { behaviour: 'shooter', projectile: 'minecraft:fire_charge' },
      boss: { attacks: 'ranged', projectile: 'minecraft:fire_charge' },
    },
  },
  {
    id: 'friendly',
    phrases: [
      'is friendly',
      'is peaceful',
      'is passive',
      'does not attack',
      'never fights',
      'is harmless',
    ],
    sentence: 'It never fights.',
    appliesTo: ['mob'],
    answers: {
      custom_mob: { behaviour: 'peaceful' },
      'flying-mob': { behaviour: 'peaceful' },
      'water-mob': { behaviour: 'peaceful' },
    },
  },
  {
    id: 'neutral',
    phrases: ['fights back', 'attacks when hit', 'is neutral', 'gets angry when hit'],
    sentence: 'It fights back when hit.',
    appliesTo: ['mob'],
    answers: {
      custom_mob: { behaviour: 'neutral' },
      'flying-mob': { behaviour: 'neutral' },
      'water-mob': { behaviour: 'neutral' },
    },
  },
  {
    id: 'attacks',
    phrases: [
      'attacks players',
      'attacks you',
      'is hostile',
      'is evil',
      'is aggressive',
      'hunts players',
    ],
    sentence: 'It attacks players.',
    appliesTo: ['mob'],
    answers: {
      custom_mob: { behaviour: 'hostile' },
      'flying-mob': { behaviour: 'hostile' },
      'water-mob': { behaviour: 'hostile' },
    },
  },
  {
    id: 'sits-on-shoulder',
    phrases: ['sits on your shoulder', 'rides on your shoulder', 'perches on your shoulder'],
    sentence: 'It rides on your shoulder.',
    appliesTo: ['mob'],
    answers: { pet: { shoulder: true } },
  },
  {
    id: 'fetches',
    phrases: ['fetches', 'brings you items', 'collects items', 'picks up items'],
    sentence: 'It brings you items it finds.',
    appliesTo: ['mob'],
    answers: { pet: { fetches: true } },
  },
  {
    id: 'digs',
    phrases: ['digs', 'digs things up', 'digs up items', 'finds buried things'],
    sentence: 'It digs things up.',
    appliesTo: ['mob'],
    answers: { pet: { digs: true } },
  },
  {
    id: 'defends',
    phrases: ['protects you', 'defends you', 'guards you', 'fights for you'],
    sentence: 'It defends its owner.',
    appliesTo: ['mob'],
    answers: { pet: { defends: true } },
  },
  {
    id: 'bucket',
    phrases: ['you can catch in a bucket', 'can be caught in a bucket', 'goes in a bucket'],
    sentence: 'You catch it in a bucket.',
    appliesTo: ['mob'],
    answers: { 'water-mob': { bucket: true } },
  },
  {
    id: 'plays-dead',
    phrases: ['plays dead', 'pretends to be dead', 'fakes its death'],
    sentence: 'It plays dead when badly hurt.',
    appliesTo: ['mob'],
    answers: { 'water-mob': { plays_dead: true } },
  },
  {
    id: 'roosts',
    phrases: ['hangs upside down', 'roosts', 'sleeps by day', 'hangs under blocks'],
    sentence: 'It hangs under blocks by day.',
    appliesTo: ['mob'],
    answers: { 'flying-mob': { roosts: true } },
  },
  {
    id: 'swoops',
    phrases: ['swoops', 'dives at you', 'swoops down'],
    sentence: 'It swoops down from above.',
    appliesTo: ['mob'],
    answers: { 'flying-mob': { swoops: true } },
  },
  {
    id: 'through-walls',
    phrases: ['flies through walls', 'goes through walls', 'passes through blocks'],
    sentence: 'It flies through walls when it charges, as a vex does.',
    appliesTo: ['mob'],
    answers: { 'flying-mob': { flight: 'phase' } },
  },
  {
    id: 'floats',
    phrases: ['floats', 'hovers', 'floats like a ghast'],
    sentence: 'It floats above the ground, as a ghast does.',
    appliesTo: ['mob'],
    answers: { 'flying-mob': { flight: 'hover' } },
  },
  {
    id: 'dashes',
    phrases: ['dashes', 'dashes forward', 'charges forward'],
    sentence: 'Ridden, it dashes forward.',
    appliesTo: ['mob'],
    answers: { mount: { dashes: true } },
  },
  {
    id: 'carries-chest',
    phrases: ['carries a chest', 'carries items', 'is a pack animal'],
    sentence: 'It carries a chest.',
    appliesTo: ['mob'],
    answers: { mount: { carries_chest: true } },
  },
  {
    id: 'remembers',
    phrases: ['remembers you', 'remembers how you treat it', 'holds a grudge'],
    sentence: 'It remembers how you treat it.',
    appliesTo: ['mob'],
    answers: { 'wandering-merchant': { remembers: true } },
  },
  {
    id: 'keeps-contents',
    phrases: ['keeps its contents', 'keeps items when broken', 'keeps its items'],
    sentence: 'It keeps its contents when broken, as a shulker box does.',
    appliesTo: ['block'],
    answers: { 'storage-crate': { keep_contents: true } },
  },
  {
    id: 'per-player',
    phrases: ['is different for every player', 'is private', 'only you can open'],
    sentence: 'Every player sees their own contents.',
    appliesTo: ['block'],
    answers: { 'storage-crate': { per_player: true } },
  },
  {
    id: 'double-chest',
    phrases: ['joins into a double chest', 'makes a double chest'],
    sentence: 'Two side by side join into a double chest.',
    appliesTo: ['block'],
    answers: { 'storage-crate': { double: true } },
  },
  {
    id: 'faces-you',
    phrases: ['faces you', 'faces the player', 'turns to face you', 'rotates when placed'],
    sentence: 'It turns to face the player when placed.',
    appliesTo: ['block'],
    answers: { 'simple-block': { placement: 'horizontal' } },
  },
  {
    id: 'burns-fuel',
    phrases: ['burns fuel', 'runs on coal', 'needs fuel'],
    sentence: 'It burns fuel.',
    appliesTo: ['block', 'vehicle'],
    answers: {
      machine: { power: 'fuel' },
      'vehicle-car': { needs_fuel: true },
      'vehicle-tank': { needs_fuel: true },
      'vehicle-plane': { needs_fuel: true },
      'vehicle-boat': { needs_fuel: true },
    },
  },
  {
    id: 'redstone-powered',
    phrases: ['runs on redstone', 'is powered by redstone', 'needs a redstone signal'],
    sentence: 'It works while it has a redstone signal.',
    appliesTo: ['block'],
    answers: { machine: { power: 'redstone' } },
  },
  {
    id: 'like-lava',
    phrases: ['is like lava', 'burns like lava', 'is hot like lava'],
    sentence: 'It burns, glows and flows slowly, as lava does.',
    appliesTo: ['block'],
    answers: { fluid: { behaves_like: 'lava' } },
  },
  {
    id: 'heals-in-it',
    phrases: ['heals you in it', 'heals you when you swim in it', 'is healing'],
    sentence: 'Someone in it heals.',
    appliesTo: ['block'],
    answers: { fluid: { effect: 'minecraft:regeneration' } },
  },
  {
    id: 'comes-back',
    phrases: ['comes back', 'returns to you', 'comes back to you'],
    sentence: 'It comes back to your inventory when it lands, as a boomerang.',
    appliesTo: ['item'],
    answers: { throwable: { style: 'boomerang' } },
  },
  {
    id: 'explodes-thrown',
    phrases: ['explodes when thrown', 'explodes on impact', 'blows up when it lands'],
    sentence: 'It bursts where it lands, as a bomb.',
    appliesTo: ['item'],
    answers: { throwable: { style: 'bomb' } },
  },
  {
    id: 'launches-you',
    phrases: ['launches you up', 'launches you', 'throws you in the air', 'flings you up'],
    sentence: 'Used, it launches the player upward.',
    appliesTo: ['item'],
    answers: { 'scripted-item': { behaviour: 'launch' } },
  },
  {
    id: 'calls-lightning',
    phrases: [
      'calls lightning',
      'summons lightning',
      'shoots lightning',
      'strikes lightning',
      'strikes lightning where you look',
    ],
    sentence: 'Used, it strikes lightning where the player looks.',
    appliesTo: ['item'],
    answers: { 'scripted-item': { behaviour: 'lightning' } },
  },
  {
    id: 'heals-you',
    phrases: ['heals you', 'heals the player', 'restores health'],
    sentence: 'Used, it heals the player.',
    appliesTo: ['item'],
    answers: { 'scripted-item': { behaviour: 'heal' } },
  },
  {
    id: 'has-a-horn',
    phrases: ['has a horn', 'honks', 'beeps'],
    sentence: 'It has a horn.',
    appliesTo: ['vehicle'],
    answers: { 'vehicle-car': { horn: true }, 'vehicle-boat': { horn: true } },
  },
  {
    id: 'fires-shells',
    phrases: ['fires shells', 'has a cannon', 'shoots shells'],
    sentence: 'Its cannon fires exploding shells.',
    appliesTo: ['vehicle'],
    answers: { 'vehicle-tank': { cannon: true } },
  },
];

/** Every behaviour of the library (ADR 0124 D7). */
export const BEHAVIOURS: SearchBehaviour[] = [...ENCHANTMENTS, ...WEAR, ...FLOWS, ...ANSWERS];
