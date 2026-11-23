/**
 * The mock cobblestone generator (ADR 0117 D4, B558). In the game lava flowing into water makes
 * cobblestone, which is how a Skyblock island makes stone. Try it's water and lava are props
 * that do not flow (ADR 0085), so the rule is simplified: a block broken (or otherwise turned to
 * air) that touches both a water and a lava prop becomes cobblestone a second later, if it is
 * still air. It is said once in "What happened".
 *
 * Deterministic: it counts ticks.
 */

import type { BlockCatalogue } from '../blocks/catalogue.js';
import type { BlockPos, BlockState, SimLog } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';

/** How long the generator takes, in ticks (a second). */
export const GENERATOR_TICKS = 20;

/** What the generator makes. */
export const GENERATOR_BLOCK = 'minecraft:cobblestone';

const WATER = new Set(['minecraft:water']);
const LAVA = new Set(['minecraft:lava']);
const SIDES: readonly BlockPos[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/** What the generator works on. */
export interface GeneratorHost {
  readonly world: SimWorld;
  catalogue(): BlockCatalogue;
  readonly log: SimLog;
  now(): number;
}

/** The mock generator; see the module comment. */
export class MockGenerator {
  private readonly host: GeneratorHost;
  private readonly due = new Map<string, { pos: BlockPos; tick: number }>();
  private said = false;

  constructor(host: GeneratorHost) {
    this.host = host;
  }

  /** Cells waiting to turn into cobblestone. */
  get pending(): number {
    return this.due.size;
  }

  /** Forgets every waiting cell. */
  clear(): void {
    this.due.clear();
  }

  /** A cell changed: air between water and lava waits a second. */
  changed(pos: BlockPos, state: BlockState | null): void {
    if (state !== null) return;
    if (!this.touches(pos, WATER) || !this.touches(pos, LAVA)) return;
    this.due.set(`${pos.x},${pos.y},${pos.z}`, { pos, tick: this.host.now() + GENERATOR_TICKS });
  }

  /** Turns the cells whose second is up into cobblestone. */
  tick(): void {
    if (this.due.size === 0) return;
    const now = this.host.now();
    for (const [key, one] of [...this.due]) {
      if (one.tick > now) continue;
      this.due.delete(key);
      const { world } = this.host;
      if (world.get(one.pos) !== null) continue;
      if (!this.touches(one.pos, WATER) || !this.touches(one.pos, LAVA)) continue;
      const block = this.host.catalogue().blockFor(GENERATOR_BLOCK);
      if (block === undefined) continue;
      world.set(one.pos, block.defaultState);
      if (!this.said) {
        this.said = true;
        this.host.log.info(
          'A block between water and lava turned into cobblestone a second after it went: the game’s generator, simplified (in the game lava flowing into water makes it).',
        );
      }
    }
  }

  private touches(pos: BlockPos, names: ReadonlySet<string>): boolean {
    return SIDES.some((side) => {
      const state = this.host.world.get({
        x: pos.x + side.x,
        y: pos.y + side.y,
        z: pos.z + side.z,
      });
      return state !== null && names.has(state.name);
    });
  }
}
