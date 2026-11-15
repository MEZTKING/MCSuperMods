/**
 * The twenty block types of ADR 0094 (D1 to D6, D13) in the 26.3 generator, mirroring the runtime's
 * `PlantTypes`, `FurnitureTypes` and `Companions` (`registry/types/`) with B440's overrides:
 *
 * - each type's own fields, read with the runtime's checks and defaults (`PlantFields`,
 *   `FurnitureFields`; the default tags and particle are this target's `BlockFacts`);
 * - the block class: vanilla's own (`FlowerPotBlock`, `CarpetBlock`, `CandleBlock`, `LadderBlock`,
 *   `TorchBlock`, `LanternBlock`, `ChainBlock`, `EndRodBlock`, `StandingSignBlock`,
 *   `CeilingHangingSignBlock`, `StemBlock`), or a shared class in `block/type/` where the runtime
 *   overrides vanilla (`templates/vanilla-blocks-java.ts`: cake candles and food, berry harvests and
 *   pick block, tall plant bone meal, vine spreading, sea pickle light and bone meal, layers that
 *   never melt, cocoa support, the straw bed rule, scaffolding's own distance);
 * - the type's `Properties` and vanilla light (torch 14, lantern 15, rod 14 unless
 *   `msm:light_emitter`; candles and sea pickles by state);
 * - the companions (`<path>_wall` of torches, signs and hanging signs, `<path>_attached` of stems),
 *   registered right after the element with `Properties.ofFullCopy`, and the signs added to vanilla's
 *   sign block entity types;
 * - the block item: `StandingAndWallBlockItem` (torch, sign; signs stack to 16), `HangingSignItem`
 *   (16), the scaffolding's placing item, beds stacking to 1.
 *
 * A sign's wood type is its own, named by the element's id, copying the sounds and set type of its
 * `wood_type` (`WoodTypeBuilder.copyOf(...).build(id, setType)`, unregistered; ADR 0094 D6 after
 * B440). Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { JavaFile } from './java';
import { identifierExpression, javaFloat, javaInt } from './java';
import type { Reader } from './read';
import { DRIVER_CLASSES } from './templates/vanilla-blocks-java';

/** The block types of ADR 0094 D1. */
export const VANILLA_PARITY_TYPES = [
  'bed',
  'cake',
  'berry_bush',
  'tall_plant',
  'ladder',
  'torch',
  'lantern',
  'chain',
  'sign',
  'hanging_sign',
  'potted_plant',
  'candle',
  'sea_pickle',
  'vine',
  'carpet',
  'layers',
  'rod',
  'stem',
  'cocoa',
  'scaffolding',
] as const;

export type ParityType = (typeof VANILLA_PARITY_TYPES)[number];

/** Each type's own top-level fields (`::msm::definition` dispatch on `type`). */
export const PARITY_FIELDS: Readonly<Record<ParityType, readonly string[]>> = {
  bed: ['rule', 'colour'],
  cake: ['food', 'on_eat'],
  berry_bush: ['berry', 'harvest', 'hurts'],
  tall_plant: ['bonemeal'],
  ladder: [],
  torch: ['particle'],
  lantern: [],
  chain: [],
  sign: ['wood_type'],
  hanging_sign: ['wood_type'],
  potted_plant: ['plant'],
  candle: [],
  sea_pickle: [],
  vine: ['spreads'],
  carpet: [],
  layers: [],
  rod: [],
  stem: ['fruit', 'soil', 'fruit_soil'],
  cocoa: ['support'],
  scaffolding: [],
};

/**
 * This target's defaults (`BlockFacts.stemTags`, `defaultTorchParticle`, the cocoa support of
 * B440); `test/java-project-vanilla-blocks.test.ts` checks them against the target's facts.
 */
export const PARITY_DEFAULTS = {
  stemSoil: 'minecraft:supports_melon_stem',
  stemFruitSoil: 'minecraft:supports_melon_stem_fruit',
  torchParticle: 'minecraft:flame',
  cocoaSupport: 'minecraft:supports_cocoa',
} as const;

/** The dye colours (`BlockFacts.dyeColours`), each a `DyeColor` constant in upper case. */
const DYE_COLOURS = [
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black',
];

const SIGN_WOOD_TYPES = [
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

/** The fields of one ADR 0094 type, resolved with the runtime's defaults. */
export interface ParitySpec {
  readonly type: ParityType;
  /** `bed`: the `DyeColor` constant and whether the straw bed rule applies. */
  readonly bed?: { readonly colour: string; readonly straw: boolean };
  /** `cake`: a slice's food and the `on_eat` event id. */
  readonly cake?: {
    readonly nutrition: number;
    readonly saturation: number;
    readonly onEat: string | undefined;
  };
  /** `berry_bush`. */
  readonly berry?: {
    readonly berry: string;
    readonly ripe: readonly [number, number];
    readonly full: readonly [number, number];
    readonly hurts: boolean;
  };
  /** `tall_plant`: bone meal drops a copy. */
  readonly dropsCopy?: boolean;
  /** `torch`: the flame particle id. */
  readonly particle?: string;
  /** `sign`, `hanging_sign`: the `WoodType` constant whose sounds the sign copies. */
  readonly woodType?: string;
  /** `potted_plant`: the plant block id. */
  readonly plant?: string;
  /** `stem`: the fruit block and the two tags, without `#`. */
  readonly stem?: { readonly fruit: string; readonly soil: string; readonly fruitSoil: string };
  /** `vine`. */
  readonly spreads?: boolean;
  /** `cocoa`: the support tag, without `#`. */
  readonly support?: string;
}

const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function fullId(reader: Reader, key: string, value: string): string {
  if (!ID.test(value)) reader.fail(`${key} '${value}' is not an id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

function tagField(reader: Reader, key: string, fallback: string): string {
  const raw = reader.string(key, `#${fallback}`);
  if (!raw.startsWith('#') || !ID.test(raw.slice(1))) {
    reader.fail(`${key} '${raw}' is not a tag reference (#namespace:path)`);
  }
  return fullId(reader, key, raw.slice(1));
}

function range(reader: Reader, key: string, fallback: [number, number]): [number, number] {
  if (!reader.has(key)) return fallback;
  const raw = reader.value[key];
  if (
    !Array.isArray(raw) ||
    raw.length !== 2 ||
    raw.some((n) => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 64)
  ) {
    reader.fail(`${key} must be [min, max], two integers from 0 to 64`);
  }
  return [raw[0] as number, raw[1] as number];
}

/** Whether `type` is one of ADR 0094's. */
export function isParityType(type: string): type is ParityType {
  return (VANILLA_PARITY_TYPES as readonly string[]).includes(type);
}

/** Reads the fields of an ADR 0094 type with the runtime's checks and defaults. */
export function readParity(reader: Reader, type: ParityType): ParitySpec {
  switch (type) {
    case 'bed': {
      const rule = reader.string('rule', 'bed');
      if (rule !== 'bed' && rule !== 'straw_bed')
        reader.fail(`rule '${rule}' is not bed or straw_bed`);
      const colour = reader.string('colour', 'white');
      if (!DYE_COLOURS.includes(colour)) reader.fail(`colour '${colour}' is not a dye colour`);
      return { type, bed: { colour: colour.toUpperCase(), straw: rule === 'straw_bed' } };
    }
    case 'cake': {
      const food = reader.object('food');
      food?.onlyKeys(['nutrition', 'saturation'], 'food field');
      const nutrition = food?.requiredInteger('nutrition') ?? 2;
      const saturation = food?.requiredNumber('saturation') ?? 0.1;
      if (nutrition < 1 || nutrition > 20) food?.fail('nutrition must be 1 to 20');
      if (saturation < 0 || saturation > 2) food?.fail('saturation must be 0 to 2');
      return { type, cake: { nutrition, saturation, onEat: reader.optionalString('on_eat') } };
    }
    case 'berry_bush': {
      const harvest = reader.object('harvest');
      harvest?.onlyKeys(['ripe', 'full'], 'harvest field');
      if (harvest !== undefined && (!harvest.has('ripe') || !harvest.has('full'))) {
        harvest.fail('harvest needs ripe and full');
      }
      return {
        type,
        berry: {
          berry: fullId(reader, 'berry', reader.requiredString('berry')),
          ripe: harvest === undefined ? [1, 2] : range(harvest, 'ripe', [1, 2]),
          full: harvest === undefined ? [2, 3] : range(harvest, 'full', [2, 3]),
          hurts: reader.boolean('hurts', true),
        },
      };
    }
    case 'tall_plant': {
      const bonemeal = reader.string('bonemeal', 'drop_copy');
      if (bonemeal !== 'none' && bonemeal !== 'drop_copy') {
        reader.fail(`bonemeal '${bonemeal}' is not none or drop_copy`);
      }
      return { type, dropsCopy: bonemeal === 'drop_copy' };
    }
    case 'torch':
      return {
        type,
        particle: fullId(
          reader,
          'particle',
          reader.string('particle', PARITY_DEFAULTS.torchParticle),
        ),
      };
    case 'sign':
    case 'hanging_sign': {
      const wood = reader.requiredString('wood_type');
      if (!SIGN_WOOD_TYPES.includes(wood)) {
        reader.fail(`wood_type '${wood}' is not one of ${SIGN_WOOD_TYPES.join(', ')}`);
      }
      return { type, woodType: wood.toUpperCase() };
    }
    case 'potted_plant':
      return { type, plant: fullId(reader, 'plant', reader.requiredString('plant')) };
    case 'stem':
      return {
        type,
        stem: {
          fruit: fullId(reader, 'fruit', reader.requiredString('fruit')),
          soil: tagField(reader, 'soil', PARITY_DEFAULTS.stemSoil),
          fruitSoil: tagField(reader, 'fruit_soil', PARITY_DEFAULTS.stemFruitSoil),
        },
      };
    case 'vine':
      return { type, spreads: reader.boolean('spreads', true) };
    case 'cocoa':
      return { type, support: tagField(reader, 'support', PARITY_DEFAULTS.cocoaSupport) };
    default:
      return { type };
  }
}

/** The vanilla classes of the types that use theirs unchanged. */
const VANILLA_CLASSES: Readonly<Partial<Record<ParityType, string>>> = {
  potted_plant: 'FlowerPotBlock',
  carpet: 'CarpetBlock',
  candle: 'CandleBlock',
  ladder: 'LadderBlock',
  torch: 'TorchBlock',
  lantern: 'LanternBlock',
  chain: 'ChainBlock',
  rod: 'EndRodBlock',
  sign: 'StandingSignBlock',
  hanging_sign: 'CeilingHangingSignBlock',
  stem: 'StemBlock',
};

/**
 * The simple names of the vanilla block classes the generated `ModBlocks` may import (the families
 * of ADR 0067, the plants of ADR 0068, the ADR 0094 classes and companions): a generated block
 * class must not share one, or its file and `ModBlocks` would import two classes of one name.
 */
export const VANILLA_BLOCK_CLASS_NAMES: ReadonlySet<string> = new Set([
  'Block',
  'RotatedPillarBlock',
  'SlabBlock',
  'StairBlock',
  'WallBlock',
  'FenceBlock',
  'FenceGateBlock',
  'DoorBlock',
  'TrapDoorBlock',
  'ButtonBlock',
  'PressurePlateBlock',
  'WeightedPressurePlateBlock',
  'IronBarsBlock',
  'CropBlock',
  'SaplingBlock',
  'LeavesBlock',
  'TintedParticleLeavesBlock',
  'UntintedParticleLeavesBlock',
  ...Object.values(VANILLA_CLASSES),
  'WallTorchBlock',
  'WallSignBlock',
  'WallHangingSignBlock',
  'AttachedStemBlock',
]);

/** The fully qualified class a block of `type` is, or extends (every constructor is public). */
export function parityClass(type: ParityType, javaPackage: string): string {
  const driver = DRIVER_CLASSES[type];
  if (driver !== undefined) return `${javaPackage}.block.type.${driver}`;
  return `net.minecraft.world.level.block.${VANILLA_CLASSES[type] as string}`;
}

/** Whether `type` is drawn by a shared class of `block/type/`. */
export function hasDriverClass(type: ParityType): boolean {
  return DRIVER_CLASSES[type] !== undefined;
}

/** The generated companion's id suffix, or `undefined` (ADR 0094 D3). */
export function companionSuffix(type: string): '_wall' | '_attached' | undefined {
  if (type === 'torch' || type === 'sign' || type === 'hanging_sign') return '_wall';
  if (type === 'stem') return '_attached';
  return undefined;
}

/**
 * The constructor arguments before `Properties`.
 *
 * @param blockId - The element's id (a sign's wood type is named by it).
 * @param seedId - The element's item id, else its id (a stem's seed).
 * @param modBlocks - The `ModBlocks` class as seen from `file` (helpers live there).
 */
export function parityArguments(
  file: JavaFile,
  spec: ParitySpec,
  blockId: string,
  seedId: string,
  modBlocks: string,
): string[] {
  switch (spec.type) {
    case 'bed': {
      const dye = file.use('net.minecraft.world.item.DyeColor');
      return [`${dye}.${spec.bed?.colour ?? 'WHITE'}`, String(spec.bed?.straw === true)];
    }
    case 'cake':
      return [javaInt(spec.cake?.nutrition ?? 2), javaFloat(spec.cake?.saturation ?? 0.1)];
    case 'berry_bush': {
      const berry = spec.berry;
      if (berry === undefined) return [];
      return [
        identifierExpression(file, berry.berry),
        ...[...berry.ripe, ...berry.full].map((n) => javaInt(n)),
        String(berry.hurts),
      ];
    }
    case 'tall_plant':
      return [String(spec.dropsCopy !== false)];
    case 'vine':
      return [String(spec.spreads !== false)];
    case 'cocoa':
      return [identifierExpression(file, spec.support ?? PARITY_DEFAULTS.cocoaSupport)];
    case 'torch':
      return [
        `${modBlocks}.torchParticle(${identifierExpression(file, spec.particle ?? PARITY_DEFAULTS.torchParticle)})`,
      ];
    case 'sign':
    case 'hanging_sign': {
      const woodType = file.use('net.minecraft.world.level.block.state.properties.WoodType');
      return [
        `${modBlocks}.woodType(${identifierExpression(file, blockId)}, ${woodType}.${spec.woodType ?? 'OAK'})`,
      ];
    }
    case 'potted_plant':
      return [
        `${modBlocks}.pottedPlant(${identifierExpression(file, spec.plant ?? 'minecraft:air')})`,
      ];
    case 'stem': {
      const stem = spec.stem;
      if (stem === undefined) return [];
      const resourceKey = file.use('net.minecraft.resources.ResourceKey');
      const registries = file.use('net.minecraft.core.registries.Registries');
      const tagKey = file.use('net.minecraft.tags.TagKey');
      return [
        `${resourceKey}.create(${registries}.BLOCK, ${identifierExpression(file, stem.fruit)})`,
        `${resourceKey}.create(${registries}.BLOCK, ${identifierExpression(file, `${blockId}_attached`)})`,
        `${resourceKey}.create(${registries}.ITEM, ${identifierExpression(file, seedId)})`,
        `${tagKey}.create(${registries}.BLOCK, ${identifierExpression(file, stem.soil)})`,
        `${tagKey}.create(${registries}.BLOCK, ${identifierExpression(file, stem.fruitSoil)})`,
      ];
    }
    default:
      return [];
  }
}

/** Vanilla's light of the lights (ADR 0094 D4), unless `msm:light_emitter` sets one. */
const DEFAULT_LIGHT: Readonly<Partial<Record<ParityType, number>>> = {
  torch: 14,
  lantern: 15,
  rod: 14,
};

/**
 * The type's `Properties` calls, as continuation lines (`PlantTypes.create`,
 * `FurnitureTypes.create`), including the light of the lights and of candles and sea pickles.
 *
 * @param ownLight - Whether the block has `msm:light_emitter`.
 * @param modPackage - The mod's package (the shared classes are in its `block.type`).
 */
export function parityProperties(
  file: JavaFile,
  spec: ParitySpec,
  ownLight: boolean,
  modPackage: string,
): string[] {
  const popped = (): string =>
    `.pushReaction(${file.use('net.minecraft.world.level.material.PushReaction')}.POPPED)`;
  const note = `// ${spec.type.replace('_', ' ')}: as vanilla`;
  const line = (calls: string): string => `        ${calls} ${note}`;
  const out: string[] = [];
  switch (spec.type) {
    case 'cake':
      out.push(line(`.forceSolidOn()${popped()}`));
      break;
    case 'berry_bush':
      out.push(line(`.randomTicks().noCollision()${popped()}`));
      break;
    case 'tall_plant': {
      const behaviour = file.use('net.minecraft.world.level.block.state.BlockBehaviour');
      out.push(line(`.noCollision().offsetType(${behaviour}.OffsetType.XZ)${popped()}`));
      break;
    }
    case 'potted_plant':
      out.push(line(`.noOcclusion()${popped()}`));
      break;
    case 'vine':
      out.push(
        line(
          `.replaceable().noCollision()${popped()}${spec.spreads === false ? '' : '.randomTicks()'}`,
        ),
      );
      break;
    case 'sea_pickle': {
      const pickle = file.use(parityClass('sea_pickle', modPackage));
      out.push(
        line(`.noOcclusion()${popped()}.lightLevel(${pickle}::light) // light by pickles in water`),
      );
      break;
    }
    case 'layers':
    case 'stem':
    case 'cocoa':
    case 'bed':
    case 'ladder':
    case 'torch':
    case 'lantern':
    case 'scaffolding':
      break;
    case 'candle': {
      const candle = file.use('net.minecraft.world.level.block.CandleBlock');
      out.push(
        line(
          `.noOcclusion()${popped()}.lightLevel(${candle}.LIGHT_EMISSION) // light by lit candles`,
        ),
      );
      break;
    }
    case 'chain':
      out.push(line('.forceSolidOn().noOcclusion()'));
      break;
    case 'rod':
      out.push(line('.forceSolidOff().noOcclusion()'));
      break;
    case 'sign':
    case 'hanging_sign':
      out.push(line('.forceSolidOn().noCollision()'));
      break;
    default:
      break;
  }
  switch (spec.type) {
    case 'layers':
      out.push(line(popped()));
      break;
    case 'stem':
      out.push(line(`.noCollision().randomTicks()${popped()}`));
      break;
    case 'cocoa':
      out.push(line(`.randomTicks().noOcclusion()${popped()}`));
      break;
    case 'bed':
      out.push(line(`.noOcclusion()${popped()}`));
      break;
    case 'ladder':
      out.push(line(`.forceSolidOff().noOcclusion()${popped()}`));
      break;
    case 'torch':
      out.push(line(`.noCollision()${popped()}`));
      break;
    case 'lantern':
      out.push(line(`.forceSolidOn().noOcclusion()${popped()}`));
      break;
    case 'scaffolding':
      out.push(
        line(
          `.noCollision().dynamicShape().isValidSpawn((state, level, pos, type) -> false).isRedstoneConductor((state, level, pos) -> false)${popped()}`,
        ),
      );
      break;
    default:
      break;
  }
  const light = DEFAULT_LIGHT[spec.type];
  if (light !== undefined && !ownLight) {
    out.push(`        .lightLevel(state -> ${javaInt(light)}) // ${spec.type}: vanilla's light`);
  }
  return out;
}

/** Whether the type's light comes from its state, so `msm:light_emitter` is not applied. */
export function lightFromState(type: string): boolean {
  return type === 'candle' || type === 'sea_pickle';
}

/**
 * The companion's construction, given the element's field: the wall torch, wall sign, wall
 * hanging sign or attached stem (`Companions.registerAfter`).
 */
export function companionExpression(
  file: JavaFile,
  spec: ParitySpec,
  field: string,
  blockId: string,
  seedId: string,
  modBlocks: string,
  props: string,
): string {
  const block = (name: string): string => file.use(`net.minecraft.world.level.block.${name}`);
  switch (spec.type) {
    case 'torch':
      return `new ${block('WallTorchBlock')}(${parityArguments(file, spec, blockId, seedId, modBlocks)[0]}, ${props})`;
    case 'sign':
      return `new ${block('WallSignBlock')}(${field}.type(), ${props})`;
    case 'hanging_sign':
      return `new ${block('WallHangingSignBlock')}(${field}.type(), ${props})`;
    case 'stem': {
      const stem = spec.stem;
      const resourceKey = file.use('net.minecraft.resources.ResourceKey');
      const registries = file.use('net.minecraft.core.registries.Registries');
      const tagKey = file.use('net.minecraft.tags.TagKey');
      return `new ${block('AttachedStemBlock')}(${resourceKey}.create(${registries}.BLOCK, ${identifierExpression(file, blockId)}), ${resourceKey}.create(${registries}.BLOCK, ${identifierExpression(file, stem?.fruit ?? 'minecraft:air')}), ${resourceKey}.create(${registries}.ITEM, ${identifierExpression(file, seedId)}), ${tagKey}.create(${registries}.BLOCK, ${identifierExpression(file, stem?.soil ?? PARITY_DEFAULTS.stemSoil)}), ${props})`;
    }
    default:
      throw new Error(`no companion for type ${spec.type}`);
  }
}

/** The block item of an ADR 0094 type: its class and constructor arguments before the properties. */
export interface ParityItem {
  /** Fully qualified item class. */
  readonly fqcn: string;
  /** A nested class of {@link ParityItem.fqcn}, such as `PlacingItem`. */
  readonly nested?: string;
  /** Arguments before `Properties`, given the element's field and its companion's. */
  readonly args: (file: JavaFile, field: string, companion: string | undefined) => string[];
  /** The stack size when the definition sets none. */
  readonly defaultStack: number | undefined;
}

/** The block item of `type` (`Companions.blockItem`), or `undefined` for a plain `BlockItem`. */
export function parityItem(type: ParityType, javaPackage: string): ParityItem | undefined {
  switch (type) {
    case 'torch':
    case 'sign':
      return {
        fqcn: 'net.minecraft.world.item.StandingAndWallBlockItem',
        args: (f, field, companion) => [
          field,
          companion ?? field,
          `${f.use('net.minecraft.core.Direction')}.DOWN`,
        ],
        defaultStack: type === 'sign' ? 16 : undefined,
      };
    case 'hanging_sign':
      return {
        fqcn: 'net.minecraft.world.item.HangingSignItem',
        args: (_f, field, companion) => [field, companion ?? field],
        defaultStack: 16,
      };
    case 'scaffolding':
      return {
        fqcn: `${javaPackage}.block.type.ModScaffoldingBlock`,
        nested: 'PlacingItem',
        args: (_f, field) => [field],
        defaultStack: undefined,
      };
    case 'bed':
      return {
        fqcn: 'net.minecraft.world.item.BlockItem',
        args: (_f, field) => [field],
        defaultStack: 1,
      };
    default:
      return undefined;
  }
}
