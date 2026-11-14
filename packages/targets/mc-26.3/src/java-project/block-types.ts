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
 * `BlockSetTypes` seam); wood types use `WoodType` constants. The plant types (`crop`,
 * `sapling`, `leaves`) are not ejected yet (ADR 0068 D8). Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { JavaFile } from './java';
import { javaFloat, javaInt } from './java';
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

/** The plant types of ADR 0068, which the eject does not write yet. */
export const PLANT_TYPES = ['crop', 'sapling', 'leaves'] as const;

export type BuildingType = (typeof BUILDING_TYPES)[number];

/** The types that keep a fixed or rotating shape and their own `powered` state (ADR 0067 D3). */
const SHAPED_TYPES: readonly BuildingType[] = ['block', 'pillar', 'horizontal', 'directional'];

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

/** A block's type and its own fields, as the runtime's `BlockType.Fields`. */
export interface TypeSpec {
  readonly type: BuildingType;
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
}

/** The top-level keys a definition of `type` may have besides the shared ones. */
export function typeKeys(reader: Reader): string[] {
  const type = reader.optionalString('type') ?? 'block';
  return ['type', ...(TYPE_FIELDS[type] ?? [])];
}

/**
 * Reads `type` and its fields with the runtime's checks; a plant type, an unknown type, a set
 * or wood type outside vanilla's, or a component of `SHAPED_ONLY_COMPONENTS` on a family type
 * fails (the runtime reports a load error for each).
 */
export function readType(reader: Reader, components: Reader | undefined): TypeSpec {
  const raw = reader.string('type', 'block');
  if ((PLANT_TYPES as readonly string[]).includes(raw)) {
    reader.fail(`type '${raw}' cannot be ejected yet (ADR 0068 D8)`);
  }
  if (!(BUILDING_TYPES as readonly string[]).includes(raw)) {
    reader.fail(`type '${raw}' is not one of ${[...BUILDING_TYPES, ...PLANT_TYPES].join(', ')}`);
  }
  const type = raw as BuildingType;
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
      if (!/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(base)) {
        reader.fail(`base_block '${base}' is not a block id`);
      }
      return { type, baseBlock: base.includes(':') ? base : `minecraft:${base}` };
    }
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
  }
}

/**
 * The vanilla constructor arguments before `Properties` (set type, press ticks, wood type,
 * weighted count); the stairs' base state is passed separately.
 */
export function constructorArguments(file: JavaFile, spec: TypeSpec): string[] {
  switch (spec.type) {
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
    default:
      return [];
  }
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
