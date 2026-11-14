/**
 * Machines (ADR 0075 D11): `msm:machine` read with the runtime's rules (`BlockComponents.Machine`,
 * stricter where the runtime only logs: a recipe type that is neither a project machine nor one of
 * the four vanilla cooking types fails), the members of the block class (`MsmContainerBlock`'s
 * machine branches: the block entity, the server-only ticker, the furnace menu, `msm:on_interact`
 * after it, the comparator mode), one `block/<Name>BlockEntity.java` per machine over the shared
 * `MachineBlockEntity`, the shared classes copied from the runtime (`templates/machine-*-java.ts`)
 * and `ModRecipes.java`, which registers each machine's recipe type and serialiser with the
 * machine's id, as the runtime's `MachineRecipes.register`. The recipe files are the lowered data
 * files. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import {
  type BlockEntityMembers,
  type FiredEvent,
  fireEventMembers,
  interactMembers,
  namespacedId,
  newBlockEntityMembers,
  optionalId,
  removalMembers,
  type UseParts,
} from './containers';
import { classPath, type GenerationContext, packageOf } from './context';
import { identifierExpression, indent, JavaFile, javaFloat, javaInt } from './java';
import type { Reader } from './read';
import {
  machineBlockEntityJava,
  machineDataJava,
  machineSpecJava,
} from './templates/machine-block-entity-java';
import { machineFurnaceMenuJava, machineResultSlotJava } from './templates/machine-menu-java';
import {
  machineInputJava,
  machineRecipeJava,
  machineRecipesJava,
} from './templates/machine-recipe-java';

/** `msm:machine` fields (`BlockComponents.Machine.KEYS`). */
const MACHINE_KEYS = [
  'recipe_types',
  'power',
  'speed',
  'default_time',
  'menu',
  'hoppers',
  'comparator',
  'lit_light',
  'on_start',
  'on_finish',
];

/** The vanilla cooking recipe types a machine may take (`BlockComponents.Machine.COOKING_TYPES`). */
export const COOKING_TYPES = [
  'minecraft:smelting',
  'minecraft:blasting',
  'minecraft:smoking',
  'minecraft:campfire_cooking',
] as const;

const POWERS = ['fuel', 'redstone', 'always'] as const;
const MENUS = ['furnace', 'blast_furnace', 'smoker'] as const;
const COMPARATORS = ['contents', 'progress', 'none'] as const;

/** A parsed `msm:machine` with the runtime's defaults applied. */
export interface MachineInfo {
  /** The machine's own id. */
  readonly id: string;
  /** The recipe types in order: as written, else the machine's own id. */
  readonly recipeTypes: readonly string[];
  /** `FUEL`, `REDSTONE` or `ALWAYS`. */
  readonly power: string;
  readonly speed: number;
  readonly defaultTime: number;
  /** `FURNACE`, `BLAST_FURNACE` or `SMOKER`: as written, else from the first vanilla cooking type. */
  readonly menu: string;
  readonly hoppers: boolean;
  /** `CONTENTS`, `PROGRESS` or `NONE`. */
  readonly comparator: string;
  readonly litLight: number;
  readonly onStart: FiredEvent | undefined;
  readonly onFinish: FiredEvent | undefined;
  /** The component, for messages naming a recipe type. */
  readonly reader: Reader;
}

/**
 * Reads `msm:machine` with the runtime's ranges and defaults (ADR 0075 D1). The recipe types are
 * checked against the project's machines afterwards ({@link checkRecipeTypes}).
 *
 * @param id - The machine block's id.
 * @param component - The component.
 * @param event - Resolves an event id the component names to its method (fails when undeclared).
 */
export function readMachine(
  id: string,
  component: Reader,
  event: (reader: Reader, id: string) => string,
): MachineInfo {
  component.onlyKeys(MACHINE_KEYS, 'msm:machine field');
  let recipeTypes = [id];
  if (component.has('recipe_types')) {
    const raw = component.strings('recipe_types', []);
    if (raw.length < 1 || raw.length > 5) component.fail('recipe_types must list 1 to 5 ids');
    recipeTypes = raw.map((type) => namespacedId(component, 'recipe_types', type));
  }
  const power = component.enumConstant('power', POWERS, 'fuel');
  const speed = component.number('speed', 1);
  if (speed < 0.1 || speed > 10) component.fail('speed must be 0.1 to 10');
  const defaultTime = component.integer('default_time', 200);
  if (defaultTime < 1 || defaultTime > 32767) component.fail('default_time must be 1 to 32767');
  const litLight = component.integer('lit_light', 13);
  if (litLight < 0 || litLight > 15) component.fail('lit_light must be 0 to 15');
  let menu: string;
  if (component.has('menu')) menu = component.enumConstant('menu', MENUS, 'furnace');
  else {
    // The runtime's Machine.menu: from the first vanilla cooking type, otherwise a furnace.
    const first = recipeTypes.find((type) => (COOKING_TYPES as readonly string[]).includes(type));
    menu =
      first === 'minecraft:blasting'
        ? 'BLAST_FURNACE'
        : first === 'minecraft:smoking'
          ? 'SMOKER'
          : 'FURNACE';
  }
  const fired = (key: string): FiredEvent | undefined => {
    const eventId = component.optionalString(key);
    return eventId === undefined ? undefined : { id: eventId, method: event(component, eventId) };
  };
  return {
    id,
    recipeTypes,
    power,
    speed,
    defaultTime,
    menu,
    hoppers: component.boolean('hoppers', true),
    comparator: component.enumConstant('comparator', COMPARATORS, 'contents'),
    litLight,
    onStart: fired('on_start'),
    onFinish: fired('on_finish'),
    reader: component,
  };
}

/**
 * Fails when a machine lists a recipe type that is neither a project machine's id nor a vanilla
 * cooking type (the runtime logs it once and skips it).
 */
export function checkRecipeTypes(machines: readonly MachineInfo[]): void {
  const ids = new Set(machines.map((machine) => machine.id));
  for (const machine of machines) {
    for (const type of machine.recipeTypes) {
      if (!ids.has(type) && !(COOKING_TYPES as readonly string[]).includes(type)) {
        machine.reader.fail(
          `recipe_types: ${type} is neither a machine of the project nor one of ${COOKING_TYPES.join(', ')}`,
        );
      }
    }
  }
}

/**
 * The `Properties` light of a machine (the runtime's `MsmContainerBlock.machineLight`): `lit_light`
 * while `lit`, the `msm:light_emitter` level otherwise.
 *
 * @param blockClass - The block class as seen from `ModBlocks`.
 */
export function machineLightLine(blockClass: string, info: MachineInfo, idle: number): string {
  return `        .lightLevel(state -> state.getValue(${blockClass}.LIT) ? ${javaInt(info.litLight)} : ${javaInt(idle)}) // msm:machine lit_light while lit`;
}

/** The members of a machine block class (`MsmContainerBlock`'s machine branches, ADR 0075 D3–D5). */
export function machineBlockMembers(
  file: JavaFile,
  info: MachineInfo,
  parts: UseParts,
  types: string,
): BlockEntityMembers {
  const entityBlock = file.use('net.minecraft.world.level.block.EntityBlock');
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  const level = file.use('net.minecraft.world.level.Level');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const interactionResult = file.use('net.minecraft.world.InteractionResult');
  const hit = file.use('net.minecraft.world.phys.BlockHitResult');
  const blockEntity = file.use('net.minecraft.world.level.block.entity.BlockEntity');
  const ticker = file.use('net.minecraft.world.level.block.entity.BlockEntityTicker');
  const typeClass = file.use('net.minecraft.world.level.block.entity.BlockEntityType');
  const interfaces = [entityBlock];
  const fired = [info.onStart, info.onFinish].filter((e) => e !== undefined);
  if (fired.length > 0) interfaces.push('BlockEvents');
  const menu =
    info.menu === 'BLAST_FURNACE' ? 'blast furnace' : info.menu === 'SMOKER' ? 'smoker' : 'furnace';
  const members: string[] = [
    ...newBlockEntityMembers(file, parts.entityClass),
    '',
    '/** Machines tick on the server only (ADR 0075 D3). */',
    '@Override',
    `public <T extends ${blockEntity}> ${ticker}<T> getTicker(${level} level, ${blockState} state, ${typeClass}<T> type) {`,
    `    if (type != ${types}.${parts.typeField} || !(level instanceof ${serverLevel})) {`,
    '        return null;',
    '    }',
    '    return (tickLevel, pos, tickState, be) -> {',
    `        if (tickLevel instanceof ${serverLevel} server && be instanceof MachineBlockEntity machine) {`,
    '            machine.serverTick(server, pos, tickState);',
    '        }',
    '    };',
    '}',
    '',
    `/** Opens the ${menu} menu (holding an item opens it too, through vanilla's empty-hand fallback), then msm:on_interact. */`,
    '@Override',
    `protected ${interactionResult} useWithoutItem(${blockState} state, ${level} level, ${blockPos} pos, ${player} player, ${hit} hit) {`,
    '    if (!(level.getBlockEntity(pos) instanceof MachineBlockEntity machine)) {',
    `        return ${parts.onInteract === undefined ? `${interactionResult}.PASS` : 'interact(level, pos, player)'};`,
    '    }',
    `    if (level instanceof ${serverLevel}) {`,
    '        player.openMenu(machine); // a locked machine sends its own message and opens nothing',
    '    }',
    ...(parts.onInteract === undefined
      ? []
      : ['    interact(level, pos, player); // msm:on_interact']),
    `    return ${interactionResult}.SUCCESS;`,
    '}',
    ...interactMembers(file, parts.onInteract),
  ];
  if (info.comparator !== 'NONE') {
    const direction = file.use('net.minecraft.core.Direction');
    members.push(
      '',
      info.comparator === 'PROGRESS'
        ? '/** Comparators read the progress: ceil(15 * progress / total) while working, else 0. */'
        : '/** Comparators read the contents, as a furnace. */',
      '@Override',
      `protected boolean hasAnalogOutputSignal(${blockState} state) {`,
      '    return true;',
      '}',
      '',
      '@Override',
      `protected int getAnalogOutputSignal(${blockState} state, ${level} level, ${blockPos} pos, ${direction} direction) {`,
      '    return level.getBlockEntity(pos) instanceof MachineBlockEntity machine ? machine.comparatorSignal() : 0;',
      '}',
    );
  }
  members.push(...removalMembers(file), ...fireEventMembers(file, fired));
  return { interfaces, members };
}

/** Writes `block/<Name>BlockEntity.java` of a machine block. */
export function writeMachineEntityClass(
  context: GenerationContext,
  entityClass: string,
  typeField: string,
  info: MachineInfo,
): void {
  const javaPackage = packageOf(context, 'block');
  const file = new JavaFile(javaPackage, `the msm:machine of ${info.id}`);
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const list = file.use('java.util.List');
  const types = file.use(`${context.input.javaPackage}.ModBlockEntities`);
  const recipeTypes = info.recipeTypes.map((type) =>
    type === info.id ? 'ID' : identifierExpression(file, type),
  );
  const lines = [
    `/** The block entity of the machine {@code ${info.id}}: input, fuel and output slots (ADR 0075 D3). */`,
    `public class ${entityClass} extends MachineBlockEntity {`,
    '    /** The machine id, also its recipe type and serializer id. */',
    `    public static final ${identifier} ID = ${identifierExpression(file, info.id)};`,
    `    /** The msm:machine of {@code ${info.id}}. */`,
    `    public static final MachineSpec SPEC = new MachineSpec(${list}.of(${recipeTypes.join(', ')}), // recipe_types, in order`,
    `            MachineSpec.Power.${info.power}, ${javaFloat(info.speed)}, ${javaInt(info.defaultTime)}, MachineSpec.Menu.${info.menu}, // power, speed, default_time, menu`,
    `            ${info.hoppers}, MachineSpec.Comparator.${info.comparator}, ${javaInt(info.litLight)}, // hoppers, comparator, lit_light`,
    `            ${optionalId(file, info.onStart?.id)}, ${optionalId(file, info.onFinish?.id)}); // on_start, on_finish`,
    '',
    `    public ${entityClass}(${blockPos} pos, ${blockState} state) {`,
    `        super(${types}.${typeField}, pos, state, ID, SPEC);`,
    '    }',
    '}',
  ];
  context.files.push({
    path: classPath(context, 'block', entityClass),
    contents: file.render(lines),
  });
}

/** Writes the shared machine classes of `block/` and `recipe/` (copies of the runtime's). */
export function writeMachineFiles(context: GenerationContext): void {
  const blockPackage = packageOf(context, 'block');
  const recipePackage = packageOf(context, 'recipe');
  const block = (name: string, contents: string): void => {
    context.files.push({ path: classPath(context, 'block', name), contents });
  };
  const recipe = (name: string, contents: string): void => {
    context.files.push({ path: classPath(context, 'recipe', name), contents });
  };
  block('MachineSpec', machineSpecJava(blockPackage));
  block('MachineBlockEntity', machineBlockEntityJava(blockPackage, recipePackage));
  block('MachineData', machineDataJava(blockPackage));
  block('MachineFurnaceMenu', machineFurnaceMenuJava(blockPackage));
  block('MachineResultSlot', machineResultSlotJava(blockPackage));
  recipe('MachineRecipe', machineRecipeJava(recipePackage));
  recipe('MachineInput', machineInputJava(recipePackage));
  recipe('MachineRecipes', machineRecipesJava(recipePackage, blockPackage, context.input.modId));
}

/** A machine for `ModRecipes`. */
export interface RecipeEntry {
  readonly id: string;
  /** The `ModBlocks` field of the machine, also its `ModRecipes` field. */
  readonly field: string;
}

/**
 * Generates `ModRecipes.java`: each machine's recipe type and serialiser, with the machine's id
 * (ADR 0075 D2), registered when the class loads. Returns the class name, or `undefined`
 * without machines.
 */
export function generateRecipes(
  context: GenerationContext,
  machines: readonly RecipeEntry[],
): string | undefined {
  if (machines.length === 0) return undefined;
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm:machine components of the block definitions',
  );
  const recipes = file.use(`${packageOf(context, 'recipe')}.MachineRecipes`);
  const body: string[] = [];
  for (const machine of machines) {
    body.push(
      '',
      `/** The recipe type and serializer of the machine {@code ${machine.id}}: recipe files with {@code "type": "${machine.id}"}. */`,
      `public static final ${recipes}.Kind ${machine.field} = ${recipes}.register(${identifierExpression(file, machine.id)});`,
    );
  }
  const lines = [
    '/**',
    " * The machines' recipe types and serializers, each with its machine's id, registered when the class loads. The",
    ' * recipes are data files under data/<namespace>/recipe/ and reload with /reload.',
    ' */',
    'public final class ModRecipes {',
    ...indent(body.slice(1)),
    '',
    '    private ModRecipes() {}',
    '',
    '    /** Loads the class, registering every recipe type and serializer. */',
    '    public static void register() {}',
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModRecipes'), contents: file.render(lines) });
  return 'ModRecipes';
}
