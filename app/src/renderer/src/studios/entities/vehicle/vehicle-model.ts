/**
 * Pure helpers of the Vehicle Studio (B419, ADR 0091 D1) over `msm:vehicle` element data
 * (ADR 0090 D2): the movement modes and their defaults, the bones of the vehicle's geometry and
 * the bone pickers' choices, finding parts by bone names, seats (the seat plan's coordinates and
 * "How many seats"), weapons, and "Make a starter model" (a geometry from
 * `vehicleGeometry` of `@msm/plugin-entities` plus a one-colour texture, one undo step).
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import type { JsonObject } from '@msm/plugin-api';
import { VEHICLE_KIND, type VehicleShape, vehicleGeometry } from '@msm/plugin-entities';
import type { ChangeAsset, ChangeItem } from '../../../changeset/changeset';
import { boneNames } from '../../../preview/geo/json';
import { asObject } from '../../blocks-items/blocks-items-model';

export { VEHICLE_KIND };

/** Kind id of geo models (`@msm/plugin-models-anim`). */
export const GEO_MODEL_KIND = 'msm:geo_model';

/** The movement modes in the order the Studio shows them (ADR 0090 D3). */
export const VEHICLE_MODES = ['ground', 'water', 'amphibious', 'air', 'hover'] as const;

/** A movement mode. */
export type VehicleMode = (typeof VEHICLE_MODES)[number];

/** The words of each mode in the mode picker. */
export const VEHICLE_MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ground: 'On the ground',
  water: 'On water',
  amphibious: 'Land and water',
  air: 'In the air',
  hover: 'Hovering',
});

/** One line under each mode's picture. */
export const VEHICLE_MODE_NOTES: Readonly<Record<string, string>> = Object.freeze({
  ground: 'Cars, karts and tanks. Climbs steps; sinks in water unless it floats.',
  water: 'Boats and rafts. Floats at the waterline and barely moves on land.',
  amphibious: 'Hovercraft. Drives on land and floats on water.',
  air: 'Planes. Forwards opens the throttle; it lifts off above its take-off speed.',
  hover: 'Helicopters and drones. Jump climbs, "Vehicle: descend" sinks, otherwise it holds.',
});

/** `movement.max_speed` when it is absent, per mode (blocks a tick). */
export const DEFAULT_MAX_SPEED: Readonly<Record<string, number>> = Object.freeze({
  ground: 0.4,
  amphibious: 0.4,
  water: 0.35,
  air: 1.2,
  hover: 0.5,
});

/** `movement.turn_rate` when it is absent, per mode (degrees a tick). */
export const DEFAULT_TURN_RATE: Readonly<Record<string, number>> = Object.freeze({
  ground: 5,
  amphibious: 5,
  water: 4,
  air: 3,
  hover: 5,
});

/** The hitbox when `size` is absent: a boat's (ADR 0090 D2). */
export const DEFAULT_SIZE: readonly [number, number] = Object.freeze([1.375, 0.5625]) as readonly [
  number,
  number,
];

/** The vanilla speed cap when the target says nothing (`TargetFacts.vehicles.maxSpeed`). */
export const FALLBACK_SPEED_CAP = 3;

/** Ticks a second. */
export const TICKS_PER_SECOND = 20;

/** The mode of the data, `ground` when absent or unknown to the Studio. */
export function modeOf(data: Json | undefined): string {
  const mode = asObject(asObject(data).movement).mode;
  return typeof mode === 'string' && mode !== '' ? mode : 'ground';
}

/** The effective top speed in blocks a tick. */
export function maxSpeedOf(data: Json | undefined): number {
  const value = asObject(asObject(data).movement).max_speed;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : (DEFAULT_MAX_SPEED[modeOf(data)] ?? 0.4);
}

/** Blocks a tick as "8 blocks a second" (rounded to one decimal place). */
export function speedWords(blocksPerTick: number): string {
  const perSecond = Math.round(blocksPerTick * TICKS_PER_SECOND * 10) / 10;
  return `${perSecond} block${perSecond === 1 ? '' : 's'} a second`;
}

/** The effective hitbox `[width, height]` in blocks. */
export function sizeOf(data: Json | undefined): [number, number] {
  const size = asObject(data).size;
  if (
    Array.isArray(size) &&
    size.length === 2 &&
    typeof size[0] === 'number' &&
    typeof size[1] === 'number'
  ) {
    return [size[0], size[1]];
  }
  return [DEFAULT_SIZE[0], DEFAULT_SIZE[1]];
}

// Geometry and bones --------------------------------------------------------------------------

/** The vehicle's `model.geometry` id, or `''`. */
export function geometryIdOf(data: Json | undefined): string {
  const id = asObject(asObject(data).model).geometry;
  return typeof id === 'string' ? id.trim() : '';
}

/** The vehicle's `model.texture` id, or `''`. */
export function textureIdOf(data: Json | undefined): string {
  const id = asObject(asObject(data).model).texture;
  return typeof id === 'string' ? id.trim() : '';
}

/** The project's `msm:geo_model` element `id`, or `undefined`. */
export function geometryElement(project: Project, id: string): Element | undefined {
  if (id === '') return undefined;
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find(
      (entry) => entry.id === id && entry.kind === GEO_MODEL_KIND,
    );
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The bone names of the vehicle's geometry, in file order, or `null` when the geometry is not a
 * project element (then the pickers take any typed name, as the validator only warns).
 */
export function vehicleBones(project: Project, data: Json | undefined): string[] | null {
  const geometry = geometryElement(project, geometryIdOf(data));
  return geometry === undefined ? null : boneNames(geometry.data);
}

/** One choice of a bone picker. */
export interface BoneChoice {
  bone: string;
  /** False for a value kept although the geometry has no such bone. */
  known: boolean;
}

/**
 * The choices of a single bone picker: the geometry's bones in file order, and `current` first
 * (marked unknown) when it is set but not among them, so the picker never hides a value.
 */
export function boneChoices(bones: readonly string[], current: string | undefined): BoneChoice[] {
  const out = bones.map((bone) => ({ bone, known: true }));
  if (current !== undefined && current !== '' && !bones.includes(current)) {
    out.unshift({ bone: current, known: false });
  }
  return out;
}

/** The choices of a bone list picker (wheels, rotors...): every bone plus unknown listed ones. */
export function boneListChoices(bones: readonly string[], listed: readonly string[]): BoneChoice[] {
  const unknown = listed.filter(
    (bone, index) => !bones.includes(bone) && listed.indexOf(bone) === index,
  );
  return [
    ...unknown.map((bone) => ({ bone, known: false })),
    ...bones.map((bone) => ({ bone, known: true })),
  ];
}

/** `listed` with `bone` switched on or off, keeping the geometry's order for known bones. */
export function toggledBone(
  bones: readonly string[],
  listed: readonly string[],
  bone: string,
  on: boolean,
): string[] {
  const set = new Set(listed);
  if (on) set.add(bone);
  else set.delete(bone);
  const known = bones.filter((entry) => set.has(entry));
  const unknown = listed.filter((entry) => set.has(entry) && !bones.includes(entry));
  return [...unknown, ...known];
}

/** The string list at `value`. */
export function stringList(value: Json | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** Every bone the vehicle names, with its element path (as the validator's `namedBones`). */
export function namedBones(data: Json | undefined): { bone: string; path: (string | number)[] }[] {
  const object = asObject(data);
  const found: { bone: string; path: (string | number)[] }[] = [];
  const add = (value: Json | undefined, path: (string | number)[]) => {
    if (typeof value === 'string' && value !== '') found.push({ bone: value, path });
  };
  const turret = asObject(object.turret);
  add(turret.bone, ['turret', 'bone']);
  add(turret.pitch_bone, ['turret', 'pitch_bone']);
  const parts = asObject(object.parts);
  for (const field of PART_FIELDS) {
    stringList(parts[field]).forEach((bone, index) => {
      add(bone, ['parts', field, index]);
    });
  }
  weaponsOf(data).forEach((weapon, index) => {
    add(asObject(asObject(weapon).muzzle).bone, ['weapons', index, 'muzzle', 'bone']);
  });
  return found;
}

/** The bones named by the vehicle that the geometry does not have (empty without bones). */
export function missingBones(
  bones: readonly string[] | null,
  data: Json | undefined,
): { bone: string; path: (string | number)[] }[] {
  if (bones === null) return [];
  return namedBones(data).filter((entry) => !bones.includes(entry.bone));
}

/** The four lists of `parts`. */
export const PART_FIELDS = ['wheels', 'steering', 'rotors', 'propellers'] as const;
/** One of {@link PART_FIELDS}. */
export type PartField = (typeof PART_FIELDS)[number];

/** The words of each part list. */
export const PART_LABELS: Readonly<Record<PartField, string>> = Object.freeze({
  wheels: 'Wheels (roll as it drives)',
  steering: 'Steering (turn with the steering)',
  rotors: 'Rotors (spin flat, about the vertical)',
  propellers: 'Propellers (spin about the forward axis)',
});

/** What "Find parts by name" fills in from a geometry's bone names. */
export interface GuessedParts {
  wheels: string[];
  steering: string[];
  rotors: string[];
  propellers: string[];
  turret: string | null;
  barrel: string | null;
}

/**
 * Guesses the turning bones from their names: `wheel` (and `track`) bones roll, front wheels
 * and `steer` bones steer, `rotor` bones spin flat (a `tail_rotor` is a propeller), `propeller`,
 * `prop` and `fan` bones spin forwards, `turret` turns and `barrel`, `cannon` or `gun` pitches.
 */
export function guessParts(bones: readonly string[]): GuessedParts {
  const lower = (bone: string) => bone.toLowerCase();
  const wheels = bones.filter((bone) => /wheel/.test(lower(bone)) && !/steering/.test(lower(bone)));
  const steering = bones.filter(
    (bone) => /steer/.test(lower(bone)) || (/wheel/.test(lower(bone)) && /front/.test(lower(bone))),
  );
  const isTail = (bone: string) => /tail/.test(lower(bone));
  const rotors = bones.filter((bone) => /rotor/.test(lower(bone)) && !isTail(bone));
  const propellers = bones.filter(
    (bone) =>
      /propeller|(^|_)prop($|_)|fan/.test(lower(bone)) ||
      (/rotor/.test(lower(bone)) && isTail(bone)),
  );
  const turret = bones.find((bone) => /turret/.test(lower(bone))) ?? null;
  const barrel = bones.find((bone) => /barrel|cannon|(^|_)gun($|_)/.test(lower(bone))) ?? null;
  return { wheels, steering, rotors, propellers, turret, barrel };
}

/**
 * The data with `parts` (and the turret's bones, when the vehicle has no turret bone yet and the
 * geometry has a turret) filled in from {@link guessParts}; lists already set are kept.
 */
export function withGuessedParts(data: Json, bones: readonly string[]): JsonObject {
  const object = { ...asObject(data) };
  const guessed = guessParts(bones);
  const parts = { ...asObject(object.parts) };
  for (const field of PART_FIELDS) {
    if (stringList(parts[field]).length === 0 && guessed[field].length > 0) {
      parts[field] = guessed[field];
    }
  }
  if (Object.keys(parts).length > 0) object.parts = parts;
  const turret = asObject(object.turret);
  if (guessed.turret !== null && typeof turret.bone !== 'string') {
    object.turret = {
      ...turret,
      bone: guessed.turret,
      ...(guessed.barrel === null || typeof turret.pitch_bone === 'string'
        ? {}
        : { pitch_bone: guessed.barrel }),
    };
  }
  return object;
}

// Seats ------------------------------------------------------------------------------------------

/** A seat's offset `[x, y, z]` (x right, z forwards, blocks). */
export type SeatOffset = [number, number, number];

/** The data's seats, or `[]` when it has none. */
export function seatsOf(data: Json | undefined): JsonObject[] {
  const seats = asObject(data).seats;
  return Array.isArray(seats) ? seats.map((seat) => asObject(seat)) : [];
}

/** A seat's offset, `[0, 0, 0]` where malformed. */
export function seatOffset(seat: Json | undefined): SeatOffset {
  const offset = asObject(seat).offset;
  if (!Array.isArray(offset)) return [0, 0, 0];
  const at = (index: number) => {
    const value = offset[index];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  return [at(0), at(1), at(2)];
}

/** The seat the runtime uses when `seats` is absent: on top of the hitbox at its centre. */
export function defaultSeatOffset(data: Json | undefined): SeatOffset {
  return [0, sizeOf(data)[1], 0];
}

/** The offsets the seat plan and the preview show: the written seats, or the default one. */
export function effectiveSeatOffsets(data: Json | undefined): SeatOffset[] {
  const seats = seatsOf(data);
  return seats.length === 0 ? [defaultSeatOffset(data)] : seats.map((seat) => seatOffset(seat));
}

/** Rounds to two decimal places (seat offsets dragged on the plan). */
export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Seat spacing of `seatsForCount`, in blocks (the mob riding seats' 0.7, ADR 0071 D4). */
export const SEAT_SPACING = 0.7;

/**
 * `count` seats (1 to 8) laid out in rows of two from the front, at the height of the existing
 * first seat (or the hitbox top). Existing seats keep their offsets and weapons; extra ones are
 * added in the pattern and the rest removed.
 */
export function seatsForCount(data: Json | undefined, count: number): JsonObject[] {
  const n = Math.max(1, Math.min(8, Math.round(count)));
  const existing = seatsOf(data);
  const y = existing.length > 0 ? seatOffset(existing[0])[1] : sizeOf(data)[1];
  const rows = Math.ceil(n / 2);
  const out: JsonObject[] = [];
  for (let index = 0; index < n; index += 1) {
    const kept = existing[index];
    if (kept !== undefined) {
      out.push(kept);
      continue;
    }
    const row = Math.floor(index / 2);
    const alone = n % 2 === 1 && index === n - 1;
    const x = alone ? 0 : index % 2 === 0 ? -SEAT_SPACING / 2 : SEAT_SPACING / 2;
    const z = ((rows - 1) / 2 - row) * SEAT_SPACING;
    out.push({ offset: [round2(x), round2(y), round2(z)] });
  }
  return out;
}

/** The seat plan's scale: drawing units per block, so the hitbox fills the plan. */
export function planScale(data: Json | undefined, planSize: number): number {
  const [width] = sizeOf(data);
  const reach = Math.max(
    width / 2,
    ...effectiveSeatOffsets(data).map(([x, , z]) => Math.max(Math.abs(x), Math.abs(z))),
    0.5,
  );
  return (planSize / 2 - 8) / (reach * 1.2);
}

/** Plan coordinates (origin at the centre, y down, front at the top) of a vehicle point. */
export function seatToPlan(offset: SeatOffset, scale: number, planSize: number): [number, number] {
  return [planSize / 2 + offset[0] * scale, planSize / 2 - offset[2] * scale];
}

/** The vehicle `[x, z]` (rounded to 0.05 blocks) of a plan point. */
export function planToSeat(
  point: { x: number; y: number },
  scale: number,
  planSize: number,
): [number, number] {
  const snap = (value: number) => round2(Math.round(value * 20) / 20);
  return [snap((point.x - planSize / 2) / scale), snap((planSize / 2 - point.y) / scale)];
}

// Weapons ----------------------------------------------------------------------------------------

/** The data's weapons, or `[]`. */
export function weaponsOf(data: Json | undefined): Json[] {
  const weapons = asObject(data).weapons;
  return Array.isArray(weapons) ? weapons : [];
}

/** The weapon ids of the data, in order. */
export function weaponIds(data: Json | undefined): string[] {
  return weaponsOf(data).flatMap((weapon) => {
    const id = asObject(weapon).id;
    return typeof id === 'string' && id !== '' ? [id] : [];
  });
}

/** An unused weapon id: `base`, else `base_2`, `base_3`... */
export function freeWeaponId(data: Json | undefined, base = 'weapon'): string {
  const ids = new Set(weaponIds(data));
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

/** A new weapon: arrows on the fire key, from the barrel when the turret has one. */
export function newWeapon(data: Json | undefined): JsonObject {
  const turret = asObject(asObject(data).turret);
  const bone =
    typeof turret.pitch_bone === 'string'
      ? turret.pitch_bone
      : typeof turret.bone === 'string'
        ? turret.bone
        : undefined;
  const [, height] = sizeOf(data);
  return {
    id: freeWeaponId(data),
    projectile: 'minecraft:arrow',
    muzzle: {
      ...(bone === undefined ? {} : { bone }),
      offset: [0, round2(height / 2), round2(sizeOf(data)[0] / 2)],
    },
  };
}

/** The cannon of the Very easy "Has a cannon" switch (the Tank template's, ADR 0091 D2). */
export function cannonWeapon(data: Json | undefined): JsonObject {
  const weapon = newWeapon(data);
  return {
    ...weapon,
    id: freeWeaponId(data, 'cannon'),
    projectile: 'minecraft:fire_charge',
    speed: 2.5,
    cooldown_ticks: 60,
    sound: 'minecraft:entity.generic.explode',
  };
}

/** Whether a weapon of the data fires fire charges (the "cannon" of Very easy). */
export function cannonIndex(data: Json | undefined): number {
  return weaponsOf(data).findIndex(
    (weapon) => asObject(weapon).projectile === 'minecraft:fire_charge',
  );
}

// Starter model ----------------------------------------------------------------------------------

/** The starter shape that suits the data's mode (and a turret, for a tank). */
export function suggestedShape(data: Json | undefined): VehicleShape {
  const object = asObject(data);
  switch (modeOf(data)) {
    case 'water':
      return 'motorboat';
    case 'amphibious':
      return 'hovercraft';
    case 'air':
      return 'biplane';
    case 'hover':
      return 'helicopter';
    default:
      return object.turret !== undefined || weaponsOf(data).length > 0 ? 'tank' : 'car';
  }
}

/** The words of each starter shape. */
export const SHAPE_LABELS: Readonly<Record<VehicleShape, string>> = Object.freeze({
  go_kart: 'Go-kart',
  car: 'Car',
  tank: 'Tank',
  biplane: 'Biplane',
  helicopter: 'Helicopter',
  motorboat: 'Motorboat',
  raft: 'Raft',
  hovercraft: 'Hovercraft',
});

/** A colour per starter shape (`#rrggbb`). */
export const SHAPE_COLOURS: Readonly<Record<VehicleShape, string>> = Object.freeze({
  go_kart: '#d23c32',
  car: '#3c6edc',
  tank: '#5f6e3a',
  biplane: '#c8a03c',
  helicopter: '#46505a',
  motorboat: '#f0f0f0',
  raft: '#8c643c',
  hovercraft: '#e68228',
});

/** `ns:path` split, `minecraft` when there is no namespace. */
function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/** The asset of a texture id: `ns:entity/x` is `assets/ns/textures/entity/x.png`. */
export function textureAssetOf(textureId: string): { namespace: string; path: string } {
  const { namespace, path } = splitId(textureId);
  return { namespace, path: `textures/${path}.png` };
}

/** `#rrggbb` as `[r, g, b]`, or grey when malformed. */
export function rgbOf(colour: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(colour.trim());
  if (match === null) return [128, 128, 128];
  const value = Number.parseInt(match[1] as string, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** A small, fixed per-pixel shade (0.88 to 1.08), so painted faces are not flat. */
function speckle(x: number, y: number): number {
  let h = Math.imul((x * 73856093) ^ (y * 19349663), 0x9e3779b1) >>> 0;
  h ^= h >>> 15;
  return 0.88 + ((h % 1000) / 1000) * 0.2;
}

/** A starter texture: `width` by `height` RGBA pixels of `colour` with a faint speckle. */
export function starterTexturePixels(
  width: number,
  height: number,
  colour: string,
): Uint8ClampedArray {
  const [r, g, b] = rgbOf(colour);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shade = speckle(x, y);
      const at = (y * width + x) * 4;
      out[at] = r * shade;
      out[at + 1] = g * shade;
      out[at + 2] = b * shade;
      out[at + 3] = 255;
    }
  }
  return out;
}

/**
 * `pixels` tinted to `colour`, keeping their light and shade (each pixel's brightness times the
 * colour) and their transparency: Very easy's "Colour" on a texture that already has detail.
 */
export function tintPixels(pixels: Uint8ClampedArray, colour: string): Uint8ClampedArray {
  const [r, g, b] = rgbOf(colour);
  const out = new Uint8ClampedArray(pixels.length);
  for (let at = 0; at + 3 < pixels.length; at += 4) {
    const light =
      (0.299 * (pixels[at] ?? 0) + 0.587 * (pixels[at + 1] ?? 0) + 0.114 * (pixels[at + 2] ?? 0)) /
      255;
    const lift = 0.35 + light * 0.9;
    out[at] = r * lift;
    out[at + 1] = g * lift;
    out[at + 2] = b * lift;
    out[at + 3] = pixels[at + 3] ?? 255;
  }
  return out;
}

/** The texture size a geometry asks for (`texture_width`, `texture_height`), 64 by default. */
export function geometryTextureSize(geometry: Json | undefined): { width: number; height: number } {
  const list = asObject(geometry)['minecraft:geometry'];
  const description = asObject(Array.isArray(list) ? asObject(list[0]).description : undefined);
  const side = (value: Json | undefined) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1024 ? value : 64;
  return { width: side(description.texture_width), height: side(description.texture_height) };
}

/** Whether the project records the asset. */
export function hasAsset(project: Project, namespace: string, path: string): boolean {
  return (
    project.namespaces
      .find((entry) => entry.name === namespace)
      ?.assets.some((asset) => asset.path === path) ?? false
  );
}

/** The change that writes `bytes` to a texture: an asset item when new, else a write. */
export function textureWrite(
  project: Project,
  textureId: string,
  bytes: Uint8Array,
): { items: ChangeItem[]; writes: ChangeAsset[] } {
  const { namespace, path } = textureAssetOf(textureId);
  const asset = { namespace, path, bytes };
  if (hasAsset(project, namespace, path)) return { items: [], writes: [asset] };
  return {
    items: [
      {
        itemId: `vehicle-texture:${namespace}:${path}`,
        op: 'asset',
        asset,
        accepted: true,
        problems: [],
      },
    ],
    writes: [],
  };
}

/** What "Make a starter model" applies. */
export interface StarterModelPlan {
  items: ChangeItem[];
  writes: ChangeAsset[];
  label: string;
  geometryId: string;
  textureId: string;
}

/**
 * "Make a starter model": the geometry of `shape` as an `msm:geo_model` element (created, or
 * replaced when the vehicle's geometry id already names one), a one-colour texture of the
 * geometry's size (`encode` turns pixels into PNG bytes), and the vehicle's `model.geometry`
 * and `model.texture` pointing at them, as one undo step. The ids are the vehicle's own when set,
 * else `<ns>:entity/<path>` of the vehicle (the templates' convention). Parts and the turret are
 * then filled in from the bone names where the vehicle has none ({@link withGuessedParts}).
 */
export function starterModelPlan(
  project: Project,
  vehicle: Element,
  shape: VehicleShape,
  colour: string,
  encode: (width: number, height: number, pixels: Uint8ClampedArray) => Uint8Array,
): StarterModelPlan {
  const own = splitId(vehicle.id);
  const conventional = `${own.namespace}:entity/${own.path}`;
  const geometryId = geometryIdOf(vehicle.data) || conventional;
  const textureId = textureIdOf(vehicle.data) || conventional;
  const geometryName =
    splitId(geometryId).path.split('/').at(-1)?.replaceAll('/', '.') ?? 'vehicle';
  const geometry = vehicleGeometry(shape, geometryName);
  const existing = geometryElement(project, geometryId);
  const items: ChangeItem[] = [
    existing === undefined
      ? {
          itemId: `vehicle-geometry:${geometryId}`,
          op: 'create',
          elementId: geometryId as ResourceLocation,
          kind: GEO_MODEL_KIND,
          after: geometry,
          accepted: true,
          problems: [],
        }
      : {
          itemId: `vehicle-geometry:${geometryId}`,
          op: 'update',
          elementId: geometryId as ResourceLocation,
          kind: GEO_MODEL_KIND,
          before: existing.data,
          after: geometry,
          accepted: true,
          problems: [],
        },
  ];
  const { width, height } = geometryTextureSize(geometry);
  const texture = textureWrite(
    project,
    textureId,
    encode(width, height, starterTexturePixels(width, height, colour)),
  );
  const data = asObject(vehicle.data);
  const nextModel = { ...asObject(data.model), geometry: geometryId, texture: textureId };
  const next = withGuessedParts({ ...data, model: nextModel }, boneNames(geometry));
  items.push({
    itemId: `vehicle:${vehicle.id}`,
    op: 'update',
    elementId: vehicle.id,
    kind: vehicle.kind,
    before: vehicle.data,
    after: next,
    accepted: true,
    problems: [],
  });
  items.push(...texture.items);
  return {
    items,
    writes: texture.writes,
    label: `Make a starter model (${SHAPE_LABELS[shape]})`,
    geometryId,
    textureId,
  };
}
