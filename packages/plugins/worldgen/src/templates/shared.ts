/**
 * Helpers shared by the worldgen templates.
 */
import type { ElementTemplate, Json, TemplateContext } from '@msm/plugin-api';

/** Picker categories (ADR 0022 D9). */
export const BIOMES = 'Biomes';
export const FEATURES = 'Features';
export const DIMENSIONS = 'Dimensions';
export const ADVANCED = 'Worldgen (advanced)';

/**
 * A template whose data does not depend on the context.
 *
 * @param fields - Everything but `data`.
 * @param data - The starting data; deep-copied on every call.
 */
export function fixed(fields: Omit<ElementTemplate, 'data'>, data: Json): ElementTemplate {
  return { ...fields, data: () => structuredClone(data) };
}

/**
 * A template whose data names the new element's own id, for example a placed feature that
 * places the configured feature of the same id.
 *
 * @param fields - Everything but `data`.
 * @param build - Builds the data from the new element's id.
 */
export function ownId(
  fields: Omit<ElementTemplate, 'data'>,
  build: (id: string) => Json,
): ElementTemplate {
  return { ...fields, data: (context: TemplateContext) => build(context.id) };
}
