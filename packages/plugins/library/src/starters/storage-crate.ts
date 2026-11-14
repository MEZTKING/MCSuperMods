/**
 * The Storage crate Creator flow (ADR 0076 D2): one `directional` `msm:block` with
 * `msm:container` (ADR 0074) that opens a vanilla chest screen of one, three or six rows. It
 * faces any of six directions, as a barrel does, and shows its front texture `front_open`
 * while a player has it open. Choices: the size, keeping the contents when broken (as a shulker
 * box does; only with three rows, the only size the shulker box screen has), a wood or stone
 * look, a crafting recipe (eight of a material around a vanilla chest) and pictures for the
 * front and the open front.
 *
 * Ids derive from `crate_name`: `supply_crate`, its textures `block/supply_crate`,
 * `block/supply_crate_front` and `block/supply_crate_front_open`, and the recipe
 * `supply_crate_from_chest`. Containers need the Fabric mod jar export.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import type { PlaceholderPattern } from '../assets/png';
import {
  COLOURS,
  element,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  pictureTexture,
  rl,
} from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The crate sizes: rows of nine slots (ADR 0076 D2). */
export const STORAGE_CRATE_SIZES = Object.freeze([
  { value: 'small', label: 'Small (1 row, 9 slots)', rows: 1 },
  { value: 'medium', label: 'Medium (3 rows, 27 slots, as a chest)', rows: 3 },
  { value: 'large', label: 'Large (6 rows, 54 slots, as a double chest)', rows: 6 },
] as const);

/** The looks: sounds, breaking and the placeholder patterns of the sides and the material. */
const LOOKS: readonly {
  value: string;
  label: string;
  sound: string;
  pattern: PlaceholderPattern;
  breakable: JsonObject;
  material: string;
  materialLabel: string;
}[] = [
  {
    value: 'wood',
    label: 'Wood (mined with an axe, as a barrel)',
    sound: 'wood',
    pattern: 'planks',
    // A barrel's: hardness 2.5, an axe is faster, drops by hand.
    breakable: { hardness: 2.5, resistance: 2.5, tool: 'axe', requires_tool: false },
    material: '#minecraft:planks',
    materialLabel: 'planks of any wood',
  },
  {
    value: 'stone',
    label: 'Stone (needs a pickaxe)',
    sound: 'stone',
    pattern: 'stone',
    // A furnace's: hardness 3.5, drops only to a pickaxe.
    breakable: { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' },
    material: 'minecraft:cobblestone',
    materialLabel: 'cobblestone',
  },
];

/** What surrounds the vanilla chest in the crafting recipe. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'look', label: 'The material of its look (planks or cobblestone)' },
  { value: 'minecraft:iron_ingot', label: 'Iron ingots' },
  { value: 'minecraft:copper_ingot', label: 'Copper ingots' },
  { value: 'none', label: 'No recipe (creative menu only)' },
];

/** The crate's pictures: parameter id, label, texture suffix and placeholder pattern. */
const PICTURES: readonly {
  id: string;
  label: string;
  suffix: string;
  pattern: PlaceholderPattern;
}[] = [
  { id: 'picture_front', label: 'Front', suffix: '_front', pattern: 'trapdoor' },
  {
    id: 'picture_front_open',
    label: 'Front when open',
    suffix: '_front_open',
    pattern: 'block_front',
  },
];

/** The largest picture side the flow accepts, in pixels. */
const PICTURE_MAX_SIZE = 256;

/** The largest picture file the flow accepts, in bytes (1 MB). */
const PICTURE_MAX_BYTES = 1_048_576;

/** The Storage crate's questions, groups "Crate", "Recipe" and "Pictures". */
export const STORAGE_CRATE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'crate_name',
    label: 'Crate name',
    description: 'The English name. Ids derive from it: Supply Crate gives supply_crate.',
    group: 'Crate',
    type: 'string',
    default: 'Supply Crate',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'size',
    label: 'Size',
    description: 'Rows of nine slots in a chest screen.',
    group: 'Crate',
    type: 'choice',
    default: 'medium',
    choices: STORAGE_CRATE_SIZES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'keep_contents',
    label: 'Keep contents when broken',
    description:
      'The crate keeps its items when broken and carries them in its item, as a shulker box does. Only a medium crate (3 rows) can; it then opens the shulker box screen, which refuses other crates and shulker boxes.',
    group: 'Crate',
    type: 'boolean',
    default: false,
  },
  {
    id: 'look',
    label: 'Look',
    description: 'Its sounds, how it is mined and the placeholder pictures.',
    group: 'Crate',
    type: 'choice',
    default: 'wood',
    choices: LOOKS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder textures.',
    group: 'Crate',
    type: 'colour',
    default: hexFromRgb(COLOURS.wood),
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description: 'Eight of it around a chest make one crate.',
    group: 'Recipe',
    type: 'choice',
    default: 'look',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
  ...PICTURES.map(
    (picture): StarterParameter => ({
      id: picture.id,
      label: picture.label,
      description: `A square PNG for this texture (16 by 16 as vanilla, up to ${PICTURE_MAX_SIZE} by ${PICTURE_MAX_SIZE}). Leave it empty for a placeholder in the colour.`,
      group: 'Pictures',
      type: 'image',
      default: null,
      maxBytes: PICTURE_MAX_BYTES,
      maxSize: PICTURE_MAX_SIZE,
    }),
  ),
]);

/** The rows of a size value, 3 for an unknown one. */
function rowsOf(size: string): number {
  return STORAGE_CRATE_SIZES.find((entry) => entry.value === size)?.rows ?? 3;
}

export function storageCrateBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(STORAGE_CRATE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'crate_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.wood);
  const look = LOOKS.find((entry) => entry.value === stringValue(values, 'look')) ?? LOOKS[0];
  if (look === undefined) throw new Error('No crate look.');
  const rows = rowsOf(stringValue(values, 'size'));
  // Only the 27 slots of the shulker box screen can keep their contents (ADR 0074 D6).
  const keeps = booleanValue(values, 'keep_contents') && rows === 3;
  const chosen = stringValue(values, 'ingredient');
  const ingredient = chosen === 'look' ? look.material : chosen;
  const ingredientLabel =
    chosen === 'look'
      ? look.materialLabel
      : (INGREDIENTS.find((entry) => entry.value === chosen)?.label.toLowerCase() ?? chosen);

  const id = name.id;
  const block = rl(namespace, id);
  const side = rl(namespace, `block/${id}`);
  const front = rl(namespace, `block/${id}_front`);
  const frontOpen = rl(namespace, `block/${id}_front_open`);
  const container: JsonObject = { layout: 'chest', rows };
  if (keeps) container.keep_contents = true;

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${name.lower}, a crate that stores items.`),
    element(
      block,
      KINDS.block,
      {
        format: 1,
        display_name: name.display,
        type: 'directional',
        sound_type: look.sound,
        loot: 'self',
        item: { creative_tab: 'minecraft:functional_blocks' },
        textures: { all: side, front, front_open: frontOpen },
        components: {
          'msm:breakable': { ...look.breakable },
          'msm:container': container,
        },
      },
      `A crate with ${rows * 9} slots in a vanilla chest screen of ${rows} row${rows === 1 ? '' : 's'} (msm:container, layout chest). It faces any of six directions, as a barrel does, and shows textures.front_open while a player has it open (the block state open). Hoppers fill it from above and the sides and empty it from below, and comparators read how full it is; "hoppers": false or "comparator": false turn that off. ${keeps ? 'keep_contents makes it keep its items when broken, as a shulker box does: the loot table copies them into the dropped item, and the screen is the shulker box screen, which refuses other crates and shulker boxes.' : 'Breaking it drops its contents and the crate.'} The open and close sounds are a barrel's unless open_sound and close_sound name others; on_open and on_close run events. Containers need the Fabric mod jar export.`,
    ),
  ];
  if (ingredient !== 'none') {
    elements.push(
      element(
        rl(namespace, `${id}_from_chest`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'misc',
          pattern: ['XXX', 'XCX', 'XXX'],
          key: { X: ingredient, C: 'minecraft:chest' },
          result: { id: block },
        },
        `Eight ${ingredientLabel} around a chest make one ${name.lower}. Element ids are unique across kinds, so the recipe has a name of its own.`,
      ),
    );
  }
  const assets = [pictureTexture(namespace, `block/${id}`, null, look.pattern, colour)];
  for (const picture of PICTURES) {
    assets.push(
      pictureTexture(
        namespace,
        `block/${id}${picture.suffix}`,
        imageValue(values, picture.id),
        picture.pattern,
        colour,
      ),
    );
  }
  return { elements, assets };
}
