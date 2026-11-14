/**
 * The Stone set Creator flow (ADR 0069 D1 to D3): a new stone and the building blocks vanilla
 * makes of a stone, one `msm:block` each with the block types of ADR 0067. From one name and a
 * colour (or a picture per texture) it builds the stone itself (`block` with a cube model), its
 * stairs, slab and wall, and as options a button and a pressure plate (set type `stone`), a
 * polished stone with its own stairs, slab and wall, bricks and a pillar. Recipes follow
 * vanilla's shapes: crafting (the stone from four of a vanilla ingredient, stairs, slabs,
 * walls, polished stone, bricks, the pillar, button and plate) and stonecutting (every shape
 * from the stone, and the polished shapes from polished stone).
 *
 * Ids derive from `stone_name`: `slate`, `slate_stairs`, `polished_slate`, `slate_bricks`,
 * `slate_pillar`, and the recipes `slate_stairs_from_slate`,
 * `slate_stairs_from_slate_stonecutting` and so on (element ids are unique across kinds, so a
 * recipe cannot share its result's id). Every member is mined with a pickaxe of the chosen tier
 * and drops nothing to a weaker one, except the button, which drops by hand as vanilla's stone
 * button.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  ResourceLocation,
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
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  setValue,
  stringValue,
} from '../content/parameters';

/** The members of a stone set. */
export const STONE_SET_MEMBERS = Object.freeze([
  { value: 'block', label: 'The stone' },
  { value: 'stairs', label: 'Stairs' },
  { value: 'slab', label: 'Slab' },
  { value: 'wall', label: 'Wall' },
  { value: 'button', label: 'Button' },
  { value: 'pressure_plate', label: 'Pressure plate' },
  { value: 'polished', label: 'Polished stone with its stairs, slab and wall' },
  { value: 'bricks', label: 'Bricks' },
  { value: 'pillar', label: 'Pillar' },
] as const);

/** A member's value. */
type Member = (typeof STONE_SET_MEMBERS)[number]['value'];

/** The members made by default (ADR 0069 D1). */
const DEFAULT_MEMBERS: readonly Member[] = ['block', 'stairs', 'slab', 'wall'];

/** The pickaxe tiers the set can need for drops. */
const TIERS: readonly { value: string; label: string }[] = [
  { value: 'any', label: 'Any pickaxe' },
  { value: 'stone', label: 'Stone pickaxe or better' },
  { value: 'iron', label: 'Iron pickaxe or better' },
  { value: 'diamond', label: 'Diamond pickaxe or better' },
];

/** Vanilla blocks four of which craft four of the stone. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:stone', label: 'Stone' },
  { value: 'minecraft:cobblestone', label: 'Cobblestone' },
  { value: 'minecraft:deepslate', label: 'Deepslate' },
  { value: 'minecraft:sandstone', label: 'Sandstone' },
  { value: 'minecraft:quartz_block', label: 'Block of quartz' },
  { value: 'none', label: 'No recipe (creative menu only)' },
];

/** The textures of a stone set: parameter id, label, pattern and texture path suffix. */
const PICTURES: readonly { id: string; label: string; pattern: PlaceholderPattern }[] = [
  { id: 'picture_stone', label: 'The stone', pattern: 'stone' },
  { id: 'picture_polished', label: 'Polished stone', pattern: 'polished_stone' },
  { id: 'picture_bricks', label: 'Bricks', pattern: 'bricks' },
  { id: 'picture_pillar_side', label: 'Pillar side', pattern: 'pillar_side' },
  { id: 'picture_pillar_top', label: 'Pillar end', pattern: 'pillar_top' },
];

/** The largest picture side the flow accepts, in pixels. */
const PICTURE_MAX_SIZE = 256;

/** The largest picture file the flow accepts, in bytes (1 MB). */
const PICTURE_MAX_BYTES = 1_048_576;

/** The Stone set's questions, groups "Stone", "Members" and "Pictures". */
export const STONE_SET_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'stone_name',
    label: 'Stone name',
    description:
      'The name of the stone. Ids derive from it: Slate gives slate, slate_stairs and polished_slate.',
    group: 'Stone',
    type: 'string',
    default: 'Slate',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder textures.',
    group: 'Stone',
    type: 'colour',
    default: hexFromRgb(COLOURS.slate),
  },
  {
    id: 'tool_tier',
    label: 'Pickaxe needed',
    description: 'The weakest pickaxe that gets drops; mined with less, the blocks drop nothing.',
    group: 'Stone',
    type: 'choice',
    default: 'stone',
    choices: TIERS.map((tier) => ({ ...tier })),
  },
  {
    id: 'ingredient',
    label: 'Stone crafted from',
    description: 'Four of it in a square make four of the stone.',
    group: 'Stone',
    type: 'choice',
    default: 'minecraft:stone',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
  {
    id: 'members',
    label: 'Blocks in the set',
    description:
      'Without the stone itself the other blocks have no recipes; craft them in the creative menu.',
    group: 'Members',
    type: 'set',
    default: [...DEFAULT_MEMBERS],
    choices: STONE_SET_MEMBERS.map(({ value, label }) => ({ value, label })),
    min: 1,
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

/** Vanilla's stone bricks: hardness 1.5, resistance 6. */
const STONE_HARDNESS = { hardness: 1.5, resistance: 6 };

export function stoneSetBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(STONE_SET_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'stone_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.slate);
  const tier = stringValue(values, 'tool_tier');
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));
  const chosen = new Set(setValue(values, 'members') as readonly Member[]);
  const has = (member: Member): boolean => chosen.has(member);
  const s = name.id;
  const id = (path: string): ResourceLocation => rl(namespace, path);

  const textureIds: Record<string, ResourceLocation> = {
    picture_stone: id(`block/${s}`),
    picture_polished: id(`block/polished_${s}`),
    picture_bricks: id(`block/${s}_bricks`),
    picture_pillar_side: id(`block/${s}_pillar`),
    picture_pillar_top: id(`block/${s}_pillar_top`),
  };
  const used = new Set<string>();
  const tex = (picture: string): string => {
    used.add(picture);
    return textureIds[picture] as string;
  };

  const breakable = (requiresTool = true): JsonObject => {
    const out: JsonObject = { ...STONE_HARDNESS, tool: 'pickaxe' };
    if (!requiresTool) {
      out.hardness = 0.5;
      out.resistance = 0.5;
      out.requires_tool = false;
    } else if (tier !== 'any') {
      out.min_tier = tier;
    }
    return out;
  };
  const mining =
    tier === 'any' ? 'any pickaxe' : `${tier === 'iron' ? 'an' : 'a'} ${tier} pickaxe or better`;
  const elements: ContentBundleElement[] = [];
  const block = (path: string, display: string, data: JsonObject, notes: string): void => {
    elements.push(
      element(
        id(path),
        KINDS.block,
        {
          format: 1,
          display_name: display,
          sound_type: 'stone',
          loot: 'self',
          item: { creative_tab: 'minecraft:building_blocks' },
          ...data,
        },
        notes,
      ),
    );
  };
  const cube = (path: string, display: string, picture: string, notes: string): void => {
    const model = id(`block/${path}`);
    block(path, display, { model, components: { 'msm:breakable': breakable() } }, notes);
    elements.push(
      element(
        model,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: tex(picture) } },
        `A full cube drawn from textures/block/${path}.png; the shapes made of ${display.toLowerCase()} use the same texture.`,
      ),
    );
  };
  /** Stairs, slab and wall of `base` (path) drawn with `picture`. */
  const shapes = (base: string, display: string, picture: string): void => {
    const texture = { all: tex(picture) };
    if (has('stairs')) {
      block(
        `${base}_stairs`,
        `${display} Stairs`,
        {
          type: 'stairs',
          base_block: chosenBase(base),
          textures: texture,
          components: { 'msm:breakable': breakable() },
        },
        `${display} stairs: they form corners next to other stairs and copy the behaviour of their base block.`,
      );
    }
    if (has('slab')) {
      block(
        `${base}_slab`,
        `${display} Slab`,
        { type: 'slab', textures: texture, components: { 'msm:breakable': breakable() } },
        `A ${display.toLowerCase()} slab: two stack into a double slab, which drops two.`,
      );
    }
    if (has('wall')) {
      block(
        `${base}_wall`,
        `${display} Wall`,
        {
          type: 'wall',
          textures: { texture: tex(picture) },
          components: { 'msm:breakable': breakable() },
        },
        `A ${display.toLowerCase()} wall: it connects to other walls and solid blocks and is too high to jump over.`,
      );
    }
  };
  // Stairs need a base block; without the stone (or polished stone) they copy vanilla stone.
  const chosenBase = (base: string): ResourceLocation =>
    (base === s && has('block')) || base === `polished_${s}` ? id(base) : 'minecraft:stone';

  if (has('block')) {
    cube(
      s,
      name.display,
      'picture_stone',
      `The ${name.lower} itself, a plain full block mined with ${mining}. The other blocks of the set are crafted or stonecut from it.`,
    );
  }
  shapes(s, name.display, 'picture_stone');
  if (has('button')) {
    block(
      `${s}_button`,
      `${name.display} Button`,
      {
        type: 'button',
        set_type: 'stone',
        textures: { texture: tex('picture_stone') },
        components: { 'msm:breakable': breakable(false) },
      },
      `A ${name.lower} button: a one-second redstone pulse, not pressed by arrows, dropped even when broken by hand, as vanilla's stone button.`,
    );
  }
  if (has('pressure_plate')) {
    block(
      `${s}_pressure_plate`,
      `${name.display} Pressure Plate`,
      {
        type: 'pressure_plate',
        set_type: 'stone',
        textures: { texture: tex('picture_stone') },
        components: { 'msm:breakable': { hardness: 0.5, resistance: 0.5, tool: 'pickaxe' } },
      },
      `A ${name.lower} pressure plate: only players and mobs press it, as vanilla's stone plate.`,
    );
  }
  if (has('polished')) {
    cube(
      `polished_${s}`,
      `Polished ${name.display}`,
      'picture_polished',
      `Polished ${name.lower}, a smooth full block with stairs, a slab and a wall of its own.`,
    );
    shapes(`polished_${s}`, `Polished ${name.display}`, 'picture_polished');
  }
  if (has('bricks')) {
    cube(`${s}_bricks`, `${name.display} Bricks`, 'picture_bricks', `${name.display} bricks.`);
  }
  if (has('pillar')) {
    block(
      `${s}_pillar`,
      `${name.display} Pillar`,
      {
        type: 'pillar',
        textures: { side: tex('picture_pillar_side'), end: tex('picture_pillar_top') },
        components: { 'msm:breakable': breakable() },
      },
      `A ${name.lower} pillar: it turns to the face you place it against, as a quartz pillar.`,
    );
  }

  elements.push(...stoneRecipes(namespace, s, name.lower, has, ingredient?.value ?? 'none'));

  return {
    elements: [
      packElement(namespace, `${projectName}: a ${name.lower} stone set`, PACK_NOTES),
      modElement(namespace, projectName, `Adds a ${name.lower} stone set.`),
      ...elements,
    ],
    assets: PICTURES.filter((picture) => used.has(picture.id)).map(
      (picture): ContentBundleAsset =>
        pictureTexture(
          namespace,
          (textureIds[picture.id] as string).slice(namespace.length + 1),
          imageValue(values, picture.id),
          picture.pattern,
          colour,
        ),
    ),
  };
}

/** The crafting and stonecutting recipes of the set, in vanilla's shapes. */
function stoneRecipes(
  namespace: string,
  s: string,
  lower: string,
  has: (member: Member) => boolean,
  ingredient: string,
): ContentBundleElement[] {
  const out: ContentBundleElement[] = [];
  const id = (path: string): ResourceLocation => rl(namespace, path);
  const shaped = (
    result: string,
    from: string,
    category: string | undefined,
    pattern: string[],
    count: number,
    notes: string,
  ): void => {
    const data: JsonObject = { type: 'minecraft:crafting_shaped' };
    if (category !== undefined) data.category = category;
    data.key = { '#': id(from) };
    data.pattern = pattern;
    data.result = count === 1 ? { id: id(result) } : { count, id: id(result) };
    out.push(element(id(`${result}_from_${from}`), KINDS.recipe, data, notes));
  };
  const cut = (result: string, from: string, count: number): void => {
    out.push(
      element(
        id(`${result}_from_${from}_stonecutting`),
        KINDS.recipe,
        {
          type: 'minecraft:stonecutting',
          ingredient: id(from),
          result: count === 1 ? { id: id(result) } : { count, id: id(result) },
        },
        `The stonecutter turns one ${from.replaceAll('_', ' ')} into ${count === 1 ? 'one' : count} ${result.replaceAll('_', ' ')}.`,
      ),
    );
  };
  if (has('block') && ingredient !== 'none') {
    const path = ingredient.slice('minecraft:'.length);
    out.push(
      element(
        id(`${s}_from_${path}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'building',
          key: { '#': ingredient },
          pattern: ['##', '##'],
          result: { count: 4, id: id(s) },
        },
        `Four ${path.replaceAll('_', ' ')} in a square make four ${lower}, the start of every other recipe of the set.`,
      ),
    );
  }
  /** Stairs, slab and wall of `base`, crafted and stonecut from it. */
  const shapes = (base: string): void => {
    if (has('stairs')) {
      shaped(
        `${base}_stairs`,
        base,
        'building',
        ['#  ', '## ', '###'],
        4,
        'Six blocks make four stairs.',
      );
      cut(`${base}_stairs`, base, 1);
    }
    if (has('slab')) {
      shaped(`${base}_slab`, base, 'building', ['###'], 6, 'Three blocks make six slabs.');
      cut(`${base}_slab`, base, 2);
    }
    if (has('wall')) {
      shaped(
        `${base}_wall`,
        base,
        undefined,
        ['###', '###'],
        6,
        'Six blocks make six walls (no category, as vanilla).',
      );
      cut(`${base}_wall`, base, 1);
    }
  };
  if (!has('block')) return out;
  shapes(s);
  if (has('button')) {
    out.push(
      element(
        id(`${s}_button_from_${s}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'redstone',
          ingredients: [id(s)],
          result: { id: id(`${s}_button`) },
        },
        `One ${lower} makes a button.`,
      ),
    );
  }
  if (has('pressure_plate')) {
    shaped(`${s}_pressure_plate`, s, 'redstone', ['##'], 1, `Two ${lower} make a pressure plate.`);
  }
  if (has('polished')) {
    shaped(
      `polished_${s}`,
      s,
      'building',
      ['##', '##'],
      4,
      `Four ${lower} make four polished ${lower}.`,
    );
    cut(`polished_${s}`, s, 1);
    shapes(`polished_${s}`);
    // The polished shapes also come straight from the stone in a stonecutter, as vanilla's.
    if (has('stairs')) cut(`polished_${s}_stairs`, s, 1);
    if (has('slab')) cut(`polished_${s}_slab`, s, 2);
    if (has('wall')) cut(`polished_${s}_wall`, s, 1);
  }
  if (has('bricks')) {
    shaped(`${s}_bricks`, s, 'building', ['##', '##'], 4, `Four ${lower} make four bricks.`);
    cut(`${s}_bricks`, s, 1);
  }
  if (has('pillar')) {
    shaped(`${s}_pillar`, s, 'building', ['#', '#'], 2, `Two ${lower} stacked make two pillars.`);
    cut(`${s}_pillar`, s, 1);
  }
  return out;
}
