/**
 * Lowering of `msm:villager_type` (ADR 0107 D5, as amended after the B524 spike):
 *
 * - the runtime definition `msm/<ns>/villager_type/<path>.json` (layer `msm`): the element data
 *   without the editor-only `textures`, with `format` 1; `biomes` (ids and `#` tags) passes
 *   through, since the runtime maps each listed biome (and each biome of a listed tag) to the type;
 * - with `textures.hat` set, the texture metadata `{ villager: { hat } }` vanilla reads beside
 *   each picture, `assets/<ns>/textures/entity/villager/type/<path>.png.mcmeta` and
 *   `.../zombie_villager/type/<path>.png.mcmeta` (layer `resourcepack`, schema
 *   `resource:texture_meta`), for each picture the element has.
 *
 * A villager type has no language text (vanilla has none). The pictures (`textures.villager`
 * and `textures.zombie_villager`, the zombie villager's defaulting to the villager's) are project
 * PNGs; the game draws them from fixed paths ({@link villagerTypeTexturePaths}) with no client
 * code. Lowering sees element data only and cannot copy picture bytes, so a picture whose id is
 * not already at its fixed path is for the host to copy there, as for professions.
 */
import type { Element, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT } from './entity';
import { EntitiesLoweringError, isRecord, splitResourceLocation } from './paths';

/** The fields of a villager type element that only the app and lowering read (ADR 0107 D5). */
export const VILLAGER_TYPE_ELEMENT_ONLY_FIELDS = Object.freeze(['textures']);
/** Schema reference of texture metadata sidecars (`*.png.mcmeta`). */
export const TEXTURE_META_SCHEMA = 'resource:texture_meta';
/** The two entities that draw a villager type's layer. */
export const VILLAGER_TYPE_ENTITIES = Object.freeze(['villager', 'zombie_villager'] as const);

/** The runtime definition path `msm/<namespace>/villager_type/<path>.json`. */
export function villagerTypeDefinitionPath(namespace: string, path: string): string {
  return `msm/${namespace}/villager_type/${path}.json`;
}

/** The texture id the game draws a type's layer from: `<ns>:entity/<entity>/type/<path>`. */
export function villagerTypeTextureId(
  entity: (typeof VILLAGER_TYPE_ENTITIES)[number],
  namespace: string,
  path: string,
): string {
  return `${namespace}:entity/${entity}/type/${path}`;
}

function villagerTypeData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new EntitiesLoweringError(`Element ${element.id}: villager type data must be an object.`);
  }
  return element.data;
}

/**
 * The runtime villager type definition: the element data without `textures`, with `format` set.
 *
 * @throws {@link EntitiesLoweringError} If the data is not an object.
 */
export function villagerTypeDefinition(element: Element): JsonObject {
  const definition = structuredClone(villagerTypeData(element));
  for (const field of VILLAGER_TYPE_ELEMENT_ONLY_FIELDS) delete definition[field];
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/** Where the game looks for a villager type's pictures, and the project pictures that go there. */
export interface VillagerTypeTexture {
  /** Which entity's layer the picture is. */
  entity: (typeof VILLAGER_TYPE_ENTITIES)[number];
  /** The picture's asset path in the project, from the texture id in `textures`. */
  from: string;
  /** The fixed asset path the game reads, `assets/<ns>/textures/entity/<entity>/type/<path>.png`. */
  to: string;
}

/** `assets/<ns>/<textures>/<path>.png` of a texture id, or `undefined` for an unsafe id. */
function texturePath(target: Pick<TargetFacts, 'folders'>, texture: string): string | undefined {
  try {
    const { namespace, path } = splitResourceLocation(
      texture.includes(':') ? texture : `minecraft:${texture}`,
    );
    return `assets/${namespace}/${target.folders.resource.textures}/${path}.png`;
  } catch {
    return undefined;
  }
}

/**
 * The pictures of a villager type: for `textures.villager` and `textures.zombie_villager` (the
 * zombie villager's defaulting to the villager's), the project PNG and the fixed path the game
 * draws the type layer from. Empty when the element has no pictures. A host copies `from` to
 * `to` when they differ.
 *
 * @param target - The target supplying the textures folder.
 * @param element - The villager type element.
 */
export function villagerTypeTexturePaths(
  target: Pick<TargetFacts, 'folders'>,
  element: Element,
): VillagerTypeTexture[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const textures = isRecord(element.data) ? element.data.textures : undefined;
  if (!isRecord(textures)) return [];
  const villager = typeof textures.villager === 'string' ? textures.villager : undefined;
  const zombie = typeof textures.zombie_villager === 'string' ? textures.zombie_villager : villager;
  const found: VillagerTypeTexture[] = [];
  for (const [entity, texture] of [
    ['villager', villager],
    ['zombie_villager', zombie],
  ] as const) {
    if (texture === undefined || texture.length === 0) continue;
    const from = texturePath(target, texture);
    if (from === undefined) continue;
    found.push({
      entity,
      from,
      to: `assets/${namespace}/${target.folders.resource.textures}/entity/${entity}/type/${path}.png`,
    });
  }
  return found;
}

/**
 * Lowers an `msm:villager_type` element (see the module comment for the files).
 *
 * @param element - The element.
 * @param target - The target supplying the folder names.
 * @returns The output files.
 * @throws {@link EntitiesLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerVillagerType(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = villagerTypeData(element);
  const files: OutputFile[] = [
    {
      path: villagerTypeDefinitionPath(namespace, path),
      contents: villagerTypeDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.villagerTypeDefinition,
    },
  ];
  const hat = isRecord(data.textures) ? data.textures.hat : undefined;
  if (typeof hat === 'string') {
    for (const picture of villagerTypeTexturePaths(target, element)) {
      files.push({
        path: `${picture.to}.mcmeta`,
        contents: { villager: { hat } },
        layer: 'resourcepack',
        schema: TEXTURE_META_SCHEMA,
      });
    }
  }
  return files;
}
