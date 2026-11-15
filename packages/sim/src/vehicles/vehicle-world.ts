/**
 * Vehicles in the Try it area (B428, ADR 0090 D2–D5, D9, ADR 0091 D6): placed from the vehicle's
 * item, got into and out of, driven with the player's movement keys through {@link stepVehicle}
 * (the runtime's physics twin), moved with the area's block collision and step height, with
 * fuel, damage, repair, pick-up and the vehicle's events. Pure and deterministic, as the rest
 * of the simulation.
 *
 * What it does as the runtime does (`MsmVehicle`, `VehicleMovement`, `VehicleFuel`,
 * `VehicleHealth`, `VehicleSeats`, `MsmVehicleItem`):
 *
 * - The item places the vehicle where the pointer meets a block's top (or, for `water` and
 *   `any`, the water's surface), against a side moved out by half the hitbox, facing the
 *   player's look, when `places_on` allows the surface and the hitbox is free; `on_place` fires.
 * - A right click uses a fuel item (adds its ticks up to the tank), a repair item (takes its
 *   amount of damage away), else gets the player into the first seat (the driver's): `on_mount`
 *   and the start sound. Sneaking gets out (`on_dismount`), beside the seat's side of the hull,
 *   then the other side, the front and the back, wherever the player fits.
 * - Each tick: one physics step from the driver's keys and look (idle without a driver), with
 *   `on_ground` and the depth in water from the last move; then the move with collision; fuel
 *   burns while the driver gives throttle; `on_tick` fires every `interval` ticks while driven;
 *   exhaust particles come out while the engine runs.
 * - A hit adds 1 damage (an empty hand's); at `health.max` it is destroyed: `on_destroy`, the
 *   player gets out, the vehicle goes. A sneaking hit on an empty vehicle with `pick_up` picks
 *   it up.
 *
 * What only the game does is said once per vehicle type through `SimLog.onlyInMinecraft`
 * ({@link CatalogueVehicle.onlyInMinecraft}): weapons, storage, paints, explosions, sounds,
 * the on-screen dashboard and being solid; actions the simulation does not run say so through
 * the trigger engine as every event does.
 *
 * Approximations (said in the guide's limits): the seated player's eye is
 * {@link RIDING_EYE_HEIGHT} above the seat; water height is the block's level as the game draws
 * it; the turret's drawn aim follows the driver's look at its `turn_rate` within its limits.
 */

import type { EventContext } from '../events/actions.js';
import type { EventOwner } from '../events/definitions.js';
import {
  type BlockLookup,
  boxesOverlap,
  collectObstacles,
  moveWithStep,
  type WorldBox,
} from '../player/collide.js';
import { type PlayerController, type PlayerInput, playerBox } from '../player/controller.js';
import type { BlockPos, BlockShapes, BlockState, Face, SimEffect, SimLog, Vec3 } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import type { CatalogueVehicle, VehicleCatalogue } from './catalogue.js';
import {
  approachAngle,
  clampTo,
  idleVehicleInput,
  stepVehicle,
  type VehicleInput,
  type VehicleState,
  vehicleStateAt,
  wrapVehicleDegrees,
} from './physics.js';

/** The most vehicles in the area at once. */
export const MAX_VEHICLES = 16;
/** Damage one hit does: an empty hand's, as the runtime counts a player's hit. */
export const HIT_DAMAGE = 1;
/** A seated player's feet sit this far below the seat (the game's riding offset of a player). */
export const RIDING_OFFSET = 0.6;
/** The seated player's eye above the seat point: a standing eye less the riding offset. */
export const RIDING_EYE_HEIGHT = 1.62 - RIDING_OFFSET;
/** Gap between the hull and a player getting out, in blocks (the runtime's `DISMOUNT_GAP`). */
export const DISMOUNT_GAP = 0.2;
/** The player's width, for getting out beside the hull. */
const PLAYER_HALF_WIDTH = 0.3;

/** What the vehicles work on: the area, the player, the log and the trigger engine. */
export interface VehicleHost {
  readonly world: SimWorld;
  readonly shapes: BlockShapes;
  readonly player: PlayerController;
  readonly log: SimLog;
  /** Whether a block state is water (or a waterlogged block). */
  isWater(state: BlockState): boolean;
  /** Runs a vehicle event with one trigger line (`<sentence>, so its event "<id>" ran.`). */
  fire(owner: EventOwner, eventId: string, ctx: EventContext, sentence: string): void;
  /** Sends an effect (a sound, a particle) to the view. */
  effect(effect: SimEffect): void;
}

/** One vehicle as the view draws it and the readout shows it. */
export interface VehicleSnapshot {
  readonly id: number;
  /** The vehicle type's id. */
  readonly type: string;
  readonly position: Vec3;
  readonly previousPosition: Vec3;
  readonly yaw: number;
  readonly previousYaw: number;
  readonly pitch: number;
  readonly previousPitch: number;
  /** Blocks per tick along the facing (negative in reverse). */
  readonly speed: number;
  /** -1 (left) to 1 (right). */
  readonly steering: number;
  /** The engine's effort (-1 to 1), or a plane's throttle lever (0 to 1). */
  readonly throttle: number;
  /** Blocks rolled so far (forwards counts up, back counts down), for the wheels. */
  readonly distance: number;
  /** The turret's drawn aim relative to the hull (degrees, positive right; pitch negative up). */
  readonly turretYaw: number;
  readonly turretPitch: number;
  /** Fuel ticks left and the tank's size (0 when it needs no fuel). */
  readonly fuel: number;
  readonly fuelCapacity: number;
  readonly damage: number;
  readonly maxHealth: number;
  /** Whether the player drives it. */
  readonly driven: boolean;
  readonly onGround: boolean;
  /** How far the hull's bottom is under water, in blocks (0 out of water). */
  readonly waterDepth: number;
}

/** A vehicle the pointer meets. */
export interface VehicleHit {
  readonly id: number;
  readonly distance: number;
  readonly point: Vec3;
}

/** What a place with the vehicle's item did. */
export type VehiclePlaceResult =
  | { readonly placed: true; readonly id: number }
  | { readonly placed: false; readonly reason: string };

interface SimVehicle {
  readonly id: number;
  kind: CatalogueVehicle;
  position: Vec3;
  previous: Vec3;
  state: VehicleState;
  previousYaw: number;
  previousPitch: number;
  onGround: boolean;
  waterDepth: number;
  fuel: number;
  damage: number;
  distance: number;
  turretYaw: number;
  turretPitch: number;
  age: number;
  drivenTicks: number;
}

/** A point in the hull's frame (x right, y up, z forwards) turned into the world by `yaw`. */
export function hullToWorld(local: readonly [number, number, number], yaw: number): Vec3 {
  const rad = (yaw * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: -local[0] * cos - local[2] * sin,
    y: local[1],
    z: local[2] * cos - local[0] * sin,
  };
}

/** The box of a vehicle of `width` by `height` standing at `position` (the bottom's centre). */
export function vehicleBox(position: Vec3, width: number, height: number): WorldBox {
  const h = width / 2;
  return [
    position.x - h,
    position.y,
    position.z - h,
    position.x + h,
    position.y + height,
    position.z + h,
  ];
}

/** Where a ray from `origin` along `direction` first meets `box`, within `reach`; `null` if not. */
export function rayBox(origin: Vec3, direction: Vec3, box: WorldBox, reach: number): number | null {
  let near = 0;
  let far = reach;
  const o = [origin.x, origin.y, origin.z];
  const d = [direction.x, direction.y, direction.z];
  for (let axis = 0; axis < 3; axis += 1) {
    const start = o[axis] as number;
    const step = d[axis] as number;
    const lo = box[axis] as number;
    const hi = box[axis + 3] as number;
    if (Math.abs(step) < 1e-12) {
      if (start < lo || start > hi) return null;
      continue;
    }
    let t0 = (lo - start) / step;
    let t1 = (hi - start) / step;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return null;
  }
  return near;
}

/** How high water stands in a cell with this state (its level as the game draws it), or 0. */
function waterHeight(state: BlockState, above: boolean): number {
  if (above) return 1;
  const level = Number(state.properties.level ?? '0');
  if (!Number.isFinite(level) || level <= 0 || level >= 8) return 8 / 9;
  return (8 - level) / 9;
}

/** The project's vehicles in the area; see the module comment. */
export class VehicleWorld {
  private catalogue: VehicleCatalogue;
  private readonly host: VehicleHost;
  private readonly list: SimVehicle[] = [];
  private nextId = 1;
  private ridingId: number | null = null;
  private lookTurn = 0;
  private descending = false;
  private readonly lookup: BlockLookup;

  constructor(host: VehicleHost, catalogue: VehicleCatalogue) {
    this.host = host;
    this.catalogue = catalogue;
    this.lookup = (x, y, z) => host.world.get({ x, y, z });
  }

  /** The vehicle types of the current files. */
  get types(): VehicleCatalogue {
    return this.catalogue;
  }

  /** How many vehicles are in the area. */
  get count(): number {
    return this.list.length;
  }

  /** The vehicle the player sits in, or `null`. */
  get riding(): number | null {
    return this.ridingId;
  }

  /** Whether `item` is the item of one of the project's vehicles (it has the vehicle's id). */
  isVehicleItem(item: string): boolean {
    return this.catalogue.get(item) !== undefined;
  }

  /** The "Vehicle: descend" key (Left Alt in the game), held or not. */
  setDescend(held: boolean): void {
    this.descending = held;
  }

  /**
   * The hull's turn since the last call while the player drives a surface vehicle without a
   * turret: the view adds it to the look, as the game turns a passenger's look with the hull.
   */
  takeLookTurn(): number {
    const turn = this.lookTurn;
    this.lookTurn = 0;
    return turn;
  }

  /** New vehicle types after an edit: vehicles of a type that is gone are taken out. */
  setCatalogue(catalogue: VehicleCatalogue): void {
    if (catalogue === this.catalogue) return;
    this.catalogue = catalogue;
    for (const vehicle of [...this.list]) {
      const kind = catalogue.get(vehicle.kind.id);
      if (kind === undefined) {
        this.host.log.info(
          `${vehicle.kind.displayName} is no longer in the project; it was taken out of the preview.`,
          vehicle.kind.origin,
        );
        this.remove(vehicle);
        continue;
      }
      vehicle.kind = kind;
      vehicle.fuel = Math.min(vehicle.fuel, kind.fuel?.capacity ?? 0);
    }
  }

  /** Every vehicle goes ("Clear the area", a new ground); the player is set down where they are. */
  clear(): void {
    this.ridingId = null;
    this.list.length = 0;
    this.lookTurn = 0;
  }

  /** One vehicle by its id. */
  snapshot(id: number): VehicleSnapshot | undefined {
    const vehicle = this.find(id);
    return vehicle === undefined ? undefined : this.snap(vehicle);
  }

  /** The vehicle type of a vehicle by its id. */
  kindOf(id: number): CatalogueVehicle | undefined {
    return this.find(id)?.kind;
  }

  /** Every vehicle as the view draws it. */
  snapshots(): VehicleSnapshot[] {
    return this.list.map((vehicle) => this.snap(vehicle));
  }

  /** The vehicles' boxes (for pressure plates). */
  boxes(): WorldBox[] {
    return this.list.map((vehicle) => this.box(vehicle));
  }

  /** The nearest vehicle along a ray within `reach`, leaving out the one the player sits in. */
  pick(origin: Vec3, direction: Vec3, reach: number): VehicleHit | null {
    let best: VehicleHit | null = null;
    for (const vehicle of this.list) {
      if (vehicle.id === this.ridingId) continue;
      const t = rayBox(origin, direction, this.box(vehicle), reach);
      if (t === null || (best !== null && t >= best.distance)) continue;
      best = {
        id: vehicle.id,
        distance: t,
        point: {
          x: origin.x + direction.x * t,
          y: origin.y + direction.y * t,
          z: origin.z + direction.z * t,
        },
      };
    }
    return best;
  }

  /**
   * Uses a vehicle's item on a block (`pos`, `face`, `hit` 0..1 on the face), facing `yaw`.
   */
  place(
    item: string,
    at: { pos: BlockPos; face: Face; hit: Vec3 },
    yaw: number,
  ): VehiclePlaceResult {
    const kind = this.catalogue.get(item);
    if (kind === undefined) return { placed: false, reason: `${item} is not a vehicle` };
    if (this.list.length >= MAX_VEHICLES) {
      return this.refuse(kind, `the preview holds at most ${MAX_VEHICLES} vehicles`);
    }
    const point = {
      x: at.pos.x + at.hit.x,
      y: at.pos.y + at.hit.y,
      z: at.pos.z + at.hit.z,
    };
    const target = at.pos.y >= 0 ? this.host.world.get(at.pos) : null;
    const offset = faceStep(at.face);
    const beside = { x: at.pos.x + offset.x, y: at.pos.y + offset.y, z: at.pos.z + offset.z };
    const besideState = this.host.world.inBounds(beside) ? this.host.world.get(beside) : null;
    const onWater =
      (target !== null && this.host.isWater(target)) ||
      (besideState !== null && this.host.isWater(besideState));
    if (onWater ? kind.placesOn === 'ground' : kind.placesOn === 'water') {
      return this.refuse(
        kind,
        onWater ? 'it goes on the ground, not on water' : 'it goes on water; point at water',
      );
    }
    let spot: Vec3;
    if (onWater) {
      const column = target !== null && this.host.isWater(target) ? at.pos : beside;
      spot = { x: point.x, y: this.waterSurface(column), z: point.z };
    } else if (at.face === 'up') {
      spot = point;
    } else if (at.face === 'down') {
      spot = { x: point.x, y: point.y - kind.height, z: point.z };
    } else {
      const out = kind.width / 2 + 0.01;
      spot = { x: point.x + offset.x * out, y: point.y, z: point.z + offset.z * out };
    }
    const box = vehicleBox(spot, kind.width, kind.height);
    const shrunk: WorldBox = [
      box[0] + 0.01,
      box[1] + 0.01,
      box[2] + 0.01,
      box[3] - 0.01,
      box[4] - 0.01,
      box[5] - 0.01,
    ];
    const obstacles = collectObstacles(this.lookup, this.host.shapes, shrunk);
    if (obstacles.some((obstacle) => boxesOverlap(shrunk, obstacle))) {
      return this.refuse(kind, 'there is no room for it there');
    }
    const vehicle: SimVehicle = {
      id: this.nextId,
      kind,
      position: spot,
      previous: spot,
      state: vehicleStateAt(yaw),
      previousYaw: yaw,
      previousPitch: 0,
      onGround: false,
      waterDepth: 0,
      fuel: 0,
      damage: 0,
      distance: 0,
      turretYaw: 0,
      turretPitch: 0,
      age: 0,
      drivenTicks: 0,
    };
    this.nextId += 1;
    this.list.push(vehicle);
    for (const line of kind.onlyInMinecraft) this.host.log.onlyInMinecraft(line, kind.origin);
    if (kind.fuel !== undefined) {
      this.host.log.info(
        `${kind.displayName} needs fuel and has none yet: use its fuel on it, or "Fill the tank" beside the preview.`,
        kind.origin,
      );
    }
    this.fire(vehicle, kind.onPlace, `You placed ${kind.displayName}`, true);
    return { placed: true, id: vehicle.id };
  }

  /**
   * A right click on a vehicle, with the held thing's id when the hand is not empty: a fuel
   * item refuels, a repair item repairs, a paint's dye or a weapon's ammunition is said as
   * the game's, otherwise the player gets in when the driver's seat is free.
   */
  use(id: number, item?: string): void {
    const vehicle = this.find(id);
    if (vehicle === undefined) return;
    const { kind } = vehicle;
    if (item !== undefined) {
      const fuel = kind.fuel?.items.find((entry) => itemMatches(entry.item, item));
      if (fuel !== undefined && kind.fuel !== undefined && vehicle.fuel < kind.fuel.capacity) {
        vehicle.fuel = Math.min(kind.fuel.capacity, vehicle.fuel + fuel.amount);
        this.host.log.info(
          `You filled ${kind.displayName} with ${item}: ${secondsOf(vehicle.fuel)} of driving.`,
          kind.origin,
        );
        return;
      }
      const repair = kind.repair.find((entry) => itemMatches(entry.item, item));
      if (repair !== undefined && vehicle.damage > 0) {
        vehicle.damage = Math.max(0, vehicle.damage - repair.amount);
        this.host.log.info(`You repaired ${kind.displayName} with ${item}.`, kind.origin);
        return;
      }
      if (this.isDyeOrAmmo(kind, item)) return;
    }
    this.getIn(id);
  }

  /** Gets the player into a vehicle's driver's seat, when it is free. */
  getIn(id: number): boolean {
    const vehicle = this.find(id);
    if (vehicle === undefined) return false;
    if (this.ridingId === id) return true;
    if (this.ridingId !== null) this.getOut();
    this.ridingId = id;
    this.lookTurn = 0;
    const { kind } = vehicle;
    this.seatPlayer(vehicle);
    if (kind.startSound !== undefined) {
      this.host.effect({
        kind: 'sound',
        id: kind.startSound,
        position: vehicle.position,
        origin: kind.origin,
      });
    }
    this.host.log.info(
      `You got into ${kind.displayName}: W and S drive, A and D steer${
        kind.mode === 'air' || kind.mode === 'hover' ? ', the mouse aims' : ''
      }${kind.mode === 'hover' ? ', Space climbs and Left Alt goes down' : ''}; Shift gets out.`,
      kind.origin,
    );
    this.fire(vehicle, kind.onMount, `You got into ${kind.displayName}`, true);
    return true;
  }

  /** Gets the player out beside the hull (see the module comment); nothing when not seated. */
  getOut(): void {
    const vehicle = this.ridingId === null ? undefined : this.find(this.ridingId);
    this.ridingId = null;
    this.lookTurn = 0;
    if (vehicle === undefined) return;
    this.host.player.teleport(this.dismountSpot(vehicle));
    this.host.log.info(`You got out of ${vehicle.kind.displayName}.`, vehicle.kind.origin);
    this.fire(vehicle, vehicle.kind.onDismount, `You got out of ${vehicle.kind.displayName}`, true);
  }

  /**
   * A hit on a vehicle (left click): with the player sneaking, an empty vehicle with `pick_up`
   * is picked up; otherwise it takes {@link HIT_DAMAGE} and is destroyed at `health.max`.
   */
  hit(id: number, sneaking: boolean): void {
    const vehicle = this.find(id);
    if (vehicle === undefined) return;
    const { kind } = vehicle;
    if (sneaking && kind.pickUp && this.ridingId !== id) {
      this.remove(vehicle);
      this.host.log.info(
        `You picked up ${kind.displayName}. In the game its item keeps the fuel, damage, paint and name.`,
        kind.origin,
      );
      return;
    }
    vehicle.damage += HIT_DAMAGE;
    this.host.log.onlyInMinecraft(
      'what a held item does to a vehicle: every hit in the preview does the damage of an empty hand',
    );
    if (vehicle.damage >= kind.maxHealth) {
      this.destroy(id, true);
      return;
    }
    this.host.log.info(
      `You hit ${kind.displayName}: ${round(vehicle.damage)} of ${round(kind.maxHealth)} damage.`,
      kind.origin,
    );
  }

  /** Destroys a vehicle (`on_destroy`, the player gets out, it goes); `byPlayer` for a hit. */
  destroy(id: number, byPlayer = true): void {
    const vehicle = this.find(id);
    if (vehicle === undefined) return;
    const { kind } = vehicle;
    this.fire(vehicle, kind.onDestroy, `${kind.displayName} was destroyed`, byPlayer);
    if (this.find(id) === undefined) return;
    if (this.ridingId === id) {
      this.ridingId = null;
      this.host.player.teleport(this.dismountSpot(vehicle));
    }
    this.remove(vehicle);
    this.host.log.info(
      `${kind.displayName} was destroyed. In the game it drops its item${
        kind.definition.storage === undefined ? '' : ' and what its storage holds'
      }.`,
      kind.origin,
    );
    const health = kind.definition.health;
    const power =
      typeof health === 'object' && health !== null && !Array.isArray(health)
        ? health.explodes
        : undefined;
    if (typeof power === 'number' && power > 0) {
      this.host.log.onlyInMinecraft(
        `${kind.displayName}'s explosion (power ${power}) when it is destroyed`,
        kind.origin,
      );
    }
  }

  /** "Fill the tank" beside the preview: the tank of a vehicle that needs fuel is filled. */
  fillTank(id: number): void {
    const vehicle = this.find(id);
    const fuel = vehicle?.kind.fuel;
    if (vehicle === undefined || fuel === undefined) return;
    vehicle.fuel = fuel.capacity;
    this.host.log.info(
      `You filled ${vehicle.kind.displayName}'s tank: ${secondsOf(fuel.capacity)} of driving. In the game, use ${fuel.items
        .map((entry) => entry.item)
        .join(' or ')} on it.`,
      vehicle.kind.origin,
    );
  }

  /** "Repair" beside the preview: all damage goes. */
  repairFully(id: number): void {
    const vehicle = this.find(id);
    if (vehicle === undefined) return;
    vehicle.damage = 0;
    const items = vehicle.kind.repair.map((entry) => entry.item);
    this.host.log.info(
      `You repaired ${vehicle.kind.displayName}.${
        items.length === 0
          ? ' In the game nothing repairs it.'
          : ` In the game, use ${items.join(' or ')} on it.`
      }`,
      vehicle.kind.origin,
    );
  }

  /** The eye of the seated player between the last two ticks (the view's camera). */
  riderEye(alpha: number): Vec3 | null {
    const vehicle = this.ridingId === null ? undefined : this.find(this.ridingId);
    if (vehicle === undefined) return null;
    const a = clampTo(alpha, 0, 1);
    const position = {
      x: vehicle.previous.x + (vehicle.position.x - vehicle.previous.x) * a,
      y: vehicle.previous.y + (vehicle.position.y - vehicle.previous.y) * a,
      z: vehicle.previous.z + (vehicle.position.z - vehicle.previous.z) * a,
    };
    const yaw =
      vehicle.previousYaw + wrapVehicleDegrees(vehicle.state.yaw - vehicle.previousYaw) * a;
    const seat = hullToWorld(this.seatOffset(vehicle), yaw);
    return {
      x: position.x + seat.x,
      y: position.y + seat.y + RIDING_EYE_HEIGHT,
      z: position.z + seat.z,
    };
  }

  /**
   * One tick of every vehicle with the player's input (see the module comment). Returns true
   * when the player got out this tick (Shift).
   */
  tick(input: PlayerInput): boolean {
    let gotOut = false;
    if (this.ridingId !== null && input.sneak) {
      this.getOut();
      gotOut = true;
    }
    for (const vehicle of [...this.list]) {
      if (this.find(vehicle.id) === undefined) continue;
      this.step(vehicle, vehicle.id === this.ridingId ? input : null);
    }
    const riding = this.ridingId === null ? undefined : this.find(this.ridingId);
    if (riding !== undefined) this.seatPlayer(riding);
    return gotOut;
  }

  private step(vehicle: SimVehicle, input: PlayerInput | null): void {
    const { kind } = vehicle;
    const c = kind.constants;
    vehicle.age += 1;
    vehicle.previous = vehicle.position;
    vehicle.previousYaw = vehicle.state.yaw;
    vehicle.previousPitch = vehicle.state.pitch;
    const driven = input !== null;
    const canRun = kind.fuel === undefined || vehicle.fuel > 0;
    const engine = driven && canRun;
    const physicsInput: VehicleInput = driven
      ? {
          forward: input.forward > 0,
          back: input.forward < 0,
          left: input.strafe < 0,
          right: input.strafe > 0,
          up: input.jump,
          down: this.descending,
          viewYaw: input.yaw,
          viewPitch: input.pitch,
        }
      : idleVehicleInput(vehicle.state.yaw, vehicle.state.pitch);
    // The plane's lever is kept only for `air` (the runtime's `VehicleMovement.step`).
    const before: VehicleState = {
      ...vehicle.state,
      throttle: c.mode === 'air' ? vehicle.state.throttle : 0,
    };
    const after = stepVehicle(c, before, physicsInput, {
      onGround: vehicle.onGround,
      waterDepth: vehicle.waterDepth,
      engine,
    });
    // The move with the area's collision; a stopped axis loses its speed, as the game's move.
    const box = this.box(vehicle);
    const moved = moveWithStep(
      this.lookup,
      this.host.shapes,
      box,
      after.vx,
      after.vy,
      after.vz,
      c.stepHeight,
      vehicle.onGround,
    );
    vehicle.position = {
      x: vehicle.position.x + moved.dx,
      y: vehicle.position.y + moved.dy,
      z: vehicle.position.z + moved.dz,
    };
    vehicle.onGround = moved.landed || moved.stepped || (after.vy < 0 && moved.stoppedY);
    vehicle.state = {
      ...after,
      vx: moved.stoppedX ? 0 : after.vx,
      vy: moved.stoppedY ? 0 : after.vy,
      vz: moved.stoppedZ ? 0 : after.vz,
    };
    vehicle.waterDepth = this.waterDepth(this.box(vehicle));
    const rolled =
      moved.dx * -Math.sin((after.yaw * Math.PI) / 180) +
      moved.dz * Math.cos((after.yaw * Math.PI) / 180);
    vehicle.distance += rolled;
    // The passenger's look turns with a surface vehicle without a turret (`turnWithHull`).
    if (driven && kind.turret === undefined && c.mode !== 'air' && c.mode !== 'hover') {
      this.lookTurn += wrapVehicleDegrees(after.yaw - vehicle.previousYaw);
    }
    if (driven) this.aimTurret(vehicle, physicsInput);
    if (driven && kind.fuel !== undefined && vehicle.fuel > 0) {
      const burns =
        c.mode === 'air'
          ? after.throttle > 0
          : c.mode === 'hover'
            ? true
            : physicsInput.forward !== physicsInput.back;
      if (burns) {
        vehicle.fuel -= 1;
        if (vehicle.fuel === 0) {
          this.host.log.info(`${kind.displayName} ran out of fuel.`, kind.origin);
        }
      }
    }
    if (driven) {
      vehicle.drivenTicks += 1;
      const onTick = kind.onTick;
      if (onTick !== undefined && vehicle.drivenTicks % onTick.interval === 0) {
        this.fire(vehicle, onTick.event, `${kind.displayName} is being driven`, true);
      }
    }
    const exhaust = kind.exhaust;
    if (engine && exhaust !== undefined && vehicle.age % exhaust.everyTicks === 0) {
      const at = hullToWorld(exhaust.offset, vehicle.state.yaw);
      this.host.effect({
        kind: 'particle',
        id: exhaust.particle,
        position: {
          x: vehicle.position.x + at.x,
          y: vehicle.position.y + at.y,
          z: vehicle.position.z + at.z,
        },
        origin: kind.origin,
      });
    }
  }

  /** The turret's drawn aim follows the gunner's look (the driver here) within its limits. */
  private aimTurret(vehicle: SimVehicle, input: VehicleInput): void {
    const turret = vehicle.kind.turret;
    if (turret === undefined || turret.seat !== 0) return;
    let yaw = approachAngle(
      vehicle.turretYaw,
      wrapVehicleDegrees(input.viewYaw - vehicle.state.yaw),
      turret.turnRate,
    );
    yaw = wrapVehicleDegrees(yaw);
    if (turret.yawLimit !== undefined) yaw = clampTo(yaw, turret.yawLimit[0], turret.yawLimit[1]);
    vehicle.turretYaw = yaw;
    const [min, max] = turret.pitchLimit ?? [-90, 90];
    vehicle.turretPitch = clampTo(
      vehicle.turretPitch +
        clampTo(input.viewPitch - vehicle.turretPitch, -turret.turnRate, turret.turnRate),
      min,
      max,
    );
  }

  /** The player's feet on the driver's seat, looking where they look. */
  private seatPlayer(vehicle: SimVehicle): void {
    const seat = hullToWorld(this.seatOffset(vehicle), vehicle.state.yaw);
    this.host.player.teleport({
      x: vehicle.position.x + seat.x,
      y: vehicle.position.y + seat.y - RIDING_OFFSET,
      z: vehicle.position.z + seat.z,
    });
  }

  private seatOffset(vehicle: SimVehicle): readonly [number, number, number] {
    return (vehicle.kind.seats[0] as { offset: readonly [number, number, number] }).offset;
  }

  /**
   * Beside the hull on the seat's side, then the other side, the front and the back, each on
   * the floor there or a block up or down, wherever the player fits; on top of the hull else.
   */
  private dismountSpot(vehicle: SimVehicle): Vec3 {
    const { kind } = vehicle;
    const side = this.seatOffset(vehicle)[0] >= 0 ? 1 : -1;
    const reach = kind.width / 2 + PLAYER_HALF_WIDTH + DISMOUNT_GAP;
    const candidates: [number, number, number][] = [
      [side * reach, 0, 0],
      [-side * reach, 0, 0],
      [0, 0, reach],
      [0, 0, -reach],
    ];
    for (const local of candidates) {
      const at = hullToWorld(local, vehicle.state.yaw);
      for (const dy of [0, 1, -1]) {
        const feet = {
          x: vehicle.position.x + at.x,
          y: Math.floor(vehicle.position.y) + dy,
          z: vehicle.position.z + at.z,
        };
        const floor = this.floorAt(feet);
        if (floor === null) continue;
        const spot = { x: feet.x, y: floor, z: feet.z };
        if (this.fits(spot)) return spot;
      }
    }
    return {
      x: vehicle.position.x,
      y: vehicle.position.y + kind.height,
      z: vehicle.position.z,
    };
  }

  /** The top of what stands in the cell under `feet` (or the area's floor), within the cell. */
  private floorAt(feet: Vec3): number | null {
    const x = Math.floor(feet.x);
    const z = Math.floor(feet.z);
    const y = Math.floor(feet.y);
    if (y < 0) return null;
    const below = y === 0 ? null : this.host.world.get({ x, y: y - 1, z });
    if (y === 0) return 0;
    if (below === null) return null;
    const boxes = this.host.shapes.collision(below);
    if (boxes.length === 0) return null;
    return y - 1 + Math.max(...boxes.map((box) => box[4]));
  }

  private fits(feet: Vec3): boolean {
    const box = playerBox(feet);
    const shrunk: WorldBox = [
      box[0] + 1e-3,
      box[1] + 1e-3,
      box[2] + 1e-3,
      box[3] - 1e-3,
      box[4] - 1e-3,
      box[5] - 1e-3,
    ];
    return !collectObstacles(this.lookup, this.host.shapes, shrunk).some((obstacle) =>
      boxesOverlap(shrunk, obstacle),
    );
  }

  /** How far the bottom of `box` is below the highest water surface it touches; 0 out of water. */
  private waterDepth(box: WorldBox): number {
    const x0 = Math.floor(box[0] + 1e-3);
    const x1 = Math.floor(box[3] - 1e-3);
    const z0 = Math.floor(box[2] + 1e-3);
    const z1 = Math.floor(box[5] - 1e-3);
    const y0 = Math.max(0, Math.floor(box[1]));
    const y1 = Math.floor(box[4]);
    let depth = 0;
    for (let x = x0; x <= x1; x += 1) {
      for (let z = z0; z <= z1; z += 1) {
        for (let y = y0; y <= y1; y += 1) {
          const pos = { x, y, z };
          if (!this.host.world.inBounds(pos)) continue;
          const state = this.host.world.get(pos);
          if (state === null || !this.host.isWater(state)) continue;
          const above = this.host.world.inBounds({ x, y: y + 1, z })
            ? this.host.world.get({ x, y: y + 1, z })
            : null;
          const surface = y + waterHeight(state, above !== null && this.host.isWater(above));
          if (surface > box[1]) depth = Math.max(depth, surface - box[1]);
        }
      }
    }
    return depth;
  }

  /** The water's surface in the column of `pos`: up through the water from there. */
  private waterSurface(pos: BlockPos): number {
    let y = pos.y;
    while (true) {
      const above = { x: pos.x, y: y + 1, z: pos.z };
      const state = this.host.world.inBounds(above) ? this.host.world.get(above) : null;
      if (state === null || !this.host.isWater(state)) break;
      y += 1;
    }
    const top = this.host.world.get({ x: pos.x, y, z: pos.z });
    return y + (top === null ? 1 : waterHeight(top, false));
  }

  /** Says a dye or a weapon's ammunition is the game's; true when the item is one. */
  private isDyeOrAmmo(kind: CatalogueVehicle, item: string): boolean {
    const d = kind.definition;
    const model = isObject(d.model) ? d.model : {};
    const paints = Array.isArray(model.paints) ? model.paints : [];
    if (paints.some((paint) => isObject(paint) && paint.dye === item)) {
      this.host.log.onlyInMinecraft(`painting ${kind.displayName} with ${item}`, kind.origin);
      return true;
    }
    const weapons = Array.isArray(d.weapons) ? d.weapons : [];
    if (
      weapons.some(
        (weapon) => isObject(weapon) && isObject(weapon.ammo) && weapon.ammo.item === item,
      )
    ) {
      this.host.log.onlyInMinecraft(
        `loading ${kind.displayName}'s weapons with ${item}`,
        kind.origin,
      );
      return true;
    }
    return false;
  }

  private fire(
    vehicle: SimVehicle,
    eventId: string | undefined,
    sentence: string,
    player: boolean,
  ): void {
    if (eventId === undefined) return;
    const pos = {
      x: Math.floor(vehicle.position.x),
      y: Math.floor(vehicle.position.y),
      z: Math.floor(vehicle.position.z),
    };
    this.host.fire(
      vehicle.kind.owner,
      eventId,
      { source: 'entity', base: pos, origin: vehicle.position, player },
      sentence,
    );
  }

  private refuse(kind: CatalogueVehicle, reason: string): VehiclePlaceResult {
    this.host.log.info(`${kind.displayName} was not placed: ${reason}.`, kind.origin);
    return { placed: false, reason };
  }

  private remove(vehicle: SimVehicle): void {
    const index = this.list.indexOf(vehicle);
    if (index >= 0) this.list.splice(index, 1);
    if (this.ridingId === vehicle.id) this.ridingId = null;
  }

  private find(id: number): SimVehicle | undefined {
    return this.list.find((vehicle) => vehicle.id === id);
  }

  private box(vehicle: SimVehicle): WorldBox {
    return vehicleBox(vehicle.position, vehicle.kind.width, vehicle.kind.height);
  }

  private snap(vehicle: SimVehicle): VehicleSnapshot {
    return {
      id: vehicle.id,
      type: vehicle.kind.id,
      position: vehicle.position,
      previousPosition: vehicle.previous,
      yaw: vehicle.state.yaw,
      previousYaw: vehicle.previousYaw,
      pitch: vehicle.state.pitch,
      previousPitch: vehicle.previousPitch,
      speed: vehicle.state.speed,
      steering: vehicle.state.steering,
      throttle: vehicle.state.throttle,
      distance: vehicle.distance,
      turretYaw: vehicle.turretYaw,
      turretPitch: vehicle.turretPitch,
      fuel: vehicle.fuel,
      fuelCapacity: vehicle.kind.fuel?.capacity ?? 0,
      damage: vehicle.damage,
      maxHealth: vehicle.kind.maxHealth,
      driven: vehicle.id === this.ridingId,
      onGround: vehicle.onGround,
      waterDepth: vehicle.waterDepth,
    };
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An item id against a fuel or repair entry: the same id, or a `#` tag (which the preview cannot read). */
function itemMatches(entry: string, item: string): boolean {
  return !entry.startsWith('#') && normalise(entry) === normalise(item);
}

const normalise = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** `1 minute`, `30 seconds` of fuel ticks. */
function secondsOf(ticks: number): string {
  const seconds = Math.round(ticks / 20);
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

const round = (value: number): string => String(Math.round(value * 100) / 100);

function faceStep(face: Face): Vec3 {
  switch (face) {
    case 'up':
      return { x: 0, y: 1, z: 0 };
    case 'down':
      return { x: 0, y: -1, z: 0 };
    case 'north':
      return { x: 0, y: 0, z: -1 };
    case 'south':
      return { x: 0, y: 0, z: 1 };
    case 'west':
      return { x: -1, y: 0, z: 0 };
    case 'east':
      return { x: 1, y: 0, z: 0 };
  }
}
