/**
 * Blocks: `ModBlocks.java` (registration as the runtime's `MsmRegistrar.registerBlock`: the
 * block with `BlockBehaviour.Properties.of().setId(key).strength(h, r).sound(...)`, light,
 * tool requirement and loot table override; the block item with
 * `useBlockDescriptionPrefix().stacksTo(n).rarity(r)`; creative tabs through
 * `CreativeModeTabEvents.modifyOutputEvent`) and one `block/<Name>Block.java` per block with
 * events or redstone behaviour, mirroring `MsmBlock` (interact, step with a cooldown map keyed
 * by dimension, position and entity, redstone `POWERED` state and `neighborChanged`). A step
 * event carries the stepper as the runtime's `EventContext.forBlockStep` (ADR 0058 D1): the
 * player when it is one, else the `entity` argument. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import {
  type EventOwnerKind,
  type Events,
  eventMethod,
  eventMethods,
  fireCall,
  noteActions,
  readEvents,
} from './actions';
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

/** The block sound types (`::msm::definition::SoundType`), each a `SoundType` constant. */
export const SOUND_TYPES = [
  'stone',
  'wood',
  'gravel',
  'grass',
  'metal',
  'glass',
  'wool',
  'sand',
  'snow',
  'ladder',
  'anvil',
  'slime_block',
  'honey_block',
  'coral_block',
  'bamboo',
  'bamboo_wood',
  'cherry_wood',
  'nether_wood',
  'netherrack',
  'nether_bricks',
  'nether_ore',
  'basalt',
  'bone_block',
  'soul_sand',
  'soul_soil',
  'amethyst',
  'amethyst_cluster',
  'calcite',
  'tuff',
  'deepslate',
  'deepslate_bricks',
  'deepslate_tiles',
  'polished_deepslate',
  'copper',
  'mud',
  'mud_bricks',
  'packed_mud',
  'moss',
  'lantern',
  'sculk',
] as const;

/** Item rarities, each a `Rarity` constant. */
export const RARITIES = ['common', 'uncommon', 'rare', 'epic'] as const;

const BLOCK_KEYS = ['format', 'sound_type', 'loot_table', 'item', 'components', 'events'];
const BLOCK_COMPONENTS = [
  'msm:breakable',
  'msm:light_emitter',
  'msm:on_interact',
  'msm:on_step',
  'msm:redstone',
];

/** A parsed block definition. */
interface BlockSpec {
  readonly input: DefinitionInput;
  readonly reader: Reader;
  readonly soundType: string;
  readonly lootTable: string | undefined;
  readonly item:
    | { creativeTab: string | undefined; maxStackSize: number; rarity: string }
    | undefined;
  readonly hardness: number;
  readonly resistance: number;
  readonly requiresTool: boolean;
  readonly light: number | undefined;
  /** `step_block` with `msm:on_step` (events may run with a stepping entity), else `block`. */
  readonly kind: EventOwnerKind;
  readonly events: Events;
  /** Method of the `msm:on_interact` event. */
  readonly onInteract: string | undefined;
  readonly onStep: { method: string; cooldown: number } | undefined;
  readonly emit: number;
  readonly onPowered: string | undefined;
  readonly onUnpowered: string | undefined;
}

function readBlock(input: DefinitionInput): BlockSpec {
  const reader = readDefinition(input);
  reader.onlyKeys(BLOCK_KEYS, 'top-level key');
  checkFormat(reader);
  const components = reader.object('components');
  components?.onlyKeys(BLOCK_COMPONENTS, 'component');
  const kind: EventOwnerKind = components?.has('msm:on_step') ? 'step_block' : 'block';
  const events = readEvents(reader, kind);

  let item: BlockSpec['item'];
  const rawItem = input.definition.item;
  if (rawItem === false) item = undefined;
  else if (rawItem === true) reader.fail('item must be an object or false');
  else {
    const settings = reader.object('item');
    settings?.onlyKeys(['creative_tab', 'max_stack_size', 'rarity'], 'item key');
    item = {
      creativeTab: settings?.optionalString('creative_tab'),
      maxStackSize: settings?.integer('max_stack_size', 64) ?? 64,
      rarity: settings?.enumConstant('rarity', RARITIES, 'common') ?? 'COMMON',
    };
  }

  const breakable = components?.object('msm:breakable');
  breakable?.onlyKeys(['hardness', 'resistance', 'requires_tool'], 'msm:breakable field');
  const light = components?.object('msm:light_emitter');
  light?.onlyKeys(['level'], 'msm:light_emitter field');
  const interact = components?.object('msm:on_interact');
  interact?.onlyKeys(['event'], 'msm:on_interact field');
  const step = components?.object('msm:on_step');
  step?.onlyKeys(['event', 'cooldown_ticks'], 'msm:on_step field');
  const redstone = components?.object('msm:redstone');
  redstone?.onlyKeys(['emit', 'on_powered', 'on_unpowered'], 'msm:redstone field');
  const powered = redstone?.optionalString('on_powered');
  const unpowered = redstone?.optionalString('on_unpowered');

  return {
    input,
    reader,
    soundType: reader.enumConstant('sound_type', SOUND_TYPES, 'stone'),
    lootTable: reader.optionalString('loot_table'),
    item,
    hardness: breakable?.number('hardness', 1.5) ?? 1.5,
    resistance: breakable?.number('resistance', 6) ?? 6,
    requiresTool: breakable?.boolean('requires_tool', false) ?? false,
    light: light?.requiredInteger('level'),
    kind,
    events,
    onInteract:
      interact === undefined
        ? undefined
        : eventMethod(interact, events, interact.requiredString('event')),
    onStep:
      step === undefined
        ? undefined
        : {
            method: eventMethod(step, events, step.requiredString('event')),
            cooldown: step.integer('cooldown_ticks', 0),
          },
    emit: redstone?.integer('emit', 0) ?? 0,
    onPowered:
      powered === undefined || redstone === undefined
        ? undefined
        : eventMethod(redstone, events, powered),
    onUnpowered:
      unpowered === undefined || redstone === undefined
        ? undefined
        : eventMethod(redstone, events, unpowered),
  };
}

/** Whether the block needs its own class (events reachable from a component, or redstone). */
function needsClass(spec: BlockSpec): boolean {
  return (
    spec.onInteract !== undefined || spec.onStep !== undefined || spec.emit > 0 || tracksPower(spec)
  );
}

function tracksPower(spec: BlockSpec): boolean {
  return spec.onPowered !== undefined || spec.onUnpowered !== undefined;
}

/**
 * Generates `ModBlocks.java` and the block classes; returns nothing when there are no blocks.
 *
 * @returns The simple name of the registration class, or `undefined`.
 */
export function generateBlocks(
  context: GenerationContext,
  classNames: NameTable,
): string | undefined {
  const { blocks } = context.input;
  if (blocks.length === 0) return undefined;
  const specs = blocks.map(readBlock);
  const fields = new NameTable();
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/block/*.json definitions',
  );
  const registry = file.use('net.minecraft.core.Registry');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const registries = file.use('net.minecraft.core.registries.Registries');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const blockType = file.use('net.minecraft.world.level.block.Block');
  const properties = file.use('net.minecraft.world.level.block.state.BlockBehaviour', 'Properties');
  const soundType = file.use('net.minecraft.world.level.block.SoundType');

  const body: string[] = [];
  const tabs: string[] = [];
  for (const spec of specs) {
    const { path } = splitId(spec.input.id);
    const field = fields.take(constantName(path), (name) => [
      name,
      `${name}_KEY`,
      `${name}_ITEM`,
      `${name}_ITEM_KEY`,
    ]);
    let type = blockType;
    if (needsClass(spec)) {
      const name = classNames.take(className(path, 'Block'), (n) => [`block.${n}`], '');
      writeBlockClass(context, spec, name);
      type = file.use(`${packageOf(context, 'block')}.${name}`);
    }
    const props = [
      `${properties}.of()`,
      `        .setId(${field}_KEY)`,
      `        .strength(${javaFloat(spec.hardness)}, ${javaFloat(spec.resistance)})`,
      `        .sound(${soundType}.${spec.soundType})`,
    ];
    if (spec.light !== undefined)
      props.push(`        .lightLevel(state -> ${javaInt(spec.light)})`);
    if (spec.requiresTool) props.push('        .requiresCorrectToolForDrops()');
    if (spec.lootTable !== undefined) {
      const optional = file.use('java.util.Optional');
      props.push(
        `        .overrideLootTable(${optional}.of(${resourceKey}.create(${registries}.LOOT_TABLE, ${identifierExpression(file, spec.lootTable)})))`,
      );
    }
    props[props.length - 1] += `));`;
    body.push(
      '',
      `/** {@code ${spec.input.id}} (${spec.input.path}). */`,
      `public static final ${resourceKey}<${blockType}> ${field}_KEY = ${resourceKey}.create(${registries}.BLOCK, ${identifierExpression(file, spec.input.id)});`,
      `public static final ${type} ${field} = ${registry}.register(${builtIn}.BLOCK, ${field}_KEY, new ${type}(${props[0]}`,
      ...props.slice(1),
    );
    if (spec.item !== undefined) {
      const item = file.use('net.minecraft.world.item.Item');
      const blockItem = file.use('net.minecraft.world.item.BlockItem');
      const rarity = file.use('net.minecraft.world.item.Rarity');
      body.push(
        `public static final ${resourceKey}<${item}> ${field}_ITEM_KEY = ${resourceKey}.create(${registries}.ITEM, ${field}_KEY.identifier());`,
        `public static final ${blockItem} ${field}_ITEM = ${registry}.register(${builtIn}.ITEM, ${field}_ITEM_KEY, new ${blockItem}(${field}, new ${item}.Properties()`,
        `        .setId(${field}_ITEM_KEY)`,
        '        .useBlockDescriptionPrefix() // name from block.<namespace>.<path>, as vanilla block items do',
        `        .stacksTo(${javaInt(spec.item.maxStackSize)})`,
        `        .rarity(${rarity}.${spec.item.rarity})));`,
      );
      if (spec.item.creativeTab !== undefined)
        tabs.push(tabLine(file, spec.item.creativeTab, `${field}_ITEM`));
    }
  }
  const lines = [
    '/** The blocks and block items, registered when the class loads. */',
    'public final class ModBlocks {',
    ...indent(body.slice(1)),
    '',
    '    private ModBlocks() {}',
    '',
    '    /** Loads the class (registering every block) and adds the block items to their creative tabs. */',
    '    public static void register() {',
    ...indent(tabs, 2),
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModBlocks'), contents: file.render(lines) });
  return 'ModBlocks';
}

/**
 * A creative tab registration: `CreativeModeTabEvents.modifyOutputEvent(key).register(...)`.
 * An unknown tab never fires, as in the runtime.
 */
export function tabLine(file: JavaFile, tab: string, field: string): string {
  const events = file.use('net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const registries = file.use('net.minecraft.core.registries.Registries');
  return `${events}.modifyOutputEvent(${resourceKey}.create(${registries}.CREATIVE_MODE_TAB, ${identifierExpression(file, tab)})).register(output -> output.accept(${field}));`;
}

function writeBlockClass(context: GenerationContext, spec: BlockSpec, name: string): void {
  const javaPackage = packageOf(context, 'block');
  const file = new JavaFile(javaPackage, spec.input.path);
  const blockType = file.use('net.minecraft.world.level.block.Block');
  const properties = file.use('net.minecraft.world.level.block.state.BlockBehaviour', 'Properties');
  const actions = noteActions(context, file, spec.events);
  const power = tracksPower(spec);

  const members: string[] = [];
  if (spec.events.byId.size > 0)
    members.push(`private static final String OWNER = ${javaString(spec.input.id)};`);
  if (power) {
    const booleanProperty = file.use(
      'net.minecraft.world.level.block.state.properties.BooleanProperty',
    );
    const blockStateProperties = file.use(
      'net.minecraft.world.level.block.state.properties.BlockStateProperties',
    );
    if (members.length > 0) members.push('');
    members.push(
      '/** The last seen neighbour power, for the msm:redstone events. */',
      `public static final ${booleanProperty} POWERED = ${blockStateProperties}.POWERED;`,
    );
  }
  if (spec.onStep !== undefined) {
    const map = file.use('java.util.Map');
    const hashMap = file.use('java.util.HashMap');
    const uuid = file.use('java.util.UUID');
    const resourceKey = file.use('net.minecraft.resources.ResourceKey');
    const levelType = file.use('net.minecraft.world.level.Level');
    members.push(
      '',
      '/** Last step tick per dimension, position and entity, for the msm:on_step cooldown. Server thread only. */',
      `private final ${map}<StepKey, Long> lastStep = new ${hashMap}<>();`,
      '',
      `private record StepKey(${resourceKey}<${levelType}> dimension, long pos, ${uuid} entity) {}`,
    );
  }
  members.push('', `public ${name}(${properties} properties) {`, '    super(properties);');
  if (power)
    members.push('    registerDefaultState(stateDefinition.any().setValue(POWERED, false));');
  members.push('}');

  if (power) {
    const stateDefinition = file.use('net.minecraft.world.level.block.state.StateDefinition');
    const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
    members.push(
      '',
      '@Override',
      `protected void createBlockStateDefinition(${stateDefinition}.Builder<${blockType}, ${blockState}> builder) {`,
      '    builder.add(POWERED);',
      '}',
    );
  }
  const blockState = () => file.use('net.minecraft.world.level.block.state.BlockState');
  const level = () => file.use('net.minecraft.world.level.Level');
  const blockPos = () => file.use('net.minecraft.core.BlockPos');
  const serverLevel = () => file.use('net.minecraft.server.level.ServerLevel');
  const vec3 = () => file.use('net.minecraft.world.phys.Vec3');
  const player = () => file.use('net.minecraft.world.entity.player.Player');

  if (spec.onInteract !== undefined) {
    const interactionResult = file.use('net.minecraft.world.InteractionResult');
    const hit = file.use('net.minecraft.world.phys.BlockHitResult');
    members.push(
      '',
      '/** msm:on_interact: a player uses the block. */',
      '@Override',
      `protected ${interactionResult} useWithoutItem(${blockState()} state, ${level()} level, ${blockPos()} pos, ${player()} player, ${hit} hit) {`,
      `    if (level instanceof ${serverLevel()} server) {`,
      `        ${fireCall(spec.onInteract, `server, pos.immutable(), ${vec3()}.atCenterOf(pos), player, null`)}`,
      '    }',
      `    return ${interactionResult}.SUCCESS;`,
      '}',
    );
  }
  if (spec.onStep !== undefined) {
    const entity = file.use('net.minecraft.world.entity.Entity');
    members.push(
      '',
      `/** msm:on_step: an entity steps on the block, at most once per ${spec.onStep.cooldown} tick(s) per entity. */`,
      '@Override',
      `public void stepOn(${level()} level, ${blockPos()} pos, ${blockState()} state, ${entity} entity) {`,
      `    if (level instanceof ${serverLevel()} server) {`,
      '        long now = server.getGameTime();',
      `        int cooldown = ${javaInt(spec.onStep.cooldown)};`,
      '        StepKey key = new StepKey(server.dimension(), pos.asLong(), entity.getUUID());',
      '        Long last = lastStep.get(key);',
      '        if (last == null || now - last >= cooldown || now < last) {',
      '            if (lastStep.size() > 1024) {',
      '                lastStep.values().removeIf(t -> now - t >= cooldown);',
      '            }',
      '            lastStep.put(key, now);',
      '            // The stepper is the player when it is one, else the entity (ADR 0058 D1).',
      `            ${player()} player = entity instanceof ${player()} p ? p : null;`,
      `            ${fireCall(spec.onStep.method, `server, pos.immutable(), ${vec3()}.atCenterOf(pos), player, player == null ? entity : null`)}`,
      '        }',
      '    }',
      '    super.stepOn(level, pos, state, entity);',
      '}',
    );
  }
  if (spec.emit > 0) {
    const blockGetter = file.use('net.minecraft.world.level.BlockGetter');
    const direction = file.use('net.minecraft.core.Direction');
    members.push(
      '',
      '/** msm:redstone emit: a constant signal source. */',
      '@Override',
      `protected boolean isSignalSource(${blockState()} state) {`,
      '    return true;',
      '}',
      '',
      '@Override',
      `protected int getSignal(${blockState()} state, ${blockGetter} level, ${blockPos()} pos, ${direction} direction) {`,
      `    return ${javaInt(spec.emit)};`,
      '}',
    );
  }
  if (power) {
    const orientation = file.use('net.minecraft.world.level.redstone.Orientation');
    const fire = (method: string | undefined): string[] =>
      method === undefined
        ? []
        : [
            `    ${fireCall(method, `server, pos.immutable(), ${vec3()}.atCenterOf(pos), null, null`)}`,
          ];
    const powered = fire(spec.onPowered);
    const unpowered = fire(spec.onUnpowered);
    const branch: string[] = [];
    if (powered.length > 0 && unpowered.length > 0) {
      branch.push(
        'if (powered) {',
        ...indent(powered.map((l) => l.trimStart())),
        '} else {',
        ...indent(unpowered.map((l) => l.trimStart())),
        '}',
      );
    } else if (powered.length > 0) {
      branch.push('if (powered) {', ...indent(powered.map((l) => l.trimStart())), '}');
    } else {
      branch.push('if (!powered) {', ...indent(unpowered.map((l) => l.trimStart())), '}');
    }
    members.push(
      '',
      '@Override',
      `protected void onPlace(${blockState()} state, ${level()} level, ${blockPos()} pos, ${blockState()} oldState, boolean movedByPiston) {`,
      '    super.onPlace(state, level, pos, oldState, movedByPiston);',
      '    // Placement is not a neighbour update: record the current power without firing an event.',
      `    if (!oldState.is(this) && level instanceof ${serverLevel()}) {`,
      '        boolean powered = level.hasNeighborSignal(pos);',
      '        if (powered != state.getValue(POWERED)) {',
      '            level.setBlock(pos, state.setValue(POWERED, powered), UPDATE_CLIENTS);',
      '        }',
      '    }',
      '}',
      '',
      '/** msm:redstone on_powered and on_unpowered: neighbour-update power transitions. */',
      '@Override',
      `protected void neighborChanged(${blockState()} state, ${level()} level, ${blockPos()} pos, ${blockType} neighbour, ${orientation} orientation,`,
      '        boolean movedByPiston) {',
      '    super.neighborChanged(state, level, pos, neighbour, orientation, movedByPiston);',
      `    if (!(level instanceof ${serverLevel()} server)) {`,
      '        return;',
      '    }',
      '    boolean powered = level.hasNeighborSignal(pos);',
      '    if (powered == state.getValue(POWERED)) {',
      '        return;',
      '    }',
      '    level.setBlock(pos, state.setValue(POWERED, powered), UPDATE_CLIENTS);',
      ...indent(branch),
      '}',
    );
  }
  members.push(...eventMethods(file, spec.events, spec.kind, actions));

  const lines = [
    `/** The block {@code ${spec.input.id}}. */`,
    `public class ${name} extends ${blockType} {`,
    ...indent(trimBlank(members)),
    '}',
  ];
  context.files.push({ path: classPath(context, 'block', name), contents: file.render(lines) });
}
