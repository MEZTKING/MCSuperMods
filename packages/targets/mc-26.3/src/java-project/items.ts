/**
 * Items: `ModItems.java` (registration as the runtime's `MsmRegistrar.registerItem`:
 * `new Item.Properties().setId(key).rarity(r)`, `stacksTo(n)` unless damageable, food,
 * tool through the vanilla `pickaxe/axe/shovel/hoe/sword(ToolMaterial, damage, speed)`
 * helpers with a `ToolMaterial` constant or a `<NAME>_MATERIAL` field for a custom material,
 * armour through `humanoidArmor(ArmorMaterial, ArmorType)` with an `ArmorMaterials` constant
 * or a `<NAME>_ARMOR` field (ADR 0042 D6), `enchantment_value: 0` as the runtime does (built
 * with 1, the `enchantable` component removed), durability after both; creative tabs) and one
 * `item/<Name>Item.java` per item with `msm:on_use`, mirroring `MsmItem.use`. Gear (ADR 0044,
 * as the runtime's `MsmRegistrar`): `msm:components` through the generated `VanillaComponents`
 * helper (applied first, so MSM's components win), `msm:consumable` as a vanilla `Consumable`
 * (`food(FoodProperties, Consumable)` with `msm:food`), `use_cooldown`, a delayed
 * `use_remainder`, spears (`spear(material, <vanilla constants>)`), maces (`MaceItem`), bows and
 * crossbows (`BowItem`/`CrossbowItem`, or a generated subclass mirroring `MsmBowItem` and
 * `MsmCrossbowItem` when a factor differs from 1), shields (`blocks_attacks`, delayed),
 * `death_protection`, horse and wolf armour. Throwables (ADR 0056 D7): an `item/<Name>Item`
 * subclass of the generated `item/ThrowableItem` (mirroring `MsmThrowableItem`) with the
 * settings of `msm:throwable`, `msm:on_use` and the hit events, registered with the dispenser
 * when `dispensable`. The item triggers of ADR 0061 D1 (`msm:on_hit` from `hurtEnemy`,
 * `msm:on_use_on_block` from `useOn`, `msm:while_held` and `msm:while_worn` from `inventoryTick`
 * with the shared `TickLimiter`) give the item its own class, as `MsmItem`'s shared handlers.
 * Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import {
  type Events,
  eventMethod,
  eventMethods,
  fireCall,
  noteActions,
  readEvents,
  ticksOf,
} from './actions';
import { RARITIES, tabLine } from './blocks';
import { classPath, type GenerationContext, packageOf } from './context';
import {
  identifierExpression,
  indent,
  JavaFile,
  javaFloat,
  javaInt,
  javaString,
  trimBlank,
} from './java';
import { className, constantName, NameTable, splitId } from './names';
import { checkFormat, type Reader, readDefinition } from './read';

const ITEM_KEYS = ['format', 'max_stack_size', 'rarity', 'creative_tab', 'components', 'events'];
const ITEM_COMPONENTS = [
  'msm:food',
  'msm:tool',
  'msm:armor',
  'msm:durability',
  'msm:on_use',
  'msm:consumable',
  'msm:ranged_weapon',
  'msm:shield',
  'msm:death_protection',
  'msm:throwable',
  'msm:on_hit',
  'msm:on_use_on_block',
  'msm:while_held',
  'msm:while_worn',
  'msm:components',
];

/** `msm:while_held` hands (`HeldHand`) and the slot test of each, as `MsmItem.inventoryTickWithEvent`. */
const HELD_HANDS: Readonly<Record<string, string>> = {
  main: 'slot == EquipmentSlot.MAINHAND',
  off: 'slot == EquipmentSlot.OFFHAND',
  either: '(slot == EquipmentSlot.MAINHAND || slot == EquipmentSlot.OFFHAND)',
};

/** The equipment slot an `msm:armor` piece is worn in (`MsmItem.wornSlot`). */
const WORN_SLOTS: Readonly<Record<string, string>> = {
  HELMET: 'HEAD',
  CHESTPLATE: 'CHEST',
  LEGGINGS: 'LEGS',
  BOOTS: 'FEET',
  HORSE: 'BODY',
  WOLF: 'BODY',
};

/** Components of which at most one may be on an item (the runtime then applies none). */
const EXCLUSIVE_COMPONENTS = ['msm:armor', 'msm:ranged_weapon', 'msm:shield', 'msm:tool'] as const;

/** `after_throw` values, each a `ThrowableItem.AfterThrow` constant. */
const AFTER_THROW = ['consume', 'keep', 'drop', 'return'] as const;

/** Tool types and the vanilla iron-tier base attack damage and speed of each (as the runtime). */
const TOOL_TYPES: Readonly<Record<string, [string, string, string]>> = {
  pickaxe: ['pickaxe', '1.0f', '-2.8f'],
  axe: ['axe', '6.0f', '-3.1f'],
  shovel: ['shovel', '1.5f', '-3.0f'],
  hoe: ['hoe', '-2.0f', '-1.0f'],
  sword: ['sword', '3.0f', '-2.4f'],
};

/** Tool types beyond the five above: spears and maces (ADR 0044 D3). */
const WEAPON_TOOL_TYPES = ['spear', 'mace'] as const;

/** Tool tiers, each a `ToolMaterial` constant. */
const TOOL_TIERS = ['wood', 'stone', 'copper', 'iron', 'diamond', 'gold', 'netherite'] as const;

/**
 * The nine floats vanilla passes to `Item.Properties.spear` per tier (the runtime's
 * `SPEAR_CONSTANTS`, read from `Items.<clinit>` of 26.3): attack duration (seconds), kinetic
 * damage multiplier, kinetic delay (seconds), dismount max duration and min speed, knockback max
 * duration and min speed, damage max duration and min relative speed. A custom material uses
 * iron's.
 */
const SPEAR_CONSTANTS: Readonly<Record<string, readonly string[]>> = {
  WOOD: ['0.65f', '0.7f', '0.75f', '5.0f', '14.0f', '10.0f', '5.1f', '15.0f', '4.6f'],
  STONE: ['0.75f', '0.82f', '0.7f', '4.5f', '13.0f', '9.0f', '5.1f', '13.75f', '4.6f'],
  COPPER: ['0.85f', '0.82f', '0.65f', '4.0f', '12.0f', '8.25f', '5.1f', '12.5f', '4.6f'],
  IRON: ['0.95f', '0.95f', '0.6f', '2.5f', '11.0f', '6.75f', '5.1f', '11.25f', '4.6f'],
  GOLD: ['0.95f', '0.7f', '0.7f', '3.5f', '13.0f', '8.5f', '5.1f', '13.75f', '4.6f'],
  DIAMOND: ['1.05f', '1.075f', '0.5f', '3.0f', '10.0f', '6.5f', '5.1f', '10.0f', '4.6f'],
  NETHERITE: ['1.15f', '1.2f', '0.4f', '2.5f', '9.0f', '5.5f', '5.1f', '8.75f', '4.6f'],
};

/** Humanoid armour slots, each an `ArmorType` constant. */
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'] as const;

/** Every armour slot: the humanoid ones, plus horse and wolf body armour (ADR 0044 D5). */
const ALL_ARMOR_SLOTS = [...ARMOR_SLOTS, 'horse', 'wolf'] as const;

/** Consume animations and the vanilla builder each starts from (as the runtime). */
const CONSUME_ANIMATIONS = ['eat', 'drink', 'none'] as const;

/** Vanilla armour materials, each an `ArmorMaterials` constant (as the runtime's names). */
const ARMOR_MATERIALS = [
  'leather',
  'copper',
  'chainmail',
  'iron',
  'gold',
  'diamond',
  'netherite',
  'turtle_scute',
  'armadillo_scute',
] as const;

/** A custom `ToolMaterial` (ADR 0042 D3); tags without the `#`. */
interface CustomToolMaterial {
  readonly incorrectBlocksForDrops: string;
  readonly durability: number;
  readonly speed: number;
  readonly attackDamageBonus: number;
  readonly enchantmentValue: number;
  readonly repairItems: string | undefined;
}

/** A custom `ArmorMaterial` (ADR 0042 D1); the tag without the `#`. */
interface CustomArmorMaterial {
  readonly durability: number;
  readonly defense: {
    helmet: number;
    chestplate: number;
    leggings: number;
    boots: number;
    /** Horse and wolf armour (ADR 0050 D4); the chestplate value when absent. */
    body?: number;
  };
  readonly enchantmentValue: number;
  readonly toughness: number;
  readonly knockbackResistance: number;
  readonly equipSound: string | undefined;
  readonly repairItems: string | undefined;
  readonly equipmentAsset: string;
}

interface ToolSpec {
  readonly type: string;
  /** A `ToolMaterial` constant name, or a custom material. */
  readonly tier: string | CustomToolMaterial;
  readonly attackDamage: number | undefined;
  readonly attackSpeed: number | undefined;
}

interface ArmorSpec {
  /** The slot in upper case: an `ArmorType` constant name, or `HORSE` or `WOLF`. */
  readonly slot: string;
  /** An `ArmorMaterials` constant name, or a custom material. */
  readonly material: string | CustomArmorMaterial;
}

/** One `ConsumeEffect` (ADR 0044 D2). */
interface EffectSpec {
  readonly effect: string;
  readonly ticks: number;
  readonly amplifier: number;
  readonly chance: number;
}

interface ConsumableSpec {
  /** `EAT`, `DRINK` or `NONE`. */
  readonly animation: string;
  readonly seconds: number;
  readonly effects: readonly EffectSpec[];
  readonly sound: string | undefined;
  readonly particles: boolean;
  readonly convertsTo: string | undefined;
  readonly cooldownSeconds: number | undefined;
}

interface RangedSpec {
  /** `bow` or `crossbow`. */
  readonly type: string;
  readonly drawSpeed: number;
  readonly velocity: number;
  readonly damageMultiplier: number;
  readonly inaccuracy: number;
}

interface ShieldSpec {
  readonly blockDelaySeconds: number;
  readonly damageReduction: number;
  readonly disableCooldownScale: number;
  /** The tag without the `#`. */
  readonly bypassedBy: string;
}

interface DeathProtectionSpec {
  readonly effects: readonly EffectSpec[];
  readonly clearEffects: boolean;
}

/** `msm:throwable` (ADR 0056 D1), with the runtime's defaults. */
export interface ThrowableSpec {
  readonly speed: number;
  readonly inaccuracy: number;
  readonly gravity: number;
  readonly damage: number;
  readonly chargeTicks: number;
  /** A `ThrowableItem.AfterThrow` constant. */
  readonly afterThrow: string;
  readonly cooldownTicks: number;
  readonly sound: string | undefined;
  readonly dispensable: boolean;
  /** Event method names. */
  readonly onHitEntity: string | undefined;
  readonly onHitBlock: string | undefined;
}

interface ItemSpec {
  readonly input: DefinitionInput;
  readonly maxStackSize: number;
  readonly rarity: string;
  readonly creativeTab: string | undefined;
  readonly food: { nutrition: number; saturation: number; canAlwaysEat: boolean } | undefined;
  readonly tool: ToolSpec | undefined;
  readonly armor: ArmorSpec | undefined;
  readonly durability: number | undefined;
  readonly onUse: { method: string; cooldown: number } | undefined;
  readonly events: Events;
  readonly consumable: ConsumableSpec | undefined;
  readonly ranged: RangedSpec | undefined;
  readonly shield: ShieldSpec | undefined;
  readonly deathProtection: DeathProtectionSpec | undefined;
  readonly throwable: ThrowableSpec | undefined;
  /** The `msm:components` object as compact JSON, or `undefined`. */
  readonly vanilla: string | undefined;
  /** The item triggers of ADR 0061 D1. */
  readonly triggers: ItemTriggers;
}

/** The item triggers of ADR 0061 D1, each with its event method. */
interface ItemTriggers {
  readonly onHit: string | undefined;
  readonly onUseOnBlock: { method: string; cooldown: number } | undefined;
  readonly whileHeld: { method: string; interval: number; hand: string } | undefined;
  readonly whileWorn: { method: string; interval: number } | undefined;
}

function hasTriggers(triggers: ItemTriggers): boolean {
  return (
    triggers.onHit !== undefined ||
    triggers.onUseOnBlock !== undefined ||
    triggers.whileHeld !== undefined ||
    triggers.whileWorn !== undefined
  );
}

/** An `interval_ticks` of a tick trigger: 20 by default, at least 5 (ADR 0061 D4). */
function intervalOf(reader: Reader): number {
  const interval = reader.integer('interval_ticks', 20);
  if (interval < 5) reader.fail('interval_ticks must be at least 5');
  return interval;
}

function readTriggers(components: Reader | undefined, events: Events): ItemTriggers {
  const onHit = components?.object('msm:on_hit');
  onHit?.onlyKeys(['event'], 'msm:on_hit field');
  const useOn = components?.object('msm:on_use_on_block');
  useOn?.onlyKeys(['event', 'cooldown_ticks'], 'msm:on_use_on_block field');
  const held = components?.object('msm:while_held');
  held?.onlyKeys(['event', 'interval_ticks', 'hand'], 'msm:while_held field');
  const worn = components?.object('msm:while_worn');
  worn?.onlyKeys(['event', 'interval_ticks'], 'msm:while_worn field');
  if (worn !== undefined && components?.has('msm:armor') !== true) {
    worn.fail(
      'msm:while_worn without msm:armor cannot be ejected (the runtime does not apply it: it fires in the armour slot)',
    );
  }
  const cooldown = useOn?.integer('cooldown_ticks', 0) ?? 0;
  if (cooldown < 0) useOn?.fail('cooldown_ticks must be at least 0');
  const hand = held?.string('hand', 'main') ?? 'main';
  if (!Object.hasOwn(HELD_HANDS, hand))
    held?.fail(`hand '${hand}' is not one of main, off, either`);
  return {
    onHit:
      onHit === undefined ? undefined : eventMethod(onHit, events, onHit.requiredString('event')),
    onUseOnBlock:
      useOn === undefined
        ? undefined
        : { method: eventMethod(useOn, events, useOn.requiredString('event')), cooldown },
    whileHeld:
      held === undefined
        ? undefined
        : {
            method: eventMethod(held, events, held.requiredString('event')),
            interval: intervalOf(held),
            hand,
          },
    whileWorn:
      worn === undefined
        ? undefined
        : {
            method: eventMethod(worn, events, worn.requiredString('event')),
            interval: intervalOf(worn),
          },
  };
}

function readItem(input: DefinitionInput): ItemSpec {
  const reader = readDefinition(input);
  reader.onlyKeys(ITEM_KEYS, 'top-level key');
  checkFormat(reader);
  const components = reader.object('components');
  components?.onlyKeys(ITEM_COMPONENTS, 'component');
  const throwable = components?.object('msm:throwable');
  // ADR 0061 D1: on_hit, while_held and while_worn may run with a mob as the actor.
  const actor = ['msm:on_hit', 'msm:while_held', 'msm:while_worn'].some(
    (name) => components?.has(name) === true,
  );
  const events = readEvents(
    reader,
    throwable !== undefined ? 'throwable' : actor ? 'actor_item' : 'item',
    actor,
  );
  const food = components?.object('msm:food');
  food?.onlyKeys(['nutrition', 'saturation', 'can_always_eat'], 'msm:food field');
  const tool = components?.object('msm:tool');
  tool?.onlyKeys(['type', 'tier', 'attack_damage', 'attack_speed'], 'msm:tool field');
  const armor = components?.object('msm:armor');
  armor?.onlyKeys(['slot', 'material'], 'msm:armor field');
  const exclusive = EXCLUSIVE_COMPONENTS.filter((name) => components?.has(name) === true);
  if (exclusive.length > 1) {
    reader.fail(
      `${exclusive.slice(0, 2).join(' and ')} on one item cannot be ejected (the runtime applies none of them)`,
    );
  }
  if (throwable !== undefined) {
    const clashing = ['msm:armor', 'msm:ranged_weapon', 'msm:shield', 'msm:consumable', 'msm:food'];
    const conflicts = clashing.filter((name) => components?.has(name) === true);
    if (components?.object('msm:tool')?.optionalString('type') === 'mace') {
      conflicts.push('msm:tool (mace)');
    }
    if (conflicts.length > 0) {
      reader.fail(
        `msm:throwable and ${conflicts.join(', ')} on one item cannot be ejected (the runtime applies none of them)`,
      );
    }
  }
  const consumable = components?.object('msm:consumable');
  const ranged = components?.object('msm:ranged_weapon');
  const shield = components?.object('msm:shield');
  const deathProtection = components?.object('msm:death_protection');
  const vanilla = components?.object('msm:components');
  const durability = components?.object('msm:durability');
  durability?.onlyKeys(['max'], 'msm:durability field');
  const onUse = components?.object('msm:on_use');
  onUse?.onlyKeys(['event', 'cooldown_ticks'], 'msm:on_use field');
  return {
    input,
    maxStackSize: reader.integer('max_stack_size', 64),
    rarity: reader.enumConstant('rarity', RARITIES, 'common'),
    creativeTab: reader.optionalString('creative_tab'),
    food:
      food === undefined
        ? undefined
        : {
            nutrition: food.requiredInteger('nutrition'),
            saturation: food.requiredNumber('saturation'),
            canAlwaysEat: food.boolean('can_always_eat', false),
          },
    tool: tool === undefined ? undefined : readTool(tool),
    armor: armor === undefined ? undefined : readArmor(armor),
    durability: durability?.requiredInteger('max'),
    onUse:
      onUse === undefined
        ? undefined
        : {
            method: eventMethod(onUse, events, onUse.requiredString('event')),
            cooldown: onUse.integer('cooldown_ticks', 0),
          },
    events,
    consumable: consumable === undefined ? undefined : readConsumable(consumable),
    ranged: ranged === undefined ? undefined : readRanged(ranged),
    shield: shield === undefined ? undefined : readShield(shield),
    deathProtection:
      deathProtection === undefined
        ? undefined
        : (() => {
            deathProtection.onlyKeys(['effects', 'clear_effects'], 'msm:death_protection field');
            if (!deathProtection.has('effects')) deathProtection.fail('effects is missing');
            return {
              effects: deathProtection.objects('effects').map(readEffect),
              clearEffects: deathProtection.boolean('clear_effects', false),
            };
          })(),
    throwable: throwable === undefined ? undefined : readThrowable(throwable, events),
    vanilla: vanilla === undefined ? undefined : JSON.stringify(vanilla.value),
    triggers: readTriggers(components, events),
  };
}

function readThrowable(throwable: Reader, events: Events): ThrowableSpec {
  throwable.onlyKeys(
    [
      'speed',
      'inaccuracy',
      'gravity',
      'damage',
      'charge_ticks',
      'after_throw',
      'cooldown_ticks',
      'sound',
      'dispensable',
      'on_hit_entity',
      'on_hit_block',
    ],
    'msm:throwable field',
  );
  const hit = (key: string): string | undefined => {
    const reader = throwable.object(key);
    if (reader === undefined) return undefined;
    reader.onlyKeys(['event'], `${key} field`);
    return eventMethod(reader, events, reader.requiredString('event'));
  };
  const chargeTicks = throwable.integer('charge_ticks', 0);
  if (chargeTicks < 0 || chargeTicks > 200) throwable.fail('charge_ticks must be 0 to 200');
  const cooldownTicks = throwable.integer('cooldown_ticks', 0);
  if (cooldownTicks < 0) throwable.fail('cooldown_ticks must be at least 0');
  return {
    speed: ranged(throwable, 'speed', 1.5, 0.1, 5),
    inaccuracy: ranged(throwable, 'inaccuracy', 1, 0, 10),
    gravity: ranged(throwable, 'gravity', 0.03, 0, 1),
    damage: ranged(throwable, 'damage', 0, 0),
    chargeTicks,
    afterThrow: throwable.enumConstant('after_throw', AFTER_THROW, 'consume'),
    cooldownTicks,
    sound: throwable.optionalString('sound'),
    dispensable: throwable.boolean('dispensable', true),
    onHitEntity: hit('on_hit_entity'),
    onHitBlock: hit('on_hit_block'),
  };
}

/** A number in `[min, max]` (or at least `min`), as the runtime's Codec ranges. */
function ranged(reader: Reader, key: string, fallback: number, min: number, max?: number): number {
  const value = reader.number(key, fallback);
  if (value < min || (max !== undefined && value > max)) {
    reader.fail(`${key} must be ${max === undefined ? `at least ${min}` : `${min} to ${max}`}`);
  }
  return value;
}

function readEffect(effect: Reader): EffectSpec {
  effect.onlyKeys(['effect', 'seconds', 'amplifier', 'chance'], 'effect field');
  if (!effect.has('seconds')) effect.fail('seconds is missing');
  const amplifier = effect.integer('amplifier', 0);
  if (amplifier < 0 || amplifier > 255) effect.fail('amplifier must be 0 to 255');
  return {
    effect: effect.requiredString('effect'),
    ticks: ticksOf(ranged(effect, 'seconds', 0, 0)),
    amplifier,
    chance: ranged(effect, 'chance', 1, 0, 1),
  };
}

function readConsumable(consumable: Reader): ConsumableSpec {
  consumable.onlyKeys(
    ['seconds', 'animation', 'effects', 'sound', 'particles', 'converts_to', 'cooldown_seconds'],
    'msm:consumable field',
  );
  if (!consumable.has('seconds')) consumable.fail('seconds is missing');
  if (!consumable.has('animation')) consumable.fail('animation is missing');
  return {
    animation: consumable.enumConstant('animation', CONSUME_ANIMATIONS, ''),
    seconds: ranged(consumable, 'seconds', 0, 0),
    effects: consumable.objects('effects').map(readEffect),
    sound: consumable.optionalString('sound'),
    particles: consumable.boolean('particles', true),
    convertsTo: consumable.optionalString('converts_to'),
    cooldownSeconds: consumable.has('cooldown_seconds')
      ? ranged(consumable, 'cooldown_seconds', 0, 0)
      : undefined,
  };
}

function readRanged(weapon: Reader): RangedSpec {
  weapon.onlyKeys(
    ['type', 'draw_speed', 'velocity', 'damage_multiplier', 'inaccuracy'],
    'msm:ranged_weapon field',
  );
  return {
    type: weapon.enumConstant('type', ['bow', 'crossbow'], '').toLowerCase(),
    drawSpeed: ranged(weapon, 'draw_speed', 1, 0.1, 10),
    velocity: ranged(weapon, 'velocity', 1, 0.1, 10),
    damageMultiplier: ranged(weapon, 'damage_multiplier', 1, 0, 10),
    inaccuracy: ranged(weapon, 'inaccuracy', 1, 0, 10),
  };
}

function readShield(shield: Reader): ShieldSpec {
  shield.onlyKeys(
    ['block_delay_seconds', 'damage_reduction', 'disable_cooldown_scale', 'bypassed_by'],
    'msm:shield field',
  );
  return {
    blockDelaySeconds: ranged(shield, 'block_delay_seconds', 0.25, 0),
    damageReduction: ranged(shield, 'damage_reduction', 1, 0, 1),
    disableCooldownScale: ranged(shield, 'disable_cooldown_scale', 1, 0),
    bypassedBy: shield.tag('bypassed_by') ?? 'minecraft:bypasses_shield',
  };
}

function readTool(tool: Reader): ToolSpec {
  const tier = tool.stringOrObject('tier');
  let spec: string | CustomToolMaterial;
  if (tier === undefined || typeof tier === 'string') {
    spec = tool.enumConstant('tier', TOOL_TIERS, '');
  } else {
    tier.onlyKeys(
      [
        'durability',
        'speed',
        'attack_damage_bonus',
        'enchantment_value',
        'incorrect_blocks_for_drops',
        'repair_items',
      ],
      'msm:tool tier field',
    );
    spec = {
      incorrectBlocksForDrops: tier.requiredTag('incorrect_blocks_for_drops'),
      durability: tier.requiredInteger('durability'),
      speed: tier.requiredNumber('speed'),
      attackDamageBonus: tier.requiredNumber('attack_damage_bonus'),
      enchantmentValue: tier.requiredInteger('enchantment_value'),
      repairItems: tier.tag('repair_items'),
    };
  }
  return {
    type: tool
      .enumConstant('type', [...Object.keys(TOOL_TYPES), ...WEAPON_TOOL_TYPES], '')
      .toLowerCase(),
    tier: spec,
    attackDamage: tool.optionalNumber('attack_damage'),
    attackSpeed: tool.optionalNumber('attack_speed'),
  };
}

function readArmor(armor: Reader): ArmorSpec {
  const slot = armor.enumConstant('slot', ALL_ARMOR_SLOTS, '');
  const material = armor.stringOrObject('material');
  if (material === undefined || typeof material === 'string') {
    return { slot, material: armor.enumConstant('material', ARMOR_MATERIALS, '') };
  }
  material.onlyKeys(
    [
      'durability',
      'defense',
      'enchantment_value',
      'toughness',
      'knockback_resistance',
      'equip_sound',
      'repair_items',
      'equipment_asset',
    ],
    'msm:armor material field',
  );
  const defense = material.requiredObject('defense');
  defense.onlyKeys([...ARMOR_SLOTS, 'body'], 'msm:armor defense field');
  const body = defense.optionalNumber('body');
  if (body !== undefined && !Number.isInteger(body)) defense.requiredInteger('body');
  return {
    slot,
    material: {
      durability: material.requiredInteger('durability'),
      defense: {
        helmet: defense.requiredInteger('helmet'),
        chestplate: defense.requiredInteger('chestplate'),
        leggings: defense.requiredInteger('leggings'),
        boots: defense.requiredInteger('boots'),
        ...(body === undefined ? {} : { body }),
      },
      enchantmentValue: material.requiredInteger('enchantment_value'),
      toughness: material.requiredNumber('toughness'),
      knockbackResistance: material.requiredNumber('knockback_resistance'),
      equipSound: material.optionalString('equip_sound'),
      repairItems: material.tag('repair_items'),
      equipmentAsset: material.requiredString('equipment_asset'),
    },
  };
}

/** `TagKey.create(Registries.<registry>, Identifier...)` for a tag id without the `#`. */
function tagExpression(file: JavaFile, registry: 'ITEM' | 'BLOCK', id: string): string {
  const tagKey = file.use('net.minecraft.tags.TagKey');
  const registries = file.use('net.minecraft.core.registries.Registries');
  return `${tagKey}.create(${registries}.${registry}, ${identifierExpression(file, id)})`;
}

/**
 * The repair tag of a custom material: `repair_items`, or the runtime's empty project-specific
 * tag `<namespace>:msm_repairs/<item path>` (nothing repairs the item).
 */
function repairTag(file: JavaFile, repairItems: string | undefined, itemId: string): string {
  if (repairItems !== undefined) return tagExpression(file, 'ITEM', repairItems);
  const { namespace, path } = splitId(itemId);
  return tagExpression(file, 'ITEM', `${namespace}:msm_repairs/${path}`);
}

/** The enchantment value argument: 0 ("not enchantable") is built as 1, as the runtime does. */
function enchantmentArgument(value: number): string {
  return value === 0
    ? '1, // enchantment_value 0: built with 1 (vanilla rejects 0), the enchantable component is removed'
    : `${javaInt(value)}, // enchantment value`;
}

/** The `private static final ToolMaterial <field>_MATERIAL` lines of a custom material. */
function toolMaterialField(
  file: JavaFile,
  field: string,
  material: CustomToolMaterial,
  itemId: string,
): string[] {
  const toolMaterial = file.use('net.minecraft.world.item.ToolMaterial');
  return [
    `/** The custom tool material of {@code ${itemId}}. */`,
    `private static final ${toolMaterial} ${field}_MATERIAL = new ${toolMaterial}(`,
    `        ${tagExpression(file, 'BLOCK', material.incorrectBlocksForDrops)}, // incorrect blocks for drops`,
    `        ${javaInt(material.durability)}, // durability`,
    `        ${javaFloat(material.speed)}, // mining speed`,
    `        ${javaFloat(material.attackDamageBonus)}, // attack damage bonus`,
    `        ${enchantmentArgument(material.enchantmentValue)}`,
    `        ${repairTag(file, material.repairItems, itemId)});`,
  ];
}

/** The `private static final ArmorMaterial <field>_ARMOR` lines of a custom material. */
function armorMaterialField(
  file: JavaFile,
  field: string,
  material: CustomArmorMaterial,
  itemId: string,
): string[] {
  const armorMaterial = file.use('net.minecraft.world.item.equipment.ArmorMaterial');
  const armorType = file.use('net.minecraft.world.item.equipment.ArmorType');
  const map = file.use('java.util.Map');
  const soundEvents = file.use('net.minecraft.sounds.SoundEvents');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const equipmentAssets = file.use('net.minecraft.world.item.equipment.EquipmentAssets');
  const { defense } = material;
  let sound = `${soundEvents}.ARMOR_EQUIP_GENERIC, // equip sound`;
  if (material.equipSound !== undefined) {
    const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
    const holder = file.use('net.minecraft.core.Holder');
    const soundEvent = file.use('net.minecraft.sounds.SoundEvent');
    sound = `${builtIn}.SOUND_EVENT.get(${identifierExpression(file, material.equipSound)}).<${holder}<${soundEvent}>>map(sound -> sound).orElse(${soundEvents}.ARMOR_EQUIP_GENERIC), // equip sound (an unknown id falls back to the generic one, as the runtime)`;
  }
  return [
    `/** The custom armour material of {@code ${itemId}}. */`,
    `private static final ${armorMaterial} ${field}_ARMOR = new ${armorMaterial}(`,
    `        ${javaInt(material.durability)}, // base durability; each slot multiplies it (helmet 11, chestplate 16, leggings 15, boots 13)`,
    `        ${map}.of(${armorType}.HELMET, ${javaInt(defense.helmet)}, ${armorType}.CHESTPLATE, ${javaInt(defense.chestplate)}, ${armorType}.LEGGINGS, ${javaInt(defense.leggings)}, ${armorType}.BOOTS, ${javaInt(defense.boots)}, ${armorType}.BODY, ${javaInt(defense.body ?? defense.chestplate)}), // defense (${defense.body === undefined ? 'BODY as the chestplate: horse and wolf armour' : 'BODY: horse and wolf armour'})`,
    `        ${enchantmentArgument(material.enchantmentValue)}`,
    `        ${sound}`,
    `        ${javaFloat(material.toughness)}, // toughness`,
    `        ${javaFloat(material.knockbackResistance)}, // knockback resistance`,
    `        ${repairTag(file, material.repairItems, itemId)}, // repair items`,
    `        ${resourceKey}.create(${equipmentAssets}.ROOT_ID, ${identifierExpression(file, material.equipmentAsset)}));`,
  ];
}

/** `RUBY_TONIC_2` to `rubyTonic2`: a method name prefix from a unique field name. */
function camelOf(field: string): string {
  const [first = '', ...rest] = field.toLowerCase().split('_');
  return first + rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

/** The shared private helpers of `ModItems` an item needs. */
interface Helpers {
  logger: boolean;
  applyEffects: boolean;
  useRemainder: boolean;
  blocksAttacks: boolean;
  attackAttributes: boolean;
}

/** The fully qualified base class of a gear item, or `undefined` for a plain `Item`. */
function gearBase(spec: ItemSpec): string | undefined {
  if (spec.ranged?.type === 'bow') return 'net.minecraft.world.item.BowItem';
  if (spec.ranged?.type === 'crossbow') return 'net.minecraft.world.item.CrossbowItem';
  if (spec.tool?.type === 'mace') return 'net.minecraft.world.item.MaceItem';
  return undefined;
}

/** Whether a ranged weapon changes vanilla's behaviour (any factor other than 1). */
function rangedChanges(ranged: RangedSpec | undefined): boolean {
  return (
    ranged !== undefined &&
    (ranged.drawSpeed !== 1 ||
      ranged.velocity !== 1 ||
      ranged.damageMultiplier !== 1 ||
      ranged.inaccuracy !== 1)
  );
}

/** The material expression of a tool, adding a custom material's field to `materials`. */
function toolMaterialExpression(
  file: JavaFile,
  tool: ToolSpec,
  field: string,
  itemId: string,
  materials: string[],
): string {
  if (typeof tool.tier === 'string') {
    return `${file.use('net.minecraft.world.item.ToolMaterial')}.${tool.tier}`;
  }
  materials.push(...toolMaterialField(file, field, tool.tier, itemId), '');
  return `${field}_MATERIAL`;
}

/**
 * The `Item.Properties` lines of a spear: vanilla's spear helper with the tier's constants;
 * `attack_speed` sets the attack duration (`1 / (attack_speed + 4)`, which must be above -4) and
 * `attack_damage` replaces the base 0 (the material's bonus is still added), as the runtime.
 */
function spearLines(
  spec: ItemSpec,
  tool: ToolSpec,
  material: string,
  field: string,
  materials: string[],
  helpers: Helpers,
): string[] {
  const k = SPEAR_CONSTANTS[typeof tool.tier === 'string' ? tool.tier : 'IRON'] as string[];
  let duration = k[0] as string;
  if (tool.attackSpeed !== undefined) {
    if (tool.attackSpeed <= -4) {
      readDefinition(spec.input).fail(
        `msm:tool: attack_speed of a spear must be above -4, got ${tool.attackSpeed}`,
      );
    }
    materials.push(
      `/** The attack duration of {@code ${spec.input.id}} in seconds, from attack_speed. */`,
      `private static final float ${field}_ATTACK_DURATION = 1.0f / (${javaFloat(tool.attackSpeed)} + 4.0f);`,
      '',
    );
    duration = `${field}_ATTACK_DURATION`;
  }
  const lines = [
    `        .spear(${material}, ${duration}, ${k.slice(1).join(', ')}) // vanilla's spear constants for the tier`,
  ];
  if (tool.attackDamage !== undefined) {
    helpers.attackAttributes = true;
    lines.push(
      `        .attributes(attackAttributes(${javaFloat(tool.attackDamage)} + ${material}.attackDamageBonus(), 1.0f / ${duration} - 4.0f)) // attack_damage overridden`,
    );
  }
  return lines;
}

/**
 * The `Item.Properties` lines of a mace as vanilla's: the tier's durability, repair items and
 * enchantment value, vanilla's mace tool rule and `weapon` component, attack 5 / -3.4 unless
 * overridden (no material damage bonus), as the runtime.
 */
function maceLines(file: JavaFile, tool: ToolSpec, material: string, helpers: Helpers): string[] {
  const dataComponents = file.use('net.minecraft.core.component.DataComponents');
  const mace = file.use('net.minecraft.world.item.MaceItem');
  const weapon = file.use('net.minecraft.world.item.component.Weapon');
  let attributes = `${mace}.createAttributes()`;
  if (tool.attackDamage !== undefined || tool.attackSpeed !== undefined) {
    helpers.attackAttributes = true;
    attributes = `attackAttributes(${javaFloat(tool.attackDamage ?? 5)}, ${javaFloat(tool.attackSpeed ?? -3.4)})`;
  }
  return [
    `        .durability(${material}.durability())`,
    `        .component(${dataComponents}.TOOL, ${mace}.createToolProperties())`,
    `        .repairable(${material}.repairItems())`,
    `        .attributes(${attributes})`,
    `        .enchantable(${material}.enchantmentValue())`,
    `        .component(${dataComponents}.WEAPON, new ${weapon}(1))`,
  ];
}

/** `applyEffects(...)` for one effect (a list of zero or one consume effects). */
function applyEffectsCall(
  file: JavaFile,
  itemId: string,
  component: string,
  effect: EffectSpec,
): string {
  return `applyEffects(${javaString(itemId)}, ${javaString(component)}, ${identifierExpression(file, effect.effect)}, ${javaInt(effect.ticks)}, ${javaInt(effect.amplifier)}, ${javaFloat(effect.chance)})`;
}

/** The private method building an item's `Consumable`, as the runtime's `consumable()`. */
function consumableMethod(
  file: JavaFile,
  name: string,
  itemId: string,
  consumable: ConsumableSpec,
  helpers: Helpers,
): string[] {
  const type = file.use('net.minecraft.world.item.component.Consumable');
  let start: string;
  if (consumable.animation === 'NONE') {
    const animation = file.use('net.minecraft.world.item.ItemUseAnimation');
    start = `${type}.builder().animation(${animation}.NONE)`;
  } else {
    const consumables = file.use('net.minecraft.world.item.component.Consumables');
    start = `${consumables}.${consumable.animation === 'EAT' ? 'defaultFood' : 'defaultDrink'}()`;
  }
  const body = [
    `${type}.Builder builder = ${start}`,
    `        .consumeSeconds(${javaFloat(consumable.seconds)})`,
    `        .hasConsumeParticles(${consumable.particles});`,
  ];
  if (consumable.sound !== undefined) {
    helpers.logger = true;
    const optional = file.use('java.util.Optional');
    const holder = file.use('net.minecraft.core.Holder');
    const soundEvent = file.use('net.minecraft.sounds.SoundEvent');
    const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
    body.push(
      `${optional}<${holder}.Reference<${soundEvent}>> sound = ${builtIn}.SOUND_EVENT.get(${identifierExpression(file, consumable.sound)});`,
      'if (sound.isPresent()) {',
      '    builder.sound(sound.get());',
      '} else {',
      `    LOGGER.warn("{}: msm:consumable: unknown sound {}; the default sound is used", ${javaString(itemId)}, ${javaString(consumable.sound)});`,
      '}',
    );
  }
  for (const effect of consumable.effects) {
    helpers.applyEffects = true;
    body.push(
      `${applyEffectsCall(file, itemId, 'msm:consumable', effect)}.forEach(builder::onConsume);`,
    );
  }
  body.push('return builder.build();');
  const base =
    consumable.animation === 'NONE'
      ? 'a builder with no animation'
      : `vanilla's ${consumable.animation === 'EAT' ? 'food' : 'drink'} defaults`;
  return [
    '',
    `/** The msm:consumable of {@code ${itemId}}, from ${base} (as msm_runtime). */`,
    `private static ${type} ${name}() {`,
    ...indent(body),
    '}',
  ];
}

/** The private method building an item's `DeathProtection`: clear first, then the effects. */
function deathProtectionMethod(
  file: JavaFile,
  name: string,
  itemId: string,
  protection: DeathProtectionSpec,
  helpers: Helpers,
): string[] {
  const type = file.use('net.minecraft.world.item.component.DeathProtection');
  const list = file.use('java.util.List');
  const arrayList = file.use('java.util.ArrayList');
  const consumeEffect = file.use('net.minecraft.world.item.consume_effects.ConsumeEffect');
  const body = [`${list}<${consumeEffect}> effects = new ${arrayList}<>();`];
  if (protection.clearEffects) {
    const clear = file.use(
      'net.minecraft.world.item.consume_effects.ClearAllStatusEffectsConsumeEffect',
    );
    body.push(`effects.add(new ${clear}()); // clear_effects, first (as the totem does)`);
  }
  for (const effect of protection.effects) {
    helpers.applyEffects = true;
    body.push(`effects.addAll(${applyEffectsCall(file, itemId, 'msm:death_protection', effect)});`);
  }
  body.push(`return new ${type}(${list}.copyOf(effects));`);
  return [
    '',
    `/** The msm:death_protection of {@code ${itemId}}. */`,
    `private static ${type} ${name}() {`,
    ...indent(body),
    '}',
  ];
}

/** The shared helpers, in a fixed order. */
function helperMethods(file: JavaFile, helpers: Helpers): string[] {
  const out: string[] = [];
  const optional = () => file.use('java.util.Optional');
  const holder = () => file.use('net.minecraft.core.Holder');
  const builtIn = () => file.use('net.minecraft.core.registries.BuiltInRegistries');
  const identifier = () => file.use('net.minecraft.resources.Identifier');
  const list = () => file.use('java.util.List');
  if (helpers.applyEffects) {
    const consumeEffect = file.use('net.minecraft.world.item.consume_effects.ConsumeEffect');
    const mobEffect = file.use('net.minecraft.world.effect.MobEffect');
    const instance = file.use('net.minecraft.world.effect.MobEffectInstance');
    const apply = file.use(
      'net.minecraft.world.item.consume_effects.ApplyStatusEffectsConsumeEffect',
    );
    out.push(
      '',
      '/** One mob effect as an apply_effects consume effect, or none when the effect is unknown (logged and skipped, as msm_runtime). */',
      `private static ${list()}<${consumeEffect}> applyEffects(String owner, String component, ${identifier()} id, int ticks, int amplifier, float chance) {`,
      `    ${optional()}<${holder()}.Reference<${mobEffect}>> effect = ${builtIn()}.MOB_EFFECT.get(id);`,
      '    if (effect.isEmpty()) {',
      '        LOGGER.error("{}: {}: unknown mob effect {}; the effect is skipped", owner, component, id);',
      `        return ${list()}.of();`,
      '    }',
      `    return ${list()}.of(new ${apply}(new ${instance}(effect.get(), ticks, amplifier), chance));`,
      '}',
    );
  }
  if (helpers.useRemainder) {
    const useRemainder = file.use('net.minecraft.world.item.component.UseRemainder');
    const template = file.use('net.minecraft.world.item.ItemStackTemplate');
    const items = file.use('net.minecraft.world.item.Items');
    const item = file.use('net.minecraft.world.item.Item');
    out.push(
      '',
      '/** converts_to as use_remainder, looked up once registries are complete; an unknown item leaves nothing over. */',
      `private static ${useRemainder} useRemainder(String owner, ${identifier()} id) {`,
      `    ${optional()}<${item}> item = ${builtIn()}.ITEM.getOptional(id);`,
      `    if (item.isEmpty() || item.get() == ${items}.AIR) {`,
      '        LOGGER.error("{}: msm:consumable: unknown converts_to item {}; nothing is left over", owner, id);',
      '        return null;',
      '    }',
      `    return new ${useRemainder}(new ${template}(item.get()));`,
      '}',
    );
  }
  if (helpers.blocksAttacks) {
    const blocksAttacks = file.use('net.minecraft.world.item.component.BlocksAttacks');
    const provider = file.use('net.minecraft.core.HolderLookup', 'Provider');
    const tagKey = file.use('net.minecraft.tags.TagKey');
    const damageType = file.use('net.minecraft.world.damagesource.DamageType');
    const registries = file.use('net.minecraft.core.registries.Registries');
    const holderSet = file.use('net.minecraft.core.HolderSet');
    const soundEvent = file.use('net.minecraft.sounds.SoundEvent');
    const soundEvents = file.use('net.minecraft.sounds.SoundEvents');
    out.push(
      '',
      "/** msm:shield's blocks_attacks as msm_runtime builds it once data packs are loaded (bypassed_by is a damage type tag). */",
      `private static ${blocksAttacks} blocksAttacks(${provider} provider, String owner, float blockDelaySeconds, float disableCooldownScale, float damageReduction, ${identifier()} bypassedBy) {`,
      `    ${tagKey}<${damageType}> bypass = ${tagKey}.create(${registries}.DAMAGE_TYPE, bypassedBy);`,
      `    ${optional()}<${holderSet}<${damageType}>> bypassing = provider.lookupOrThrow(${registries}.DAMAGE_TYPE).get(bypass)`,
      `            .map(set -> (${holderSet}<${damageType}>) set);`,
      '    if (bypassing.isEmpty()) {',
      '        LOGGER.warn("{}: msm:shield: unknown damage type tag #{}; nothing bypasses the block", owner, bypassedBy);',
      '    }',
      `    ${holder()}<${soundEvent}> blockSound = ${soundEvents}.SHIELD_BLOCK;`,
      `    ${holder()}<${soundEvent}> breakSound = ${soundEvents}.SHIELD_BREAK;`,
      `    return new ${blocksAttacks}(blockDelaySeconds, disableCooldownScale,`,
      `            ${list()}.of(new ${blocksAttacks}.DamageReduction(90.0f, ${optional()}.empty(), 0.0f, damageReduction)),`,
      `            new ${blocksAttacks}.ItemDamageFunction(3.0f, 1.0f, 1.0f), bypassing, ${optional()}.of(blockSound),`,
      `            ${optional()}.of(breakSound));`,
      '}',
    );
  }
  if (helpers.attackAttributes) {
    const modifiers = file.use('net.minecraft.world.item.component.ItemAttributeModifiers');
    const attributes = file.use('net.minecraft.world.entity.ai.attributes.Attributes');
    const modifier = file.use('net.minecraft.world.entity.ai.attributes.AttributeModifier');
    const group = file.use('net.minecraft.world.entity.EquipmentSlotGroup');
    const item = file.use('net.minecraft.world.item.Item');
    out.push(
      '',
      "/** Main-hand attack damage and speed modifiers with vanilla's base modifier ids. */",
      `private static ${modifiers} attackAttributes(float damage, float speed) {`,
      `    return ${modifiers}.builder()`,
      `            .add(${attributes}.ATTACK_DAMAGE, new ${modifier}(${item}.BASE_ATTACK_DAMAGE_ID, damage, ${modifier}.Operation.ADD_VALUE),`,
      `                    ${group}.MAINHAND)`,
      `            .add(${attributes}.ATTACK_SPEED, new ${modifier}(${item}.BASE_ATTACK_SPEED_ID, speed, ${modifier}.Operation.ADD_VALUE),`,
      `                    ${group}.MAINHAND)`,
      '            .build();',
      '}',
    );
  }
  return out;
}

/**
 * Generates `ModItems.java` and the item classes; returns nothing when there are no items.
 *
 * @returns The simple name of the registration class, or `undefined`.
 */
export function generateItems(
  context: GenerationContext,
  classNames: NameTable,
): string | undefined {
  const { items } = context.input;
  if (items.length === 0) return undefined;
  const specs = items.map(readItem);
  const fields = new NameTable();
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/item/*.json definitions',
  );
  const registry = file.use('net.minecraft.core.Registry');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const registries = file.use('net.minecraft.core.registries.Registries');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const itemType = file.use('net.minecraft.world.item.Item');
  const rarity = file.use('net.minecraft.world.item.Rarity');
  const helpers: Helpers = {
    logger: false,
    applyEffects: false,
    useRemainder: false,
    blocksAttacks: false,
    attackAttributes: false,
  };

  const body: string[] = [];
  const methods: string[] = [];
  const tabs: string[] = [];
  const dispensers: string[] = [];
  for (const spec of specs) {
    const { path } = splitId(spec.input.id);
    const id = spec.input.id;
    const field = fields.take(constantName(path), (name) => [
      name,
      `${name}_KEY`,
      `${name}_MATERIAL`,
      `${name}_ARMOR`,
      `${name}_COMPONENTS`,
      `${name}_ATTACK_DURATION`,
    ]);
    const camel = camelOf(field);
    const materials: string[] = [];
    const base = gearBase(spec);
    let type: string;
    if (spec.throwable !== undefined) {
      const name = classNames.take(className(path, 'Item'), (n) => [`item.${n}`], '');
      writeThrowableItemClass(context, spec, spec.throwable, name);
      type = file.use(`${packageOf(context, 'item')}.${name}`);
      if (spec.throwable.dispensable) {
        const dispenser = file.use('net.minecraft.world.level.block.DispenserBlock');
        dispensers.push(
          `${dispenser}.registerProjectileBehavior(${field}); // dispensable: thrown through ProjectileItem`,
        );
      }
    } else if (
      spec.onUse !== undefined ||
      rangedChanges(spec.ranged) ||
      hasTriggers(spec.triggers)
    ) {
      const name = classNames.take(className(path, 'Item'), (n) => [`item.${n}`], '');
      writeItemClass(context, spec, name, base ?? 'net.minecraft.world.item.Item');
      type = file.use(`${packageOf(context, 'item')}.${name}`);
    } else {
      type = base === undefined ? itemType : file.use(base);
    }
    let open = `new ${itemType}.Properties()`;
    const props = [`        .setId(${field}_KEY)`, `        .rarity(${rarity}.${spec.rarity})`];
    if (spec.vanilla !== undefined) {
      // msm:components first, so MSM's own components below win (as the runtime).
      context.usesVanillaComponents = true;
      const helper = file.use(`${context.input.javaPackage}.VanillaComponents`);
      materials.push(
        `/** The msm:components of {@code ${id}}: vanilla data components as JSON. */`,
        `private static final String ${field}_COMPONENTS = ${javaString(spec.vanilla)};`,
        '',
      );
      open = `${helper}.apply(new ${itemType}.Properties()`;
      props[1] = `${props[1]}, ${javaString(id)}, ${field}_COMPONENTS)`;
    }
    const damageable =
      spec.tool !== undefined ||
      spec.armor !== undefined ||
      spec.durability !== undefined ||
      spec.ranged !== undefined ||
      spec.shield !== undefined;
    if (damageable) {
      if (spec.input.definition.max_stack_size !== undefined && spec.maxStackSize !== 1) {
        props.push(
          `        // max_stack_size ${spec.maxStackSize} ignored: tools, armour and items with durability stack to 1.`,
        );
      }
    } else {
      props.push(`        .stacksTo(${javaInt(spec.maxStackSize)})`);
    }
    let consumable: string | undefined;
    if (spec.consumable !== undefined) {
      consumable = `${camel}Consumable`;
      methods.push(...consumableMethod(file, consumable, id, spec.consumable, helpers));
    }
    if (spec.food !== undefined) {
      const foodProperties = file.use('net.minecraft.world.food.FoodProperties');
      props.push(
        `        .food(new ${foodProperties}.Builder()`,
        `                .nutrition(${javaInt(spec.food.nutrition)})`,
        `                .saturationModifier(${javaFloat(spec.food.saturation)})`,
      );
      if (spec.food.canAlwaysEat) props.push('                .alwaysEdible()');
      props.push(
        consumable === undefined
          ? '                .build())'
          : `                .build(), ${consumable}())`,
      );
    } else if (consumable !== undefined) {
      const dataComponents = file.use('net.minecraft.core.component.DataComponents');
      props.push(`        .component(${dataComponents}.CONSUMABLE, ${consumable}())`);
    }
    if (spec.consumable !== undefined) {
      const { cooldownSeconds, convertsTo } = spec.consumable;
      if (cooldownSeconds !== undefined && cooldownSeconds > 0) {
        props.push(`        .useCooldown(${javaFloat(cooldownSeconds)}) // cooldown_seconds`);
      }
      if (convertsTo !== undefined) {
        helpers.useRemainder = true;
        helpers.logger = true;
        const dataComponents = file.use('net.minecraft.core.component.DataComponents');
        props.push(
          `        .delayedComponent(${dataComponents}.USE_REMAINDER, provider -> useRemainder(${javaString(id)}, ${identifierExpression(file, convertsTo)})) // converts_to`,
        );
      }
    }
    let notEnchantable = false;
    if (spec.tool !== undefined) {
      const { tool } = spec;
      const material = toolMaterialExpression(file, tool, field, id, materials);
      if (typeof tool.tier !== 'string') notEnchantable = tool.tier.enchantmentValue === 0;
      if (tool.type === 'spear') {
        props.push(...spearLines(spec, tool, material, field, materials, helpers));
      } else if (tool.type === 'mace') {
        props.push(...maceLines(file, tool, material, helpers));
      } else {
        const [method, baseDamage, baseSpeed] = TOOL_TYPES[tool.type] as [string, string, string];
        const damage = tool.attackDamage === undefined ? baseDamage : javaFloat(tool.attackDamage);
        const speed = tool.attackSpeed === undefined ? baseSpeed : javaFloat(tool.attackSpeed);
        const overrides = [
          tool.attackDamage === undefined ? undefined : 'attack_damage',
          tool.attackSpeed === undefined ? undefined : 'attack_speed',
        ].filter((name) => name !== undefined);
        const note = overrides.length === 0 ? '' : ` // ${overrides.join(' and ')} overridden`;
        props.push(`        .${method}(${material}, ${damage}, ${speed})${note}`);
      }
    }
    if (spec.armor !== undefined) {
      const { armor } = spec;
      let material: string;
      if (typeof armor.material === 'string') {
        material = `${file.use('net.minecraft.world.item.equipment.ArmorMaterials')}.${armor.material}`;
      } else {
        materials.push(...armorMaterialField(file, field, armor.material, id), '');
        material = `${field}_ARMOR`;
        notEnchantable = armor.material.enchantmentValue === 0;
      }
      if (armor.slot === 'HORSE') {
        props.push(`        .horseArmor(${material})`);
      } else if (armor.slot === 'WOLF') {
        props.push(`        .wolfArmor(${material})`);
      } else {
        const armorType = file.use('net.minecraft.world.item.equipment.ArmorType');
        props.push(`        .humanoidArmor(${material}, ${armorType}.${armor.slot})`);
      }
    }
    if (notEnchantable) {
      const dataComponents = file.use('net.minecraft.core.component.DataComponents');
      props.push(
        `        .component(${dataComponents}.ENCHANTABLE, null) // enchantment_value 0: not enchantable`,
      );
    }
    if (spec.ranged !== undefined) {
      if (spec.ranged.type === 'bow') {
        props.push("        .durability(384) // vanilla's bow", '        .enchantable(1)');
      } else {
        const dataComponents = file.use('net.minecraft.core.component.DataComponents');
        const charged = file.use('net.minecraft.world.item.component.ChargedProjectiles');
        props.push(
          "        .durability(465) // vanilla's crossbow",
          '        .enchantable(1)',
          `        .component(${dataComponents}.CHARGED_PROJECTILES, ${charged}.EMPTY)`,
        );
      }
    }
    if (spec.shield !== undefined) {
      const { shield } = spec;
      helpers.blocksAttacks = true;
      helpers.logger = true;
      const dataComponents = file.use('net.minecraft.core.component.DataComponents');
      const slot = file.use('net.minecraft.world.entity.EquipmentSlot');
      const soundEvents = file.use('net.minecraft.sounds.SoundEvents');
      props.push(
        "        .durability(336) // vanilla's shield",
        '        .enchantable(1)',
        `        .equippableUnswappable(${slot}.OFFHAND)`,
        `        .component(${dataComponents}.BREAK_SOUND, ${soundEvents}.SHIELD_BREAK)`,
        `        .delayedComponent(${dataComponents}.BLOCKS_ATTACKS, provider -> blocksAttacks(provider, ${javaString(id)}, ${javaFloat(shield.blockDelaySeconds)}, ${javaFloat(shield.disableCooldownScale)}, ${javaFloat(shield.damageReduction)}, ${identifierExpression(file, shield.bypassedBy)}))`,
      );
    }
    if (spec.deathProtection !== undefined) {
      const name = `${camel}DeathProtection`;
      methods.push(...deathProtectionMethod(file, name, id, spec.deathProtection, helpers));
      const dataComponents = file.use('net.minecraft.core.component.DataComponents');
      props.push(`        .component(${dataComponents}.DEATH_PROTECTION, ${name}())`);
    }
    if (spec.durability !== undefined) {
      const note =
        spec.armor !== undefined
          ? "after the armour: overrides the material's per-slot durability"
          : spec.ranged !== undefined || spec.shield !== undefined
            ? "after the others: overrides vanilla's durability"
            : "after the tool: overrides the tier's durability";
      props.push(`        .durability(${javaInt(spec.durability)}) // ${note}`);
    }
    const last = props.length - 1;
    props[last] = closeLine(props[last] as string, '));');
    body.push(
      '',
      ...materials,
      `/** {@code ${id}} (${spec.input.path}). */`,
      `public static final ${resourceKey}<${itemType}> ${field}_KEY = ${resourceKey}.create(${registries}.ITEM, ${identifierExpression(file, id)});`,
      `public static final ${type} ${field} = ${registry}.register(${builtIn}.ITEM, ${field}_KEY, new ${type}(${open}`,
      ...props,
    );
    if (spec.creativeTab !== undefined) tabs.push(tabLine(file, spec.creativeTab, field));
  }
  const shared = helperMethods(file, helpers);
  const logger: string[] = [];
  if (helpers.logger || helpers.applyEffects) {
    const loggerType = file.use('org.slf4j.Logger');
    const loggerFactory = file.use('org.slf4j.LoggerFactory');
    logger.push(
      '/** Declared first: the item fields below log through it while the class loads. */',
      `private static final ${loggerType} LOGGER = ${loggerFactory}.getLogger(${javaString(context.input.modId)});`,
    );
  }
  const lines = [
    '/** The items, registered when the class loads. */',
    'public final class ModItems {',
    ...indent(trimBlank([...logger, ...body])),
    '',
    '    private ModItems() {}',
    '',
    `    /** Loads the class (registering every item) and adds the items to their creative tabs${dispensers.length > 0 ? '; dispensers throw the dispensable throwables' : ''}. */`,
    '    public static void register() {',
    ...indent([...tabs, ...dispensers], 2),
    '    }',
    ...indent([...methods, ...shared]),
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModItems'), contents: file.render(lines) });
  return 'ModItems';
}

/** Appends `suffix` to a line, before a trailing `//` comment when there is one. */
export function closeLine(line: string, suffix: string): string {
  const comment = line.indexOf(' // ');
  if (line.trimStart().startsWith('//')) return line; // a comment-only line cannot close
  return comment < 0
    ? `${line}${suffix}`
    : `${line.slice(0, comment)}${suffix}${line.slice(comment)}`;
}

/**
 * An item class: `msm:on_use` mirroring `MsmItem.use` (shared by `MsmBowItem`,
 * `MsmCrossbowItem` and `MsmMaceItem`), and for bows and crossbows the factors of
 * `msm:ranged_weapon` as `MsmBowItem` and `MsmCrossbowItem` apply them.
 *
 * @param base - The fully qualified superclass (`Item`, `BowItem`, `CrossbowItem`, `MaceItem`).
 */
function writeItemClass(
  context: GenerationContext,
  spec: ItemSpec,
  name: string,
  base: string,
): void {
  const file = new JavaFile(packageOf(context, 'item'), spec.input.path);
  const superType = file.use(base);
  const itemType = file.use('net.minecraft.world.item.Item');
  const members: string[] = [];
  const hasEvents = spec.onUse !== undefined || hasTriggers(spec.triggers);
  if (hasEvents) {
    members.push(`private static final String OWNER = ${javaString(spec.input.id)};`, '');
  }
  const { ranged } = spec;
  if (ranged !== undefined && ranged.drawSpeed !== 1) {
    members.push(
      `/** draw_speed: the ticks drawn count ${ranged.drawSpeed} times before vanilla reads them. */`,
      `private static final float DRAW_SPEED = ${javaFloat(ranged.drawSpeed)};`,
      '',
    );
  }
  members.push(
    `public ${name}(${itemType}.Properties properties) {`,
    '    super(properties);',
    '}',
  );
  if (spec.onUse !== undefined) {
    const onUse = spec.onUse;
    const interactionResult = file.use('net.minecraft.world.InteractionResult');
    const interactionHand = file.use('net.minecraft.world.InteractionHand');
    const itemStack = file.use('net.minecraft.world.item.ItemStack');
    const level = file.use('net.minecraft.world.level.Level');
    const player = file.use('net.minecraft.world.entity.player.Player');
    const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
    members.push(
      '',
      '/** msm:on_use: fires the event, then starts the cooldown; food still starts eating afterwards. */',
      '@Override',
      `public ${interactionResult} use(${level} level, ${player} player, ${interactionHand} hand) {`,
      `    ${itemStack} stack = player.getItemInHand(hand);`,
      '    if (player.getCooldowns().isOnCooldown(stack)) {',
      `        return ${interactionResult}.FAIL;`,
      '    }',
      `    if (level instanceof ${serverLevel} server) {`,
      `        ${fireCall(onUse.method, withOther(spec, 'server, player.blockPosition().below(), player.position(), player, null', 'player'))}`,
      '    }',
    );
    if (onUse.cooldown > 0)
      members.push(`    player.getCooldowns().addCooldown(stack, ${javaInt(onUse.cooldown)});`);
    members.push(
      `    ${interactionResult} vanilla = super.use(level, player, hand);`,
      `    return vanilla == ${interactionResult}.PASS ? ${interactionResult}.SUCCESS : vanilla;`,
      '}',
    );
  }
  if (ranged !== undefined) members.push(...rangedMembers(file, ranged));
  members.push(...triggerMembers(context, file, spec));
  if (hasEvents) {
    const actions = noteActions(context, file, spec.events);
    members.push(
      ...eventMethods(
        file,
        spec.events,
        hasTriggers(spec.triggers) ? 'actor_item' : 'item',
        actions,
      ),
    );
  }
  const lines = [
    `/** The item {@code ${spec.input.id}}. */`,
    `public class ${name} extends ${superType} {`,
    ...indent(members),
    '}',
  ];
  context.files.push({ path: classPath(context, 'item', name), contents: file.render(lines) });
}

/** The overrides of `MsmBowItem` and `MsmCrossbowItem` for the factors other than 1. */
function rangedMembers(file: JavaFile, ranged: RangedSpec): string[] {
  const out: string[] = [];
  const itemStack = file.use('net.minecraft.world.item.ItemStack');
  const level = file.use('net.minecraft.world.level.Level');
  const living = file.use('net.minecraft.world.entity.LivingEntity');
  if (ranged.drawSpeed !== 1) {
    if (ranged.type === 'crossbow') {
      out.push(
        '',
        '/** Charging: vanilla compares the scaled ticks with its charge duration. */',
        '@Override',
        `public void onUseTick(${level} level, ${living} entity, ${itemStack} stack, int ticksRemaining) {`,
        '    super.onUseTick(level, entity, stack, scaledTimeLeft(getUseDuration(stack, entity), ticksRemaining));',
        '}',
      );
    }
    out.push(
      '',
      '/** Releasing: vanilla turns the scaled ticks into power. */',
      '@Override',
      `public boolean releaseUsing(${itemStack} stack, ${level} level, ${living} entity, int timeLeft) {`,
      '    return super.releaseUsing(stack, level, entity, scaledTimeLeft(getUseDuration(stack, entity), timeLeft));',
      '}',
    );
  }
  if (ranged.velocity !== 1 || ranged.inaccuracy !== 1 || ranged.damageMultiplier !== 1) {
    const projectile = file.use('net.minecraft.world.entity.projectile.Projectile');
    const velocity =
      ranged.velocity === 1 ? 'velocity' : `velocity * ${javaFloat(ranged.velocity)}`;
    const inaccuracy =
      ranged.inaccuracy === 1 ? 'inaccuracy' : `inaccuracy * ${javaFloat(ranged.inaccuracy)}`;
    out.push(
      '',
      '/** velocity, inaccuracy and damage_multiplier on the shot; arrows stay vanilla arrows. */',
      '@Override',
      `protected void shootProjectile(${living} shooter, ${projectile} projectile, int index, float velocity, float inaccuracy, float angle,`,
      `        ${living} target) {`,
    );
    if (ranged.damageMultiplier !== 1) {
      const arrow = file.use('net.minecraft.world.entity.projectile.arrow.AbstractArrow');
      out.push(
        `    if (projectile instanceof ${arrow} arrow) {`,
        `        arrow.setBaseDamage(2.0 * ${javaFloat(ranged.damageMultiplier)}); // vanilla's arrow base damage (2.0) times damage_multiplier`,
        '    }',
      );
    }
    out.push(
      `    super.shootProjectile(shooter, projectile, index, ${velocity}, ${inaccuracy}, angle, target);`,
      '}',
    );
  }
  if (ranged.drawSpeed !== 1) {
    out.push(
      '',
      '/** The remaining use ticks as vanilla should see them: the ticks used so far times DRAW_SPEED. */',
      'private static int scaledTimeLeft(int duration, int timeLeft) {',
      '    long used = Math.round((double) (duration - timeLeft) * DRAW_SPEED);',
      '    return (int) Math.max(Integer.MIN_VALUE, duration - used);',
      '}',
    );
  }
  return out;
}

/**
 * A throwable item class: `item/ThrowableItem` with the item's `msm:throwable` settings, and
 * overrides for `msm:on_use` (fired before the throw or the charge, then its cooldown, as
 * `MsmItem.useWithEvent` inside `MsmThrowableItem.use`) and the hit events (the thrower is
 * `self`, the living entity hit is `other`, as the runtime's `EventContext.forThrownHit`).
 */
function writeThrowableItemClass(
  context: GenerationContext,
  spec: ItemSpec,
  throwable: ThrowableSpec,
  name: string,
): void {
  const file = new JavaFile(packageOf(context, 'item'), spec.input.path);
  const itemType = file.use('net.minecraft.world.item.Item');
  const hasEvents =
    spec.onUse !== undefined ||
    throwable.onHitEntity !== undefined ||
    throwable.onHitBlock !== undefined ||
    hasTriggers(spec.triggers);
  const members: string[] = [
    `private static final String OWNER = ${javaString(spec.input.id)};`,
    '',
  ];
  const sound = throwable.sound === undefined ? 'null' : javaString(throwable.sound);
  members.push(
    `public ${name}(${itemType}.Properties properties) {`,
    '    super(properties, OWNER, new Settings(',
    `            ${javaFloat(throwable.speed)}, // speed`,
    `            ${javaFloat(throwable.inaccuracy)}, // inaccuracy`,
    `            ${javaFloat(throwable.gravity)}, // gravity`,
    `            ${javaFloat(throwable.damage)}, // damage`,
    `            ${javaInt(throwable.chargeTicks)}, // charge_ticks`,
    `            AfterThrow.${throwable.afterThrow}, // after_throw`,
    `            ${javaInt(throwable.cooldownTicks)}, // cooldown_ticks`,
    `            ${sound})); // sound${throwable.sound === undefined ? " (the snowball's)" : ''}`,
    '}',
  );
  const serverLevel = (): string => file.use('net.minecraft.server.level.ServerLevel');
  const player = (): string => file.use('net.minecraft.world.entity.player.Player');
  const vec3 = (): string => file.use('net.minecraft.world.phys.Vec3');
  const blockPos = (): string => file.use('net.minecraft.core.BlockPos');
  const entity = (): string => file.use('net.minecraft.world.entity.Entity');
  const living = (): string => file.use('net.minecraft.world.entity.LivingEntity');
  const withOther = (args: string, other: string): string =>
    spec.events.otherParameter ? `${args}, ${other}` : args;
  if (spec.onUse !== undefined) {
    const level = file.use('net.minecraft.world.level.Level');
    const hand = file.use('net.minecraft.world.InteractionHand');
    const stack = file.use('net.minecraft.world.item.ItemStack');
    members.push(
      '',
      '/** msm:on_use: fires the event, then starts its cooldown; the throw or the charge follows. */',
      '@Override',
      `protected void onUse(${level} level, ${player()} player, ${hand} hand, ${stack} stack) {`,
      `    if (level instanceof ${serverLevel()} server) {`,
      `        ${fireCall(spec.onUse.method, withOther('server, player.blockPosition().below(), player.position(), player, null', 'player'))}`,
      '    }',
    );
    if (spec.onUse.cooldown > 0) {
      members.push(
        `    player.getCooldowns().addCooldown(stack, ${javaInt(spec.onUse.cooldown)});`,
      );
    }
    members.push('}');
  }
  if (throwable.onHitEntity !== undefined) {
    members.push(
      '',
      '/** on_hit_entity: the thrower is self, the living entity hit is other. */',
      '@Override',
      `public void onHitEntity(${serverLevel()} level, ${vec3()} at, ${blockPos()} base, ${entity()} thrower, ${living()} hit) {`,
      `    ${fireCall(throwable.onHitEntity, withOther(`level, base, at, thrower instanceof ${player()} p ? p : null, thrower`, 'hit'))}`,
      '}',
    );
  }
  if (throwable.onHitBlock !== undefined) {
    members.push(
      '',
      '/** on_hit_block: the thrower is self; there is no other entity. */',
      '@Override',
      `public void onHitBlock(${serverLevel()} level, ${vec3()} at, ${blockPos()} pos, ${entity()} thrower) {`,
      `    ${fireCall(throwable.onHitBlock, withOther(`level, pos, at, thrower instanceof ${player()} p ? p : null, thrower`, 'null'))}`,
      '}',
    );
  }
  members.push(...triggerMembers(context, file, spec));
  if (hasEvents) {
    const actions = noteActions(context, file, spec.events);
    members.push(...eventMethods(file, spec.events, 'throwable', actions));
  }
  const lines = [
    `/** The throwable item {@code ${spec.input.id}}. */`,
    `public class ${name} extends ThrowableItem {`,
    ...indent(members),
    '}',
  ];
  context.files.push({ path: classPath(context, 'item', name), contents: file.render(lines) });
}

/** `args` with `other` appended when the item's events take an `other` parameter. */
function withOther(spec: ItemSpec, args: string, other: string): string {
  return spec.events.otherParameter ? `${args}, ${other}` : args;
}

/**
 * The overrides of the ADR 0061 D1 item triggers, as `MsmItem`'s shared handlers (every MSM item
 * class, throwables included, calls them): `msm:on_hit` from `hurtEnemy` (not `postHurtEnemy`,
 * which vanilla calls only for a player's hit), `msm:on_use_on_block` from `useOn` (the result
 * and cooldown on both sides, the event on the server, `PASS` turned into `SUCCESS` so `use`
 * does not run for the click), `msm:while_held` and `msm:while_worn` from `inventoryTick` (a
 * `null` slot, a backpack slot, never fires; due when `(game time + entity id) % interval == 0`,
 * within the shared `TickLimiter`).
 */
function triggerMembers(context: GenerationContext, file: JavaFile, spec: ItemSpec): string[] {
  const { onHit, onUseOnBlock, whileHeld, whileWorn } = spec.triggers;
  const out: string[] = [];
  const serverLevel = () => file.use('net.minecraft.server.level.ServerLevel');
  const player = () => file.use('net.minecraft.world.entity.player.Player');
  const living = () => file.use('net.minecraft.world.entity.LivingEntity');
  const itemStack = () => file.use('net.minecraft.world.item.ItemStack');
  if (onHit !== undefined) {
    out.push(
      '',
      "/** msm:on_hit: after the item hits a living entity (a player's or a mob's hit, a spear stab); self is the attacker, other the entity hit. */",
      '@Override',
      `public void hurtEnemy(${itemStack()} stack, ${living()} target, ${living()} attacker) {`,
      '    super.hurtEnemy(stack, target, attacker);',
      `    if (attacker.level() instanceof ${serverLevel()} server) {`,
      `        ${fireCall(onHit, withOther(spec, `server, attacker.blockPosition().below(), attacker.position(), attacker instanceof ${player()} p ? p : null, attacker instanceof ${player()} ? null : attacker`, 'target'))}`,
      '    }',
      '}',
    );
  }
  if (onUseOnBlock !== undefined) {
    const interactionResult = file.use('net.minecraft.world.InteractionResult');
    const useOnContext = file.use('net.minecraft.world.item.context.UseOnContext');
    out.push(
      '',
      '/** msm:on_use_on_block: fires the event on the clicked block, then starts the cooldown; the vanilla use follows. Without a player (a dispenser) vanilla runs alone. */',
      '@Override',
      `public ${interactionResult} useOn(${useOnContext} context) {`,
      `    ${player()} player = context.getPlayer();`,
      '    if (player == null) {',
      '        return super.useOn(context);',
      '    }',
      `    ${itemStack()} stack = context.getItemInHand();`,
      '    if (player.getCooldowns().isOnCooldown(stack)) {',
      `        return ${interactionResult}.FAIL;`,
      '    }',
      `    if (context.getLevel() instanceof ${serverLevel()} server) {`,
      `        ${fireCall(onUseOnBlock.method, withOther(spec, 'server, context.getClickedPos().immutable(), context.getClickLocation(), player, null', 'player'))}`,
      '    }',
    );
    if (onUseOnBlock.cooldown > 0) {
      out.push(`    player.getCooldowns().addCooldown(stack, ${javaInt(onUseOnBlock.cooldown)});`);
    }
    out.push(
      `    ${interactionResult} vanilla = super.useOn(context);`,
      `    return vanilla == ${interactionResult}.PASS ? ${interactionResult}.SUCCESS : vanilla;`,
      '}',
    );
  }
  if (whileHeld !== undefined || whileWorn !== undefined) {
    context.usesTickLimiter = true;
    const tickLimiter = file.use(`${context.input.javaPackage}.TickLimiter`);
    const entity = file.use('net.minecraft.world.entity.Entity');
    const slotType = file.use('net.minecraft.world.entity.EquipmentSlot');
    const fire = (method: string): string =>
      fireCall(
        method,
        withOther(
          spec,
          `level, owner.blockPosition().below(), owner.position(), owner instanceof ${player()} p ? p : null, owner instanceof ${player()} ? null : owner`,
          `owner instanceof ${living()} living ? living : null`,
        ),
      );
    const body: string[] = [];
    if (whileHeld !== undefined) {
      body.push(
        `// msm:while_held (hand ${whileHeld.hand}): every ${whileHeld.interval} ticks.`,
        `if (${HELD_HANDS[whileHeld.hand]} && ${tickLimiter}.due(level, owner, ${javaInt(whileHeld.interval)}) && ${tickLimiter}.tryFire(level)) {`,
        `    ${fire(whileHeld.method)}`,
        '}',
      );
    }
    if (whileWorn !== undefined) {
      const slot = WORN_SLOTS[spec.armor?.slot ?? ''] as string;
      body.push(
        `// msm:while_worn: every ${whileWorn.interval} ticks in the armour slot.`,
        `if (slot == ${slotType}.${slot} && ${tickLimiter}.due(level, owner, ${javaInt(whileWorn.interval)}) && ${tickLimiter}.tryFire(level)) {`,
        `    ${fire(whileWorn.method)}`,
        '}',
      );
    }
    out.push(
      '',
      '/**',
      ' * msm:while_held and msm:while_worn: vanilla reports each stack once per tick, the selected slot as MAINHAND and the',
      ' * rest of the inventory as null (never fires); due when (game time + entity id) is a multiple of the interval,',
      ' * within the shared tick cap.',
      ' */',
      '@Override',
      `public void inventoryTick(${itemStack()} stack, ${serverLevel()} level, ${entity} owner, ${slotType} slot) {`,
      '    super.inventoryTick(stack, level, owner, slot);',
      '    if (slot == null) {',
      '        return;',
      '    }',
      ...indent(body),
      '}',
    );
  }
  return out;
}
