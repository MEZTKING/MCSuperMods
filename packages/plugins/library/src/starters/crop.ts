/**
 * The Crop Creator flow (ADR 0069 D1, D2; ADR 0068 D2, D3): one `msm:block` of type `crop`
 * that grows through its stages on farmland, the item it is planted from and what it gives
 * when fully grown, with the `crop` loot preset in vanilla wheat's shape.
 *
 * Two kinds of produce:
 * - "A new food, planted from seeds" (as wheat): the produce is a new `msm:item` with
 *   `msm:food`, and the crop's block item is the seeds, with an id of its own (`item.id`).
 * - "Plant the produce" (as carrots): the crop's block item is the produce itself, edible
 *   through the vanilla `minecraft:food` and `minecraft:consumable` components in the block
 *   item's `msm:components` passthrough.
 *
 * Ids derive from `crop_name`: the crop block `tomato_crop`, the seeds `tomato_seeds` and the
 * produce `tomato` (a crop planted from its produce has no seeds). The block's display name is
 * the planted item's name, which lowering also gives to the block item (`item.<ns>.<path>`).
 *
 * Stages: four textures over eight ages (as potatoes), eight textures over eight ages (as
 * wheat) or four textures over four ages (as beetroots). Tags come from the crop type's own
 * lowering (`crops`, `bee_growables`, `maintains_farmland` and, unless switched off,
 * `villager_plantable_seeds`). "Wild plants in the world" adds a `minecraft:simple_block`
 * feature of the crop at its maximum age, a placed feature in the shape of vanilla's patches
 * (vanilla 26.x has no `random_patch` feature; patches are placement counts and offsets) and an
 * `msm:biome_addition`; the crop's soil then becomes a project block tag of farmland and grass
 * blocks, so the wild plants survive where they grow.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import type { PlaceholderPattern, Rgb } from '../assets/png';
import {
  COLOURS,
  element,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  rl,
  texture,
} from '../content/bundle';
import {
  booleanValue,
  decodePngDataUrl,
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** How many stage textures cover how many ages. */
const STAGES: readonly { value: string; label: string; textures: number; maxAge: number }[] = [
  { value: 'four', label: 'Four looks over eight stages, as potatoes', textures: 4, maxAge: 7 },
  { value: 'eight', label: 'Eight looks, one per stage, as wheat', textures: 8, maxAge: 7 },
  { value: 'short', label: 'Four looks over four stages, as beetroots', textures: 4, maxAge: 3 },
];

/** The compost chances of vanilla's composter, and none. */
const COMPOST: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'Not compostable' },
  { value: '30%', label: '30% (as seeds)' },
  { value: '50%', label: '50%' },
  { value: '65%', label: '65% (as carrots and wheat)' },
  { value: '85%', label: '85% (as bread)' },
  { value: '100%', label: '100% (as pumpkin pie)' },
];

/** The biomes wild plants can grow in. */
const WILD_BIOMES: readonly { tag: string; label: string }[] = [
  { tag: '#minecraft:is_forest', label: 'Forests' },
  { tag: '#minecraft:is_savanna', label: 'Savannas' },
  { tag: '#minecraft:is_taiga', label: 'Taigas' },
  { tag: '#minecraft:is_jungle', label: 'Jungles' },
  { tag: '#minecraft:is_overworld', label: 'Every overworld biome' },
];

/** The most stage pictures a crop takes (eight looks). */
const STAGE_PICTURES = 8;

/** The largest picture side the flow accepts, in pixels. */
const PICTURE_MAX_SIZE = 256;

/** The largest picture file the flow accepts, in bytes (1 MB). */
const PICTURE_MAX_BYTES = 1_048_576;

/**
 * The pattern of a name parameter that may be left empty: a name as {@link NAME_PATTERN}, or
 * nothing for the derived name.
 */
const OPTIONAL_NAME_PATTERN = '^([A-Za-z][A-Za-z0-9]*( [A-Za-z0-9]+)*)?$';

const picture = (id: string, label: string, colour: string): StarterParameter => ({
  id,
  label,
  description: `A square PNG for this texture (16 by 16 as vanilla, up to ${PICTURE_MAX_SIZE} by ${PICTURE_MAX_SIZE}). Leave it empty for a placeholder in the ${colour}.`,
  group: 'Pictures',
  type: 'image',
  default: null,
  maxBytes: PICTURE_MAX_BYTES,
  maxSize: PICTURE_MAX_SIZE,
});

/** The Crop's questions, groups "Crop", "Harvest", "Farming", "World" and "Pictures". */
export const CROP_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'crop_name',
    label: 'Crop name',
    description:
      'The name of what you harvest. Ids derive from it: Tomato gives tomato, tomato_seeds and the crop block tomato_crop.',
    group: 'Crop',
    type: 'string',
    default: 'Tomato',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Produce colour',
    description: 'The colour of the placeholder produce, seeds and ripe crop.',
    group: 'Crop',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'plant_colour',
    label: 'Plant colour',
    description: 'The colour of the placeholder stalks and leaves.',
    group: 'Crop',
    type: 'colour',
    default: hexFromRgb(COLOURS.jade),
  },
  {
    id: 'stages',
    label: 'Growth stages',
    description:
      'How many looks the crop has while it grows. Fewer looks than stages are shared, as vanilla potatoes do.',
    group: 'Crop',
    type: 'choice',
    default: 'four',
    choices: STAGES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'produce',
    label: 'Planted from',
    description:
      'Seeds of its own, as wheat, or the produce itself, as carrots and potatoes are planted.',
    group: 'Harvest',
    type: 'choice',
    default: 'seeds',
    choices: [
      { value: 'seeds', label: 'Its own seeds (the produce is a new food)' },
      { value: 'produce', label: 'The produce itself' },
    ],
  },
  {
    id: 'seeds_name',
    label: 'Seeds name',
    description: 'The name of the seeds. Leave it empty for the crop name and "Seeds".',
    group: 'Harvest',
    type: 'string',
    default: '',
    pattern: OPTIONAL_NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'nutrition',
    label: 'Hunger restored',
    description: 'In half drumsticks, when the produce is eaten (a carrot restores 3).',
    group: 'Harvest',
    type: 'number',
    default: 3,
    min: 1,
    max: 20,
    step: 1,
  },
  {
    id: 'saturation',
    label: 'Saturation',
    description: 'How long the hunger stays away (a carrot 0.6, a baked potato 0.6, beetroot 0.6).',
    group: 'Harvest',
    type: 'number',
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    id: 'harvest_max',
    label: 'Most produce per harvest',
    description:
      'A fully grown crop drops from one to this many (one, as wheat). Fortune adds extra seeds as vanilla does.',
    group: 'Harvest',
    type: 'number',
    default: 1,
    min: 1,
    max: 8,
    step: 1,
  },
  {
    id: 'seeds_compost',
    label: 'Seeds in a composter',
    group: 'Farming',
    type: 'choice',
    default: '30%',
    choices: COMPOST.map((entry) => ({ ...entry })),
  },
  {
    id: 'produce_compost',
    label: 'Produce in a composter',
    group: 'Farming',
    type: 'choice',
    default: '65%',
    choices: COMPOST.map((entry) => ({ ...entry })),
  },
  {
    id: 'villagers',
    label: 'Villagers plant it',
    description:
      'Farmer villagers pick up the planted item and sow it on farmland, and harvest the crop when it is fully grown.',
    group: 'Farming',
    type: 'boolean',
    default: true,
  },
  {
    id: 'wild',
    label: 'Wild plants in the world',
    description:
      'Fully grown patches of the crop grow on grass in the biomes below, in newly generated chunks only. The crop then also grows on grass blocks. Needs the Fabric mod jar export.',
    group: 'World',
    type: 'boolean',
    default: false,
  },
  {
    id: 'wild_biomes',
    label: 'Biomes',
    group: 'World',
    type: 'choice',
    default: WILD_BIOMES[0]?.tag ?? '#minecraft:is_forest',
    choices: WILD_BIOMES.map(({ tag, label }) => ({ value: tag, label })),
  },
  {
    id: 'wild_rarity',
    label: 'One patch in this many chunks',
    description: 'How rare the wild patches are (sweet berry patches are one in 32).',
    group: 'World',
    type: 'number',
    default: 32,
    min: 1,
    max: 256,
    step: 1,
  },
  ...Array.from({ length: STAGE_PICTURES }, (_, index) =>
    picture(
      `picture_stage${index}`,
      `Growth stage ${index + 1}`,
      'plant colour (stages beyond the chosen number of looks are not used)',
    ),
  ),
  picture('picture_seeds', 'Seeds', 'produce colour'),
  picture('picture_produce', 'Produce', 'produce colour'),
]);

/** The placeholder pattern of stage texture `index` of `count`: sprouts first, ripe last. */
function stagePattern(index: number, count: number): PlaceholderPattern {
  const stage = Math.min(3, Math.floor((index * 4) / count));
  return `crop_stage${stage}` as PlaceholderPattern;
}

/**
 * A texture at `textures/<path>.png` of `namespace`: the picked PNG unchanged when it is
 * square, else the placeholder of `pattern` in `colour` (with `accent`, the ripe produce).
 */
function cropTexture(
  namespace: string,
  path: string,
  picked: string | null,
  pattern: PlaceholderPattern,
  colour: Rgb,
  accent?: Rgb,
): ContentBundleAsset {
  const decoded = picked === null ? null : decodePngDataUrl(picked);
  if (decoded !== null && decoded.width === decoded.height) {
    return { namespace, path: `textures/${path}.png`, bytes: decoded.bytes };
  }
  return texture(namespace, path, pattern, colour, accent);
}

/** The produce count of the `crop` preset: 1, or 1 to `max`. */
const harvestCount = (max: number): JsonObject | number => (max <= 1 ? 1 : { min: 1, max });

export function cropBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(CROP_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'crop_name'));
  const produceColour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const plantColour = rgbFromHex(stringValue(values, 'plant_colour'), COLOURS.jade);
  const stages =
    STAGES.find((entry) => entry.value === stringValue(values, 'stages')) ??
    (STAGES[0] as (typeof STAGES)[number]);
  const fromSeeds = stringValue(values, 'produce') !== 'produce';
  const seedsTyped = stringValue(values, 'seeds_name').trim();
  const seedsName = nameForms(seedsTyped === '' ? `${name.display} Seeds` : seedsTyped);
  const nutrition = Math.round(numberValue(values, 'nutrition'));
  const modifier = Math.round(numberValue(values, 'saturation') * 100) / 100;
  const harvestMax = Math.round(numberValue(values, 'harvest_max'));
  const seedsCompost = stringValue(values, 'seeds_compost');
  const produceCompost = stringValue(values, 'produce_compost');
  const villagers = booleanValue(values, 'villagers');
  const wild = booleanValue(values, 'wild');

  const block = rl(namespace, `${name.id}_crop`);
  const produce = rl(namespace, name.id);
  // Seeds get an id of their own; a crop planted from its produce plants the produce.
  const ownSeedsId = [name.id, `${name.id}_crop`].includes(seedsName.id)
    ? `${name.id}_seeds`
    : seedsName.id;
  const seeds = fromSeeds ? rl(namespace, ownSeedsId) : produce;
  const seedsPath = seeds.slice(namespace.length + 1);
  const plantedName = fromSeeds ? seedsName : name;
  const soilTag = rl(namespace, `${name.id}_soil`);
  const wildFeature = rl(namespace, `wild_${name.id}`);
  const wildPlaced = rl(namespace, `wild_${name.id}_placed`);
  const wildAddition = rl(namespace, `wild_${name.id}_patches`);

  const stageTextures = Array.from({ length: stages.textures }, (_, index) =>
    rl(namespace, `block/${name.id}_crop_stage${index}`),
  );
  const plantedModel = rl(namespace, `item/${seedsPath}`);
  const produceModel = rl(namespace, `item/${name.id}`);

  // The planted item: the seeds, or the produce with the vanilla food components.
  const item: JsonObject = { id: seeds, creative_tab: 'minecraft:natural_blocks' };
  const compost = fromSeeds ? seedsCompost : produceCompost;
  if (compost !== 'none') item.compost = compost;
  if (!fromSeeds) {
    item.creative_tab = 'minecraft:food_and_drinks';
    item.components = {
      'msm:components': {
        'minecraft:consumable': {},
        'minecraft:food': {
          nutrition,
          saturation: Math.round(nutrition * modifier * 2 * 100) / 100,
        },
      },
    };
  }
  const cropDrops: JsonObject = { produce };
  const count = harvestCount(harvestMax);
  if (count !== 1) cropDrops.produce_count = count;
  const data: JsonObject = {
    format: 1,
    display_name: plantedName.display,
    type: 'crop',
    sound_type: 'grass',
    max_age: stages.maxAge,
    textures: { stages: [...stageTextures] },
    models: { item: plantedModel },
    item,
    loot: 'crop',
    crop_drops: cropDrops,
    components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
  };
  if (!villagers) data.villager_plantable = false;
  if (wild) data.soil = `#${soilTag}`;

  const ageWords = `${stages.maxAge + 1} stages`;
  const harvestWords =
    harvestMax <= 1 ? `one ${name.lower}` : `one to ${harvestMax} ${name.plural}`;
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower} crop`, PACK_NOTES),
    modElement(
      namespace,
      projectName,
      `Adds ${name.plural}, a crop ${fromSeeds ? `grown from ${seedsName.lower}` : 'planted from its produce'}.`,
    ),
    element(
      block,
      KINDS.block,
      data,
      `The ${name.lower} crop: it grows through ${ageWords} on farmland in the light, faster with bone meal, and is planted from ${fromSeeds ? `${seedsName.lower} (the block item, with its own id ${seeds})` : `the ${name.lower} itself (the block item has the id ${produce}, and the vanilla food components make it edible)`}. Fully grown it drops ${harvestWords}${fromSeeds ? ` and ${seedsName.lower}, more with Fortune` : ', more with Fortune'}; younger it drops only what planted it (the crop loot preset).${villagers ? ' Farmer villagers sow and harvest it on farmland.' : ''}${wild ? ' Its soil is the project tag of farmland and grass blocks, so the wild plants stay where they grow.' : ''}`,
    ),
    element(
      plantedModel,
      KINDS.model,
      { parent: 'minecraft:item/generated', textures: { layer0: plantedModel } },
      `The flat item model of the ${plantedName.lower}, drawn from textures/item/${seedsPath}.png. models.item on the crop points at it; without it the item would show the last crop stage.`,
    ),
  ];
  if (fromSeeds) {
    const itemData: JsonObject = {
      format: 1,
      model: produceModel,
      display_name: name.display,
      max_stack_size: 64,
      creative_tab: 'minecraft:food_and_drinks',
      components: { 'msm:food': { nutrition, saturation: modifier } },
    };
    if (produceCompost !== 'none') itemData.compost = produceCompost;
    elements.push(
      element(
        produce,
        KINDS.item,
        itemData,
        `The ${name.lower}, what the fully grown crop drops. msm:food restores ${nutrition} hunger with a saturation of ${modifier}.${produceCompost === 'none' ? '' : ` It composts at ${produceCompost}.`}`,
      ),
      element(
        produceModel,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: produceModel } },
        `A flat item model drawn from textures/item/${name.id}.png.`,
      ),
    );
  }
  if (wild) {
    elements.push(
      element(
        soilTag,
        KINDS.tagBlock,
        { values: ['minecraft:farmland', 'minecraft:grass_block'] },
        `The blocks the ${name.lower} crop grows on: farmland, as every crop, and grass blocks, where the wild plants grow.`,
      ),
      element(
        wildFeature,
        KINDS.feature,
        {
          type: 'minecraft:simple_block',
          to_place: { id: block, properties: { age: String(stages.maxAge) } },
        },
        `One fully grown ${name.lower} plant (age ${stages.maxAge}), as vanilla's sweet berry bush feature places a ripe bush.`,
      ),
      element(
        wildPlaced,
        KINDS.placedFeature,
        {
          feature: wildFeature,
          placement: [
            {
              type: 'minecraft:rarity_filter',
              chance: Math.round(numberValue(values, 'wild_rarity')),
            },
            { type: 'minecraft:in_square' },
            { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
            { type: 'minecraft:biome' },
            { type: 'minecraft:count', count: 32 },
            {
              type: 'minecraft:offset',
              x: { type: 'minecraft:trapezoid', max: 7, min: -7, plateau: 0 },
              y: { type: 'minecraft:trapezoid', max: 3, min: -3, plateau: 0 },
              z: { type: 'minecraft:trapezoid', max: 7, min: -7, plateau: 0 },
            },
            {
              type: 'minecraft:block_predicate_filter',
              predicate: {
                type: 'minecraft:all_of',
                predicates: [
                  { type: 'minecraft:matching_block_tag', tag: 'minecraft:air' },
                  {
                    type: 'minecraft:matching_blocks',
                    blocks: 'minecraft:grass_block',
                    offset: [0, -1, 0],
                  },
                ],
              },
            },
          ],
        },
        `A patch of wild ${name.plural}, in the shape of vanilla's berry patches: one chunk in ${Math.round(numberValue(values, 'wild_rarity'))} tries 32 spots around one surface point and plants where there is air above a grass block.`,
      ),
    );
    const biome =
      WILD_BIOMES.find((entry) => entry.tag === stringValue(values, 'wild_biomes')) ??
      (WILD_BIOMES[0] as (typeof WILD_BIOMES)[number]);
    elements.push(
      element(
        wildAddition,
        KINDS.biomeAddition,
        {
          format: 1,
          biomes: [biome.tag],
          features: [{ feature: wildPlaced, step: 'vegetal_decoration' }],
        },
        `A world addition: it adds the wild ${name.lower} patches to ${biome.label.toLowerCase()} at the vegetal decoration step without replacing any vanilla file. Only newly generated chunks get them. It needs the Fabric mod jar export.`,
      ),
    );
  }

  const assets: ContentBundleAsset[] = stageTextures.map((id, index) =>
    cropTexture(
      namespace,
      id.slice(namespace.length + 1),
      imageValue(values, `picture_stage${index}`),
      stagePattern(index, stages.textures),
      plantColour,
      produceColour,
    ),
  );
  assets.push(
    cropTexture(
      namespace,
      `item/${seedsPath}`,
      imageValue(values, fromSeeds ? 'picture_seeds' : 'picture_produce'),
      fromSeeds ? 'seeds' : 'produce',
      produceColour,
    ),
  );
  if (fromSeeds) {
    assets.push(
      cropTexture(
        namespace,
        `item/${name.id}`,
        imageValue(values, 'picture_produce'),
        'produce',
        produceColour,
      ),
    );
  }
  return { elements, assets };
}
