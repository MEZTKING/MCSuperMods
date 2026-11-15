/**
 * Commands (ADR 0096 D1, D6): `ModCommands.java`, one Brigadier tree per command literal (the
 * name and each alias) registered through Fabric's `CommandRegistrationCallback` (which runs again
 * on every `/reload`; the command trees are then sent to every player, B440 S8). Each argument's
 * Brigadier type follows this target's `TargetFacts.commands.argumentTypes` ({@link ARGUMENT_TYPES},
 * checked against the facts by the targets test); optional arguments end the command, so every
 * node from the last required one on runs it. The permission level maps to `Commands.LEVEL_*`.
 *
 * Running a command: the arguments are written to command storage `<mod id>:args` as macro values
 * (`integer` an int, `number` a double, `word` and `text` the text, `boolean` a byte, `player` the
 * player's name (vanilla `give` refuses a UUID for a player, B464a), `entity` the entity's UUID,
 * `players` the names separated by spaces, `position` "x y z",
 * `block_position` "x y z", `item` and `block` the id), then `function <id> with storage <mod id>:args`
 * runs as and at the source with permission level 2 (`LevelBasedPermissionSet.GAMEMASTER`); the
 * `event` fires with the source entity as self and other (the player when it is one); `feedback`
 * is sent to the source on success. Macro text is raw, as in vanilla (B440 S8).
 *
 * Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import { eventMethod, eventMethods, fireCall, noteActions, readEvents } from './actions';
import { classPath, type GenerationContext } from './context';
import { identifierExpression, indent, JavaFile, javaString } from './java';
import { checkFormat, type Reader, readDefinition } from './read';

/**
 * MSM's twelve argument names as this target's `TargetFacts.commands.argumentTypes` writes them
 * (parser and properties), with the Brigadier builder and the getter the generated code uses.
 */
export const ARGUMENT_TYPES: Readonly<
  Record<
    string,
    {
      readonly parser: string;
      readonly properties?: Readonly<Record<string, string>>;
      readonly java: string;
    }
  >
> = {
  integer: { parser: 'brigadier:integer', java: 'IntegerArgumentType' },
  number: { parser: 'brigadier:double', java: 'DoubleArgumentType' },
  word: { parser: 'brigadier:string', properties: { type: 'word' }, java: 'StringArgumentType' },
  text: { parser: 'brigadier:string', properties: { type: 'greedy' }, java: 'StringArgumentType' },
  boolean: { parser: 'brigadier:bool', java: 'BoolArgumentType' },
  player: {
    parser: 'minecraft:entity',
    properties: { amount: 'single', type: 'players' },
    java: 'EntityArgument',
  },
  players: {
    parser: 'minecraft:entity',
    properties: { amount: 'multiple', type: 'players' },
    java: 'EntityArgument',
  },
  entity: {
    parser: 'minecraft:entity',
    properties: { amount: 'single', type: 'entities' },
    java: 'EntityArgument',
  },
  position: { parser: 'minecraft:vec3', java: 'Vec3Argument' },
  block_position: { parser: 'minecraft:block_pos', java: 'BlockPosArgument' },
  item: { parser: 'minecraft:item_stack', java: 'ItemArgument' },
  block: { parser: 'minecraft:block_state', java: 'BlockStateArgument' },
};

const ARGUMENT_CLASSES: Readonly<Record<string, string>> = {
  IntegerArgumentType: 'com.mojang.brigadier.arguments.IntegerArgumentType',
  DoubleArgumentType: 'com.mojang.brigadier.arguments.DoubleArgumentType',
  StringArgumentType: 'com.mojang.brigadier.arguments.StringArgumentType',
  BoolArgumentType: 'com.mojang.brigadier.arguments.BoolArgumentType',
  EntityArgument: 'net.minecraft.commands.arguments.EntityArgument',
  Vec3Argument: 'net.minecraft.commands.arguments.coordinates.Vec3Argument',
  BlockPosArgument: 'net.minecraft.commands.arguments.coordinates.BlockPosArgument',
  ItemArgument: 'net.minecraft.commands.arguments.item.ItemArgument',
  BlockStateArgument: 'net.minecraft.commands.arguments.blocks.BlockStateArgument',
};

const LEVELS = [
  'LEVEL_ALL',
  'LEVEL_MODERATORS',
  'LEVEL_GAMEMASTERS',
  'LEVEL_ADMINS',
  'LEVEL_OWNERS',
];

const LITERAL = /^[a-z0-9_]+$/;

interface ArgumentSpec {
  readonly name: string;
  readonly type: string;
  readonly min: number | undefined;
  readonly max: number | undefined;
  readonly optional: boolean;
}

interface CommandSpec {
  readonly input: DefinitionInput;
  readonly reader: Reader;
  readonly literals: readonly string[];
  readonly permission: number;
  readonly arguments: readonly ArgumentSpec[];
  readonly func: string | undefined;
  /** The event's method. */
  readonly event: string | undefined;
  readonly feedback: string | undefined;
}

function readCommand(input: DefinitionInput) {
  const reader = readDefinition(input);
  reader.onlyKeys(
    [
      'format',
      'name',
      'aliases',
      'permission',
      'arguments',
      'function',
      'event',
      'feedback',
      'events',
    ],
    'top-level key',
  );
  checkFormat(reader);
  const events = readEvents(reader, 'step_block', true);
  const literals = [reader.requiredString('name'), ...reader.strings('aliases', [])];
  for (const literal of literals) {
    if (!LITERAL.test(literal))
      reader.fail(`command name '${literal}' is not lower case [a-z0-9_]`);
  }
  const permission = reader.integer('permission', 0);
  if (permission < 0 || permission > 4) reader.fail('permission must be 0 to 4');
  const args = reader.objects('arguments').map((arg): ArgumentSpec => {
    arg.onlyKeys(['name', 'type', 'min', 'max', 'optional'], 'argument field');
    const name = arg.requiredString('name');
    if (!LITERAL.test(name)) arg.fail(`argument name '${name}' is not lower case [a-z0-9_]`);
    const type = arg.requiredString('type');
    if (!Object.hasOwn(ARGUMENT_TYPES, type)) arg.fail(`argument type '${type}' cannot be ejected`);
    return {
      name,
      type,
      min: arg.optionalNumber('min'),
      max: arg.optionalNumber('max'),
      optional: arg.boolean('optional', false),
    };
  });
  const firstOptional = args.findIndex((arg) => arg.optional);
  if (firstOptional >= 0 && args.slice(firstOptional).some((arg) => !arg.optional)) {
    reader.fail('optional arguments come only at the end (commands.optional-not-last)');
  }
  const textAt = args.findIndex((arg) => arg.type === 'text');
  if (textAt >= 0 && textAt !== args.length - 1) {
    reader.fail(
      'a text argument takes the rest of the line, so it comes last (commands.text-not-last)',
    );
  }
  const func = reader.optionalString('function');
  const eventId = reader.optionalString('event');
  if (func !== undefined && eventId !== undefined) {
    reader.fail(
      'function and event on one command cannot be ejected (commands.function-and-event)',
    );
  }
  const spec: CommandSpec = {
    input,
    reader,
    literals,
    permission,
    arguments: args,
    func,
    event: eventId === undefined ? undefined : eventMethod(reader, events, eventId),
    feedback: reader.optionalString('feedback'),
  };
  return { spec, events };
}

/** The Brigadier argument type expression of one argument. */
function argumentType(file: JavaFile, arg: ArgumentSpec): string {
  const info = ARGUMENT_TYPES[arg.type] as (typeof ARGUMENT_TYPES)[string];
  const cls = file.use(ARGUMENT_CLASSES[info.java] as string);
  const bounds = (
    method: string,
    lowest: string,
    highest: string,
    literal: (n: number) => string,
  ) =>
    arg.min === undefined && arg.max === undefined
      ? `${cls}.${method}()`
      : `${cls}.${method}(${arg.min === undefined ? lowest : literal(arg.min)}, ${arg.max === undefined ? highest : literal(arg.max)})`;
  switch (arg.type) {
    case 'integer':
      return bounds('integer', 'Integer.MIN_VALUE', 'Integer.MAX_VALUE', (n) =>
        String(Math.trunc(n)),
      );
    case 'number':
      return bounds('doubleArg', '-Double.MAX_VALUE', 'Double.MAX_VALUE', (n) =>
        Number.isInteger(n) ? `${n}.0` : String(n),
      );
    case 'word':
      return `${cls}.word()`;
    case 'text':
      return `${cls}.greedyString()`;
    case 'boolean':
      return `${cls}.bool()`;
    case 'player':
      return `${cls}.player()`;
    case 'players':
      return `${cls}.players()`;
    case 'entity':
      return `${cls}.entity()`;
    case 'position':
      return `${cls}.vec3()`;
    case 'block_position':
      return `${cls}.blockPos()`;
    case 'item':
      return `${cls}.item(buildContext)`;
    default:
      return `${cls}.block(buildContext)`;
  }
}

/** The statement putting one argument's macro value into `args`. */
function putArgument(file: JavaFile, arg: ArgumentSpec): string {
  const info = ARGUMENT_TYPES[arg.type] as (typeof ARGUMENT_TYPES)[string];
  const cls = file.use(ARGUMENT_CLASSES[info.java] as string);
  const name = javaString(arg.name);
  switch (arg.type) {
    case 'integer':
      return `args.putInt(${name}, ${cls}.getInteger(context, ${name}));`;
    case 'number':
      return `args.putDouble(${name}, ${cls}.getDouble(context, ${name}));`;
    case 'word':
    case 'text':
      return `args.putString(${name}, ${cls}.getString(context, ${name}));`;
    case 'boolean':
      return `args.putBoolean(${name}, ${cls}.getBool(context, ${name}));`;
    case 'player':
      return `args.putString(${name}, ${cls}.getPlayer(context, ${name}).getName().getString());`;
    case 'entity':
      return `args.putString(${name}, ${cls}.getEntity(context, ${name}).getStringUUID());`;
    case 'players': {
      const collectors = file.use('java.util.stream.Collectors');
      return `args.putString(${name}, ${cls}.getPlayers(context, ${name}).stream().map(p -> p.getName().getString()).collect(${collectors}.joining(" ")));`;
    }
    case 'position':
      return `args.putString(${name}, vec(${cls}.getVec3(context, ${name})));`;
    case 'block_position':
      return `args.putString(${name}, blockPos(${cls}.getBlockPos(context, ${name})));`;
    case 'item': {
      const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
      return `args.putString(${name}, ${builtIn}.ITEM.getKey(${cls}.getItem(context, ${name}).item().value()).toString());`;
    }
    default: {
      const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
      return `args.putString(${name}, ${builtIn}.BLOCK.getKey(${cls}.getBlock(context, ${name}).getState().getBlock()).toString());`;
    }
  }
}

/**
 * Generates `ModCommands.java`; returns its simple name, or `undefined` without commands.
 */
export function generateCommands(context: GenerationContext): string | undefined {
  const commands = context.input.commands ?? [];
  if (commands.length === 0) return undefined;
  const parsed = commands.map(readCommand);
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/command/*.json definitions',
  );
  const callback = file.use('net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback');
  const lifecycle = file.use('net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents');
  const dispatcherType = file.use('com.mojang.brigadier.CommandDispatcher');
  const contextType = file.use('com.mojang.brigadier.context.CommandContext');
  const source = file.use('net.minecraft.commands.CommandSourceStack');
  const buildContextType = file.use('net.minecraft.commands.CommandBuildContext');
  const commandsType = file.use('net.minecraft.commands.Commands');
  const literalBuilder = file.use('com.mojang.brigadier.builder.LiteralArgumentBuilder');
  const compound = file.use('net.minecraft.nbt.CompoundTag');
  const permissionSet = file.use('net.minecraft.server.permissions.LevelBasedPermissionSet');
  const component = file.use('net.minecraft.network.chat.Component');
  const serverPlayer = file.use('net.minecraft.server.level.ServerPlayer');
  const entityType = file.use('net.minecraft.world.entity.Entity');
  const playerType = file.use('net.minecraft.world.entity.player.Player');
  const blockPosType = file.use('net.minecraft.core.BlockPos');
  const vec3 = file.use('net.minecraft.world.phys.Vec3');
  const syntax = file.use('com.mojang.brigadier.exceptions.CommandSyntaxException');
  const storage = identifierExpression(file, `${context.input.modId}:args`);

  const registrations: string[] = [];
  const builders: string[] = [];
  const runs: string[] = [];
  const allEvents: string[] = [];
  let usesVec = false;
  let usesBlockPos = false;
  parsed.forEach(({ spec, events }, index) => {
    const n = index + 1;
    for (const literal of spec.literals) {
      registrations.push(
        `dispatcher.register(command${n}(${javaString(literal)}, buildContext)); // ${spec.input.id}`,
      );
    }
    const args = spec.arguments;
    // Every node from the last required argument on runs the command.
    const lastRequired = args.reduce((last, arg, i) => (arg.optional ? last : i), -1);
    const runsAt = (count: number) => count - 1 >= lastRequired;
    let chain = '';
    for (let i = args.length - 1; i >= 0; i--) {
      const arg = args[i] as ArgumentSpec;
      const node = `${commandsType}.argument(${javaString(arg.name)}, ${argumentType(file, arg)})`;
      const executes = runsAt(i + 1) ? `.executes(context -> run${n}(context, ${i + 1}))` : '';
      chain = `${node}${chain === '' ? '' : `.then(${chain})`}${executes}`;
    }
    const permission =
      spec.permission === 0
        ? ''
        : `.requires(${commandsType}.hasPermission(${commandsType}.${LEVELS[spec.permission]}))`;
    builders.push(
      '',
      `/** {@code /${spec.literals[0]}} (${spec.input.path}), under the literal {@code name}. */`,
      `private static ${literalBuilder}<${source}> command${n}(String name, ${buildContextType} buildContext) {`,
      `    return ${commandsType}.literal(name)${permission}${chain === '' ? '' : `.then(${chain})`}${runsAt(0) ? `.executes(context -> run${n}(context, 0))` : ''};`,
      '}',
    );
    const body: string[] = [`${source} source = context.getSource();`];
    if (spec.func !== undefined) {
      body.push(`${compound} args = new ${compound}();`);
      args.forEach((arg, i) => {
        if (arg.type === 'position') usesVec = true;
        if (arg.type === 'block_position') usesBlockPos = true;
        const put = putArgument(file, arg);
        body.push(
          arg.optional ? `if (present > ${i}) {` : '',
          arg.optional ? `    ${put}` : put,
          arg.optional ? '}' : '',
        );
      });
      body.push(
        `source.getServer().getCommandStorage().set(${storage}, args);`,
        `source.getServer().getCommands().performPrefixedCommand(source.withPermission(${permissionSet}.GAMEMASTER),`,
        `        "function " + ${javaString(spec.func.includes(':') ? spec.func : `minecraft:${spec.func}`)} + " with storage " + ${javaString(`${context.input.modId}:args`)});`,
      );
    } else if (spec.event !== undefined) {
      body.push(
        `${entityType} entity = source.getEntity();`,
        `${playerType} player = entity instanceof ${playerType} p ? p : null;`,
        `INSTANCE.${fireCall(spec.event, `source.getLevel(), ${blockPosType}.containing(source.getPosition()), source.getPosition(), player, player == null ? entity : null`)}`,
      );
    } else {
      body.push(
        '// Neither function nor event: a script listens to this command, and scripts are not ejected.',
      );
    }
    if (spec.feedback !== undefined) {
      body.push(
        `source.sendSuccess(() -> ${component}.translatable(${javaString(spec.feedback)}), false);`,
      );
    }
    body.push('return 1;');
    runs.push(
      '',
      `/** Runs {@code /${spec.literals[0]}} with the first {@code present} arguments given. */`,
      `private static int run${n}(${contextType}<${source}> context, int present) throws ${syntax} {`,
      ...indent(body.filter((line) => line !== '')),
      '}',
    );
    if (events.byId.size > 0) {
      const actions = noteActions(context, file, events);
      allEvents.push(...eventMethods(file, events, 'step_block', actions));
    }
  });
  if (parsed.filter(({ events }) => events.byId.size > 0).length > 1) {
    // Event method names are unique per definition only.
    const names = parsed.flatMap(({ events }) => [...events.methods.values()]);
    if (new Set(names).size !== names.length) {
      parsed[0]?.spec.reader.fail(
        'two commands declare events with the same name, which one ModCommands cannot hold (rename one)',
      );
    }
  }
  const owner = parsed.some(({ events }) => events.byId.size > 0);
  const helpers: string[] = [];
  if (usesVec) {
    helpers.push(
      '',
      `private static String vec(${vec3} pos) {`,
      '    return pos.x + " " + pos.y + " " + pos.z;',
      '}',
    );
  }
  if (usesBlockPos) {
    helpers.push(
      '',
      `private static String blockPos(${blockPosType} pos) {`,
      '    return pos.getX() + " " + pos.getY() + " " + pos.getZ();',
      '}',
    );
  }
  const lines = [
    '/** The commands: registered at start and again on every /reload. */',
    'public final class ModCommands {',
    ...(owner
      ? [
          `    private static final String OWNER = ${javaString(context.input.modId)};`,
          '    private static final ModCommands INSTANCE = new ModCommands();',
          '',
        ]
      : []),
    '    private ModCommands() {}',
    '',
    '    /** Registers the commands, and sends the command trees to every player after a reload. */',
    '    public static void register() {',
    `        ${callback}.EVENT.register((dispatcher, buildContext, selection) -> registerAll(dispatcher, buildContext));`,
    `        ${lifecycle}.END_DATA_PACK_RELOAD.register((server, resources, success) -> {`,
    `            for (${serverPlayer} player : server.getPlayerList().getPlayers()) {`,
    '                server.getCommands().sendCommands(player);',
    '            }',
    '        });',
    '    }',
    '',
    `    private static void registerAll(${dispatcherType}<${source}> dispatcher, ${buildContextType} buildContext) {`,
    ...indent(registrations, 2),
    '    }',
    ...indent(builders),
    ...indent(runs),
    ...indent(helpers),
    ...indent(allEvents),
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModCommands'), contents: file.render(lines) });
  return 'ModCommands';
}
