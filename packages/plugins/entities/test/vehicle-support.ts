/**
 * Test helpers for vehicles: the target indexes of `./support` with the project ids vehicle
 * samples and templates reference (their textures, item pictures and item ids).
 */
import type { Element, Json } from '@msm/plugin-api';
import { createRegistryIndex, type RegistryIndex } from '@msm/schemas';
import type { TargetBundle } from '@msm/targets';
import { indexesFor, PROJECT_IDS, type TargetIndexes } from './support';

/** Project ids added for vehicles, per registry. */
const VEHICLE_IDS: Readonly<Record<string, readonly string[]>> = {
  entity_type: ['example:car', 'example:tank'],
  item: ['example:car', 'example:tank', 'example:shell'],
  texture: [
    'example:entity/car',
    'example:entity/car_red',
    'example:item/car',
    'example:entity/tank',
    'example:entity/tank_desert',
  ],
  // The flat item models lowering writes next to the item definition (the host counts them).
  model: ['example:item/car', 'example:item/tank_model'],
};

/** A registry index of `indexes`' vanilla ids, the shared project ids and `extra`. */
export function registryWith(
  indexes: TargetIndexes,
  extra: Readonly<Record<string, readonly string[]>> = {},
): RegistryIndex {
  const project: Record<string, string[]> = {};
  for (const source of [PROJECT_IDS, VEHICLE_IDS, extra]) {
    for (const [registry, ids] of Object.entries(source)) {
      project[registry] = [...(project[registry] ?? []), ...ids];
    }
  }
  return createRegistryIndex({ vanilla: indexes.vanilla, project });
}

/** The indexes of `bundle` with the vehicle project ids (and `extra`). */
export async function vehicleIndexesFor(
  bundle: TargetBundle,
  extra: Readonly<Record<string, readonly string[]>> = {},
): Promise<TargetIndexes> {
  const indexes = await indexesFor(bundle);
  return { ...indexes, registries: registryWith(indexes, extra) };
}

/**
 * The project ids a vehicle element adds for its own references: its textures, its item and
 * the flat item model lowering writes.
 */
export function ownIds(created: Element): Record<string, string[]> {
  const textures = new Set<string>();
  const walk = (value: Json, key?: string): void => {
    if (typeof value === 'string') {
      if (key === 'texture') textures.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, key);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [field, entry] of Object.entries(value)) walk(entry as Json, field);
    }
  };
  walk(created.data);
  const colon = created.id.indexOf(':');
  const itemModel = `${created.id.slice(0, colon)}:item/${created.id.slice(colon + 1)}`;
  return {
    entity_type: [created.id],
    item: [created.id],
    texture: [...textures],
    model: [itemModel],
  };
}
