/**
 * Cross-element checks of vehicles (ADR 0090). Every validator is pure and reads only the
 * project's elements, the target's facts and the registry ids. Ids the schema already checks
 * (fuel, ammunition, repair and dye items, `immune_to`, sounds, textures, the exhaust particle)
 * are not checked again: `schema.unknown-id` reports them. Codes:
 *
 * - `vehicles.unknown-mode` (error): `movement.mode` is not a mode of the target
 *   (`target.vehicles.modes`). Skipped on a target without vehicle facts.
 * - `vehicles.too-fast` (error): `movement.max_speed` is above the target's cap
 *   (`target.vehicles.maxSpeed`), past which vanilla's movement check would snap the vehicle
 *   back (ADR 0090 D4). Skipped on a target without vehicle facts.
 * - `vehicles.takeoff-too-fast` (warning): an `air` vehicle whose `takeoff_speed` is above its
 *   top speed never leaves the ground.
 * - `vehicles.unknown-geometry` (warning): `model.geometry` is not an `msm:geo_model` element of
 *   the project, so the vehicle is drawn as nothing.
 * - `vehicles.unknown-bone` (warning): a bone named by `turret`, `parts` or a weapon's `muzzle`
 *   is not in the geometry, so nothing turns (or the shot starts at the hull). Only checked
 *   when the geometry is a project element.
 * - `vehicles.unknown-animations` (warning): `model.animations` is set but is not an
 *   `msm:animation` element of the project, so nothing plays.
 * - `vehicles.vanilla-renderer-subset` (warning): vehicles always draw with the runtime's own
 *   renderer (ADR 0090 D10), which plays a subset of an animation set (ADR 0072 D3): Molang as
 *   0, easings other than linear and catmullrom as linear, no sound, particle or instruction
 *   keyframes.
 * - `vehicles.unknown-projectile` (error): a weapon's `projectile` is neither a vanilla
 *   projectile item of the target (`target.entities.projectileItems`) nor a project `msm:item`
 *   with `msm:throwable`. Skipped on a target without entity facts.
 * - `vehicles.duplicate-weapon-id` (error): two weapons share an `id` (seats name weapons by
 *   id and the vehicle saves ammunition by it).
 * - `vehicles.unknown-seat-weapon` (error): a seat's `weapons` names a weapon the vehicle does
 *   not have.
 * - `vehicles.turret-seat-missing` (error): `turret.seat` is past the last seat, so nobody aims
 *   the turret.
 * - `vehicles.duplicate-paint-id` (error): two paints share an `id` (saved in the vehicle and its
 *   item).
 * - `vehicles.item-used-twice` (warning): one item is used for two jobs (fuel, ammunition,
 *   repair, paint), so using it on the vehicle does only one of them. Weapons sharing one
 *   ammunition item are allowed.
 * - `vehicles.item-picture-missing` (warning): the vehicle's item has neither `item.model` nor
 *   `item.texture`, so it shows as the missing-model cube.
 * - `vehicles.unknown-event` (error): `on_place`, `on_mount`, `on_dismount`, `on_destroy`,
 *   `on_tick.event`, a weapon's `on_fire` or a `trigger_event` action names an event the vehicle
 *   does not declare.
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  TargetFacts,
} from '@msm/plugin-api';
import { ANIMATION_KIND, GEO_MODEL_KIND, VEHICLE_KIND } from './kinds';
import { isRecord } from './lowering/paths';
import { boneNames, unsupportedFeatures } from './validators-mobs';

/** Every code the vehicle validators report. */
export const VEHICLE_PROBLEM_CODES = Object.freeze([
  'vehicles.unknown-mode',
  'vehicles.too-fast',
  'vehicles.takeoff-too-fast',
  'vehicles.unknown-geometry',
  'vehicles.unknown-bone',
  'vehicles.unknown-animations',
  'vehicles.vanilla-renderer-subset',
  'vehicles.unknown-projectile',
  'vehicles.duplicate-weapon-id',
  'vehicles.unknown-seat-weapon',
  'vehicles.turret-seat-missing',
  'vehicles.duplicate-paint-id',
  'vehicles.item-used-twice',
  'vehicles.item-picture-missing',
  'vehicles.unknown-event',
] as const);

/** The kind of `@msm/plugin-blocks-items` items, read by kind string only. */
const ITEM_KIND = 'msm:item';

/** A plane's top speed when `max_speed` is absent (ADR 0090 D3). */
export const DEFAULT_AIR_MAX_SPEED = 1.2;

/** RFC 6901 escaping of one reference token. */
const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;
const list = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : []);

const vehicles = (elements: readonly Element[]): Element[] =>
  elements.filter((element) => element.kind === VEHICLE_KIND);

const byId = (elements: readonly Element[], kind: string): Map<string, Element> =>
  new Map(
    elements.filter((element) => element.kind === kind).map((element) => [element.id, element]),
  );

/** The weapons, with their index. */
function weaponsOf(element: Element): { weapon: JsonObject; index: number }[] {
  const found: { weapon: JsonObject; index: number }[] = [];
  list(dataOf(element).weapons).forEach((weapon, index) => {
    const fields = record(weapon);
    if (fields !== undefined) found.push({ weapon: fields, index });
  });
  return found;
}

// Movement --------------------------------------------------------------------------------

function movementChecks(elements: readonly Element[], target: TargetFacts): Problem[] {
  const facts = target.vehicles;
  const problems: Problem[] = [];
  for (const element of vehicles(elements)) {
    const movement = record(dataOf(element).movement);
    if (movement === undefined) continue;
    const mode = movement.mode;
    if (facts !== undefined && typeof mode === 'string' && !facts.modes.includes(mode)) {
      problems.push({
        severity: 'error',
        code: 'vehicles.unknown-mode',
        elementId: element.id,
        path: '/movement/mode',
        message: `"${mode}" is not a way vehicles move in ${target.mcVersion}. Pick one of: ${facts.modes.join(', ')}.`,
      });
    }
    const maxSpeed = movement.max_speed;
    if (facts !== undefined && typeof maxSpeed === 'number' && maxSpeed > facts.maxSpeed) {
      problems.push({
        severity: 'error',
        code: 'vehicles.too-fast',
        elementId: element.id,
        path: '/movement/max_speed',
        message: `A top speed of ${maxSpeed} blocks a tick is above the ${facts.maxSpeed} the game allows in ${target.mcVersion}; the server would pull the vehicle back. Lower "max_speed".`,
      });
    }
    const takeoff = movement.takeoff_speed;
    const top = typeof maxSpeed === 'number' ? maxSpeed : DEFAULT_AIR_MAX_SPEED;
    if (mode === 'air' && typeof takeoff === 'number' && takeoff > top) {
      problems.push({
        severity: 'warning',
        code: 'vehicles.takeoff-too-fast',
        elementId: element.id,
        path: '/movement/takeoff_speed',
        message: `This plane needs ${takeoff} blocks a tick to take off but its top speed is ${top}, so it never leaves the ground. Lower "takeoff_speed" or raise "max_speed".`,
      });
    }
  }
  return problems;
}

// Model -----------------------------------------------------------------------------------

/** Every bone the vehicle names, with its JSON pointer. */
function namedBones(element: Element): { bone: string; path: string }[] {
  const data = dataOf(element);
  const found: { bone: string; path: string }[] = [];
  const add = (value: Json | undefined, ...keys: (string | number)[]): void => {
    if (typeof value === 'string' && value.length > 0)
      found.push({ bone: value, path: pointer(...keys) });
  };
  const turret = record(data.turret);
  add(turret?.bone, 'turret', 'bone');
  add(turret?.pitch_bone, 'turret', 'pitch_bone');
  const parts = record(data.parts);
  for (const field of ['wheels', 'steering', 'rotors', 'propellers'] as const) {
    list(parts?.[field]).forEach((bone, index) => {
      add(bone, 'parts', field, index);
    });
  }
  for (const { weapon, index } of weaponsOf(element)) {
    add(record(weapon.muzzle)?.bone, 'weapons', index, 'muzzle', 'bone');
  }
  return found;
}

const listed = (names: readonly string[]): string => names.map((name) => `"${name}"`).join(', ');

function rendererSubset(element: Element, set: Element): Problem | undefined {
  const found = unsupportedFeatures(set);
  const parts: string[] = [];
  if (found.molang.length > 0) parts.push(`Molang expressions play as 0 (${listed(found.molang)})`);
  if (found.easing.length > 0) {
    parts.push(`easings other than linear and catmullrom play as linear (${listed(found.easing)})`);
  }
  if (found.sound.length > 0) parts.push(`sound keyframes are silent (${listed(found.sound)})`);
  if (found.particle.length > 0) {
    parts.push(`particle keyframes show nothing (${listed(found.particle)})`);
  }
  if (found.instruction.length > 0) {
    parts.push(`instruction keyframes are skipped (${listed(found.instruction)})`);
  }
  if (parts.length === 0) return undefined;
  return {
    severity: 'warning',
    code: 'vehicles.vanilla-renderer-subset',
    elementId: element.id,
    path: '/model/animations',
    message: `Vehicles are drawn by MSM's own renderer, which plays a subset of animation set "${set.id}": ${parts.join('; ')}. Use plain numbers and linear or catmullrom keyframes.`,
  };
}

function modelChecks(elements: readonly Element[]): Problem[] {
  const models = byId(elements, GEO_MODEL_KIND);
  const sets = byId(elements, ANIMATION_KIND);
  const problems: Problem[] = [];
  for (const element of vehicles(elements)) {
    const model = record(dataOf(element).model);
    if (model === undefined) continue;
    const geometryId = model.geometry;
    const geometry = typeof geometryId === 'string' ? models.get(geometryId) : undefined;
    if (geometry === undefined && typeof geometryId === 'string') {
      problems.push({
        severity: 'warning',
        code: 'vehicles.unknown-geometry',
        elementId: element.id,
        path: '/model/geometry',
        message:
          geometryId.length === 0
            ? 'This vehicle has no model, so nothing is drawn. Pick a geo model, or import one from Blockbench.'
            : `Geo model "${geometryId}" is not in the project, so nothing is drawn. Add or import it, or pick an existing geo model.`,
      });
    }
    if (geometry !== undefined) {
      const names = boneNames(geometry);
      for (const { bone, path } of namedBones(element)) {
        if (names.has(bone)) continue;
        problems.push({
          severity: 'warning',
          code: 'vehicles.unknown-bone',
          elementId: element.id,
          path,
          message: `Bone "${bone}" is not in geo model "${geometry.id}", so nothing turns there. Pick one of: ${[...names].sort().join(', ') || '(none)'}.`,
        });
      }
    }
    const setId = model.animations;
    if (typeof setId !== 'string') continue;
    const set = sets.get(setId);
    if (set === undefined) {
      problems.push({
        severity: 'warning',
        code: 'vehicles.unknown-animations',
        elementId: element.id,
        path: '/model/animations',
        message:
          setId.length === 0
            ? 'The animation set is empty. Pick an animation set, or remove the field for a vehicle without animations.'
            : `Animation set "${setId}" is not in the project, so nothing plays. Add or import it, or pick an existing animation set.`,
      });
      continue;
    }
    const subset = rendererSubset(element, set);
    if (subset !== undefined) problems.push(subset);
  }
  return problems;
}

// Weapons, seats and turret -----------------------------------------------------------------

function projectileChecks(elements: readonly Element[], target: TargetFacts): Problem[] {
  const vanilla = target.entities?.projectileItems;
  if (vanilla === undefined) return [];
  const known = new Set(vanilla);
  const items = byId(elements, ITEM_KIND);
  const problems: Problem[] = [];
  for (const element of vehicles(elements)) {
    for (const { weapon, index } of weaponsOf(element)) {
      const projectile = weapon.projectile;
      if (typeof projectile !== 'string' || known.has(projectile)) continue;
      const item = items.get(projectile);
      if (item !== undefined && record(record(dataOf(item).components)?.['msm:throwable'])) {
        continue;
      }
      problems.push({
        severity: 'error',
        code: 'vehicles.unknown-projectile',
        elementId: element.id,
        path: pointer('weapons', index, 'projectile'),
        message:
          item === undefined
            ? `"${projectile}" cannot be fired: it is not a vanilla projectile item of ${target.mcVersion} (such as minecraft:arrow or minecraft:fire_charge) nor a project item. Pick a projectile item, or a project item with "msm:throwable".`
            : `Project item "${projectile}" has no "msm:throwable" component, so the vehicle cannot fire it. Add "msm:throwable" to the item, or pick a vanilla projectile item.`,
      });
    }
  }
  return problems;
}

function weaponAndSeatChecks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of vehicles(elements)) {
    const data = dataOf(element);
    const ids = new Set<string>();
    for (const { weapon, index } of weaponsOf(element)) {
      const id = weapon.id;
      if (typeof id !== 'string') continue;
      if (ids.has(id)) {
        problems.push({
          severity: 'error',
          code: 'vehicles.duplicate-weapon-id',
          elementId: element.id,
          path: pointer('weapons', index, 'id'),
          message: `Weapon id "${id}" is used more than once. Seats name weapons by id and the vehicle keeps each weapon's ammunition under it; rename one of them.`,
        });
      }
      ids.add(id);
    }
    const seats = list(data.seats);
    seats.forEach((seat, seatIndex) => {
      list(record(seat)?.weapons).forEach((weapon, index) => {
        if (typeof weapon !== 'string' || ids.has(weapon)) return;
        problems.push({
          severity: 'error',
          code: 'vehicles.unknown-seat-weapon',
          elementId: element.id,
          path: pointer('seats', seatIndex, 'weapons', index),
          message: `Seat ${seatIndex + 1} fires weapon "${weapon}", which this vehicle does not have. Pick one of: ${[...ids].sort().join(', ') || '(none)'}.`,
        });
      });
    });
    const turretSeat = record(data.turret)?.seat;
    const seatCount = Array.isArray(data.seats) ? seats.length : 1;
    if (typeof turretSeat === 'number' && turretSeat >= seatCount) {
      problems.push({
        severity: 'error',
        code: 'vehicles.turret-seat-missing',
        elementId: element.id,
        path: '/turret/seat',
        message: `The turret is aimed from seat ${turretSeat + 1}, but the vehicle has ${seatCount} seat${seatCount === 1 ? '' : 's'}, so nobody aims it. Pick a seat from 0 to ${seatCount - 1}, or add seats.`,
      });
    }
  }
  return problems;
}

// Items and paint ---------------------------------------------------------------------------

/** One item use of a vehicle: what it does and where it is named. */
interface ItemUse {
  item: string;
  job: 'fuel' | 'ammunition' | 'repair' | 'paint';
  path: string;
}

function itemUses(element: Element): ItemUse[] {
  const data = dataOf(element);
  const uses: ItemUse[] = [];
  const add = (item: Json | undefined, job: ItemUse['job'], ...keys: (string | number)[]): void => {
    if (typeof item === 'string' && item.length > 0)
      uses.push({ item, job, path: pointer(...keys) });
  };
  const fuel = record(record(data.engine)?.fuel);
  list(fuel?.items).forEach((entry, index) => {
    add(record(entry)?.item, 'fuel', 'engine', 'fuel', 'items', index, 'item');
  });
  for (const { weapon, index } of weaponsOf(element)) {
    add(record(weapon.ammo)?.item, 'ammunition', 'weapons', index, 'ammo', 'item');
  }
  list(record(data.health)?.repair).forEach((entry, index) => {
    add(record(entry)?.item, 'repair', 'health', 'repair', index, 'item');
  });
  list(record(data.model)?.paints).forEach((entry, index) => {
    add(record(entry)?.dye, 'paint', 'model', 'paints', index, 'dye');
  });
  return uses;
}

function itemChecks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of vehicles(elements)) {
    const data = dataOf(element);
    const seen = new Map<string, ItemUse>();
    for (const use of itemUses(element)) {
      const first = seen.get(use.item);
      if (first === undefined) {
        seen.set(use.item, use);
        continue;
      }
      if (first.job === 'ammunition' && use.job === 'ammunition') continue;
      problems.push({
        severity: 'warning',
        code: 'vehicles.item-used-twice',
        elementId: element.id,
        path: use.path,
        message:
          first.job === use.job
            ? `"${use.item}" is listed twice as ${use.job}. Remove one of the entries.`
            : `"${use.item}" is used both for ${first.job} and for ${use.job}, so using it on the vehicle does only one of them. Pick another item for one job.`,
      });
    }
    const paintIds = new Set<string>();
    list(record(data.model)?.paints).forEach((paint, index) => {
      const id = record(paint)?.id;
      if (typeof id !== 'string') return;
      if (paintIds.has(id)) {
        problems.push({
          severity: 'error',
          code: 'vehicles.duplicate-paint-id',
          elementId: element.id,
          path: pointer('model', 'paints', index, 'id'),
          message: `Paint id "${id}" is used more than once. The vehicle and its item keep the paint by id; rename one of them.`,
        });
      }
      paintIds.add(id);
    });
    const item = record(data.item);
    const hasPicture = [item?.model, item?.texture].some(
      (value) => typeof value === 'string' && value.length > 0,
    );
    if (!hasPicture) {
      problems.push({
        severity: 'warning',
        code: 'vehicles.item-picture-missing',
        elementId: element.id,
        path: item === undefined ? '/item' : '/item/texture',
        message:
          'The vehicle\'s item has no picture, so it shows as the missing-model cube. Set "item" "texture" to an item picture, or "model" to an item model.',
      });
    }
  }
  return problems;
}

// Events ------------------------------------------------------------------------------------

/** Every event reference of a vehicle: the triggers, the weapons' `on_fire` and `trigger_event` actions. */
function eventReferences(element: Element): { event: string; path: string }[] {
  const data = dataOf(element);
  const found: { event: string; path: string }[] = [];
  const add = (value: Json | undefined, ...keys: (string | number)[]): void => {
    if (typeof value === 'string') found.push({ event: value, path: pointer(...keys) });
  };
  for (const field of ['on_place', 'on_mount', 'on_dismount', 'on_destroy'] as const) {
    add(data[field], field);
  }
  add(record(data.on_tick)?.event, 'on_tick', 'event');
  for (const { weapon, index } of weaponsOf(element))
    add(weapon.on_fire, 'weapons', index, 'on_fire');
  for (const [name, event] of Object.entries(record(data.events) ?? {})) {
    list(record(event)?.actions).forEach((action, index) => {
      const fields = record(action);
      if (fields?.type === 'trigger_event') {
        add(fields.event, 'events', name, 'actions', index, 'event');
      }
    });
  }
  return found;
}

function eventChecks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of vehicles(elements)) {
    const declared = new Set(Object.keys(record(dataOf(element).events) ?? {}));
    for (const { event, path } of eventReferences(element)) {
      if (declared.has(event)) continue;
      problems.push({
        severity: 'error',
        code: 'vehicles.unknown-event',
        elementId: element.id,
        path,
        message: `Event "${event}" is not declared in this vehicle's "events". Add it there or pick an existing event.`,
      });
    }
  }
  return problems;
}

/** The vehicle validators (ADR 0090), registered after the mob validators. */
export const entitiesVehicleValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.entities.vehicle-movement',
    kinds: [VEHICLE_KIND],
    validate: ({ elements, target }) => movementChecks(elements, target),
  },
  {
    id: 'msm.entities.vehicle-model',
    kinds: [VEHICLE_KIND, GEO_MODEL_KIND, ANIMATION_KIND],
    validate: ({ elements }) => modelChecks(elements),
  },
  {
    id: 'msm.entities.vehicle-weapons',
    kinds: [VEHICLE_KIND, ITEM_KIND],
    validate: ({ elements, target }) => [
      ...projectileChecks(elements, target),
      ...weaponAndSeatChecks(elements),
    ],
  },
  {
    id: 'msm.entities.vehicle-items',
    kinds: [VEHICLE_KIND],
    validate: ({ elements }) => itemChecks(elements),
  },
  {
    id: 'msm.entities.vehicle-events',
    kinds: [VEHICLE_KIND],
    validate: ({ elements }) => eventChecks(elements),
  },
] satisfies ProjectValidator[]);
