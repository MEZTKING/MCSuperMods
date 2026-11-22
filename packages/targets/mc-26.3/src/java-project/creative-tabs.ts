/**
 * Creative tabs (ADR 0096 D2, D6): `ModCreativeTabs.java`, registered before blocks and items with
 * Fabric's `FabricCreativeModeTab.builder()` into the vanilla registry (extra tabs go to Fabric's
 * further pages, B440 S9). The tab's icon is looked up when it is drawn; its title is
 * `title`, else `itemGroup.<namespace>.<path>` (`/` as `.`). Its members are the blocks' items, the
 * items and the spawn eggs that name it in `creative_tab`, in registration order (blocks, then
 * items, then spawn eggs: `as_listed`) or by display name (`by_name`); members missing at that time
 * are skipped. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput, Json } from '@msm/plugin-api';
import { classPath, type GenerationContext } from './context';
import { identifierExpression, indent, JavaFile, javaString } from './java';
import { constantName, NameTable, splitId } from './names';
import { blockItemId, checkFormat, readDefinition } from './read';

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The ids of the creative tabs a project defines. */
export function projectTabIds(tabs: readonly DefinitionInput[] | undefined): Set<string> {
  return new Set((tabs ?? []).map((tab) => tab.id));
}

/** The item ids naming `tab` in `creative_tab`, in registration order. */
function members(context: GenerationContext, tab: string): string[] {
  const out: string[] = [];
  for (const block of context.input.blocks) {
    const item = block.definition.item;
    if (!isObject(item) || item.creative_tab !== tab) continue;
    const id = blockItemId(block);
    if (id !== undefined) out.push(id);
  }
  for (const item of context.input.items) {
    if (item.definition.creative_tab === tab) out.push(item.id);
  }
  for (const entity of context.input.entities) {
    const egg = entity.definition.spawn_egg;
    if (egg === false) continue;
    const named =
      isObject(egg) && typeof egg.creative_tab === 'string' ? egg.creative_tab : undefined;
    if (named === tab) out.push(`${entity.id}_spawn_egg`);
  }
  return out;
}

/** Generates `ModCreativeTabs.java`; returns its simple name, or `undefined` without tabs. */
export function generateCreativeTabs(context: GenerationContext): string | undefined {
  const tabs = context.input.creativeTabs ?? [];
  if (tabs.length === 0) return undefined;
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/creative_tab/*.json definitions',
  );
  const registry = file.use('net.minecraft.core.Registry');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const registries = file.use('net.minecraft.core.registries.Registries');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const tabType = file.use('net.minecraft.world.item.CreativeModeTab');
  const fabricTab = file.use('net.fabricmc.fabric.api.creativetab.v1.FabricCreativeModeTab');
  const component = file.use('net.minecraft.network.chat.Component');
  const itemStack = file.use('net.minecraft.world.item.ItemStack');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const list = file.use('java.util.List');
  const fields = new NameTable();
  const body: string[] = [];
  let usesHand = false;
  for (const tab of tabs) {
    const reader = readDefinition(tab);
    reader.onlyKeys(['format', 'icon', 'title', 'order', 'items'], 'top-level key');
    checkFormat(reader);
    const icon = reader.requiredString('icon');
    const { namespace, path } = splitId(tab.id);
    const title = reader.string('title', `itemGroup.${namespace}.${path.replaceAll('/', '.')}`);
    const order = reader.string('order', 'as_listed');
    if (order !== 'as_listed' && order !== 'by_name' && order !== 'by_hand') {
      reader.fail(`order '${order}' is not as_listed, by_name or by_hand`);
    }
    // ADR 0111 D7: `items` counts only for by_hand (the runtime warns and ignores it otherwise).
    const hand = order === 'by_hand' ? reader.strings('items', []) : [];
    const field = fields.take(constantName(path), (name) => [
      name,
      `${name}_KEY`,
      `${name}_ITEMS`,
      `${name}_HAND`,
    ]);
    const ids = members(context, tab.id).map((id) => `        ${identifierExpression(file, id)}`);
    const idList = (name: string, lines: string[]): string[] => [
      `private static final ${list}<${identifier}> ${name} = ${list}.of(${lines.length === 0 ? ');' : ''}`,
      ...lines.map((line, i) => `${line}${i === lines.length - 1 ? ');' : ','}`),
    ];
    const what =
      order === 'by_name'
        ? 'by display name'
        : order === 'by_hand'
          ? 'the listed items first, in that order, then the other members in registration order'
          : 'in registration order';
    const display =
      order === 'by_hand'
        ? [
            '        .displayItems((parameters, output) -> {',
            `            ${list}<${itemStack}> members = members(${field}_ITEMS, false);`,
            `            output.acceptAll(handOrder(members, ${field}_HAND), ${tabType}.TabVisibility.PARENT_TAB_ONLY);`,
            `            output.acceptAll(members, ${tabType}.TabVisibility.SEARCH_TAB_ONLY);`,
            '        })',
          ]
        : [
            `        .displayItems((parameters, output) -> output.acceptAll(members(${field}_ITEMS, ${order === 'by_name'})))`,
          ];
    if (order === 'by_hand') usesHand = true;
    body.push(
      '',
      `/** {@code ${tab.id}} (${tab.path}): its items ${what}. */`,
      ...idList(`${field}_ITEMS`, ids),
      ...(order === 'by_hand'
        ? idList(
            `${field}_HAND`,
            hand.map((id) => `        ${identifierExpression(file, id)}`),
          )
        : []),
      `public static final ${resourceKey}<${tabType}> ${field}_KEY = ${resourceKey}.create(${registries}.CREATIVE_MODE_TAB, ${identifierExpression(file, tab.id)});`,
      `public static final ${tabType} ${field} = ${registry}.register(${builtIn}.CREATIVE_MODE_TAB, ${field}_KEY, ${fabricTab}.builder()`,
      `        .title(${component}.translatable(${javaString(title)}))`,
      `        .icon(() -> new ${itemStack}(${builtIn}.ITEM.getValue(${identifierExpression(file, icon)})))`,
      ...display,
      '        .build());',
    );
  }
  const items = file.use('net.minecraft.world.item.Items');
  const comparator = file.use('java.util.Comparator');
  const lines = [
    '/** The creative tabs, registered when the class loads (before the blocks and items). */',
    'public final class ModCreativeTabs {',
    ...indent(body.slice(1)),
    '',
    '    private ModCreativeTabs() {}',
    '',
    '    /** Loads the class, registering every tab. */',
    '    public static void register() {}',
    '',
    '    /** The registered items of {@code ids} as stacks, sorted by display name when asked. */',
    `    private static ${list}<${itemStack}> members(${list}<${identifier}> ids, boolean byName) {`,
    `        ${list}<${itemStack}> stacks = new java.util.ArrayList<>();`,
    `        for (${identifier} id : ids) {`,
    `            if (${builtIn}.ITEM.containsKey(id) && ${builtIn}.ITEM.getValue(id) != ${items}.AIR) {`,
    `                stacks.add(new ${itemStack}(${builtIn}.ITEM.getValue(id)));`,
    '            }',
    '        }',
    '        if (byName) {',
    `            stacks.sort(${comparator}.comparing(stack -> stack.getHoverName().getString()));`,
    '        }',
    '        return stacks;',
    '    }',
    ...(usesHand
      ? [
          '',
          '    /**',
          '     * A {@code by_hand} page (ADR 0111 D7): for each id of {@code hand}, the first member stack of that item, or a new',
          '     * stack of it when it is no member (left out when it is no item, and when it was listed before); then the members',
          '     * not taken, in their order.',
          '     */',
          `    private static ${list}<${itemStack}> handOrder(${list}<${itemStack}> members, ${list}<${identifier}> hand) {`,
          `        ${list}<${itemStack}> rest = new java.util.ArrayList<>(members);`,
          `        ${list}<${itemStack}> out = new java.util.ArrayList<>();`,
          `        java.util.Set<${identifier}> seen = new java.util.HashSet<>();`,
          `        for (${identifier} id : hand) {`,
          `            if (!seen.add(id) || !${builtIn}.ITEM.containsKey(id)) {`,
          '                continue;',
          '            }',
          `            ${itemStack} found = null;`,
          `            for (${itemStack} stack : rest) {`,
          `                if (stack.is(${builtIn}.ITEM.getValue(id))) {`,
          '                    found = stack;',
          '                    break;',
          '                }',
          '            }',
          '            if (found != null) {',
          '                rest.remove(found);',
          '                out.add(found);',
          '            } else {',
          `                out.add(new ${itemStack}(${builtIn}.ITEM.getValue(id)));`,
          '            }',
          '        }',
          '        out.addAll(rest);',
          '        return out;',
          '    }',
        ]
      : []),
    '}',
  ];
  context.files.push({
    path: classPath(context, '', 'ModCreativeTabs'),
    contents: file.render(lines),
  });
  return 'ModCreativeTabs';
}
