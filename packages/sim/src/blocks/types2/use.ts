/**
 * Using the twenty types by hand (B463, ADR 0101 D5), as the game shows it (B445, B446 notes):
 *
 * - a cake loses one slice (`bites` 0 to 6; the last slice takes the cake away) and its `on_eat`
 *   fires; food itself is only in the game;
 * - a berry bush at age 2 or 3 gives its berries (the ripe or full harvest) and goes back to 1;
 * - a lit candle goes out; an unlit one is lit (the game needs flint and steel, said out loud);
 * - a sign opens its editor on the side the player looks at, unless it is waxed;
 * - a bed is lain in (sleeping, the spawn point and Nether explosions are only in the game);
 * - a potted plant would give its plant back (only in the game).
 *
 * Every other of the twenty types does nothing by hand, so the click goes on to the item.
 */
import type { BlockPos, BlockState } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from '../catalogue.js';
import { isHorizontal } from '../directions.js';
import type { BlockChange } from '../neighbours.js';
import { CAKE_MAX_BITES, type SimBlockType2 } from './facts.js';
import { isWater } from './placement.js';

/** Which side of a sign. */
export type SignSide = 'front' | 'back';

/** What using one of the twenty types did. */
export interface Types2UseResult {
  /** True when the block took the click. */
  readonly handled: boolean;
  /** The blocks set, in order. */
  readonly changes: readonly BlockChange[];
  /** A line for the log in plain words. */
  readonly message?: string;
  /** An "Only in Minecraft" line, when part of the use is only in the game. */
  readonly onlyInMinecraft?: string;
  /** Items the player gets (berries). */
  readonly give?: { readonly id: string; readonly count: number };
  /** True when a slice of cake was eaten (its `on_eat` fires). */
  readonly ate?: boolean;
  /** A sign to edit: where and which side. */
  readonly editSign?: { readonly pos: BlockPos; readonly side: SignSide };
}

const NOT_TAKEN: Types2UseResult = Object.freeze({ handled: false, changes: Object.freeze([]) });

/** The way a block faces as a yaw (0 south, 90 west, 180 north, 270 east). */
const FACING_YAW: Readonly<Record<string, number>> = { south: 0, west: 90, north: 180, east: 270 };

/** The yaw the front of a sign faces: a standing sign's rotation, else its wall facing. */
export function signFrontYaw(state: BlockState): number {
  const facing = state.properties.facing;
  if (facing !== undefined && isHorizontal(facing)) return FACING_YAW[facing] as number;
  return Number(state.properties.rotation ?? 0) * 22.5;
}

/** The side of a sign a player looking with `yaw` sees: the front when they look at its face. */
export function signSideFor(state: BlockState, yaw: number): SignSide {
  const toward = signFrontYaw(state) + 180;
  const difference = ((((yaw - toward) % 360) + 540) % 360) - 180;
  return Math.abs(difference) < 90 ? 'front' : 'back';
}

/** Options of {@link useType2}. */
export interface Types2UseInput {
  readonly pos: BlockPos;
  /** Where the player looks, in degrees. */
  readonly yaw: number;
  /** A number from 0 (inclusive) to 1, for the berry count. */
  readonly random: () => number;
  /** Whether the sign at `pos` is waxed (the sign board knows). */
  readonly waxed?: boolean;
  /** The held item's id, when the hand is not empty. */
  readonly item?: string;
}

const between = (range: readonly [number, number], random: () => number): number => {
  const [low, high] = range[0] <= range[1] ? range : [range[1], range[0]];
  return low + Math.floor(random() * (high - low + 1));
};

/** Uses a block of the twenty types by hand; see the module comment. */
export function useType2(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  type: SimBlockType2,
  state: BlockState,
  input: Types2UseInput,
): Types2UseResult {
  const name = block.displayName;
  const { pos } = input;
  const set = (next: BlockState | null): BlockChange[] =>
    world.set(pos, next) ? [{ pos, state: next }] : [];
  switch (type) {
    case 'cake': {
      const bites = Number(state.properties.bites ?? 0);
      const food = block.types2?.food;
      const changes =
        bites >= CAKE_MAX_BITES
          ? set(null)
          : set(catalogue.withProperties(state, { bites: String(bites + 1) }));
      const left = CAKE_MAX_BITES - bites;
      return {
        handled: true,
        changes,
        ate: true,
        message: `You ate a slice of ${name}; ${left === 0 ? 'it is all gone' : `${left} ${left === 1 ? 'slice is' : 'slices are'} left`}.`,
        onlyInMinecraft: `eating ${name} fills ${food?.nutrition ?? 2} hunger and ${food?.saturation ?? 0.1} saturation (the preview has no hunger)`,
      };
    }
    case 'berry_bush': {
      const age = Number(state.properties.age ?? 0);
      const berry = block.types2?.berry;
      if (age < 2 || berry === undefined) return NOT_TAKEN;
      const count = between(age >= 3 ? berry.full : berry.ripe, input.random);
      return {
        handled: true,
        changes: set(catalogue.withProperties(state, { age: '1' })),
        give: { id: berry.item, count },
        message: `You picked ${count} from ${name}.`,
        ...(berry.hurts
          ? { onlyInMinecraft: `${name} scratches and slows whoever walks through it` }
          : {}),
      };
    }
    case 'candle': {
      // A held candle adds one instead (the item's own placing); a hand puts it out or lights it.
      if (input.item !== undefined) return NOT_TAKEN;
      if (isWater(state)) {
        return { handled: true, changes: [], message: `${name} cannot be lit under water.` };
      }
      const lit = state.properties.lit === 'true';
      return {
        handled: true,
        changes: set(catalogue.withProperties(state, { lit: String(!lit) })),
        message: lit ? `You put ${name} out.` : `You lit ${name}.`,
        ...(lit
          ? {}
          : {
              onlyInMinecraft: `lighting ${name} needs flint and steel or a fire charge; the preview lights it by hand`,
            }),
      };
    }
    case 'sign':
    case 'hanging_sign': {
      if (input.waxed === true) {
        return {
          handled: true,
          changes: [],
          message: `${name} is waxed; its text cannot be changed.`,
        };
      }
      return {
        handled: true,
        changes: [],
        editSign: { pos, side: signSideFor(state, input.yaw) },
      };
    }
    case 'bed':
      return {
        handled: true,
        changes: [],
        message: `You lay down in ${name}.`,
        onlyInMinecraft: `sleeping in ${name}: the night passes, your spawn point is set, and in the Nether or the End the bed explodes`,
      };
    case 'potted_plant':
      return {
        handled: true,
        changes: [],
        onlyInMinecraft: `taking the plant out of ${name} with an empty hand`,
      };
    default:
      return NOT_TAKEN;
  }
}
