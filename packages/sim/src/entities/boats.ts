/**
 * Boats of project woods in Try it (B540, ADR 0110 as amended after B524): every project item
 * with `msm:boat` (and, with `chest`, its companion `<wood>_chest_boat` or `_chest_raft`) becomes
 * a vehicle type of the preview's vehicles (`vehicles/`, B428), so it is placed on water from
 * its item, ridden (Shift gets out) and picked up by a hit as a mock-up.
 *
 * The game uses vanilla's own boat: its paddling, ice and water handling, two seats, the chest
 * boat's menu and its drawing with the wood's pictures. The preview drives it with its own water
 * vehicle numbers (`vehicles/physics.ts`, the `water` mode's defaults), seats two as vanilla's
 * boat does, and the view draws it as a box of the oak boat's size; all of that is said once
 * when a boat is first placed.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { readJsonFile } from '../blocks/catalogue.js';
import { plainName } from '../events/definitions.js';
import type { SimFiles, SimOrigin } from '../types.js';
import type { CatalogueVehicle, VehicleCatalogue } from '../vehicles/catalogue.js';
import { resolveMovement } from '../vehicles/physics.js';

/** Vanilla's oak boat's size (B524: 1.375 by 0.5625), which project boats take. */
export const BOAT_WIDTH = 1.375;
export const BOAT_HEIGHT = 0.5625;

/** What a boat vehicle type of the preview stands for (the view reads it for its look). */
export interface BoatLook {
  /** The boat item the companion belongs to (itself for the boat). */
  readonly boat: string;
  readonly chest: boolean;
  readonly raft: boolean;
}

/** The facts the boats read from a target: the language folder's name. */
export interface BoatsTarget {
  readonly folders: { readonly resource: { readonly lang: string } };
}

const ITEM_PATH = /^msm\/([a-z0-9_.-]+)\/item\/([a-z0-9_./-]+)\.json$/;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** The wood of a boat item, as the lowering names the companion: its path without `_boat`/`_raft`. */
export function boatWood(itemPath: string): string {
  return itemPath.replace(/_(boat|raft)$/, '');
}

/** The vehicle types of the project's boats, in item id order. */
export function readBoats(files: SimFiles, target: BoatsTarget): CatalogueVehicle[] {
  const out: CatalogueVehicle[] = [];
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
  for (const path of [...files.keys()].filter((one) => ITEM_PATH.test(one)).sort()) {
    const match = ITEM_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const itemPath = match[2] as string;
    const definition = readJsonFile(files, path);
    if (!isRecord(definition) || !isRecord(definition.components)) continue;
    const boat = definition.components['msm:boat'];
    if (!isRecord(boat)) continue;
    const id = `${namespace}:${itemPath}`;
    const raft = boat.raft === true;
    const lang = langOf(namespace);
    const key = itemPath.replaceAll('/', '.');
    const name =
      str(lang[`item.${namespace}.${key}`]) ??
      str(lang[`entity.${namespace}.${key}`]) ??
      plainName(id);
    out.push(boatVehicle(id, name, { boat: id, chest: false, raft }));
    if (boat.chest === true) {
      const chestPath = `${boatWood(itemPath)}_chest_${raft ? 'raft' : 'boat'}`;
      const chestId = `${namespace}:${chestPath}`;
      const chestKey = chestPath.replaceAll('/', '.');
      const chestName =
        str(lang[`item.${namespace}.${chestKey}`]) ??
        str(lang[`entity.${namespace}.${chestKey}`]) ??
        `${name} with Chest`;
      out.push(boatVehicle(chestId, chestName, { boat: id, chest: true, raft }));
    }
  }
  return out;
}

function boatVehicle(id: string, displayName: string, look: BoatLook): CatalogueVehicle {
  const origin: SimOrigin = Object.freeze({ elementId: look.boat });
  const kind = look.raft ? 'raft' : 'boat';
  const onlyInMinecraft = [
    `${displayName} is vanilla's ${kind} in the game: its paddling, its handling on ice and water, and its drawing with your wood pictures. The preview drives it with its own water vehicle numbers and draws it as a box`,
    `${displayName} is solid only in the game: in the preview you and the mobs walk through vehicles`,
    ...(look.chest
      ? [`${displayName}'s chest (27 slots, opened by sneaking and using it) is only in the game`]
      : []),
  ];
  return Object.freeze({
    id,
    displayName,
    // No `model`: the view draws a box. `msm:boat` tells it this is a boat (B540).
    definition: Object.freeze({ 'msm:boat': { ...look } }) as unknown as JsonObject,
    mode: 'water' as const,
    constants: resolveMovement({ mode: 'water' }),
    width: BOAT_WIDTH,
    height: BOAT_HEIGHT,
    // Two seats, as vanilla's boat (a chest boat seats one).
    seats: look.chest
      ? [{ offset: [0, BOAT_HEIGHT, 0] as const }]
      : [{ offset: [0, BOAT_HEIGHT, 0.2] as const }, { offset: [0, BOAT_HEIGHT, -0.6] as const }],
    placesOn: 'water' as const,
    pickUp: true,
    maxHealth: 40,
    repair: [],
    owner: Object.freeze({
      id,
      kind: 'entity' as const,
      displayName,
      events: new Map(),
      triggers: new Map(),
      origin,
    }),
    onlyInMinecraft: Object.freeze(onlyInMinecraft),
    origin,
  });
}

/** The boat look of a vehicle type the preview made from a boat item, or `null`. */
export function boatLookOf(vehicle: Pick<CatalogueVehicle, 'definition'>): BoatLook | null {
  const look = (vehicle.definition as Record<string, unknown>)['msm:boat'];
  return typeof look === 'object' && look !== null ? (look as BoatLook) : null;
}

/** A vehicle catalogue with the boats after the project's vehicles (a vehicle's id wins). */
export function withBoats(
  vehicles: VehicleCatalogue,
  boats: readonly CatalogueVehicle[],
): VehicleCatalogue {
  if (boats.length === 0) return vehicles;
  const extra = boats.filter((boat) => vehicles.get(boat.id) === undefined);
  const byId = new Map(extra.map((boat) => [boat.id, boat] as const));
  const ids = Object.freeze([...vehicles.ids(), ...extra.map((boat) => boat.id)]);
  return { ids: () => ids, get: (id) => vehicles.get(id) ?? byId.get(id) };
}
