/**
 * The vehicles' own physics, the TypeScript twin of the runtime's pure `VehiclePhysics` (ADR 0090
 * D3, ADR 0091 D6, B428). One tick of one vehicle from its constants, its state, the driver's
 * input and two facts about where it is; no world access and no randomness, so it gives the
 * runtime's numbers for the same inputs (`fixtures/vehicle-physics/golden.json`, compared within
 * 1e-5 by `test/vehicles/golden.test.ts`). Collision is not done here: the world (the game, or
 * {@link VehicleWorld} in Try it) applies the velocity with its own collision afterwards.
 *
 * Written from the ADR and the golden's README (`fixtures/vehicle-physics/README.md`), which
 * states every rule; every constant is MSM's own. Angles are degrees as the game's: yaw 0 faces
 * south (+z) and grows turning right, so the facing is `(-sin yaw, 0, cos yaw)`; pitch is
 * positive looking down. Speeds are blocks per tick. Angles are never normalised.
 *
 * Change the rules only together with the runtime's `VehiclePhysics` and record the change in
 * ADR 0090.
 */

/** How a vehicle moves (`movement.mode`, ADR 0090 D3). */
export type VehicleMode = 'ground' | 'water' | 'amphibious' | 'air' | 'hover';

/** The five modes, in the format's order. */
export const VEHICLE_MODES: readonly VehicleMode[] = Object.freeze([
  'ground',
  'water',
  'amphibious',
  'air',
  'hover',
]);

// MSM's own constants (ADR 0090 D3), named as the runtime's.

/** Downward pull per tick while nothing holds the vehicle up. */
const GRAVITY = 0.04;
/** Velocity kept per tick in the air. */
const AIR_DRAG = 0.98;
/** Speed kept per tick on land without throttle (rolling resistance). */
const GROUND_COAST = 0.95;
/** Speed kept per tick on water without throttle. */
const WATER_COAST = 0.97;
/** Share of top speed and acceleration out of its element: a boat on land, a floating car on water. */
const OUT_OF_ELEMENT = 0.1;
/** Water deeper than this under a grounded land vehicle counts as water; shallower water is driven through. */
const WADE_DEPTH = 0.5;
/** How deep below the waterline a floating hull rests, in blocks. */
const DRAFT = 0.12;
/** Upward push per tick for each block the hull sits deeper than {@link DRAFT}. */
const BUOYANCY = 0.1;
/** The largest upward push per tick. */
const MAX_BUOYANCY = 0.1;
/** Vertical speed kept per tick while floating (the bobbing dies down). */
const WATER_DAMPING = 0.75;
/** Downward pull per tick of a vehicle that sinks. */
const SINK_GRAVITY = 0.02;
/** Velocity kept per tick while sinking. */
const SINK_DRAG = 0.8;
/** On water the velocity turns this share of the way towards the facing each tick (boats drift). */
const WATER_GRIP = 0.35;
/** Turning reaches its full rate at this share of top speed; below it the rate scales with speed. */
const FULL_TURN_SHARE = 0.5;
/** On water a powered hull turns at least at this share of its rate, even standing still. */
const WATER_MIN_TURN = 0.3;
/** Throttle change per tick while forwards or back is held (`air`). */
const THROTTLE_STEP = 0.05;
/** The steepest climb or dive of a plane, in degrees. */
const MAX_VEHICLE_PITCH = 40;
/** Share of a plane's sink kept per tick once it flies at `takeoff_speed` or faster. */
const STALL_RECOVERY = 0.8;
/** The vertical speed an unpowered hovering vehicle sinks at. */
const HOVER_SINK = 0.05;
/** How fast an unpowered hovering vehicle reaches {@link HOVER_SINK}, per tick. */
const HOVER_SINK_STEP = 0.01;
/** Horizontal speed kept per tick by an unpowered hovering vehicle. */
const HOVER_COAST = 0.9;
/** Speeds below this become 0. */
const STOP = 0.001;

/** MSM's own physics constants, by the runtime's names (for tests and the dashboard). */
export const VEHICLE_PHYSICS_CONSTANTS = Object.freeze({
  GRAVITY,
  AIR_DRAG,
  GROUND_COAST,
  WATER_COAST,
  OUT_OF_ELEMENT,
  WADE_DEPTH,
  DRAFT,
  BUOYANCY,
  MAX_BUOYANCY,
  WATER_DAMPING,
  SINK_GRAVITY,
  SINK_DRAG,
  WATER_GRIP,
  FULL_TURN_SHARE,
  WATER_MIN_TURN,
  THROTTLE_STEP,
  MAX_VEHICLE_PITCH,
  STALL_RECOVERY,
  HOVER_SINK,
  HOVER_SINK_STEP,
  HOVER_COAST,
  STOP,
});

/** `reverse_factor`, `grip` and `lift_speed` defaults of every mode. */
export const DEFAULT_VEHICLE_REVERSE_FACTOR = 0.4;
export const DEFAULT_VEHICLE_GRIP = 0.8;
export const DEFAULT_VEHICLE_LIFT_SPEED = 0.15;

/** Defaults by mode (ADR 0090 D2, D3; `vehicle.mcdoc`). */
export interface ModeDefaults {
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly braking: number;
  readonly turnRate: number;
  readonly stepHeight: number;
}

export const MODE_DEFAULTS: Readonly<Record<VehicleMode, ModeDefaults>> = Object.freeze({
  ground: { maxSpeed: 0.4, acceleration: 0.02, braking: 0.04, turnRate: 5, stepHeight: 1 },
  water: { maxSpeed: 0.35, acceleration: 0.015, braking: 0.03, turnRate: 4, stepHeight: 0 },
  amphibious: { maxSpeed: 0.4, acceleration: 0.02, braking: 0.04, turnRate: 5, stepHeight: 1 },
  air: { maxSpeed: 1.2, acceleration: 0.03, braking: 0.03, turnRate: 3, stepHeight: 0.5 },
  hover: { maxSpeed: 0.5, acceleration: 0.04, braking: 0.06, turnRate: 8, stepHeight: 0 },
});

/** A `movement` block as written in a vehicle definition; absent fields take the defaults. */
export interface MovementSpec {
  readonly mode: VehicleMode;
  readonly max_speed?: number;
  readonly reverse_factor?: number;
  readonly acceleration?: number;
  readonly braking?: number;
  readonly turn_rate?: number;
  readonly turns_in_place?: boolean;
  readonly step_height?: number;
  readonly grip?: number;
  readonly lift_speed?: number;
  readonly takeoff_speed?: number;
  readonly floats?: boolean;
}

/** One vehicle type's movement, every default resolved. */
export interface VehicleConstants {
  readonly mode: VehicleMode;
  readonly maxSpeed: number;
  readonly reverseFactor: number;
  readonly acceleration: number;
  readonly braking: number;
  readonly turnRate: number;
  readonly turnsInPlace: boolean;
  readonly stepHeight: number;
  readonly grip: number;
  readonly liftSpeed: number;
  readonly takeoffSpeed: number;
  readonly floats: boolean;
}

/** Resolves a `movement` block's absent values by mode (`VehiclePhysics.Constants.resolve`). */
export function resolveMovement(movement: MovementSpec): VehicleConstants {
  const d = MODE_DEFAULTS[movement.mode];
  const max = movement.max_speed ?? d.maxSpeed;
  return Object.freeze({
    mode: movement.mode,
    maxSpeed: max,
    reverseFactor: movement.reverse_factor ?? DEFAULT_VEHICLE_REVERSE_FACTOR,
    acceleration: movement.acceleration ?? d.acceleration,
    braking: movement.braking ?? d.braking,
    turnRate: movement.turn_rate ?? d.turnRate,
    turnsInPlace: movement.turns_in_place === true,
    stepHeight: movement.step_height ?? d.stepHeight,
    grip: movement.grip ?? DEFAULT_VEHICLE_GRIP,
    liftSpeed: movement.lift_speed ?? DEFAULT_VEHICLE_LIFT_SPEED,
    takeoffSpeed: movement.takeoff_speed ?? max / 2,
    floats: movement.floats === true,
  });
}

/**
 * The driver's input. `up` is jump, `down` the "Vehicle: descend" key (ADR 0088 D5); `viewYaw`
 * and `viewPitch` the driver's look, which `air` and `hover` follow.
 */
export interface VehicleInput {
  readonly forward: boolean;
  readonly back: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly viewYaw: number;
  readonly viewPitch: number;
}

/** No keys, looking where the vehicle faces (no driver). */
export function idleVehicleInput(yaw: number, pitch: number): VehicleInput {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false,
    viewYaw: yaw,
    viewPitch: pitch,
  };
}

/**
 * Where the vehicle is: standing on a block (after the last move), how far the bottom of the
 * hitbox is below the water surface (0 out of water), and whether the engine gives thrust (a
 * driver sits in the first seat and the vehicle needs no fuel or has some).
 */
export interface VehicleEnv {
  readonly onGround: boolean;
  readonly waterDepth: number;
  readonly engine: boolean;
}

/**
 * The vehicle's state. `vx`, `vy`, `vz`, `yaw`, `pitch` and `throttle` are read and written;
 * `speed` (along the facing, negative in reverse) and `steering` (-1 left to 1 right) are only
 * written. `throttle` is the plane's lever (0 to 1) for `air`, and the engine's effort (-1 to 1)
 * for the others.
 */
export interface VehicleState {
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly throttle: number;
  readonly speed: number;
  readonly steering: number;
}

/** A still vehicle facing `yaw`. */
export function vehicleStateAt(yaw: number): VehicleState {
  return { vx: 0, vy: 0, vz: 0, yaw, pitch: 0, throttle: 0, speed: 0, steering: 0 };
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** `value` clamped to `min..max` (as the runtime's `clamp`). */
export function clampTo(value: number, min: number, max: number): number {
  return value < min ? min : Math.min(value, max);
}

/** An angle in degrees brought into [-180, 180) (`%` truncates, as Java's). */
export function wrapVehicleDegrees(degrees: number): number {
  let d = degrees % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** `angle` turned towards `target` by at most `step` degrees, the short way round. */
export function approachAngle(angle: number, target: number, step: number): number {
  return angle + clampTo(wrapVehicleDegrees(target - angle), -step, step);
}

/** `value` moved towards `target` by at most `step` (not an angle). */
export function towards(value: number, target: number, step: number): number {
  return value + clampTo(target - value, -step, step);
}

/** The unit vector a nose at `yaw` and `pitch` points along. */
export function noseDirection(yaw: number, pitch: number): [number, number, number] {
  const y = toRadians(yaw);
  const p = toRadians(pitch);
  return [-Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
}

/** The horizontal speed along the facing `yaw`. */
export function alongFacing(vx: number, vz: number, yaw: number): number {
  const rad = toRadians(yaw);
  return -Math.sin(rad) * vx + Math.cos(rad) * vz;
}

/** The vertical speed of a floating hull whose bottom is `depth` below the surface. */
export function buoyancy(vy: number, depth: number): number {
  const push = clampTo((depth - DRAFT) * BUOYANCY, -GRAVITY, MAX_BUOYANCY);
  return (vy + push) * WATER_DAMPING;
}

/** One tick (`VehiclePhysics.step`). */
export function stepVehicle(
  c: VehicleConstants,
  s: VehicleState,
  input: VehicleInput,
  env: VehicleEnv,
): VehicleState {
  const wet = env.waterDepth > 0;
  const submerged = wet && (!env.onGround || env.waterDepth > WADE_DEPTH);
  switch (c.mode) {
    case 'ground':
      return submerged ? landVehicleInWater(c, s, input, env) : land(c, s, input, env, 1);
    case 'water':
      return wet ? water(c, s, input, env, 1) : land(c, s, input, env, OUT_OF_ELEMENT);
    case 'amphibious':
      return submerged ? water(c, s, input, env, 1) : land(c, s, input, env, 1);
    case 'air':
      return submerged ? landVehicleInWater(c, s, input, env) : air(c, s, input, env);
    case 'hover':
      return hover(c, s, input, env);
  }
}

/** A ground vehicle or plane in water: floats (driving at a tenth) with `floats`, else sinks. */
function landVehicleInWater(
  c: VehicleConstants,
  s: VehicleState,
  input: VehicleInput,
  env: VehicleEnv,
): VehicleState {
  if (c.floats) return water(c, s, input, env, OUT_OF_ELEMENT);
  const vx = s.vx * SINK_DRAG;
  const vz = s.vz * SINK_DRAG;
  const vy = (s.vy - SINK_GRAVITY) * SINK_DRAG;
  return {
    vx,
    vy,
    vz,
    yaw: s.yaw,
    pitch: s.pitch,
    throttle: 0,
    speed: alongFacing(vx, vz, s.yaw),
    steering: 0,
  };
}

/** On land: driving on the ground; no control in the air. */
function land(
  c: VehicleConstants,
  s: VehicleState,
  input: VehicleInput,
  env: VehicleEnv,
  share: number,
): VehicleState {
  const vy = (s.vy - GRAVITY) * AIR_DRAG;
  if (!env.onGround) {
    const vx = s.vx * AIR_DRAG;
    const vz = s.vz * AIR_DRAG;
    return {
      vx,
      vy,
      vz,
      yaw: s.yaw,
      pitch: 0,
      throttle: 0,
      speed: alongFacing(vx, vz, s.yaw),
      steering: 0,
    };
  }
  const p = drive(c, s, input, env.engine, share, c.grip, GROUND_COAST, 0);
  return {
    vx: p.vx,
    vy,
    vz: p.vz,
    yaw: p.yaw,
    pitch: 0,
    throttle: p.throttle,
    speed: p.speed,
    steering: p.steering,
  };
}

/** On water: driving with drift, floating at the waterline. */
function water(
  c: VehicleConstants,
  s: VehicleState,
  input: VehicleInput,
  env: VehicleEnv,
  share: number,
): VehicleState {
  const p = drive(c, s, input, env.engine, share, WATER_GRIP, WATER_COAST, WATER_MIN_TURN);
  return {
    vx: p.vx,
    vy: buoyancy(s.vy, env.waterDepth),
    vz: p.vz,
    yaw: p.yaw,
    pitch: 0,
    throttle: p.throttle,
    speed: p.speed,
    steering: p.steering,
  };
}

interface Planar {
  readonly vx: number;
  readonly vz: number;
  readonly yaw: number;
  readonly speed: number;
  readonly steering: number;
  readonly throttle: number;
}

/**
 * Forwards, back and turning on a surface: throttle up to `max_speed` (reverse up to its share),
 * back brakes while moving forwards, coasting otherwise; turning scales with speed (reversed in
 * reverse) unless `turns_in_place`; `grip` turns the velocity towards the new facing.
 */
function drive(
  c: VehicleConstants,
  s: VehicleState,
  input: VehicleInput,
  engine: boolean,
  share: number,
  grip: number,
  coast: number,
  minTurn: number,
): Planar {
  const max = c.maxSpeed * share;
  const reverseMax = max * c.reverseFactor;
  const acc = c.acceleration * share;
  const rad = toRadians(s.yaw);
  const fx = -Math.sin(rad);
  const fz = Math.cos(rad);
  const along = s.vx * fx + s.vz * fz;
  const latX = s.vx - fx * along;
  const latZ = s.vz - fz * along;
  const forward = input.forward && !input.back;
  const back = input.back && !input.forward;
  let speed = along;
  let throttle = 0;
  if (forward && speed < 0) {
    speed = Math.min(0, speed + c.braking);
  } else if (back && speed > 0) {
    speed = Math.max(0, speed - c.braking);
  } else if (forward && engine) {
    throttle = 1;
    speed = speed < max ? Math.min(max, speed + acc) : speed;
  } else if (back && engine) {
    throttle = -1;
    speed = speed > -reverseMax ? Math.max(-reverseMax, speed - acc) : speed;
  } else {
    speed *= coast;
  }
  // Above the top speed (a boat run ashore, a lower share): lose at most the braking per tick.
  if (speed > max) speed = Math.max(max, speed - c.braking);
  else if (speed < -reverseMax) speed = Math.min(-reverseMax, speed + c.braking);
  if (Math.abs(speed) < STOP) speed = 0;
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const moving = Math.min(1, Math.abs(speed) / (max * FULL_TURN_SHARE));
  let factor: number;
  if (c.turnsInPlace) {
    factor = engine ? 1 : moving;
  } else {
    factor = Math.max(engine ? minTurn : 0, moving);
    if (speed < 0) factor = -factor;
  }
  const yaw = s.yaw + steer * c.turnRate * factor;
  const nrad = toRadians(yaw);
  const nfx = -Math.sin(nrad);
  const nfz = Math.cos(nrad);
  let hx = fx * speed + latX;
  let hz = fz * speed + latZ;
  hx += (nfx * speed - hx) * grip;
  hz += (nfz * speed - hz) * grip;
  return { vx: hx, vz: hz, yaw, speed: hx * nfx + hz * nfz, steering: steer, throttle };
}

/**
 * A plane: forwards and back move the throttle lever; the airspeed follows lever times top speed
 * (gaining `acceleration`, losing `braking` per tick); the nose follows the driver's view at
 * `turn_rate`; below `takeoff_speed` it sinks. On the ground it rolls without turning in place
 * and lifts its nose only from `takeoff_speed` on.
 */
function air(
  c: VehicleConstants,
  s: VehicleState,
  input: VehicleInput,
  env: VehicleEnv,
): VehicleState {
  const oldDir = noseDirection(s.yaw, s.pitch);
  let airspeed = Math.max(0, s.vx * oldDir[0] + s.vy * oldDir[1] + s.vz * oldDir[2]);
  const sinkOld = s.vy - oldDir[1] * airspeed;
  let lever = s.throttle;
  if (input.forward && !input.back) lever = Math.min(1, lever + THROTTLE_STEP);
  else if (input.back && !input.forward) lever = Math.max(0, lever - THROTTLE_STEP);
  const target = env.engine ? lever * c.maxSpeed : 0;
  airspeed =
    airspeed < target
      ? Math.min(target, airspeed + c.acceleration)
      : Math.max(target, airspeed - c.braking);
  if (airspeed < STOP) airspeed = 0;
  let yaw: number;
  let pitch: number;
  let vx: number;
  let vy: number;
  let vz: number;
  if (env.onGround) {
    const moving = Math.min(1, airspeed / (c.maxSpeed * FULL_TURN_SHARE));
    yaw = approachAngle(s.yaw, input.viewYaw, c.turnRate * moving);
    const pitchTarget =
      airspeed >= c.takeoffSpeed ? clampTo(input.viewPitch, -MAX_VEHICLE_PITCH, 0) : 0;
    pitch = approachAngle(s.pitch, pitchTarget, c.turnRate);
    const dir = noseDirection(yaw, pitch);
    vx = dir[0] * airspeed;
    vy = dir[1] * airspeed - GRAVITY;
    vz = dir[2] * airspeed;
  } else {
    yaw = approachAngle(s.yaw, input.viewYaw, c.turnRate);
    pitch = approachAngle(
      s.pitch,
      clampTo(input.viewPitch, -MAX_VEHICLE_PITCH, MAX_VEHICLE_PITCH),
      c.turnRate,
    );
    const lift = c.takeoffSpeed <= 0 ? 1 : Math.min(1, airspeed / c.takeoffSpeed);
    const sink = lift >= 1 ? sinkOld * STALL_RECOVERY : (sinkOld - GRAVITY * (1 - lift)) * AIR_DRAG;
    const dir = noseDirection(yaw, pitch);
    vx = dir[0] * airspeed;
    vy = dir[1] * airspeed + sink;
    vz = dir[2] * airspeed;
  }
  const steering = clampTo((yaw - s.yaw) / c.turnRate, -1, 1);
  return { vx, vy, vz, yaw, pitch, throttle: lever, speed: airspeed, steering };
}

/**
 * A hovering vehicle: with the engine on it faces the driver's view yaw (at `turn_rate`),
 * forwards, back, left and right move it relative to that facing at up to `max_speed` (back at
 * its reverse share), jump climbs and descend sinks at `lift_speed`, and with neither it holds
 * its height; every change is at most `acceleration` per tick. Without the engine it drifts to a
 * stop and sinks slowly; in water it floats.
 */
function hover(
  c: VehicleConstants,
  s: VehicleState,
  input: VehicleInput,
  env: VehicleEnv,
): VehicleState {
  let yaw = s.yaw;
  let vx: number;
  let vy: number;
  let vz: number;
  let steering = 0;
  let throttle = 0;
  if (env.engine) {
    yaw = approachAngle(s.yaw, input.viewYaw, c.turnRate);
    const rad = toRadians(yaw);
    const fx = -Math.sin(rad);
    const fz = Math.cos(rad);
    const rx = -Math.cos(rad);
    const rz = -Math.sin(rad);
    const forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const ahead = forward < 0 ? -c.maxSpeed * c.reverseFactor : forward * c.maxSpeed;
    let dx = fx * ahead + rx * strafe * c.maxSpeed;
    let dz = fz * ahead + rz * strafe * c.maxSpeed;
    const length = Math.hypot(dx, dz);
    if (length > c.maxSpeed) {
      dx *= c.maxSpeed / length;
      dz *= c.maxSpeed / length;
    }
    const ex = dx - s.vx;
    const ez = dz - s.vz;
    const gap = Math.hypot(ex, ez);
    if (gap <= c.acceleration) {
      vx = dx;
      vz = dz;
    } else {
      vx = s.vx + (ex / gap) * c.acceleration;
      vz = s.vz + (ez / gap) * c.acceleration;
    }
    const up = input.up && !input.down;
    const down = input.down && !input.up;
    const climb = up ? c.liftSpeed : down ? -c.liftSpeed : 0;
    vy = towards(s.vy, climb, c.acceleration);
    steering = strafe;
    throttle = 1;
  } else {
    vx = s.vx * HOVER_COAST;
    vz = s.vz * HOVER_COAST;
    vy = towards(s.vy, -HOVER_SINK, HOVER_SINK_STEP);
  }
  if (env.waterDepth > DRAFT) vy = Math.max(vy, buoyancy(s.vy, env.waterDepth));
  return { vx, vy, vz, yaw, pitch: 0, throttle, speed: alongFacing(vx, vz, yaw), steering };
}
