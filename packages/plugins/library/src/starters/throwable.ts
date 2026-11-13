/**
 * The Throwable starter and Creator flow (ADR 0056 D8): one `msm:item` with `msm:throwable`
 * in one of four styles (a ball used up like a snowball, a knife dropped where it lands so it
 * can be picked up again, a boomerang that returns to the thrower's inventory, a bomb that
 * bursts), its damage, speed, gravity and whether the player holds use to throw; what happens
 * when it hits (nothing more, a vanilla effect on the mob hit, a knock into the air, a block
 * placed, or a burst); the stack size, a flat or handheld model with a placeholder texture
 * (`ball`, `knife` or `boomerang`), an optional shapeless recipe and the mod metadata. Ids
 * derive from `throwable_name`. New items need the Fabric mod jar export (with `msm_runtime`).
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
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
import { EFFECT_CHOICES } from '../content/effects';
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

/** One throwing style: what happens to the item, its picture, sound and recipe base. */
interface Style {
  value: string;
  label: string;
  afterThrow: 'consume' | 'drop' | 'return';
  pattern: PlaceholderPattern;
  parent: string;
  sound: string;
  base: { item: string; label: string };
  count: number;
}

/** The styles, in list order. */
const STYLES: readonly Style[] = [
  {
    value: 'ball',
    label: 'Ball, used up like a snowball',
    afterThrow: 'consume',
    pattern: 'ball',
    parent: 'minecraft:item/generated',
    sound: 'minecraft:entity.snowball.throw',
    base: { item: 'minecraft:snowball', label: 'a snowball' },
    count: 4,
  },
  {
    value: 'knife',
    label: 'Knife, left where it lands to pick up again',
    afterThrow: 'drop',
    pattern: 'knife',
    parent: 'minecraft:item/handheld',
    sound: 'minecraft:item.trident.throw',
    base: { item: 'minecraft:iron_ingot', label: 'an iron ingot' },
    count: 2,
  },
  {
    value: 'boomerang',
    label: 'Boomerang, back in your inventory when it lands',
    afterThrow: 'return',
    pattern: 'boomerang',
    parent: 'minecraft:item/handheld',
    sound: 'minecraft:item.trident.throw',
    base: { item: 'minecraft:stick', label: 'a stick' },
    count: 1,
  },
  {
    value: 'bomb',
    label: 'Bomb, used up and bursts where it lands',
    afterThrow: 'consume',
    pattern: 'ball',
    parent: 'minecraft:item/generated',
    sound: 'minecraft:entity.splash_potion.throw',
    base: { item: 'minecraft:gunpowder', label: 'gunpowder' },
    count: 2,
  },
];

/** Gravity in blocks per tick squared (a snowball's is 0.03). */
const GRAVITIES: Readonly<Record<string, number>> = Object.freeze({
  floaty: 0.01,
  normal: 0.03,
  heavy: 0.06,
});

/** What happens when it hits. */
const HITS: readonly { value: string; label: string }[] = [
  { value: 'nothing', label: 'Nothing more' },
  { value: 'effect', label: 'Gives the mob hit an effect' },
  { value: 'knock_up', label: 'Knocks the mob hit into the air' },
  { value: 'place_block', label: 'Places a block' },
  { value: 'burst', label: 'Bursts with a bang' },
];

/** The blocks a hit can place. */
const BLOCKS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:cobweb', label: 'Cobweb' },
  { value: 'minecraft:fire', label: 'Fire' },
  { value: 'minecraft:snow', label: 'Snow layer' },
  { value: 'minecraft:torch', label: 'Torch' },
];

/** The vanilla items the optional recipe can use. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'No recipe' },
  { value: 'minecraft:flint', label: 'Flint' },
  { value: 'minecraft:feather', label: 'Feather' },
  { value: 'minecraft:slime_ball', label: 'Slime ball' },
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
  { value: 'minecraft:redstone', label: 'Redstone dust' },
  { value: 'minecraft:blaze_powder', label: 'Blaze powder' },
  { value: 'minecraft:packed_ice', label: 'Packed ice' },
];

/** The Throwable flow's questions, groups "Item", "Throw", "Hit", "Recipe". */
export const THROWABLE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'throwable_name',
    label: 'Name',
    description: 'The English name. Ids derive from it: Ruby Knife gives ruby_knife.',
    group: 'Item',
    type: 'string',
    default: 'Ruby Knife',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder texture.',
    group: 'Item',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'style',
    label: 'Style',
    description:
      'What happens to the item once thrown. In flight it is drawn as its picture, facing you.',
    group: 'Item',
    type: 'choice',
    default: 'knife',
    choices: STYLES.map((entry) => ({ value: entry.value, label: entry.label })),
  },
  {
    id: 'stack_size',
    label: 'Stack size',
    description: 'How many fit in one inventory slot (snowballs stack to 16).',
    group: 'Item',
    type: 'number',
    default: 16,
    min: 1,
    max: 64,
    step: 1,
  },
  {
    id: 'damage',
    label: 'Damage',
    description: 'Damage to the mob hit, in half hearts; 0 for none (a snowball deals none).',
    group: 'Throw',
    type: 'number',
    default: 4,
    min: 0,
    max: 20,
    step: 0.5,
  },
  {
    id: 'speed',
    label: 'Speed',
    description: 'In blocks per tick: a snowball flies at 1.5, a trident at 2.5.',
    group: 'Throw',
    type: 'number',
    default: 1.5,
    min: 0.5,
    max: 4,
    step: 0.1,
  },
  {
    id: 'gravity',
    label: 'Weight',
    description: 'How fast it falls: normal is a snowball.',
    group: 'Throw',
    type: 'choice',
    default: 'normal',
    choices: [
      { value: 'floaty', label: 'Floaty' },
      { value: 'normal', label: 'Normal' },
      { value: 'heavy', label: 'Heavy' },
    ],
  },
  {
    id: 'hold_to_throw',
    label: 'Hold to throw',
    description: 'Hold use for half a second and let go to throw, like a trident.',
    group: 'Throw',
    type: 'boolean',
    default: false,
  },
  {
    id: 'on_hit',
    label: 'When it hits',
    description: 'A bomb bursts when this is Nothing more.',
    group: 'Hit',
    type: 'choice',
    default: 'nothing',
    choices: HITS.map((entry) => ({ ...entry })),
  },
  {
    id: 'hit_effect',
    label: 'Effect',
    description: 'Used when When it hits is Gives the mob hit an effect.',
    group: 'Hit',
    type: 'choice',
    default: 'minecraft:slowness',
    choices: EFFECT_CHOICES.map((entry) => ({ ...entry })),
  },
  {
    id: 'hit_effect_seconds',
    label: 'Effect: seconds',
    description: 'Used when When it hits is Gives the mob hit an effect.',
    group: 'Hit',
    type: 'number',
    default: 5,
    min: 1,
    max: 120,
    step: 1,
  },
  {
    id: 'hit_block',
    label: 'Block to place',
    description:
      'At the feet of the mob hit, or on top of the block hit. Used when When it hits is Places a block.',
    group: 'Hit',
    type: 'choice',
    default: 'minecraft:cobweb',
    choices: BLOCKS.map((entry) => ({ ...entry })),
  },
  {
    id: 'burst_damage',
    label: 'Burst damage',
    description:
      'Extra damage to the mob hit, in half hearts. Used when When it hits is Bursts with a bang.',
    group: 'Hit',
    type: 'number',
    default: 4,
    min: 0,
    max: 20,
    step: 0.5,
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description:
      'One of it with a snowball (ball), an iron ingot (knife), a stick (boomerang) or gunpowder (bomb) makes the item.',
    group: 'Recipe',
    type: 'choice',
    default: 'minecraft:flint',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
]);

/** `1 half heart`, `2.5 half hearts`. */
const halfHearts = (amount: number): string => `${amount} half heart${amount === 1 ? '' : 's'}`;

/** A number rounded to two decimals, so float sliders give tidy JSON. */
const tidy = (value: number): number => Math.round(value * 100) / 100;

export function throwableBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(THROWABLE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'throwable_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const style =
    STYLES.find((entry) => entry.value === stringValue(values, 'style')) ?? (STYLES[1] as Style);
  const stack = Math.round(numberValue(values, 'stack_size'));
  const damage = tidy(numberValue(values, 'damage'));
  const speed = tidy(numberValue(values, 'speed'));
  const gravityName = stringValue(values, 'gravity');
  const gravity = GRAVITIES[gravityName] ?? 0.03;
  const hold = booleanValue(values, 'hold_to_throw');
  const chosenHit =
    HITS.find((entry) => entry.value === stringValue(values, 'on_hit'))?.value ?? 'nothing';
  // A bomb always bursts unless another hit is chosen.
  const onHit = chosenHit === 'nothing' && style.value === 'bomb' ? 'burst' : chosenHit;
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));

  const item = rl(namespace, name.id);
  const hitEntity = rl(namespace, `${name.id}_hit`);
  const hitBlock = rl(namespace, `${name.id}_hit_block`);

  const throwable: JsonObject = { speed, gravity };
  if (damage > 0) throwable.damage = damage;
  if (hold) throwable.charge_ticks = 10;
  throwable.after_throw = style.afterThrow;
  throwable.sound = style.sound;

  const events: JsonObject = {};
  let hitWords = '';
  if (onHit === 'effect') {
    const effect =
      EFFECT_CHOICES.find((entry) => entry.value === stringValue(values, 'hit_effect')) ??
      (EFFECT_CHOICES[0] as { value: string; label: string });
    const seconds = Math.round(numberValue(values, 'hit_effect_seconds'));
    events[hitEntity] = {
      actions: [
        { type: 'apply_effect', effect: effect.value, seconds, target: 'other' },
        { type: 'spawn_particle', particle: 'minecraft:witch', count: 6, spread: 0.3 },
      ],
    };
    hitWords = ` Hitting a mob fires ${hitEntity}: apply_effect with target other gives the mob hit ${effect.label.toLowerCase()} for ${seconds} seconds (self would be the thrower).`;
  } else if (onHit === 'knock_up') {
    events[hitEntity] = {
      actions: [
        { type: 'launch', strength: 0.8, direction: 'up', target: 'other' },
        { type: 'play_sound', sound: 'minecraft:entity.wind_charge.wind_burst' },
      ],
    };
    hitWords = ` Hitting a mob fires ${hitEntity}: launch with target other knocks the mob hit into the air.`;
  } else if (onHit === 'place_block') {
    const block =
      BLOCKS.find((entry) => entry.value === stringValue(values, 'hit_block')) ??
      (BLOCKS[0] as { value: string; label: string });
    events[hitEntity] = { actions: [{ type: 'set_block_state', state: block.value }] };
    events[hitBlock] = {
      actions: [{ type: 'set_block_state', state: block.value, offset: [0, 1, 0] }],
    };
    hitWords = ` Hitting a mob fires ${hitEntity}, which places ${block.label.toLowerCase()} at its feet; hitting a block fires ${hitBlock}, which places it on top (offset [0, 1, 0]). set_block_state replaces whatever is there.`;
  } else if (onHit === 'burst') {
    const burstDamage = tidy(numberValue(values, 'burst_damage'));
    const bang = [
      { type: 'spawn_particle', particle: 'minecraft:explosion', count: 1 },
      { type: 'play_sound', sound: 'minecraft:entity.generic.explode', volume: 0.6 },
    ];
    events[hitEntity] = {
      actions: [
        ...(burstDamage > 0 ? [{ type: 'damage', amount: burstDamage, target: 'other' }] : []),
        ...bang,
      ],
    };
    events[hitBlock] = { actions: bang };
    hitWords = ` Hitting a mob fires ${hitEntity}${burstDamage > 0 ? `, whose damage action hurts the mob hit by ${halfHearts(burstDamage)} more,` : ''} with a bang; hitting a block fires ${hitBlock}, the bang alone. The bang breaks no blocks.`;
  }
  if (events[hitEntity] !== undefined) throwable.on_hit_entity = { event: hitEntity };
  if (events[hitBlock] !== undefined) throwable.on_hit_block = { event: hitBlock };

  const data: JsonObject = {
    format: 1,
    model: rl(namespace, `item/${name.id}`),
    display_name: name.display,
    max_stack_size: stack,
    creative_tab: 'minecraft:combat',
    components: { 'msm:throwable': throwable },
  };
  if (Object.keys(events).length > 0) data.events = events;

  const afterWords =
    style.afterThrow === 'consume'
      ? 'Each throw uses one item (after_throw consume).'
      : style.afterThrow === 'drop'
        ? 'It is left where it lands, to be picked up again (after_throw drop).'
        : "It goes back into the thrower's inventory when it lands, or drops at their feet when there is no room (after_throw return).";
  const itemNotes = `A throwable: msm:throwable throws it at ${speed} blocks per tick with gravity ${gravity}${hold ? ' once use is held for half a second (charge_ticks 10)' : ' at once on use'}${damage > 0 ? `, dealing ${halfHearts(damage)} to the mob hit` : ''}. ${afterWords}${hitWords} In flight it is drawn as its item picture.`;

  const elements = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${articleFor(name.lower)} ${name.lower} to throw.`),
    element(item, KINDS.item, data, itemNotes),
    itemModel(
      namespace,
      name.id,
      style.parent,
      `A ${style.parent.endsWith('handheld') ? 'handheld' : 'flat'} item model drawn from textures/item/${name.id}.png. Paint over the placeholder to restyle it.`,
    ),
  ];
  if (ingredient !== undefined && ingredient.value !== 'none') {
    const ingredientPath = ingredient.value.slice('minecraft:'.length);
    elements.push(
      element(
        rl(namespace, `${name.id}_from_${ingredientPath}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'equipment',
          ingredients: [ingredient.value, style.base.item],
          result: { id: item, count: style.count },
        },
        `${ingredient.label} and ${style.base.label} anywhere in the crafting grid make ${style.count === 1 ? `${articleFor(name.lower)} ${name.lower}` : `${style.count} ${name.plural}`}.`,
      ),
    );
  }
  return { elements, assets: [texture(namespace, `item/${name.id}`, style.pattern, colour)] };
}
