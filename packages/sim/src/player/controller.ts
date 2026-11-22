/**
 * The Try it player (plan B388): position, velocity, standing on the ground, walking, jumping,
 * sneaking and flying, stepped 20 times a second, with the values the view needs to draw in
 * between ticks. Movement is approximate (ADR 0085 D5, limit L2): no sprinting, no water, ice or
 * slime, and sneaking is slower walking without edge safety; ladders, vines and scaffolding are
 * climbed (B463, `blocks/types2/climb.ts`). Pure and deterministic.
 */

import {
  type ClimbCheck,
  climbAfterMove,
  climbingVelocity,
  onClimbable,
} from '../blocks/types2/climb.js';
import type { BlockPos, BlockShapes, BlockState, PlayerAction, Vec3 } from '../types.js';
import {
  type BlockLookup,
  boxesOverlap,
  moveWithStep,
  offsetBox,
  type WorldBox,
} from './collide.js';
import {
  AIR_FRICTION,
  AIR_SPEED,
  accelerationFor,
  EYE_HEIGHT,
  FLY_SPEED,
  FLY_VERTICAL_DRAG,
  FLY_VERTICAL_SPEED,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_VELOCITY,
  MAX_PITCH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  REACH,
  REST_SPEED,
  SNEAK_EYE_HEIGHT,
  SNEAK_FACTOR,
  STEP_HEIGHT,
  VERTICAL_DRAG,
  WALK_SPEED,
} from './constants.js';
import { lookDirection, type PickResult, pick } from './pick.js';

/** One tick of input: `PlayerAction`'s `move` without its `type`. */
export type PlayerInput = Omit<Extract<PlayerAction, { type: 'move' }>, 'type'>;

/** Input that does nothing: standing still, looking south and level. */
export const IDLE_INPUT: PlayerInput = {
  forward: 0,
  strafe: 0,
  jump: false,
  sneak: false,
  toggleFly: false,
  yaw: 0,
  pitch: 0,
};

/** What the view needs to draw the player and its camera between two ticks. */
export interface PlayerView {
  /** Where the feet are now (after the last tick). */
  readonly position: Vec3;
  /** Where the feet were one tick before. */
  readonly previousPosition: Vec3;
  /** The eye height above the feet now (lower while sneaking). */
  readonly eyeHeight: number;
  /** The eye height above the feet one tick before. */
  readonly previousEyeHeight: number;
  /** The look of the last tick, in degrees (0 faces south, 90 faces west; negative pitch is up). */
  readonly yaw: number;
  readonly pitch: number;
  readonly onGround: boolean;
  readonly flying: boolean;
  readonly sneaking: boolean;
}

const ACCEL_WALK = accelerationFor(WALK_SPEED, GROUND_FRICTION);
const ACCEL_AIR = accelerationFor(AIR_SPEED, AIR_FRICTION);
const ACCEL_FLY = accelerationFor(FLY_SPEED, AIR_FRICTION);
const ACCEL_FLY_VERTICAL = accelerationFor(FLY_VERTICAL_SPEED, FLY_VERTICAL_DRAG);

/** Interpolates two numbers: `alpha` 0 gives `a`, 1 gives `b`. */
function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

/** Interpolates two points. */
export function lerpVec(a: Vec3, b: Vec3, alpha: number): Vec3 {
  return { x: lerp(a.x, b.x, alpha), y: lerp(a.y, b.y, alpha), z: lerp(a.z, b.z, alpha) };
}

/** Clamps a number into a range; NaN becomes `lo`. */
function clamp(v: number, lo: number, hi: number): number {
  if (!(v >= lo)) return lo;
  return Math.min(v, hi);
}

/** The player's collision box with its feet at `position`. */
export function playerBox(position: Vec3): WorldBox {
  const h = PLAYER_WIDTH / 2;
  return [
    position.x - h,
    position.y,
    position.z - h,
    position.x + h,
    position.y + PLAYER_HEIGHT,
    position.z + h,
  ];
}

/**
 * The player of the Try it area. Create it with a way to read blocks and their shapes, then call
 * `step` once a tick with that tick's input.
 */
export class PlayerController {
  private readonly lookup: BlockLookup;
  private readonly shapes: BlockShapes;
  private pos: Vec3;
  private prevPos: Vec3;
  private vel: Vec3 = { x: 0, y: 0, z: 0 };
  private ground = false;
  private fly = false;
  private sneak = false;
  /** The sneaking of a use being decided late ({@link asOfUse}); null otherwise. */
  private sneakAsOfUse: boolean | null = null;
  private eye = EYE_HEIGHT;
  private prevEye = EYE_HEIGHT;
  private yawDeg = 0;
  private pitchDeg = 0;
  private ticks = 0;
  private climbable: ClimbCheck = () => false;

  constructor(lookup: BlockLookup, shapes: BlockShapes, start: Vec3) {
    this.lookup = lookup;
    this.shapes = shapes;
    this.pos = { ...start };
    this.prevPos = { ...start };
  }

  /** Where the feet are now. */
  get position(): Vec3 {
    return this.pos;
  }

  /** Where the feet were one tick before. */
  get previousPosition(): Vec3 {
    return this.prevPos;
  }

  /** The speed in blocks per tick. */
  get velocity(): Vec3 {
    return this.vel;
  }

  get onGround(): boolean {
    return this.ground;
  }

  get flying(): boolean {
    return this.fly;
  }

  get sneaking(): boolean {
    return this.sneakAsOfUse ?? this.sneak;
  }

  /**
   * Runs `run` with {@link sneaking} as `sneaking`: a use that waited for the scripts' answer is
   * decided with the sneaking of the moment it was made, as the game decides it in that tick.
   */
  asOfUse<T>(sneaking: boolean, run: () => T): T {
    const before = this.sneakAsOfUse;
    this.sneakAsOfUse = sneaking;
    try {
      return run();
    } finally {
      this.sneakAsOfUse = before;
    }
  }

  get yaw(): number {
    return this.yawDeg;
  }

  get pitch(): number {
    return this.pitchDeg;
  }

  /** How many ticks have been stepped. */
  get tick(): number {
    return this.ticks;
  }

  /** The player's collision box now. */
  get box(): WorldBox {
    return playerBox(this.pos);
  }

  /** Puts the player somewhere at once, still, with nothing to draw in between. */
  teleport(position: Vec3): void {
    this.pos = { ...position };
    this.prevPos = { ...position };
    this.vel = { x: 0, y: 0, z: 0 };
    this.ground = false;
  }

  /** Which blocks can be climbed (B463: ladders, vines, scaffolding); none by default. */
  setClimbable(check: ClimbCheck): void {
    this.climbable = check;
  }

  /** Whether the player is on something climbable now (and not flying). */
  get climbing(): boolean {
    return !this.fly && onClimbable(this.climbable, playerBox(this.pos));
  }

  /** Turns flying on or off directly (the `toggleFly` input does the same once a press). */
  setFlying(flying: boolean): void {
    this.fly = flying;
    if (flying) this.vel = { ...this.vel, y: 0 };
  }

  /**
   * Pushes the player (the `launch` action, B396): `velocity` in blocks per tick replaces the
   * current speed, or adds to it with `add`; an upward push lifts it off the ground.
   */
  launch(velocity: Vec3, add = false): void {
    this.vel = add
      ? { x: this.vel.x + velocity.x, y: this.vel.y + velocity.y, z: this.vel.z + velocity.z }
      : { ...velocity };
    if (this.vel.y > 0) this.ground = false;
  }

  /** Steps one tick (a twentieth of a second) with this tick's input. */
  step(input: PlayerInput): void {
    this.prevPos = this.pos;
    this.prevEye = this.eye;
    this.yawDeg = Number.isFinite(input.yaw) ? input.yaw : this.yawDeg;
    this.pitchDeg = clamp(input.pitch, -MAX_PITCH, MAX_PITCH);
    if (input.toggleFly) this.setFlying(!this.fly);
    this.sneak = input.sneak && !this.fly;
    this.eye = this.sneak ? SNEAK_EYE_HEIGHT : EYE_HEIGHT;

    // Input as a horizontal wish, at most one long.
    let f = clamp(input.forward, -1, 1);
    let s = clamp(input.strafe, -1, 1);
    const wish = Math.hypot(f, s);
    if (wish > 1) {
      f /= wish;
      s /= wish;
    }
    const yr = (this.yawDeg * Math.PI) / 180;
    const sin = Math.sin(yr);
    const cos = Math.cos(yr);
    // Forward is (-sin, cos) and right is (-cos, -sin) on x and z.
    const wx = -sin * f - cos * s;
    const wz = cos * f - sin * s;

    let vx = this.vel.x;
    let vy = this.vel.y;
    let vz = this.vel.z;
    let friction: number;
    if (this.fly) {
      vx += wx * ACCEL_FLY;
      vz += wz * ACCEL_FLY;
      const up = (input.jump ? 1 : 0) - (input.sneak ? 1 : 0);
      vy += up * ACCEL_FLY_VERTICAL;
      friction = AIR_FRICTION;
    } else {
      if (input.jump && this.ground) vy = JUMP_VELOCITY;
      const accel = this.ground ? ACCEL_WALK : ACCEL_AIR;
      const factor = this.sneak ? SNEAK_FACTOR : 1;
      vx += wx * accel * factor;
      vz += wz * accel * factor;
      friction = this.ground ? GROUND_FRICTION : AIR_FRICTION;
    }
    const climbing = this.climbing;
    if (climbing) ({ vx, vy, vz } = climbingVelocity(vx, vy, vz, this.sneak));

    const moved = moveWithStep(
      this.lookup,
      this.shapes,
      playerBox(this.pos),
      vx,
      vy,
      vz,
      this.fly ? 0 : STEP_HEIGHT,
      this.ground,
    );
    this.pos = { x: this.pos.x + moved.dx, y: this.pos.y + moved.dy, z: this.pos.z + moved.dz };
    if (moved.stoppedX) vx = 0;
    if (moved.stoppedZ) vz = 0;
    if (moved.stoppedY) vy = 0;
    if (climbing) vy = climbAfterMove(vy, moved.stoppedX || moved.stoppedZ, input.jump);
    this.ground = moved.landed;
    // Coming down onto the ground ends flying, as in the game's creative flight.
    if (this.fly && this.ground) this.fly = false;

    if (this.fly) {
      vy *= FLY_VERTICAL_DRAG;
    } else {
      vy = (vy - GRAVITY) * VERTICAL_DRAG;
    }
    vx *= friction;
    vz *= friction;
    if (Math.abs(vx) < REST_SPEED) vx = 0;
    if (Math.abs(vz) < REST_SPEED) vz = 0;
    if (this.fly && Math.abs(vy) < REST_SPEED) vy = 0;
    this.vel = { x: vx, y: vy, z: vz };
    this.ticks++;
  }

  /** The feet between the last two ticks: `alpha` 0 is one tick ago, 1 is now. */
  interpolatedPosition(alpha: number): Vec3 {
    return lerpVec(this.prevPos, this.pos, clamp(alpha, 0, 1));
  }

  /** The eye between the last two ticks, for the camera. */
  eyePosition(alpha = 1): Vec3 {
    const a = clamp(alpha, 0, 1);
    const feet = this.interpolatedPosition(a);
    return { x: feet.x, y: feet.y + lerp(this.prevEye, this.eye, a), z: feet.z };
  }

  /** The drawing values of the last two ticks. */
  view(): PlayerView {
    return {
      position: this.pos,
      previousPosition: this.prevPos,
      eyeHeight: this.eye,
      previousEyeHeight: this.prevEye,
      yaw: this.yawDeg,
      pitch: this.pitchDeg,
      onGround: this.ground,
      flying: this.fly,
      sneaking: this.sneak,
    };
  }

  /**
   * The block the player points at from the eye, within the reach. The look defaults to the last
   * tick's; the view passes its own, smoother look and `alpha` to match what it draws.
   */
  pick(alpha = 1, yaw = this.yawDeg, pitch = this.pitchDeg, reach = REACH): PickResult | null {
    return pick(
      this.lookup,
      this.shapes,
      this.eyePosition(alpha),
      lookDirection(yaw, pitch),
      reach,
    );
  }

  /**
   * True when a block of `state` at `pos` would overlap the player, so the view can refuse to
   * place it there.
   */
  wouldOverlap(pos: BlockPos, state: BlockState): boolean {
    const me = playerBox(this.pos);
    return this.shapes
      .collision(state)
      .some((b) => boxesOverlap(me, offsetBox(b, pos.x, pos.y, pos.z)));
  }
}
