/**
 * The live world generation view per project (ADR 0119 D9, the stored part; B580): the seed,
 * the position, the zoom and the mode, shared by the preview panel and Try it's ground. Kept
 * with the app's view preferences in the renderer's local storage, never in the project file.
 * Projects are keyed by their root folder; the last {@link MAX_PROJECTS} are kept. Storage
 * failures are ignored (the view then lasts for this run only).
 */

import { create } from 'zustand';

/** What the map shows. */
export type TerrainMode = 'biomes' | 'height' | 'side_cut' | 'climate';

/** The modes, in the order the panel offers them. */
export const TERRAIN_MODES: readonly TerrainMode[] = ['biomes', 'height', 'side_cut', 'climate'];

/** Blocks a map pixel covers (ADR 0119 (c): 1, 4 or 16). */
export type TerrainZoom = 1 | 4 | 16;

/** The zoom levels, nearest first. */
export const TERRAIN_ZOOMS: readonly TerrainZoom[] = [1, 4, 16];

/** One project's view. */
export interface TerrainView {
  /** The seed as typed: a whole number is itself, other text is hashed as the game does. */
  readonly seed: string;
  /** The block at the centre of the view. */
  readonly x: number;
  readonly z: number;
  readonly zoom: TerrainZoom;
  readonly mode: TerrainMode;
}

/** Projects whose view is kept. */
export const MAX_PROJECTS = 50;

const STORAGE_KEY = 'msm.terrain-view.v1';

/** A new random seed as the game would pick one: a signed 64-bit number, in decimal. */
export function randomSeed(random: () => number = Math.random): string {
  const high = BigInt(Math.floor(random() * 2 ** 32));
  const low = BigInt(Math.floor(random() * 2 ** 32));
  return BigInt.asIntN(64, (high << 32n) | low).toString();
}

/** A fresh view: a random seed at spawn, 4 blocks a pixel, biomes. */
export function defaultView(seed: string = randomSeed()): TerrainView {
  return { seed, x: 0, z: 0, zoom: 4, mode: 'biomes' };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A stored view, checked; `null` when it is not one. */
export function readView(value: unknown): TerrainView | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.seed !== 'string' || !isFiniteNumber(v.x) || !isFiniteNumber(v.z)) return null;
  const zoom = TERRAIN_ZOOMS.includes(v.zoom as TerrainZoom) ? (v.zoom as TerrainZoom) : 4;
  const mode = TERRAIN_MODES.includes(v.mode as TerrainMode) ? (v.mode as TerrainMode) : 'biomes';
  return { seed: v.seed, x: Math.round(v.x), z: Math.round(v.z), zoom, mode };
}

function readStored(): Map<string, TerrainView> {
  const out = new Map<string, TerrainView>();
  try {
    const text = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (text === null || text === undefined) return out;
    const parsed = JSON.parse(text) as unknown;
    const projects =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { projects?: unknown }).projects
        : null;
    if (!Array.isArray(projects)) return out;
    for (const entry of projects) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
      const view = readView(entry[1]);
      if (view !== null) out.set(entry[0], view);
    }
  } catch {
    // Unreadable storage: start empty.
  }
  return out;
}

function writeStored(views: ReadonlyMap<string, TerrainView>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ projects: [...views] }));
  } catch {
    // Storage is unavailable: the view lasts for this run only.
  }
}

/** The view store's shape. */
export interface TerrainViewState {
  /** Views by project root, least recently changed first. */
  views: ReadonlyMap<string, TerrainView>;
  /**
   * The project's view; the first call for a project makes one with a random seed and keeps
   * it, so the panel and the ground agree from the start. It writes the store: call it from an
   * effect or a handler, not while rendering (read `views.get(root)` there).
   */
  viewFor(root: string): TerrainView;
  /** Changes part of the project's view. */
  setView(root: string, patch: Partial<TerrainView>): void;
  /** Forgets every stored view (tests). */
  reset(): void;
}

function withView(
  views: ReadonlyMap<string, TerrainView>,
  root: string,
  view: TerrainView,
): Map<string, TerrainView> {
  const next = new Map(views);
  next.delete(root);
  next.set(root, view);
  while (next.size > MAX_PROJECTS) next.delete(next.keys().next().value as string);
  return next;
}

export const useTerrainView = create<TerrainViewState>((set, get) => ({
  views: readStored(),
  viewFor(root) {
    const known = get().views.get(root);
    if (known !== undefined) return known;
    const view = defaultView();
    const views = withView(get().views, root, view);
    set({ views });
    writeStored(views);
    return view;
  },
  setView(root, patch) {
    const before = get().viewFor(root);
    const view = readView({ ...before, ...patch }) ?? before;
    const views = withView(get().views, root, view);
    set({ views });
    writeStored(views);
  },
  reset() {
    set({ views: new Map() });
    writeStored(new Map());
  },
}));
