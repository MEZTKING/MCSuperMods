/**
 * The Enchantment starter and Creator flow (ADR 0044 D6): one `minecraft:enchantment` with an
 * English name, the items it goes on (a vanilla `enchantable` or base item tag), its highest
 * level, how often it is offered (weight and anvil cost), one effect from a fixed list (extra
 * damage, extra knockback, setting the target on fire, a mob effect on hit, extra durability,
 * faster mining), each with values that grow with the level, and an optional vanilla
 * exclusive set. It joins the vanilla enchantment tags that put it on the enchanting table and
 * in villager trades when asked. No runtime: it works in a data pack.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import { element, KINDS, PACK_NOTES, packElement, rl } from '../content/bundle';
import { EFFECT_CHOICES } from '../content/effects';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  stringValue,
} from '../content/parameters';

/** What the enchantment goes on: the vanilla item tag and the slots it works in. */
const TARGETS: readonly {
  value: string;
  label: string;
  items: string;
  slot: string;
  what: string;
}[] = [
  {
    value: 'swords',
    label: 'Swords',
    items: '#minecraft:swords',
    slot: 'mainhand',
    what: 'swords',
  },
  {
    value: 'bows',
    label: 'Bows',
    items: '#minecraft:enchantable/bow',
    slot: 'mainhand',
    what: 'bows',
  },
  {
    value: 'crossbows',
    label: 'Crossbows',
    items: '#minecraft:enchantable/crossbow',
    slot: 'mainhand',
    what: 'crossbows',
  },
  {
    value: 'armour',
    label: 'Armour',
    items: '#minecraft:enchantable/armor',
    slot: 'armor',
    what: 'armour',
  },
  {
    value: 'tools',
    label: 'Tools',
    items: '#minecraft:enchantable/mining',
    slot: 'mainhand',
    what: 'mining tools',
  },
  {
    value: 'everything',
    label: 'Everything that can break',
    items: '#minecraft:enchantable/durability',
    slot: 'any',
    what: 'every item with durability',
  },
];

/** How rare the enchantment is: the weight (how often it is offered) and the anvil cost. */
const RARITIES: readonly { value: string; label: string; weight: number; anvil: number }[] = [
  { value: 'common', label: 'Common', weight: 10, anvil: 1 },
  { value: 'uncommon', label: 'Uncommon', weight: 5, anvil: 2 },
  { value: 'rare', label: 'Rare', weight: 2, anvil: 4 },
  { value: 'very_rare', label: 'Very rare', weight: 1, anvil: 8 },
];

/** The effects the flow offers. */
const EFFECTS: readonly { value: string; label: string }[] = [
  { value: 'damage', label: 'Extra damage' },
  { value: 'knockback', label: 'Extra knockback' },
  { value: 'fire', label: 'Set the target on fire' },
  { value: 'mob_effect', label: 'Give the target a mob effect' },
  { value: 'durability', label: 'Extra durability' },
  { value: 'mining_speed', label: 'Faster mining' },
];

/** Vanilla exclusive sets: enchantments in the same set cannot be on one item. */
const EXCLUSIVE: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'damage', label: 'Damage (Sharpness, Smite, Bane of Arthropods)' },
  { value: 'armor', label: 'Protection (the four protections)' },
  { value: 'bow', label: 'Bow (Infinity, Mending)' },
  { value: 'crossbow', label: 'Crossbow (Multishot, Piercing)' },
  { value: 'mining', label: 'Mining (Fortune, Silk Touch)' },
  { value: 'boots', label: 'Boots (Depth Strider, Frost Walker)' },
];

/** The Enchantment flow's questions (ADR 0044 D6), groups "Enchantment", "Effect" and "Offering". */
export const ENCHANTMENT_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'enchantment_name',
    label: 'Enchantment name',
    description: 'The English name. Ids derive from it: Ruby Edge gives ruby_edge.',
    group: 'Enchantment',
    type: 'string',
    default: 'Ruby Edge',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'applies_to',
    label: 'Goes on',
    group: 'Enchantment',
    type: 'choice',
    default: 'swords',
    choices: TARGETS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'max_level',
    label: 'Highest level',
    description: 'Sharpness goes to 5, Fire Aspect to 2.',
    group: 'Enchantment',
    type: 'number',
    default: 3,
    min: 1,
    max: 5,
    step: 1,
  },
  {
    id: 'effect',
    label: 'What it does',
    description: 'Every effect grows with the level.',
    group: 'Effect',
    type: 'choice',
    default: 'damage',
    choices: EFFECTS.map((entry) => ({ ...entry })),
  },
  {
    id: 'hit_effect',
    label: 'Mob effect on hit',
    description: 'Used when What it does is a mob effect: a few seconds, longer at higher levels.',
    group: 'Effect',
    type: 'choice',
    default: 'minecraft:slowness',
    choices: EFFECT_CHOICES.map((entry) => ({ ...entry })),
  },
  {
    id: 'rarity',
    label: 'Rarity',
    description: 'Rarer enchantments are offered less often and cost more on an anvil.',
    group: 'Offering',
    type: 'choice',
    default: 'uncommon',
    choices: RARITIES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'exclusive_with',
    label: 'Cannot be combined with',
    group: 'Offering',
    type: 'choice',
    default: 'none',
    choices: EXCLUSIVE.map((entry) => ({ ...entry })),
  },
  {
    id: 'in_enchanting_table',
    label: 'Offered at the enchanting table',
    description: 'Also offered by librarians and found on loot; otherwise only /enchant gives it.',
    group: 'Offering',
    type: 'boolean',
    default: true,
  },
]);

/** A level-based value that starts at `base` and grows by `perLevel`. */
const linear = (base: number, perLevel: number): JsonObject => ({
  type: 'minecraft:linear',
  base,
  per_level_above_first: perLevel,
});

/** The `effects` of one effect choice, and a sentence saying what it does. */
function effectsOf(
  effect: string,
  hitEffect: { value: string; label: string },
  id: string,
): { effects: JsonObject; text: string } {
  switch (effect) {
    case 'knockback':
      return {
        effects: {
          'minecraft:knockback': [{ effect: { type: 'minecraft:add', value: linear(1, 1) } }],
        },
        text: 'minecraft:knockback adds one knockback level per enchantment level',
      };
    case 'fire':
      return {
        effects: {
          'minecraft:post_attack': [
            {
              enchanted: 'attacker',
              affected: 'victim',
              effect: { type: 'minecraft:ignite', duration: linear(4, 4) },
            },
          ],
        },
        text: 'minecraft:post_attack sets the target on fire for 4 seconds, 4 more per level',
      };
    case 'mob_effect':
      return {
        effects: {
          'minecraft:post_attack': [
            {
              enchanted: 'attacker',
              affected: 'victim',
              effect: {
                type: 'minecraft:apply_mob_effect',
                to_apply: hitEffect.value,
                min_duration: 3,
                max_duration: linear(3, 2),
                min_amplifier: 0,
                max_amplifier: linear(0, 1),
              },
            },
          ],
        },
        text: `minecraft:post_attack gives the target ${hitEffect.label.toLowerCase()} for 3 seconds or more, stronger and longer at higher levels`,
      };
    case 'durability':
      return {
        effects: {
          'minecraft:item_damage': [
            { effect: { type: 'minecraft:remove_binomial', chance: linear(0.25, 0.15) } },
          ],
        },
        text: 'minecraft:item_damage skips a quarter of the wear at level I, 15 per cent more per level',
      };
    case 'mining_speed':
      return {
        effects: {
          'minecraft:attributes': [
            {
              id: id.replace(':', ':enchantment.'),
              attribute: 'minecraft:mining_efficiency',
              amount: { type: 'minecraft:levels_squared', added: 1 },
              operation: 'add_value',
            },
          ],
        },
        text: 'minecraft:attributes adds mining efficiency like Efficiency (the level squared, plus one)',
      };
    default:
      return {
        effects: {
          'minecraft:damage': [{ effect: { type: 'minecraft:add', value: linear(1, 0.5) } }],
        },
        text: 'minecraft:damage adds 1 damage at level I and half a heart more per level',
      };
  }
}

export function enchantmentBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(ENCHANTMENT_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'enchantment_name'));
  const target =
    TARGETS.find((entry) => entry.value === stringValue(values, 'applies_to')) ??
    (TARGETS[0] as (typeof TARGETS)[number]);
  const rarity =
    RARITIES.find((entry) => entry.value === stringValue(values, 'rarity')) ??
    (RARITIES[1] as (typeof RARITIES)[number]);
  const maxLevel = Math.round(numberValue(values, 'max_level'));
  const hitEffect =
    EFFECT_CHOICES.find((entry) => entry.value === stringValue(values, 'hit_effect')) ??
    (EFFECT_CHOICES[16] as (typeof EFFECT_CHOICES)[number]);
  const exclusive = EXCLUSIVE.find(
    (entry) => entry.value === stringValue(values, 'exclusive_with'),
  );
  const offered = booleanValue(values, 'in_enchanting_table');

  const id = rl(namespace, name.id);
  const key = `enchantment.${namespace}.${name.id}`;
  const { effects, text } = effectsOf(stringValue(values, 'effect'), hitEffect, id);
  const data: JsonObject = {
    description: { translate: key },
    supported_items: target.items,
    weight: rarity.weight,
    max_level: maxLevel,
    min_cost: { base: 5, per_level_above_first: 8 },
    max_cost: { base: 25, per_level_above_first: 8 },
    anvil_cost: rarity.anvil,
    slots: [target.slot],
    effects,
  };
  if (exclusive !== undefined && exclusive.value !== 'none') {
    data.exclusive_set = `#minecraft:exclusive_set/${exclusive.value}`;
  }
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    element(
      id,
      KINDS.enchantment,
      data,
      `An enchantment for ${target.what} (supported_items ${target.items}), up to level ${maxLevel}: ${text}. weight ${rarity.weight} sets how often enchanting tables and loot offer it, min_cost and max_cost the enchanting levels it appears at, anvil_cost what combining it costs${data.exclusive_set === undefined ? '' : `; exclusive_set ${String(data.exclusive_set)} keeps it off items that already have one of those`}. Try /enchant @s ${id} ${maxLevel} with the item in hand.`,
    ),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      { [key]: name.display },
      `The English name shown in tooltips: ${key} is its translation key.`,
    ),
  ];
  if (offered) {
    for (const tag of ['in_enchanting_table', 'non_treasure', 'tradeable', 'on_random_loot']) {
      elements.push(
        element(
          `minecraft:${tag}`,
          KINDS.tagEnchantment,
          { values: [id] },
          `Adds ${name.display} to the vanilla enchantment tag #minecraft:${tag}${tag === 'in_enchanting_table' ? ', so the enchanting table offers it' : tag === 'non_treasure' ? ', so it counts as an ordinary (not treasure) enchantment' : tag === 'tradeable' ? ', so librarians can sell it' : ', so it appears on enchanted loot'}. Vanilla enchantments stay in the tag.`,
        ),
      );
    }
  }
  return { elements, assets: [] };
}
