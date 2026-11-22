/**
 * The `msm:boat` item component (ADR 0110 D1 and its amendment after the B524 spike): an item
 * with it is a boat (or a raft) the runtime registers as vanilla's `Boat` under the item's id,
 * with vanilla's boat renderer. Lowering, beside the item's own files (`lowerItem`):
 *
 * - the definition stacks to 1 (`max_stack_size: 1`, as vanilla's boats) and loses the
 *   element-only `boat_textures` and `chest_boat_display_name` ({@link lowerBoatInPlace});
 * - with `display_name`, the boat entity's name `entity.<ns>.<path>` (the item's own
 *   `item.<ns>.<path>` is written by `lowerItem`);
 * - the boat in `#minecraft:boats` and its recipe as vanilla's, `data/<ns>/recipe/<path>.json`:
 *   five planks in a U (`"# #"`, `"###"`, group `boat`, category `misc`); the planks are
 *   `<ns>:<wood>_planks` ({@link boatPlanksId}), where `<wood>` is the item's path without its
 *   `_boat` or `_raft` ending, as the Wood set names its planks;
 * - with `chest`, the chest companion `<ns>:<wood>_chest_boat` (`<wood>_chest_raft` for a raft;
 *   {@link boatChestId}, the runtime's `BoatParser.Boat.chestBoatId`): its item model
 *   definition and flat `minecraft:item/generated` model of `boat_textures.chest_boat_item`
 *   (vanilla's oak chest boat picture, or the bamboo chest raft's, named, never bundled, when
 *   unset), its `item.` and `entity.` names (`chest_boat_display_name`, else the display name
 *   followed by " with Chest"), `#minecraft:chest_boats` and its recipe as vanilla's, shapeless
 *   from `minecraft:chest` and the boat (group `chest_boat`, category `misc`).
 *
 * The entity pictures are project PNGs the game reads at fixed paths, 128 x 64 for the boat and
 * 128 x 128 for the chest boat: `assets/<wood ns>/textures/entity/boat/<wood path>.png` and
 * `.../entity/chest_boat/<wood path>.png`, the wood being `wood_texture` or the item's id
 * without its ending ({@link boatWoodOf}). Lowering sees element data only and cannot copy
 * picture bytes, so {@link boatTexturePaths} names, for `boat_textures.boat` and
 * `boat_textures.chest_boat`, the picture and the fixed path the host copies it to. A
 * `wood_texture` in `minecraft` names vanilla's own pictures, which the user's client jar
 * supplies.
 *
 * Vanilla packs leave the boat out (ADR 0110 D4): the item is mod-only.
 */
import type { Element, Json, JsonObject, OutputFile, Target, TargetFacts } from '@msm/plugin-api';
import { assetPath, dataPath, descriptionKey, isRecord, splitResourceLocation } from './paths';
import { RECIPE_SCHEMA } from './potion';
import {
  itemDefinitionFile,
  langFile,
  MODEL_SCHEMA,
  nonEmptyString,
  vanillaTagFile,
} from './shared';

/** The boat component. */
export const BOAT_COMPONENT = 'msm:boat';

/** The element-only fields of a boat item, stripped from the runtime definition. */
export const BOAT_EDITOR_FIELDS = Object.freeze([
  'boat_textures',
  'chest_boat_display_name',
] as const);

/** The endings stripped from a boat item's path to name its wood, as `BoatParser` strips them. */
export const BOAT_ENDINGS = Object.freeze(['_boat', '_raft'] as const);

/** The vanilla item tags a boat and a chest boat join. */
export const BOAT_ITEM_TAGS = Object.freeze({ boat: 'boats', chest: 'chest_boats' } as const);

/**
 * The chest boat item pictures a chest boat without `boat_textures.chest_boat_item` shows:
 * vanilla's oak chest boat, or the bamboo chest raft for a raft (named, never bundled).
 */
export const CHEST_BOAT_FALLBACK_ITEM = Object.freeze({
  boat: 'minecraft:item/oak_chest_boat',
  raft: 'minecraft:item/bamboo_chest_raft',
});

/** The sizes of vanilla's boat pictures (B524): the boat 128 x 64, the chest boat 128 x 128. */
export const BOAT_TEXTURE_SIZES = Object.freeze({
  boat: Object.freeze({ width: 128, height: 64 }),
  chest_boat: Object.freeze({ width: 128, height: 128 }),
});

/** The `msm:boat` component of item data, or `undefined` without one. */
export function boatOf(data: Json | undefined): JsonObject | undefined {
  const components = isRecord(data) ? data.components : undefined;
  const boat = isRecord(components) ? components[BOAT_COMPONENT] : undefined;
  return isRecord(boat) ? boat : undefined;
}

function stripEnding(path: string): string {
  for (const ending of BOAT_ENDINGS) {
    if (path.endsWith(ending) && path.length > ending.length) {
      return path.slice(0, -ending.length);
    }
  }
  return path;
}

/** The item's id without its `_boat` or `_raft` ending, `<ns>:<wood>`. */
function itemWood(itemId: string): { namespace: string; path: string } {
  const { namespace, path } = splitResourceLocation(itemId);
  return { namespace, path: stripEnding(path) };
}

/**
 * The wood a boat's pictures are named after: `wood_texture`, else the item's id without its
 * `_boat` or `_raft` ending (the runtime's `BoatParser.Boat.woodOf`).
 */
export function boatWoodOf(itemId: string, data: Json | undefined): string {
  const own = nonEmptyString(boatOf(data)?.wood_texture);
  if (own !== undefined) {
    const { namespace, path } = splitResourceLocation(own.includes(':') ? own : `minecraft:${own}`);
    return `${namespace}:${path}`;
  }
  const { namespace, path } = itemWood(itemId);
  return `${namespace}:${path}`;
}

/**
 * The chest boat's item and entity type id: `<ns>:<wood>_chest_boat`, or `<wood>_chest_raft` for
 * a raft, `<wood>` the item's path without its ending (the runtime's `chestBoatId`).
 */
export function boatChestId(itemId: string, data: Json | undefined): string {
  const { namespace, path } = itemWood(itemId);
  return `${namespace}:${path}${boatOf(data)?.raft === true ? '_chest_raft' : '_chest_boat'}`;
}

/** The planks of a boat's recipe: `<ns>:<wood>_planks`, `<wood>` the item's path without its ending. */
export function boatPlanksId(itemId: string): string {
  const { namespace, path } = itemWood(itemId);
  return `${namespace}:${path}_planks`;
}

/**
 * The item ids an item with `msm:boat` adds to the project besides its own: the chest boat with
 * `chest`, else none.
 */
export function boatCompanionIds(itemId: string, data: Json | undefined): string[] {
  const boat = boatOf(data);
  return boat?.chest === true ? [boatChestId(itemId, data)] : [];
}

/** One picture of a boat and the fixed path the game reads it from. */
export interface BoatTexture {
  /** `boat` (128 x 64) or `chest_boat` (128 x 128). */
  slot: 'boat' | 'chest_boat';
  /** The picture's asset path in the project, from the texture id in `boat_textures`. */
  from: string;
  /** The fixed asset path the game reads, `assets/<ns>/textures/entity/<slot>/<wood>.png`. */
  to: string;
  /** The texture id of `to`, `<ns>:entity/<slot>/<wood>`. */
  textureId: string;
}

/** `assets/<ns>/<textures>/<path>.png` of a texture id. */
function texturePath(target: Pick<TargetFacts, 'folders'>, texture: string): string {
  const { namespace, path } = splitResourceLocation(
    texture.includes(':') ? texture : `minecraft:${texture}`,
  );
  return `assets/${namespace}/${target.folders.resource.textures}/${path}.png`;
}

/**
 * The fixed texture id the game reads a boat's `slot` picture from: `<wood ns>:entity/boat/<wood
 * path>` or `.../entity/chest_boat/...`.
 */
export function boatTextureId(
  itemId: string,
  data: Json | undefined,
  slot: BoatTexture['slot'],
): string {
  const { namespace, path } = splitResourceLocation(boatWoodOf(itemId, data));
  return `${namespace}:entity/${slot}/${path}`;
}

/**
 * The pictures of a boat: for `boat_textures.boat` and, with `chest`, `boat_textures.chest_boat`,
 * the picture and the fixed path the game reads it from (`from` equals `to` when the picture is
 * already there). An unsafe texture id is left out; the schema reports it.
 *
 * @param target - The target supplying the textures folder.
 * @param element - The `msm:item` element.
 */
export function boatTexturePaths(
  target: Pick<TargetFacts, 'folders'>,
  element: Pick<Element, 'id' | 'data'>,
): BoatTexture[] {
  const boat = boatOf(element.data);
  if (boat === undefined) return [];
  const textures = isRecord(element.data) ? element.data.boat_textures : undefined;
  if (!isRecord(textures)) return [];
  const slots: BoatTexture['slot'][] = boat.chest === true ? ['boat', 'chest_boat'] : ['boat'];
  const found: BoatTexture[] = [];
  for (const slot of slots) {
    const picture = nonEmptyString(textures[slot]);
    if (picture === undefined) continue;
    try {
      const textureId = boatTextureId(element.id, element.data, slot);
      found.push({
        slot,
        from: texturePath(target, picture),
        to: texturePath(target, textureId),
        textureId,
      });
    } catch {
      // An unsafe id: the schema reports it.
    }
  }
  return found;
}

/**
 * Makes a runtime item definition a boat's, in place: `max_stack_size` 1 and no element-only
 * boat fields. An item without `msm:boat` loses only the element-only fields.
 */
export function lowerBoatInPlace(definition: JsonObject): void {
  for (const field of BOAT_EDITOR_FIELDS) delete definition[field];
  if (boatOf(definition) !== undefined) definition.max_stack_size = 1;
}

/** `entity.<ns>.<path>` with every `/` of the path written as `.`. */
function entityKey(namespace: string, path: string): string {
  return `entity.${namespace}.${path.replaceAll('/', '.')}`;
}

/**
 * Lowers the boat files of an `msm:item` element with `msm:boat` (see the module comment):
 * the boat entity's name, the boat tag and recipe, then the chest boat's item model definition,
 * model, names, tag and recipe. An item without `msm:boat` lowers to nothing here.
 *
 * @param element - The item element.
 * @param target - The target supplying the folders.
 * @returns The output files.
 */
export function lowerBoat(element: Element, target: Target): OutputFile[] {
  const boat = boatOf(element.data);
  if (boat === undefined || !isRecord(element.data)) return [];
  const data = element.data;
  const { namespace, path } = splitResourceLocation(element.id);
  const files: OutputFile[] = [];
  const displayName = nonEmptyString(data.display_name);
  if (displayName !== undefined) {
    files.push(langFile(target, namespace, entityKey(namespace, path), displayName));
  }
  files.push(vanillaTagFile(target, 'item', BOAT_ITEM_TAGS.boat, element.id));
  files.push({
    path: dataPath(target, 'recipe', namespace, path),
    contents: {
      type: 'minecraft:crafting_shaped',
      category: 'misc',
      group: 'boat',
      key: { '#': boatPlanksId(element.id) },
      pattern: ['# #', '###'],
      result: { count: 1, id: element.id },
    },
    layer: 'datapack',
    schema: RECIPE_SCHEMA,
  });
  if (boat.chest !== true) return files;
  const chestId = boatChestId(element.id, data);
  const { path: chestPath } = splitResourceLocation(chestId);
  const chestModel = `${namespace}:item/${chestPath}`;
  const textures = isRecord(data.boat_textures) ? data.boat_textures : {};
  const picture =
    nonEmptyString(textures.chest_boat_item) ??
    (boat.raft === true ? CHEST_BOAT_FALLBACK_ITEM.raft : CHEST_BOAT_FALLBACK_ITEM.boat);
  files.push(itemDefinitionFile(target, namespace, chestPath, chestModel), {
    path: assetPath(target, 'model', namespace, `item/${chestPath}`),
    contents: { parent: 'minecraft:item/generated', textures: { layer0: picture } },
    layer: 'resourcepack',
    schema: MODEL_SCHEMA,
  });
  const chestName =
    nonEmptyString(data.chest_boat_display_name) ??
    (displayName === undefined ? undefined : `${displayName} with Chest`);
  if (chestName !== undefined) {
    files.push(
      langFile(target, namespace, descriptionKey('item', namespace, chestPath), chestName),
      langFile(target, namespace, entityKey(namespace, chestPath), chestName),
    );
  }
  files.push(vanillaTagFile(target, 'item', BOAT_ITEM_TAGS.chest, chestId));
  files.push({
    path: dataPath(target, 'recipe', namespace, chestPath),
    contents: {
      type: 'minecraft:crafting_shapeless',
      category: 'misc',
      group: 'chest_boat',
      ingredients: ['minecraft:chest', element.id],
      result: { count: 1, id: chestId },
    },
    layer: 'datapack',
    schema: RECIPE_SCHEMA,
  });
  return files;
}
