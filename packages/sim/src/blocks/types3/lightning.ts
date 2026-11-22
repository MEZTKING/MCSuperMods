/**
 * The Lightning tool (B519, ADR 0104 D2): a bolt on the block pointed at scrapes weathering
 * project blocks as lightning scrapes vanilla copper, by what the runtime measured (B510 notes):
 * the struck block goes back to its first stage, then three to five walks of one to eight steps go
 * out from it, each step to a weathering project block beside (or diagonally beside) the last,
 * scraping it one stage back. Waxed blocks do not weather, so the bolt passes them by; a walk
 * passes only through project blocks that weather. Fire, damage, thunder, charged creepers and
 * vanilla copper are only in the game (the area says so).
 */
import type { BlockPos, BlockState } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue } from '../catalogue.js';
import type { BlockChange } from '../neighbours.js';
import { agedState } from '../weathering.js';
import { chestPartner } from './neighbours.js';

/** The id of the Lightning tool in a `tool` action. */
export const LIGHTNING_TOOL = 'lightning';

/** What a bolt did. */
export interface LightningResult {
  readonly changes: readonly BlockChange[];
  /** The struck block's id before and after, when it went back to its first stage. */
  readonly struck?: { readonly from: string; readonly to: string };
  /** How many blocks the walks scraped one stage back. */
  readonly scraped: number;
}

/** Each weathering block's earlier stage, by block id (the reverse of `next`). */
export function earlierStages(catalogue: BlockCatalogue): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of catalogue.ids()) {
    const next = catalogue.get(id)?.weathering?.next;
    if (next !== undefined && !out.has(next)) out.set(next, id);
  }
  return out;
}

/** The first stage of a weathering block's family. */
function firstStage(earlier: ReadonlyMap<string, string>, id: string): string {
  let at = id;
  const seen = new Set<string>();
  while (earlier.has(at) && !seen.has(at)) {
    seen.add(at);
    at = earlier.get(at) as string;
  }
  return at;
}

/** Strikes the block at `pos`; see the module comment. */
export function strikeLightning(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  random: () => number,
): LightningResult {
  const earlier = earlierStages(catalogue);
  const changes: BlockChange[] = [];
  const turn = (at: BlockPos, state: BlockState, into: string): boolean => {
    const partner = chestPartner(world, at, state);
    const next = agedState(catalogue, state, into);
    if (next === undefined || !world.set(at, next)) return false;
    changes.push({ pos: at, state: next });
    // A double chest's other half changes with it (B513).
    const other = partner === undefined ? null : world.get(partner);
    const pair = other === null ? undefined : agedState(catalogue, other, into);
    if (partner !== undefined && pair !== undefined && world.set(partner, pair)) {
      changes.push({ pos: partner, state: pair });
    }
    return true;
  };
  let struck: LightningResult['struck'];
  const state = world.get(pos);
  if (state !== null && catalogue.blockFor(state.name)?.weathering !== undefined) {
    const first = firstStage(earlier, state.name);
    if (first !== state.name && turn(pos, state, first)) struck = { from: state.name, to: first };
  }
  let scraped = 0;
  const walks = 3 + Math.floor(random() * 3);
  for (let walk = 0; walk < walks; walk++) {
    let at = pos;
    const steps = 1 + Math.floor(random() * 8);
    for (let step = 0; step < steps; step++) {
      const around: BlockPos[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            const near = { x: at.x + dx, y: at.y + dy, z: at.z + dz };
            const there = world.get(near);
            if (there !== null && catalogue.blockFor(there.name)?.weathering !== undefined) {
              around.push(near);
            }
          }
        }
      }
      if (around.length === 0) break;
      at = around[Math.floor(random() * around.length)] as BlockPos;
      const there = world.get(at) as BlockState;
      const back = earlier.get(there.name);
      if (back !== undefined && turn(at, there, back)) scraped += 1;
    }
  }
  return { changes, ...(struck === undefined ? {} : { struck }), scraped };
}
