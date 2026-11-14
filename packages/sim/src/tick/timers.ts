/**
 * Timed blocks (B391): a pressed button lets go after its press time, and pressure plates are
 * pressed while an entity's box rests on them. Entities come in as plain world boxes (the
 * player's now, mobs' later), so this file knows no entity type. No redstone travels anywhere
 * (ADR 0085 L6): only the plate's or button's own state changes.
 */

import type { BlockCatalogue } from '../blocks/catalogue.js';
import type { UseResult } from '../blocks/interact.js';
import type { BlockChange } from '../blocks/neighbours.js';
import type { BlockPos, BlockState, Box } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';

/**
 * How long a plain pressure plate stays pressed after the last entity leaves, in ticks. An
 * approximation of the game's observable delay (it checks again once a second).
 */
export const PLATE_RELEASE_TICKS = 20;
/** The same for a weighted plate (the game checks it twice as often). */
export const WEIGHTED_PLATE_RELEASE_TICKS = 10;
/** The highest signal a plate gives. */
export const MAX_SIGNAL = 15;
/**
 * The part of a plate's block an entity's box must touch to press it, in block units: the
 * plate's own area, a quarter of a block high.
 */
export const PLATE_PRESS_AREA: Box = Object.freeze([
  1 / 16,
  0,
  1 / 16,
  15 / 16,
  0.25,
  15 / 16,
]) as Box;

/**
 * A weighted plate's signal for a number of entities: the share of its `weighted_max`, rounded
 * up, out of 15 (one entity on a plate of 15 gives 1; one on a plate of 150 gives 1, ten give 1,
 * eleven give 2).
 */
export function weightedSignal(count: number, weightedMax: number): number {
  if (count <= 0) return 0;
  const max = Math.max(1, weightedMax);
  return Math.ceil((MAX_SIGNAL * Math.min(count, max)) / max);
}

const posKey = (pos: BlockPos): string => `${pos.x},${pos.y},${pos.z}`;

/** Whether two world boxes overlap with some volume (touching faces do not count). */
function overlaps(a: Box, b: Box): boolean {
  return a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
}

interface ButtonTimer {
  readonly pos: BlockPos;
  readonly name: string;
  left: number;
}

interface PlateTimer {
  readonly pos: BlockPos;
  readonly name: string;
  /** Ticks left before it lets go, counted only while nothing rests on it. */
  left: number;
}

/**
 * The button and plate timers of one area. Call {@link tick} once per clock tick with the boxes
 * of every entity in the area; it returns the blocks it changed, already set in the world.
 */
export class BlockTimers {
  private readonly buttons = new Map<string, ButtonTimer>();
  private readonly plates = new Map<string, PlateTimer>();

  private readonly world: SimWorld;
  private catalogue: BlockCatalogue;

  constructor(world: SimWorld, catalogue: BlockCatalogue) {
    this.world = world;
    this.catalogue = catalogue;
  }

  /**
   * Takes the catalogue built after a live edit (ADR 0085 D4); the timers keep running (B390).
   */
  setCatalogue(catalogue: BlockCatalogue): void {
    this.catalogue = catalogue;
  }

  /** Lets a pressed button go after `ticks` ticks; a later press of the same button replaces it. */
  scheduleRelease(pos: BlockPos, ticks: number): void {
    const state = this.world.get(pos);
    if (state === null) return;
    this.buttons.set(posKey(pos), { pos, name: state.name, left: Math.max(1, Math.round(ticks)) });
  }

  /** Schedules the release `useBlock` asked for, when it pressed a button. */
  afterUse(pos: BlockPos, result: UseResult): void {
    if (result.handled && result.releaseAfterTicks !== undefined) {
      this.scheduleRelease(pos, result.releaseAfterTicks);
    }
  }

  /** The buttons and plates waiting to let go, for tests and the state readout. */
  get pending(): number {
    return this.buttons.size + this.plates.size;
  }

  /** Forgets every timer (the area was cleared). */
  clear(): void {
    this.buttons.clear();
    this.plates.clear();
  }

  /**
   * Runs one tick: counts the buttons down and lets go of those whose time is up, then presses
   * the plates any entity box rests on and lets go of those left long enough.
   */
  tick(entityBoxes: readonly Box[]): BlockChange[] {
    const changes: BlockChange[] = [];
    this.tickButtons(changes);
    this.tickPlates(entityBoxes, changes);
    return changes;
  }

  private setProps(
    pos: BlockPos,
    state: BlockState,
    props: Record<string, string>,
    out: BlockChange[],
  ) {
    const next = this.catalogue.withProperties(state, props);
    if (this.world.set(pos, next)) out.push({ pos, state: this.world.get(pos) });
  }

  private tickButtons(out: BlockChange[]): void {
    for (const [key, timer] of [...this.buttons]) {
      const state = this.world.get(timer.pos);
      // Broken or replaced: nothing to let go of.
      if (state === null || state.name !== timer.name) {
        this.buttons.delete(key);
        continue;
      }
      timer.left -= 1;
      if (timer.left > 0) continue;
      this.buttons.delete(key);
      if (state.properties.powered === 'true') {
        this.setProps(timer.pos, state, { powered: 'false' }, out);
      }
    }
  }

  /** The plates in the area with how many entity boxes rest on each. */
  private platesUnder(boxes: readonly Box[]): Map<string, { pos: BlockPos; count: number }> {
    const found = new Map<string, { pos: BlockPos; count: number }>();
    for (const box of boxes) {
      const seen = new Set<string>();
      const x0 = Math.max(0, Math.floor(box[0]));
      const y0 = Math.max(0, Math.floor(box[1]));
      const z0 = Math.max(0, Math.floor(box[2]));
      const x1 = Math.min(this.world.sizeX - 1, Math.ceil(box[3]) - 1);
      const y1 = Math.min(this.world.sizeY - 1, Math.ceil(box[4]) - 1);
      const z1 = Math.min(this.world.sizeZ - 1, Math.ceil(box[5]) - 1);
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const pos = { x, y, z };
            const state = this.world.get(pos);
            if (state === null) continue;
            if (this.catalogue.blockFor(state.name)?.type !== 'pressure_plate') continue;
            const area: Box = [
              x + PLATE_PRESS_AREA[0],
              y + PLATE_PRESS_AREA[1],
              z + PLATE_PRESS_AREA[2],
              x + PLATE_PRESS_AREA[3],
              y + PLATE_PRESS_AREA[4],
              z + PLATE_PRESS_AREA[5],
            ];
            const key = posKey(pos);
            if (seen.has(key) || !overlaps(box, area)) continue;
            seen.add(key);
            const entry = found.get(key) ?? { pos, count: 0 };
            entry.count += 1;
            found.set(key, entry);
          }
        }
      }
    }
    return found;
  }

  private tickPlates(boxes: readonly Box[], out: BlockChange[]): void {
    const under = this.platesUnder(boxes);
    for (const [key, { pos, count }] of under) {
      const state = this.world.get(pos) as BlockState;
      const block = this.catalogue.blockFor(state.name);
      const weighted = block?.weightedMax;
      if (weighted !== undefined) {
        this.setProps(pos, state, { power: String(weightedSignal(count, weighted)) }, out);
      } else {
        this.setProps(pos, state, { powered: 'true' }, out);
      }
      this.plates.set(key, {
        pos,
        name: state.name,
        left: weighted !== undefined ? WEIGHTED_PLATE_RELEASE_TICKS : PLATE_RELEASE_TICKS,
      });
    }
    for (const [key, timer] of [...this.plates]) {
      if (under.has(key)) continue;
      const state = this.world.get(timer.pos);
      if (state === null || state.name !== timer.name) {
        this.plates.delete(key);
        continue;
      }
      timer.left -= 1;
      if (timer.left > 0) continue;
      this.plates.delete(key);
      const weighted = this.catalogue.blockFor(state.name)?.weightedMax !== undefined;
      this.setProps(timer.pos, state, weighted ? { power: '0' } : { powered: 'false' }, out);
    }
  }
}
