/**
 * The movement numbers of the Try it player (ADR 0085 D5, plan limit L2). Every number here is an
 * approximation chosen to match what can be observed in the game (speeds in blocks per second,
 * a jump of about 1.25 blocks, a reach of 4.5 blocks); none is taken from game code. Distances are
 * in blocks, speeds in blocks per tick, and the simulation steps 20 ticks a second.
 */

/** Ticks a second; one call of `PlayerController.step` is one tick. */
export const TICKS_PER_SECOND = 20;

/** The player's box width along x and z (approximation). */
export const PLAYER_WIDTH = 0.6;
/** The player's box height (approximation). */
export const PLAYER_HEIGHT = 1.8;
/** The eye height above the feet when standing (approximation). */
export const EYE_HEIGHT = 1.62;
/** The eye height above the feet when sneaking; the box itself keeps its height (approximation). */
export const SNEAK_EYE_HEIGHT = 1.27;

/** Downward acceleration each tick while not flying (approximation). */
export const GRAVITY = 0.08;
/** The share of vertical speed kept each tick while falling or jumping (approximation). */
export const VERTICAL_DRAG = 0.98;
/** The upward speed a jump starts with; with the two numbers above it gives about 1.25 blocks (approximation). */
export const JUMP_VELOCITY = 0.42;

/** The highest ledge the player walks up without jumping, enough for a slab or a stair (approximation). */
export const STEP_HEIGHT = 0.6;

/** The share of horizontal speed kept each tick on the ground (approximation). */
export const GROUND_FRICTION = 0.546;
/** The share of horizontal speed kept each tick in the air and while flying (approximation). */
export const AIR_FRICTION = 0.91;

/** The walking speed the player settles at on the ground: about 4.3 blocks a second (approximation). */
export const WALK_SPEED = 0.216;
/** The horizontal speed the player settles at in the air without flying (approximation). */
export const AIR_SPEED = 0.2;
/** Sneaking walks at this share of the usual speed; there is no edge safety (approximation). */
export const SNEAK_FACTOR = 0.3;

/** The horizontal speed the player settles at while flying: about 10.9 blocks a second (approximation). */
export const FLY_SPEED = 0.546;
/** The vertical speed the player settles at while flying up or down: about 7.5 blocks a second (approximation). */
export const FLY_VERTICAL_SPEED = 0.375;
/** The share of vertical speed kept each tick while flying (approximation). */
export const FLY_VERTICAL_DRAG = 0.6;

/** How far the player can point at a block, measured from the eye (approximation). */
export const REACH = 4.5;

/**
 * How far above the area's top the invisible ceiling sits, so a flying player can look down on the
 * whole area but not leave it (a Try it choice, not a game number).
 */
export const CEILING_MARGIN = 8;

/** The pitch is held within this many degrees up or down. */
export const MAX_PITCH = 90;

/** A speed below this is treated as standing still, so the player does not creep forever. */
export const REST_SPEED = 0.003;

/**
 * The per-tick acceleration that settles at `speed` with the given friction. Each tick the player
 * moves by `v + a` and keeps `(v + a) * friction`, so the distance moved a tick settles at
 * `a / (1 - friction)`.
 */
export function accelerationFor(speed: number, friction: number): number {
  return speed * (1 - friction);
}
