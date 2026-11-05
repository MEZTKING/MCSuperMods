/**
 * Lowering of the singleton `msm:mod` (ADR 0025 D6, ADR 0026 D2) to `fabric.mod.json`.
 */
import type { Element, Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { BlocksItemsLoweringError, isRecord } from './paths';

/** The path of the Fabric mod metadata file, at the jar root. */
export const FABRIC_MOD_JSON = 'fabric.mod.json';

/** The runtime mod's id, a dependency of every content jar. */
export const RUNTIME_MOD_ID = 'msm_runtime';

const OPTIONAL_STRINGS = ['name', 'description'] as const;

/**
 * Builds `fabric.mod.json` from mod metadata: `schemaVersion` 1, `id`, `version`, `name`,
 * `description`, `authors`, `license` (from `licence`), `environment` `*`, and `depends` on
 * Fabric Loader (`>=` the target's loader), Minecraft (the target's dependency range),
 * Fabric API. `msm_runtime` is left out: the content-jar exporter knows the runtime version and
 * adds `>=<version>` (ADR 0026 D2).
 *
 * @param element - An `msm:mod` element.
 * @param target - The target; must carry {@link Target.fabric}.
 * @returns The file's contents.
 * @throws {@link BlocksItemsLoweringError} If the data is not an object, `mod_id` or `version`
 *   is not a string, or the target has no Fabric facts.
 */
export function fabricModJson(element: Element, target: Target): JsonObject {
  const data = element.data;
  if (!isRecord(data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: mod data must be an object.`);
  }
  if (typeof data.mod_id !== 'string' || typeof data.version !== 'string') {
    throw new BlocksItemsLoweringError(
      `Element ${element.id}: "mod_id" and "version" must be strings.`,
    );
  }
  const fabric = target.fabric;
  if (fabric === undefined) {
    throw new BlocksItemsLoweringError(
      `Target ${target.id} has no Fabric facts, so ${element.id} cannot become fabric.mod.json.`,
    );
  }
  const json: JsonObject = { schemaVersion: 1, id: data.mod_id, version: data.version };
  for (const field of OPTIONAL_STRINGS) {
    const value = data[field];
    if (typeof value === 'string') json[field] = value;
  }
  if (Array.isArray(data.authors)) {
    json.authors = data.authors.filter((author): author is Json => typeof author === 'string');
  }
  if (typeof data.licence === 'string') json.license = data.licence;
  json.environment = '*';
  json.depends = {
    fabricloader: `>=${fabric.loader}`,
    minecraft: fabric.minecraftDependency,
    'fabric-api': '*',
  };
  return json;
}

/**
 * Lowers an `msm:mod` element to `fabric.mod.json` in layer `msm`. The file has no schema; the
 * content-jar exporter adds `jars` when it nests the runtime.
 */
export function lowerMod(element: Element, target: Target): OutputFile[] {
  return [{ path: FABRIC_MOD_JSON, contents: fabricModJson(element, target), layer: 'msm' }];
}
