/**
 * One mob in the Try it area (B393): its position, facing, speed and whether it walks, stepped
 * once a tick with its wander. Walkers fall and walk up ledges as the player does, through the
 * same collision code (`player/collide.ts`); flyers have no gravity and hold the height their
 * wander picks; swimmers stand. Mobs collide with blocks and the area's walls, not with each other
 * or the player (approximation, limit L3).
 */
import {
  AREA_WALLS,
  type BlockLookup,
  boxesOverlap,
  collectObstacles,
  moveWithStep,
  type WorldBox,
} from '../player/collide.js';
import {
  accelerationFor,
  GRAVITY,
  GROUND_FRICTION,
  REST_SPEED,
  VERTICAL_DRAG,
} from '../player/constants.js';
import { AREA_SIZE_Y, type BlockShapes, type EntitySnapshot, type Vec3 } from '../types.js';
import type { CatalogueEntity } from './catalogue.js';
import {
  FLY_CLIMB_SPEED,
  FLY_FRICTION,
  MAX_WANDER_SPEED,
  WALKING_THRESHOLD,
  WANDER_SPEED_PER_POINT,
} from './constants.js';
import { SimRandom, Wander, type WanderStyle } from './wander.js';

/** The wander style of a movement mode: flyers fly, swimmers stand, the rest walk. */
export function wanderStyleFor(entity: CatalogueEntity): WanderStyle {
  if (entity.mode === 'fly') return 'fly';
  if (entity.mode === 'swim') return 'still';
  return 'walk';
}

/** The speed a mob strolls at, in blocks per tick (approximation, see `constants.ts`). */
export function wanderSpeedFor(entity: CatalogueEntity): number {
  const attribute = entity.mode === 'fly' ? entity.flyingSpeed : entity.speed;
  return Math.min(MAX_WANDER_SPEED, attribute * WANDER_SPEED_PER_POINT);
}

/** A mob's collision box with its feet at `position`. */
export function entityBox(
  entity: Pick<CatalogueEntity, 'width' | 'height'>,
  position: Vec3,
): WorldBox {
  const h = entity.width / 2;
  return [
    position.x - h,
    position.y,
    position.z - h,
    position.x + h,
    position.y + entity.height,
    position.z + h,
  ];
}

/** The obstacles of blocks only (no area walls) that overlap a box. */
function overlappingBlocks(lookup: BlockLookup, shapes: BlockShapes, box: WorldBox): WorldBox[] {
  return collectObstacles(lookup, shapes, box)
    .slice(AREA_WALLS.length)
    .filter((obstacle) => boxesOverlap(box, obstacle));
}

/**
 * The height of the ground under a point: the top of the highest collision box in the column at
 * or below `y`, or 0 (the area's floor).
 */
export function groundBelow(lookup: BlockLookup, shapes: BlockShapes, at: Vec3): number {
  const x = Math.floor(at.x);
  const z = Math.floor(at.z);
  for (let y = Math.min(AREA_SIZE_Y - 1, Math.floor(at.y)); y >= 0; y--) {
    const state = lookup(x, y, z);
    if (state === null) continue;
    const boxes = shapes.collision(state);
    let top = Number.NEGATIVE_INFINITY;
    for (const b of boxes) {
      if (y + b[4] <= at.y + 1e-6 && b[4] > top) top = b[4];
    }
    if (top !== Number.NEGATIVE_INFINITY) return y + top;
  }
  return 0;
}

/** A mob in the area. */
export class SimEntity {
  /** A number that stays the same while the mob exists. */
  readonly id: number;
  private kindNow: CatalogueEntity;
  private wander: Wander;
  private pos: Vec3;
  private prevPos: Vec3;
  private vel: Vec3 = { x: 0, y: 0, z: 0 };
  private yawDeg: number;
  private ground = false;
  private walkingNow = false;
  private blocked = false;

  constructor(id: number, kind: CatalogueEntity, position: Vec3, seed: number) {
    this.id = id;
    this.kindNow = kind;
    this.pos = { ...position };
    this.prevPos = { ...position };
    const random = new SimRandom(seed);
    this.yawDeg = Math.floor(random.next() * 360);
    this.wander = new Wander(random, wanderStyleFor(kind));
  }

  /** What kind of mob it is. */
  get kind(): CatalogueEntity {
    return this.kindNow;
  }

  /** Where its feet are now. */
  get position(): Vec3 {
    return this.pos;
  }

  /** Where its feet were one tick before. */
  get previousPosition(): Vec3 {
    return this.prevPos;
  }

  /** Its speed in blocks per tick. */
  get velocity(): Vec3 {
    return this.vel;
  }

  /** The way it faces, in degrees (0 faces south, 90 faces west). */
  get yaw(): number {
    return this.yawDeg;
  }

  get onGround(): boolean {
    return this.ground;
  }

  /** True when it moved along the ground (or through the air) in the last tick. */
  get walking(): boolean {
    return this.walkingNow;
  }

  /** Its collision box now, in world coordinates. */
  get box(): WorldBox {
    return entityBox(this.kindNow, this.pos);
  }

  /**
   * Takes a new definition of the same type after a live edit (ADR 0085 D4). The mob keeps its
   * place; its wander starts again when the way it moves changed.
   */
  updateKind(kind: CatalogueEntity, seed: number): void {
    const restyle = wanderStyleFor(kind) !== wanderStyleFor(this.kindNow);
    this.kindNow = kind;
    if (restyle) this.wander = new Wander(new SimRandom(seed), wanderStyleFor(kind));
  }

  /**
   * Lifts the mob out of blocks it is inside (a block placed into it, or a spawn against a
   * slab), at most a few blocks; true when it is free afterwards.
   */
  unstick(lookup: BlockLookup, shapes: BlockShapes): boolean {
    for (let tries = 0; tries < 4; tries++) {
      const inside = overlappingBlocks(lookup, shapes, this.box);
      if (inside.length === 0) return true;
      const top = Math.max(...inside.map((obstacle) => obstacle[4]));
      this.pos = { ...this.pos, y: top };
      this.prevPos = { ...this.prevPos, y: Math.max(this.prevPos.y, top) };
    }
    return overlappingBlocks(lookup, shapes, this.box).length === 0;
  }

  /**
   * Pushes the mob (the `launch` action, B396): `velocity` in blocks per tick replaces its speed,
   * or adds to it with `add`.
   */
  launch(velocity: Vec3, add = false): void {
    this.vel = add
      ? { x: this.vel.x + velocity.x, y: this.vel.y + velocity.y, z: this.vel.z + velocity.z }
      : { ...velocity };
    if (this.vel.y > 0) this.ground = false;
  }

  /** Steps one tick (a twentieth of a second). */
  step(lookup: BlockLookup, shapes: BlockShapes): void {
    this.prevPos = this.pos;
    this.unstick(lookup, shapes);
    const kind = this.kindNow;
    const intent = this.wander.next(this.blocked, groundBelow(lookup, shapes, this.pos));
    const speed = wanderSpeedFor(kind);
    const flying = wanderStyleFor(kind) === 'fly';

    let vx = this.vel.x;
    let vy = this.vel.y;
    let vz = this.vel.z;
    let friction: number;
    if (flying) {
      const accel = accelerationFor(speed, FLY_FRICTION);
      vx += intent.dirX * accel;
      vz += intent.dirZ * accel;
      if (intent.walking || kind.hovers) {
        const wanted = Math.min(intent.height ?? this.pos.y, AREA_SIZE_Y - kind.height);
        const diff = wanted - this.pos.y;
        vy = Math.max(-FLY_CLIMB_SPEED, Math.min(FLY_CLIMB_SPEED, diff * 0.2));
      } else {
        // A flyer that does not hover settles on the ground while it stands.
        vy = this.ground ? 0 : -FLY_CLIMB_SPEED;
      }
      friction = FLY_FRICTION;
    } else {
      const accel = this.ground ? accelerationFor(speed, GROUND_FRICTION) : 0;
      vx += intent.dirX * accel;
      vz += intent.dirZ * accel;
      friction = this.ground ? GROUND_FRICTION : FLY_FRICTION;
    }

    const moved = moveWithStep(
      lookup,
      shapes,
      this.box,
      vx,
      vy,
      vz,
      flying ? 0 : kind.stepHeight,
      this.ground,
    );
    this.pos = { x: this.pos.x + moved.dx, y: this.pos.y + moved.dy, z: this.pos.z + moved.dz };
    this.blocked = intent.walking && (moved.stoppedX || moved.stoppedZ);
    if (moved.stoppedX) vx = 0;
    if (moved.stoppedZ) vz = 0;
    if (moved.stoppedY) vy = 0;
    this.ground = moved.landed;

    if (!flying) vy = (vy - GRAVITY) * VERTICAL_DRAG;
    vx *= friction;
    vz *= friction;
    if (Math.abs(vx) < REST_SPEED) vx = 0;
    if (Math.abs(vz) < REST_SPEED) vz = 0;
    if (flying && Math.abs(vy) < REST_SPEED) vy = 0;
    this.vel = { x: vx, y: vy, z: vz };

    const dx = this.pos.x - this.prevPos.x;
    const dz = this.pos.z - this.prevPos.z;
    this.walkingNow = Math.hypot(dx, dz) > WALKING_THRESHOLD;
    if (this.walkingNow) this.yawDeg = (Math.atan2(-dx, dz) * 180) / Math.PI;
  }

  /** The snapshot the view draws (pitch is always level). */
  snapshot(): EntitySnapshot {
    return {
      id: this.id,
      type: this.kindNow.id,
      position: this.pos,
      previousPosition: this.prevPos,
      yaw: this.yawDeg,
      pitch: 0,
      walking: this.walkingNow,
    };
  }
}
