/**
 * Using a block by hand (B387): doors, trapdoors and fence gates open and close where the set
 * type lets a hand do it (ADR 0067 D2), and a button starts its press. Releasing the button
 * after its press time is the clock's job (B391). Uses of any other block are left to the
 * caller (triggers and screens come in later slices).
 */
import type { BlockPos } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import type { BlockCatalogue } from './catalogue.js';
import { isHorizontal, lookHorizontal, offset, opposite } from './directions.js';
import { type BlockChange, updateNeighbours } from './neighbours.js';

/** A request to use a block: where, and where the player looks. */
export interface UseInput {
  readonly pos: BlockPos;
  /** Where the player looks, in degrees (yaw 0 looks south, 90 west). */
  readonly yaw: number;
}

/** What using a block did. */
export type UseResult =
  | {
      /** The block reacted (or, for a door hands cannot open, deliberately did not). */
      readonly handled: true;
      /** Every block set, in order. */
      readonly changes: readonly BlockChange[];
      /** A line for the log in plain words, when there is something to say. */
      readonly message?: string;
      /** For a button just pressed: the ticks until it releases (B391 schedules it). */
      readonly releaseAfterTicks?: number;
    }
  | {
      /** The block has no use by hand here; the caller may run its triggers. */
      readonly handled: false;
    };

/**
 * Uses the block at a position as a hand would, applying every change to the world.
 *
 * - Doors and trapdoors toggle `open` when their set type opens by hand (not `iron` or `gold`);
 *   a door's two halves move together.
 * - Fence gates toggle `open`; opening one from its far side turns it to open away from the
 *   player, as in the game.
 * - Buttons become `powered` and report their press time; a pressed button does nothing.
 */
export function useBlock(world: SimWorld, catalogue: BlockCatalogue, input: UseInput): UseResult {
  const state = world.get(input.pos);
  if (state === null) return { handled: false };
  const block = catalogue.blockFor(state.name);
  if (block === undefined) return { handled: false };
  const sets: BlockChange[] = [];
  switch (block.type) {
    case 'door':
    case 'trapdoor': {
      if (!block.opensByHand) {
        return {
          handled: true,
          changes: [],
          message: `${block.displayName} does not open by hand; it needs a redstone signal`,
        };
      }
      const open = String(state.properties.open !== 'true');
      sets.push({ pos: input.pos, state: catalogue.withProperties(state, { open }) });
      if (block.type === 'door') {
        const other = offset(input.pos, state.properties.half === 'upper' ? 'down' : 'up');
        const otherState = world.get(other);
        if (otherState?.name === state.name) {
          sets.push({ pos: other, state: catalogue.withProperties(otherState, { open }) });
        }
      }
      break;
    }
    case 'fence_gate': {
      if (state.properties.open === 'true') {
        sets.push({ pos: input.pos, state: catalogue.withProperties(state, { open: 'false' }) });
      } else {
        const look = lookHorizontal(input.yaw);
        const facing = state.properties.facing;
        const turned =
          facing !== undefined && isHorizontal(facing) && facing === opposite(look) ? look : facing;
        sets.push({
          pos: input.pos,
          state: catalogue.withProperties(state, {
            open: 'true',
            ...(turned !== undefined ? { facing: turned } : {}),
          }),
        });
      }
      break;
    }
    case 'button': {
      if (state.properties.powered === 'true') return { handled: true, changes: [] };
      world.set(input.pos, catalogue.withProperties(state, { powered: 'true' }));
      return {
        handled: true,
        changes: [{ pos: input.pos, state: world.get(input.pos) }],
        releaseAfterTicks: block.pressTicks ?? 20,
      };
    }
    default:
      return { handled: false };
  }
  const changes: BlockChange[] = [];
  for (const change of sets) if (world.set(change.pos, change.state)) changes.push(change);
  for (const change of sets) changes.push(...updateNeighbours(world, catalogue, change.pos));
  return { handled: true, changes };
}
