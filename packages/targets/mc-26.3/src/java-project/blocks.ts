/**
 * Blocks: `ModBlocks.java` (registration as the runtime's `MsmRegistrar.registerBlock`: the
 * block with `BlockBehaviour.Properties.of().setId(key).strength(h, r).sound(...)`, light,
 * tool requirement and loot table override; the block item with
 * `useBlockDescriptionPrefix().stacksTo(n).rarity(r)`; creative tabs through
 * `CreativeModeTabEvents.modifyOutputEvent`) and one `block/<Name>Block.java` per block with
 * events or redstone behaviour, mirroring `MsmBlock` (interact, step with a cooldown map keyed
 * by dimension, position and entity, redstone `POWERED` state and `neighborChanged`). A step
 * event carries the stepper as the runtime's `EventContext.forBlockStep` (ADR 0058 D1): the
 * player when it is one, else the `entity` argument. `msm:shape` (ADR 0059 D3, D6) mirrors
 * `MsmBlock.shapeProperties` in the properties (`noCollision()`; for see-through blocks
 * `noOcclusion()` and never a valid spawn, suffocating, view-blocking or redstone-conducting)
 * and `MsmBlock`'s overrides in the block class (`getShape` from the union of the boxes, each
 * axis ordered; for see-through blocks sky light, shade brightness 1, no visual shape and the
 * glass rule in `skipRendering`). The triggers of ADR 0061 D2 mirror `MsmBlock`: `msm:on_break`
 * (`playerWillDestroy`), `msm:on_place` (`setPlacedBy`, the placer as the actor),
 * `msm:on_random_tick` (`randomTicks()` in the properties; `randomTick` with its chance) and
 * `msm:on_entity_inside` (`entityInside`, a generated `CooldownMap` before the shared
 * `TickLimiter`). A block item's `components."msm:components"` (ADR 0060 D4) goes through the
 * generated `VanillaComponents` helper before the item's own fields. Block types (ADR 0067 D10,
 * `block-types.ts`) mirror `MsmRegistrar` and `registry/types/`: the vanilla family class (a
 * generated subclass when its constructor is protected or the block has events, with
 * `msm:on_interact` after vanilla's own use), the family's `Properties`, stairs registered after
 * their base, `DoubleHighBlockItem` for doors, `msm:flammable` through Fabric's
 * `FlammableBlockRegistry` (with `ignitedByLava`), `msm:strippable` through the generated
 * `BlockStripping` callback, and the block item under `item.id` (ADR 0068 D2). Minecraft 26.3,
 * Mojang names.
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
import {
  boxExpression,
  constructorArguments,
  facingTurns,
  familyClass,
  isFacing,
  isShaped,
  PILLAR_TURNS,
  readType,
  type TypeSpec,
  typeKeys,
  typeProperties,
} from './block-types';
import { classPath, type GenerationContext, packageOf } from './context';
import { closeLine } from './items';
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
import { blockItemId, checkFormat, type Reader, readDefinition } from './read';
import { blockStrippingJava } from './templates/block-stripping-java';

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
  'msm:shape',
  'msm:on_break',
  'msm:on_place',
  'msm:on_random_tick',
  'msm:on_entity_inside',
  'msm:flammable',
  'msm:strippable',
];

/** `msm:shape` fields (`::msm::definition::Shape`); the editor-only `preset` is not one. */
const SHAPE_KEYS = ['boxes', 'collision', 'see_through'];
const FULL_CUBE = [0, 0, 0, 16, 16, 16] as const;

/** A parsed `msm:shape`, as the runtime's `BlockComponents.Shape`. */
interface ShapeSpec {
  /** The boxes with each axis ordered (`[minX, minY, minZ, maxX, maxY, maxZ]`); the full cube when absent. */
  readonly boxes: readonly (readonly number[])[];
  readonly collision: boolean;
  readonly seeThrough: boolean;
}

/** A parsed block definition. */
interface BlockSpec {
  readonly input: DefinitionInput;
  readonly reader: Reader;
  /** The type and its own fields (ADR 0067 D1, D2). */
  readonly type: TypeSpec;
  /** The block item's id: `item.id`, else the block's (ADR 0068 D2); unused without an item. */
  readonly itemId: string;
  /** `msm:flammable` (ADR 0067 D3): vanilla's spread and burn odds, in that order. */
  readonly flammable: { burnOdds: number; igniteOdds: number } | undefined;
  /** `msm:strippable` `into` (ADR 0067 D3). */
  readonly strippable: string | undefined;
  readonly soundType: string;
  readonly lootTable: string | undefined;
  readonly item:
    | {
        creativeTab: string | undefined;
        maxStackSize: number;
        rarity: string;
        /** `components."msm:components"` as compact JSON (ADR 0060 D4), or `undefined`. */
        vanilla: string | undefined;
      }
    | undefined;
  readonly hardness: number;
  readonly resistance: number;
  readonly requiresTool: boolean;
  readonly light: number | undefined;
  /**
   * `step_block` with `msm:on_step`, `msm:on_place` or `msm:on_entity_inside` (events may run
   * with an actor that is not a player), else `block`.
   */
  readonly kind: EventOwnerKind;
  readonly events: Events;
  /** Method of the `msm:on_interact` event. */
  readonly onInteract: string | undefined;
  readonly onStep: { method: string; cooldown: number } | undefined;
  readonly emit: number;
  readonly onPowered: string | undefined;
  readonly onUnpowered: string | undefined;
  readonly shape: ShapeSpec | undefined;
  /** Method of the `msm:on_break` event (ADR 0061 D2). */
  readonly onBreak: string | undefined;
  /** Method of the `msm:on_place` event (ADR 0061 D2). */
  readonly onPlace: string | undefined;
  readonly onRandomTick: { method: string; chance: number } | undefined;
  readonly onEntityInside: { method: string; cooldown: number } | undefined;
}

/**
 * Reads `msm:shape` with the runtime's checks: 1 to 16 boxes of 6 numbers from 0 to 16,
 * `collision` true by default, `see_through` by default true when `boxes` is present and is not
 * the single full cube.
 */
function readShape(shape: Reader): ShapeSpec {
  shape.onlyKeys(SHAPE_KEYS, 'msm:shape field');
  const raw = shape.has('boxes') ? shape.value.boxes : undefined;
  let boxes: number[][] | undefined;
  if (raw !== undefined) {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 16) {
      shape.fail('boxes must be a list of 1 to 16 boxes');
    }
    boxes = raw.map((box, index) => {
      if (
        !Array.isArray(box) ||
        box.length !== 6 ||
        box.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 16)
      ) {
        shape.fail(`boxes[${index}] must be 6 numbers from 0 to 16 [x1, y1, z1, x2, y2, z2]`);
      }
      return box as number[];
    });
  }
  const isFullCube = (box: readonly number[]): boolean => box.every((n, i) => n === FULL_CUBE[i]);
  const seeThrough = shape.has('see_through')
    ? shape.boolean('see_through', false)
    : boxes !== undefined && !(boxes.length === 1 && isFullCube(boxes[0] ?? []));
  // Block.box needs min <= max on each axis; the format allows either corner first.
  const ordered = (boxes ?? [[...FULL_CUBE]]).map((b) => {
    const [x1 = 0, y1 = 0, z1 = 0, x2 = 0, y2 = 0, z2 = 0] = b;
    return [
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.min(z1, z2),
      Math.max(x1, x2),
      Math.max(y1, y2),
      Math.max(z1, z2),
    ];
  });
  return { boxes: ordered, collision: shape.boolean('collision', true), seeThrough };
}

function readBlock(input: DefinitionInput): BlockSpec {
  const reader = readDefinition(input);
  reader.onlyKeys([...BLOCK_KEYS, ...typeKeys(reader)], 'top-level key');
  checkFormat(reader);
  const components = reader.object('components');
  components?.onlyKeys(BLOCK_COMPONENTS, 'component');
  const type = readType(reader, components);
  const actorTrigger =
    components?.has('msm:on_place') === true || components?.has('msm:on_entity_inside') === true;
  const kind: EventOwnerKind =
    components?.has('msm:on_step') === true || actorTrigger ? 'step_block' : 'block';
  const events = readEvents(reader, kind, actorTrigger);

  let item: BlockSpec['item'];
  const rawItem = input.definition.item;
  if (rawItem === false) item = undefined;
  else if (rawItem === true) reader.fail('item must be an object or false');
  else {
    const settings = reader.object('item');
    settings?.onlyKeys(
      ['components', 'creative_tab', 'id', 'max_stack_size', 'rarity'],
      'item key',
    );
    const itemComponents = settings?.object('components');
    itemComponents?.onlyKeys(['msm:components'], 'item component');
    const vanilla = itemComponents?.object('msm:components');
    item = {
      creativeTab: settings?.optionalString('creative_tab'),
      maxStackSize: settings?.integer('max_stack_size', 64) ?? 64,
      rarity: settings?.enumConstant('rarity', RARITIES, 'common') ?? 'COMMON',
      vanilla: vanilla === undefined ? undefined : JSON.stringify(vanilla.value),
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
  const shape = components?.object('msm:shape');
  const onBreak = components?.object('msm:on_break');
  onBreak?.onlyKeys(['event'], 'msm:on_break field');
  const onPlace = components?.object('msm:on_place');
  onPlace?.onlyKeys(['event'], 'msm:on_place field');
  const randomTick = components?.object('msm:on_random_tick');
  randomTick?.onlyKeys(['event', 'chance'], 'msm:on_random_tick field');
  const inside = components?.object('msm:on_entity_inside');
  inside?.onlyKeys(['event', 'cooldown_ticks'], 'msm:on_entity_inside field');
  const chance = randomTick?.number('chance', 1) ?? 1;
  if (chance < 0 || chance > 1) randomTick?.fail('chance must be 0 to 1');
  const insideCooldown = inside?.integer('cooldown_ticks', 20) ?? 20;
  if (insideCooldown < 5) inside?.fail('cooldown_ticks must be at least 5');
  const flammable = components?.object('msm:flammable');
  flammable?.onlyKeys(['burn_odds', 'ignite_odds'], 'msm:flammable field');
  const odds = (key: string): number => {
    const value = flammable?.requiredInteger(key) ?? 0;
    if (value < 0 || value > 300) flammable?.fail(`${key} must be 0 to 300`);
    return value;
  };
  const strippable = components?.object('msm:strippable');
  strippable?.onlyKeys(['into'], 'msm:strippable field');
  const into = strippable?.requiredString('into');
  if (into !== undefined && !/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(into)) {
    strippable?.fail(`into '${into}' is not a block id`);
  }

  return {
    input,
    reader,
    type,
    itemId: blockItemId(input) ?? input.id,
    flammable:
      flammable === undefined
        ? undefined
        : { burnOdds: odds('burn_odds'), igniteOdds: odds('ignite_odds') },
    strippable: into === undefined || into.includes(':') ? into : `minecraft:${into}`,
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
    shape: shape === undefined ? undefined : readShape(shape),
    onBreak:
      onBreak === undefined
        ? undefined
        : eventMethod(onBreak, events, onBreak.requiredString('event')),
    onPlace:
      onPlace === undefined
        ? undefined
        : eventMethod(onPlace, events, onPlace.requiredString('event')),
    onRandomTick:
      randomTick === undefined
        ? undefined
        : { method: eventMethod(randomTick, events, randomTick.requiredString('event')), chance },
    onEntityInside:
      inside === undefined
        ? undefined
        : {
            method: eventMethod(inside, events, inside.requiredString('event')),
            cooldown: insideCooldown,
          },
  };
}

/**
 * Whether the block needs its own class: events reachable from a component, redstone or a
 * shape, a facing type, or a vanilla family class whose constructor is protected.
 */
function needsClass(spec: BlockSpec): boolean {
  return (
    isFacing(spec.type) ||
    familyClass(spec.type).protectedConstructor ||
    spec.onInteract !== undefined ||
    spec.onStep !== undefined ||
    spec.emit > 0 ||
    tracksPower(spec) ||
    spec.shape !== undefined ||
    spec.onBreak !== undefined ||
    spec.onPlace !== undefined ||
    spec.onRandomTick !== undefined ||
    spec.onEntityInside !== undefined
  );
}

function tracksPower(spec: BlockSpec): boolean {
  return spec.onPowered !== undefined || spec.onUnpowered !== undefined;
}

/**
 * The blocks in registration order (ADR 0067 D4, as `MsmRegistrar`): every block that is not
 * stairs in definition order, then the stairs in rounds, each once its base is written (a
 * project block) or at once (a block of vanilla or another mod, looked up at registration). A
 * base in a project namespace that is no project block, or a cycle of stairs, fails.
 */
function registrationOrder(specs: readonly BlockSpec[]): BlockSpec[] {
  const ids = new Set(specs.map((spec) => spec.input.id));
  const namespaces = new Set(specs.map((spec) => splitId(spec.input.id).namespace));
  const out = specs.filter((spec) => spec.type.type !== 'stairs');
  const written = new Set(out.map((spec) => spec.input.id));
  let left = specs.filter((spec) => spec.type.type === 'stairs');
  for (const spec of left) {
    const base = spec.type.baseBlock ?? 'minecraft:stone';
    if (!ids.has(base) && namespaces.has(splitId(base).namespace)) {
      spec.reader.fail(`base_block ${base} is not a block of the project`);
    }
  }
  while (left.length > 0) {
    const ready = left.filter((spec) => {
      const base = spec.type.baseBlock ?? 'minecraft:stone';
      return !ids.has(base) || written.has(base);
    });
    if (ready.length === 0) {
      const first = left[0] as BlockSpec;
      first.reader.fail(`base_block ${first.type.baseBlock} is part of a cycle of stairs`);
    }
    for (const spec of ready) {
      out.push(spec);
      written.add(spec.input.id);
    }
    left = left.filter((spec) => !ready.includes(spec));
  }
  return out;
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
  const specs = registrationOrder(blocks.map(readBlock));
  const fields = new NameTable();
  const fieldOf = new Map<string, string>();
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
  const extras: string[] = [];
  let usesNearPlane = false;
  let usesStairsBase = false;
  const nearPlane = (): string => {
    usesNearPlane = true;
    return 'ModBlocks::nearPlaneIntersectsOutline';
  };
  for (const spec of specs) {
    const { path } = splitId(spec.input.id);
    const field = fields.take(constantName(path), (name) => [
      name,
      `${name}_KEY`,
      `${name}_ITEM`,
      `${name}_ITEM_KEY`,
      ...(spec.item?.vanilla === undefined ? [] : [`${name}_ITEM_COMPONENTS`]),
    ]);
    fieldOf.set(spec.input.id, field);
    // A generated subclass bakes in the set and wood types; only the stairs' base is passed.
    let type: string;
    let args: string[] = [];
    if (needsClass(spec)) {
      const name = classNames.take(className(path, 'Block'), (n) => [`block.${n}`], '');
      writeBlockClass(context, spec, name);
      type = file.use(`${packageOf(context, 'block')}.${name}`);
    } else {
      type = file.use(familyClass(spec.type).fqcn);
      args = constructorArguments(file, spec.type);
    }
    if (spec.type.type === 'stairs') {
      const base = spec.type.baseBlock ?? 'minecraft:stone';
      const baseField = fieldOf.get(base);
      if (baseField !== undefined) args = [`${baseField}.defaultBlockState()`];
      else {
        usesStairsBase = true;
        args = [`stairsBase(${identifierExpression(file, base)})`];
      }
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
    if (spec.shape !== undefined) props.push(...shapeProperties(spec.shape));
    props.push(...typeProperties(file, spec.type, nearPlane));
    if (spec.flammable !== undefined) {
      props.push(
        '        .ignitedByLava() // msm:flammable: lava sets it alight, as vanilla planks and logs',
      );
    }
    if (spec.onRandomTick !== undefined) {
      props.push(
        '        .randomTicks() // msm:on_random_tick: random ticks only with the component',
      );
    }
    if (spec.lootTable !== undefined) {
      const optional = file.use('java.util.Optional');
      props.push(
        `        .overrideLootTable(${optional}.of(${resourceKey}.create(${registries}.LOOT_TABLE, ${identifierExpression(file, spec.lootTable)})))`,
      );
    }
    // Before a trailing comment (a shape or random tick line may end with one).
    props[props.length - 1] = closeLine(props[props.length - 1] as string, '));');
    const open = [...args, props[0]].join(', ');
    body.push(
      '',
      `/** {@code ${spec.input.id}} (${spec.input.path}). */`,
      `public static final ${resourceKey}<${blockType}> ${field}_KEY = ${resourceKey}.create(${registries}.BLOCK, ${identifierExpression(file, spec.input.id)});`,
      `public static final ${type} ${field} = ${registry}.register(${builtIn}.BLOCK, ${field}_KEY, new ${type}(${open}`,
      ...props.slice(1),
    );
    if (spec.flammable !== undefined) {
      const flammable = file.use('net.fabricmc.fabric.api.registry.FlammableBlockRegistry');
      extras.push(
        `${flammable}.getDefaultInstance().add(${field}, ${javaInt(spec.flammable.burnOdds)}, ${javaInt(spec.flammable.igniteOdds)}); // msm:flammable`,
      );
    }
    if (spec.strippable !== undefined) {
      extras.push(
        `BlockStripping.add(${field}, ${identifierExpression(file, spec.strippable)}); // msm:strippable`,
      );
    }
    if (spec.item !== undefined) {
      const item = file.use('net.minecraft.world.item.Item');
      const blockItem = file.use(
        spec.type.type === 'door'
          ? 'net.minecraft.world.item.DoubleHighBlockItem'
          : 'net.minecraft.world.item.BlockItem',
      );
      const rarity = file.use('net.minecraft.world.item.Rarity');
      const { vanilla } = spec.item;
      // An item with its own id (ADR 0068 D2) is named item.<namespace>.<path> of that id.
      const ownId = spec.itemId !== spec.input.id;
      const itemKey = ownId
        ? `${resourceKey}.create(${registries}.ITEM, ${identifierExpression(file, spec.itemId)})`
        : `${resourceKey}.create(${registries}.ITEM, ${field}_KEY.identifier())`;
      const prefix = ownId ? '.useItemDescriptionPrefix()' : '.useBlockDescriptionPrefix()';
      const named = ownId
        ? 'name from item.<namespace>.<path> of item.id, as vanilla seeds'
        : 'name from block.<namespace>.<path>, as vanilla block items do';
      const doorNote =
        spec.type.type === 'door' ? ' A door item places both halves, as vanilla.' : '';
      if (doorNote !== '') {
        body.push(`/** The item of {@code ${spec.input.id}}.${doorNote} */`);
      }
      if (vanilla === undefined) {
        body.push(
          `public static final ${resourceKey}<${item}> ${field}_ITEM_KEY = ${itemKey};`,
          `public static final ${blockItem} ${field}_ITEM = ${registry}.register(${builtIn}.ITEM, ${field}_ITEM_KEY, new ${blockItem}(${field}, new ${item}.Properties()`,
          `        .setId(${field}_ITEM_KEY)`,
          `        ${prefix} // ${named}`,
          `        .stacksTo(${javaInt(spec.item.maxStackSize)})`,
          `        .rarity(${rarity}.${spec.item.rarity})));`,
        );
      } else {
        // item.components."msm:components" first, so the block item's own fields win (ADR 0060 D4).
        context.usesVanillaComponents = true;
        const helper = file.use(`${context.input.javaPackage}.VanillaComponents`);
        body.push(
          `/** The msm:components of the block item {@code ${spec.itemId}}: vanilla data components as JSON. */`,
          `private static final String ${field}_ITEM_COMPONENTS = ${javaString(vanilla)};`,
          `public static final ${resourceKey}<${item}> ${field}_ITEM_KEY = ${itemKey};`,
          `public static final ${blockItem} ${field}_ITEM = ${registry}.register(${builtIn}.ITEM, ${field}_ITEM_KEY, new ${blockItem}(${field}, ${helper}.apply(new ${item}.Properties()`,
          `        .setId(${field}_ITEM_KEY)`,
          `        ${prefix}, ${javaString(spec.itemId)}, ${field}_ITEM_COMPONENTS) // ${named.replace(/, as .*$/, '')}; msm:components first, the fields below win`,
          `        .stacksTo(${javaInt(spec.item.maxStackSize)})`,
          `        .rarity(${rarity}.${spec.item.rarity})));`,
        );
      }
      if (spec.item.creativeTab !== undefined)
        tabs.push(tabLine(file, spec.item.creativeTab, `${field}_ITEM`));
    }
  }
  const strips = specs.some((spec) => spec.strippable !== undefined);
  if (strips) {
    extras.push('BlockStripping.register();');
    context.files.push({
      path: classPath(context, '', 'BlockStripping'),
      contents: blockStrippingJava(context.input.javaPackage),
    });
  }
  const helpers: string[] = [];
  if (usesStairsBase) {
    const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
    const identifier = file.use('net.minecraft.resources.Identifier');
    helpers.push(
      '',
      '/**',
      ' * The base block of stairs that is not one of these blocks, registered before them (ADR 0067 D4). A missing base',
      ' * stops the start-up, where the runtime skips the stairs with a load error.',
      ' */',
      `private static ${blockState} stairsBase(${identifier} id) {`,
      `    if (!${builtIn}.BLOCK.containsKey(id)) {`,
      '        throw new IllegalStateException("base_block " + id + " is not a registered block");',
      '    }',
      `    return ${builtIn}.BLOCK.getValue(id).defaultBlockState();`,
      '}',
    );
  }
  if (usesNearPlane) {
    const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
    const blockGetter = file.use('net.minecraft.world.level.BlockGetter');
    const blockPos = file.use('net.minecraft.core.BlockPos');
    const aabb = file.use('net.minecraft.world.phys.AABB');
    helpers.push(
      '',
      "/** Vanilla's Blocks.NEAR_PLANE_INTERSECTS_OUTLINE (private there): the occlusion shape meets the camera's near plane. */",
      `private static boolean nearPlaneIntersectsOutline(${blockState} state, ${blockGetter} level, ${blockPos} pos, ${aabb} nearPlane) {`,
      `    for (${aabb} box : state.getOcclusionShape().toAabbs()) {`,
      '        if (box.move(pos).intersects(nearPlane)) {',
      '            return true;',
      '        }',
      '    }',
      '    return false;',
      '}',
    );
  }
  const lines = [
    '/** The blocks and block items, registered when the class loads. */',
    'public final class ModBlocks {',
    ...indent(body.slice(1)),
    '',
    '    private ModBlocks() {}',
    '',
    extras.length > 0
      ? '    /** Loads the class (registering every block), sets fire odds and stripping, and adds the block items to their creative tabs. */'
      : '    /** Loads the class (registering every block) and adds the block items to their creative tabs. */',
    '    public static void register() {',
    ...indent([...extras, ...tabs], 2),
    '    }',
    ...indent(helpers),
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModBlocks'), contents: file.render(lines) });
  return 'ModBlocks';
}

/** The `Properties` calls of `MsmBlock.shapeProperties` (ADR 0059 D3). */
function shapeProperties(shape: ShapeSpec): string[] {
  const out: string[] = [];
  if (!shape.collision)
    out.push('        .noCollision() // msm:shape collision false: walk-through');
  if (shape.seeThrough) {
    out.push(
      '        .noOcclusion() // msm:shape see-through: the predicates of vanilla glass',
      '        .isValidSpawn((state, level, pos, type) -> false)',
      '        .isSuffocating((state, level, pos) -> false)',
      '        .isViewBlocking((state, level, pos, box) -> false)',
      '        .isRedstoneConductor((state, level, pos) -> false)',
    );
  }
  return out;
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

/** The `MsmBlock` overrides for `msm:shape` (ADR 0059 D3): outline, and see-through light and faces. */
function shapeMembers(
  file: JavaFile,
  shape: ShapeSpec,
  blockState: string,
  blockPos: string,
  shapeReturn = 'SHAPE',
): string[] {
  const blockGetter = file.use('net.minecraft.world.level.BlockGetter');
  const collisionContext = file.use('net.minecraft.world.phys.shapes.CollisionContext');
  const voxelShape = file.use('net.minecraft.world.phys.shapes.VoxelShape');
  const out = [
    '',
    '/** msm:shape: the outline; collision follows it unless the properties say noCollision(). */',
    '@Override',
    `protected ${voxelShape} getShape(${blockState} state, ${blockGetter} level, ${blockPos} pos, ${collisionContext} context) {`,
    ...indent(`return ${shapeReturn};`.split('\n')),
    '}',
  ];
  if (shape.seeThrough) {
    const shapes = file.use('net.minecraft.world.phys.shapes.Shapes');
    const direction = file.use('net.minecraft.core.Direction');
    out.push(
      '',
      '/** msm:shape see-through: no visual shape, as glass. */',
      '@Override',
      `protected ${voxelShape} getVisualShape(${blockState} state, ${blockGetter} level, ${blockPos} pos, ${collisionContext} context) {`,
      `    return ${shapes}.empty();`,
      '}',
      '',
      '/** msm:shape see-through: sky light passes. */',
      '@Override',
      `protected boolean propagatesSkylightDown(${blockState} state) {`,
      '    return true;',
      '}',
      '',
      '/** msm:shape see-through: no ambient occlusion darkening. */',
      '@Override',
      `protected float getShadeBrightness(${blockState} state, ${blockGetter} level, ${blockPos} pos) {`,
      '    return 1.0f;',
      '}',
      '',
      '/** msm:shape see-through: the glass rule, no face between two of these blocks. */',
      '@Override',
      `protected boolean skipRendering(${blockState} state, ${blockState} adjacent, ${direction} direction) {`,
      '    return adjacent.is(this) || super.skipRendering(state, adjacent, direction);',
      '}',
    );
  }
  return out;
}

function writeBlockClass(context: GenerationContext, spec: BlockSpec, name: string): void {
  const javaPackage = packageOf(context, 'block');
  const file = new JavaFile(javaPackage, spec.input.path);
  const blockType = (): string => file.use('net.minecraft.world.level.block.Block');
  const properties = file.use('net.minecraft.world.level.block.state.BlockBehaviour', 'Properties');
  const actions = noteActions(context, file, spec.events);
  const power = tracksPower(spec);
  const ts = spec.type;
  const superClass = file.use(familyClass(ts).fqcn);
  const facing = isFacing(ts);

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
  if (facing) {
    const enumProperty = file.use('net.minecraft.world.level.block.state.properties.EnumProperty');
    const blockStateProperties = file.use(
      'net.minecraft.world.level.block.state.properties.BlockStateProperties',
    );
    const direction = file.use('net.minecraft.core.Direction');
    if (members.length > 0) members.push('');
    members.push(
      ts.type === 'horizontal'
        ? '/** horizontal: four ways, towards the placer, as a furnace. */'
        : '/** directional: six ways, towards the placer, as a dropper. */',
      `public static final ${enumProperty}<${direction}> FACING = ${blockStateProperties}.${ts.type === 'horizontal' ? 'HORIZONTAL_FACING' : 'FACING'};`,
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
  if (spec.onEntityInside !== undefined) {
    context.usesCooldownMap = true;
    const cooldownMap = file.use(`${context.input.javaPackage}.CooldownMap`);
    if (members.length > 0) members.push('');
    members.push(
      '/** msm:on_entity_inside cooldowns per dimension, position and entity. Server thread only. */',
      `private final ${cooldownMap} insideCooldowns = new ${cooldownMap}();`,
    );
  }
  // msm:shape: one outline, or one per axis or facing (boxes turned as the blockstate turns the model).
  let shapeReturn = 'SHAPE';
  if (spec.shape !== undefined) {
    const voxelShape = file.use('net.minecraft.world.phys.shapes.VoxelShape');
    const shapes = file.use('net.minecraft.world.phys.shapes.Shapes');
    const union = (field: string, turn: (box: readonly number[]) => readonly number[]) => {
      const boxes = (spec.shape?.boxes ?? []).map((box) => boxExpression(blockType(), turn(box)));
      return [
        `private static final ${voxelShape} ${field} = ${shapes}.or(`,
        ...boxes.map((box, i) => `        ${box}${i === boxes.length - 1 ? ').optimize();' : ','}`),
      ];
    };
    if (members.length > 0) members.push('');
    if (ts.type === 'pillar' || facing) {
      const turns = ts.type === 'pillar' ? PILLAR_TURNS : facingTurns(ts);
      members.push(
        ts.type === 'pillar'
          ? '/** msm:shape: the union of the boxes per axis, written for axis y and turned as the blockstate turns the model. */'
          : '/** msm:shape: the union of the boxes per facing, written facing north and turned as the blockstate turns the model. */',
      );
      for (const [key, turn] of turns) members.push(...union(`SHAPE_${key}`, turn));
      const property = ts.type === 'pillar' ? 'AXIS' : 'FACING';
      const cases = turns.map(([key]) => `    case ${key} -> SHAPE_${key};`);
      shapeReturn = [
        `switch (state.getValue(${property})) {`,
        ...cases,
        ...(ts.type === 'horizontal' ? ['    default -> SHAPE_NORTH;'] : []),
        '}',
      ].join('\n');
    } else {
      members.push(
        '/** msm:shape: the union of the boxes, the outline for every state. */',
        ...union('SHAPE', (box) => box),
      );
    }
  }
  if (ts.type === 'stairs') {
    const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
    members.push(
      '',
      `public ${name}(${blockState} base, ${properties} properties) {`,
      '    super(base, properties);',
    );
  } else {
    const args = [...constructorArguments(file, ts), 'properties'].join(', ');
    members.push('', `public ${name}(${properties} properties) {`, `    super(${args});`);
  }
  if (facing) {
    const direction = file.use('net.minecraft.core.Direction');
    members.push(
      `    registerDefaultState(stateDefinition.any().setValue(FACING, ${direction}.NORTH)${power ? '.setValue(POWERED, false)' : ''});`,
    );
  } else if (power && ts.type === 'pillar') {
    // RotatedPillarBlock has set the axis to y.
    members.push('    registerDefaultState(defaultBlockState().setValue(POWERED, false));');
  } else if (power) {
    members.push('    registerDefaultState(stateDefinition.any().setValue(POWERED, false));');
  }
  members.push('}');

  if (power || facing) {
    const stateDefinition = file.use('net.minecraft.world.level.block.state.StateDefinition');
    const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
    const added = [...(facing ? ['FACING'] : []), ...(power ? ['POWERED'] : [])].join(', ');
    members.push(
      '',
      '@Override',
      `protected void createBlockStateDefinition(${stateDefinition}.Builder<${blockType()}, ${blockState}> builder) {`,
      ...(ts.type === 'pillar' ? ['    super.createBlockStateDefinition(builder); // AXIS'] : []),
      `    builder.add(${added});`,
      '}',
    );
  }
  if (facing) members.push(...facingMembers(file, ts));
  const blockState = () => file.use('net.minecraft.world.level.block.state.BlockState');
  const level = () => file.use('net.minecraft.world.level.Level');
  const blockPos = () => file.use('net.minecraft.core.BlockPos');
  const serverLevel = () => file.use('net.minecraft.server.level.ServerLevel');
  const vec3 = () => file.use('net.minecraft.world.phys.Vec3');
  const player = () => file.use('net.minecraft.world.entity.player.Player');

  if (spec.shape !== undefined) {
    members.push(...shapeMembers(file, spec.shape, blockState(), blockPos(), shapeReturn));
  }

  if (spec.onInteract !== undefined && !isShaped(ts)) {
    const interactionResult = file.use('net.minecraft.world.InteractionResult');
    const hit = file.use('net.minecraft.world.phys.BlockHitResult');
    members.push(
      '',
      `/** msm:on_interact: a player uses the block, after vanilla's own use (the ${ts.type.replace('_', ' ')} has acted). */`,
      '@Override',
      `protected ${interactionResult} useWithoutItem(${blockState()} state, ${level()} level, ${blockPos()} pos, ${player()} player, ${hit} hit) {`,
      `    ${interactionResult} vanilla = super.useWithoutItem(state, level, pos, player, hit);`,
      `    if (level instanceof ${serverLevel()} server) {`,
      `        ${fireCall(spec.onInteract, `server, pos.immutable(), ${vec3()}.atCenterOf(pos), player, null`)}`,
      '    }',
      `    return vanilla.consumesAction() ? vanilla : ${interactionResult}.SUCCESS;`,
      '}',
    );
  } else if (spec.onInteract !== undefined) {
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
  members.push(...triggerMembers(context, file, spec));
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
      `protected void neighborChanged(${blockState()} state, ${level()} level, ${blockPos()} pos, ${blockType()} neighbour, ${orientation} orientation,`,
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
    `public class ${name} extends ${superClass} {`,
    ...indent(trimBlank(members)),
    '}',
  ];
  context.files.push({ path: classPath(context, 'block', name), contents: file.render(lines) });
}

/** Placement towards the placer, `rotate` and `mirror` of the facing types (`MsmBlock`, ADR 0067 D4). */
function facingMembers(file: JavaFile, ts: TypeSpec): string[] {
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  const placeContext = file.use('net.minecraft.world.item.context.BlockPlaceContext');
  const rotation = file.use('net.minecraft.world.level.block.Rotation');
  const mirror = file.use('net.minecraft.world.level.block.Mirror');
  const towards =
    ts.type === 'horizontal'
      ? 'context.getHorizontalDirection().getOpposite()'
      : 'context.getNearestLookingDirection().getOpposite()';
  return [
    '',
    '/** Faces the placer. */',
    '@Override',
    `public ${blockState} getStateForPlacement(${placeContext} context) {`,
    `    return defaultBlockState().setValue(FACING, ${towards});`,
    '}',
    '',
    '@Override',
    `protected ${blockState} rotate(${blockState} state, ${rotation} rotation) {`,
    '    return state.setValue(FACING, rotation.rotate(state.getValue(FACING)));',
    '}',
    '',
    '@Override',
    `protected ${blockState} mirror(${blockState} state, ${mirror} mirror) {`,
    '    return state.rotate(mirror.getRotation(state.getValue(FACING)));',
    '}',
  ];
}

/**
 * The `MsmBlock` overrides of the ADR 0061 D2 triggers: `msm:on_break` (`playerWillDestroy`, any
 * game mode), `msm:on_place` (`setPlacedBy`, the placer as the actor), `msm:on_random_tick`
 * (`randomTick` with its chance) and `msm:on_entity_inside` (`entityInside`, the per-entity
 * cooldown before the shared tick limiter). The two tick triggers count against `TickLimiter`.
 */
function triggerMembers(context: GenerationContext, file: JavaFile, spec: BlockSpec): string[] {
  const out: string[] = [];
  const blockState = () => file.use('net.minecraft.world.level.block.state.BlockState');
  const level = () => file.use('net.minecraft.world.level.Level');
  const blockPos = () => file.use('net.minecraft.core.BlockPos');
  const serverLevel = () => file.use('net.minecraft.server.level.ServerLevel');
  const vec3 = () => file.use('net.minecraft.world.phys.Vec3');
  const player = () => file.use('net.minecraft.world.entity.player.Player');
  const tickLimiter = () => {
    context.usesTickLimiter = true;
    return file.use(`${context.input.javaPackage}.TickLimiter`);
  };
  if (spec.onBreak !== undefined) {
    out.push(
      '',
      '/** msm:on_break: a player is about to break the block, in any game mode. */',
      '@Override',
      `public ${blockState()} playerWillDestroy(${level()} level, ${blockPos()} pos, ${blockState()} state, ${player()} player) {`,
      `    if (level instanceof ${serverLevel()} server) {`,
      `        ${fireCall(spec.onBreak, `server, pos.immutable(), ${vec3()}.atCenterOf(pos), player, null`)}`,
      '    }',
      '    return super.playerWillDestroy(level, pos, state, player);',
      '}',
    );
  }
  if (spec.onPlace !== undefined) {
    const living = file.use('net.minecraft.world.entity.LivingEntity');
    const itemStack = file.use('net.minecraft.world.item.ItemStack');
    out.push(
      '',
      '/** msm:on_place: the block is placed; the placer, a player or another entity, is the actor and may be absent. */',
      '@Override',
      `public void setPlacedBy(${level()} level, ${blockPos()} pos, ${blockState()} state, ${living} placer, ${itemStack} stack) {`,
      '    super.setPlacedBy(level, pos, state, placer, stack);',
      `    if (level instanceof ${serverLevel()} server) {`,
      `        ${player()} player = placer instanceof ${player()} p ? p : null;`,
      `        ${fireCall(spec.onPlace, `server, pos.immutable(), ${vec3()}.atCenterOf(pos), player, player == null ? placer : null`)}`,
      '    }',
      '}',
    );
  }
  if (spec.onRandomTick !== undefined) {
    const { method, chance } = spec.onRandomTick;
    const random = file.use('net.minecraft.util.RandomSource');
    const fire = fireCall(method, `level, pos.immutable(), ${vec3()}.atCenterOf(pos), null, null`);
    const body =
      chance <= 0
        ? [
            '// chance 0: the event never fires (the block still gets random ticks, as in the runtime).',
          ]
        : [
            chance >= 1
              ? `if (${tickLimiter()}.tryFire(level)) {`
              : `if (random.nextFloat() < ${javaFloat(chance)} && ${tickLimiter()}.tryFire(level)) {`,
            `    ${fire}`,
            '}',
          ];
    out.push(
      '',
      `/** msm:on_random_tick: on a random tick${chance > 0 && chance < 1 ? ` with chance ${chance}` : ''}, within the shared tick cap. */`,
      '@Override',
      `protected void randomTick(${blockState()} state, ${serverLevel()} level, ${blockPos()} pos, ${random} random) {`,
      '    super.randomTick(state, level, pos, random);',
      ...indent(body),
      '}',
    );
  }
  if (spec.onEntityInside !== undefined) {
    const { method, cooldown } = spec.onEntityInside;
    const entity = file.use('net.minecraft.world.entity.Entity');
    const applier = file.use('net.minecraft.world.entity.InsideBlockEffectApplier');
    out.push(
      '',
      `/** msm:on_entity_inside: an entity is inside the block, at most once per ${cooldown} ticks per entity, within the shared tick cap. */`,
      '@Override',
      `protected void entityInside(${blockState()} state, ${level()} level, ${blockPos()} pos, ${entity} entity, ${applier} effects,`,
      '        boolean intersects) {',
      '    super.entityInside(state, level, pos, entity, effects, intersects);',
      `    if (level instanceof ${serverLevel()} server`,
      `            && insideCooldowns.tryFire(server.dimension(), pos, entity.getUUID(), server.getGameTime(), ${javaInt(cooldown)})`,
      `            && ${tickLimiter()}.tryFire(server)) {`,
      '        // The entity inside is the player when it is one, else the entity (ADR 0058 D1).',
      `        ${player()} player = entity instanceof ${player()} p ? p : null;`,
      `        ${fireCall(method, `server, pos.immutable(), ${vec3()}.atCenterOf(pos), player, player == null ? entity : null`)}`,
      '    }',
      '}',
    );
  }
  return out;
}
