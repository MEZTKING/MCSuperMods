/**
 * The live world map in the preview panel (ADR 0119 D7, D9, D10; B582): `previewKind:
 * 'worldgen_map'`. A dimension, a world preset (one choice per dimension it names), or an element
 * seen inside a world that uses it (noise settings, a biome, a parameter list, a flat preset, a
 * surface rule or condition; the **Seen in** picker, `hosts.ts`).
 *
 * - **Map** from above, as **Biomes** or **Height** (shading), **Side cut** (`SideCut.tsx`) and,
 *   for dimensions and world presets, the climate map as the **Climate** tab. 2D canvases only.
 * - **Live:** the project's files come from one `TerrainFiles` per session, 150 ms after the
 *   last edit; the world goes to the worker with `client.setWorld`, each view asks in its own
 *   lane, coarse first. The old picture stays until the new one comes.
 * - **Height** shades from a coarser grid first (one sample every 16 blocks at 4 blocks a pixel),
 *   then twice as fine in four bands, so an edit is never stuck behind a long pass (B578: the
 *   full height map is not inside the 2 s budget yet); "Drawing…" shows until it is done.
 * - **Honest:** a Preview tag, and notes that name what the view drew only about right (the
 *   target's `terrainPreview.approximate`) and what it left out (`WorldSummary.unsupported`, by
 *   type and in plain words). Without the jar a world made only of project files draws; one that
 *   names a vanilla file shows the set-up banner instead of a wrong picture.
 * - Seed, position, zoom and mode are the project's view (`view-store.ts`), shared with Try it.
 * - Drag to pan, the wheel or `+`/`-` to zoom, arrows on the focused map to pan, Home for spawn.
 * - B585: **Structures** marks where a `random_spread` structure may start (`markers.ts`), and
 *   **Compare with vanilla** draws vanilla's world of the same seed beside the map
 *   (`CompareView.tsx`). The default export also picks the view of the other worldgen kinds: a
 *   **Value map** for density functions and noises (`ValueMap.tsx`), a **Scatter** for features,
 *   placed features, block state providers and biome additions (`Scatter.tsx`), and for a carver
 *   the line that its caves show only in the game (limit WL4).
 */

import type { Element, Project } from '@msm/plugin-api';
import {
  lazy,
  type PointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type WheelEvent,
} from 'react';
import type { TryItWorldsPlatform } from '../../../shared/platform';
import { Button } from '../components/ui/Button';
import CompareView, { compareClientFor } from './CompareView';
import {
  COARSE_FACTOR,
  hashText,
  type MapRegion,
  type PaletteGrid,
  type TerrainAnswer,
  TerrainClient,
  type TerrainFacts,
  type Unsupported,
  type WorldSummary,
} from './client';
import {
  type BiomeColours,
  biomeColoursOf,
  dim,
  heightColour,
  hillShade,
  layerIndex,
  type PaintLayer,
  paintLayers,
  shade,
  type Viewport,
} from './colours';
import {
  mapKeyHandler,
  nextZoom,
  PositionControls,
  PreviewTag,
  SeedControls,
  SetUpBanner,
  TerrainNotes,
} from './controls';
import {
  forgetVanillaWorldgen,
  type ReadVanillaWorldgen,
  TERRAIN_DEBOUNCE_MS,
  TerrainFiles,
  type TerrainFilesState,
  type WorldgenSession,
} from './files';
import {
  filesWithHost,
  folderOfKind,
  hostDimension,
  hostsFor,
  isEndDimension,
  LIT_BLOCK,
  type TerrainHost,
  usesClimate,
  withNamespace,
} from './hosts';
import { MARKER_WORDS, markerNear, setName, structureMarkers } from './markers';
import Scatter, { BIOME_ADDITION_KIND } from './Scatter';
import SideCut from './SideCut';
import ValueMap from './ValueMap';
import { type TerrainMode, type TerrainView, useTerrainView } from './view-store';

const ClimateMap = lazy(() => import('../preview/ClimateMap'));

/** The map's size in pixels (square). */
export const MAP_PIXELS = 256;

// --- One TerrainFiles and one client a session ----------------------------------------------

/** What the map reads of the files: the last set handed on, or the error reading them. */
export interface TerrainFilesSnapshot {
  readonly state: TerrainFilesState | null;
  readonly error: string | null;
}

/** The session's live world generation: its files, its worker client and when it last changed. */
export interface TerrainSessionHandle {
  readonly client: TerrainClient;
  readonly files: TerrainFiles;
  subscribe(listener: () => void): () => void;
  getSnapshot(): TerrainFilesSnapshot;
  /** `performance.now()` of the last project change, or `null` (for the edit-to-redraw time). */
  changedAt(): number | null;
}

/** Options of {@link createTerrainSession} (tests). */
export interface TerrainSessionOptions {
  client?: TerrainClient;
  readVanilla?: ReadVanillaWorldgen;
  debounceMs?: number;
}

/** Makes a session's files and client and reads the files once. */
export function createTerrainSession(
  session: WorldgenSession,
  options: TerrainSessionOptions = {},
): TerrainSessionHandle {
  const listeners = new Set<() => void>();
  let snapshot: TerrainFilesSnapshot = { state: null, error: null };
  let changedAt: number | null = null;
  let project = session.snapshot.project;
  session.subscribe((next) => {
    if (next.project === project) return;
    project = next.project;
    changedAt = performance.now();
  });
  const publish = (next: TerrainFilesSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const files = new TerrainFiles(session, {
    onFiles: (state) => publish({ state, error: null }),
    onError: (error) =>
      publish({
        state: snapshot.state,
        error: error instanceof Error ? error.message : String(error),
      }),
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
    ...(options.readVanilla === undefined ? {} : { readVanilla: options.readVanilla }),
  });
  void files.refresh();
  return {
    client: options.client ?? new TerrainClient(),
    files,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    changedAt: () => changedAt,
  };
}

const handles = new WeakMap<WorldgenSession, TerrainSessionHandle>();

/** The session's one {@link TerrainSessionHandle}, made on first use. */
export function terrainSessionFor(session: WorldgenSession): TerrainSessionHandle {
  let handle = handles.get(session);
  if (handle === undefined) {
    handle = createTerrainSession(session);
    handles.set(session, handle);
  }
  return handle;
}

// --- Regions and steps ---------------------------------------------------------------------

/** Blocks a region's corner is aligned to, so panning reuses the engine's found heights. */
export function alignOf(zoom: number): number {
  return 16 * zoom;
}

/** The map's region at a sample step: the view's square, widened to aligned corners. */
export function mapRegion(view: Pick<TerrainView, 'x' | 'z' | 'zoom'>, step: number): MapRegion {
  const align = alignOf(view.zoom);
  const half = (MAP_PIXELS / 2) * view.zoom;
  const x0 = Math.floor((view.x - half) / align) * align;
  const z0 = Math.floor((view.z - half) / align) * align;
  const size = MAP_PIXELS * view.zoom + align;
  return { x0, z0, width: size, depth: size, step };
}

/** The biome map's step: a sample a pixel, at least every 4 blocks (biomes are 4 blocks). */
export function biomeStep(zoom: number): number {
  return Math.max(4, zoom);
}

/** The Height map's steps: a coarser first grid, then twice as fine (B578's measured plan). */
export function heightSteps(zoom: number): readonly number[] {
  const first = Math.max(4, 4 * zoom);
  const second = Math.max(4, 2 * zoom);
  return second < first ? [first, second] : [first];
}

/** Bands the fine Height pass is asked in, so a newer edit waits for one band at most. */
export const HEIGHT_BANDS = 4;

/** The viewport of the map for a view (the block under pixel 0 and blocks a pixel). */
export function viewportOf(view: Pick<TerrainView, 'x' | 'z' | 'zoom'>): Viewport {
  const half = (MAP_PIXELS / 2) * view.zoom;
  return {
    left: view.x - half,
    top: view.z - half,
    zoom: view.zoom,
    width: MAP_PIXELS,
    height: MAP_PIXELS,
  };
}

const countOf = (span: number, step: number): number => Math.ceil(span / step);

// --- Layers --------------------------------------------------------------------------------

/** What a map layer holds besides its colours: the biome or height of each sample. */
export interface MapLayer extends PaintLayer {
  readonly kind: 'biomes' | 'heights';
  readonly world: string;
  readonly pass: 'coarse' | 'fine';
  readonly biomes?: PaletteGrid;
  readonly heights?: Int16Array;
}

/** A biome grid as a layer, with `lit` (a biome id) lit and the rest dimmed. */
export function biomeLayer(
  region: MapRegion,
  grid: PaletteGrid,
  colours: BiomeColours,
  lit: string | null,
  meta: { world: string; pass: 'coarse' | 'fine' },
): MapLayer {
  const columns = countOf(region.width, region.step);
  const rows = countOf(region.depth, region.step);
  const palette = grid.palette.map((id) => {
    const colour = colours(id);
    return lit !== null && withNamespace(id) !== lit ? dim(colour) : colour;
  });
  const rgb = new Uint8Array(columns * rows * 3);
  for (let i = 0; i < columns * rows; i += 1) {
    const colour = palette[grid.cells[i] ?? 0] ?? [0, 0, 0];
    rgb[i * 3] = colour[0];
    rgb[i * 3 + 1] = colour[1];
    rgb[i * 3 + 2] = colour[2];
  }
  return {
    ...meta,
    kind: 'biomes',
    x0: region.x0,
    z0: region.z0,
    step: region.step,
    columns,
    rows,
    rgb,
    biomes: grid,
  };
}

/** A height grid as a shaded layer; `rowDone` marks the rows known so far. */
export function heightLayer(
  region: MapRegion,
  heights: Int16Array,
  world: Pick<WorldSummary, 'seaLevel' | 'minY' | 'height'>,
  meta: { world: string; pass: 'coarse' | 'fine' },
  rowDone?: Uint8Array,
): MapLayer {
  const columns = countOf(region.width, region.step);
  const rows = countOf(region.depth, region.step);
  const shades = hillShade(heights, { columns, rows }, region.step, rowDone);
  const top = world.minY + world.height;
  const rgb = new Uint8Array(columns * rows * 3);
  for (let i = 0; i < columns * rows; i += 1) {
    const colour = shade(
      heightColour(heights[i] ?? world.minY, world.seaLevel, world.minY, top),
      shades[i] ?? 1,
    );
    rgb[i * 3] = colour[0];
    rgb[i * 3 + 1] = colour[1];
    rgb[i * 3 + 2] = colour[2];
  }
  return {
    ...meta,
    kind: 'heights',
    x0: region.x0,
    z0: region.z0,
    step: region.step,
    columns,
    rows,
    rgb,
    heights,
    ...(rowDone === undefined ? {} : { rowDone }),
  };
}

/** An answer as the map keeps it: the region it covers (with the step it was sampled at). */
export interface RawLayer {
  readonly kind: 'biomes' | 'heights';
  readonly world: string;
  readonly pass: 'coarse' | 'fine';
  readonly region: MapRegion;
  readonly biomes?: PaletteGrid;
  readonly heights?: Int16Array;
  readonly rowDone?: Uint8Array;
}

/** A kept answer coloured for painting. */
export function paintLayerOf(
  layer: RawLayer,
  colours: BiomeColours,
  lit: string | null,
  world: Pick<WorldSummary, 'seaLevel' | 'minY' | 'height'>,
): MapLayer {
  const meta = { world: layer.world, pass: layer.pass };
  if (layer.biomes !== undefined) return biomeLayer(layer.region, layer.biomes, colours, lit, meta);
  return heightLayer(layer.region, layer.heights ?? new Int16Array(0), world, meta, layer.rowDone);
}

/** What is under block `(x, z)` in the topmost layer that has it. */
export function hoverAt(
  layers: readonly MapLayer[],
  x: number,
  z: number,
): { biome?: string; height?: number } {
  const out: { biome?: string; height?: number } = {};
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i] as MapLayer;
    const index = layerIndex(layer, x, z);
    if (index < 0) continue;
    const biome = layer.biomes?.palette[layer.biomes.cells[index] ?? 0];
    if (biome !== undefined && out.biome === undefined) out.biome = biome;
    const height = layer.heights?.[index];
    if (height !== undefined && out.height === undefined) out.height = height;
  }
  return out;
}

/** A biome's share of a grid's samples, 0 to 1. */
export function biomeShare(grid: PaletteGrid, biome: string): number {
  const slot = grid.palette.findIndex((id) => withNamespace(id) === biome);
  if (slot < 0 || grid.cells.length === 0) return 0;
  let count = 0;
  for (const cell of grid.cells) if (cell === slot) count += 1;
  return count / grid.cells.length;
}

/** The block of the nearest sample of `biome` to `(x, z)` in a layer, or `null`. */
export function findBiome(
  layer: MapLayer,
  biome: string,
  x: number,
  z: number,
): { x: number; z: number } | null {
  const grid = layer.biomes;
  if (grid === undefined) return null;
  const slot = grid.palette.findIndex((id) => withNamespace(id) === biome);
  if (slot < 0) return null;
  let best: { x: number; z: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let row = 0; row < layer.rows; row += 1) {
    for (let column = 0; column < layer.columns; column += 1) {
      if (grid.cells[row * layer.columns + column] !== slot) continue;
      const bx = layer.x0 + column * layer.step + Math.floor(layer.step / 2);
      const bz = layer.z0 + row * layer.step + Math.floor(layer.step / 2);
      const distance = (bx - x) ** 2 + (bz - z) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: bx, z: bz };
      }
    }
  }
  return best;
}

// --- Notes ---------------------------------------------------------------------------------

/** Notes of the map: what it drew about right and what it left out, in plain words. */
export function notesFor(input: {
  readonly facts: TerrainFacts;
  readonly summary: WorldSummary | null;
  readonly end: boolean;
  readonly climate: boolean;
  readonly mode: TerrainMode;
  readonly heightStep: number | null;
  readonly problems: readonly { elementId: string; message: string }[];
  readonly litCondition: boolean;
}): string[] {
  const lines: string[] = [
    "Worked out from your files as the game does it: the land's shape, water, noise caves and the surface blocks.",
  ];
  if (input.end && input.facts.approximate.includes('end'))
    lines.push('The End is about right here.');
  if (!input.end && input.climate && input.facts.approximate.includes('biome_layout')) {
    lines.push('Biome borders are about right on this version.');
  }
  if (input.summary !== null && !input.summary.biomesKnown) {
    lines.push(
      "Vanilla's biomes show here after you have pressed Play once. Until then the map draws one biome.",
    );
  }
  for (const group of groupUnsupported(input.summary?.unsupported ?? [])) {
    lines.push(unsupportedLine(group.part, group.more));
  }
  for (const problem of input.problems) {
    lines.push(`${problem.elementId} could not be read, so it is left out: ${problem.message}`);
  }
  if (input.mode === 'height' && input.heightStep !== null && input.heightStep > 1) {
    lines.push(`Height is shaded from one sample every ${input.heightStep} blocks.`);
  }
  if (input.litCondition)
    lines.push(`Glowstone (${LIT_BLOCK}) marks where this condition is true.`);
  lines.push('Carved caves and buildings show only in the game.');
  lines.push('Trees, plants and ores are not drawn here.');
  return [...new Set(lines)];
}

/** Unsupported parts of one type and outcome together, the first place named, in order. */
export function groupUnsupported(
  parts: readonly Unsupported[],
): { part: Unsupported; more: number }[] {
  const groups = new Map<string, { part: Unsupported; more: number }>();
  for (const part of parts) {
    const key = `${part.kind} ${part.type} ${part.drawnInstead}`;
    const known = groups.get(key);
    if (known === undefined) groups.set(key, { part, more: 0 });
    else known.more += 1;
  }
  return [...groups.values()];
}

/**
 * One unsupported part in plain words: its type, where it is (and in how many more places),
 * and what was drawn instead.
 */
export function unsupportedLine(part: Unsupported, more = 0): string {
  const type = part.type.startsWith('minecraft:')
    ? part.type.slice('minecraft:'.length)
    : part.type;
  const where =
    more === 0 ? part.where : `${part.where} and ${more} more ${more === 1 ? 'place' : 'places'}`;
  if (part.kind === 'file') return `${type} is missing (named in ${where}). ${part.drawnInstead}`;
  return `This world uses ${type} (in ${where}), which the preview cannot work out yet. ${part.drawnInstead}`;
}

/** Whether a world misses a vanilla file (one in the `minecraft` namespace). */
export function missesVanillaFile(summary: WorldSummary | null): boolean {
  return (summary?.unsupported ?? []).some(
    (part) => part.kind === 'file' && /(^|\/)minecraft:/.test(part.type),
  );
}

// --- The view ------------------------------------------------------------------------------

/** Props of {@link WorldMap}. */
export interface WorldMapProps {
  /** The project session (its files are read through one `TerrainFiles` a session). */
  session: WorldgenSession;
  /** The project's folder (the view's key), or `null` for a project not saved yet. */
  root: string | null;
  project: Project;
  element: Element;
  /** True when the vanilla cache is set up (`PreviewPanel`'s `vanilla`). */
  vanillaReady: boolean;
  /** Opens the Minecraft folder settings. */
  onSetup(): void;
  /** Test hook: the session's files and client. */
  terrain?: TerrainSessionHandle;
  /** Test hook: the saves list for Seed of one of my worlds. */
  worlds?: TryItWorldsPlatform | null;
  /** Test hook: the client of vanilla's world for Compare with vanilla. */
  compareClient?: TerrainClient;
}

/** Kinds drawn as a Value map (B585). */
export const VALUE_FOLDERS: ReadonlySet<string> = new Set([
  'worldgen/density_function',
  'worldgen/noise',
]);

/** Kinds drawn as a Scatter (B585). */
export const SCATTER_FOLDERS: ReadonlySet<string> = new Set([
  'worldgen/feature',
  'worldgen/placed_feature',
  'worldgen/block_state_provider',
  BIOME_ADDITION_KIND,
]);

/** The words for a carver (limit WL4). */
export const CARVER_WORDS =
  'Carved caves show only in the game. A carver cuts caves and ravines into the land after it is made; the preview draws the land without them.';

const MODE_LABELS: Record<TerrainMode, string> = {
  biomes: 'Biomes',
  height: 'Height',
  side_cut: 'Side cut',
  climate: 'Climate',
};

interface WorldState {
  readonly hash: string;
  readonly summary: WorldSummary;
}

interface Timing {
  /** From the project change to the first coarse picture of the world made from it. */
  readonly editMs: number;
}

/** The live view of a worldgen element: the map, a Value map, a Scatter or the carver's line. */
export default function WorldMap(props: WorldMapProps) {
  const terrain = props.terrain ?? terrainSessionFor(props.session);
  const folder = folderOfKind(props.element.kind);
  const common = {
    terrain,
    root: props.root,
    project: props.project,
    element: props.element,
    vanillaReady: props.vanillaReady,
    onSetup: props.onSetup,
    ...(props.worlds === undefined ? {} : { worlds: props.worlds }),
  };
  if (VALUE_FOLDERS.has(folder)) return <ValueMap {...common} />;
  if (SCATTER_FOLDERS.has(folder)) return <Scatter {...common} />;
  if (folder === 'worldgen/carver') {
    return (
      <div className="flex flex-col gap-2" data-testid="terrain-carver">
        <PreviewTag />
        <p className="text-sm">{CARVER_WORDS}</p>
      </div>
    );
  }
  return <WorldMapView {...props} terrain={terrain} />;
}

/** The live world map; see the module comment. */
function WorldMapView(props: WorldMapProps & { terrain: TerrainSessionHandle }) {
  const { project, element, onSetup, vanillaReady } = props;
  const terrain = props.terrain;
  const client = terrain.client;
  const { state, error: filesError } = useSyncExternalStore(terrain.subscribe, terrain.getSnapshot);

  // The project's view: made by an effect (it writes the store), read while rendering.
  const viewKey = props.root ?? `unsaved:${project.name}`;
  const stored = useTerrainView((s) => s.views.get(viewKey));
  useEffect(() => {
    useTerrainView.getState().viewFor(viewKey);
  }, [viewKey]);
  const setView = useCallback(
    (patch: Partial<TerrainView>) => useTerrainView.getState().setView(viewKey, patch),
    [viewKey],
  );

  // After the jar is set up, read vanilla's files again.
  const wasReady = useRef(vanillaReady);
  useEffect(() => {
    if (vanillaReady && !wasReady.current) {
      forgetVanillaWorldgen();
      void terrain.files.refresh();
    }
    wasReady.current = vanillaReady;
  }, [vanillaReady, terrain]);
  // While the banner shows, look again now and then (a cache made again by itself, B577).
  const needsSetUp = state?.needsSetUp === true;
  useEffect(() => {
    if (!needsSetUp) return;
    const timer = setInterval(() => void terrain.files.refresh(), 5000);
    return () => clearInterval(timer);
  }, [needsSetUp, terrain]);

  // Where the element is seen.
  const folder = folderOfKind(element.kind);
  const isWorld = folder === 'dimension' || folder === 'worldgen/world_preset';
  const hosts = useMemo(
    () => (state === null ? [] : hostsFor(element, state.project, state.vanilla)),
    [element, state],
  );
  const [hostKey, setHostKey] = useState<string | null>(null);
  const host: TerrainHost | undefined = hosts.find((h) => h.key === hostKey) ?? hosts[0];
  const dimension = useMemo(
    () => (host === undefined || state === null ? null : hostDimension(host, state.project)),
    [host, state],
  );

  // The world in the worker.
  const [world, setWorld] = useState<WorldState | null>(null);
  const [worldError, setWorldError] = useState<string | null>(null);
  const seed = stored?.seed ?? null;
  // The host object is made again on every edit; the world follows its key and the files.
  const hostRef = useRef(host);
  hostRef.current = host;
  const currentHostKey = host?.key ?? null;
  useEffect(() => {
    const chosen = hostRef.current;
    if (state === null || chosen === undefined || currentHostKey === null || seed === null) return;
    let live = true;
    const files = { vanilla: state.vanilla, project: filesWithHost(state.project, chosen) };
    const filesHash = chosen.plain ? hashText(`${state.filesHash}|${chosen.key}`) : state.filesHash;
    client
      .setWorld(
        { files, source: chosen.source, seed, facts: state.facts },
        filesHash,
        state.vanillaKey,
      )
      .then(
        (summary) => {
          const hash = client.worldHash;
          if (!live || hash === null) return;
          setWorldError(null);
          setWorld((before) => (before?.hash === hash ? before : { hash, summary }));
        },
        (error: unknown) => {
          if (!live) return;
          setWorldError(error instanceof Error ? error.message : String(error));
        },
      );
    return () => {
      live = false;
    };
  }, [client, state, currentHostKey, seed]);

  const banner = state?.needsSetUp === true && missesVanillaFile(world?.summary ?? null);
  const modes: TerrainMode[] = isWorld
    ? ['biomes', 'height', 'side_cut', 'climate']
    : ['biomes', 'height', 'side_cut'];
  const storedMode = stored?.mode ?? 'biomes';
  const mode: TerrainMode = modes.includes(storedMode) ? storedMode : 'biomes';

  // Dragging moves the picture at once and the view when the pointer is let go.
  const [drag, setDrag] = useState<{
    startX: number;
    startY: number;
    dx: number;
    dy: number;
  } | null>(null);
  const view = stored ?? null;
  const shown = useMemo(
    () =>
      view === null
        ? null
        : {
            x: view.x - Math.round((drag?.dx ?? 0) * view.zoom),
            z: view.z - Math.round((drag?.dy ?? 0) * view.zoom),
            zoom: view.zoom,
          },
    [view, drag],
  );

  // Sampling the map (Biomes and Height); Side cut asks in its own lane. Answers are kept raw
  // and coloured while painting, so a change of colours does not ask the worker again.
  const [raw, setRaw] = useState<readonly RawLayer[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [heightStep, setHeightStep] = useState<number | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [drawn, setDrawn] = useState(0);
  const lastPictureAt = useRef(0);
  const timedWorld = useRef<string | null>(null);

  const viewX = view?.x ?? 0;
  const viewZ = view?.z ?? 0;
  const zoom = view?.zoom ?? 4;
  useEffect(() => {
    if (world === null || banner || (mode !== 'biomes' && mode !== 'height')) {
      client.cancel('map');
      setDrawing(false);
      return;
    }
    let live = true;
    const at = { x: viewX, z: viewZ, zoom };
    const firstPicture = (): void => {
      if (timedWorld.current === world.hash) return;
      timedWorld.current = world.hash;
      const changed = terrain.changedAt();
      const now = performance.now();
      // Only a project change after the last first picture is an edit (not a seed or a pan).
      if (changed !== null && changed > lastPictureAt.current) {
        setTiming({ editMs: Math.round(now - changed) });
      }
      lastPictureAt.current = now;
    };
    const show = (layer: RawLayer, keep: (old: RawLayer) => boolean): void => {
      if (!live) return;
      firstPicture();
      setRaw((before) => [
        ...before.filter(
          (old) => old.world === layer.world && (old.kind !== layer.kind || keep(old)),
        ),
        layer,
      ]);
      setDrawn((n) => n + 1);
    };
    const fail = (error: unknown): void => {
      if (live) setWorldError(error instanceof Error ? error.message : String(error));
    };
    setDrawing(true);
    if (mode === 'biomes') {
      setHeightStep(null);
      const region = mapRegion(at, biomeStep(zoom));
      client
        .sample('map', { type: 'biomes', region }, (answer: TerrainAnswer) => {
          const step = answer.pass === 'coarse' ? region.step * COARSE_FACTOR : region.step;
          // A coarse picture replaces older ones; the fine one replaces the coarse.
          show(
            {
              kind: 'biomes',
              world: world.hash,
              pass: answer.pass,
              region: { ...region, step },
              biomes: answer.data as PaletteGrid,
            },
            () => false,
          );
        })
        .then((final) => {
          if (live && final !== null) setDrawing(false);
        }, fail);
    } else {
      const steps = heightSteps(zoom);
      void (async () => {
        try {
          // The first grid, whole.
          const first = mapRegion(at, steps[0] as number);
          const answered = await client.sample(
            'map',
            { type: 'heights', region: first, fn: 'surface' },
            (answer) => {
              const step = answer.pass === 'coarse' ? first.step * COARSE_FACTOR : first.step;
              show(
                {
                  kind: 'heights',
                  world: world.hash,
                  pass: answer.pass,
                  region: { ...first, step },
                  heights: answer.data as Int16Array,
                },
                () => false,
              );
              if (answer.pass === 'fine') setHeightStep(first.step);
            },
          );
          if (answered === null || !live) return;
          // Then twice as fine, band by band, over the first.
          const second = steps[1];
          if (second !== undefined) {
            const region = mapRegion(at, second);
            const columns = countOf(region.width, second);
            const rows = countOf(region.depth, second);
            const heights = new Int16Array(columns * rows);
            const rowDone = new Uint8Array(rows);
            const bandRows = Math.ceil(rows / HEIGHT_BANDS);
            for (let band = 0; band < HEIGHT_BANDS; band += 1) {
              const from = band * bandRows;
              const count = Math.min(bandRows, rows - from);
              if (count <= 0) break;
              const part = await client.sample('map', {
                type: 'heights',
                region: { ...region, z0: region.z0 + from * second, depth: count * second },
                fn: 'surface',
              });
              if (part === null || !live) return;
              heights.set(part.data as Int16Array, from * columns);
              rowDone.fill(1, from, from + count);
              show(
                {
                  kind: 'heights',
                  world: world.hash,
                  pass: 'fine',
                  region,
                  heights: heights.slice(),
                  rowDone: rowDone.slice(),
                },
                (old) => old.region.step !== second,
              );
            }
            if (live) setHeightStep(second);
          }
          if (live) setDrawing(false);
        } catch (error) {
          fail(error);
        }
      })();
    }
    return () => {
      live = false;
      client.cancel('map');
    };
  }, [client, world, banner, mode, viewX, viewZ, zoom, terrain]);

  // Painting.
  const colours = useMemo(() => biomeColoursOf(project), [project]);
  const lit = folder === 'worldgen/biome' ? withNamespace(element.id) : null;
  const layers = useMemo(
    () =>
      world === null ? [] : raw.map((layer) => paintLayerOf(layer, colours, lit, world.summary)),
    [raw, colours, lit, world],
  );
  // Structure markers (B585): where a structure may start in the view.
  const [markersOn, setMarkersOn] = useState(false);
  const markerResult = useMemo(() => {
    if (!markersOn || state === null || world === null || host === undefined) return null;
    if (world.summary.generator !== 'noise' || (mode !== 'biomes' && mode !== 'height'))
      return null;
    let seed: bigint;
    try {
      seed = BigInt(world.summary.seed);
    } catch {
      return null;
    }
    const biomeLayers = layers.filter((layer) => layer.kind === 'biomes');
    const half = (MAP_PIXELS / 2) * zoom;
    return structureMarkers({
      project: filesWithHost(state.project, host),
      vanilla: state.vanilla,
      seed,
      region: { x0: viewX - half, z0: viewZ - half, width: 2 * half, depth: 2 * half },
      ...(world.summary.biomesKnown && biomeLayers.length > 0
        ? { biomeAt: (x: number, z: number) => hoverAt(biomeLayers, x, z).biome }
        : {}),
    });
  }, [markersOn, state, world, host, mode, layers, viewX, viewZ, zoom]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shownLayers = useMemo(
    () => layers.filter((layer) => layer.kind === (mode === 'height' ? 'heights' : 'biomes')),
    [layers, mode],
  );
  useEffect(() => {
    if (shown === null || (mode !== 'biomes' && mode !== 'height')) return;
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null) return;
    const viewport = viewportOf(shown);
    const pixels = paintLayers(shownLayers, viewport);
    const image = context.createImageData(MAP_PIXELS, MAP_PIXELS);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
    for (const marker of markerResult?.markers ?? []) {
      const px = Math.floor((marker.x - viewport.left) / viewport.zoom);
      const py = Math.floor((marker.z - viewport.top) / viewport.zoom);
      if (px < -3 || py < -3 || px > MAP_PIXELS + 3 || py > MAP_PIXELS + 3) continue;
      context.fillStyle = '#000000';
      context.fillRect(px - 3, py - 3, 7, 7);
      context.fillStyle = '#ffffff';
      context.fillRect(px - 2, py - 2, 5, 5);
      context.fillStyle = '#c0392b';
      context.fillRect(px - 1, py - 1, 3, 3);
    }
  }, [shownLayers, shown, mode, markerResult]);

  // Hover.
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const blockAt = (event: PointerEvent<HTMLElement>): { x: number; z: number } | null => {
    if (shown === null) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const px = ((event.clientX - rect.left) / rect.width) * MAP_PIXELS;
    const py = ((event.clientY - rect.top) / rect.height) * MAP_PIXELS;
    const viewport = viewportOf(shown);
    return {
      x: Math.floor(viewport.left + px * viewport.zoom),
      z: Math.floor(viewport.top + py * viewport.zoom),
    };
  };
  const hovered = hover === null ? null : hoverAt(layers, hover.x, hover.z);

  const markerHere =
    hover === null || markerResult === null
      ? null
      : markerNear(markerResult.markers, hover.x, hover.z, 3 * zoom);

  // Compare with vanilla (B585): vanilla's world in its own worker.
  const [compareOn, setCompareOn] = useState(false);
  const compareClient = props.compareClient ?? compareClientFor(terrain);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 });
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (drag !== null) {
      const rect = event.currentTarget.getBoundingClientRect();
      const scale = rect.width === 0 ? 1 : MAP_PIXELS / rect.width;
      setDrag({
        ...drag,
        dx: (event.clientX - drag.startX) * scale,
        dy: (event.clientY - drag.startY) * scale,
      });
      return;
    }
    setHover(blockAt(event));
  };
  const endDrag = (): void => {
    if (drag === null || shown === null) return;
    setDrag(null);
    if (drag.dx !== 0 || drag.dy !== 0) setView({ x: shown.x, z: shown.z });
  };
  const onWheel = (event: WheelEvent<HTMLCanvasElement>): void => {
    if (view === null || event.deltaY === 0) return;
    const next = nextZoom(view.zoom, event.deltaY < 0 ? -1 : 1);
    if (next !== view.zoom) setView({ zoom: next });
  };

  // Notes.
  const end = host !== undefined && isEndDimension(host, dimension);
  const notes =
    state === null
      ? []
      : notesFor({
          facts: state.facts,
          summary: world?.summary ?? null,
          end,
          climate: usesClimate(dimension),
          mode,
          heightStep,
          problems: state.problems,
          litCondition: host?.plain === true && folder === 'worldgen/material_condition',
        });

  const fineBiomes = layers.find((layer) => layer.kind === 'biomes' && layer.pass === 'fine');
  const share =
    lit !== null && fineBiomes?.biomes !== undefined ? biomeShare(fineBiomes.biomes, lit) : null;
  const [findMessage, setFindMessage] = useState<string | null>(null);
  const findIt = (): void => {
    if (lit === null || view === null) return;
    const layer = layers.findLast((entry) => entry.kind === 'biomes');
    const found = layer === undefined ? null : findBiome(layer, lit, view.x, view.z);
    if (found === null) {
      setFindMessage('Not in this view. Zoom out or move the map to look further.');
      return;
    }
    setFindMessage(null);
    setView({ x: found.x, z: found.z, mode: 'biomes' });
  };

  if (filesError !== null && state === null) {
    return (
      <p role="status" className="text-sm text-error">
        {`The world map could not read the project's files: ${filesError}`}
      </p>
    );
  }
  if (state === null || view === null) {
    return (
      <p role="status" className="text-sm text-muted">
        Reading the world's files…
      </p>
    );
  }
  if (host === undefined) {
    return (
      <p role="status" className="text-sm text-muted" data-testid="terrain-no-host">
        {folder === 'worldgen/world_preset'
          ? 'This world type names no dimensions yet.'
          : 'Nothing in the project uses this yet, and it has no plain world to show it in.'}
      </p>
    );
  }

  const pictureMode = mode === 'biomes' || mode === 'height';
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="world-map">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Map" className="flex flex-wrap gap-1">
          {modes.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={entry === mode}
              data-testid={`terrain-mode-${entry}`}
              className={`rounded border px-2 py-0.5 text-sm ${
                entry === mode ? 'border-accent text-text' : 'border-border text-muted'
              }`}
              onClick={() => setView({ mode: entry })}
            >
              {MODE_LABELS[entry]}
            </button>
          ))}
        </div>
        <PreviewTag />
        {drawing && pictureMode && !banner ? (
          <span role="status" className="text-xs text-muted" data-testid="terrain-drawing">
            Drawing…
          </span>
        ) : null}
      </div>
      {hosts.length > 1 || !isWorld ? (
        <label className="flex items-center gap-2 text-sm">
          {folder === 'worldgen/world_preset' ? 'Dimension' : 'Seen in'}
          <select
            data-testid="terrain-host"
            className="max-w-full rounded border border-border bg-bg px-1"
            value={host.key}
            onChange={(event) => setHostKey(event.target.value)}
          >
            {hosts.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {mode === 'climate' ? (
        <Suspense fallback={<p className="text-sm text-muted">Loading climate map…</p>}>
          <ClimateMap project={project} id={element.id} data={element.data} />
        </Suspense>
      ) : (
        <>
          <SeedControls
            seed={view.seed}
            seedNumber={world?.summary.seed ?? null}
            onSeed={(next) => setView({ seed: next })}
            {...(props.worlds === undefined ? {} : { worlds: props.worlds })}
          />
          <PositionControls view={view} onChange={setView} />
          {banner ? (
            <SetUpBanner onSetup={onSetup} />
          ) : worldError !== null ? (
            <p role="status" className="text-sm text-error" data-testid="terrain-error">
              {`The map could not be drawn: ${worldError}`}
            </p>
          ) : mode === 'side_cut' ? (
            <SideCut client={client} world={world} view={view} onChange={setView} />
          ) : (
            <>
              <div className="relative aspect-square w-full overflow-hidden rounded border border-border">
                <canvas
                  ref={canvasRef}
                  data-testid="terrain-map"
                  width={MAP_PIXELS}
                  height={MAP_PIXELS}
                  tabIndex={0}
                  role="img"
                  aria-label={`${MODE_LABELS[mode]} map of ${host.label} around X ${view.x}, Z ${view.z}, ${view.zoom} blocks a pixel. Drag or use the arrow keys to move, + and - to zoom.`}
                  className="block size-full cursor-grab touch-none [image-rendering:pixelated] focus-visible:outline focus-visible:outline-accent"
                  onKeyDown={mapKeyHandler(view, setView)}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onPointerLeave={() => {
                    setHover(null);
                  }}
                  onWheel={onWheel}
                />
              </div>
              <p
                aria-live="polite"
                className="min-h-5 text-xs text-muted [overflow-wrap:anywhere]"
                data-testid="terrain-hover"
              >
                {hover === null
                  ? 'Hover the map to see the biome and the height there.'
                  : `X ${hover.x}, Z ${hover.z}${hovered?.biome === undefined ? '' : `: ${hovered.biome}`}${
                      hovered?.height === undefined ? '' : `, land at y ${hovered.height}`
                    }${
                      markerHere === null
                        ? ''
                        : `. ${setName(markerHere.set)} may start here (chunk ${markerHere.chunkX}, ${markerHere.chunkZ}).`
                    }`}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid="terrain-markers-toggle"
                    checked={markersOn}
                    onChange={(event) => setMarkersOn(event.target.checked)}
                  />
                  Structures
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid="terrain-compare"
                    checked={compareOn && state.vanilla !== null}
                    disabled={state.vanilla === null}
                    onChange={(event) => setCompareOn(event.target.checked)}
                  />
                  Compare with vanilla
                </label>
              </div>
              {markerResult === null ? null : (
                <p className="text-xs text-muted" data-testid="terrain-markers">
                  {markerResult.markers.length === 0
                    ? 'No structure may start in this view.'
                    : `${markerResult.markers.length} ${
                        markerResult.markers.length === 1 ? 'place' : 'places'
                      } in this view where a structure may start.`}
                </p>
              )}
              {state.vanilla === null ? (
                <div
                  role="status"
                  data-testid="terrain-compare-set-up"
                  className="flex flex-wrap items-center gap-2 rounded border border-warning px-3 py-2 text-sm"
                >
                  <span>
                    Compare with vanilla needs Minecraft's own land files. Set up your Minecraft
                    folder to see vanilla's world beside yours.
                  </span>
                  <Button onClick={onSetup}>Set up Minecraft folder</Button>
                </div>
              ) : compareOn ? (
                <CompareView
                  client={compareClient}
                  state={state}
                  dimension={dimension}
                  end={end}
                  mode={mode === 'height' ? 'height' : 'biomes'}
                  view={view}
                  colours={colours}
                />
              ) : null}
              {lit !== null && mode === 'biomes' ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span data-testid="terrain-share">
                    {share === null
                      ? 'This biome is lit on the map.'
                      : `This biome covers ${Math.round(share * 1000) / 10} % of the view.`}
                  </span>
                  <Button data-testid="terrain-find" onClick={findIt}>
                    Find it
                  </Button>
                  {findMessage === null ? null : (
                    <span className="text-xs text-muted">{findMessage}</span>
                  )}
                </div>
              ) : null}
            </>
          )}
          <TerrainNotes
            lines={markerResult === null ? notes : [...notes, MARKER_WORDS, ...markerResult.notes]}
          />
        </>
      )}
      <output
        className="sr-only"
        data-testid="terrain-state"
        data-mode={mode}
        data-world={world?.hash ?? ''}
        data-pass={shownLayers.at(-1)?.pass ?? ''}
        data-drawn={drawn}
        data-drawing={drawing ? 'yes' : 'no'}
        data-banner={banner ? 'yes' : 'no'}
        data-markers={markerResult?.markers.length ?? ''}
        data-edit-ms={timing?.editMs ?? ''}
        data-debounce-ms={TERRAIN_DEBOUNCE_MS}
      >
        {`${MODE_LABELS[mode]}; ${drawing ? 'drawing' : 'drawn'}`}
      </output>
    </div>
  );
}
