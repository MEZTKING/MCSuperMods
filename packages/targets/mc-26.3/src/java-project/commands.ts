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
 * `block_position` "x y z", `item` and `block` the id; the 32 kinds of ADR 0111 D2 as the runtime's
 * `CommandArguments` hands them on: ids for the registry kinds, `#tag` for the tag kinds, ticks for
 * `time`, "yaw pitch" for `rotation`, the name for teams, objectives, score holders and game modes,
 * `#RRGGBB`, SNBT for `nbt`, the resolved text for `message`, and what was typed for the
 * predicates, `slot`, `text_component`, `int_range` and a dialog or loot table written in place),
 * then `function <id> with storage <mod id>:args`
 * runs as and at the source with permission level 2 (`LevelBasedPermissionSet.GAMEMASTER`); the
 * `event` fires with the source entity as self and other (the player when it is one); `feedback`
 * is sent to the source on success. Macro text is raw, as in vanilla (B440 S8). Every command, an
 * event or script one too, reads its given arguments first, as the runtime's `MsmCommands.run`
 * does, so a value checked only at run time (an unknown dimension) refuses the command.
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

/** One argument kind: its Brigadier parser as the facts write it, its Java class, type and value. */
interface ArgumentKind {
  readonly parser: string;
  readonly properties?: Readonly<Record<string, string>>;
  /** The fully qualified class of the argument type. */
  readonly java: string;
  /** The Brigadier type expression, given the class's simple name (integers and numbers are bounded elsewhere). */
  readonly type: (cls: string, file: JavaFile) => string;
  /**
   * The statements putting the macro value into `args`, given the class's simple name, the
   * argument's name as a Java string literal and the file (for imports).
   */
  readonly put: (cls: string, name: string, file: JavaFile) => string[];
}

const putText = (name: string, value: string): string[] => [`args.putString(${name}, ${value});`];
const registries = (file: JavaFile): string => file.use('net.minecraft.core.registries.Registries');
/** A registry-checked resource argument over `registry` (`Registries.<registry>`). */
const resource = (registry: string): Pick<ArgumentKind, 'type' | 'put'> => ({
  type: (cls, file) => `${cls}.resource(buildContext, ${registries(file)}.${registry})`,
  put: (cls, name, file) =>
    putText(
      name,
      `${cls}.getResource(context, ${name}, ${registries(file)}.${registry}).key().identifier().toString()`,
    ),
});
/** An argument whose macro value is what was typed, after the getter has checked it. */
const typedAfter =
  (getter: string): ArgumentKind['put'] =>
  (cls, name) => [
    `${cls}.${getter}(context, ${name});`,
    `args.putString(${name}, typed(context, ${name}));`,
  ];

/**
 * MSM's 44 argument kinds as this target's `TargetFacts.commands.argumentTypes` writes them
 * (parser and properties, in the facts' order), with the Brigadier type the generated code builds
 * and the macro value it hands on, exactly as the runtime's `CommandArguments` (ADR 0096 D1, ADR
 * 0111 D2 as amended after B525).
 */
export const ARGUMENT_TYPES: Readonly<Record<string, ArgumentKind>> = {
  integer: {
    parser: 'brigadier:integer',
    java: 'com.mojang.brigadier.arguments.IntegerArgumentType',
    type: (cls) => `${cls}.integer()`,
    put: (cls, name) => [`args.putInt(${name}, ${cls}.getInteger(context, ${name}));`],
  },
  number: {
    parser: 'brigadier:double',
    java: 'com.mojang.brigadier.arguments.DoubleArgumentType',
    type: (cls) => `${cls}.doubleArg()`,
    put: (cls, name) => [`args.putDouble(${name}, ${cls}.getDouble(context, ${name}));`],
  },
  word: {
    parser: 'brigadier:string',
    properties: { type: 'word' },
    java: 'com.mojang.brigadier.arguments.StringArgumentType',
    type: (cls) => `${cls}.word()`,
    put: (cls, name) => putText(name, `${cls}.getString(context, ${name})`),
  },
  text: {
    parser: 'brigadier:string',
    properties: { type: 'greedy' },
    java: 'com.mojang.brigadier.arguments.StringArgumentType',
    type: (cls) => `${cls}.greedyString()`,
    put: (cls, name) => putText(name, `${cls}.getString(context, ${name})`),
  },
  boolean: {
    parser: 'brigadier:bool',
    java: 'com.mojang.brigadier.arguments.BoolArgumentType',
    type: (cls) => `${cls}.bool()`,
    put: (cls, name) => [`args.putBoolean(${name}, ${cls}.getBool(context, ${name}));`],
  },
  player: {
    parser: 'minecraft:entity',
    properties: { amount: 'single', type: 'players' },
    java: 'net.minecraft.commands.arguments.EntityArgument',
    type: (cls) => `${cls}.player()`,
    put: (cls, name) => putText(name, `${cls}.getPlayer(context, ${name}).getName().getString()`),
  },
  players: {
    parser: 'minecraft:entity',
    properties: { amount: 'multiple', type: 'players' },
    java: 'net.minecraft.commands.arguments.EntityArgument',
    type: (cls) => `${cls}.players()`,
    put: (cls, name, file) =>
      putText(
        name,
        `${cls}.getPlayers(context, ${name}).stream().map(p -> p.getName().getString()).collect(${file.use('java.util.stream.Collectors')}.joining(" "))`,
      ),
  },
  entity: {
    parser: 'minecraft:entity',
    properties: { amount: 'single', type: 'entities' },
    java: 'net.minecraft.commands.arguments.EntityArgument',
    type: (cls) => `${cls}.entity()`,
    put: (cls, name) => putText(name, `${cls}.getEntity(context, ${name}).getStringUUID()`),
  },
  position: {
    parser: 'minecraft:vec3',
    java: 'net.minecraft.commands.arguments.coordinates.Vec3Argument',
    type: (cls) => `${cls}.vec3()`,
    put: (cls, name) => putText(name, `vec(${cls}.getVec3(context, ${name}))`),
  },
  block_position: {
    parser: 'minecraft:block_pos',
    java: 'net.minecraft.commands.arguments.coordinates.BlockPosArgument',
    type: (cls) => `${cls}.blockPos()`,
    put: (cls, name) => putText(name, `blockPos(${cls}.getBlockPos(context, ${name}))`),
  },
  item: {
    parser: 'minecraft:item_stack',
    java: 'net.minecraft.commands.arguments.item.ItemArgument',
    type: (cls) => `${cls}.item(buildContext)`,
    put: (cls, name, file) =>
      putText(
        name,
        `${file.use('net.minecraft.core.registries.BuiltInRegistries')}.ITEM.getKey(${cls}.getItem(context, ${name}).item().value()).toString()`,
      ),
  },
  block: {
    parser: 'minecraft:block_state',
    java: 'net.minecraft.commands.arguments.blocks.BlockStateArgument',
    type: (cls) => `${cls}.block(buildContext)`,
    put: (cls, name, file) =>
      putText(
        name,
        `${file.use('net.minecraft.core.registries.BuiltInRegistries')}.BLOCK.getKey(${cls}.getBlock(context, ${name}).getState().getBlock()).toString()`,
      ),
  },
  // The 32 of ADR 0111 D2 (plugin API 1.20.0), in the facts' order.
  dimension: {
    parser: 'minecraft:dimension',
    java: 'net.minecraft.commands.arguments.DimensionArgument',
    type: (cls) => `${cls}.dimension()`,
    put: (cls, name) =>
      putText(name, `${cls}.getDimension(context, ${name}).dimension().identifier().toString()`),
  },
  time: {
    parser: 'minecraft:time',
    java: 'net.minecraft.commands.arguments.TimeArgument',
    type: (cls) => `${cls}.time()`,
    put: (_cls, name, file) => [
      `args.putInt(${name}, ${file.use('com.mojang.brigadier.arguments.IntegerArgumentType')}.getInteger(context, ${name}));`,
    ],
  },
  team_colour: {
    parser: 'minecraft:team_color',
    java: 'net.minecraft.commands.arguments.TeamColorArgument',
    type: (cls) => `${cls}.teamColor()`,
    put: (cls, name) => putText(name, `${cls}.getTeamColor(context, ${name}).getSerializedName()`),
  },
  hex_colour: {
    parser: 'minecraft:hex_color',
    java: 'net.minecraft.commands.arguments.HexColorArgument',
    type: (cls) => `${cls}.hexColor()`,
    put: (cls, name, file) =>
      putText(
        name,
        `String.format(${file.use('java.util.Locale')}.ROOT, "#%06X", ${cls}.getHexColor(context, ${name}) & 0xFFFFFF)`,
      ),
  },
  rotation: {
    parser: 'minecraft:rotation',
    java: 'net.minecraft.commands.arguments.coordinates.RotationArgument',
    type: (cls) => `${cls}.rotation()`,
    put: (cls, name) =>
      putText(
        name,
        `rotation(${cls}.getRotation(context, ${name}).getRotation(context.getSource()))`,
      ),
  },
  angle: {
    parser: 'minecraft:angle',
    java: 'net.minecraft.commands.arguments.AngleArgument',
    type: (cls) => `${cls}.angle()`,
    put: (cls, name) => [`args.putFloat(${name}, ${cls}.getAngle(context, ${name}));`],
  },
  uuid: {
    parser: 'minecraft:uuid',
    java: 'net.minecraft.commands.arguments.UuidArgument',
    type: (cls) => `${cls}.uuid()`,
    put: (cls, name) => putText(name, `${cls}.getUuid(context, ${name}).toString()`),
  },
  objective: {
    parser: 'minecraft:objective',
    java: 'net.minecraft.commands.arguments.ObjectiveArgument',
    type: (cls) => `${cls}.objective()`,
    put: (cls, name) => putText(name, `${cls}.getObjective(context, ${name}).getName()`),
  },
  score_holder: {
    parser: 'minecraft:score_holder',
    properties: { amount: 'single' },
    java: 'net.minecraft.commands.arguments.ScoreHolderArgument',
    type: (cls) => `${cls}.scoreHolder()`,
    put: (cls, name) => putText(name, `${cls}.getName(context, ${name}).getScoreboardName()`),
  },
  score_holders: {
    parser: 'minecraft:score_holder',
    properties: { amount: 'multiple' },
    java: 'net.minecraft.commands.arguments.ScoreHolderArgument',
    type: (cls) => `${cls}.scoreHolders()`,
    put: (cls, name, file) =>
      putText(
        name,
        `${cls}.getNames(context, ${name}).stream().map(${file.use('net.minecraft.world.scores.ScoreHolder')}::getScoreboardName).collect(${file.use('java.util.stream.Collectors')}.joining(" "))`,
      ),
  },
  item_predicate: {
    parser: 'minecraft:item_predicate',
    java: 'net.minecraft.commands.arguments.item.ItemPredicateArgument',
    type: (cls) => `${cls}.itemPredicate(buildContext)`,
    put: typedAfter('getItemPredicate'),
  },
  block_predicate: {
    parser: 'minecraft:block_predicate',
    java: 'net.minecraft.commands.arguments.blocks.BlockPredicateArgument',
    type: (cls) => `${cls}.blockPredicate(buildContext)`,
    put: typedAfter('getBlockPredicate'),
  },
  effect: {
    parser: 'minecraft:resource',
    properties: { registry: 'minecraft:mob_effect' },
    java: 'net.minecraft.commands.arguments.ResourceArgument',
    ...resource('MOB_EFFECT'),
  },
  enchantment: {
    parser: 'minecraft:resource',
    properties: { registry: 'minecraft:enchantment' },
    java: 'net.minecraft.commands.arguments.ResourceArgument',
    ...resource('ENCHANTMENT'),
  },
  biome: {
    parser: 'minecraft:resource',
    properties: { registry: 'minecraft:worldgen/biome' },
    java: 'net.minecraft.commands.arguments.ResourceArgument',
    ...resource('BIOME'),
  },
  biome_or_tag: {
    parser: 'minecraft:resource_or_tag',
    properties: { registry: 'minecraft:worldgen/biome' },
    java: 'net.minecraft.commands.arguments.ResourceOrTagArgument',
    type: (cls, file) => `${cls}.resourceOrTag(buildContext, ${registries(file)}.BIOME)`,
    put: (cls, name, file) =>
      putText(
        name,
        `${cls}.getResourceOrTag(context, ${name}, ${registries(file)}.BIOME).asPrintable()`,
      ),
  },
  // Key types: a registry-checked argument over structures disconnects every client (B525).
  structure: {
    parser: 'minecraft:resource_key',
    properties: { registry: 'minecraft:worldgen/structure' },
    java: 'net.minecraft.commands.arguments.ResourceKeyArgument',
    type: (cls, file) => `${cls}.key(${registries(file)}.STRUCTURE)`,
    put: (cls, name) =>
      putText(name, `${cls}.getStructure(context, ${name}).key().identifier().toString()`),
  },
  structure_or_tag: {
    parser: 'minecraft:resource_or_tag_key',
    properties: { registry: 'minecraft:worldgen/structure' },
    java: 'net.minecraft.commands.arguments.ResourceOrTagKeyArgument',
    type: (cls, file) => `${cls}.resourceOrTagKey(${registries(file)}.STRUCTURE)`,
    put: (cls, name, file) =>
      putText(
        name,
        `${cls}.getResourceOrTagKey(context, ${name}, ${registries(file)}.STRUCTURE, NO_STRUCTURE).asPrintable()`,
      ),
  },
  entity_type: {
    parser: 'minecraft:resource',
    properties: { registry: 'minecraft:entity_type' },
    java: 'net.minecraft.commands.arguments.ResourceArgument',
    ...resource('ENTITY_TYPE'),
  },
  particle: {
    parser: 'minecraft:particle',
    java: 'net.minecraft.commands.arguments.ParticleArgument',
    type: (cls) => `${cls}.particle(buildContext)`,
    put: (cls, name, file) =>
      putText(
        name,
        `String.valueOf(${file.use('net.minecraft.core.registries.BuiltInRegistries')}.PARTICLE_TYPE.getKey(${cls}.getParticle(context, ${name}).getType()))`,
      ),
  },
  game_mode: {
    parser: 'minecraft:gamemode',
    java: 'net.minecraft.commands.arguments.GameModeArgument',
    type: (cls) => `${cls}.gameMode()`,
    put: (cls, name) => putText(name, `${cls}.getGameMode(context, ${name}).getName()`),
  },
  text_component: {
    parser: 'minecraft:component',
    java: 'net.minecraft.commands.arguments.ComponentArgument',
    type: (cls) => `${cls}.textComponent(buildContext)`,
    put: typedAfter('getResolvedComponent'),
  },
  int_range: {
    parser: 'minecraft:int_range',
    java: 'net.minecraft.commands.arguments.RangeArgument',
    type: (cls) => `${cls}.intRange()`,
    put: (cls, name) => [
      `${cls}.Ints.getRange(context, ${name});`,
      `args.putString(${name}, typed(context, ${name}));`,
    ],
  },
  identifier: {
    parser: 'minecraft:resource_location',
    java: 'net.minecraft.commands.arguments.IdentifierArgument',
    type: (cls) => `${cls}.id()`,
    put: (cls, name) => putText(name, `${cls}.getId(context, ${name}).toString()`),
  },
  team: {
    parser: 'minecraft:team',
    java: 'net.minecraft.commands.arguments.TeamArgument',
    type: (cls) => `${cls}.team()`,
    put: (cls, name) => putText(name, `${cls}.getTeam(context, ${name}).getName()`),
  },
  slot: {
    parser: 'minecraft:item_slot',
    java: 'net.minecraft.commands.arguments.SlotArgument',
    type: (cls) => `${cls}.slot()`,
    put: typedAfter('getSlot'),
  },
  nbt: {
    parser: 'minecraft:nbt_compound_tag',
    java: 'net.minecraft.commands.arguments.CompoundTagArgument',
    type: (cls) => `${cls}.compoundTag()`,
    put: (cls, name) => putText(name, `${cls}.getCompoundTag(context, ${name}).toString()`),
  },
  message: {
    parser: 'minecraft:message',
    java: 'net.minecraft.commands.arguments.MessageArgument',
    type: (cls) => `${cls}.message()`,
    put: (cls, name) => putText(name, `${cls}.getMessage(context, ${name}).getString()`),
  },
  dialog: {
    parser: 'minecraft:dialog',
    java: 'net.minecraft.commands.arguments.ResourceOrIdArgument',
    type: (cls) => `${cls}.dialog(buildContext)`,
    put: (cls, name) =>
      putText(
        name,
        `${cls}.getDialog(context, ${name}).unwrapKey().map(k -> k.identifier().toString()).orElseGet(() -> typed(context, ${name}))`,
      ),
  },
  loot_table: {
    parser: 'minecraft:loot_table',
    java: 'net.minecraft.commands.arguments.ResourceOrIdArgument',
    type: (cls) => `${cls}.lootTable(buildContext)`,
    put: (cls, name) =>
      putText(
        name,
        `${cls}.getLootTable(context, ${name}).unwrapKey().map(k -> k.identifier().toString()).orElseGet(() -> typed(context, ${name}))`,
      ),
  },
  advancement: {
    parser: 'minecraft:resource_key',
    properties: { registry: 'minecraft:advancement' },
    java: 'net.minecraft.commands.arguments.ResourceKeyArgument',
    type: (cls, file) => `${cls}.key(${registries(file)}.ADVANCEMENT)`,
    put: (cls, name) => putText(name, `${cls}.getAdvancement(context, ${name}).id().toString()`),
  },
  recipe: {
    parser: 'minecraft:resource_key',
    properties: { registry: 'minecraft:recipe' },
    java: 'net.minecraft.commands.arguments.ResourceKeyArgument',
    type: (cls, file) => `${cls}.key(${registries(file)}.RECIPE)`,
    put: (cls, name) =>
      putText(name, `${cls}.getRecipe(context, ${name}).id().identifier().toString()`),
  },
};

/** The kinds that take the rest of the line, so they come last (`commands.text-not-last`). */
const REST_OF_LINE = new Set(['text', 'message']);
/** The helper each kind's value needs in `ModCommands`. */
const HELPERS: Readonly<Record<string, 'vec' | 'blockPos' | 'rotation' | 'typed' | 'noStructure'>> =
  {
    position: 'vec',
    block_position: 'blockPos',
    rotation: 'rotation',
    item_predicate: 'typed',
    block_predicate: 'typed',
    text_component: 'typed',
    int_range: 'typed',
    slot: 'typed',
    dialog: 'typed',
    loot_table: 'typed',
    structure_or_tag: 'noStructure',
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
  const textAt = args.findIndex((arg) => REST_OF_LINE.has(arg.type));
  if (textAt >= 0 && textAt !== args.length - 1) {
    reader.fail(
      `a ${args[textAt]?.type} argument takes the rest of the line, so it comes last (commands.text-not-last)`,
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
  const info = ARGUMENT_TYPES[arg.type] as ArgumentKind;
  const cls = file.use(info.java);
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
    default:
      return info.type(cls, file);
  }
}

/** The statements putting one argument's macro value into `args`. */
function putArgument(file: JavaFile, arg: ArgumentSpec): string[] {
  const info = ARGUMENT_TYPES[arg.type] as ArgumentKind;
  return info.put(file.use(info.java), javaString(arg.name), file);
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
  const helpersUsed = new Set<string>();
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
    // Every given argument is read first, whatever the command runs, as the runtime's
    // `MsmCommands.run` does: a getter that checks at run time (an unknown dimension, as vanilla's
    // `execute in`; an unknown structure) refuses the command before anything happens (B541 fix).
    if (args.length > 0) {
      body.push(`${compound} args = new ${compound}();`);
      args.forEach((arg, i) => {
        const helper = HELPERS[arg.type];
        if (helper !== undefined) helpersUsed.add(helper);
        const put = putArgument(file, arg);
        if (arg.optional) body.push(`if (present > ${i}) {`, ...indent(put), '}');
        else body.push(...put);
      });
    }
    if (spec.func !== undefined) {
      if (args.length === 0) body.push(`${compound} args = new ${compound}();`);
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
  if (helpersUsed.has('noStructure')) {
    const exceptionType = file.use('com.mojang.brigadier.exceptions.DynamicCommandExceptionType');
    helpers.push(
      '',
      "/** Refused {@code structure_or_tag} ids, as vanilla's {@code /locate} words it. */",
      `private static final ${exceptionType} NO_STRUCTURE = new ${exceptionType}(`,
      `        id -> ${component}.literal("There is no structure or structure tag \\"" + id + "\\""));`,
    );
  }
  if (helpersUsed.has('vec')) {
    helpers.push(
      '',
      `private static String vec(${vec3} pos) {`,
      '    return pos.x + " " + pos.y + " " + pos.z;',
      '}',
    );
  }
  if (helpersUsed.has('blockPos')) {
    helpers.push(
      '',
      `private static String blockPos(${blockPosType} pos) {`,
      '    return pos.getX() + " " + pos.getY() + " " + pos.getZ();',
      '}',
    );
  }
  if (helpersUsed.has('rotation')) {
    const vec2 = file.use('net.minecraft.world.phys.Vec2');
    helpers.push(
      '',
      '/** "yaw pitch": the parsed rotation holds the pitch in x and the yaw in y (B525). */',
      `private static String rotation(${vec2} rotation) {`,
      '    return rotation.y + " " + rotation.x;',
      '}',
    );
  }
  if (helpersUsed.has('typed')) {
    const parsedNode = file.use('com.mojang.brigadier.context.ParsedCommandNode');
    const argumentNode = file.use('com.mojang.brigadier.tree.ArgumentCommandNode');
    helpers.push(
      '',
      "/** What was typed for argument {@code name}, exactly (Brigadier's parsed node range over the input). */",
      `private static String typed(${contextType}<${source}> context, String name) {`,
      `    for (${contextType}<${source}> c = context; c != null; c = c.getChild()) {`,
      `        for (${parsedNode}<${source}> node : c.getNodes()) {`,
      `            if (node.getNode() instanceof ${argumentNode}<?, ?> arg && arg.getName().equals(name)) {`,
      '                return node.getRange().get(c.getInput());',
      '            }',
      '        }',
      '    }',
      '    return "";',
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
