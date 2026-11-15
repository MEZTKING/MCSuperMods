/**
 * The project's vehicles as Try it reads them (B428, ADR 0091 D6): every lowered vehicle
 * definition `msm/<ns>/vehicle/<path>.json` (ADR 0090 D2) with its defaults resolved as the
 * runtime's `VehicleDefinition` and `VehiclePhysics.Constants` resolve them, its name from
 * `en_us` (`entity.<ns>.<path>`, then `item.<ns>.<path>`), and the list of what it has that only
 * the game does (weapons, storage, paints, explosions and the rest), said once when the vehicle
 * is first placed. The vehicle's item has the vehicle's own id.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { readJsonFile } from '../blocks/catalogue.js';
import { type EventOwner, plainName } from '../events/definitions.js';
import type { SimFiles, SimOrigin } from '../types.js';
import {
  type MovementSpec,
  resolveMovement,
  VEHICLE_MODES,
  type VehicleConstants,
  type VehicleMode,
} from './physics.js';

/** A boat's hitbox (ADR 0090 D2), the default `size`. */
export const DEFAULT_VEHICLE_WIDTH = 1.375;
export const DEFAULT_VEHICLE_HEIGHT = 0.5625;
/** `health.max` default (ADR 0090 D9). */
export const DEFAULT_VEHICLE_HEALTH = 40;
/** `on_tick.interval` default. */
export const DEFAULT_VEHICLE_TICK_INTERVAL = 20;
/** `exhaust.every_ticks` default. */
export const DEFAULT_EXHAUST_TICKS = 2;
/** `turret.turn_rate` default, degrees a tick. */
export const DEFAULT_TURRET_TURN_RATE = 6;

/** Where a vehicle's item places it (ADR 0090 D5). */
export type VehiclePlacesOn = 'ground' | 'water' | 'any';

/** A seat: `[x, y, z]` in blocks from the vehicle's position (x right, z forwards). */
export interface VehicleSeatSpec {
  readonly offset: readonly [number, number, number];
}

/** An item that refuels or repairs: an item id or `#` tag, and what one gives. */
export interface VehicleItemAmount {
  readonly item: string;
  readonly amount: number;
}

/** A turret as the drawing follows it (ADR 0090 D7; firing is the game's). */
export interface VehicleTurretSpec {
  readonly bone: string;
  readonly pitchBone?: string;
  readonly yawLimit?: readonly [number, number];
  readonly pitchLimit?: readonly [number, number];
  readonly turnRate: number;
  readonly seat: number;
}

/** One vehicle type of the project, every default resolved. */
export interface CatalogueVehicle {
  /** The vehicle's id, also its item's id. */
  readonly id: string;
  readonly displayName: string;
  /** The definition as lowered (the view reads `model`, `parts` and `turret` from it). */
  readonly definition: JsonObject;
  readonly mode: VehicleMode;
  readonly constants: VehicleConstants;
  readonly width: number;
  readonly height: number;
  /** One or more seats; the first drives. */
  readonly seats: readonly VehicleSeatSpec[];
  readonly placesOn: VehiclePlacesOn;
  readonly pickUp: boolean;
  readonly maxHealth: number;
  readonly repair: readonly VehicleItemAmount[];
  /** Fuel items (`amount` is ticks) and the tank's size; absent: no fuel needed. */
  readonly fuel?: { readonly items: readonly VehicleItemAmount[]; readonly capacity: number };
  readonly turret?: VehicleTurretSpec;
  /** `camera.distance`: the third-person camera's distance while seated. */
  readonly cameraDistance?: number;
  readonly exhaust?: {
    readonly particle: string;
    readonly offset: readonly [number, number, number];
    readonly everyTicks: number;
  };
  readonly startSound?: string;
  /** The event ids of the triggers. */
  readonly onPlace?: string;
  readonly onMount?: string;
  readonly onDismount?: string;
  readonly onDestroy?: string;
  readonly onTick?: { readonly event: string; readonly interval: number };
  /** The events, as the trigger engine runs them (kind `entity`). */
  readonly owner: EventOwner;
  /** What only the game does with this vehicle, in plain words (said once when placed). */
  readonly onlyInMinecraft: readonly string[];
  readonly origin: SimOrigin;
}

/** The project's vehicles. */
export interface VehicleCatalogue {
  /** Vehicle ids in order. */
  ids(): readonly string[];
  get(id: string): CatalogueVehicle | undefined;
}

const VEHICLE_PATH = /^msm\/([a-z0-9_.-]+)\/vehicle\/([a-z0-9_./-]+)\.json$/;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: Json | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const str = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const triple = (value: Json | undefined): readonly [number, number, number] | undefined => {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [x, y, z] = value.map((entry) => num(entry));
  return x === undefined || y === undefined || z === undefined ? undefined : [x, y, z];
};

const pair = (value: Json | undefined): readonly [number, number] | undefined => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const [a, b] = value.map((entry) => num(entry));
  return a === undefined || b === undefined ? undefined : a <= b ? [a, b] : [b, a];
};

/** The `movement` block, with only the fields the format knows (others are ignored). */
function movementOf(value: Json | undefined): MovementSpec | undefined {
  if (!isRecord(value)) return undefined;
  const mode = value.mode;
  if (typeof mode !== 'string' || !(VEHICLE_MODES as readonly string[]).includes(mode)) {
    return undefined;
  }
  const out: Record<string, number | boolean | string> = { mode };
  for (const key of [
    'max_speed',
    'reverse_factor',
    'acceleration',
    'braking',
    'turn_rate',
    'step_height',
    'grip',
    'lift_speed',
    'takeoff_speed',
  ]) {
    const n = num(value[key]);
    if (n !== undefined) out[key] = n;
  }
  for (const key of ['turns_in_place', 'floats']) {
    if (typeof value[key] === 'boolean') out[key] = value[key];
  }
  return out as unknown as MovementSpec;
}

/** Items with an amount (`ticks` for fuel, `amount` for repair). */
function itemAmounts(value: Json | undefined, amountKey: string): VehicleItemAmount[] {
  if (!Array.isArray(value)) return [];
  const out: VehicleItemAmount[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const item = str(entry.item);
    const amount = num(entry[amountKey]);
    if (item !== undefined && amount !== undefined) out.push({ item, amount });
  }
  return out;
}

/** The events of a definition by id: each an ordered list of actions. */
function eventsOf(definition: JsonObject): Map<string, readonly JsonObject[]> {
  const out = new Map<string, readonly JsonObject[]>();
  const events = isRecord(definition.events) ? definition.events : {};
  for (const [id, event] of Object.entries(events)) {
    const actions = isRecord(event) && Array.isArray(event.actions) ? event.actions : [];
    out.set(id, Object.freeze(actions.filter(isRecord)));
  }
  return out;
}

/** The default `places_on` of a mode (`VehicleDefinition.placesOn`). */
export function defaultPlacesOn(mode: VehicleMode): VehiclePlacesOn {
  return mode === 'water' ? 'water' : mode === 'amphibious' || mode === 'hover' ? 'any' : 'ground';
}

/** The things of a definition only the game does, in plain words. */
function onlyInGame(name: string, d: JsonObject): string[] {
  const out: string[] = [];
  const weapons = Array.isArray(d.weapons) ? d.weapons.length : 0;
  if (weapons > 0) {
    out.push(
      `${name}'s ${weapons === 1 ? 'weapon fires' : `${weapons} weapons fire`} only in the game (the fire keys, ammunition and shots)`,
    );
  }
  if (isRecord(d.storage)) {
    out.push(`${name}'s storage opens only in the game; the preview has no vehicle storage`);
  }
  const model = isRecord(d.model) ? d.model : {};
  if (Array.isArray(model.paints) && model.paints.length > 0) {
    out.push(`${name}'s paints show only in the game; the preview draws its model texture`);
  }
  const health = isRecord(d.health) ? d.health : {};
  const explodes = num(health.explodes);
  if (explodes !== undefined && explodes > 0) {
    out.push(`${name} explodes when destroyed only in the game`);
  }
  if (Array.isArray(health.immune_to) && health.immune_to.length > 0) {
    out.push(`${name}'s immunity to some damage counts only in the game`);
  }
  if (isRecord(d.ram_damage)) out.push(`${name} hurts what it drives into only in the game`);
  const engine = isRecord(d.engine) ? d.engine : {};
  if (str(engine.sound) !== undefined) {
    out.push(`${name}'s engine sound plays only in the game`);
  }
  if (str(engine.horn) !== undefined) out.push(`${name}'s horn sounds only in the game`);
  if (d.hud !== false) {
    out.push(
      `${name}'s dashboard on the screen shows only in the game; the panel beside the preview stands in for it`,
    );
  }
  out.push(
    `${name} is solid only in the game: in the preview you and the mobs walk through vehicles`,
  );
  return out;
}

/**
 * Reads every vehicle definition of the lowered files. A definition without a `movement.mode`
 * the format knows is left out with one line on `say`.
 */
export function buildVehicleCatalogue(
  files: SimFiles,
  target: { readonly folders: { readonly resource: { readonly lang: string } } },
  say: (text: string, origin?: SimOrigin) => void = () => {},
): VehicleCatalogue {
  const langs = new Map<string, JsonObject>();
  const langOf = (namespace: string): JsonObject => {
    let lang = langs.get(namespace);
    if (lang === undefined) {
      const json = readJsonFile(
        files,
        `assets/${namespace}/${target.folders.resource.lang}/en_us.json`,
      );
      lang = isRecord(json) ? json : {};
      langs.set(namespace, lang);
    }
    return lang;
  };
  const byId = new Map<string, CatalogueVehicle>();
  const paths = [...files.keys()].filter((path) => VEHICLE_PATH.test(path)).sort();
  for (const path of paths) {
    const match = VEHICLE_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const vehiclePath = match[2] as string;
    const id = `${namespace}:${vehiclePath}`;
    const origin: SimOrigin = Object.freeze({ elementId: id });
    const d = readJsonFile(files, path);
    if (!isRecord(d)) continue;
    const movement = movementOf(d.movement);
    if (movement === undefined) {
      say(`${id} has no movement mode the preview knows; it is left out.`, origin);
      continue;
    }
    const key = vehiclePath.replaceAll('/', '.');
    const lang = langOf(namespace);
    const displayName =
      str(lang[`entity.${namespace}.${key}`]) ??
      str(lang[`item.${namespace}.${key}`]) ??
      plainName(id);
    const seats = Array.isArray(d.seats)
      ? d.seats.flatMap((seat) => {
          const offset = isRecord(seat) ? triple(seat.offset) : undefined;
          return offset === undefined ? [] : [{ offset }];
        })
      : [];
    const height = Array.isArray(d.size)
      ? (num(d.size[1]) ?? DEFAULT_VEHICLE_HEIGHT)
      : DEFAULT_VEHICLE_HEIGHT;
    const width = Array.isArray(d.size)
      ? (num(d.size[0]) ?? DEFAULT_VEHICLE_WIDTH)
      : DEFAULT_VEHICLE_WIDTH;
    const engine = isRecord(d.engine) ? d.engine : {};
    const fuel = isRecord(engine.fuel) ? engine.fuel : undefined;
    const fuelItems = itemAmounts(fuel?.items, 'ticks');
    const health = isRecord(d.health) ? d.health : {};
    const item = isRecord(d.item) ? d.item : {};
    const placesOn = item.places_on;
    const turret = isRecord(d.turret) ? d.turret : undefined;
    const turretBone = str(turret?.bone);
    const camera = isRecord(d.camera) ? num(d.camera.distance) : undefined;
    const exhaust = isRecord(d.exhaust) ? d.exhaust : undefined;
    const exhaustParticle = str(exhaust?.particle);
    const exhaustOffset = triple(exhaust?.offset);
    const onTick = isRecord(d.on_tick) ? d.on_tick : undefined;
    const onTickEvent = str(onTick?.event);
    const mode = movement.mode;
    const startSound = str(engine.start_sound);
    const vehicle: CatalogueVehicle = Object.freeze({
      id,
      displayName,
      definition: d,
      mode,
      constants: resolveMovement(movement),
      width,
      height,
      seats: seats.length > 0 ? seats : [{ offset: [0, height, 0] as const }],
      placesOn:
        placesOn === 'ground' || placesOn === 'water' || placesOn === 'any'
          ? placesOn
          : defaultPlacesOn(mode),
      pickUp: d.pick_up !== false,
      maxHealth: num(health.max) ?? DEFAULT_VEHICLE_HEALTH,
      repair: itemAmounts(health.repair, 'amount'),
      ...(fuel === undefined || fuelItems.length === 0
        ? {}
        : {
            fuel: {
              items: fuelItems,
              capacity: num(fuel.capacity) ?? 10 * Math.max(...fuelItems.map((one) => one.amount)),
            },
          }),
      ...(turretBone === undefined
        ? {}
        : {
            turret: {
              bone: turretBone,
              ...(str(turret?.pitch_bone) === undefined
                ? {}
                : { pitchBone: str(turret?.pitch_bone) as string }),
              ...(pair(turret?.yaw_limit) === undefined
                ? {}
                : { yawLimit: pair(turret?.yaw_limit) as readonly [number, number] }),
              ...(pair(turret?.pitch_limit) === undefined
                ? {}
                : { pitchLimit: pair(turret?.pitch_limit) as readonly [number, number] }),
              turnRate: num(turret?.turn_rate) ?? DEFAULT_TURRET_TURN_RATE,
              seat: num(turret?.seat) ?? 0,
            },
          }),
      ...(camera === undefined ? {} : { cameraDistance: camera }),
      ...(exhaustParticle === undefined || exhaustOffset === undefined
        ? {}
        : {
            exhaust: {
              particle: exhaustParticle,
              offset: exhaustOffset,
              everyTicks: Math.max(1, num(exhaust?.every_ticks) ?? DEFAULT_EXHAUST_TICKS),
            },
          }),
      ...(startSound === undefined ? {} : { startSound }),
      ...(str(d.on_place) === undefined ? {} : { onPlace: str(d.on_place) as string }),
      ...(str(d.on_mount) === undefined ? {} : { onMount: str(d.on_mount) as string }),
      ...(str(d.on_dismount) === undefined ? {} : { onDismount: str(d.on_dismount) as string }),
      ...(str(d.on_destroy) === undefined ? {} : { onDestroy: str(d.on_destroy) as string }),
      ...(onTickEvent === undefined
        ? {}
        : {
            onTick: {
              event: onTickEvent,
              interval: Math.max(1, num(onTick?.interval) ?? DEFAULT_VEHICLE_TICK_INTERVAL),
            },
          }),
      owner: Object.freeze({
        id,
        kind: 'entity' as const,
        displayName,
        events: eventsOf(d),
        triggers: new Map(),
        origin,
      }),
      onlyInMinecraft: Object.freeze(onlyInGame(displayName, d)),
      origin,
    });
    byId.set(id, vehicle);
  }
  const ids = Object.freeze([...byId.keys()]);
  return { ids: () => ids, get: (id) => byId.get(id) };
}
