/**
 * What the Value map, the Scatter and Compare with vanilla share (ADR 0119 D7, D9; B585): the
 * project's view (seed and position, as the map keeps it), a world made in the worker from a
 * view's own files, reading vanilla's files again after a set-up, and the plain worlds these
 * views are drawn in. Those worlds live in memory only, under the namespace `msm_preview`, as the
 * map's plain hosts do (`hosts.ts`); they are never written anywhere. Nothing here imports the
 * engine.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  hashText,
  stableKey,
  type TerrainClient,
  type TerrainSource,
  type Unsupported,
  type WorldgenFileMap,
  type WorldSummary,
} from './client';
import { forgetVanillaWorldgen, type TerrainFiles, type TerrainFilesState } from './files';
import { HOST_NAMESPACE, withNamespace } from './hosts';
import { type TerrainView, useTerrainView } from './view-store';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// --- The session's files and the project's view ------------------------------------------------

/** What a view reads of the session's files (`WorldMap`'s `TerrainSessionHandle`). */
export interface TerrainSnapshotSource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): { readonly state: TerrainFilesState | null; readonly error: string | null };
}

/** The session's files, as the map reads them. */
export function useTerrainSnapshot(terrain: TerrainSnapshotSource): {
  readonly state: TerrainFilesState | null;
  readonly error: string | null;
} {
  return useSyncExternalStore(terrain.subscribe, terrain.getSnapshot);
}

/** The project's view (seed, position, zoom), made by an effect and read while rendering. */
export function useProjectView(
  root: string | null,
  projectName: string,
): { view: TerrainView | null; setView(patch: Partial<TerrainView>): void } {
  const viewKey = root ?? `unsaved:${projectName}`;
  const view = useTerrainView((s) => s.views.get(viewKey)) ?? null;
  useEffect(() => {
    useTerrainView.getState().viewFor(viewKey);
  }, [viewKey]);
  const setView = useCallback(
    (patch: Partial<TerrainView>) => useTerrainView.getState().setView(viewKey, patch),
    [viewKey],
  );
  return { view, setView };
}

/**
 * Reads vanilla's files again once the jar is set up, and now and then while a view shows the
 * set-up banner (as the map does: a cache made again by itself, B577).
 */
export function useVanillaRefresh(
  files: TerrainFiles,
  vanillaReady: boolean,
  needsSetUp: boolean,
): void {
  const wasReady = useRef(vanillaReady);
  useEffect(() => {
    if (vanillaReady && !wasReady.current) {
      forgetVanillaWorldgen();
      void files.refresh();
    }
    wasReady.current = vanillaReady;
  }, [vanillaReady, files]);
  useEffect(() => {
    if (!needsSetUp) return;
    const timer = setInterval(() => void files.refresh(), 5000);
    return () => clearInterval(timer);
  }, [needsSetUp, files]);
}

// --- A world in the worker -------------------------------------------------------------------

/** A world a view asks the worker for: its files over the project's, the source and a key. */
export interface ViewWorldSpec {
  /** Files laid over the project's (a plain world's own), or `{}`. */
  readonly extra: WorldgenFileMap;
  /** Project files' ids left out (a biome addition switched off), by folder key. */
  readonly without?: Readonly<Record<string, readonly string[]>>;
  readonly source: TerrainSource;
  /** True to read vanilla's files only: the project's are not laid over them (Compare). */
  readonly vanillaOnly?: boolean;
}

/** The world a view drew last. */
export interface ViewWorld {
  readonly hash: string;
  readonly summary: WorldSummary;
}

/** The files of a view's world: the project's (or none), its own over them, some left out. */
export function viewFiles(project: WorldgenFileMap, spec: ViewWorldSpec): WorldgenFileMap {
  const out: Record<string, Readonly<Record<string, unknown>>> = spec.vanillaOnly
    ? {}
    : { ...project };
  for (const [folder, ids] of Object.entries(spec.without ?? {})) {
    const kept: Record<string, unknown> = { ...(out[folder] ?? {}) };
    for (const id of ids) delete kept[id];
    out[folder] = kept;
  }
  for (const [folder, files] of Object.entries(spec.extra)) {
    out[folder] = { ...(out[folder] ?? {}), ...files };
  }
  return out;
}

/** The hash the worker keys a view's world by: the files' hash and what the view changed. */
export function viewFilesHash(filesHash: string, spec: ViewWorldSpec): string {
  return hashText(
    `${filesHash}|${spec.vanillaOnly === true ? 'vanilla' : 'project'}|${stableKey(spec.extra)}|${stableKey(spec.without ?? {})}`,
  );
}

/**
 * Makes the view's world in `client`'s worker whenever the files, the spec or the seed change.
 * The old world stays shown until the new one is made.
 */
export function useViewWorld(
  client: TerrainClient,
  state: TerrainFilesState | null,
  spec: ViewWorldSpec | null,
  seed: string | null,
): { world: ViewWorld | null; error: string | null } {
  const [world, setWorld] = useState<ViewWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const specKey = spec === null ? null : stableKey(spec);
  const specRef = useRef(spec);
  specRef.current = spec;
  useEffect(() => {
    const chosen = specRef.current;
    if (state === null || chosen === null || specKey === null || seed === null) return;
    let live = true;
    const files = { vanilla: state.vanilla, project: viewFiles(state.project, chosen) };
    client
      .setWorld(
        { files, source: chosen.source, seed, facts: state.facts },
        viewFilesHash(state.filesHash, chosen),
        state.vanillaKey,
      )
      .then(
        (summary) => {
          const hash = client.worldHash;
          if (!live || hash === null) return;
          setError(null);
          setWorld((before) => (before?.hash === hash ? before : { hash, summary }));
        },
        (reason: unknown) => {
          if (live) setError(reason instanceof Error ? reason.message : String(reason));
        },
      );
    return () => {
      live = false;
    };
  }, [client, state, specKey, seed]);
  return { world, error };
}

// --- Notes -----------------------------------------------------------------------------------

/** The engine's notes, without repeats, as plain lines (the map's own wording). */
export function partLines(
  parts: readonly Unsupported[],
  line: (part: Unsupported, more: number) => string,
): string[] {
  const groups = new Map<string, { part: Unsupported; more: number }>();
  for (const part of parts) {
    const key = `${part.kind} ${part.type} ${part.drawnInstead}`;
    const known = groups.get(key);
    if (known === undefined) groups.set(key, { part, more: 0 });
    else known.more += 1;
  }
  return [...groups.values()].map((group) =>
    group.part.kind === 'feature' && group.part.where === 'features'
      ? group.part.drawnInstead
      : line(group.part, group.more),
  );
}

// --- Plain worlds ---------------------------------------------------------------------------

/** The id of a plain world's own files. */
export const PLAIN_VALUE_ID = `${HOST_NAMESPACE}:value`;
export const PLAIN_SCATTER_ID = `${HOST_NAMESPACE}:scatter`;

/** The lowest block and the height of the plain worlds (the overworld's numbers). */
export const PLAIN_MIN_Y = -64;
export const PLAIN_HEIGHT = 384;

/** The top block of the Scatter's flat land (grass at y 63, air from y 64). */
export const FLAT_TOP_Y = 63;

/** A noise world's settings written here, with no vanilla file: a router of zeros but `final`. */
export function plainSettings(finalDensity: unknown, materialRule: unknown): Json {
  return {
    sea_level: FLAT_TOP_Y,
    default_block: { Name: 'minecraft:stone' },
    default_fluid: { Name: 'minecraft:water', Properties: { level: '0' } },
    disable_mob_generation: true,
    legacy_random_source: false,
    noise: { min_y: PLAIN_MIN_Y, height: PLAIN_HEIGHT },
    noise_router: {
      temperature: 0,
      vegetation: 0,
      continents: 0,
      erosion: 0,
      depth: 0,
      ridges: 0,
      final_density: finalDensity,
    },
    spawn_target: [],
    material_rule: materialRule,
  };
}

/** One plain world: its dimension, type, biome and settings, all under `id`. */
function plainWorld(
  id: string,
  settings: Json,
  biome: string,
  biomeJson: Json | null,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {
    dimension: {
      [id]: {
        type: id,
        generator: {
          type: 'minecraft:noise',
          settings: id,
          biome_source: { type: 'minecraft:fixed', biome },
        },
      },
    },
    dimension_type: { [id]: { min_y: PLAIN_MIN_Y, height: PLAIN_HEIGHT } },
    'worldgen/noise_settings': { [id]: settings },
  };
  if (biomeJson !== null) out['worldgen/biome'] = { [id]: biomeJson };
  return out;
}

/**
 * The Value map's plain world: no land of its own worth seeing, only a place to work the value
 * out. Its final density is the drawn function itself, so the engine names any part of it it
 * cannot work out, and any file it misses.
 */
export function valueWorld(fn: unknown): ViewWorldSpec {
  const settings = plainSettings(fn, { type: 'minecraft:sequence', sequence: [] });
  return {
    extra: plainWorld(PLAIN_VALUE_ID, settings, PLAIN_VALUE_ID, {}),
    source: { dimension: PLAIN_VALUE_ID },
  };
}

const stoneDepth = (offset: number) => ({
  type: 'minecraft:stone_depth',
  offset,
  surface_type: 'floor',
  add_surface_depth: false,
  secondary_depth_range: 0,
});

/** The Scatter's land: grass over three dirt over stone, flat at {@link FLAT_TOP_Y}. */
export const FLAT_LAND_RULE: Json = {
  type: 'minecraft:sequence',
  sequence: [
    {
      type: 'minecraft:condition',
      if_true: stoneDepth(0),
      then_run: {
        type: 'minecraft:block',
        result_state: { Name: 'minecraft:grass_block', Properties: { snowy: 'false' } },
      },
    },
    {
      type: 'minecraft:condition',
      if_true: stoneDepth(3),
      then_run: { type: 'minecraft:block', result_state: { Name: 'minecraft:dirt' } },
    },
  ],
};

/** Solid below y 64, air from it: a gradient from 1 at y 63 to -1 at y 65. */
export const FLAT_DENSITY: Json = {
  type: 'minecraft:gradient',
  axis: 'y',
  from_coordinate: FLAT_TOP_Y,
  from_value: 1,
  to_coordinate: FLAT_TOP_Y + 2,
  to_value: -1,
};

/** The decoration step names when the target does not give them (`msm:biome_addition`'s own). */
export const DEFAULT_FEATURE_STEPS: readonly string[] = Object.freeze([
  'raw_generation',
  'lakes',
  'local_modifications',
  'underground_structures',
  'surface_structures',
  'strongholds',
  'underground_ores',
  'underground_decoration',
  'fluid_springs',
  'vegetal_decoration',
  'top_layer_modification',
]);

/** A biome listing `features` in step `step` of `steps` (the plain world's own biome). */
export function biomeListing(
  steps: readonly string[],
  step: string,
  features: readonly string[],
): Json {
  const index = Math.max(0, steps.indexOf(step) >= 0 ? steps.indexOf(step) : steps.length - 1);
  const lists: string[][] = Array.from({ length: Math.max(steps.length, index + 1) }, () => []);
  lists[index] = [...features];
  return {
    has_precipitation: true,
    temperature: 0.8,
    downfall: 0.4,
    carvers: [],
    features: lists,
  };
}

/**
 * The Scatter's plain world: flat land in `biome`. With `biomeJson` the biome is the world's
 * own (`msm_preview:scatter`); without it `biome` names a biome of the project or of vanilla.
 */
export function scatterWorld(
  biome: string,
  biomeJson: Json | null,
  more: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {},
): ViewWorldSpec {
  const extra = plainWorld(
    PLAIN_SCATTER_ID,
    plainSettings(FLAT_DENSITY, FLAT_LAND_RULE),
    withNamespace(biome),
    biomeJson,
  );
  for (const [folder, files] of Object.entries(more)) {
    extra[folder] = { ...(extra[folder] ?? {}), ...files };
  }
  return { extra, source: { dimension: PLAIN_SCATTER_ID } };
}

/** A configured feature's type, inline or by id through the files (`ore`, `tree`, ...). */
export function featureTypeOf(
  feature: unknown,
  files: (folder: string, id: string) => unknown,
  depth = 0,
): string | null {
  if (depth > 8) return null;
  if (typeof feature === 'string') {
    return featureTypeOf(files('worldgen/feature', withNamespace(feature)), files, depth + 1);
  }
  if (!isObject(feature) || typeof feature.type !== 'string') return null;
  return feature.type.replace(/^minecraft:/, '');
}

/** The step a feature of `type` runs in, as vanilla puts such features. */
export function stepForType(type: string | null): string {
  switch (type) {
    case 'ore':
    case 'scattered_ore':
    case 'disk':
      return 'underground_ores';
    case 'freeze_top_layer':
      return 'top_layer_modification';
    default:
      return 'vegetal_decoration';
  }
}

/** True for feature types placed in the ground rather than on it. */
export function isUnderground(type: string | null): boolean {
  return type === 'ore' || type === 'scattered_ore';
}

/**
 * The placement given to a feature alone (it has none of its own): `count` times a chunk at a
 * random place, on the surface, or for ores anywhere in the stone.
 */
export function placementForLoneFeature(type: string | null): {
  readonly placement: Json[];
  readonly words: string;
} {
  if (isUnderground(type)) {
    return {
      placement: [
        { type: 'minecraft:count', count: 8 },
        { type: 'minecraft:in_square' },
        {
          type: 'minecraft:height_range',
          height: {
            type: 'minecraft:uniform',
            min_inclusive: { absolute: PLAIN_MIN_Y },
            max_inclusive: { absolute: FLAT_TOP_Y },
          },
        },
      ],
      words: 'eight times a chunk, anywhere in the stone',
    };
  }
  return {
    placement: [
      { type: 'minecraft:count', count: 4 },
      { type: 'minecraft:in_square' },
      { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
    ],
    words: 'four times a chunk, on the surface',
  };
}

/** A file of the project's or vanilla's (project first). */
export function fileIn(
  state: Pick<TerrainFilesState, 'project' | 'vanilla'>,
): (folder: string, id: string) => unknown {
  return (folder, id) => state.project[folder]?.[id] ?? state.vanilla?.[folder]?.[id];
}

/** The biomes a biome tag holds, through nested tags (project tags over vanilla's). */
export function biomesInTag(
  tag: string,
  file: (folder: string, id: string) => unknown,
  seen: Set<string> = new Set(),
): string[] {
  const id = withNamespace(tag.replace(/^#/, ''));
  if (seen.has(id)) return [];
  seen.add(id);
  const json = file('tags/worldgen/biome', id);
  const values = isObject(json) && Array.isArray(json.values) ? json.values : [];
  const out: string[] = [];
  for (const value of values) {
    const entry = isObject(value) ? value.id : value;
    if (typeof entry !== 'string') continue;
    if (entry.startsWith('#')) out.push(...biomesInTag(entry, file, seen));
    else out.push(withNamespace(entry));
  }
  return out;
}

/** The biomes a field names: an id, a `#tag`, or a list of ids (tags resolved). */
export function biomesNamed(
  field: unknown,
  file: (folder: string, id: string) => unknown,
): string[] {
  const entries = typeof field === 'string' ? [field] : Array.isArray(field) ? field : [];
  const out = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    if (entry.startsWith('#')) for (const biome of biomesInTag(entry, file)) out.add(biome);
    else out.add(withNamespace(entry));
  }
  return [...out];
}
