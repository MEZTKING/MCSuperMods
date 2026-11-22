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
 * `BlockStripping` callback, and the block item under `item.id` (ADR 0068 D2). The plant
 * types (ADR 0068 D8) add the crop and sapling classes, the leaves' vanilla classes, the sapling
 * check after start-up and the leaf tints for the client entrypoint. `msm:ambient_particles`
 * (ADR 0080 D6) gives the block a class whose `animateTick` calls vanilla's own, then the generated
 * `particle/AmbientParticles` (`particles.ts`; not allowed on a portal). Minecraft 26.3, Mojang
 * names.
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
  isPlant,
  isShaped,
  type LeafTint,
  PILLAR_TURNS,
  plantMembers,
  projectPotOf,
  readType,
  type TypeSpec,
  typeKeys,
  typeProperties,
} from './block-types';
import {
  BLOCK_ENTITY_TYPES,
  type BlockEntityEntry,
  type BlockEntityMembers,
  type ContainerInfo,
  containerBlockMembers,
  containerSpecLines,
  fireEventMembers,
  newBlockEntityMembers,
  readContainer,
  writeBlockEventsFile,
  writeContainerFiles,
  writeDoubleChestEntityClass,
  writeStorage2Files,
  writeStorageEntityClass,
} from './containers';
import { classPath, type GenerationContext, packageOf } from './context';
import {
  listedPlants,
  plant3Classes,
  plant3Companion,
  plant3LightFromState,
  plant3Properties,
} from './growing-plants';
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
import {
  checkRecipeTypes,
  type MachineInfo,
  machineBlockMembers,
  machineLightLine,
  type RecipeEntry,
  readMachine,
  writeMachineEntityClass,
  writeMachineFiles,
} from './machines';
import { className, constantName, NameTable, splitId } from './names';
import { type AmbientInfo, ambientMembers, readAmbient } from './particles';
import {
  PORTAL_BREAKABLE,
  PORTAL_DEFAULT_LIGHT,
  portalRegisterLine,
  portalSpecField,
  portalTravelMembers,
  writePortalFiles,
} from './portals';
import { blockItemId, checkFormat, type Reader, readDefinition } from './read';
import {
  type BlockSoundsSpec,
  ownSetTypeExpression,
  ownSoundsExpression,
  ownSoundsHelpers,
  readBlockSounds,
  readFlattenable,
  readTillable,
  type ToolPair,
  toolPairLines,
} from './sounds-and-pairs';
import { blockStrippingJava } from './templates/block-stripping-java';
import { plantClassJava } from './templates/growing-plants-java';
import { lightningJava } from './templates/lightning-java';
import { DRIVER_CLASSES, driverClassJava } from './templates/vanilla-blocks-java';
import {
  companionExpression,
  companionSuffix,
  hasDriverClass,
  lightFromState,
  parityItem,
  parityProperties,
  VANILLA_BLOCK_CLASS_NAMES,
} from './vanilla-types';
import {
  agesKeeping,
  blockWaxingJava,
  readWaterloggable,
  readWaxable,
  readWeathering,
  WEATHER_TICK,
  WEATHER_TICK_KEEPING,
  type WeatheringSpec,
  waterloggedPlacement,
  waterlogMembers,
  waxingLines,
  weatheringInterface,
  weatheringMembers,
} from './weathering';

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

/**
 * A sign's or hanging sign's sound line (B457a): the sounds of its `wood_type`, as the runtime gives them
 * (`WoodTypeBuilder.copyOf(base)` copies the base wood type's sounds), not the definition's `sound_type`.
 * The wall forms copy the properties, so they follow.
 */
function signSoundLine(
  file: JavaFile,
  parity: { readonly type: string; readonly woodType?: string } | undefined,
): string | undefined {
  if (parity?.type !== 'sign' && parity?.type !== 'hanging_sign') return undefined;
  const woodType = file.use('net.minecraft.world.level.block.state.properties.WoodType');
  const accessor = parity.type === 'sign' ? 'soundType' : 'hangingSignSoundType';
  return `        .sound(${woodType}.${parity.woodType ?? 'OAK'}.${accessor}())`;
}

/** Item rarities, each a `Rarity` constant. */
export const RARITIES = ['common', 'uncommon', 'rare', 'epic'] as const;

const BLOCK_KEYS = [
  'format',
  'sound_type',
  'block_sounds',
  'loot_table',
  'item',
  'components',
  'events',
];
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
  'msm:container',
  'msm:machine',
  'msm:ambient_particles',
  'msm:waterloggable',
  'msm:weathering',
  'msm:waxable',
  'msm:flattenable',
  'msm:tillable',
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
  /** `msm:container` (ADR 0074 D9). */
  readonly container: ContainerInfo | undefined;
  /** `msm:machine` (ADR 0075 D11). */
  readonly machine: MachineInfo | undefined;
  /** Method of a portal's `on_travel` event (ADR 0077 D6). */
  readonly onTravel: string | undefined;
  /** `msm:ambient_particles` (ADR 0080 D6). */
  readonly ambient: AmbientInfo | undefined;
  /** `msm:waterloggable` (ADR 0094 D7). */
  readonly waterlogged: boolean;
  /** `msm:weathering` (ADR 0094 D8). */
  readonly weathering: WeatheringSpec | undefined;
  /** `msm:waxable` `into` (ADR 0094 D9). */
  readonly waxInto: string | undefined;
  /** Method of a cake's `on_eat` event (ADR 0094 D2). */
  readonly onEat: string | undefined;
  /** Whether the definition sets `item.max_stack_size` (beds and signs default to 1 and 16). */
  readonly stackSet: boolean;
  /** `block_sounds` (ADR 0105 D1). */
  readonly blockSounds: BlockSoundsSpec | undefined;
  /** `msm:flattenable` (ADR 0105 D3). */
  readonly flatten: ToolPair | undefined;
  /** `msm:tillable` (ADR 0105 D3). */
  readonly till: ToolPair | undefined;
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
  // A portal's on_travel runs with the arrived entity as the actor (ADR 0077 D6).
  const actorTrigger =
    components?.has('msm:on_place') === true ||
    components?.has('msm:on_entity_inside') === true ||
    type.portal?.onTravel !== undefined;
  const kind: EventOwnerKind =
    components?.has('msm:on_step') === true || actorTrigger ? 'step_block' : 'block';
  const events = readEvents(reader, kind, actorTrigger);

  let item: BlockSpec['item'];
  const rawItem = input.definition.item;
  // A portal or potted plant has no item unless the definition gives it one (ADR 0077 D1, ADR 0094 D2).
  const itemless = type.portal !== undefined || type.type === 'potted_plant';
  if (rawItem === false || (rawItem === undefined && itemless)) item = undefined;
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
  const containerComponent = components?.object('msm:container');
  const machineComponent = components?.object('msm:machine');
  if (
    (containerComponent !== undefined || machineComponent !== undefined) &&
    !BLOCK_ENTITY_TYPES.includes(type.type)
  ) {
    components?.fail(
      `${containerComponent === undefined ? 'msm:machine' : 'msm:container'} is not allowed on type '${type.type}' (only ${BLOCK_ENTITY_TYPES.join(', ')})`,
    );
  }
  if (containerComponent !== undefined && machineComponent !== undefined) {
    components?.fail(
      'msm:machine and msm:container are not allowed together (a machine has its own three slots; the runtime drops msm:container with a load error)',
    );
  }
  const firedEvent = (component: Reader, id: string): string => eventMethod(component, events, id);
  const strippable = components?.object('msm:strippable');
  strippable?.onlyKeys(['into'], 'msm:strippable field');
  const into = strippable?.requiredString('into');
  const ambient = components?.object('msm:ambient_particles');
  // ADR 0104 D3, D6 (B513): a container or machine may hold water and a container may age; a machine does not
  // age (the runtime drops msm:weathering and msm:waxable there with a warning).
  const ageless = machineComponent !== undefined;
  const container =
    containerComponent === undefined ? undefined : readContainer(containerComponent, firedEvent);
  if (container?.doubleChest === true) {
    // A double chest is vanilla's chest family: four ways, its own shape, its own water (ADR 0104 D4, B515).
    if (type.type !== 'block' && type.type !== 'horizontal') {
      components?.fail(
        `a double chest must be a block or horizontal block, not '${type.type}' (vanilla's chest faces four ways)`,
      );
    }
    for (const key of ['msm:shape', 'msm:redstone']) {
      if (components?.has(key) === true) {
        components.fail(`${key} does not apply to a double chest (it keeps vanilla's chest shape)`);
      }
    }
  }
  const waterlogComponent =
    container?.doubleChest === true ? undefined : components?.object('msm:waterloggable');
  const weatheringComponent = ageless ? undefined : components?.object('msm:weathering');
  const waxableComponent = ageless ? undefined : components?.object('msm:waxable');
  const onEat = type.parity?.cake?.onEat;
  const flattenComponent = components?.object('msm:flattenable');
  const tillComponent = components?.object('msm:tillable');
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
    soundType: reader.enumConstant(
      'sound_type',
      SOUND_TYPES,
      type.portal === undefined ? 'stone' : 'glass',
    ),
    lootTable: reader.optionalString('loot_table'),
    item,
    // A portal without msm:breakable is unbreakable (ADR 0077 D1).
    hardness:
      breakable?.number('hardness', 1.5) ??
      (type.portal === undefined ? 1.5 : PORTAL_BREAKABLE.hardness),
    resistance:
      breakable?.number('resistance', 6) ??
      (type.portal === undefined ? 6 : PORTAL_BREAKABLE.resistance),
    requiresTool: breakable?.boolean('requires_tool', false) ?? false,
    light:
      light?.requiredInteger('level') ??
      (type.portal === undefined ? undefined : PORTAL_DEFAULT_LIGHT),
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
    container,
    machine:
      machineComponent === undefined
        ? undefined
        : readMachine(input.id, machineComponent, firedEvent),
    onTravel:
      type.portal?.onTravel === undefined
        ? undefined
        : (events.methods.get(type.portal.onTravel) ??
          reader.fail(
            `on_travel names event ${type.portal.onTravel}, which is not declared in events`,
          )),
    ambient: ambient === undefined ? undefined : readAmbient(ambient),
    waterlogged:
      waterlogComponent === undefined ? false : readWaterloggable(waterlogComponent, type.type),
    weathering:
      weatheringComponent === undefined
        ? undefined
        : readWeathering(weatheringComponent, type.type),
    waxInto: waxableComponent === undefined ? undefined : readWaxable(waxableComponent),
    onEat: onEat === undefined ? undefined : eventMethod(reader, events, onEat),
    blockSounds: readBlockSounds(reader),
    flatten: flattenComponent === undefined ? undefined : readFlattenable(flattenComponent),
    till: tillComponent === undefined ? undefined : readTillable(tillComponent),
    stackSet:
      typeof rawItem === 'object' &&
      rawItem !== null &&
      !Array.isArray(rawItem) &&
      Object.hasOwn(rawItem, 'max_stack_size'),
  };
}

/**
 * Whether the block needs its own class: events reachable from a component, redstone or a
 * shape, a facing type, ambient particles, or a vanilla family class whose constructor is
 * protected.
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
    spec.onEntityInside !== undefined ||
    spec.container !== undefined ||
    spec.machine !== undefined ||
    spec.ambient !== undefined ||
    spec.waterlogged ||
    spec.weathering !== undefined ||
    spec.onEat !== undefined
  );
}

/** The `ModBlocks` field of a potted plant's project pot, for its constructor (ADR 0103 D2). */
function potFieldOf(spec: BlockSpec, fieldOf: ReadonlyMap<string, string>): { potField?: string } {
  const pot = projectPotOf(spec.type);
  const field = pot === undefined ? undefined : fieldOf.get(pot);
  return field === undefined ? {} : { potField: field };
}

/**
 * The `ModBlocks` helpers of project pots (ADR 0103 D2, `PotTypes`): `plantBlock` (a potted plant's plant, which must be
 * registered and one block high, else the start-up stops where the runtime skips it) and `potted` (a listed plant's
 * potted companion; a plant that is missing, two blocks high or potted already is skipped with a warning, as the runtime
 * reports a load error).
 */
function potHelpers(file: JavaFile, context: GenerationContext): string[] {
  const identifier = file.use('net.minecraft.resources.Identifier');
  const blockType = file.use('net.minecraft.world.level.block.Block');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const blocks = file.use('net.minecraft.world.level.block.Blocks');
  const doublePlant = file.use('net.minecraft.world.level.block.DoublePlantBlock');
  const pot = file.use(`${context.input.javaPackage}.block.type.ModFlowerPotBlock`);
  const registry = file.use('net.minecraft.core.Registry');
  const registries = file.use('net.minecraft.core.registries.Registries');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const properties = file.use('net.minecraft.world.level.block.state.BlockBehaviour', 'Properties');
  const logger = file.use('org.slf4j.LoggerFactory');
  return [
    '',
    "/** A potted plant's plant in a project pot (ADR 0103 D2): a registered block one block high. */",
    `public static ${blockType} plantBlock(${identifier} id) {`,
    `    ${blockType} plant = ${builtIn}.BLOCK.getValue(id);`,
    `    if (!${builtIn}.BLOCK.containsKey(id) || plant == ${blocks}.AIR) {`,
    '        throw new IllegalStateException("plant " + id + " is not a registered block");',
    '    }',
    `    if (plant instanceof ${doublePlant}) {`,
    '        throw new IllegalStateException("plant " + id + " is two blocks high and cannot be potted");',
    '    }',
    '    return plant;',
    '}',
    '',
    '/** Registers the potted companion {@code id} of {@code pot} holding the listed plant {@code plantId} (B510b). */',
    `private static void potted(${pot} pot, ${identifier} id, ${identifier} plantId) {`,
    `    ${blockType} plant = ${builtIn}.BLOCK.getValue(plantId);`,
    '    String problem = null;',
    `    if (plant == ${blocks}.AIR) {`,
    '        problem = "is not a registered block";',
    `    } else if (plant instanceof ${doublePlant}) {`,
    '        problem = "is two blocks high and cannot be potted";',
    `    } else if (${builtIn}.BLOCK.containsKey(id)) {`,
    '        problem = "has the potted id " + id + ", which is already registered";',
    '    } else if (pot.pottedFor(plant).isPresent()) {',
    '        problem = "is already potted in the pot";',
    '    }',
    '    if (problem != null) {',
    `        ${logger}.getLogger("${context.input.modId}").warn("pot {}: plants: {} {}; the potted plant {} is skipped", BuiltInRegistries.BLOCK.getKey(pot), plantId, problem, id);`,
    '        return;',
    '    }',
    `    ${resourceKey}<${blockType}> key = ${resourceKey}.create(${registries}.BLOCK, id);`,
    `    ${pot} companion = ${registry}.register(${builtIn}.BLOCK, key, new ${pot}(plant, pot, ${properties}.ofFullCopy(pot).setId(key)));`,
    '    pot.addPotted(plant, companion);',
    '}',
  ];
}

/**
 * The own set type of a door, trapdoor, button or plate (ADR 0105 D2): `set_type` as an object, or a vanilla one on a
 * block with `block_sounds` (the vanilla classes take their block sounds from the set type), as `BlockSetTypes.of`.
 */
function setTypeOf(spec: BlockSpec, modPackage: string): { setType?: (file: JavaFile) => string } {
  const ts = spec.type;
  if (ts.setType === undefined || (ts.ownSet === undefined && spec.blockSounds === undefined)) {
    return {};
  }
  return {
    setType: (file) => {
      const modBlocks = file.use(`${modPackage}.ModBlocks`);
      const sounds =
        spec.blockSounds === undefined
          ? undefined
          : ownSoundsExpression(file, modBlocks, spec.input.id, spec.soundType, spec.blockSounds);
      return ownSetTypeExpression(
        file,
        modBlocks,
        spec.input.id,
        ts.setType as string,
        ts.ownSet,
        sounds,
      );
    },
  };
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
  const potted = specs.filter((spec) => spec.type.type === 'potted_plant');
  const out = specs.filter(
    (spec) => spec.type.type !== 'stairs' && spec.type.type !== 'potted_plant',
  );
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
  // Potted plants after every other block: vanilla's pot takes the registered plant (ADR 0094 D2, B445).
  out.push(...potted);
  return out;
}

/** A tinted leaves block for the client entrypoint (ADR 0068 D6). */
export interface LeafTintEntry {
  /** The `ModBlocks` field. */
  readonly field: string;
  readonly tint: LeafTint;
}

/** What `generateBlocks` gives the mod and client entrypoints. */
export interface GeneratedBlocks {
  /** The simple name of the registration class. */
  readonly className: string;
  /** Tinted leaves in registration order, for `BlockColorRegistry` on the client. */
  readonly leafTints: readonly LeafTintEntry[];
  /** Container and machine blocks in registration order, for `ModBlockEntities` (ADR 0074 D9). */
  readonly blockEntities: readonly BlockEntityEntry[];
  /** Machines in registration order, for `ModRecipes` (ADR 0075 D11). */
  readonly machines: readonly RecipeEntry[];
}

/**
 * Generates `ModBlocks.java` and the block classes; returns nothing when there are no blocks.
 *
 * @returns The registration class and the leaf tints, or `undefined`.
 */
export function generateBlocks(
  context: GenerationContext,
  classNames: NameTable,
): GeneratedBlocks | undefined {
  const { blocks } = context.input;
  if (blocks.length === 0) return undefined;
  const specs = registrationOrder(blocks.map(readBlock));
  checkRecipeTypes(specs.flatMap((spec) => (spec.machine === undefined ? [] : [spec.machine])));
  const blockEntities: BlockEntityEntry[] = [];
  const machines: RecipeEntry[] = [];
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
  let usesFallingParticle = false;
  const leafTints: LeafTintEntry[] = [];
  const treeChecks: string[] = [];
  const waxing: string[] = [];
  const projectBlocks = new Set(specs.map((spec) => spec.input.id));
  const pkg = context.input.javaPackage;
  let usesTorchParticle = false;
  let usesWoodType = false;
  let usesPottedPlant = false;
  let usesOwnSounds = false;
  let usesPotPlants = false;
  const plantClasses = new Set<string>();
  const potLines: string[] = [];
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
      // A container or machine block's block entity class is its class name plus Entity (ADR 0074 D9).
      const hasEntity = spec.container !== undefined || spec.machine !== undefined;
      // A class named as a vanilla block class (a block "chain") would hide it in its own imports.
      const plain = className(path, 'Block');
      const name = classNames.take(
        VANILLA_BLOCK_CLASS_NAMES.has(plain) ? `Mod${plain}` : plain,
        (n) => (hasEntity ? [`block.${n}`, `block.${n}Entity`] : [`block.${n}`]),
        '',
      );
      writeBlockClass(context, spec, name, field, fieldOf);
      type = file.use(`${packageOf(context, 'block')}.${name}`);
      if (spec.container?.doubleChest === true) {
        writeDoubleChestEntityClass(context, spec.input.id, `${name}Entity`, field);
      } else if (spec.container !== undefined) {
        writeStorageEntityClass(context, spec.input.id, `${name}Entity`, field, spec.container);
      }
      if (spec.machine !== undefined) {
        writeMachineEntityClass(context, `${name}Entity`, field, spec.machine);
        machines.push({ id: spec.input.id, field });
      }
      if (hasEntity)
        blockEntities.push({ blockId: spec.input.id, field, entityClass: `${name}Entity` });
    } else {
      const family = familyClass(spec.type, pkg);
      type = file.use(family.fqcn, ...(family.nested === undefined ? [] : [family.nested]));
      args = constructorArguments(file, spec.type, pkg, {
        blockId: spec.input.id,
        seedId: spec.itemId,
        ...setTypeOf(spec, pkg),
        ...potFieldOf(spec, fieldOf),
      });
    }
    const parity = spec.type.parity;
    // A potted plant in a project pot (ADR 0103 D2): the pot's own class, added to the pot's map.
    const projectPot =
      parity?.type === 'potted_plant' && parity.pot !== 'minecraft:flower_pot'
        ? parity.pot
        : undefined;
    if (projectPot !== undefined) {
      const potField = fieldOf.get(projectPot);
      const potSpec = specs.find((s) => s.input.id === projectPot);
      if (potField === undefined || potSpec?.type.plant3?.type !== 'flower_pot') {
        spec.reader.fail(
          `pot ${projectPot} is not a flower_pot block of the project (vanilla's minecraft:flower_pot or a block of type flower_pot); the runtime skips the potted plant`,
        );
      }
      usesPotPlants = true;
      plantClasses.add('ModFlowerPotBlock');
      extras.push(
        `${potField}.addPotted(${field}.plant(), ${field}); // the pot takes the plant (ADR 0103 D2)`,
      );
    }
    if (parity?.type === 'torch') usesTorchParticle = true;
    if (parity?.type === 'sign' || parity?.type === 'hanging_sign') usesWoodType = true;
    if (parity?.type === 'potted_plant' && projectPot === undefined) usesPottedPlant = true;
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
      signSoundLine(file, parity) ??
        (spec.blockSounds === undefined
          ? `        .sound(${soundType}.${spec.soundType})`
          : `        .sound(${ownSoundsExpression(file, 'ModBlocks', spec.input.id, spec.soundType, spec.blockSounds)}) // block_sounds`),
    ];
    if (spec.blockSounds !== undefined || spec.type.ownSet !== undefined) usesOwnSounds = true;
    if (spec.machine !== undefined) {
      props.push(machineLightLine(type, spec.machine, spec.light ?? 0));
    } else if (
      spec.light !== undefined &&
      !lightFromState(spec.type.type) &&
      !(spec.type.plant3 !== undefined && plant3LightFromState(spec.type.plant3))
    ) {
      props.push(`        .lightLevel(state -> ${javaInt(spec.light)})`);
    }
    if (spec.requiresTool) props.push('        .requiresCorrectToolForDrops()');
    if (spec.container?.doubleChest === true) {
      props.push(
        "        .noOcclusion() // double chest: vanilla's chest shape is smaller than a cube",
      );
    }
    if (spec.shape !== undefined) props.push(...shapeProperties(spec.shape));
    props.push(...typeProperties(file, spec.type, nearPlane));
    if (parity !== undefined) {
      props.push(...parityProperties(file, parity, spec.light !== undefined, pkg));
    }
    const plant3 = spec.type.plant3;
    if (plant3 !== undefined) {
      props.push(...plant3Properties(file, plant3, spec.light));
      for (const name of plant3Classes(plant3)) plantClasses.add(name);
    }
    if (spec.flammable !== undefined && spec.type.type !== 'leaves') {
      props.push(
        '        .ignitedByLava() // msm:flammable: lava sets it alight, as vanilla planks and logs',
      );
    }
    if (spec.onRandomTick !== undefined && !isPlant(spec.type)) {
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
    // ADR 0094 D3: the companion right after its element, with the element's properties.
    const suffix = parity === undefined ? undefined : companionSuffix(parity.type);
    let companion: string | undefined;
    if (parity !== undefined && suffix !== undefined) {
      companion = fields.take(constantName(`${path}${suffix}`), (name) => [name, `${name}_KEY`]);
      const companionId = `${spec.input.id}${suffix}`;
      if (projectBlocks.has(companionId)) {
        spec.reader.fail(
          `the generated block ${companionId} (its ${suffix.slice(1)} form) is also a block of the project (blocks-items.generated-block-clash; the runtime skips the element)`,
        );
      }
      const expression = companionExpression(
        file,
        parity,
        field,
        spec.input.id,
        spec.itemId,
        'ModBlocks',
        `${properties}.ofFullCopy(${field}).setId(${companion}_KEY)`,
      );
      const companionType = file.use(
        `net.minecraft.world.level.block.${
          parity.type === 'torch'
            ? 'WallTorchBlock'
            : parity.type === 'sign'
              ? 'WallSignBlock'
              : parity.type === 'hanging_sign'
                ? 'WallHangingSignBlock'
                : 'AttachedStemBlock'
        }`,
      );
      body.push(
        `/** {@code ${companionId}}: the ${suffix === '_wall' ? 'wall' : 'attached'} form of {@code ${spec.input.id}} (ADR 0094 D3), no item of its own. */`,
        `public static final ${resourceKey}<${blockType}> ${companion}_KEY = ${resourceKey}.create(${registries}.BLOCK, ${identifierExpression(file, companionId)});`,
        `public static final ${companionType} ${companion} = ${registry}.register(${builtIn}.BLOCK, ${companion}_KEY, ${expression});`,
      );
      if (parity.type === 'sign' || parity.type === 'hanging_sign') {
        const entityTypes = file.use('net.minecraft.world.level.block.entity.BlockEntityTypes');
        const sign = parity.type === 'sign' ? 'SIGN' : 'HANGING_SIGN';
        extras.push(
          `${entityTypes}.${sign}.addValidBlock(${field}); // ${parity.type.replace('_', ' ')}: vanilla's sign block entity`,
          `${entityTypes}.${sign}.addValidBlock(${companion});`,
        );
      }
    }
    // ADR 0103 D4: the strand, shoot or stem right after its element, with the element's properties.
    const plantCompanion = plant3 === undefined ? undefined : plant3Companion(plant3, pkg);
    if (plantCompanion !== undefined) {
      companion = fields.take(constantName(`${path}${plantCompanion.suffix}`), (name) => [
        name,
        `${name}_KEY`,
      ]);
      const companionId = `${spec.input.id}${plantCompanion.suffix}`;
      if (projectBlocks.has(companionId)) {
        spec.reader.fail(
          `the generated block ${companionId} (its ${plantCompanion.kind}) is also a block of the project (blocks-items.generated-block-clash; the runtime skips the element)`,
        );
      }
      const companionType = file.use(
        plantCompanion.fqcn,
        ...(plantCompanion.nested === undefined ? [] : [plantCompanion.nested]),
      );
      body.push(
        `/** {@code ${companionId}}: the ${plantCompanion.kind} of {@code ${spec.input.id}} (ADR 0103 D4), no item of its own. */`,
        `public static final ${resourceKey}<${blockType}> ${companion}_KEY = ${resourceKey}.create(${registries}.BLOCK, ${identifierExpression(file, companionId)});`,
        `public static final ${companionType} ${companion} = ${registry}.register(${builtIn}.BLOCK, ${companion}_KEY, ${plantCompanion.construct(file, field, `${properties}.ofFullCopy(${field}).setId(${companion}_KEY)`)});`,
      );
      extras.push(plantCompanion.attach(field, companion));
    }
    if (plant3?.type === 'flower_pot') {
      usesPotPlants = true;
      for (const [potted, plant] of listedPlants(spec.input.id, plant3.plants)) {
        if (projectBlocks.has(potted)) {
          spec.reader.fail(
            `the generated block ${potted} (the potted ${plant}) is also a block of the project (blocks-items.generated-block-clash)`,
          );
        }
        potLines.push(
          `potted(${field}, ${identifierExpression(file, potted)}, ${identifierExpression(file, plant)}); // plants: ${plant}`,
        );
      }
    }
    if (spec.waxInto !== undefined || spec.weathering !== undefined) {
      waxing.push(
        ...waxingLines(file, field, spec.input.id, spec.weathering, spec.waxInto, projectBlocks),
      );
    }
    const leaves = spec.type.leaves;
    if (leaves?.tint !== undefined) leafTints.push({ field, tint: leaves.tint });
    else if (leaves?.fallingParticle !== undefined) usesFallingParticle = true;
    const sapling = spec.type.sapling;
    if (sapling !== undefined) {
      const trees = [...new Set([sapling.tree, sapling.megaTree, sapling.flowerTree])];
      for (const tree of trees) {
        if (tree === undefined) continue;
        treeChecks.push(
          `checkTree(features, ${javaString(spec.input.id)}, ${identifierExpression(file, tree)});`,
        );
      }
    }
    if (spec.flammable !== undefined) {
      const flammable = file.use('net.fabricmc.fabric.api.registry.FlammableBlockRegistry');
      extras.push(
        `${flammable}.getDefaultInstance().add(${field}, ${javaInt(spec.flammable.burnOdds)}, ${javaInt(spec.flammable.igniteOdds)}); // msm:flammable`,
      );
      if (companion !== undefined) {
        extras.push(
          `${flammable}.getDefaultInstance().add(${companion}, ${javaInt(spec.flammable.burnOdds)}, ${javaInt(spec.flammable.igniteOdds)}); // the ${suffix === '_wall' ? 'wall' : 'attached'} form burns alike`,
        );
      }
    }
    if (spec.type.portal !== undefined) extras.push(portalRegisterLine(file, context, field));
    if (spec.strippable !== undefined) {
      extras.push(
        `BlockStripping.add(${field}, ${identifierExpression(file, spec.strippable)}); // msm:strippable`,
      );
    }
    extras.push(...toolPairLines(file, field, spec.flatten, spec.till));
    if (spec.item !== undefined) {
      const item = file.use('net.minecraft.world.item.Item');
      // A keep-contents container's item cannot go inside container items, as a shulker box (ADR 0074 D6).
      const ownItem = parity === undefined ? undefined : parityItem(parity.type, pkg);
      const blockItem =
        ownItem !== undefined
          ? [
              file.use(ownItem.fqcn),
              ...(ownItem.nested === undefined ? [] : [ownItem.nested]),
            ].join('.')
          : file.use(
              spec.type.type === 'door' ||
                (spec.type.plant3?.type === 'dripleaf' && !spec.type.plant3.big)
                ? 'net.minecraft.world.item.DoubleHighBlockItem'
                : spec.container?.keepContents === true
                  ? `${packageOf(context, 'block')}.ContainerBlockItem`
                  : 'net.minecraft.world.item.BlockItem',
            );
      const rarity = file.use('net.minecraft.world.item.Rarity');
      const { vanilla } = spec.item;
      const itemArgs = (ownItem?.args(file, field, companion) ?? [field]).join(', ');
      const stack =
        spec.stackSet || ownItem?.defaultStack === undefined
          ? spec.item.maxStackSize
          : ownItem.defaultStack;
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
          `public static final ${blockItem} ${field}_ITEM = ${registry}.register(${builtIn}.ITEM, ${field}_ITEM_KEY, new ${blockItem}(${itemArgs}, new ${item}.Properties()`,
          `        .setId(${field}_ITEM_KEY)`,
          `        ${prefix} // ${named}`,
          `        .stacksTo(${javaInt(stack)})`,
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
          `public static final ${blockItem} ${field}_ITEM = ${registry}.register(${builtIn}.ITEM, ${field}_ITEM_KEY, new ${blockItem}(${itemArgs}, ${helper}.apply(new ${item}.Properties()`,
          `        .setId(${field}_ITEM_KEY)`,
          `        ${prefix}, ${javaString(spec.itemId)}, ${field}_ITEM_COMPONENTS) // ${named.replace(/, as .*$/, '')}; msm:components first, the fields below win`,
          `        .stacksTo(${javaInt(stack)})`,
          `        .rarity(${rarity}.${spec.item.rarity})));`,
        );
      }
      // A project tab lists its own members (ModCreativeTabs, ADR 0096 D2).
      if (spec.item.creativeTab !== undefined && !context.projectTabs.has(spec.item.creativeTab))
        tabs.push(tabLine(file, spec.item.creativeTab, `${field}_ITEM`));
    }
  }
  if (specs.some((spec) => spec.container !== undefined)) writeContainerFiles(context);
  const perPlayer = specs.some((spec) => spec.container?.perPlayer === true);
  const doubleChest = specs.some((spec) => spec.container?.doubleChest === true);
  // ContainerOpeners knows the per-player store, so every project with containers has PlayerStores (and BlockWaxing).
  const containers = specs.some((spec) => spec.container !== undefined);
  if (containers || doubleChest) {
    writeStorage2Files(context, { perPlayer: containers, doubleChest });
  }
  if (perPlayer) {
    extras.push(
      "PlayerStores.register(); // each player's own store of the per-player chests (ADR 0104 D5)",
    );
    file.use(`${packageOf(context, 'block')}.PlayerStores`);
  }
  if (specs.some((spec) => spec.type.portal !== undefined)) writePortalFiles(context);
  if (machines.length > 0) writeMachineFiles(context);
  if (blockEntities.length > 0) writeBlockEventsFile(context);
  const strips = specs.some(
    (spec) =>
      spec.strippable !== undefined || spec.flatten !== undefined || spec.till !== undefined,
  );
  if (strips) {
    extras.push('BlockStripping.register();');
    context.files.push({
      path: classPath(context, '', 'BlockStripping'),
      contents: blockStrippingJava(context.input.javaPackage),
    });
  }
  // Waxing and scraping after stripping, so an axe strips first (ADR 0094 D9, B449); lightning after it (ADR 0104 D2).
  const weathers = specs.some((spec) => spec.weathering !== undefined);
  const waxes = weathers || specs.some((spec) => spec.waxInto !== undefined);
  if (waxes) extras.push(...waxing, 'BlockWaxing.register();');
  if (waxes || containers) {
    context.files.push({
      path: classPath(context, '', 'BlockWaxing'),
      contents: blockWaxingJava(pkg),
    });
  }
  if (weathers) {
    extras.push('Lightning.init(); // lightning scrapes these weathering blocks (ADR 0104 D2)');
    context.files.push({ path: classPath(context, '', 'Lightning'), contents: lightningJava(pkg) });
  }
  const drivers = new Set(
    specs.flatMap((spec) =>
      spec.type.parity !== undefined && hasDriverClass(spec.type.parity.type)
        ? [spec.type.parity.type]
        : [],
    ),
  );
  for (const driver of [...drivers].sort()) {
    context.files.push({
      path: classPath(context, 'block.type', DRIVER_CLASSES[driver] as string),
      contents: driverClassJava(driver, packageOf(context, 'block.type')) as string,
    });
  }
  for (const name of [...plantClasses].sort()) {
    context.files.push({
      path: classPath(context, 'block.type', name),
      contents: plantClassJava(name, packageOf(context, 'block.type')),
    });
  }
  // A project pot's listed plants after every block (ADR 0103 D2, B510b): the plants are registered by then.
  extras.push(...potLines);
  const helpers: string[] = [];
  const headFields: string[] = [];
  if (treeChecks.length > 0) {
    const lifecycle = file.use('net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents');
    const server = file.use('net.minecraft.server.MinecraftServer');
    const feature = file.use('net.minecraft.world.level.levelgen.feature.Feature');
    const identifier = file.use('net.minecraft.resources.Identifier');
    const logger = file.use('org.slf4j.Logger');
    const loggerFactory = file.use('org.slf4j.LoggerFactory');
    headFields.push(
      `private static final ${logger} LOGGER = ${loggerFactory}.getLogger(${javaString(context.input.modId)});`,
      '',
    );
    extras.push(
      `${lifecycle}.SERVER_STARTED.register(ModBlocks::checkTrees); // saplings: their trees resolve only when they grow`,
    );
    helpers.push(
      '',
      '/**',
      " * After start-up (every data pack loaded): one warning per sapling and tree that is not in the server's",
      ' * worldgen/feature registry; such a sapling does not grow, as vanilla (ADR 0068 D4).',
      ' */',
      `private static void checkTrees(${server} server) {`,
      `    ${registry}<${feature}> features = server.registryAccess().lookupOrThrow(${registries}.FEATURE);`,
      ...indent(treeChecks),
      '}',
      '',
      `private static void checkTree(${registry}<${feature}> features, String sapling, ${identifier} tree) {`,
      '    if (!features.containsKey(tree)) {',
      '        LOGGER.warn("sapling {}: tree feature {} is not in any loaded data pack", sapling, tree);',
      '    }',
      '}',
    );
  }
  if (usesFallingParticle) {
    const identifier = file.use('net.minecraft.resources.Identifier');
    const simpleParticle = file.use('net.minecraft.core.particles.SimpleParticleType');
    helpers.push(
      '',
      '/**',
      ' * The falling leaf particle of untinted leaves: a particle type without options. Anything else stops the start-up',
      ' * (the runtime gives such leaves no particle and warns).',
      ' */',
      `public static ${simpleParticle} fallingParticle(${identifier} id) {`,
      `    if (${builtIn}.PARTICLE_TYPE.getValue(id) instanceof ${simpleParticle} particle) {`,
      '        return particle;',
      '    }',
      '    throw new IllegalStateException("falling_particle " + id + " is not a particle type without options");',
      '}',
    );
  }
  if (usesTorchParticle) {
    const identifier = file.use('net.minecraft.resources.Identifier');
    const simpleParticle = file.use('net.minecraft.core.particles.SimpleParticleType');
    const particleTypes = file.use('net.minecraft.core.particles.ParticleTypes');
    const logger = file.use('org.slf4j.LoggerFactory');
    helpers.push(
      '',
      '/**',
      " * A torch's flame (ADR 0094 D2): a registered particle type without options (vanilla or the mod's own); anything",
      ' * else logs a warning and the torch uses minecraft:flame, as the runtime.',
      ' */',
      `public static ${simpleParticle} torchParticle(${identifier} id) {`,
      `    if (${builtIn}.PARTICLE_TYPE.getValue(id) instanceof ${simpleParticle} particle) {`,
      '        return particle;',
      '    }',
      `    ${logger}.getLogger(${javaString(context.input.modId)}).warn("particle {} is not a particle type without options; the torch uses minecraft:flame", id);`,
      `    return ${particleTypes}.FLAME;`,
      '}',
    );
  }
  if (usesWoodType) {
    const identifier = file.use('net.minecraft.resources.Identifier');
    const woodType = file.use('net.minecraft.world.level.block.state.properties.WoodType');
    const builder = file.use(
      'net.fabricmc.fabric.api.object.builder.v1.block.type.WoodTypeBuilder',
    );
    helpers.push(
      '',
      '/**',
      " * A sign's own wood type (ADR 0094 D6): named by the sign's id, with the sounds and block set type of {@code base};",
      ' * not registered. The client draws the sign from its block models and the edit screen picture at',
      ' * textures/gui/signs/<path>.png (hanging signs: gui/hanging_signs/).',
      ' */',
      `public static ${woodType} woodType(${identifier} id, ${woodType} base) {`,
      `    return ${builder}.copyOf(base).build(id, base.setType());`,
      '}',
    );
  }
  if (usesPottedPlant) {
    const identifier = file.use('net.minecraft.resources.Identifier');
    const flowerPot = file.use('net.minecraft.world.level.block.FlowerPotBlock');
    const doublePlant = file.use('net.minecraft.world.level.block.DoublePlantBlock');
    const blocks = file.use('net.minecraft.world.level.block.Blocks');
    helpers.push(
      '',
      '/**',
      " * A potted plant's plant (ADR 0094 D2), registered before it: it must exist, not be two blocks high and not be",
      ' * potted already (vanilla keeps one potted block per plant). Anything else stops the start-up, where the runtime',
      ' * skips the potted plant with a load error.',
      ' */',
      `public static ${blockType} pottedPlant(${identifier} id) {`,
      `    ${blockType} plant = ${builtIn}.BLOCK.getValue(id);`,
      `    if (!${builtIn}.BLOCK.containsKey(id) || plant == ${blocks}.AIR) {`,
      '        throw new IllegalStateException("plant " + id + " is not a registered block");',
      '    }',
      `    if (plant instanceof ${doublePlant}) {`,
      '        throw new IllegalStateException("plant " + id + " is two blocks high and cannot be potted");',
      '    }',
      `    for (${blockType} block : ${builtIn}.BLOCK) {`,
      `        if (block instanceof ${flowerPot} pot && pot.getPotted() == plant) {`,
      '            throw new IllegalStateException("plant " + id + " is already potted by " + BuiltInRegistries.BLOCK.getKey(block));',
      '        }',
      '    }',
      '    return plant;',
      '}',
    );
  }
  if (usesOwnSounds) helpers.push(...ownSoundsHelpers(file, context.input.modId));
  if (usesPotPlants) helpers.push(...potHelpers(file, context));
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
  const does = [
    specs.some((spec) => spec.flammable !== undefined || spec.strippable !== undefined)
      ? 'sets fire odds and stripping'
      : undefined,
    treeChecks.length > 0 ? "checks the saplings' trees after start-up" : undefined,
  ].filter((part) => part !== undefined);
  const lines = [
    '/** The blocks and block items, registered when the class loads. */',
    'public final class ModBlocks {',
    ...indent(headFields),
    ...indent(body.slice(1)),
    '',
    '    private ModBlocks() {}',
    '',
    does.length > 0
      ? `    /** Loads the class (registering every block), ${does.join(', ')}, and adds the block items to their creative tabs. */`
      : '    /** Loads the class (registering every block) and adds the block items to their creative tabs. */',
    '    public static void register() {',
    ...indent([...extras, ...tabs], 2),
    '    }',
    ...indent(helpers),
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModBlocks'), contents: file.render(lines) });
  return { className: 'ModBlocks', leafTints, blockEntities, machines };
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

function writeBlockClass(
  context: GenerationContext,
  spec: BlockSpec,
  name: string,
  field: string,
  fieldOf: ReadonlyMap<string, string> = new Map(),
): void {
  const javaPackage = packageOf(context, 'block');
  const file = new JavaFile(javaPackage, spec.input.path);
  const blockType = (): string => file.use('net.minecraft.world.level.block.Block');
  const properties = file.use('net.minecraft.world.level.block.state.BlockBehaviour', 'Properties');
  const actions = noteActions(context, file, spec.events);
  const power = tracksPower(spec);
  const ts = spec.type;
  // A double chest is vanilla's chest family (ADR 0104 D4): its own facing, water and shape.
  const doubleChest = spec.container?.doubleChest === true;
  const superClass = file.use(
    doubleChest
      ? `${javaPackage}.DoubleChestBlock`
      : ts.portal === undefined
        ? familyClass(ts, context.input.javaPackage).fqcn
        : `${packageOf(context, 'portal')}.PortalBlock`,
    ...(familyClass(ts, context.input.javaPackage).nested === undefined || doubleChest
      ? []
      : [familyClass(ts, context.input.javaPackage).nested as string]),
  );
  const water = spec.waterlogged;
  const facing = isFacing(ts) && !doubleChest;
  const open = spec.container !== undefined && !doubleChest;
  const lit = spec.machine !== undefined;

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
  if (open || lit) {
    const booleanProperty = file.use(
      'net.minecraft.world.level.block.state.properties.BooleanProperty',
    );
    const blockStateProperties = file.use(
      'net.minecraft.world.level.block.state.properties.BlockStateProperties',
    );
    if (members.length > 0) members.push('');
    members.push(
      open
        ? "/** msm:container: true while a player has the container open, as a barrel's. */"
        : '/** msm:machine: true while the machine works (burns fuel, or runs a recipe). */',
      open
        ? `public static final ${booleanProperty} OPEN = ${blockStateProperties}.OPEN;`
        : `public static final ${booleanProperty} LIT = ${blockStateProperties}.LIT;`,
    );
  }
  if (water) {
    const booleanProperty = file.use(
      'net.minecraft.world.level.block.state.properties.BooleanProperty',
    );
    const blockStateProperties = file.use(
      'net.minecraft.world.level.block.state.properties.BlockStateProperties',
    );
    if (members.length > 0) members.push('');
    members.push(
      '/** msm:waterloggable: holds water. */',
      `public static final ${booleanProperty} WATERLOGGED = ${blockStateProperties}.WATERLOGGED;`,
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
  const plant = plantMembers(file, ts, spec.input.id, spec.onRandomTick !== undefined);
  if (plant.fields.length > 0) {
    if (members.length > 0) members.push('');
    members.push(...plant.fields);
  }
  if (ts.portal !== undefined) {
    if (members.length > 0) members.push('');
    members.push(...portalSpecField(file, ts.portal, packageOf(context, 'portal')));
  }
  if (doubleChest && spec.container !== undefined) {
    if (members.length > 0) members.push('');
    members.push(
      `/** The msm:container of {@code ${spec.input.id}}: a double chest of 3 rows a half (ADR 0104 D4). */`,
      ...containerSpecLines(file, spec.container),
      '',
      `public ${name}(${properties} properties) {`,
      `    super(SPEC, () -> ${file.use(`${context.input.javaPackage}.ModBlockEntities`)}.${field}, properties);`,
    );
  } else if (ts.type === 'stairs') {
    const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
    members.push(
      '',
      `public ${name}(${blockState} base, ${properties} properties) {`,
      '    super(base, properties);',
    );
  } else {
    const args = [
      ...constructorArguments(file, ts, context.input.javaPackage, {
        blockId: spec.input.id,
        seedId: spec.itemId,
        ...setTypeOf(spec, context.input.javaPackage),
        ...potFieldOf(spec, fieldOf),
      }),
      'properties',
    ].join(', ');
    members.push('', `public ${name}(${properties} properties) {`, `    super(${args});`);
  }
  const falseDefaults = [
    ...(power ? ['.setValue(POWERED, false)'] : []),
    ...(open ? ['.setValue(OPEN, false)'] : []),
    ...(lit ? ['.setValue(LIT, false)'] : []),
    ...(water ? ['.setValue(WATERLOGGED, false)'] : []),
  ].join('');
  if (facing) {
    const direction = file.use('net.minecraft.core.Direction');
    members.push(
      `    registerDefaultState(stateDefinition.any().setValue(FACING, ${direction}.NORTH)${falseDefaults});`,
    );
  } else if (falseDefaults !== '' && ts.type === 'pillar') {
    // RotatedPillarBlock has set the axis to y.
    members.push(`    registerDefaultState(defaultBlockState()${falseDefaults});`);
  } else if (falseDefaults !== '') {
    members.push(`    registerDefaultState(stateDefinition.any()${falseDefaults});`);
  }
  members.push('}');
  members.push(...plant.methods);
  if (ts.portal?.onTravel !== undefined && spec.onTravel !== undefined) {
    members.push(...portalTravelMembers(file, ts.portal.onTravel, spec.onTravel));
  }

  if (power || facing || open || lit || water) {
    const stateDefinition = file.use('net.minecraft.world.level.block.state.StateDefinition');
    const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
    const added = [
      ...(facing ? ['FACING'] : []),
      ...(power ? ['POWERED'] : []),
      ...(open ? ['OPEN'] : []),
      ...(lit ? ['LIT'] : []),
      ...(water ? ['WATERLOGGED'] : []),
    ].join(', ');
    members.push(
      '',
      '@Override',
      `protected void createBlockStateDefinition(${stateDefinition}.Builder<${blockType()}, ${blockState}> builder) {`,
      ...(ts.type === 'pillar' ? ['    super.createBlockStateDefinition(builder); // AXIS'] : []),
      `    builder.add(${added});`,
      '}',
    );
  }
  if (facing) members.push(...facingMembers(file, ts, water));
  if (water) members.push(...waterlogMembers(file, !facing));
  const blockState = () => file.use('net.minecraft.world.level.block.state.BlockState');
  const level = () => file.use('net.minecraft.world.level.Level');
  const blockPos = () => file.use('net.minecraft.core.BlockPos');
  const serverLevel = () => file.use('net.minecraft.server.level.ServerLevel');
  const vec3 = () => file.use('net.minecraft.world.phys.Vec3');
  const player = () => file.use('net.minecraft.world.entity.player.Player');

  if (spec.shape !== undefined) {
    members.push(...shapeMembers(file, spec.shape, blockState(), blockPos(), shapeReturn));
  }

  // A container or machine fires msm:on_interact after its menu or holder (blockEntityMembers below);
  // a double chest after vanilla's chest menu.
  const hasEntity = (spec.container !== undefined && !doubleChest) || spec.machine !== undefined;
  if (!hasEntity && spec.onInteract !== undefined && (!isShaped(ts) || doubleChest)) {
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
  } else if (!hasEntity && spec.onInteract !== undefined) {
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
  const keepContents = spec.container?.keepContents === true;
  const triggers = triggerMembers(context, file, spec, keepContents);
  const keeping = agesKeeping(ts.type, spec.container !== undefined);
  if (spec.weathering !== undefined && spec.onRandomTick !== undefined) {
    // One randomTick: the block ages (vanilla's changeOverTime) where super's tick would run.
    const at = triggers.indexOf('    super.randomTick(state, level, pos, random);');
    if (at >= 0) triggers[at] = `    ${keeping ? WEATHER_TICK_KEEPING : WEATHER_TICK}`;
  }
  members.push(...triggers);
  if (spec.weathering !== undefined) {
    members.push(
      ...weatheringMembers(
        file,
        spec.weathering,
        spec.onRandomTick !== undefined,
        ts.type === 'door',
        file.use(`${context.input.javaPackage}.BlockWaxing`),
        keeping,
        ts.type === 'button'
          ? javaInt(ts.pressTicks ?? 20)
          : ts.type === 'pressure_plate'
            ? 'getPressedTime()'
            : undefined,
      ),
    );
  }
  if (spec.onEat !== undefined) {
    const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
    const blockPos = file.use('net.minecraft.core.BlockPos');
    const playerType = file.use('net.minecraft.world.entity.player.Player');
    const vec = file.use('net.minecraft.world.phys.Vec3');
    members.push(
      '',
      "/** The cake's on_eat: a slice was eaten; self and other are the player. */",
      '@Override',
      `protected void onEaten(${serverLevel} level, ${blockPos} pos, ${playerType} player) {`,
      `    ${fireCall(spec.onEat, `level, pos.immutable(), ${vec}.atCenterOf(pos), player, null`)}`,
      '}',
    );
  }
  if (
    spec.onRandomTick !== undefined &&
    (ts.type === 'berry_bush' ||
      ts.type === 'cocoa' ||
      ts.type === 'stem' ||
      ts.plant3 !== undefined)
  ) {
    const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
    members.push(
      '',
      '/** Vanilla stops at the last age; msm:on_random_tick fires at every state. */',
      '@Override',
      `protected boolean isRandomlyTicking(${blockState} state) {`,
      '    return true;',
      '}',
    );
  }
  let entity: BlockEntityMembers | undefined;
  if (doubleChest && spec.container !== undefined) {
    const fired = [spec.container.onOpen, spec.container.onClose].filter((e) => e !== undefined);
    entity = {
      interfaces: fired.length > 0 ? ['BlockEvents'] : [],
      members: [...newBlockEntityMembers(file, `${name}Entity`), ...fireEventMembers(file, fired)],
    };
    members.push(...entity.members);
  } else if (hasEntity) {
    const parts = {
      entityClass: `${name}Entity`,
      typeField: field,
      onInteract: spec.onInteract,
      onBreak:
        keepContents && spec.onBreak !== undefined
          ? [
              `if (level instanceof ${serverLevel()} server) {`,
              `    ${fireCall(spec.onBreak, `server, pos.immutable(), ${vec3()}.atCenterOf(pos), player, null`)}`,
              '}',
            ]
          : [],
    };
    entity =
      spec.container !== undefined
        ? containerBlockMembers(file, spec.container, parts)
        : machineBlockMembers(
            file,
            spec.machine as MachineInfo,
            parts,
            file.use(`${context.input.javaPackage}.ModBlockEntities`),
          );
    members.push(...entity.members);
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
  if (spec.ambient !== undefined) {
    members.push(...ambientMembers(context, file, spec.input.id, spec.ambient));
  }
  members.push(...eventMethods(file, spec.events, spec.kind, actions));

  const interfaces = [
    ...(entity?.interfaces ?? []),
    ...(water ? [file.use('net.minecraft.world.level.block.SimpleWaterloggedBlock')] : []),
    ...(spec.weathering !== undefined ? [weatheringInterface(file)] : []),
    ...(spec.weathering !== undefined && (ts.type === 'button' || ts.type === 'pressure_plate')
      ? [`${file.use(`${context.input.javaPackage}.BlockWaxing`)}.Pressed`]
      : []),
  ];
  const lines = [
    `/** The block {@code ${spec.input.id}}. */`,
    `public class ${name} extends ${superClass}${interfaces.length === 0 ? '' : ` implements ${interfaces.join(', ')}`} {`,
    ...indent(trimBlank(members)),
    '}',
  ];
  context.files.push({ path: classPath(context, 'block', name), contents: file.render(lines) });
}

/** Placement towards the placer, `rotate` and `mirror` of the facing types (`MsmBlock`, ADR 0067 D4). */
function facingMembers(file: JavaFile, ts: TypeSpec, waterlogged = false): string[] {
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
    waterlogged
      ? `    return ${waterloggedPlacement(file, `defaultBlockState().setValue(FACING, ${towards})`)};`
      : `    return defaultBlockState().setValue(FACING, ${towards});`,
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
function triggerMembers(
  context: GenerationContext,
  file: JavaFile,
  spec: BlockSpec,
  breakHandled = false,
): string[] {
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
  if (spec.onBreak !== undefined && !breakHandled) {
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
    // A sapling may have grown into a tree and decaying leaves are gone after vanilla's tick.
    const gone =
      spec.type.type === 'sapling'
        ? 'the sapling may have grown into a tree'
        : spec.type.type === 'leaves'
          ? 'decaying leaves are gone after super'
          : undefined;
    out.push(
      '',
      `/** msm:on_random_tick: on a random tick${chance > 0 && chance < 1 ? ` with chance ${chance}` : ''}, within the shared tick cap. */`,
      '@Override',
      `protected void randomTick(${blockState()} state, ${serverLevel()} level, ${blockPos()} pos, ${random} random) {`,
      '    super.randomTick(state, level, pos, random);',
      ...(gone === undefined
        ? indent(body)
        : [`    if (level.getBlockState(pos).is(this)) { // ${gone}`, ...indent(body, 2), '    }']),
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
