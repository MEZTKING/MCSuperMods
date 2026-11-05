/**
 * Items: `ModItems.java` (registration as the runtime's `MsmRegistrar.registerItem`:
 * `new Item.Properties().setId(key).rarity(r)`, `stacksTo(n)` unless damageable, food,
 * tool through the vanilla `pickaxe/axe/shovel/hoe/sword(ToolMaterial, damage, speed)`
 * helpers with a `ToolMaterial` constant or a `<NAME>_MATERIAL` field for a custom material,
 * armour through `humanoidArmor(ArmorMaterial, ArmorType)` with an `ArmorMaterials` constant
 * or a `<NAME>_ARMOR` field (ADR 0042 D6), `enchantment_value: 0` as the runtime does (built
 * with 1, the `enchantable` component removed), durability after both; creative tabs) and one
 * `item/<Name>Item.java` per item with `msm:on_use`, mirroring `MsmItem.use`. Minecraft 26.3,
 * Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import {
  type Events,
  eventMethod,
  eventMethods,
  fireCall,
  readEvents,
  usesActions,
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
const ITEM_COMPONENTS = ['msm:food', 'msm:tool', 'msm:armor', 'msm:durability', 'msm:on_use'];

/** Tool types and the vanilla iron-tier base attack damage and speed of each (as the runtime). */
const TOOL_TYPES: Readonly<Record<string, [string, string, string]>> = {
  pickaxe: ['pickaxe', '1.0f', '-2.8f'],
  axe: ['axe', '6.0f', '-3.1f'],
  shovel: ['shovel', '1.5f', '-3.0f'],
  hoe: ['hoe', '-2.0f', '-1.0f'],
  sword: ['sword', '3.0f', '-2.4f'],
};

/** Tool tiers, each a `ToolMaterial` constant. */
const TOOL_TIERS = ['wood', 'stone', 'copper', 'iron', 'diamond', 'gold', 'netherite'] as const;

/** Armour slots, each an `ArmorType` constant. */
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'] as const;

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
  readonly defense: { helmet: number; chestplate: number; leggings: number; boots: number };
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
  /** The `ArmorType` constant name. */
  readonly slot: string;
  /** An `ArmorMaterials` constant name, or a custom material. */
  readonly material: string | CustomArmorMaterial;
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
}

function readItem(input: DefinitionInput): ItemSpec {
  const reader = readDefinition(input);
  reader.onlyKeys(ITEM_KEYS, 'top-level key');
  checkFormat(reader);
  const components = reader.object('components');
  components?.onlyKeys(ITEM_COMPONENTS, 'component');
  const events = readEvents(reader);
  const food = components?.object('msm:food');
  food?.onlyKeys(['nutrition', 'saturation', 'can_always_eat'], 'msm:food field');
  const tool = components?.object('msm:tool');
  tool?.onlyKeys(['type', 'tier', 'attack_damage', 'attack_speed'], 'msm:tool field');
  const armor = components?.object('msm:armor');
  armor?.onlyKeys(['slot', 'material'], 'msm:armor field');
  if (tool !== undefined && armor !== undefined) {
    reader.fail(
      'msm:armor and msm:tool on one item cannot be ejected (the runtime applies neither)',
    );
  }
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
    type: tool.enumConstant('type', Object.keys(TOOL_TYPES), '').toLowerCase(),
    tier: spec,
    attackDamage: tool.optionalNumber('attack_damage'),
    attackSpeed: tool.optionalNumber('attack_speed'),
  };
}

function readArmor(armor: Reader): ArmorSpec {
  const slot = armor.enumConstant('slot', ARMOR_SLOTS, '');
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
  defense.onlyKeys(ARMOR_SLOTS, 'msm:armor defense field');
  return {
    slot,
    material: {
      durability: material.requiredInteger('durability'),
      defense: {
        helmet: defense.requiredInteger('helmet'),
        chestplate: defense.requiredInteger('chestplate'),
        leggings: defense.requiredInteger('leggings'),
        boots: defense.requiredInteger('boots'),
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
    `        ${map}.of(${armorType}.HELMET, ${javaInt(defense.helmet)}, ${armorType}.CHESTPLATE, ${javaInt(defense.chestplate)}, ${armorType}.LEGGINGS, ${javaInt(defense.leggings)}, ${armorType}.BOOTS, ${javaInt(defense.boots)}, ${armorType}.BODY, ${javaInt(defense.chestplate)}), // defense (BODY as the chestplate, unused by humanoid armour)`,
    `        ${enchantmentArgument(material.enchantmentValue)}`,
    `        ${sound}`,
    `        ${javaFloat(material.toughness)}, // toughness`,
    `        ${javaFloat(material.knockbackResistance)}, // knockback resistance`,
    `        ${repairTag(file, material.repairItems, itemId)}, // repair items`,
    `        ${resourceKey}.create(${equipmentAssets}.ROOT_ID, ${identifierExpression(file, material.equipmentAsset)}));`,
  ];
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

  const body: string[] = [];
  const tabs: string[] = [];
  for (const spec of specs) {
    const { path } = splitId(spec.input.id);
    const field = fields.take(constantName(path), (name) => [
      name,
      `${name}_KEY`,
      `${name}_MATERIAL`,
      `${name}_ARMOR`,
    ]);
    const materials: string[] = [];
    let type = itemType;
    if (spec.onUse !== undefined) {
      const name = classNames.take(className(path, 'Item'), (n) => [`item.${n}`], '');
      writeItemClass(context, spec, name);
      type = file.use(`${packageOf(context, 'item')}.${name}`);
    }
    const props = [`        .setId(${field}_KEY)`, `        .rarity(${rarity}.${spec.rarity})`];
    const damageable =
      spec.tool !== undefined || spec.armor !== undefined || spec.durability !== undefined;
    if (damageable) {
      if (spec.input.definition.max_stack_size !== undefined && spec.maxStackSize !== 1) {
        props.push(
          `        // max_stack_size ${spec.maxStackSize} ignored: tools, armour and items with durability stack to 1.`,
        );
      }
    } else {
      props.push(`        .stacksTo(${javaInt(spec.maxStackSize)})`);
    }
    if (spec.food !== undefined) {
      const foodProperties = file.use('net.minecraft.world.food.FoodProperties');
      props.push(
        `        .food(new ${foodProperties}.Builder()`,
        `                .nutrition(${javaInt(spec.food.nutrition)})`,
        `                .saturationModifier(${javaFloat(spec.food.saturation)})`,
      );
      if (spec.food.canAlwaysEat) props.push('                .alwaysEdible()');
      props.push('                .build())');
    }
    let notEnchantable = false;
    if (spec.tool !== undefined) {
      const { tool } = spec;
      const [method, baseDamage, baseSpeed] = TOOL_TYPES[tool.type] as [string, string, string];
      const damage = tool.attackDamage === undefined ? baseDamage : javaFloat(tool.attackDamage);
      const speed = tool.attackSpeed === undefined ? baseSpeed : javaFloat(tool.attackSpeed);
      let material: string;
      if (typeof tool.tier === 'string') {
        material = `${file.use('net.minecraft.world.item.ToolMaterial')}.${tool.tier}`;
      } else {
        materials.push(...toolMaterialField(file, field, tool.tier, spec.input.id), '');
        material = `${field}_MATERIAL`;
        notEnchantable = tool.tier.enchantmentValue === 0;
      }
      const overrides = [
        tool.attackDamage === undefined ? undefined : 'attack_damage',
        tool.attackSpeed === undefined ? undefined : 'attack_speed',
      ].filter((name) => name !== undefined);
      const note = overrides.length === 0 ? '' : ` // ${overrides.join(' and ')} overridden`;
      props.push(`        .${method}(${material}, ${damage}, ${speed})${note}`);
    }
    if (spec.armor !== undefined) {
      const { armor } = spec;
      const armorType = file.use('net.minecraft.world.item.equipment.ArmorType');
      let material: string;
      if (typeof armor.material === 'string') {
        material = `${file.use('net.minecraft.world.item.equipment.ArmorMaterials')}.${armor.material}`;
      } else {
        materials.push(...armorMaterialField(file, field, armor.material, spec.input.id), '');
        material = `${field}_ARMOR`;
        notEnchantable = armor.material.enchantmentValue === 0;
      }
      props.push(`        .humanoidArmor(${material}, ${armorType}.${armor.slot})`);
    }
    if (notEnchantable) {
      const dataComponents = file.use('net.minecraft.core.component.DataComponents');
      props.push(
        `        .component(${dataComponents}.ENCHANTABLE, null) // enchantment_value 0: not enchantable`,
      );
    }
    if (spec.durability !== undefined) {
      const note =
        spec.armor === undefined
          ? "after the tool: overrides the tier's durability"
          : "after the armour: overrides the material's per-slot durability";
      props.push(`        .durability(${javaInt(spec.durability)}) // ${note}`);
    }
    const last = props.length - 1;
    props[last] = closeLine(props[last] as string, '));');
    body.push(
      '',
      ...materials,
      `/** {@code ${spec.input.id}} (${spec.input.path}). */`,
      `public static final ${resourceKey}<${itemType}> ${field}_KEY = ${resourceKey}.create(${registries}.ITEM, ${identifierExpression(file, spec.input.id)});`,
      `public static final ${type} ${field} = ${registry}.register(${builtIn}.ITEM, ${field}_KEY, new ${type}(new ${itemType}.Properties()`,
      ...props,
    );
    if (spec.creativeTab !== undefined) tabs.push(tabLine(file, spec.creativeTab, field));
  }
  const lines = [
    '/** The items, registered when the class loads. */',
    'public final class ModItems {',
    ...indent(trimBlank(body)),
    '',
    '    private ModItems() {}',
    '',
    '    /** Loads the class (registering every item) and adds the items to their creative tabs. */',
    '    public static void register() {',
    ...indent(tabs, 2),
    '    }',
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

function writeItemClass(context: GenerationContext, spec: ItemSpec, name: string): void {
  const onUse = spec.onUse as { method: string; cooldown: number };
  const file = new JavaFile(packageOf(context, 'item'), spec.input.path);
  const itemType = file.use('net.minecraft.world.item.Item');
  const interactionResult = file.use('net.minecraft.world.InteractionResult');
  const interactionHand = file.use('net.minecraft.world.InteractionHand');
  const itemStack = file.use('net.minecraft.world.item.ItemStack');
  const level = file.use('net.minecraft.world.level.Level');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const actions = usesActions(spec.events)
    ? file.use(`${context.input.javaPackage}.Actions`)
    : 'Actions';
  if (usesActions(spec.events)) context.usesActions = true;

  const members = [
    `private static final String OWNER = ${javaString(spec.input.id)};`,
    '',
    `public ${name}(${itemType}.Properties properties) {`,
    '    super(properties);',
    '}',
    '',
    '/** msm:on_use: fires the event, then starts the cooldown; food still starts eating afterwards. */',
    '@Override',
    `public ${interactionResult} use(${level} level, ${player} player, ${interactionHand} hand) {`,
    `    ${itemStack} stack = player.getItemInHand(hand);`,
    '    if (player.getCooldowns().isOnCooldown(stack)) {',
    `        return ${interactionResult}.FAIL;`,
    '    }',
    `    if (level instanceof ${serverLevel} server) {`,
    `        ${fireCall(onUse.method, 'server, player.blockPosition().below(), player.position(), player, null')}`,
    '    }',
  ];
  if (onUse.cooldown > 0)
    members.push(`    player.getCooldowns().addCooldown(stack, ${javaInt(onUse.cooldown)});`);
  members.push(
    `    ${interactionResult} vanilla = super.use(level, player, hand);`,
    `    return vanilla == ${interactionResult}.PASS ? ${interactionResult}.SUCCESS : vanilla;`,
    '}',
    ...eventMethods(file, spec.events, 'item', actions),
  );
  const lines = [
    `/** The item {@code ${spec.input.id}}. */`,
    `public class ${name} extends ${itemType} {`,
    ...indent(members),
    '}',
  ];
  context.files.push({ path: classPath(context, 'item', name), contents: file.render(lines) });
}
