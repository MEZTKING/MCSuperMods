/**
 * Items: `ModItems.java` (registration as the runtime's `MsmRegistrar.registerItem`:
 * `new Item.Properties().setId(key).rarity(r)`, `stacksTo(n)` unless damageable, food,
 * tool through the vanilla `pickaxe/axe/shovel/hoe/sword(ToolMaterial, damage, speed)`
 * helpers, durability after the tool; creative tabs) and one `item/<Name>Item.java` per item
 * with `msm:on_use`, mirroring `MsmItem.use`. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import { type Events, eventMethod, eventMethods, fireCall, readEvents, usesActions } from './actions';
import { RARITIES, tabLine } from './blocks';
import { classPath, type GenerationContext, packageOf } from './context';
import { identifierExpression, indent, JavaFile, javaFloat, javaInt, javaString, trimBlank } from './java';
import { className, constantName, NameTable, splitId } from './names';
import { checkFormat, readDefinition } from './read';

const ITEM_KEYS = ['format', 'max_stack_size', 'rarity', 'creative_tab', 'components', 'events'];
const ITEM_COMPONENTS = ['msm:food', 'msm:tool', 'msm:durability', 'msm:on_use'];

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

interface ItemSpec {
  readonly input: DefinitionInput;
  readonly maxStackSize: number;
  readonly rarity: string;
  readonly creativeTab: string | undefined;
  readonly food: { nutrition: number; saturation: number; canAlwaysEat: boolean } | undefined;
  readonly tool: { type: string; tier: string } | undefined;
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
  tool?.onlyKeys(['type', 'tier'], 'msm:tool field');
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
    tool:
      tool === undefined
        ? undefined
        : {
            type: tool.enumConstant('type', Object.keys(TOOL_TYPES), '').toLowerCase(),
            tier: tool.enumConstant('tier', TOOL_TIERS, ''),
          },
    durability: durability?.requiredInteger('max'),
    onUse:
      onUse === undefined
        ? undefined
        : { method: eventMethod(onUse, events, onUse.requiredString('event')), cooldown: onUse.integer('cooldown_ticks', 0) },
    events,
  };
}

/**
 * Generates `ModItems.java` and the item classes; returns nothing when there are no items.
 *
 * @returns The simple name of the registration class, or `undefined`.
 */
export function generateItems(context: GenerationContext, classNames: NameTable): string | undefined {
  const { items } = context.input;
  if (items.length === 0) return undefined;
  const specs = items.map(readItem);
  const fields = new NameTable();
  const file = new JavaFile(context.input.javaPackage, 'the msm/<namespace>/item/*.json definitions');
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
    const field = fields.take(constantName(path), (name) => [name, `${name}_KEY`]);
    let type = itemType;
    if (spec.onUse !== undefined) {
      const name = classNames.take(className(path, 'Item'), (n) => [`item.${n}`], '');
      writeItemClass(context, spec, name);
      type = file.use(`${packageOf(context, 'item')}.${name}`);
    }
    const props = [`        .setId(${field}_KEY)`, `        .rarity(${rarity}.${spec.rarity})`];
    const damageable = spec.tool !== undefined || spec.durability !== undefined;
    if (damageable) {
      if (spec.input.definition.max_stack_size !== undefined && spec.maxStackSize !== 1) {
        props.push(`        // max_stack_size ${spec.maxStackSize} ignored: tools and items with durability stack to 1.`);
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
    if (spec.tool !== undefined) {
      const toolMaterial = file.use('net.minecraft.world.item.ToolMaterial');
      const [method, damage, speed] = TOOL_TYPES[spec.tool.type] as [string, string, string];
      props.push(`        .${method}(${toolMaterial}.${spec.tool.tier}, ${damage}, ${speed})`);
    }
    if (spec.durability !== undefined) {
      props.push(`        .durability(${javaInt(spec.durability)}) // after the tool: overrides the tier's durability`);
    }
    const last = props.length - 1;
    props[last] = closeLine(props[last] as string, '));');
    body.push(
      '',
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
  return comment < 0 ? `${line}${suffix}` : `${line.slice(0, comment)}${suffix}${line.slice(comment)}`;
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
  const actions = usesActions(spec.events) ? file.use(`${context.input.javaPackage}.Actions`) : 'Actions';
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
  if (onUse.cooldown > 0) members.push(`    player.getCooldowns().addCooldown(stack, ${javaInt(onUse.cooldown)});`);
  members.push(
    `    ${interactionResult} vanilla = super.use(level, player, hand);`,
    `    return vanilla == ${interactionResult}.PASS ? ${interactionResult}.SUCCESS : vanilla;`,
    '}',
    ...eventMethods(file, spec.events, 'item', actions),
  );
  const lines = [`/** The item {@code ${spec.input.id}}. */`, `public class ${name} extends ${itemType} {`, ...indent(members), '}'];
  context.files.push({ path: classPath(context, 'item', name), contents: file.render(lines) });
}
