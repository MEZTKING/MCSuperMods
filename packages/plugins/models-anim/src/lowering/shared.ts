/**
 * Lowering shared by geo models and animations: both write the element data unchanged, except
 * that a numeric `format_version` becomes a string (GeckoLib and the schema expect one).
 */
import type { Element, JsonObject } from '@msm/plugin-api';
import { isRecord, ModelsAnimLoweringError } from './paths';

/**
 * A deep copy of the element data with `format_version` as a string.
 *
 * @throws {@link ModelsAnimLoweringError} If the data is not an object.
 */
export function normalisedContents(element: Element, what: string): JsonObject {
  if (!isRecord(element.data)) {
    throw new ModelsAnimLoweringError(`Element ${element.id}: ${what} data must be an object.`);
  }
  const contents = structuredClone(element.data);
  if (typeof contents.format_version === 'number') {
    contents.format_version = String(contents.format_version);
  }
  return contents;
}
