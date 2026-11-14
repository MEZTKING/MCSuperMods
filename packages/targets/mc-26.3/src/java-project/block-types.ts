/**
 * Block types (ADR 0067 D10): the `type` of a block definition and its own top-level fields,
 * read with the runtime's checks (`dev.mcsupermods.runtime.loader.BlockType`), and the Java the
 * generator writes per type, mirroring `registry/types/BlockTypes` and the `Msm*Block` driver
 * classes of `msm_runtime`:
 *
 * - `block`: a plain `Block` (unchanged).
 * - `pillar`: vanilla `RotatedPillarBlock` (axis of the clicked face, `rotatePillar`), as
 *   `MsmBlock` does for logs; `msm:shape` boxes turn with the axis.
 * - `horizontal`, `directional`: a generated `Block` subclass with `FACING` (four or six ways,
 *   towards the placer), placement, `rotate` and `mirror`; `msm:shape` boxes turn with it.
 * - `slab`, `stairs`, `wall`, `fence`, `fence_gate`, `door`, `trapdoor`, `button`,
 *   `pressure_plate` (weighted with `weighted_max`), `pane`: the vanilla family class, through
 *   a generated subclass where the constructor is protected or the block has events.
 *
 * The family `Properties` are those of `BlockTypes.properties` (vanilla's `Blocks.<clinit>`).
 * Set types use vanilla's `BlockSetType` constants (`wood` is `OAK` on 26.3, as the runtime's
 * `BlockSetTypes` seam); wood types use `WoodType` constants.
 *
 * The plant types (ADR 0068 D3, D4, D6, D8) mirror `MsmCropBlock`, `MsmSaplingBlock` and the
 * three leaves classes:
 *
 * - `crop`: a generated `CropBlock` subclass with its own static `AGE` (`0..max_age`), one
 *   outline per age from `stage_heights` (vanilla's ramp when the list is not `max_age + 1`
 *   long), the soil tag, the bone meal range (bounds swapped when `min` > `max`) and the block's
 *   own item as the seeds (`getBaseSeedId`).
 * - `sapling`: a generated `SaplingBlock` subclass with a `TreeGrower` named after the sapling's
 *   id (the 26.3 name map; no vanilla grower is replaced) holding the configured feature keys,
 *   looked up when it grows, and the soil tag. `ModBlocks` warns once per sapling and missing
 *   tree after the server starts (the runtime's `SaplingCheck`).
 * - `leaves`: vanilla `TintedParticleLeavesBlock` with a `tint` (registered by the client
 *   entrypoint with Fabric's `BlockColorRegistry`; a constant colour gets full alpha), else
 *   `UntintedParticleLeavesBlock` with a `falling_particle` (looked up at start-up; one that is
 *   not a particle type without options stops the start-up, where the runtime falls back to
 *   plain leaves with a warning), else `LeavesBlock`; no ambient sound. A `falling_particle` on
 *   tinted leaves is ignored, as in the runtime.
 *
 * Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { JavaFile } from './java';
import { identifierExpression, javaFloat, javaInt, javaString } from './java';
import type { Reader } from './read';

/** The block types this generator writes (ADR 0067 D1). */
export const BUILDING_TYPES = [
  'block',
  'pillar',
  'horizontal',
  'directional',
  'slab',
  'stairs',
  'wall',
  'fence',
  'fence_gate',
  'door',
  'trapdoor',
  'button',
  'pressure_plate',
  'pane',
] as const;

/** The plant types of ADR 0068. */
export const PLANT_TYPES = ['crop', 'sapling', 'leaves'] as const;

export type BuildingType = (typeof BUILDING_TYPES)[number];

export type PlantType = (typeof PLANT_TYPES)[number];

/** Every block type (ADR 0067 D1, ADR 0068). */
export type BlockTypeName = BuildingType | PlantType;

/** The types that keep a fixed or rotating shape and their own `powered` state (ADR 0067 D3). */
const SHAPED_TYPES: readonly BlockTypeName[] = ['block', 'pillar', 'horizontal', 'directional'];

/** Components allowed only on the shaped types (`BlockType.SHAPED_ONLY_COMPONENTS`). */
const SHAPED_ONLY_COMPONENTS = ['msm:shape', 'msm:redstone'];

/** Each type's own top-level fields (`BlockType.fields()`), plant types included. */
const TYPE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  block: [],
  pillar: [],
  horizontal: [],
  directional: [],
  slab: [],
  stairs: ['base_block'],
  wall: [],
  fence: [],
  fence_gate: ['wood_type'],
  door: ['set_type'],
  trapdoor: ['set_type'],
  button: ['set_type', 'press_ticks'],
  pressure_plate: ['set_type', 'weighted_max'],
  pane: [],
  crop: ['max_age', 'stage_heights', 'soil', 'bonemeal_growth'],
  sapling: ['tree', 'mega_tree', 'flower_tree', 'soil'],
  leaves: ['tint', 'particle_chance', 'falling_particle'],
};

/** MSM set type names (`BlockType.SetType`) to the 26.3 `BlockSetType` constant (`BlockSetTypes`). */
const SET_TYPES: Readonly<Record<string, string>> = {
  wood: 'OAK',
  cherry: 'CHERRY',
  bamboo: 'BAMBOO',
  crimson: 'CRIMSON',
  warped: 'WARPED',
  iron: 'IRON',
  copper: 'COPPER',
  gold: 'GOLD',
  stone: 'STONE',
  polished_blackstone: 'POLISHED_BLACKSTONE',
};

/** The wooden set types: buttons stay pressed 30 ticks (else 20) and arrows press them. */
const WOODEN_SET_TYPES = ['wood', 'cherry', 'bamboo', 'crimson', 'warped'];

/** MSM wood type names (`BlockType.WoodKind`); each is the `WoodType` constant of that name. */
const WOOD_TYPES = [
  'oak',
  'spruce',
  'birch',
  'acacia',
  'cherry',
  'jungle',
  'dark_oak',
  'pale_oak',
  'poplar',
  'crimson',
  'warped',
  'mangrove',
  'bamboo',
];

const BLOCK_SET_TYPE = 'net.minecraft.world.level.block.state.properties.BlockSetType';

/** A crop's fields (`BlockType.Crop`), resolved. */
export interface CropSpec {
  readonly maxAge: number;
  /** The outline height in pixels per age (`MsmCropBlock.stageHeights`). */
  readonly stageHeights: readonly number[];
  /** The soil block tag, without `#`. */
  readonly soil: string;
  /** Bone meal growth bounds, ordered. */
  readonly bonemealMin: number;
  readonly bonemealMax: number;
}

/** A sapling's fields (`BlockType.Sapling`). */
export interface SaplingSpec {
  readonly tree: string;
  readonly megaTree: string | undefined;
  /** `flower_tree`, else `tree`. */
  readonly flowerTree: string;
  /** The soil block tag, without `#`. */
  readonly soil: string;
}

/** A leaf tint (`BlockType.Tint`): a vanilla biome colour source or a constant RGB colour. */
export type LeafTint =
  | { readonly source: 'foliage' | 'grass' | 'dry_foliage' }
  | { readonly rgb: number };

/** A leaves block's fields (`BlockType.Leaves`). */
export interface LeavesSpec {
  readonly tint: LeafTint | undefined;
  readonly particleChance: number;
  /** The falling leaf particle of untinted leaves; ignored with a tint. */
  readonly fallingParticle: string | undefined;
}

/** A block's type and its own fields, as the runtime's `BlockType.Fields`. */
export interface TypeSpec {
  readonly type: BlockTypeName;
  /** `stairs`: the base block id (default `minecraft:stone`). */
  readonly baseBlock?: string;
  /** Doors, trapdoors, buttons, plates: the `BlockSetType` constant. */
  readonly setType?: string;
  /** Buttons: ticks pressed (default 30 for the wooden set types, else 20). */
  readonly pressTicks?: number;
  /** Pressure plates: a weighted plate up to this many entities. */
  readonly weightedMax?: number;
  /** Fence gates: the `WoodType` constant. */
  readonly woodType?: string;
  readonly crop?: CropSpec;
  readonly sapling?: SaplingSpec;
  readonly leaves?: LeavesSpec;
}

/** The top-level keys a definition of `type` may have besides the shared ones. */
export function typeKeys(reader: Reader): string[] {
  const type = reader.optionalString('type') ?? 'block';
  return ['type', ...(TYPE_FIELDS[type] ?? [])];
}

/**
 * Reads `type` and its fields with the runtime's checks; an unknown type, a set or wood type
 * outside vanilla's, a plant field out of range, or a component of `SHAPED_ONLY_COMPONENTS` on
 * a family or plant type fails (the runtime reports a load error for each).
 */
export function readType(reader: Reader, components: Reader | undefined): TypeSpec {
  const raw = reader.string('type', 'block');
  const all: readonly string[] = [...BUILDING_TYPES, ...PLANT_TYPES];
  if (!all.includes(raw)) {
    reader.fail(`type '${raw}' is not one of ${all.join(', ')}`);
  }
  const type = raw as BlockTypeName;
  if (!SHAPED_TYPES.includes(type)) {
    for (const key of SHAPED_ONLY_COMPONENTS) {
      if (components?.has(key) === true) {
        components.fail(
          `${key} is not allowed on type '${type}' (only block, pillar, horizontal, directional)`,
        );
      }
    }
  }
  switch (type) {
    case 'stairs': {
      const base = reader.string('base_block', 'minecraft:stone');
      if (!ID.test(base)) {
        reader.fail(`base_block '${base}' is not a block id`);
      }
      return { type, baseBlock: base.includes(':') ? base : `minecraft:${base}` };
    }
    case 'crop':
      return { type, crop: readCrop(reader) };
    case 'sapling':
      return { type, sapling: readSapling(reader) };
    case 'leaves':
      return { type, leaves: readLeaves(reader) };
    case 'fence_gate': {
      const wood = reader.requiredString('wood_type');
      if (!WOOD_TYPES.includes(wood)) {
        reader.fail(`wood_type '${wood}' is not one of ${WOOD_TYPES.join(', ')}`);
      }
      return { type, woodType: wood.toUpperCase() };
    }
    case 'door':
    case 'trapdoor':
      return { type, setType: setType(reader) };
    case 'button': {
      const set = reader.requiredString('set_type');
      const pressTicks = reader.integer('press_ticks', WOODEN_SET_TYPES.includes(set) ? 30 : 20);
      if (pressTicks < 1 || pressTicks > 200) reader.fail('press_ticks must be 1 to 200');
      return { type, setType: setType(reader), pressTicks };
    }
    case 'pressure_plate': {
      const weighted = reader.has('weighted_max') ? reader.integer('weighted_max', 1) : undefined;
      if (weighted !== undefined && weighted < 1) reader.fail('weighted_max must be at least 1');
      return weighted === undefined
        ? { type, setType: setType(reader) }
        : { type, setType: setType(reader), weightedMax: weighted };
    }
    default:
      return { type };
  }
}

/** An id as the runtime's `MsmCodecs.ID` (`Identifier.tryParse`; no namespace means `minecraft`). */
const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function id(reader: Reader, key: string, value: string): string {
  if (!ID.test(value)) reader.fail(`${key} '${value}' is not an id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

/** A block tag reference (`#namespace:path`, `MsmCodecs.TAG_ID`), without the `#`. */
function soilTag(reader: Reader, fallback: string): string {
  const raw = reader.string('soil', `#${fallback}`);
  if (!raw.startsWith('#') || !ID.test(raw.slice(1))) {
    reader.fail(`soil '${raw}' is not a tag reference (#namespace:path)`);
  }
  return id(reader, 'soil', raw.slice(1));
}

/** An integer from `min` to `max`. */
function integerIn(
  reader: Reader,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = reader.integer(key, fallback);
  if (value < min || value > max) reader.fail(`${key} must be ${min} to ${max}`);
  return value;
}

/** Vanilla's ramp (`BlockType.Crop.defaultStageHeight`): `round(2 + 14 * stage / maxAge)` pixels. */
export function defaultStageHeight(stage: number, maxAge: number): number {
  return Math.round(2 + (14 * stage) / maxAge);
}

function readCrop(reader: Reader): CropSpec {
  const maxAge = integerIn(reader, 'max_age', 7, 1, 15);
  let written: number[] | undefined;
  if (reader.has('stage_heights')) {
    const raw = reader.value.stage_heights;
    if (
      !Array.isArray(raw) ||
      raw.some((h) => typeof h !== 'number' || !Number.isInteger(h) || h < 1 || h > 16)
    ) {
      reader.fail('stage_heights must be a list of integers from 1 to 16');
    }
    written = raw as number[];
  }
  // B261: any length is kept; a list that is not max_age + 1 long falls back to vanilla's ramp.
  const stageHeights =
    written !== undefined && written.length === maxAge + 1
      ? written
      : Array.from({ length: maxAge + 1 }, (_, stage) => defaultStageHeight(stage, maxAge));
  const soil = soilTag(reader, 'minecraft:supports_crops');
  const growth = reader.object('bonemeal_growth');
  growth?.onlyKeys(['min', 'max'], 'bonemeal_growth field');
  const bound = (key: string): number => {
    const value = growth?.requiredInteger(key) ?? 0;
    if (value < 0 || value > 15) growth?.fail(`${key} must be 0 to 15`);
    return value;
  };
  const [min, max] = growth === undefined ? [2, 5] : [bound('min'), bound('max')];
  // B261: min > max is accepted by the format; the bounds are swapped, as the runtime does.
  return {
    maxAge,
    stageHeights,
    soil,
    bonemealMin: Math.min(min, max),
    bonemealMax: Math.max(min, max),
  };
}

function readSapling(reader: Reader): SaplingSpec {
  const tree = id(reader, 'tree', reader.requiredString('tree'));
  const mega = reader.optionalString('mega_tree');
  const flower = reader.optionalString('flower_tree');
  return {
    tree,
    megaTree: mega === undefined ? undefined : id(reader, 'mega_tree', mega),
    flowerTree: flower === undefined ? tree : id(reader, 'flower_tree', flower),
    soil: soilTag(reader, 'minecraft:supports_vegetation'),
  };
}

const TINT_SOURCES = ['foliage', 'grass', 'dry_foliage'] as const;

function readLeaves(reader: Reader): LeavesSpec {
  let tint: LeafTint | undefined;
  if (reader.has('tint')) {
    const raw = reader.value.tint;
    if (typeof raw === 'string') {
      if (!(TINT_SOURCES as readonly string[]).includes(raw)) {
        reader.fail(`tint '${raw}' is not one of ${TINT_SOURCES.join(', ')} or a colour`);
      }
      tint = { source: raw as (typeof TINT_SOURCES)[number] };
    } else {
      tint = { rgb: integerIn(reader, 'tint', 0, 0, 0xffffff) };
    }
  }
  const particleChance = reader.number('particle_chance', 0.01);
  if (particleChance < 0 || particleChance > 1) reader.fail('particle_chance must be 0 to 1');
  const particle = reader.optionalString('falling_particle');
  return {
    tint,
    particleChance,
    fallingParticle: particle === undefined ? undefined : id(reader, 'falling_particle', particle),
  };
}

function setType(reader: Reader): string {
  const set = reader.requiredString('set_type');
  const constant = SET_TYPES[set];
  if (constant === undefined) {
    reader.fail(`set_type '${set}' is not one of ${Object.keys(SET_TYPES).join(', ')}`);
  }
  return constant;
}

/** Whether the type keeps `msm:shape` and `msm:redstone` (the `MsmBlock` types). */
export function isShaped(spec: TypeSpec): boolean {
  return SHAPED_TYPES.includes(spec.type);
}

/** Whether the type is a rotating `MsmBlock` type with a `FACING` property. */
export function isFacing(spec: TypeSpec): boolean {
  return spec.type === 'horizontal' || spec.type === 'directional';
}

/** The vanilla class a block of this type is, or extends. */
export interface FamilyClass {
  /** Fully qualified vanilla class. */
  readonly fqcn: string;
  /** Whether its constructor is protected (a generated subclass is then always written). */
  readonly protectedConstructor: boolean;
}

/** The vanilla class per type (ADR 0067 D4; constructors checked with `javap`, 26.3). */
export function familyClass(spec: TypeSpec): FamilyClass {
  const block = (name: string, protectedConstructor = false): FamilyClass => ({
    fqcn: `net.minecraft.world.level.block.${name}`,
    protectedConstructor,
  });
  switch (spec.type) {
    case 'block':
    case 'horizontal':
    case 'directional':
      return block('Block');
    case 'pillar':
      return block('RotatedPillarBlock');
    case 'slab':
      return block('SlabBlock');
    case 'stairs':
      return block('StairBlock', true);
    case 'wall':
      return block('WallBlock');
    case 'fence':
      return block('FenceBlock');
    case 'fence_gate':
      return block('FenceGateBlock');
    case 'door':
      return block('DoorBlock', true);
    case 'trapdoor':
      return block('TrapDoorBlock', true);
    case 'button':
      return block('ButtonBlock', true);
    case 'pressure_plate':
      return spec.weightedMax === undefined
        ? block('PressurePlateBlock', true)
        : block('WeightedPressurePlateBlock', true);
    case 'pane':
      return block('IronBarsBlock', true);
    case 'crop':
      return block('CropBlock', true);
    case 'sapling':
      return block('SaplingBlock', true);
    case 'leaves':
      return spec.leaves?.tint !== undefined
        ? block('TintedParticleLeavesBlock')
        : spec.leaves?.fallingParticle !== undefined
          ? block('UntintedParticleLeavesBlock')
          : block('LeavesBlock');
  }
}

/**
 * The vanilla constructor arguments before `Properties` (set type, press ticks, wood type,
 * weighted count; a sapling's `GROWER`, a field of its generated class; the leaves' particle
 * chance, falling particle and no ambient sound); the stairs' base state is passed separately.
 *
 * @param modPackage - The mod's package, where `ModBlocks.fallingParticle` lives.
 */
export function constructorArguments(file: JavaFile, spec: TypeSpec, modPackage: string): string[] {
  const noAmbientSound = (): string =>
    `${file.use('net.minecraft.world.level.block.sounds.AmbientLeavesBlockSoundPlayer')}.noAmbientSound()`;
  switch (spec.type) {
    case 'sapling':
      return ['GROWER'];
    case 'leaves': {
      const leaves = spec.leaves;
      if (leaves === undefined) return [noAmbientSound()];
      if (leaves.tint !== undefined) return [javaFloat(leaves.particleChance)];
      if (leaves.fallingParticle !== undefined) {
        return [
          javaFloat(leaves.particleChance),
          `${file.use(`${modPackage}.ModBlocks`)}.fallingParticle(${identifierExpression(file, leaves.fallingParticle)})`,
          noAmbientSound(),
        ];
      }
      return [noAmbientSound()];
    }
    case 'fence_gate': {
      const woodType = file.use('net.minecraft.world.level.block.state.properties.WoodType');
      return [`${woodType}.${spec.woodType}`];
    }
    case 'door':
    case 'trapdoor':
      return [`${file.use(BLOCK_SET_TYPE)}.${spec.setType}`];
    case 'button':
      return [`${file.use(BLOCK_SET_TYPE)}.${spec.setType}`, javaInt(spec.pressTicks ?? 20)];
    case 'pressure_plate':
      return spec.weightedMax === undefined
        ? [`${file.use(BLOCK_SET_TYPE)}.${spec.setType}`]
        : [javaInt(spec.weightedMax), `${file.use(BLOCK_SET_TYPE)}.${spec.setType}`];
    default:
      return [];
  }
}

/**
 * The family's own vanilla `Properties` calls (`BlockTypes.properties`), as continuation lines.
 *
 * @param nearPlane - The method reference of the generated `isViewBlocking` helper of stairs
 *   and slabs (vanilla's private `Blocks.NEAR_PLANE_INTERSECTS_OUTLINE`).
 */
export function typeProperties(file: JavaFile, spec: TypeSpec, nearPlane: () => string): string[] {
  const popped = () =>
    `.pushReaction(${file.use('net.minecraft.world.level.material.PushReaction')}.POPPED)`;
  switch (spec.type) {
    case 'stairs':
    case 'slab':
      return [
        `        .isViewBlocking(${nearPlane()}) // ${spec.type}: as vanilla, only where the occlusion shape meets the near plane`,
      ];
    case 'wall':
    case 'fence':
    case 'fence_gate':
      return [`        .forceSolidOn() // ${spec.type}: as vanilla`];
    case 'pane':
      return ['        .noOcclusion() // pane: as vanilla glass panes and iron bars'];
    case 'door':
      return [`        .noOcclusion()${popped()} // door: as vanilla`];
    case 'trapdoor':
      return [
        '        .noOcclusion() // trapdoor: as vanilla',
        '        .isValidSpawn((state, level, pos, type) -> false)',
      ];
    case 'button':
      return [`        .noCollision()${popped()} // button: as vanilla`];
    case 'pressure_plate':
      return [`        .forceSolidOn().noCollision()${popped()} // pressure plate: as vanilla`];
    case 'crop':
    case 'sapling':
      return [`        .noCollision().randomTicks()${popped()} // ${spec.type}: as vanilla`];
    case 'leaves': {
      const entityTypes = file.use('net.minecraft.world.entity.EntityTypes');
      return [
        "        .randomTicks().noOcclusion() // leaves: as vanilla's Blocks.leavesProperties",
        `        .isValidSpawn((state, level, pos, type) -> type == ${entityTypes}.OCELOT || type == ${entityTypes}.PARROT)`,
        `        .isSuffocating((state, level, pos) -> false).ignitedByLava()${popped()}`,
        '        .isRedstoneConductor((state, level, pos) -> false)',
      ];
    }
    default:
      return [];
  }
}

/** Whether the type is a plant (its properties already have random ticks). */
export function isPlant(spec: TypeSpec): boolean {
  return (PLANT_TYPES as readonly string[]).includes(spec.type);
}

/** The constructor-time and override members of a plant's generated class. */
export interface PlantMembers {
  /** Static fields, before the constructor. */
  readonly fields: string[];
  /** Overrides, after the constructor. */
  readonly methods: string[];
}

/**
 * The members of a crop's or sapling's generated class (`MsmCropBlock`, `MsmSaplingBlock`), and
 * of leaves with a random tick event.
 *
 * @param blockId - The block's id, the 26.3 name of a sapling's `TreeGrower`.
 * @param randomTickEvent - Whether the block has `msm:on_random_tick`: crops and leaves then
 *   tick at every state, as the runtime's `isRandomlyTicking` (vanilla stops at the maximum
 *   age and ticks only decaying leaves).
 */
export function plantMembers(
  file: JavaFile,
  spec: TypeSpec,
  blockId: string,
  randomTickEvent: boolean,
): PlantMembers {
  const fields: string[] = [];
  const methods: string[] = [];
  const blockState = () => file.use('net.minecraft.world.level.block.state.BlockState');
  const blockGetter = () => file.use('net.minecraft.world.level.BlockGetter');
  const blockPos = () => file.use('net.minecraft.core.BlockPos');
  const block = () => file.use('net.minecraft.world.level.block.Block');
  const soil = (tag: string): void => {
    const tagKey = file.use('net.minecraft.tags.TagKey');
    const registries = file.use('net.minecraft.core.registries.Registries');
    fields.push(
      '',
      `/** The soil: block tag {@code #${tag}}. */`,
      `private static final ${tagKey}<${block()}> SOIL = ${tagKey}.create(${registries}.BLOCK, ${identifierExpression(file, tag)});`,
    );
    methods.push(
      '',
      '@Override',
      `protected boolean mayPlaceOn(${blockState()} state, ${blockGetter()} level, ${blockPos()} pos) {`,
      '    return state.is(SOIL);',
      '}',
    );
  };
  const ticksAlways = (why: string): void => {
    methods.push(
      '',
      `/** ${why}; msm:on_random_tick fires at every state. */`,
      '@Override',
      `protected boolean isRandomlyTicking(${blockState()} state) {`,
      '    return true;',
      '}',
    );
  };
  if (spec.crop !== undefined) {
    const crop = spec.crop;
    const integerProperty = file.use(
      'net.minecraft.world.level.block.state.properties.IntegerProperty',
    );
    const voxelShape = file.use('net.minecraft.world.phys.shapes.VoxelShape');
    const boxes = crop.stageHeights.map((height, age) => {
      const last = age === crop.stageHeights.length - 1;
      return `        ${boxExpression(block(), [0, 0, 0, 16, height, 16])}${last ? '};' : ','}`;
    });
    fields.push(
      `/** crop: the age, 0 to ${crop.maxAge} (vanilla's AGE is 0 to 7). */`,
      `public static final ${integerProperty} AGE = ${integerProperty}.create("age", 0, ${javaInt(crop.maxAge)});`,
      '',
      '/** The outline per age, from stage_heights in pixels. */',
      `private static final ${voxelShape}[] SHAPES = {`,
      ...boxes,
    );
    soil(crop.soil);
    const stateDefinition = file.use('net.minecraft.world.level.block.state.StateDefinition');
    const collisionContext = file.use('net.minecraft.world.phys.shapes.CollisionContext');
    const level = file.use('net.minecraft.world.level.Level');
    const mth = file.use('net.minecraft.util.Mth');
    const itemLike = file.use('net.minecraft.world.level.ItemLike');
    methods.unshift(
      '',
      '@Override',
      `protected ${integerProperty} getAgeProperty() {`,
      '    return AGE;',
      '}',
      '',
      '@Override',
      'public int getMaxAge() {',
      `    return ${javaInt(crop.maxAge)};`,
      '}',
      '',
      '@Override',
      `protected void createBlockStateDefinition(${stateDefinition}.Builder<${block()}, ${blockState()}> builder) {`,
      "    builder.add(AGE); // not super: vanilla's AGE is 0 to 7",
      '}',
      '',
      '@Override',
      `protected ${voxelShape} getShape(${blockState()} state, ${blockGetter()} level, ${blockPos()} pos, ${collisionContext} context) {`,
      '    return SHAPES[getAge(state)];',
      '}',
    );
    methods.push(
      '',
      crop.bonemealMin === crop.bonemealMax
        ? `/** Bone meal adds ${crop.bonemealMin} stage(s). */`
        : `/** Bone meal adds ${crop.bonemealMin} to ${crop.bonemealMax} stages. */`,
      '@Override',
      `protected int getBonemealAgeIncrease(${level} level) {`,
      `    return ${mth}.nextInt(level.getRandom(), ${javaInt(crop.bonemealMin)}, ${javaInt(crop.bonemealMax)});`,
      '}',
      '',
      "/** The seeds are the block's own item, whatever its id (item.id), as vanilla looks it up. */",
      '@Override',
      `protected ${itemLike} getBaseSeedId() {`,
      '    return this;',
      '}',
    );
    if (randomTickEvent) ticksAlways('Vanilla stops at the maximum age');
  }
  if (spec.sapling !== undefined) {
    const sapling = spec.sapling;
    const treeGrower = file.use('net.minecraft.world.level.block.grower.TreeGrower');
    const weightedList = file.use('net.minecraft.util.random.WeightedList');
    const resourceKey = file.use('net.minecraft.resources.ResourceKey');
    const registries = file.use('net.minecraft.core.registries.Registries');
    const key = (tree: string): string =>
      `${resourceKey}.create(${registries}.FEATURE, ${identifierExpression(file, tree)})`;
    const grows = [
      `grows ${sapling.tree}`,
      sapling.megaTree === undefined ? undefined : `${sapling.megaTree} two by two`,
      sapling.flowerTree === sapling.tree ? undefined : `${sapling.flowerTree} near flowers`,
    ].filter((part) => part !== undefined);
    fields.push(
      '/**',
      ` * sapling: ${grows.join(', ')}.`,
      ' * The trees are looked up when it grows; the grower is named after the sapling, so no vanilla grower is replaced.',
      ' */',
      `private static final ${treeGrower} GROWER = new ${treeGrower}(${javaString(blockId)},`,
      `        ${weightedList}.of(${key(sapling.tree)}),`,
      sapling.megaTree === undefined
        ? `        ${weightedList}.of(),`
        : `        ${weightedList}.of(${key(sapling.megaTree)}),`,
      `        ${weightedList}.of(${key(sapling.flowerTree)}),`,
      `        ${key(sapling.tree)});`,
    );
    soil(sapling.soil);
  }
  if (spec.type === 'leaves' && randomTickEvent) ticksAlways('Vanilla ticks only decaying leaves');
  return { fields, methods };
}

/** `[minX, minY, minZ, maxX, maxY, maxZ]` in pixels. */
type Box = readonly number[];

/** A quarter turn about Y as a model's `y: 90` (north to east): `(x, z) -> (16 - z, x)` (`MsmBlock.turnY`). */
function turnY(b: Box): Box {
  return [16 - (b[5] ?? 0), b[1] ?? 0, b[0] ?? 0, 16 - (b[2] ?? 0), b[4] ?? 0, b[3] ?? 0];
}

/** A quarter turn about X as a model's `x: 90` (north to down): `(y, z) -> (z, 16 - y)` (`MsmBlock.turnX`). */
function turnX(b: Box): Box {
  return [b[0] ?? 0, b[2] ?? 0, 16 - (b[4] ?? 0), b[3] ?? 0, b[5] ?? 0, 16 - (b[1] ?? 0)];
}

const times = (n: number, turn: (b: Box) => Box) => (b: Box) => {
  let out = b;
  for (let i = 0; i < n; i++) out = turn(out);
  return out;
};

/** The pillar axes and the turn of boxes written for axis `y` (`MsmBlock.pillarTurn`). */
export const PILLAR_TURNS: readonly (readonly [string, (b: Box) => Box])[] = [
  ['X', (b) => turnY(turnX(b))],
  ['Y', (b) => b],
  ['Z', turnX],
];

/** The facings and the turn of boxes written facing north (`MsmBlock.facingTurn`). */
export function facingTurns(spec: TypeSpec): readonly (readonly [string, (b: Box) => Box])[] {
  const horizontal: [string, (b: Box) => Box][] = [
    ['NORTH', (b) => b],
    ['EAST', turnY],
    ['SOUTH', times(2, turnY)],
    ['WEST', times(3, turnY)],
  ];
  return spec.type === 'directional'
    ? [...horizontal, ['DOWN', turnX], ['UP', times(3, turnX)]]
    : horizontal;
}

/** `Block.box(...)` of one box. */
export function boxExpression(blockType: string, box: Box): string {
  return `${blockType}.box(${box.map((n) => javaFloat(n)).join(', ')})`;
}
