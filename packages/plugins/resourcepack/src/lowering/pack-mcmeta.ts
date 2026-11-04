/**
 * Lowering for `pack.mcmeta`: the element's data with the pack formats taken from the target.
 */
import type { Element, Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { ResourcePackLoweringError } from './paths';

/** The output path of the pack metadata file, at the pack root. */
export const PACK_MCMETA_PATH = 'pack.mcmeta';

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Lowers a `pack.mcmeta` element. The data is copied, then `pack.pack_format`,
 * `pack.min_format` and `pack.max_format` are set from `target.packFormats.resource` and
 * `pack.supported_formats` is removed, so the file always matches the target.
 *
 * @param element - The element; `data` must be an object whose `pack` (if present) is an object.
 * @param target - The target supplying the resource pack format.
 * @param schema - The mcdoc type path recorded on the output.
 * @returns Exactly one output file at the pack root.
 * @throws {@link ResourcePackLoweringError} If `data` or `data.pack` is not an object.
 */
export function lowerPackMcmeta(element: Element, target: Target, schema: string): OutputFile[] {
  if (!isObject(element.data)) {
    throw new ResourcePackLoweringError(`Element ${element.id}: pack metadata must be an object.`);
  }
  const data = structuredClone(element.data);
  const existing = data.pack;
  if (existing !== undefined && !isObject(existing)) {
    throw new ResourcePackLoweringError(`Element ${element.id}: "pack" must be an object.`);
  }
  const pack: JsonObject = existing ?? { description: '' };
  const { major, minor } = target.packFormats.resource;
  pack.pack_format = major;
  pack.min_format = [major, minor];
  pack.max_format = [major, minor];
  delete pack.supported_formats;
  data.pack = pack;
  return [{ path: PACK_MCMETA_PATH, contents: data, layer: 'resourcepack', schema }];
}
