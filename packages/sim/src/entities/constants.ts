/**
 * The numbers of the Try it mobs (plan B393, limit L3). Mobs only wander: every number here is a
 * Try it choice or an approximation of what can be observed in the game, never a value taken from
 * game code. Distances are in blocks, speeds in blocks per tick, times in ticks (20 a second).
 */

/** The most mobs the area holds at once (a Try it choice, for drawing speed). */
export const ENTITY_CAP = 24;

/** The `movement_speed` a definition without `msm:movement.speed` has (the format's default). */
export const DEFAULT_MOVEMENT_SPEED = 0.25;
/** The `flying_speed` a flyer without one has (the format's default, a parrot's). */
export const DEFAULT_FLYING_SPEED = 0.4;
/** The step height a mob without `step_height` has (the format's default). */
export const DEFAULT_STEP_HEIGHT = 0.6;

/**
 * Blocks per tick a wandering mob settles at for each point of its speed attribute: a mob of 0.25
 * strolls at about 2.5 blocks a second (approximation of a stroll, not of a chase).
 */
export const WANDER_SPEED_PER_POINT = 0.5;
/** The fastest a wandering mob goes, whatever its attribute (a Try it choice). */
export const MAX_WANDER_SPEED = 0.4;

/** Ticks a mob stands still between walks, at least and at most (approximation). */
export const IDLE_TICKS_MIN = 40;
export const IDLE_TICKS_MAX = 120;
/** Ticks one walk lasts, at least and at most (approximation). */
export const WALK_TICKS_MIN = 20;
export const WALK_TICKS_MAX = 80;

/** How high above the ground below it a flyer picks its height, at least and at most (Try it choice). */
export const HOVER_MIN = 1.5;
export const HOVER_MAX = 4;
/** The vertical speed a flyer settles at while it changes height (approximation). */
export const FLY_CLIMB_SPEED = 0.1;
/** The share of a flyer's speed kept each tick, on every axis (approximation). */
export const FLY_FRICTION = 0.91;

/** A mob that moved less than this along the ground in a tick is standing, not walking. */
export const WALKING_THRESHOLD = 0.01;
