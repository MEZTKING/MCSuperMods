/**
 * Lowering of the `msm:storage` entity component (ADR 0098 D3, mount inventories). The component
 * passes through to the runtime definition with its defaults written out (`rows` 3,
 * `needs_chest` false), so the runtime and the vehicle batch's shared `MobStorage` read one
 * shape. The open and close sounds stay absent when unset: the runtime plays vanilla's chest
 * sounds. Nothing is written to packs; contents live on the mob.
 */
import type { JsonObject } from '@msm/plugin-api';
import { isRecord } from './paths';

/** Component name of mob storage. */
export const STORAGE_COMPONENT = 'msm:storage';
/** Rows of nine slots when `rows` is absent (ADR 0098 D3). */
export const DEFAULT_STORAGE_ROWS = 3;

/**
 * The runtime form of an `msm:storage` component: a copy with `rows` and `needs_chest` set to
 * their defaults when absent.
 *
 * @param component - The component as the element holds it.
 * @returns A new object; the input is not changed.
 */
export function storageDefinition(component: JsonObject): JsonObject {
  const definition = structuredClone(component);
  definition.rows ??= DEFAULT_STORAGE_ROWS;
  definition.needs_chest ??= false;
  return definition;
}

/** Applies {@link storageDefinition} to a definition's components in place. */
export function lowerStorageComponent(components: JsonObject): void {
  const storage = components[STORAGE_COMPONENT];
  if (isRecord(storage)) components[STORAGE_COMPONENT] = storageDefinition(storage);
}
