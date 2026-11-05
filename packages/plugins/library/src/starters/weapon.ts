/**
 * The Weapon starter and Creator flow (ADR 0044 D3, D6): one weapon of a chosen type. A sword,
 * spear or mace is an `msm:item` with `msm:tool` (a vanilla tier, optionally its own attack
 * damage and speed); a bow or crossbow has `msm:ranged_weapon` (draw speed, arrow velocity,
 * damage multiplier); a shield has `msm:shield` (block delay, damage blocked). Every weapon has
 * `msm:durability`, a model with a tinted placeholder texture of its type, an optional shaped
 * recipe from a vanilla ingot or gem, its English name and the `msm:mod` metadata; a sword
 * also joins `minecraft:swords` (spears, maces, bows, crossbows and shields get their
 * enchanting tags from the blocks and items lowering). Ids derive from `weapon_name`. New
 * items need the Fabric mod jar export (with `msm_runtime`).
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import type { PlaceholderPattern } from '../assets/png';
import {
  COLOURS,
  element,
  itemModel,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  rl,
  texture,
} from '../content/bundle';
import {
  articleFor,
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** A weapon type: its label, model parent, placeholder, recipe and what it is. */
interface WeaponType {
  value: 'sword' | 'spear' | 'mace' | 'bow' | 'crossbow' | 'shield';
  label: string;
  parent: string;
  /** The recipe pattern: `X` the ingredient, `#` a stick, `S` string, `T` a tripwire hook, `W` planks. */
  pattern: string[];
}

/** The weapon types, in the order the flow lists them. */
export const WEAPON_TYPES: readonly WeaponType[] = Object.freeze([
  { value: 'sword', label: 'Sword', parent: 'minecraft:item/handheld', pattern: ['X', 'X', '#'] },
  {
    value: 'spear',
    label: 'Spear',
    parent: 'minecraft:item/handheld',
    pattern: ['  X', ' # ', '#  '],
  },
  {
    value: 'mace',
    label: 'Mace',
    parent: 'minecraft:item/handheld_mace',
    pattern: ['XXX', 'XXX', ' # '],
  },
  { value: 'bow', label: 'Bow', parent: 'minecraft:item/bow', pattern: [' #S', 'X S', ' #S'] },
  {
    value: 'crossbow',
    label: 'Crossbow',
    parent: 'minecraft:item/crossbow',
    pattern: ['#X#', 'STS', ' # '],
  },
  {
    value: 'shield',
    label: 'Shield',
    parent: 'minecraft:item/generated',
    pattern: ['WXW', 'WWW', ' W '],
  },
]);

/** The recipe keys other than the ingredient. */
const KEYS: Readonly<Record<string, string>> = Object.freeze({
  '#': 'minecraft:stick',
  S: 'minecraft:string',
  T: 'minecraft:tripwire_hook',
  W: '#minecraft:planks',
});

/** The vanilla tool tiers a melee weapon can have. */
const TIERS: readonly { value: string; label: string }[] = [
  { value: 'wood', label: 'Wood' },
  { value: 'stone', label: 'Stone' },
  { value: 'copper', label: 'Copper' },
  { value: 'iron', label: 'Iron' },
  { value: 'gold', label: 'Gold' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'netherite', label: 'Netherite' },
];

/** The vanilla ingots and gems the optional recipe can use. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'No recipe' },
  { value: 'minecraft:emerald', label: 'Emerald' },
  { value: 'minecraft:diamond', label: 'Diamond' },
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
  { value: 'minecraft:quartz', label: 'Nether quartz' },
  { value: 'minecraft:copper_ingot', label: 'Copper ingot' },
  { value: 'minecraft:iron_ingot', label: 'Iron ingot' },
  { value: 'minecraft:gold_ingot', label: 'Gold ingot' },
  { value: 'minecraft:netherite_ingot', label: 'Netherite ingot' },
];

const MELEE_ONLY = 'Used for swords, spears and maces.';
const RANGED_ONLY = 'Used for bows and crossbows; 1 is vanilla.';
const SHIELD_ONLY = 'Used for shields.';

/** The Weapon flow's questions (ADR 0044 D6), groups "Weapon", "Stats", "Ranged", "Shield", "Recipe". */
export const WEAPON_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'weapon_name',
    label: 'Weapon name',
    description: 'The English name. Ids derive from it: Ruby Spear gives ruby_spear.',
    group: 'Weapon',
    type: 'string',
    default: 'Ruby Spear',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder texture.',
    group: 'Weapon',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'weapon_type',
    label: 'Type',
    group: 'Weapon',
    type: 'choice',
    default: 'spear',
    choices: WEAPON_TYPES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'tier',
    label: 'Material tier',
    description: `Damage, speed and enchantability of that vanilla material. ${MELEE_ONLY}`,
    group: 'Stats',
    type: 'choice',
    default: 'iron',
    choices: TIERS.map((entry) => ({ ...entry })),
  },
  {
    id: 'durability',
    label: 'Durability',
    description: 'Uses before the weapon breaks (iron sword 250, bow 384, shield 336).',
    group: 'Stats',
    type: 'number',
    default: 500,
    min: 1,
    max: 5000,
    step: 1,
  },
  {
    id: 'custom_damage',
    label: 'Set damage and speed yourself',
    description: `Otherwise the type and tier decide. ${MELEE_ONLY}`,
    group: 'Stats',
    type: 'boolean',
    default: false,
  },
  {
    id: 'attack_damage',
    label: 'Attack damage',
    description: 'The base damage before the tier bonus (a sword has 3). Used with the box above.',
    group: 'Stats',
    type: 'number',
    default: 4,
    min: 0,
    max: 30,
    step: 0.5,
  },
  {
    id: 'attack_speed',
    label: 'Attack speed',
    description:
      'Added to the player speed of 4 (a sword has -2.4, so 1.6 attacks a second). Used with the box above.',
    group: 'Stats',
    type: 'number',
    default: -2.4,
    min: -3.9,
    max: 0,
    step: 0.1,
  },
  {
    id: 'draw_speed',
    label: 'Draw speed',
    description: `How fast the weapon draws or charges. ${RANGED_ONLY}`,
    group: 'Ranged',
    type: 'number',
    default: 1.25,
    min: 0.5,
    max: 3,
    step: 0.05,
  },
  {
    id: 'velocity',
    label: 'Arrow speed',
    description: RANGED_ONLY,
    group: 'Ranged',
    type: 'number',
    default: 1.1,
    min: 0.5,
    max: 3,
    step: 0.05,
  },
  {
    id: 'damage_multiplier',
    label: 'Arrow damage multiplier',
    description: RANGED_ONLY,
    group: 'Ranged',
    type: 'number',
    default: 1.2,
    min: 0,
    max: 5,
    step: 0.1,
  },
  {
    id: 'block_delay',
    label: 'Seconds before blocking',
    description: `How long the shield is raised before it blocks (vanilla 0.25). ${SHIELD_ONLY}`,
    group: 'Shield',
    type: 'number',
    default: 0.25,
    min: 0,
    max: 2,
    step: 0.05,
  },
  {
    id: 'damage_reduction',
    label: 'Damage blocked',
    description: `From 0 to 1; 1 blocks everything, as the vanilla shield does. ${SHIELD_ONLY}`,
    group: 'Shield',
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description:
      'The material of the recipe, with sticks, string, a tripwire hook or planks as the vanilla weapon uses them.',
    group: 'Recipe',
    type: 'choice',
    default: 'minecraft:emerald',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
]);

/** A number rounded to two decimals, so float sliders give tidy JSON. */
const tidy = (value: number): number => Math.round(value * 100) / 100;

export function weaponBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(WEAPON_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'weapon_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const type =
    WEAPON_TYPES.find((entry) => entry.value === stringValue(values, 'weapon_type')) ??
    (WEAPON_TYPES[1] as WeaponType);
  const tier =
    TIERS.find((entry) => entry.value === stringValue(values, 'tier')) ??
    (TIERS[3] as (typeof TIERS)[number]);
  const durability = Math.round(numberValue(values, 'durability'));
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));

  const item = rl(namespace, name.id);
  const components: JsonObject = {};
  let notes: string;
  if (type.value === 'sword' || type.value === 'spear' || type.value === 'mace') {
    const tool: JsonObject = { type: type.value, tier: tier.value };
    const custom = booleanValue(values, 'custom_damage');
    if (custom) {
      tool.attack_damage = tidy(numberValue(values, 'attack_damage'));
      tool.attack_speed = tidy(numberValue(values, 'attack_speed'));
    }
    components['msm:tool'] = tool;
    const what =
      type.value === 'spear'
        ? "vanilla's spear attacks (a charged thrust and a jab)"
        : type.value === 'mace'
          ? "vanilla's mace smash attack, which hits harder the further its holder falls"
          : 'a sweeping sword attack';
    notes = `A ${type.label.toLowerCase()} of the ${tier.label.toLowerCase()} tier with ${what}. msm:tool takes the ${tier.label.toLowerCase()} material's damage bonus and enchantability${custom ? `; attack_damage ${tool.attack_damage} and attack_speed ${tool.attack_speed} replace the type's own numbers` : ''}. msm:durability gives it ${durability} uses.`;
  } else if (type.value === 'bow' || type.value === 'crossbow') {
    const ranged: JsonObject = {
      type: type.value,
      draw_speed: tidy(numberValue(values, 'draw_speed')),
      velocity: tidy(numberValue(values, 'velocity')),
      damage_multiplier: tidy(numberValue(values, 'damage_multiplier')),
    };
    components['msm:ranged_weapon'] = ranged;
    notes = `A ${type.label.toLowerCase()} that shoots vanilla arrows: msm:ranged_weapon ${type.value === 'bow' ? 'draws' : 'charges'} ${ranged.draw_speed} times as fast as vanilla, shoots arrows ${ranged.velocity} times as fast and multiplies their damage by ${ranged.damage_multiplier}. msm:durability gives it ${durability} uses; it takes ${type.label.toLowerCase()} enchantments.`;
  } else {
    const shield: JsonObject = {
      block_delay_seconds: tidy(numberValue(values, 'block_delay')),
      damage_reduction: tidy(numberValue(values, 'damage_reduction')),
    };
    components['msm:shield'] = shield;
    notes = `A shield: held up, msm:shield starts blocking after ${shield.block_delay_seconds} seconds and blocks ${Math.round(Number(shield.damage_reduction) * 100)} per cent of the damage. msm:durability gives it ${durability} uses. Its model is a flat item; vanilla's banner shield drawing is not reproduced.`;
  }
  components['msm:durability'] = { max: durability };

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(
      namespace,
      projectName,
      `Adds ${articleFor(name.lower)} ${name.lower}, a new ${type.label.toLowerCase()}.`,
    ),
    element(
      item,
      KINDS.item,
      {
        format: 1,
        model: rl(namespace, `item/${name.id}`),
        max_stack_size: 1,
        creative_tab: 'minecraft:combat',
        components,
      },
      notes,
    ),
    itemModel(
      namespace,
      name.id,
      type.parent,
      `An item model drawn from textures/item/${name.id}.png; its parent ${type.parent} sets how it is held. Paint over the placeholder to restyle it.`,
    ),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      { [`item.${namespace}.${name.id}`]: name.display },
      `The English name: item.${namespace}.${name.id} is its translation key.`,
    ),
  ];
  if (ingredient !== undefined && ingredient.value !== 'none') {
    const key: JsonObject = { X: ingredient.value };
    for (const symbol of Object.keys(KEYS).sort()) {
      if (type.pattern.some((row) => row.includes(symbol))) key[symbol] = KEYS[symbol] as string;
    }
    elements.push(
      element(
        rl(namespace, `${name.id}_from_${ingredient.value.slice('minecraft:'.length)}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'equipment',
          pattern: [...type.pattern],
          key,
          result: { id: item, count: 1 },
        },
        `A shaped ${type.label.toLowerCase()} recipe with ${ingredient.label.toLowerCase()} as the material${type.pattern.some((row) => /[#STW]/.test(row)) ? ' and the vanilla parts (sticks, string, a tripwire hook or planks)' : ''}. Element ids are unique across kinds, so the recipe has a name of its own.`,
      ),
    );
  }
  if (type.value === 'sword') {
    elements.push(
      element(
        'minecraft:swords',
        KINDS.tagItem,
        { values: [item] },
        `Adds the ${name.lower} to the vanilla tag #minecraft:swords, so sword enchantments apply to it. Vanilla swords stay in the tag: a tag file only adds unless it sets replace.`,
      ),
    );
  }
  return {
    elements,
    assets: [texture(namespace, `item/${name.id}`, type.value as PlaceholderPattern, colour)],
  };
}
