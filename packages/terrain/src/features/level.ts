/**
 * The level the features write into: the window's own grid, and around it, read lazily, the
 * blocks a feature of a neighbouring chunk looks at (built a 16-block section of a column at a
 * time by the same surface pass as the window, `columns.ts` `SurfaceColumns`). Writes inside the
 * window change its grid; writes outside are kept in an overlay so later features see them, and
 * are not returned. Heightmaps are found by scanning down from the land's top (the window's own
 * rows where the top is inside it, else `fill.ts` `HeightSearch`); the `_WG` ones read the blocks
 * as the terrain left them.
 */

import { BlockState, type Identifier } from 'deepslate/worldgen';
import type { ColumnWindow } from '../api';
import { SurfaceColumns } from '../columns';
import { HeightSearch } from '../fill';
import type { EngineWorld } from '../world';
import { AIR, type BlockClass, classOf, idOf, propertiesOf, stateString } from './blocks';

/** How far around the window the level reads and keeps writes (blocks). */
export const AREA_MARGIN = 40;

export type HeightmapType =
  | 'WORLD_SURFACE_WG'
  | 'WORLD_SURFACE'
  | 'OCEAN_FLOOR_WG'
  | 'OCEAN_FLOOR'
  | 'MOTION_BLOCKING'
  | 'MOTION_BLOCKING_NO_LEAVES';

export function heightmapOf(value: unknown): HeightmapType {
  switch (value) {
    case 'WORLD_SURFACE':
    case 'OCEAN_FLOOR_WG':
    case 'OCEAN_FLOOR':
    case 'MOTION_BLOCKING':
    case 'MOTION_BLOCKING_NO_LEAVES':
    case 'WORLD_SURFACE_WG':
      return value;
    default:
      return 'WORLD_SURFACE_WG';
  }
}

function matches(kind: HeightmapType, c: BlockClass): boolean {
  switch (kind) {
    case 'WORLD_SURFACE':
    case 'WORLD_SURFACE_WG':
      return !c.air;
    case 'OCEAN_FLOOR':
    case 'OCEAN_FLOOR_WG':
      return c.solid;
    case 'MOTION_BLOCKING':
      return c.solid || c.fluid || c.water;
    case 'MOTION_BLOCKING_NO_LEAVES':
      return (c.solid && !c.leaves) || c.fluid || c.water;
  }
}

/** The height searches kept per world (compiling a bound takes a moment). */
const searches = new WeakMap<EngineWorld, HeightSearch>();

/** A world's block grid around a window, for the features. */
export class FeatureLevel {
  readonly world: EngineWorld;
  readonly minY: number;
  readonly maxY: number;
  readonly seaLevel: number;
  readonly window: ColumnWindow;
  readonly palette: string[];
  readonly blocks: Uint16Array;
  /** How many blocks the features changed inside the window. */
  changed = 0;

  private readonly original: Uint16Array;
  private readonly index = new Map<string, number>();
  private readonly byState = new Map<BlockState, number>();
  private readonly classes: BlockClass[] = [];
  private readonly overlay = new Map<number, number>();
  private readonly sections = new Map<number, Uint16Array>();
  private readonly writtenTop = new Map<number, number>();
  private readonly terrain = new Map<number, { surface: number; floor: number }>();
  private readonly biomeNames = new Map<Identifier, string>();
  private readonly columns: SurfaceColumns | undefined;
  private search: HeightSearch | undefined;
  private readonly ax0: number;
  private readonly az0: number;
  private readonly aw: number;
  private readonly ad: number;
  private readonly x1: number;
  private readonly y1: number;
  private readonly z1: number;

  constructor(
    world: EngineWorld,
    window: ColumnWindow,
    palette: readonly string[],
    blocks: Uint16Array,
  ) {
    this.world = world;
    this.window = window;
    this.minY = world.minY;
    this.maxY = world.minY + world.height - 1;
    this.seaLevel = world.seaLevel;
    this.palette = [...palette];
    if (this.palette.length === 0) this.palette.push(AIR);
    this.blocks = blocks;
    this.original = blocks.slice();
    this.palette.forEach((name, i) => {
      const key = normalise(name);
      if (!this.index.has(key)) this.index.set(key, i);
      this.classes[i] = classOf(key);
    });
    this.ax0 = window.x0 - AREA_MARGIN;
    this.az0 = window.z0 - AREA_MARGIN;
    this.aw = window.sizeX + 2 * AREA_MARGIN;
    this.ad = window.sizeZ + 2 * AREA_MARGIN;
    this.x1 = window.x0 + window.sizeX - 1;
    this.y1 = window.y0 + window.sizeY - 1;
    this.z1 = window.z0 + window.sizeZ - 1;
    const parts = world.noise;
    if (parts) this.columns = new SurfaceColumns(world, parts, true);
  }

  /** The palette index of a state string (added when new). */
  indexOf(state: string): number {
    const key = normalise(state);
    let i = this.index.get(key);
    if (i === undefined) {
      i = this.palette.length;
      this.palette.push(key);
      this.index.set(key, i);
      this.classes[i] = classOf(key);
    }
    return i;
  }

  private indexOfState(s: BlockState): number {
    let i = this.byState.get(s);
    if (i === undefined) {
      i = this.indexOf(s.toString());
      this.byState.set(s, i);
    }
    return i;
  }

  inWindow(x: number, y: number, z: number): boolean {
    return (
      x >= this.window.x0 &&
      x <= this.x1 &&
      z >= this.window.z0 &&
      z <= this.z1 &&
      y >= this.window.y0 &&
      y <= this.y1
    );
  }

  /** Horizontal distance from a column to the window (0 inside it). */
  distanceXZ(x: number, z: number): number {
    const dx = x < this.window.x0 ? this.window.x0 - x : x > this.x1 ? x - this.x1 : 0;
    const dz = z < this.window.z0 ? this.window.z0 - z : z > this.z1 ? z - this.z1 : 0;
    return Math.max(dx, dz);
  }

  /** Vertical distance from a height to the window's rows: negative below, positive above. */
  distanceY(y: number): number {
    return y < this.window.y0 ? y - this.window.y0 : y > this.y1 ? y - this.y1 : 0;
  }

  private gridIndex(x: number, y: number, z: number): number {
    const w = this.window;
    return ((y - w.y0) * w.sizeZ + (z - w.z0)) * w.sizeX + (x - w.x0);
  }

  private column(x: number, z: number): number {
    const lx = x - this.ax0;
    const lz = z - this.az0;
    if (lx < 0 || lz < 0 || lx >= this.aw || lz >= this.ad) return -1;
    return lx * this.ad + lz;
  }

  /** The palette index at a block (`original`: as the terrain left it). */
  at(x: number, y: number, z: number, original = false): number {
    if (y < this.minY || y > this.maxY) return 0;
    if (this.inWindow(x, y, z)) {
      return (original ? this.original : this.blocks)[this.gridIndex(x, y, z)] as number;
    }
    const col = this.column(x, z);
    if (col < 0) return 0;
    const ly = y - this.minY;
    if (!original) {
      const o = this.overlay.get(col * 4096 + ly);
      if (o !== undefined) return o;
    }
    return this.sectionAt(col, x, z, ly);
  }

  private sectionAt(col: number, x: number, z: number, ly: number): number {
    const s = ly >> 4;
    const key = col * 256 + s;
    let section = this.sections.get(key);
    if (!section) {
      section = new Uint16Array(16);
      const base = this.minY + s * 16;
      if (this.columns) {
        const out = section;
        this.columns.column(x, z, base, base + 15, (y, state) => {
          out[y - base] = this.indexOfState(state);
        });
      } else if (this.world.flat) {
        const { layers, minY } = this.world.flat;
        for (let i = 0; i < 16; i += 1) {
          const name = layers[base + i - minY];
          if (name !== undefined && name !== AIR) section[i] = this.indexOf(name);
        }
      }
      this.sections.set(key, section);
    }
    return section[ly & 15] as number;
  }

  /** The state string at a block. */
  get(x: number, y: number, z: number, original = false): string {
    return this.palette[this.at(x, y, z, original)] ?? AIR;
  }

  /** The class of the block at a position. */
  classAt(x: number, y: number, z: number, original = false): BlockClass {
    return this.classes[this.at(x, y, z, original)] ?? classOf(AIR);
  }

  /** Sets a block (outside the world or the read area: nothing). */
  set(x: number, y: number, z: number, state: string): void {
    if (y < this.minY || y > this.maxY) return;
    const i = this.indexOf(state);
    if (this.inWindow(x, y, z)) {
      const g = this.gridIndex(x, y, z);
      if (this.blocks[g] !== i) {
        this.blocks[g] = i;
        this.changed += 1;
      }
    } else {
      const col = this.column(x, z);
      if (col < 0) return;
      this.overlay.set(col * 4096 + (y - this.minY), i);
    }
    if (i !== 0) {
      const col = this.column(x, z);
      if (col >= 0 && (this.writtenTop.get(col) ?? -Infinity) < y) this.writtenTop.set(col, y);
    }
  }

  inWorld(y: number): boolean {
    return y >= this.minY && y <= this.maxY;
  }

  /**
   * The first free height of a heightmap at a column (one above its top block), or the world's
   * bottom when the column has none. The `_WG` ones are the terrain's; the others start there and
   * look again only where a feature has written at or above it.
   */
  height(x: number, z: number, kind: HeightmapType): number {
    const terrain = this.terrainHeights(x, z);
    const floor = kind === 'OCEAN_FLOOR' || kind === 'OCEAN_FLOOR_WG';
    const wg = floor ? terrain.floor : terrain.surface;
    if (kind.endsWith('_WG')) return wg;
    const col = this.column(x, z);
    const top = col >= 0 ? this.writtenTop.get(col) : undefined;
    if (top === undefined || top < wg - 1) return wg;
    for (let y = Math.max(top, wg); y >= this.minY; y -= 1) {
      if (matches(kind, this.classAt(x, y, z))) return y + 1;
    }
    return this.minY;
  }

  /**
   * The terrain's first free heights at a column: `surface` over anything but air, `floor` over
   * solid ground. From the window's own rows where its top is inside them (aquifer lakes
   * included); else from `HeightSearch`'s land top and the sea (aquifers left out).
   */
  private terrainHeights(x: number, z: number): { surface: number; floor: number } {
    const col = this.column(x, z);
    const known = col >= 0 ? this.terrain.get(col) : undefined;
    if (known) return known;
    let found: { surface: number; floor: number } | undefined;
    const flat = this.world.flat;
    if (!this.world.noise) {
      let surface = this.minY;
      let floor = this.minY;
      const layers = flat?.layers ?? [];
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        const c = classOf(layers[i] as string);
        const y = (flat?.minY ?? this.minY) + i + 1;
        if (surface === this.minY && !c.air) surface = y;
        if (c.solid) {
          floor = y;
          break;
        }
      }
      found = { surface, floor };
    } else {
      found = this.windowHeights(x, z) ?? this.searchedHeights(x, z);
    }
    if (col >= 0) this.terrain.set(col, found);
    return found;
  }

  /**
   * Whether a column's top could be inside the window's rows: the terrain's is, or a feature has
   * written in them (no search for the land's top is made).
   */
  topMaybeInWindow(x: number, z: number): boolean {
    const col = this.column(x, z);
    const top = col >= 0 ? this.writtenTop.get(col) : undefined;
    if (top !== undefined && top >= this.window.y0) return true;
    const known = col >= 0 ? this.terrain.get(col) : undefined;
    if (known) return known.surface > this.window.y0 && known.surface <= this.y1 + 1;
    return this.windowHeights(x, z) !== undefined;
  }

  /** The heights from the window's rows, when the column's top is inside them. */
  private windowHeights(x: number, z: number): { surface: number; floor: number } | undefined {
    const w = this.window;
    if (x < w.x0 || x > this.x1 || z < w.z0 || z > this.z1) return undefined;
    const y0 = Math.max(w.y0, this.minY);
    const y1 = Math.min(this.y1, this.maxY);
    if (y1 < y0 || !this.classAt(x, y1, z, true).air) return undefined;
    let surface: number | undefined;
    for (let y = y1 - 1; y >= y0; y -= 1) {
      const c = this.classAt(x, y, z, true);
      if (surface === undefined && !c.air) surface = y + 1;
      if (c.solid) return { surface: surface ?? y + 1, floor: y + 1 };
    }
    if (surface === undefined) return undefined;
    return { surface, floor: this.searchedHeights(x, z).floor };
  }

  /** The heights from the land's top (`HeightSearch`) and the sea. */
  private searchedHeights(x: number, z: number): { surface: number; floor: number } {
    const parts = this.world.noise;
    if (!parts) return { surface: this.minY, floor: this.minY };
    if (!this.search) {
      let s = searches.get(this.world);
      if (!s) {
        s = new HeightSearch(parts);
        searches.set(this.world, s);
      }
      this.search = s;
    }
    const top = this.search.height(x, z, 'ocean_floor');
    let surface = top;
    const sea = Math.min(this.seaLevel - 1, this.maxY);
    if (
      sea > top &&
      sea >= this.minY &&
      !parts.fluidPicker(x, sea, z).at(sea).equals(BlockState.AIR)
    ) {
      surface = sea;
    }
    return { surface: surface + 1, floor: top + 1 };
  }

  /** The biome at a block, as an id. */
  biome(x: number, y: number, z: number): string {
    if (this.columns) {
      const id = this.columns.biomes.at(x, y, z);
      let name = this.biomeNames.get(id);
      if (name === undefined) {
        name = id.toString();
        this.biomeNames.set(id, name);
      }
      return name;
    }
    return this.world.flat?.biome ?? 'minecraft:plains';
  }
}

/** One form of a state string (properties sorted). */
function normalise(state: string): string {
  return state.includes('[') ? stateString(idOf(state), propertiesOf(state)) : state;
}
