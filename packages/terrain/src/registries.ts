/**
 * The world's files and deepslate's registries (ADR 0119 D4; spike B574 F9). The project's files
 * are laid over vanilla's (the jar cache's): a project id replaces vanilla's, as in a data pack.
 * deepslate's registries are static, so one world fills them at a time: `fillRegistries` clears
 * them and registers this world's noises and named density functions (parsed lazily through the
 * parser front); a world refills them before it samples when another world filled them since.
 */

import { Identifier, NormalNoise, WorldgenRegistries } from 'deepslate/worldgen';
import type { WorldgenFiles } from './api';
import type { DensityParser } from './parser';
import { prepassDensityFunction } from './prepass';

/** Folder keys the engine reads. */
export const FOLDERS = Object.freeze({
  noiseSettings: 'worldgen/noise_settings',
  densityFunction: 'worldgen/density_function',
  noise: 'worldgen/noise',
  materialRule: 'worldgen/material_rule',
  materialCondition: 'worldgen/material_condition',
  biome: 'worldgen/biome',
  worldPreset: 'worldgen/world_preset',
  parameterList: 'worldgen/multi_noise_biome_source_parameter_list',
  flatPreset: 'worldgen/flat_level_generator_preset',
  dimensionType: 'dimension_type',
  dimension: 'dimension',
  biomeTags: 'tags/worldgen/biome',
});

/**
 * deepslate's two built-in noises (`WorldgenRegistries.SURFACE_NOISE` and
 * `SURFACE_SECONDARY_NOISE`, with the same parameters), used when the files have none.
 */
export const BUILTIN_NOISES: ReadonlyMap<string, NormalNoise> = new Map([
  ['minecraft:surface', new NormalNoise(0.9381732587751008, -6, 3, 'enabled', [1, 1, 1])],
  [
    'minecraft:surface_secondary',
    new NormalNoise(1.0582769165096106, -6, 4, 'enabled', [1, 1, 0, 1]),
  ],
]);

/** An id with the `minecraft` namespace added when it has none. */
export function withNamespace(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/** A short hash of text (cyrb53, as hex); for cache keys, not for security. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function normalised(
  map: Readonly<Record<string, unknown>> | undefined,
): ReadonlyMap<string, unknown> | undefined {
  if (!map) return undefined;
  const out = new Map<string, unknown>();
  for (const [id, json] of Object.entries(map)) out.set(withNamespace(id), json);
  return out;
}

/** The world's files: the project's over vanilla's, by folder key and id. */
export class WorldFiles {
  private readonly project = new Map<string, ReadonlyMap<string, unknown>>();
  private readonly vanilla = new Map<string, ReadonlyMap<string, unknown>>();
  private readonly hashes = new Map<string, string>();

  constructor(files: WorldgenFiles) {
    for (const [folder, map] of Object.entries(files.project)) {
      const n = normalised(map);
      if (n) this.project.set(folder, n);
    }
    for (const [folder, map] of Object.entries(files.vanilla ?? {})) {
      const n = normalised(map);
      if (n) this.vanilla.set(folder, n);
    }
  }

  /** A file, the project's when it has one. */
  get(folder: string, id: string): unknown {
    const key = withNamespace(id);
    const own = this.project.get(folder)?.get(key);
    return own !== undefined ? own : this.vanilla.get(folder)?.get(key);
  }

  has(folder: string, id: string): boolean {
    return this.get(folder, id) !== undefined;
  }

  /** Whether a file would come from vanilla's files, if they were there (none in the project). */
  isVanillaOnly(folder: string, id: string): boolean {
    return this.project.get(folder)?.get(withNamespace(id)) === undefined;
  }

  /** Every id of a folder, sorted. */
  ids(folder: string): string[] {
    const out = new Set<string>([
      ...(this.vanilla.get(folder)?.keys() ?? []),
      ...(this.project.get(folder)?.keys() ?? []),
    ]);
    return [...out].sort();
  }

  /** A hash of every file of a folder (for the caches kept between edits, WS14). */
  folderHash(folder: string): string {
    let hash = this.hashes.get(folder);
    if (hash === undefined) {
      const parts: string[] = [];
      for (const id of this.ids(folder)) parts.push(id, JSON.stringify(this.get(folder, id)));
      hash = hashText(parts.join('\n'));
      this.hashes.set(folder, hash);
    }
    return hash;
  }

  /** The biome ids of a biome tag, tags inside it resolved (cycles stop). */
  biomeTag(id: string, seen = new Set<string>()): string[] {
    const key = withNamespace(id);
    if (seen.has(key)) return [];
    seen.add(key);
    const tag = this.get(FOLDERS.biomeTags, key) as { values?: unknown } | undefined;
    const out: string[] = [];
    for (const entry of Array.isArray(tag?.values) ? tag.values : []) {
      const value =
        typeof entry === 'string'
          ? entry
          : typeof entry === 'object' && entry !== null
            ? (entry as { id?: unknown }).id
            : undefined;
      if (typeof value !== 'string') continue;
      if (value.startsWith('#')) out.push(...this.biomeTag(value.slice(1), seen));
      else out.push(withNamespace(value));
    }
    return out;
  }
}

/** The world that filled deepslate's registries last (F9). */
let filledBy: object | undefined;

/**
 * Fills deepslate's static registries with one world's files (F9). `owner` is the world; a second
 * call by the same owner does nothing.
 */
export function fillRegistries(owner: object, files: WorldFiles, parse: DensityParser): void {
  if (filledBy === owner) return;
  const noises = WorldgenRegistries.NOISE;
  noises.clear();
  for (const id of files.ids(FOLDERS.noise)) {
    noises.register(Identifier.parse(id), NormalNoise.fromJson(files.get(FOLDERS.noise, id)));
  }
  const functions = WorldgenRegistries.DENSITY_FUNCTION;
  functions.clear();
  for (const id of files.ids(FOLDERS.densityFunction)) {
    const json = files.get(FOLDERS.densityFunction, id);
    functions.register(Identifier.parse(id), () => parse(prepassDensityFunction(json)));
  }
  WorldgenRegistries.NOISE_SETTINGS.clear();
  WorldgenRegistries.MATERIAL_RULE.clear();
  WorldgenRegistries.MATERIAL_CONDITION.clear();
  const biomes = WorldgenRegistries.BIOME;
  biomes.clear();
  for (const id of files.ids(FOLDERS.biome)) biomes.register(Identifier.parse(id), {});
  filledBy = owner;
}

/** Forgets which world filled the registries (tests). */
export function forgetRegistries(): void {
  filledBy = undefined;
}
