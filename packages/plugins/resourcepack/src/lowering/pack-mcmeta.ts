/**
 * Lowering for `pack.mcmeta`: the element's data with the pack formats taken from the target,
 * once for the resource pack and once for the data pack (ADR 0015).
 */
import type { Element, Json, JsonObject, OutputFile, OutputLayer, Target } from '@msm/plugin-api';
import { ResourcePackLoweringError } from './paths';

/** The output path of the pack metadata file, at the pack root. */
export const PACK_MCMETA_PATH = 'pack.mcmeta';

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const packMetadata = (element: Element): JsonObject => {
  if (!isObject(element.data)) {
    throw new ResourcePackLoweringError(`Element ${element.id}: pack metadata must be an object.`);
  }
  if (element.data.pack !== undefined && !isObject(element.data.pack)) {
    throw new ResourcePackLoweringError(`Element ${element.id}: "pack" must be an object.`);
  }
  return element.data;
};

/** One `pack.mcmeta` for `layer`, with the formats set from `format`. */
function packFile(
  source: JsonObject,
  format: { major: number; minor: number },
  layer: OutputLayer,
  schema: string,
): OutputFile {
  const data = structuredClone(source);
  const pack: JsonObject = isObject(data.pack) ? data.pack : { description: '' };
  const { major, minor } = format;
  pack.pack_format = major;
  pack.min_format = [major, minor];
  pack.max_format = [major, minor];
  delete pack.supported_formats;
  data.pack = pack;
  return { path: PACK_MCMETA_PATH, contents: data, layer, schema };
}

/**
 * Lowers a `pack.mcmeta` element to two files with the same path, one per pack: the
 * `resourcepack` layer with `target.packFormats.resource` and the `datapack` layer with
 * `target.packFormats.data`. In each, the data is copied, then `pack.pack_format`,
 * `pack.min_format` and `pack.max_format` are set from the format and `pack.supported_formats`
 * is removed, so the files always match the target. Exporters skip the layer they do not
 * package.
 *
 * @param element - The element; `data` must be an object whose `pack` (if present) is an object.
 * @param target - The target supplying the resource and data pack formats.
 * @param schema - The mcdoc type path recorded on both outputs.
 * @returns The resource pack file, then the data pack file, both at the pack root.
 * @throws {@link ResourcePackLoweringError} If `data` or `data.pack` is not an object.
 */
export function lowerPackMcmeta(element: Element, target: Target, schema: string): OutputFile[] {
  const source = packMetadata(element);
  return [
    packFile(source, target.packFormats.resource, 'resourcepack', schema),
    packFile(source, target.packFormats.data, 'datapack', schema),
  ];
}
