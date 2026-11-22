/**
 * The cauldron and bottle of a project fluid (ADR 0108 D2, D3 and the amendment after the B525
 * spike), lowered by {@link lowerCauldron} beside the fluid itself (`lowerFluid`).
 *
 * The cauldron, the block `<ns>:<path>_cauldron` (with `cauldron`):
 *
 * - three levels (`cauldron.levels`, never on a lava-like fluid: the runtime makes those full
 *   only) are vanilla's water cauldron: a block state of `level=1`, `level=2` and `level=3` over
 *   the models `<ns>:block/<path>_cauldron_level1`, `_level2` and `_full`, parented on vanilla's
 *   `minecraft:block/template_cauldron_level1`, `_level2` and `_full`; full only is vanilla's
 *   lava cauldron: one `""` variant over `<ns>:block/<path>_cauldron` parented on
 *   `template_cauldron_full`. The `content` variable is the fluid's still picture (the same
 *   fallback as the liquid block's); `inside`, `top`, `bottom`, `side` and `particle` are
 *   vanilla's cauldron pictures, named, never bundled (the user's client jar supplies them and
 *   the templates; their texture variables were read from the cached client jar's listing and
 *   the templates' `#` references, B531).
 * - It has no item, as vanilla's filled cauldrons have none: its loot table
 *   `<ns>:blocks/<path>_cauldron` drops `minecraft:cauldron` when it survives the explosion.
 * - Block tags `#minecraft:cauldrons` and `#minecraft:mineable/pickaxe`, as vanilla's cauldrons.
 * - With `display_name` (or `cauldron_display_name`): `block.<ns>.<path>_cauldron`, by default
 *   the display name followed by " Cauldron".
 *
 * The bottle, the item `<ns>:<path>_bottle` (with `bottle`):
 *
 * - With `textures.bottle`: a flat `minecraft:item/generated` model of that picture. Without it,
 *   vanilla's potion look: the model's `layer0` is `minecraft:item/potion_overlay` and `layer1`
 *   `minecraft:item/potion`, and the item model definition tints `layer0` with the fluid's
 *   `tint` as a constant colour (vanilla water's bottle colour {@link WATER_BOTTLE_COLOUR}
 *   without a tint).
 * - With `display_name` (or `bottle_display_name`): `item.<ns>.<path>_bottle`, by default
 *   "Bottle of " followed by the display name.
 *
 * The runtime registers both from the fluid definition (`FluidDefinition.cauldron()`,
 * `bottle()`); nothing here goes into `msm/`.
 */
import type { Element, Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { fluidBehaviourOf, fluidTextureOf, fluidTextures } from './fluid';
import {
  assetPath,
  BlocksItemsLoweringError,
  dataPath,
  descriptionKey,
  isRecord,
  splitResourceLocation,
} from './paths';
import {
  BLOCK_STATE_SCHEMA,
  ITEM_DEFINITION_SCHEMA,
  LOOT_TABLE_SCHEMA,
  langFile,
  MODEL_SCHEMA,
  nonEmptyString,
  vanillaTagFile,
} from './shared';

/** The suffix of a fluid's cauldron block id: `<ns>:<path>_cauldron` (ADR 0108 D2). */
export const FLUID_CAULDRON_SUFFIX = '_cauldron';

/** The suffix of a fluid's bottle item id: `<ns>:<path>_bottle` (ADR 0108 D3). */
export const FLUID_BOTTLE_SUFFIX = '_bottle';

/** The empty cauldron a project cauldron drops, as vanilla's filled cauldrons do. */
export const EMPTY_CAULDRON = 'minecraft:cauldron';

/** The vanilla block tags a project cauldron joins, as vanilla's cauldrons. */
export const CAULDRON_BLOCK_TAGS = Object.freeze(['cauldrons', 'mineable/pickaxe'] as const);

/**
 * The vanilla cauldron model templates a project cauldron's models name as `parent`, per level
 * (3 is full). Present in both targets' client jars (B531, from the jar listings).
 */
export const CAULDRON_TEMPLATES = Object.freeze({
  level1: 'minecraft:block/template_cauldron_level1',
  level2: 'minecraft:block/template_cauldron_level2',
  full: 'minecraft:block/template_cauldron_full',
});

/** Vanilla's cauldron pictures, the variables of the templates other than `content`. */
export const CAULDRON_PICTURES = Object.freeze({
  inside: 'minecraft:block/cauldron_inner',
  top: 'minecraft:block/cauldron_top',
  bottom: 'minecraft:block/cauldron_bottom',
  side: 'minecraft:block/cauldron_side',
  particle: 'minecraft:block/cauldron_side',
});

/** Vanilla's potion pictures a bottle without its own picture is drawn with. */
export const BOTTLE_FALLBACK_LAYERS = Object.freeze([
  'minecraft:item/potion_overlay',
  'minecraft:item/potion',
] as const);

/** Vanilla water bottle's colour (RGB), the tint of a bottle whose fluid has no `tint`. */
export const WATER_BOTTLE_COLOUR = 0x385dc6;

/** The cauldron block id of a fluid: `<ns>:<path>_cauldron` (ADR 0108 D2). */
export function fluidCauldronId(fluidId: string): string {
  const { namespace, path } = splitResourceLocation(fluidId);
  return `${namespace}:${path}${FLUID_CAULDRON_SUFFIX}`;
}

/** The bottle item id of a fluid: `<ns>:<path>_bottle` (ADR 0108 D3). */
export function fluidBottleId(fluidId: string): string {
  const { namespace, path } = splitResourceLocation(fluidId);
  return `${namespace}:${path}${FLUID_BOTTLE_SUFFIX}`;
}

/** Whether the fluid has a cauldron (`cauldron` is an object). */
export function hasFluidCauldron(data: Json | undefined): boolean {
  return isRecord(data) && isRecord(data.cauldron);
}

/** Whether the fluid has a bottle (`bottle` is an object). */
export function hasFluidBottle(data: Json | undefined): boolean {
  return isRecord(data) && isRecord(data.bottle);
}

/**
 * Whether the fluid's cauldron fills in three levels: `cauldron.levels` is true and the fluid is
 * not lava-like (a lava-like cauldron is always full only, ADR 0108 amendment).
 */
export function fluidCauldronHasLevels(data: Json | undefined): boolean {
  if (!isRecord(data) || !isRecord(data.cauldron)) return false;
  return data.cauldron.levels === true && fluidBehaviourOf(data) !== 'lava';
}

/**
 * The ids a fluid's cauldron and bottle add to the project, per registry (`block`, `item`); a
 * registry is left out when the fluid adds nothing to it.
 *
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe.
 */
export function fluidCompanionIds(
  fluidId: string,
  data: Json | undefined,
): { block?: string[]; item?: string[] } {
  const out: { block?: string[]; item?: string[] } = {};
  if (hasFluidCauldron(data)) out.block = [fluidCauldronId(fluidId)];
  if (hasFluidBottle(data)) out.item = [fluidBottleId(fluidId)];
  return out;
}

/** A cauldron model of `content` over `parent`. */
function cauldronModel(parent: string, content: string): JsonObject {
  return { parent, textures: { content, ...CAULDRON_PICTURES } };
}

function cauldronFiles(
  target: Target,
  namespace: string,
  path: string,
  data: JsonObject,
): OutputFile[] {
  const cauldronPath = `${path}${FLUID_CAULDRON_SUFFIX}`;
  const content = fluidTextures(data).still;
  const model = (suffix: string) => `${namespace}:block/${cauldronPath}${suffix}`;
  const modelFile = (suffix: string, parent: string): OutputFile => ({
    path: assetPath(target, 'model', namespace, `block/${cauldronPath}${suffix}`),
    contents: cauldronModel(parent, content),
    layer: 'resourcepack',
    schema: MODEL_SCHEMA,
  });
  const files: OutputFile[] = [];
  if (fluidCauldronHasLevels(data)) {
    files.push(
      {
        path: assetPath(target, 'block_definition', namespace, cauldronPath),
        contents: {
          variants: {
            'level=1': { model: model('_level1') },
            'level=2': { model: model('_level2') },
            'level=3': { model: model('_full') },
          },
        },
        layer: 'resourcepack',
        schema: BLOCK_STATE_SCHEMA,
      },
      modelFile('_level1', CAULDRON_TEMPLATES.level1),
      modelFile('_level2', CAULDRON_TEMPLATES.level2),
      modelFile('_full', CAULDRON_TEMPLATES.full),
    );
  } else {
    files.push(
      {
        path: assetPath(target, 'block_definition', namespace, cauldronPath),
        contents: { variants: { '': { model: model('') } } },
        layer: 'resourcepack',
        schema: BLOCK_STATE_SCHEMA,
      },
      modelFile('', CAULDRON_TEMPLATES.full),
    );
  }
  files.push({
    path: dataPath(target, 'loot_table', namespace, `blocks/${cauldronPath}`),
    contents: {
      type: 'minecraft:block',
      pools: [
        {
          rolls: 1,
          bonus_rolls: 0,
          entries: [{ type: 'minecraft:item', name: EMPTY_CAULDRON }],
          condition: { type: 'minecraft:survives_explosion' },
        },
      ],
      random_sequence: `${namespace}:blocks/${cauldronPath}`,
    },
    layer: 'datapack',
    schema: LOOT_TABLE_SCHEMA,
  });
  const displayName = nonEmptyString(data.display_name);
  const name =
    nonEmptyString(data.cauldron_display_name) ??
    (displayName === undefined ? undefined : `${displayName} Cauldron`);
  if (name !== undefined) {
    files.push(langFile(target, namespace, descriptionKey('block', namespace, cauldronPath), name));
  }
  const id = `${namespace}:${cauldronPath}`;
  for (const tag of CAULDRON_BLOCK_TAGS) files.push(vanillaTagFile(target, 'block', tag, id));
  return files;
}

function bottleFiles(
  target: Target,
  namespace: string,
  path: string,
  data: JsonObject,
): OutputFile[] {
  const bottlePath = `${path}${FLUID_BOTTLE_SUFFIX}`;
  const model = `${namespace}:item/${bottlePath}`;
  const picture = fluidTextureOf(data, 'bottle');
  const tint = typeof data.tint === 'number' ? data.tint : WATER_BOTTLE_COLOUR;
  const files: OutputFile[] = [
    {
      path: assetPath(target, 'item_definition', namespace, bottlePath),
      contents:
        picture === undefined
          ? {
              model: {
                type: 'minecraft:model',
                model,
                tints: [{ type: 'minecraft:constant', value: tint }],
              },
            }
          : { model: { type: 'minecraft:model', model } },
      layer: 'resourcepack',
      schema: ITEM_DEFINITION_SCHEMA,
    },
    {
      path: assetPath(target, 'model', namespace, `item/${bottlePath}`),
      contents: {
        parent: 'minecraft:item/generated',
        textures:
          picture === undefined
            ? { layer0: BOTTLE_FALLBACK_LAYERS[0], layer1: BOTTLE_FALLBACK_LAYERS[1] }
            : { layer0: picture },
      },
      layer: 'resourcepack',
      schema: MODEL_SCHEMA,
    },
  ];
  const displayName = nonEmptyString(data.display_name);
  const name =
    nonEmptyString(data.bottle_display_name) ??
    (displayName === undefined ? undefined : `Bottle of ${displayName}`);
  if (name !== undefined) {
    files.push(langFile(target, namespace, descriptionKey('item', namespace, bottlePath), name));
  }
  return files;
}

/**
 * Lowers the cauldron and the bottle of an `msm:fluid` element: the cauldron's block state,
 * models, loot table, language key and tags, then the bottle's item model definition, model and
 * language key. A fluid without `cauldron` and `bottle` lowers to nothing here.
 *
 * @param element - The fluid element.
 * @param target - The target supplying the folders.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerCauldron(element: Element, target: Target): OutputFile[] {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: fluid data must be an object.`);
  }
  const data = element.data;
  const { namespace, path } = splitResourceLocation(element.id);
  return [
    ...(hasFluidCauldron(data) ? cauldronFiles(target, namespace, path, data) : []),
    ...(hasFluidBottle(data) ? bottleFiles(target, namespace, path, data) : []),
  ];
}
