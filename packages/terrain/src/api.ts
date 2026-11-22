/**
 * The engine's public interface (ADR 0119 D3; spike B574 "Interface for B576"). Every function
 * body is a stub until B578. A change to these types is reported to the orchestrator, not made.
 */

/** Stub body until B578; reads its arguments so the signatures stay as given. */
function notYet(..._args: readonly unknown[]): never {
  throw new Error('not yet');
}

/** Registry folder key ('worldgen/noise_settings', 'dimension_type', 'tags/worldgen/biome', ...) to id to JSON. */
export type WorldgenFileMap = Readonly<Record<string, Readonly<Record<string, unknown>>>>;
/** Project files laid over vanilla's (the jar cache's), in data pack order: a project id replaces vanilla's. */
export interface WorldgenFiles {
  readonly vanilla: WorldgenFileMap | null;
  readonly project: WorldgenFileMap;
}
/** What the target says (plugin API fact): data folders, types the game has, parts approximate on it. */
export interface TerrainTargetFacts {
  readonly dataFolders: readonly string[];
  readonly approximate: readonly ('biome_layout' | 'end')[];
}
export type TerrainSource =
  | { readonly dimension: string }
  | { readonly preset: string; readonly dimension: string };
export interface TerrainWorldInput {
  readonly files: WorldgenFiles;
  readonly source: TerrainSource;
  readonly seed: bigint;
  readonly facts: TerrainTargetFacts;
}
export interface Unsupported {
  readonly kind:
    | 'density_function'
    | 'material_rule'
    | 'material_condition'
    | 'biome_source'
    | 'chunk_generator'
    | 'feature'
    | 'placement'
    | 'carver'
    | 'field'
    | 'file';
  readonly type: string; // e.g. 'minecraft:bandlands', or 'multi_noise.preset'
  readonly where: string; // the file id it was found in
  readonly drawnInstead: string; // plain words for the notes
}
export interface TerrainWorld {
  readonly generator: 'noise' | 'flat' | 'debug';
  readonly minY: number;
  readonly height: number;
  readonly seaLevel: number;
  readonly biomesKnown: boolean; // false when a multi_noise preset is missing (WS9)
  unsupported(): readonly Unsupported[];
}
export function createTerrainWorld(input: TerrainWorldInput): TerrainWorld {
  return notYet(input);
}
/** x0, z0 in blocks; step in blocks (multiple of 4 for biomes); y for biomes and value maps. */
export interface MapRegion {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
  readonly step: number;
  readonly y?: number;
}
export interface PaletteGrid {
  readonly palette: readonly string[];
  readonly cells: Uint16Array;
}
export function sampleBiomes(world: TerrainWorld, region: MapRegion): PaletteGrid {
  return notYet(world, region);
}
export function sampleHeights(
  world: TerrainWorld,
  region: MapRegion,
  kind: 'surface' | 'ocean_floor',
): Int16Array {
  return notYet(world, region, kind);
}
export interface SliceRegion {
  readonly axis: 'x' | 'z';
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly step: number;
  readonly yStep: number;
}
export function sampleSlice(world: TerrainWorld, region: SliceRegion): PaletteGrid {
  return notYet(world, region);
}
export function sampleValues(
  world: TerrainWorld,
  fn: string | unknown,
  region: MapRegion | SliceRegion,
): Float32Array {
  return notYet(world, fn, region);
}
/** A window as Try it's GroundBlocks: size, palette and a Uint16Array in x, z, y order (as `@msm/sim`'s ground). */
export interface ColumnWindow {
  readonly x0: number;
  readonly z0: number;
  readonly y0: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}
export type ColumnStage = 'terrain' | 'surface' | 'features';
export function buildColumns(
  world: TerrainWorld,
  window: ColumnWindow,
  stage: ColumnStage,
): {
  readonly size: { x: number; y: number; z: number };
  readonly palette: readonly string[];
  readonly blocks: Uint16Array;
  readonly notes: readonly Unsupported[];
} {
  return notYet(world, window, stage);
}
/** The worker protocol: a newer token cancels older work; answers come coarse first. */
export type TerrainRequest =
  | {
      readonly type: 'world';
      readonly token: number;
      readonly input: TerrainWorldInput;
      readonly filesHash: string;
    }
  | {
      readonly type: 'biomes' | 'heights' | 'slice' | 'values' | 'columns';
      readonly token: number;
      readonly filesHash: string;
      readonly pass: 'coarse' | 'fine';
      readonly region: MapRegion | SliceRegion | ColumnWindow;
      readonly fn?: string | unknown;
      readonly stage?: ColumnStage;
    }
  | { readonly type: 'cancel'; readonly token: number };
export interface TerrainAnswer {
  readonly token: number;
  readonly type: TerrainRequest['type'];
  readonly pass: 'coarse' | 'fine';
  readonly ms: number;
  readonly data: PaletteGrid | Int16Array | Float32Array | ReturnType<typeof buildColumns>;
  readonly notes: readonly Unsupported[];
}
/** How a typed seed becomes a number (WS17). */
export function seedFromText(text: string): bigint {
  return notYet(text);
}
