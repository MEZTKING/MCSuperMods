/**
 * `TerrainWorld` (ADR 0119 D3, D4, D6): a dimension, or a world preset's inline dimension, turned
 * into a generator, a biome source and settings.
 *
 * - Noise worlds: the settings through the pre-pass (F1 to F5) and our fronts; deepslate's
 *   `RandomState` for the noises (kept between edits when no noise, density function or router
 *   changed, and noise instances kept by id, seed and file, WS14); the router and aquifer
 *   functions optimised by `fill.ts`.
 * - A flat world goes to `extensions/index.ts`'s `flatGenerator` and is reported while that is
 *   `null`; a debug world is reported as "only in the game".
 * - `multi_noise` with a `preset` goes through `presets.ts`; while it gives nothing the world has
 *   one biome and `biomesKnown: false` (F8).
 * - Missing files are reported and the world draws without them.
 */

import {
  type AquiferConfig,
  BiomeSource,
  BlockState,
  Climate,
  DensityFunction,
  FixedBiomeSource,
  type FluidPicker,
  FluidStatus,
  Identifier,
  type MaterialRule,
  MultiNoiseBiomeSource,
  type Noise,
  NoiseGeneratorSettings,
  NoiseRouter,
  NoiseSettings,
  NormalNoise,
  type PositionalRandom,
  RandomState,
} from 'deepslate/worldgen';
import type {
  TerrainTargetFacts,
  TerrainWorld,
  TerrainWorldInput,
  Unsupported,
  WorldgenFiles,
} from './api';
import { flatGenerator } from './extensions';
import { type FillWorld, optimiseRouter } from './fill';
import { type DensityParser, makeDensityParser, type VerticalRange } from './parser';
import {
  emptyPrepassLog,
  type PrepassLog,
  prepassDensityFunction,
  prepassNoiseSettings,
  shortType,
} from './prepass';
import { resolvePreset } from './presets';
import {
  BUILTIN_NOISES,
  FOLDERS,
  fillRegistries,
  hashText,
  WorldFiles,
  withNamespace,
} from './registries';
import { RuleFront } from './rules';
import { Walker } from './unsupported';

/** What a flat generator gives (B581 sets `flatGenerator` to a function of this shape). */
export interface FlatWorldShape {
  readonly minY: number;
  readonly height: number;
  readonly seaLevel: number;
  /** The biome of the whole world. */
  readonly biome: string;
  /** Block state strings from `minY` up; air above the last. */
  readonly layers: readonly string[];
  readonly notes?: readonly Unsupported[];
}

/** The flat generator's signature (`extensions/index.ts` `flatGenerator`, B581). */
export type FlatGeneratorFn = (input: {
  readonly generator: Readonly<Record<string, unknown>>;
  readonly dimensionType: unknown;
  readonly files: WorldgenFiles;
}) => FlatWorldShape;

/** A noise world's parts. */
export interface NoiseParts extends FillWorld {
  readonly settingsId: string;
  readonly randomState: RandomState;
  readonly sampler: Climate.Sampler;
  readonly biomeSource: BiomeSource;
  readonly materialRule: MaterialRule;
  readonly ruleFront: RuleFront;
  readonly parse: DensityParser;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const PLAINS = 'minecraft:plains';

/** Plain words for the generator and biome source notes. */
const WORDS = Object.freeze({
  flat: 'Nothing yet: flat worlds are drawn in a later version.',
  debug: 'Nothing: debug worlds are only in the game.',
  generator: 'Nothing: this kind of world is not drawn.',
  preset:
    "One biome everywhere: this list of biomes is not in your Minecraft files (vanilla's biomes show after you have pressed Play once).",
  biomeSource: 'One biome everywhere.',
});

// --- Noise instances and random states kept between worlds (WS14) ---

const NOISE_CACHE_LIMIT = 512;
const noiseCache = new Map<string, Noise>();
const STATE_CACHE_LIMIT = 2;
const stateCache = new Map<string, KeptState>();

interface KeptState {
  readonly randomState: RandomState;
  readonly router: NoiseRouter;
  readonly aquifers: AquiferConfig | undefined;
  readonly sampler: Climate.Sampler;
}

/** Where `EngineRandomState` finds noise files (set while one is built). */
interface NoiseSource {
  readonly files: WorldFiles;
  readonly seed: bigint;
  readonly legacy: boolean;
}

let building: NoiseSource | undefined;

const ZERO_NOISE = new NormalNoise(1, 0, 0, 'enabled', []);

/**
 * deepslate's `RandomState`, with noise instances read from the world's own files (never from the
 * static registry, F9) and kept by id, seed and file between worlds.
 */
class EngineRandomState extends RandomState {
  private source: NoiseSource | undefined;

  constructor(settings: NoiseGeneratorSettings, seed: bigint, source: NoiseSource) {
    building = source;
    try {
      super(settings, seed);
    } finally {
      building = undefined;
    }
    this.source = source;
  }

  override getOrCreateNoise(id: Identifier): Noise {
    const source = this.source ?? building;
    const key = id.toString();
    const json = source?.files.get(FOLDERS.noise, key);
    const params = json !== undefined ? NormalNoise.fromJson(json) : BUILTIN_NOISES.get(key);
    const cacheKey = `${source?.legacy ? 1 : 0}|${source?.seed ?? 0n}|${key}|${
      json === undefined ? 'builtin' : hashText(JSON.stringify(json))
    }`;
    let noise = noiseCache.get(cacheKey);
    if (!noise) {
      noise = (params ?? ZERO_NOISE).create(this.random.fromHashOf(key));
      if (noiseCache.size >= NOISE_CACHE_LIMIT) noiseCache.clear();
      noiseCache.set(cacheKey, noise);
    }
    return noise;
  }
}

/** The engine's world. */
export class EngineWorld implements TerrainWorld {
  readonly generator: 'noise' | 'flat' | 'debug';
  readonly minY: number;
  readonly height: number;
  readonly seaLevel: number;
  readonly biomesKnown: boolean;
  readonly files: WorldFiles;
  readonly facts: TerrainTargetFacts;
  readonly seed: bigint;
  readonly noise: NoiseParts | undefined;
  readonly flat: FlatWorldShape | undefined;
  readonly prepass: PrepassLog;
  private readonly notes: readonly Unsupported[];

  constructor(input: TerrainWorldInput) {
    this.files = new WorldFiles(input.files);
    this.facts = input.facts;
    this.seed = BigInt.asIntN(64, input.seed);
    this.prepass = emptyPrepassLog();
    const walker = new Walker(this.files);
    const built = build(this, input, walker);
    this.generator = built.generator;
    this.minY = built.minY;
    this.height = built.height;
    this.seaLevel = built.seaLevel;
    this.biomesKnown = built.biomesKnown;
    this.noise = built.noise;
    this.flat = built.flat;
    for (const note of built.flat?.notes ?? []) walker.add(note);
    this.notes = Object.freeze(walker.list());
  }

  unsupported(): readonly Unsupported[] {
    return this.notes;
  }

  /** Fills deepslate's registries with this world's files when another world filled them (F9). */
  activate(): void {
    if (this.noise) fillRegistries(this, this.files, this.noise.parse);
  }
}

interface Built {
  generator: 'noise' | 'flat' | 'debug';
  minY: number;
  height: number;
  seaLevel: number;
  biomesKnown: boolean;
  noise?: NoiseParts;
  flat?: FlatWorldShape;
}

const EMPTY: Built = { generator: 'noise', minY: 0, height: 256, seaLevel: 0, biomesKnown: true };

function sourceDimension(
  files: WorldFiles,
  input: TerrainWorldInput,
  walker: Walker,
): { json: Json; where: string } | undefined {
  const source = input.source;
  if ('preset' in source) {
    const preset = files.get(FOLDERS.worldPreset, source.preset);
    const where = withNamespace(source.preset);
    if (!isObject(preset)) {
      walker.add({
        kind: 'file',
        type: `${FOLDERS.worldPreset}/${where}`,
        where,
        drawnInstead: 'Nothing: the file is missing.',
      });
      return undefined;
    }
    const dimensions = isObject(preset.dimensions) ? preset.dimensions : {};
    const dim = dimensions[withNamespace(source.dimension)] ?? dimensions[source.dimension];
    if (!isObject(dim)) {
      walker.add({
        kind: 'file',
        type: `${FOLDERS.dimension}/${withNamespace(source.dimension)}`,
        where,
        drawnInstead: 'Nothing: the world type has no such dimension.',
      });
      return undefined;
    }
    return { json: dim, where };
  }
  const where = withNamespace(source.dimension);
  const dim = files.get(FOLDERS.dimension, where);
  if (!isObject(dim)) {
    walker.add({
      kind: 'file',
      type: `${FOLDERS.dimension}/${where}`,
      where,
      drawnInstead: 'Nothing: the file is missing.',
    });
    return undefined;
  }
  return { json: dim, where };
}

function build(world: EngineWorld, input: TerrainWorldInput, walker: Walker): Built {
  const files = world.files;
  const dimension = sourceDimension(files, input, walker);
  if (!dimension) return EMPTY;
  const generator = isObject(dimension.json.generator) ? dimension.json.generator : {};
  const type = shortType(generator.type) ?? '';
  const dimensionType =
    typeof dimension.json.type === 'string'
      ? files.get(FOLDERS.dimensionType, dimension.json.type)
      : dimension.json.type;
  if (type === 'noise') return buildNoise(world, input, generator, dimension.where, walker);
  if (type === 'flat') {
    const flat = flatGenerator as unknown as FlatGeneratorFn | null;
    if (!flat) {
      walker.add({
        kind: 'chunk_generator',
        type: 'minecraft:flat',
        where: dimension.where,
        drawnInstead: WORDS.flat,
      });
      const range = rangeOfType(dimensionType);
      return { ...EMPTY, generator: 'flat', ...range };
    }
    const shape = flat({ generator, dimensionType, files: input.files });
    return {
      generator: 'flat',
      minY: shape.minY,
      height: shape.height,
      seaLevel: shape.seaLevel,
      biomesKnown: true,
      flat: shape,
    };
  }
  walker.add({
    kind: 'chunk_generator',
    type: `minecraft:${type}`,
    where: dimension.where,
    drawnInstead: type === 'debug' ? WORDS.debug : WORDS.generator,
  });
  return {
    ...EMPTY,
    generator: type === 'debug' ? 'debug' : 'noise',
    ...rangeOfType(dimensionType),
  };
}

function rangeOfType(dimensionType: unknown): { minY: number; height: number } {
  if (!isObject(dimensionType)) return { minY: EMPTY.minY, height: EMPTY.height };
  return {
    minY: typeof dimensionType.min_y === 'number' ? dimensionType.min_y : EMPTY.minY,
    height: typeof dimensionType.height === 'number' ? dimensionType.height : EMPTY.height,
  };
}

function readBlock(value: unknown, fallback: BlockState): BlockState {
  if (
    typeof value === 'string' ||
    (isObject(value) && typeof (value.Name ?? value.id) === 'string')
  ) {
    return BlockState.fromJson(value);
  }
  return fallback;
}

function buildNoise(
  world: EngineWorld,
  input: TerrainWorldInput,
  generator: Json,
  where: string,
  walker: Walker,
): Built {
  const files = world.files;
  let settingsJson: unknown = generator.settings;
  let settingsId = `${where} (inline)`;
  if (typeof settingsJson === 'string') {
    settingsId = withNamespace(settingsJson);
    settingsJson = files.get(FOLDERS.noiseSettings, settingsId);
    if (settingsJson === undefined) {
      walker.add({
        kind: 'file',
        type: `${FOLDERS.noiseSettings}/${settingsId}`,
        where,
        drawnInstead: 'Nothing: the file is missing.',
      });
      return EMPTY;
    }
  }
  walker.noiseSettings(settingsJson, settingsId);
  const json = prepassNoiseSettings(settingsJson, world.prepass);
  const noiseSettings = NoiseSettings.fromJson(json.noise);
  const range: VerticalRange = { minY: noiseSettings.minY, height: noiseSettings.height };
  const parse = makeDensityParser({
    range,
    hasFunction: (id) => files.has(FOLDERS.densityFunction, id),
    hasNoise: (id) => files.has(FOLDERS.noise, id) || BUILTIN_NOISES.has(withNamespace(id)),
  });
  fillRegistries(world, files, parse);

  const field = (value: unknown): DensityFunction =>
    value === undefined ? DensityFunction.Constant.ZERO : parse(value);
  const r = isObject(json.noise_router) ? json.noise_router : {};
  const router = NoiseRouter.create({
    temperature: field(r.temperature),
    vegetation: field(r.vegetation),
    continents: field(r.continents),
    erosion: field(r.erosion),
    depth: field(r.depth),
    ridges: field(r.ridges),
    chunkSurfaceLevel: field(r.preliminary_surface_level),
    finalDensity: field(r.final_density),
  });
  const a = isObject(json.aquifers) ? json.aquifers : undefined;
  const aquifers: AquiferConfig | undefined = a
    ? {
        barrier: field(a.barrier),
        fluidLevelFloodedness: field(a.fluid_level_floodedness),
        fluidLevelSpread: field(a.fluid_level_spread),
        lava: field(a.lava),
        exclusion: field(a.exclusion),
        surfaceLevel: field(a.surface_level),
      }
    : undefined;
  const legacy = json.legacy_random_source === true;
  const ruleFront = new RuleFront({
    rule: (id) => files.get(FOLDERS.materialRule, id),
    condition: (id) => files.get(FOLDERS.materialCondition, id),
    biomeTag: (id) => files.biomeTag(id),
    noise: (id) => files.get(FOLDERS.noise, id),
    biome: (id) => files.get(FOLDERS.biome, id),
    density: (fn) => parse(prepassDensityFunction(fn)),
    legacyRandom: legacy,
  });
  const materialRule = ruleFront.rule(json.material_rule);
  const settings = NoiseGeneratorSettings.create({
    noise: noiseSettings,
    defaultBlock: readBlock(json.default_block, BlockState.STONE),
    defaultFluid: readBlock(json.default_fluid, BlockState.WATER),
    noiseRouter: router,
    materialRule,
    seaLevel: typeof json.sea_level === 'number' ? Math.floor(json.sea_level) : 0,
    aquifers,
    legacyRandomSource: legacy,
  });

  const kept = keptState(world, settings, json, legacy);
  const { biomeSource, biomesKnown } = buildBiomeSource(
    files,
    input.files,
    generator,
    where,
    walker,
  );
  const fluidPicker = globalFluidPicker(settings);
  const aquiferRandom: PositionalRandom = kept.randomState.getOrCreateRandom(
    Identifier.create('aquifer'),
  );
  return {
    generator: 'noise',
    minY: range.minY,
    height: range.height,
    seaLevel: settings.seaLevel,
    biomesKnown,
    noise: {
      settingsId,
      settings,
      randomState: kept.randomState,
      router: kept.router,
      aquifers: kept.aquifers,
      sampler: kept.sampler,
      biomeSource,
      materialRule,
      ruleFront,
      parse,
      fluidPicker,
      aquiferRandom,
    },
  };
}

/**
 * The sea and the lava below it, as deepslate's `NoiseChunkGenerator` makes them (deepslate
 * 0.27.2, MIT, Copyright (c) Misode): lava below y -54 (or the sea level, if lower), else the
 * default fluid below the sea level.
 */
function globalFluidPicker(settings: NoiseGeneratorSettings): FluidPicker {
  const lava = new FluidStatus(-54, BlockState.LAVA);
  const sea = new FluidStatus(settings.seaLevel, settings.defaultFluid);
  const lavaBelow = Math.min(-54, settings.seaLevel);
  return (_x, y) => (y < lavaBelow ? lava : sea);
}

/** The random state and optimised router, reused when nothing they read changed (WS14). */
function keptState(
  world: EngineWorld,
  settings: NoiseGeneratorSettings,
  json: Json,
  legacy: boolean,
): KeptState {
  const files = world.files;
  const key = [
    world.seed,
    legacy ? 1 : 0,
    settings.noise.minY,
    settings.noise.height,
    files.folderHash(FOLDERS.densityFunction),
    files.folderHash(FOLDERS.noise),
    hashText(JSON.stringify(json.noise_router ?? null)),
    hashText(JSON.stringify(json.aquifers ?? null)),
  ].join('|');
  const kept = stateCache.get(key);
  if (kept) {
    stateCache.delete(key);
    stateCache.set(key, kept);
    return kept;
  }
  const randomState = new EngineRandomState(settings, world.seed, {
    files,
    seed: world.seed,
    legacy,
  });
  const { router, aquifers } = optimiseRouter(
    settings.noiseRouter,
    settings.aquifers,
    randomState.createVisitor(legacy),
  );
  const state: KeptState = {
    randomState,
    router,
    aquifers,
    sampler: Climate.Sampler.fromRouter(router),
  };
  if (stateCache.size >= STATE_CACHE_LIMIT) {
    const oldest = stateCache.keys().next().value;
    if (oldest !== undefined) stateCache.delete(oldest);
  }
  stateCache.set(key, state);
  return state;
}

/** Forgets every kept random state and noise (tests). */
export function forgetKeptStates(): void {
  stateCache.clear();
  noiseCache.clear();
}

function fixed(biome: string): BiomeSource {
  return new FixedBiomeSource(Identifier.parse(biome));
}

function buildBiomeSource(
  files: WorldFiles,
  raw: WorldgenFiles,
  generator: Json,
  where: string,
  walker: Walker,
): { biomeSource: BiomeSource; biomesKnown: boolean } {
  const json = isObject(generator.biome_source) ? generator.biome_source : {};
  const type = shortType(json.type) ?? '';
  try {
    if (type === 'multi_noise' && typeof json.preset === 'string') {
      const listId = withNamespace(json.preset);
      const list = files.get(FOLDERS.parameterList, listId);
      const presetName = isObject(list) && typeof list.preset === 'string' ? list.preset : listId;
      const resolved = resolvePreset(raw, withNamespace(presetName));
      if (Array.isArray(resolved) && resolved.length > 0) {
        return {
          biomeSource: MultiNoiseBiomeSource.fromJson({ type: json.type, biomes: resolved }),
          biomesKnown: true,
        };
      }
      walker.add({
        kind: 'biome_source',
        type: 'multi_noise.preset',
        where: listId,
        drawnInstead: WORDS.preset,
      });
      return { biomeSource: fixed(PLAINS), biomesKnown: false };
    }
    if (
      type === 'fixed' ||
      type === 'checkerboard' ||
      type === 'multi_noise' ||
      type === 'the_end'
    ) {
      return { biomeSource: deepslateBiomeSource(json), biomesKnown: true };
    }
  } catch {
    // An empty biome list or checkerboard: drawn as one biome, below.
  }
  walker.add({
    kind: 'biome_source',
    type: `minecraft:${type}`,
    where,
    drawnInstead: WORDS.biomeSource,
  });
  return { biomeSource: fixed(PLAINS), biomesKnown: true };
}

function deepslateBiomeSource(json: Json): BiomeSource {
  const type = shortType(json.type);
  if (type === 'multi_noise') return MultiNoiseBiomeSource.fromJson(json);
  if (type === 'fixed') {
    return fixed(typeof json.biome === 'string' ? withNamespace(json.biome) : PLAINS);
  }
  // checkerboard and the_end: deepslate's own (it throws on an empty checkerboard).
  return BiomeSource.fromJson(json);
}
