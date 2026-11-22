/**
 * The plant types and project flower pots of ADR 0103 (D1 to D4 and its amendment after B503) in
 * the 26.3 generator (ADR 0112 D3), mirroring the runtime's `GrowingPlantTypes`, `PotTypes`,
 * `Companions` and the plant classes of `registry/types/` (B509, B510, B510b):
 *
 * - `growing_plant`: the tip is a `ModGrowingPlantHeadBlock` (a water plant its nested `Water`,
 *   vanilla's kelp) and the companion `<path>_plant` its strand (`ModGrowingPlantBodyBlock`, or
 *   its `Water`); a plant with `berries` glows at `berries.light` while it has them;
 * - `column_plant`: `ModColumnPlantBlock.Cane` and `.Cactus` (vanilla's sugar cane and cactus), or
 *   the bamboo-like `ModBambooBlock` with its companion `<path>_shoot`;
 * - `multiface`: `ModMultifaceBlock` (vanilla's glow lichen) at its `light`;
 * - `dripleaf`: `ModBigDripleafBlock` with its companion `<path>_stem`, or `ModSmallDripleafBlock`
 *   placed by a double-high item;
 * - `flower_pot`: an empty `ModFlowerPotBlock` with one potted companion `<pot>_<plant path>` per
 *   `plants` entry (registered in `ModBlocks.register`, after every block), and a `potted_plant`
 *   whose `pot` is a project pot is a `ModFlowerPotBlock` of that pot.
 *
 * The fields are read with the runtime's checks and defaults; the shared classes are
 * `templates/growing-plants-java.ts`. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { JavaFile } from './java';
import { identifierExpression, javaFloat, javaInt } from './java';
import type { Reader } from './read';

/** The types of ADR 0103 D1, D2. */
export const PLANT_3_TYPES = [
  'growing_plant',
  'column_plant',
  'multiface',
  'dripleaf',
  'flower_pot',
] as const;

export type Plant3Type = (typeof PLANT_3_TYPES)[number];

/** Each type's own top-level fields (`::msm::definition` dispatch on `type`). */
export const PLANT_3_FIELDS: Readonly<Record<Plant3Type, readonly string[]>> = {
  growing_plant: [
    'direction',
    'max_age',
    'growth_chance',
    'bonemeal_growth',
    'needs_water',
    'berries',
    'climbable',
    'soil',
  ],
  column_plant: ['style', 'max_height', 'min_height', 'soil', 'needs_water_nearby', 'touch_damage'],
  multiface: ['light', 'spreads', 'waterloggable'],
  dripleaf: ['size', 'grows_into', 'tilt_ticks'],
  flower_pot: ['plants'],
};

/** A soil entry: a block id or a block tag (`#`), namespaced. */
export interface SoilEntry {
  readonly id: string;
  readonly tag: boolean;
}

/** The fields of one ADR 0103 type, with the runtime's defaults. */
export type Plant3Spec =
  | {
      readonly type: 'growing_plant';
      readonly down: boolean;
      readonly maxAge: number;
      readonly growthChance: number;
      readonly bonemeal: readonly [number, number] | undefined;
      readonly needsWater: boolean;
      readonly berries: { readonly item: string; readonly light: number } | undefined;
      readonly soil: readonly SoilEntry[] | undefined;
    }
  | {
      readonly type: 'column_plant';
      readonly style: 'cane' | 'cactus' | 'bamboo';
      readonly maxHeight: number;
      readonly minHeight: number;
      readonly soil: readonly SoilEntry[] | undefined;
      readonly needsWaterNearby: boolean;
      readonly touchDamage: number;
    }
  | {
      readonly type: 'multiface';
      readonly light: number;
      readonly spreads: boolean;
      readonly waterloggable: boolean;
    }
  | {
      readonly type: 'dripleaf';
      readonly big: boolean;
      readonly growsInto: string | undefined;
      readonly tiltTicks: readonly number[];
    }
  | { readonly type: 'flower_pot'; readonly plants: readonly string[] };

const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function fullId(reader: Reader, key: string, value: string): string {
  if (!ID.test(value)) reader.fail(`${key} '${value}' is not an id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

function integerIn(reader: Reader, key: string, fallback: number, min: number, max: number) {
  const value = reader.integer(key, fallback);
  if (value < min || value > max) reader.fail(`${key} must be ${min} to ${max}`);
  return value;
}

function numberIn(reader: Reader, key: string, fallback: number, min: number, max: number) {
  const value = reader.number(key, fallback);
  if (value < min || value > max) reader.fail(`${key} must be ${min} to ${max}`);
  return value;
}

function readSoil(reader: Reader): SoilEntry[] | undefined {
  if (!reader.has('soil')) return undefined;
  const raw = reader.value.soil;
  if (
    !Array.isArray(raw) ||
    raw.length < 1 ||
    raw.length > 16 ||
    raw.some((e) => typeof e !== 'string')
  ) {
    reader.fail('soil must be a list of 1 to 16 block ids or #tags');
  }
  return (raw as string[]).map((entry) => {
    const tag = entry.startsWith('#');
    return { id: fullId(reader, 'soil', tag ? entry.slice(1) : entry), tag };
  });
}

/** Whether `type` is one of ADR 0103's. */
export function isPlant3Type(type: string): type is Plant3Type {
  return (PLANT_3_TYPES as readonly string[]).includes(type);
}

/** Reads the fields of an ADR 0103 type with the runtime's checks and defaults (`GrowingPlantFields`). */
export function readPlant3(reader: Reader, type: Plant3Type): Plant3Spec {
  switch (type) {
    case 'growing_plant': {
      const direction = reader.string('direction', 'up');
      if (direction !== 'up' && direction !== 'down')
        reader.fail(`direction '${direction}' is not up or down`);
      const growth = reader.object('bonemeal_growth');
      growth?.onlyKeys(['min', 'max'], 'bonemeal_growth field');
      const bound = (key: string): number => {
        const value = growth?.requiredInteger(key) ?? 0;
        if (value < 0 || value > 15) growth?.fail(`${key} must be 0 to 15`);
        return value;
      };
      const berries = reader.object('berries');
      berries?.onlyKeys(['item', 'light'], 'berries field');
      reader.boolean('climbable', true); // the lowering's #minecraft:climbable
      return {
        type,
        down: direction === 'down',
        maxAge: integerIn(reader, 'max_age', 25, 0, 25),
        growthChance: numberIn(reader, 'growth_chance', 0.14, 0, 1),
        bonemeal: growth === undefined ? undefined : [bound('min'), bound('max')],
        needsWater: reader.boolean('needs_water', false),
        berries:
          berries === undefined
            ? undefined
            : {
                item: fullId(berries, 'item', berries.requiredString('item')),
                light: integerIn(berries, 'light', 14, 0, 15),
              },
        soil: readSoil(reader),
      };
    }
    case 'column_plant': {
      const style = reader.requiredString('style');
      if (style !== 'cane' && style !== 'cactus' && style !== 'bamboo') {
        reader.fail(`style '${style}' is not cane, cactus or bamboo`);
      }
      const maxHeight = integerIn(reader, 'max_height', style === 'bamboo' ? 16 : 3, 1, 32);
      const minHeight = reader.has('min_height')
        ? integerIn(reader, 'min_height', maxHeight, 1, 32)
        : style === 'bamboo'
          ? Math.min(12, maxHeight)
          : maxHeight;
      if (minHeight > maxHeight)
        reader.fail(`min_height ${minHeight} is above max_height ${maxHeight}`);
      return {
        type,
        style,
        maxHeight,
        minHeight,
        soil: readSoil(reader),
        needsWaterNearby: reader.boolean('needs_water_nearby', style === 'cane'),
        touchDamage: numberIn(reader, 'touch_damage', style === 'cactus' ? 1 : 0, 0, 100),
      };
    }
    case 'multiface':
      return {
        type,
        light: integerIn(reader, 'light', 7, 0, 15),
        spreads: reader.boolean('spreads', true),
        waterloggable: reader.boolean('waterloggable', true),
      };
    case 'dripleaf': {
      const size = reader.requiredString('size');
      if (size !== 'big' && size !== 'small') reader.fail(`size '${size}' is not big or small`);
      const into = reader.optionalString('grows_into');
      if (size === 'small' && into === undefined) {
        reader.fail('grows_into: missing (a small dripleaf names the big dripleaf it grows into)');
      }
      if (size === 'big' && into !== undefined) {
        reader.fail("grows_into: only for size 'small' (a big dripleaf grows taller instead)");
      }
      let tilt = [2, 10, 10];
      if (reader.has('tilt_ticks')) {
        if (size === 'small')
          reader.fail("tilt_ticks: only for size 'big' (a small dripleaf does not tilt)");
        const raw = reader.value.tilt_ticks;
        if (
          !Array.isArray(raw) ||
          raw.length !== 3 ||
          raw.some((n) => typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 1200)
        ) {
          reader.fail('tilt_ticks must be three integers from 1 to 1200');
        }
        tilt = raw as number[];
      }
      return {
        type,
        big: size === 'big',
        growsInto: into === undefined ? undefined : fullId(reader, 'grows_into', into),
        tiltTicks: tilt,
      };
    }
    case 'flower_pot': {
      const raw = reader.value.plants;
      if (
        !Array.isArray(raw) ||
        raw.length < 1 ||
        raw.length > 64 ||
        raw.some((e) => typeof e !== 'string')
      ) {
        reader.fail('plants must be a list of 1 to 64 block ids');
      }
      return { type, plants: (raw as string[]).map((id) => fullId(reader, 'plants', id)) };
    }
  }
}

/** The shared class a block of the type is, or extends, with its nested class. */
export function plant3Class(
  spec: Plant3Spec,
  javaPackage: string,
): { fqcn: string; nested?: string } {
  const pkg = `${javaPackage}.block.type`;
  switch (spec.type) {
    case 'growing_plant':
      return spec.needsWater
        ? { fqcn: `${pkg}.ModGrowingPlantHeadBlock`, nested: 'Water' }
        : { fqcn: `${pkg}.ModGrowingPlantHeadBlock` };
    case 'column_plant':
      return spec.style === 'bamboo'
        ? { fqcn: `${pkg}.ModBambooBlock` }
        : { fqcn: `${pkg}.ModColumnPlantBlock`, nested: spec.style === 'cane' ? 'Cane' : 'Cactus' };
    case 'multiface':
      return { fqcn: `${pkg}.ModMultifaceBlock` };
    case 'dripleaf':
      return { fqcn: `${pkg}.${spec.big ? 'ModBigDripleafBlock' : 'ModSmallDripleafBlock'}` };
    case 'flower_pot':
      return { fqcn: `${pkg}.ModFlowerPotBlock` };
  }
}

/** The shared classes a block of the type needs written (with `PlantSpec`). */
export function plant3Classes(spec: Plant3Spec): string[] {
  switch (spec.type) {
    case 'growing_plant':
      return ['PlantSpec', 'ModGrowingPlantHeadBlock', 'ModGrowingPlantBodyBlock'];
    case 'column_plant':
      return spec.style === 'bamboo'
        ? ['PlantSpec', 'ModBambooBlock', 'ModBambooShootBlock']
        : ['PlantSpec', 'ModColumnPlantBlock'];
    case 'multiface':
      return ['PlantSpec', 'ModMultifaceBlock'];
    case 'dripleaf':
      // A small dripleaf grows into a big one, so both leaf classes and the stem are written.
      return ['PlantSpec', 'ModBigDripleafBlock', 'ModDripleafStemBlock', 'ModSmallDripleafBlock'];
    case 'flower_pot':
      return ['ModFlowerPotBlock'];
  }
}

function soilExpression(
  file: JavaFile,
  spec: PlantSpecName,
  soil: readonly SoilEntry[] | undefined,
) {
  const optional = file.use('java.util.Optional');
  if (soil === undefined) return `${optional}.empty()`;
  const list = file.use('java.util.List');
  return `${optional}.of(${list}.of(${soil.map((e) => `new ${spec}.IdOrTag(${identifierExpression(file, e.id)}, ${e.tag})`).join(', ')}))`;
}

type PlantSpecName = string;

/** The `new PlantSpec.<Fields>(...)` of the type (its constructor's first argument), or `undefined` for a pot. */
export function plant3SpecExpression(
  file: JavaFile,
  spec: Plant3Spec,
  javaPackage: string,
): string | undefined {
  const ps = file.use(`${javaPackage}.block.type.PlantSpec`);
  const optional = (): string => file.use('java.util.Optional');
  switch (spec.type) {
    case 'growing_plant':
      return `new ${ps}.GrowingPlant(${ps}.GrowthDirection.${spec.down ? 'DOWN' : 'UP'}, ${javaInt(spec.maxAge)}, ${javaFloat(spec.growthChance)}, ${
        spec.bonemeal === undefined
          ? `${optional()}.empty()`
          : `${optional()}.of(new ${ps}.BonemealGrowth(${javaInt(spec.bonemeal[0])}, ${javaInt(spec.bonemeal[1])}))`
      }, ${spec.needsWater}, ${
        spec.berries === undefined
          ? `${optional()}.empty()`
          : `${optional()}.of(new ${ps}.Berries(${identifierExpression(file, spec.berries.item)}, ${javaInt(spec.berries.light)}))`
      }, ${soilExpression(file, ps, spec.soil)})`;
    case 'column_plant':
      return `new ${ps}.ColumnPlant(${javaInt(spec.maxHeight)}, ${javaInt(spec.minHeight)}, ${soilExpression(file, ps, spec.soil)}, ${spec.needsWaterNearby}, ${javaFloat(spec.touchDamage)})`;
    case 'multiface':
      return `new ${ps}.Multiface(${javaInt(spec.light)}, ${spec.spreads}, ${spec.waterloggable})`;
    case 'dripleaf':
      return `new ${ps}.Dripleaf(${
        spec.growsInto === undefined
          ? `${optional()}.empty()`
          : `${optional()}.of(${identifierExpression(file, spec.growsInto)})`
      }, ${file.use('java.util.List')}.of(${spec.tiltTicks.map((n) => javaInt(n)).join(', ')}))`;
    case 'flower_pot':
      return undefined;
  }
}

/** The constructor arguments before `Properties`. */
export function plant3Arguments(file: JavaFile, spec: Plant3Spec, javaPackage: string): string[] {
  if (spec.type === 'flower_pot') {
    return [`${file.use('net.minecraft.world.level.block.Blocks')}.AIR`, 'null'];
  }
  return [plant3SpecExpression(file, spec, javaPackage) as string];
}

/**
 * The type's `Properties` calls as continuation lines (`BlockTypes.properties`, then
 * `GrowingPlantTypes.create`'s style lines and the light of berries and lichen).
 *
 * @param ownLight - The `msm:light_emitter` level, or `undefined`.
 */
export function plant3Properties(
  file: JavaFile,
  spec: Plant3Spec,
  ownLight: number | undefined,
): string[] {
  const popped = (): string =>
    `.pushReaction(${file.use('net.minecraft.world.level.material.PushReaction')}.POPPED)`;
  const behaviour = (): string => file.use('net.minecraft.world.level.block.state.BlockBehaviour');
  const out: string[] = [];
  switch (spec.type) {
    case 'growing_plant':
      out.push(`        .noCollision()${popped()} // growing plant: as vanilla's vines`);
      if (spec.berries !== undefined) {
        const caveVines = file.use('net.minecraft.world.level.block.CaveVines');
        out.push(
          `        .lightLevel(state -> state.hasProperty(${caveVines}.BERRIES) && state.getValue(${caveVines}.BERRIES) ? ${javaInt(spec.berries.light)} : ${javaInt(Math.max(ownLight ?? 0, 0))}) // berries: lit while it has them`,
        );
      }
      break;
    case 'column_plant':
      out.push(`        .randomTicks()${popped()} // column plant: as vanilla`);
      if (spec.style === 'cane') out.push('        .noCollision() // cane: as sugar cane');
      if (spec.style === 'bamboo') {
        out.push(
          `        .forceSolidOn().noOcclusion().dynamicShape().offsetType(${behaviour()}.OffsetType.XZ).isRedstoneConductor((state, level, pos) -> false) // bamboo: as vanilla`,
        );
      }
      break;
    case 'multiface':
      out.push(`        .replaceable().noCollision()${popped()} // multiface: as glow lichen`);
      if (ownLight === undefined) {
        const lichen = file.use('net.minecraft.world.level.block.GlowLichenBlock');
        out.push(
          `        .lightLevel(${lichen}.emission(${javaInt(spec.light)})) // multiface: its light on every state with a face`,
        );
      }
      break;
    case 'dripleaf':
      out.push(`        ${popped()} // dripleaf: as vanilla`);
      if (!spec.big) {
        out.push(
          `        .noCollision().offsetType(${behaviour()}.OffsetType.XYZ) // small dripleaf: as vanilla`,
        );
      }
      break;
    case 'flower_pot':
      out.push(`        .noOcclusion()${popped()} // flower pot: as vanilla`);
      break;
  }
  return out;
}

/** Whether the type's light comes from its state or fields, so `msm:light_emitter` is not applied as a constant. */
export function plant3LightFromState(spec: Plant3Spec): boolean {
  return spec.type === 'growing_plant' && spec.berries !== undefined;
}

/** The companion of an ADR 0103 type (ADR 0103 D4): its suffix, class and the attach call. */
export interface Plant3Companion {
  readonly suffix: '_plant' | '_shoot' | '_stem';
  /** What it is, for comments. */
  readonly kind: string;
  /** The `new ...(...)` given the element's field and the companion's properties. */
  readonly construct: (file: JavaFile, field: string, props: string) => string;
  /** The class (fully qualified) and its nested name. */
  readonly fqcn: string;
  readonly nested?: string;
  /** The `ModBlocks.register` line attaching it to the element. */
  readonly attach: (field: string, companion: string) => string;
}

/** The companion of `spec`, or `undefined`. */
export function plant3Companion(
  spec: Plant3Spec,
  javaPackage: string,
): Plant3Companion | undefined {
  const pkg = `${javaPackage}.block.type`;
  if (spec.type === 'growing_plant') {
    const fqcn = `${pkg}.ModGrowingPlantBodyBlock`;
    return {
      suffix: '_plant',
      kind: 'strand',
      fqcn,
      ...(spec.needsWater ? { nested: 'Water' } : {}),
      construct: (file, field, props) =>
        `new ${file.use(fqcn, ...(spec.needsWater ? ['Water'] : []))}(${plant3SpecExpression(file, spec, javaPackage)}, ${field}, ${props})`,
      attach: (field, companion) =>
        `${field}.attachBody(${companion}); // growing plant: its strand`,
    };
  }
  if (spec.type === 'column_plant' && spec.style === 'bamboo') {
    const fqcn = `${pkg}.ModBambooShootBlock`;
    return {
      suffix: '_shoot',
      kind: 'shoot',
      fqcn,
      construct: (file, field, props) => `new ${file.use(fqcn)}(${field}, ${props}.noCollision())`,
      attach: (field, companion) => `${field}.attachShoot(${companion}); // bamboo: its shoot`,
    };
  }
  if (spec.type === 'dripleaf' && spec.big) {
    const fqcn = `${pkg}.ModDripleafStemBlock`;
    return {
      suffix: '_stem',
      kind: 'stem',
      fqcn,
      construct: (file, field, props) => `new ${file.use(fqcn)}(${field}, ${props}.noCollision())`,
      attach: (field, companion) => `${field}.attachStem(${companion}); // big dripleaf: its stem`,
    };
  }
  return undefined;
}

/** The path of a plant id (`minecraft:poppy` is `poppy`). */
export function idPath(id: string): string {
  return id.slice(id.indexOf(':') + 1);
}

/**
 * The listed plants of a pot (ADR 0103 D2, B510b): one potted companion `<pot>_<plant path>` per
 * entry, the first of a path winning (the runtime warns and skips the others).
 */
export function listedPlants(potId: string, plants: readonly string[]): [string, string][] {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const plant of plants) {
    const path = idPath(plant);
    if (seen.has(path)) continue;
    seen.add(path);
    out.push([`${potId}_${path}`, plant]);
  }
  return out;
}
