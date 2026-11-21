/**
 * Lowering of `msm:villager_profession` (ADR 0098 D2, as amended after the B469 spike):
 *
 * - the runtime definition `msm/<ns>/villager_profession/<path>.json` (layer `msm`), the element
 *   data without the editor-only `display_name` and `textures`, with `format` 1; an absent
 *   `trade_sets` stays absent (the runtime defaults it to the sets below, and the export gate
 *   would not find those ids in the project's registry);
 * - when `trade_sets` is absent, the five trade sets `data/<ns>/trade_set/<path>/level_<n>.json`
 *   drawing {@link DEFAULT_TRADES_PER_LEVEL} trades from the villager trade tag
 *   `#<ns>:<path>/level_<n>`, and those five tags, empty and `merge: 'tag'`, so trade tag
 *   elements of the project add to them (a missing set fails silently in the game, so all five
 *   are always written);
 * - the profession's point of interest in `#minecraft:acquirable_job_site` (without it vanilla
 *   villagers never take the job), as `{ id, required: false }`: the point of interest is
 *   registered by the runtime (its id is the profession's id), so the vanilla tag still loads
 *   when the runtime is missing or refuses the job site;
 * - the job's name `entity.<ns>.villager.<path>` in `en_us` (`merge: 'object'`).
 *
 * The pictures (`textures.villager` and `textures.zombie_villager`) are project PNGs. The game
 * looks for them at fixed paths ({@link professionTexturePaths}); lowering cannot copy picture
 * bytes (it sees element data only), so a picture whose id is not already at its fixed path is
 * for the host to copy there.
 */
import type { Element, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT, DISPLAY_NAME_LANGUAGE, LANG_SCHEMA } from './entity';
import { assetPath, EntitiesLoweringError, isRecord, splitResourceLocation } from './paths';

/** The fields of a profession element that only the app reads (ADR 0098 D2). */
export const PROFESSION_ELEMENT_ONLY_FIELDS = Object.freeze(['display_name', 'textures']);
/** The number of trading levels of a villager profession. */
export const PROFESSION_LEVELS = 5;
/** How many trades a default trade set draws per level, as vanilla's professions do. */
export const DEFAULT_TRADES_PER_LEVEL = 2;
/** The point of interest type tag whose entries vanilla villagers may take as a job. */
export const ACQUIRABLE_JOB_SITE_TAG = 'minecraft:acquirable_job_site';
/** Schema reference of point of interest type tags. */
export const POI_TYPE_TAG_SCHEMA = 'tag:point_of_interest_type';
/** Schema reference of villager trade tags. */
export const VILLAGER_TRADE_TAG_SCHEMA = 'tag:villager_trade';
/** Schema reference of trade sets. */
export const TRADE_SET_SCHEMA = 'resource:trade_set';

/** The runtime definition path `msm/<namespace>/villager_profession/<path>.json`. */
export function professionDefinitionPath(namespace: string, path: string): string {
  return `msm/${namespace}/villager_profession/${path}.json`;
}

/** The language key of a profession's name: `entity.<ns>.villager.<path>` (`/` as `.`). */
export function professionNameKey(namespace: string, path: string): string {
  return `entity.${namespace}.villager.${path.replaceAll('/', '.')}`;
}

/** The default trade set ids of a profession: `<ns>:<path>/level_1` to `level_5`. */
export function defaultTradeSets(id: string): string[] {
  const { namespace, path } = splitResourceLocation(id);
  return Array.from(
    { length: PROFESSION_LEVELS },
    (_, index) => `${namespace}:${path}/level_${index + 1}`,
  );
}

function professionData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new EntitiesLoweringError(`Element ${element.id}: profession data must be an object.`);
  }
  return element.data;
}

/** True when the profession names its own trade sets, so lowering creates none. */
export function hasOwnTradeSets(data: JsonObject): boolean {
  return Array.isArray(data.trade_sets);
}

/**
 * The runtime profession definition: the element data without the element-only fields, with
 * `format` set. An absent `trade_sets` stays absent; the runtime reads it as
 * {@link defaultTradeSets}.
 *
 * @throws {@link EntitiesLoweringError} If the data is not an object or the id is unsafe.
 */
export function professionDefinition(element: Element): JsonObject {
  const definition = structuredClone(professionData(element));
  for (const field of PROFESSION_ELEMENT_ONLY_FIELDS) delete definition[field];
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/** Where the game looks for a profession's pictures, and the project pictures that go there. */
export interface ProfessionTexture {
  /** The picture's asset path in the project, from the texture id in `textures`. */
  from: string;
  /** The fixed asset path the game reads, `assets/<ns>/textures/entity/<villager>/profession/<path>.png`. */
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
 * The pictures of a profession: for `textures.villager` and `textures.zombie_villager` (the
 * zombie villager's defaulting to the villager's), the project PNG and the fixed path the game
 * draws the profession layer from. Empty when the element has no pictures. A host copies `from`
 * to `to` when they differ.
 *
 * @param target - The target supplying the textures folder.
 * @param element - The profession element.
 */
export function professionTexturePaths(
  target: Pick<TargetFacts, 'folders'>,
  element: Element,
): ProfessionTexture[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const textures = isRecord(element.data) ? element.data.textures : undefined;
  if (!isRecord(textures)) return [];
  const villager = typeof textures.villager === 'string' ? textures.villager : undefined;
  const zombie = typeof textures.zombie_villager === 'string' ? textures.zombie_villager : villager;
  const found: ProfessionTexture[] = [];
  for (const [entity, texture] of [
    ['villager', villager],
    ['zombie_villager', zombie],
  ] as const) {
    if (texture === undefined || texture.length === 0) continue;
    const from = texturePath(target, texture);
    if (from === undefined) continue;
    found.push({
      from,
      to: `assets/${namespace}/${target.folders.resource.textures}/entity/${entity}/profession/${path}.png`,
    });
  }
  return found;
}

/**
 * Lowers an `msm:villager_profession` element (see the module comment for the files).
 *
 * @param element - The element.
 * @param target - The target supplying the folder names.
 * @returns The output files.
 * @throws {@link EntitiesLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerProfession(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = professionData(element);
  const files: OutputFile[] = [
    {
      path: professionDefinitionPath(namespace, path),
      contents: professionDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.villagerProfessionDefinition,
    },
  ];
  const { tags, trade_set: tradeSetFolder } = target.folders.data;
  if (!hasOwnTradeSets(data)) {
    for (let level = 1; level <= PROFESSION_LEVELS; level += 1) {
      const setPath = `${path}/level_${level}`;
      files.push(
        {
          path: `data/${namespace}/${tradeSetFolder}/${setPath}.json`,
          contents: { trades: `#${namespace}:${setPath}`, amount: DEFAULT_TRADES_PER_LEVEL },
          layer: 'datapack',
          schema: TRADE_SET_SCHEMA,
        },
        {
          path: `data/${namespace}/${tags}/villager_trade/${setPath}.json`,
          contents: { values: [] },
          layer: 'datapack',
          schema: VILLAGER_TRADE_TAG_SCHEMA,
          merge: 'tag',
        },
      );
    }
  }
  const tag = splitResourceLocation(ACQUIRABLE_JOB_SITE_TAG);
  files.push({
    path: `data/${tag.namespace}/${tags}/point_of_interest_type/${tag.path}.json`,
    contents: { values: [{ id: element.id, required: false }] },
    layer: 'datapack',
    schema: POI_TYPE_TAG_SCHEMA,
    merge: 'tag',
  });
  const name = typeof data.display_name === 'string' ? data.display_name : '';
  if (name.length > 0) {
    files.push({
      path: assetPath(target, 'lang', namespace, DISPLAY_NAME_LANGUAGE),
      contents: { [professionNameKey(namespace, path)]: name },
      layer: 'resourcepack',
      schema: LANG_SCHEMA,
      merge: 'object',
    });
  }
  return files;
}
