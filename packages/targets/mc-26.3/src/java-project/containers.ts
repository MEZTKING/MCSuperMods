/**
 * Containers (ADR 0074 D9): `msm:container` read with the runtime's rules (`BlockComponents.Container`
 * and `checkContainer`, stricter where the runtime only reports a load error), the members of the
 * block class (`MsmContainerBlock`'s container branches: the block entity, the layout's menu or the
 * holder's put-in and take-out, `msm:on_interact` after them, the openers' scheduled recheck,
 * comparators, and a keep-contents block dropping itself in creative), one
 * `block/<Name>BlockEntity.java` per container block over the shared `StorageBlockEntity`, the
 * shared classes copied from the runtime (`templates/storage-block-entity-java.ts`) and
 * `ModBlockEntities.java`, which registers every block entity type with its block's id after the
 * blocks. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import { classPath, type GenerationContext, packageOf } from './context';
import { identifierExpression, indent, JavaFile, javaInt, javaString } from './java';
import type { Reader } from './read';
import {
  blockEventsJava,
  containerBlockItemJava,
  containerMenusJava,
  containerOpenersJava,
  containerSpecJava,
  holderInteractionJava,
  storageBlockEntityJava,
} from './templates/storage-block-entity-java';

/** `msm:container` fields (`BlockComponents.Container.KEYS`). */
const CONTAINER_KEYS = [
  'layout',
  'rows',
  'size',
  'keep_contents',
  'hoppers',
  'comparator',
  'open_sound',
  'close_sound',
  'on_open',
  'on_close',
];

/** The layouts (`::msm::definition::ContainerLayout`), each a `ContainerSpec.Layout` constant. */
export const CONTAINER_LAYOUTS = ['chest', 'hopper', 'dispenser', 'none'] as const;

/** The types a container or machine may be on (`BlockType.SHAPED_ONLY_COMPONENTS`, ADR 0074 D1). */
export const BLOCK_ENTITY_TYPES: readonly string[] = [
  'block',
  'pillar',
  'horizontal',
  'directional',
];

/** The shared classes of `block/` and `recipe/` that block class names must not take. */
export const BLOCK_ENTITY_CLASS_NAMES: readonly string[] = [
  'block.BlockEvents',
  'block.ContainerBlockItem',
  'block.ContainerMenus',
  'block.ContainerOpeners',
  'block.ContainerSpec',
  'block.HolderInteraction',
  'block.MachineBlockEntity',
  'block.MachineData',
  'block.MachineFurnaceMenu',
  'block.MachineResultSlot',
  'block.MachineSpec',
  'block.StorageBlockEntity',
];

/** An event a block entity fires: its id and the block class's event method. */
export interface FiredEvent {
  readonly id: string;
  readonly method: string;
}

/** A parsed `msm:container` with the runtime's defaults applied. */
export interface ContainerInfo {
  /** `CHEST`, `HOPPER`, `DISPENSER` or `NONE`. */
  readonly layout: string;
  readonly rows: number;
  readonly size: number;
  readonly keepContents: boolean;
  readonly hoppers: boolean;
  readonly comparator: boolean;
  readonly openSound: string | undefined;
  readonly closeSound: string | undefined;
  readonly onOpen: FiredEvent | undefined;
  readonly onClose: FiredEvent | undefined;
}

/** A namespaced id: `minecraft:` added when the namespace is left out, as `Identifier.parse`. */
export function namespacedId(reader: Reader, key: string, value: string): string {
  if (!/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(value)) reader.fail(`${key} '${value}' is not an id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

/**
 * Reads `msm:container` with the runtime's checks. Where the runtime reports a load error and
 * drops the component or turns `keep_contents` off (`rows` outside `chest`, `size` outside
 * `none`, `keep_contents` outside a 3-row chest), generation fails.
 *
 * @param component - The component.
 * @param event - Resolves an event id the component names to its method (fails when undeclared).
 */
export function readContainer(
  component: Reader,
  event: (reader: Reader, id: string) => string,
): ContainerInfo {
  component.onlyKeys(CONTAINER_KEYS, 'msm:container field');
  const layout = component.enumConstant('layout', CONTAINER_LAYOUTS, 'chest');
  const rows = component.integer('rows', 3);
  if (rows < 1 || rows > 6) component.fail('rows must be 1 to 6');
  const size = component.integer('size', 1);
  if (size < 1 || size > 9) component.fail('size must be 1 to 9');
  if (layout !== 'CHEST' && component.has('rows')) {
    component.fail(`rows is only for layout 'chest', not '${layout.toLowerCase()}'`);
  }
  if (layout !== 'NONE' && component.has('size')) {
    component.fail(`size is only for layout 'none', not '${layout.toLowerCase()}'`);
  }
  const keepContents = component.boolean('keep_contents', false);
  if ((component.has('keep_contents') && layout !== 'CHEST') || (keepContents && rows !== 3)) {
    component.fail(
      `keep_contents needs layout 'chest' with 3 rows (the runtime turns it off with a load error)`,
    );
  }
  const sound = (key: string): string | undefined => {
    const value = component.optionalString(key);
    return value === undefined ? undefined : namespacedId(component, key, value);
  };
  const fired = (key: string): FiredEvent | undefined => {
    const id = component.optionalString(key);
    return id === undefined ? undefined : { id, method: event(component, id) };
  };
  return {
    layout,
    rows,
    size,
    keepContents,
    hoppers: component.boolean('hoppers', true),
    comparator: component.boolean('comparator', true),
    openSound: sound('open_sound'),
    closeSound: sound('close_sound'),
    onOpen: fired('on_open'),
    onClose: fired('on_close'),
  };
}

/** `Optional.of(Identifier...)` or `Optional.empty()`. */
export function optionalId(file: JavaFile, id: string | undefined): string {
  const optional = file.use('java.util.Optional');
  return id === undefined
    ? `${optional}.empty()`
    : `${optional}.of(${identifierExpression(file, id)})`;
}

/** The members the block class needs for its block entity. */
export interface BlockEntityMembers {
  /** Interfaces the block class implements (simple names, imported). */
  readonly interfaces: string[];
  /** Members after the constructor. */
  readonly members: string[];
}

/** What every container and machine block class gets: the use override and its helpers. */
export interface UseParts {
  /** The block class's simple name of its block entity class. */
  readonly entityClass: string;
  /** The `ModBlockEntities` field of the block's type. */
  readonly typeField: string;
  /** The method of `msm:on_interact`, or `undefined`. */
  readonly onInteract: string | undefined;
  /** Lines of `msm:on_break` to fire in a keep-contents `playerWillDestroy` (empty: none). */
  readonly onBreak: readonly string[];
}

/**
 * The `msm:on_interact` helper of a container or machine block (the runtime's driver): fires on the
 * server and succeeds. Empty without the component.
 */
export function interactMembers(file: JavaFile, onInteract: string | undefined): string[] {
  if (onInteract === undefined) return [];
  const interactionResult = file.use('net.minecraft.world.InteractionResult');
  const level = file.use('net.minecraft.world.level.Level');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const vec3 = file.use('net.minecraft.world.phys.Vec3');
  return [
    '',
    '/** msm:on_interact: a player uses the block, after its menu or holder (ADR 0067 D3 order). */',
    `private ${interactionResult} interact(${level} level, ${blockPos} pos, ${player} player) {`,
    `    if (level instanceof ${serverLevel} server) {`,
    `        ${onInteract}(server, pos.immutable(), ${vec3}.atCenterOf(pos), player, null, 1);`,
    '    }',
    `    return ${interactionResult}.SUCCESS;`,
    '}',
  ];
}

/**
 * `BlockEvents.fireEvent` of a block class: one case per event its block entity fires (the
 * player is `null` for a machine's events).
 */
export function fireEventMembers(file: JavaFile, events: readonly FiredEvent[]): string[] {
  const unique = [...new Map(events.map((e) => [e.id, e])).values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  if (unique.length === 0) return [];
  const identifier = file.use('net.minecraft.resources.Identifier');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const vec3 = file.use('net.minecraft.world.phys.Vec3');
  return [
    '',
    '/** The events the block entity fires, at the block. */',
    '@Override',
    `public void fireEvent(${identifier} event, ${serverLevel} level, ${blockPos} pos, ${player} player) {`,
    '    switch (event.toString()) {',
    ...unique.map(
      (e) =>
        `        case ${javaString(e.id)} -> ${e.method}(level, pos.immutable(), ${vec3}.atCenterOf(pos), player, null, 1);`,
    ),
    '        default -> {',
    '        }',
    '    }',
    '}',
  ];
}

/** `affectNeighborsAfterRemoval`: comparators next to the block learn it is gone, as vanilla containers. */
export function removalMembers(file: JavaFile): string[] {
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const containers = file.use('net.minecraft.world.Containers');
  return [
    '',
    '@Override',
    `protected void affectNeighborsAfterRemoval(${blockState} state, ${serverLevel} level, ${blockPos} pos, boolean movedByPiston) {`,
    '    super.affectNeighborsAfterRemoval(state, level, pos, movedByPiston);',
    `    ${containers}.updateNeighboursAfterDestroy(state, level, pos);`,
    '}',
  ];
}

/** `newBlockEntity`: the block's own block entity class. */
export function newBlockEntityMembers(file: JavaFile, entityClass: string): string[] {
  const blockEntity = file.use('net.minecraft.world.level.block.entity.BlockEntity');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  return [
    '',
    '@Override',
    `public ${blockEntity} newBlockEntity(${blockPos} pos, ${blockState} state) {`,
    `    return new ${entityClass}(pos, state);`,
    '}',
  ];
}

/**
 * The members of a container block class (`MsmContainerBlock`'s container branches, ADR 0074 D1,
 * D3–D6), in the block package.
 */
export function containerBlockMembers(
  file: JavaFile,
  info: ContainerInfo,
  parts: UseParts,
): BlockEntityMembers {
  const entityBlock = file.use('net.minecraft.world.level.block.EntityBlock');
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  const level = file.use('net.minecraft.world.level.Level');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const interactionResult = file.use('net.minecraft.world.InteractionResult');
  const hit = file.use('net.minecraft.world.phys.BlockHitResult');
  const interfaces = [entityBlock];
  const fired = [info.onOpen, info.onClose].filter((e) => e !== undefined);
  if (fired.length > 0) interfaces.push('BlockEvents');
  // msm:on_interact after the menu or holder, only when the block has it.
  const interactLine =
    parts.onInteract === undefined ? [] : ['    interact(level, pos, player); // msm:on_interact'];
  const members: string[] = [
    ...newBlockEntityMembers(file, parts.entityClass),
    '',
    `private static StorageBlockEntity storage(${level} level, ${blockPos} pos) {`,
    '    return level.getBlockEntity(pos) instanceof StorageBlockEntity storage ? storage : null;',
    '}',
  ];
  if (info.layout === 'NONE') {
    const itemStack = file.use('net.minecraft.world.item.ItemStack');
    const hand = file.use('net.minecraft.world.InteractionHand');
    members.push(
      '',
      '/** A holder (layout none): an empty hand takes the last filled slot out, then msm:on_interact. */',
      '@Override',
      `protected ${interactionResult} useWithoutItem(${blockState} state, ${level} level, ${blockPos} pos, ${player} player, ${hit} hit) {`,
      '    StorageBlockEntity storage = storage(level, pos);',
      '    if (storage == null) {',
      `        return ${parts.onInteract === undefined ? `${interactionResult}.PASS` : 'interact(level, pos, player)'};`,
      '    }',
      '    boolean used = true; // the client cannot see the contents: it predicts a use and the server decides',
      `    if (level instanceof ${serverLevel} && player.getMainHandItem().isEmpty()) {`,
      '        used = !HolderInteraction.takeOut(storage, player).isEmpty();',
      '        if (used) {',
      '            storage.fire(storage.spec().onOpen(), player);',
      '        }',
      `    } else if (level instanceof ${serverLevel}) {`,
      '        used = false; // an item that did not fit: only msm:on_interact below',
      '    }',
      ...(parts.onInteract === undefined
        ? [`    return used ? ${interactionResult}.SUCCESS : ${interactionResult}.PASS;`]
        : [
            `    ${interactionResult} interact = interact(level, pos, player); // msm:on_interact`,
            `    return used || interact.consumesAction() ? ${interactionResult}.SUCCESS : ${interactionResult}.PASS;`,
          ]),
      '}',
      '',
      '/** A holder (layout none): puts as much of the held stack as fits into the first slot that takes it, then msm:on_interact. */',
      '@Override',
      `protected ${interactionResult} useItemOn(${itemStack} stack, ${blockState} state, ${level} level, ${blockPos} pos, ${player} player,`,
      `        ${hand} hand, ${hit} hit) {`,
      '    StorageBlockEntity storage = storage(level, pos);',
      '    if (stack.isEmpty() || storage == null) {',
      '        return super.useItemOn(stack, state, level, pos, player, hand, hit);',
      '    }',
      `    if (!(level instanceof ${serverLevel})) {`,
      `        return ${interactionResult}.SUCCESS;`,
      '    }',
      '    if (HolderInteraction.putIn(storage, stack, player) == 0) {',
      `        return ${interactionResult}.TRY_WITH_EMPTY_HAND; // nothing fitted: msm:on_interact only`,
      '    }',
      '    storage.fire(storage.spec().onOpen(), player);',
      ...interactLine,
      `    return ${interactionResult}.SUCCESS;`,
      '}',
    );
  } else {
    const menu =
      info.layout === 'CHEST'
        ? info.keepContents
          ? 'the shulker box menu (keep-contents)'
          : `a chest menu of ${info.rows} row(s)`
        : info.layout === 'HOPPER'
          ? 'the hopper menu'
          : 'the dispenser menu';
    members.push(
      '',
      `/** Opens ${menu}, then msm:on_interact. */`,
      '@Override',
      `protected ${interactionResult} useWithoutItem(${blockState} state, ${level} level, ${blockPos} pos, ${player} player, ${hit} hit) {`,
      '    StorageBlockEntity storage = storage(level, pos);',
      '    if (storage == null) {',
      `        return ${parts.onInteract === undefined ? `${interactionResult}.PASS` : 'interact(level, pos, player)'};`,
      '    }',
      `    if (level instanceof ${serverLevel}) {`,
      '        player.openMenu(storage); // a locked container sends its own message and opens nothing',
      '    }',
      ...interactLine,
      `    return ${interactionResult}.SUCCESS;`,
      '}',
    );
  }
  members.push(...interactMembers(file, parts.onInteract));
  const random = file.use('net.minecraft.util.RandomSource');
  members.push(
    '',
    "/** Openers: vanilla's ContainerOpenersCounter schedules this tick (the barrel's recheck). */",
    '@Override',
    `protected void tick(${blockState} state, ${serverLevel} level, ${blockPos} pos, ${random} random) {`,
    '    super.tick(state, level, pos, random);',
    '    StorageBlockEntity storage = storage(level, pos);',
    '    if (storage != null) {',
    '        storage.recheckOpen();',
    '    }',
    '}',
  );
  if (info.comparator) {
    const direction = file.use('net.minecraft.core.Direction');
    const menu = file.use('net.minecraft.world.inventory.AbstractContainerMenu');
    members.push(
      '',
      "/** Comparators read the contents: the barrel's formula. */",
      '@Override',
      `protected boolean hasAnalogOutputSignal(${blockState} state) {`,
      '    return true;',
      '}',
      '',
      '@Override',
      `protected int getAnalogOutputSignal(${blockState} state, ${level} level, ${blockPos} pos, ${direction} direction) {`,
      `    return ${menu}.getRedstoneSignalFromBlockEntity(level.getBlockEntity(pos));`,
      '}',
    );
  }
  members.push(...removalMembers(file));
  if (info.keepContents) {
    const itemStack = file.use('net.minecraft.world.item.ItemStack');
    const itemEntity = file.use('net.minecraft.world.entity.item.ItemEntity');
    members.push(
      '',
      '/**',
      ' * Keep-contents: creative breaking drops no loot, so a non-empty block drops itself with its contents, as a',
      ' * shulker box does.',
      ' */',
      '@Override',
      `public ${blockState} playerWillDestroy(${level} level, ${blockPos} pos, ${blockState} state, ${player} player) {`,
      '    StorageBlockEntity storage = storage(level, pos);',
      '    if (storage != null && !level.isClientSide() && player.preventsBlockDrops() && !storage.isEmpty()) {',
      `        ${itemStack} drop = new ${itemStack}(this);`,
      '        if (!drop.isEmpty()) {',
      '            drop.applyComponents(storage.collectComponents());',
      `            ${itemEntity} entity = new ${itemEntity}(level, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, drop);`,
      '            entity.setDefaultPickUpDelay();',
      '            level.addFreshEntity(entity);',
      '        }',
      '    }',
      ...indent(parts.onBreak),
      '    return super.playerWillDestroy(level, pos, state, player);',
      '}',
    );
  }
  members.push(...fireEventMembers(file, fired));
  return { interfaces, members };
}

/** The `new ContainerSpec(...)` of a container block. */
function containerSpecLines(file: JavaFile, info: ContainerInfo): string[] {
  return [
    `public static final ContainerSpec SPEC = new ContainerSpec(ContainerSpec.Layout.${info.layout}, ${javaInt(info.rows)}, ${javaInt(info.size)},`,
    `        ${info.keepContents}, ${info.hoppers}, ${info.comparator}, // keep_contents, hoppers, comparator`,
    `        ${optionalId(file, info.openSound)}, ${optionalId(file, info.closeSound)}, // open_sound, close_sound (absent: a barrel's)`,
    `        ${optionalId(file, info.onOpen?.id)}, ${optionalId(file, info.onClose?.id)}); // on_open, on_close`,
  ];
}

/** Writes `block/<Name>BlockEntity.java` of a container block. */
export function writeStorageEntityClass(
  context: GenerationContext,
  blockId: string,
  entityClass: string,
  typeField: string,
  info: ContainerInfo,
): void {
  const javaPackage = packageOf(context, 'block');
  const file = new JavaFile(javaPackage, `the msm:container of ${blockId}`);
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  const types = file.use(`${context.input.javaPackage}.ModBlockEntities`);
  const lines = [
    `/** The block entity of {@code ${blockId}}: its items, saved under {@code Items} (ADR 0074 D2). */`,
    `public class ${entityClass} extends StorageBlockEntity {`,
    `    /** The msm:container of {@code ${blockId}}: layout, rows, size and the settings below. */`,
    ...indent(containerSpecLines(file, info)),
    '',
    `    public ${entityClass}(${blockPos} pos, ${blockState} state) {`,
    `        super(${types}.${typeField}, pos, state, SPEC);`,
    '    }',
    '}',
  ];
  context.files.push({
    path: classPath(context, 'block', entityClass),
    contents: file.render(lines),
  });
}

/** Writes the shared container classes of `block/` (copies of the runtime's). */
export function writeContainerFiles(context: GenerationContext): void {
  const blockPackage = packageOf(context, 'block');
  const add = (name: string, contents: string): void => {
    context.files.push({ path: classPath(context, 'block', name), contents });
  };
  add('ContainerSpec', containerSpecJava(blockPackage));
  add('StorageBlockEntity', storageBlockEntityJava(blockPackage));
  add('ContainerMenus', containerMenusJava(blockPackage));
  add('ContainerOpeners', containerOpenersJava(blockPackage));
  add('HolderInteraction', holderInteractionJava(blockPackage));
  add('ContainerBlockItem', containerBlockItemJava(blockPackage));
}

/** Writes `block/BlockEvents.java` (containers and machines both use it). */
export function writeBlockEventsFile(context: GenerationContext): void {
  context.files.push({
    path: classPath(context, 'block', 'BlockEvents'),
    contents: blockEventsJava(packageOf(context, 'block')),
  });
}

/** A container or machine block for `ModBlockEntities`. */
export interface BlockEntityEntry {
  readonly blockId: string;
  /** The `ModBlocks` field of the block, also the `ModBlockEntities` field of its type. */
  readonly field: string;
  /** The block entity class's simple name, in `block/`. */
  readonly entityClass: string;
}

/**
 * Generates `ModBlockEntities.java`: one `BlockEntityType` per container and machine block with
 * the block's id, registered when the class loads (after `ModBlocks`, ADR 0074 D2, D9). Returns
 * the class name, or `undefined` without entries.
 */
export function generateBlockEntities(
  context: GenerationContext,
  entries: readonly BlockEntityEntry[],
): string | undefined {
  if (entries.length === 0) return undefined;
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm:container and msm:machine components of the block definitions',
  );
  const registry = file.use('net.minecraft.core.Registry');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const type = file.use('net.minecraft.world.level.block.entity.BlockEntityType');
  const set = file.use('java.util.Set');
  const body: string[] = [];
  for (const entry of entries) {
    const entity = file.use(`${packageOf(context, 'block')}.${entry.entityClass}`);
    body.push(
      '',
      `/** {@code ${entry.blockId}}. */`,
      `public static final ${type}<${entity}> ${entry.field} = ${registry}.register(${builtIn}.BLOCK_ENTITY_TYPE,`,
      `        ${identifierExpression(file, entry.blockId)}, new ${type}<>(${entity}::new, ${set}.of(ModBlocks.${entry.field})));`,
    );
  }
  const lines = [
    '/**',
    " * The block entity types of the container and machine blocks, each with its block's id, registered when the class",
    ' * loads (after the blocks).',
    ' */',
    'public final class ModBlockEntities {',
    ...indent(body.slice(1)),
    '',
    '    private ModBlockEntities() {}',
    '',
    '    /** Loads the class, registering every block entity type. */',
    '    public static void register() {}',
    '}',
  ];
  context.files.push({
    path: classPath(context, '', 'ModBlockEntities'),
    contents: file.render(lines),
  });
  return 'ModBlockEntities';
}
