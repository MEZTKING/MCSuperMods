/**
 * The Lights Creator flow (ADR 0101 D2, ADR 0094 D1): a torch, a lantern, a chain and a candle
 * of one look, from one name, a metal colour and the colour of the flame, or one picture of
 * your own for all four. Each is an `msm:block` of the vanilla-like type of the same name: the
 * torch stands on floors and its generated wall torch (`<id>_wall`) hangs on walls and gives
 * light 14 with the flame particle you pick; the lantern stands or hangs and gives light 15;
 * the chain runs along any axis; one to four candles light with flint and steel, three light a
 * candle (as vanilla's, ADR 0094 D14). Recipes follow vanilla's shapes with the flow's light
 * ingredient in place of coal, so they never clash with vanilla's: the ingredient over a stick
 * makes four torches, eight iron nuggets round the torch a lantern, the ingredient between two
 * nuggets a chain, and string over the ingredient over a honeycomb a candle.
 *
 * Ids derive from `light_name`: `glow_torch`, `glow_lantern`, `glow_chain`, `glow_candle`.
 * Pictures are MSM's own (`assets/vanilla-parity`).
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
import type { Rgb } from '../assets/png';
import {
  candleItemPng,
  candlePng,
  chainItemPng,
  chainPng,
  lanternItemPng,
  lanternPng,
  torchPng,
} from '../assets/vanilla-parity/index';
import { element, KINDS, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  decodePngDataUrl,
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

/** The lights the flow makes. */
export const LIGHTS_MEMBERS = Object.freeze([
  { value: 'torch', label: 'Torch (and its wall torch)' },
  { value: 'lantern', label: 'Lantern' },
  { value: 'chain', label: 'Chain' },
  { value: 'candle', label: 'Candle' },
] as const);

/** A light's value. */
type Member = (typeof LIGHTS_MEMBERS)[number]['value'];

/** The flame particles a torch can give off (simple particles both targets have). */
const PARTICLES: readonly { value: string; label: string }[] = [
  { value: 'minecraft:flame', label: 'Flame, as a torch' },
  { value: 'minecraft:soul_fire_flame', label: 'Blue flame, as a soul torch' },
  { value: 'minecraft:copper_fire_flame', label: 'Green flame, as a copper torch' },
  { value: 'minecraft:small_flame', label: 'Small flame, as a candle' },
];

/** The light ingredients: what takes coal's place in the torch recipe. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:glowstone_dust', label: 'Glowstone dust' },
  { value: 'minecraft:blaze_powder', label: 'Blaze powder' },
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
  { value: 'minecraft:glow_ink_sac', label: 'Glow ink sac' },
  { value: 'none', label: 'No recipes (creative menu only)' },
];

/** A warm torch flame, the default colour of light. */
const FLAME: Rgb = [252, 186, 72];
/** Wrought iron, the default metal. */
const IRON: Rgb = [92, 98, 112];

/** The largest picture side the flow accepts, in pixels. */
const PICTURE_MAX_SIZE = 256;
/** The largest picture file the flow accepts, in bytes (1 MB). */
const PICTURE_MAX_BYTES = 1_048_576;

/** The Lights questions, groups "Lights" and "Pictures". */
export const LIGHTS_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'light_name',
    label: 'Name',
    description:
      'The name of the set of lights. Ids derive from it: Glow gives glow_torch, glow_lantern, glow_chain and glow_candle.',
    group: 'Lights',
    type: 'string',
    default: 'Glow',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'members',
    label: 'Lights to make',
    group: 'Lights',
    type: 'set',
    default: LIGHTS_MEMBERS.map((member) => member.value),
    choices: LIGHTS_MEMBERS.map(({ value, label }) => ({ value, label })),
    min: 1,
  },
  {
    id: 'flame_colour',
    label: 'Colour of the light',
    description:
      'The colour of the flame and glow in the pictures. Light in the game is always white; this is how the lights look.',
    group: 'Lights',
    type: 'colour',
    default: hexFromRgb(FLAME),
  },
  {
    id: 'colour',
    label: 'Metal colour',
    description: 'The colour of the lantern, the chain and the torch stick in the pictures.',
    group: 'Lights',
    type: 'colour',
    default: hexFromRgb(IRON),
  },
  {
    id: 'particle',
    label: 'Torch flame',
    description: 'The particle the torch gives off.',
    group: 'Lights',
    type: 'choice',
    default: 'minecraft:flame',
    choices: PARTICLES.map((entry) => ({ ...entry })),
  },
  {
    id: 'ingredient',
    label: 'Made with',
    description:
      'What takes the place of coal in the torch recipe; the lantern, chain and candle recipes use it too.',
    group: 'Lights',
    type: 'choice',
    default: 'minecraft:glowstone_dust',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
  {
    id: 'picture',
    label: 'One picture for all',
    description: `A square PNG used for the torch, lantern, chain and candle blocks (16 by 16 as vanilla, up to ${PICTURE_MAX_SIZE} by ${PICTURE_MAX_SIZE}). Leave it empty for pictures drawn in the colours above.`,
    group: 'Pictures',
    type: 'image',
    default: null,
    maxBytes: PICTURE_MAX_BYTES,
    maxSize: PICTURE_MAX_SIZE,
  },
]);

export function lightsBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(LIGHTS_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'light_name'));
  const flame = rgbFromHex(stringValue(values, 'flame_colour'), FLAME);
  const metal = rgbFromHex(stringValue(values, 'colour'), IRON);
  const chosen = new Set(setValue(values, 'members') as readonly Member[]);
  const has = (member: Member): boolean => chosen.has(member);
  const particle = stringValue(values, 'particle');
  const ingredient = stringValue(values, 'ingredient');
  const picked = imageValue(values, 'picture');
  const decoded = picked === null ? null : decodePngDataUrl(picked);
  const own = decoded !== null && decoded.width === decoded.height ? decoded.bytes : undefined;
  const id = (path: string): ResourceLocation => rl(namespace, path);
  const path = (member: Member): string => `${name.id}_${member}`;
  const display = (member: Member): string =>
    `${name.display} ${member.charAt(0).toUpperCase()}${member.slice(1)}`;

  const elements: ContentBundleElement[] = [];
  const assets: ContentBundleAsset[] = [];
  const picture = (texturePath: string, drawn: () => Uint8Array, block = true): string => {
    assets.push({
      namespace,
      path: `textures/${texturePath}.png`,
      bytes: block && own !== undefined ? own : drawn(),
    });
    return id(texturePath);
  };
  const block = (member: Member, data: JsonObject, notes: string): void => {
    elements.push(
      element(
        id(path(member)),
        KINDS.block,
        {
          format: 1,
          display_name: display(member),
          loot: 'self',
          item: { creative_tab: 'minecraft:functional_blocks' },
          ...data,
        },
        notes,
      ),
    );
  };

  if (has('torch')) {
    const texture = picture(`block/${path('torch')}`, () => torchPng([150, 108, 62], flame));
    block(
      'torch',
      {
        type: 'torch',
        particle,
        sound_type: 'wood',
        textures: { texture },
        components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
      },
      `The ${name.lower} torch: it stands on the top of a block, and placed against a side it becomes the generated wall torch ${id(path('torch'))}_wall. Both give light 14 and the ${particle.slice('minecraft:'.length).replaceAll('_', ' ')} particle, and pop off when their block goes.`,
    );
  }
  if (has('lantern')) {
    const texture = picture(`block/${path('lantern')}`, () => lanternPng(metal, flame));
    const item = picture(`item/${path('lantern')}`, () => lanternItemPng(metal, flame), false);
    block(
      'lantern',
      {
        type: 'lantern',
        sound_type: 'lantern',
        textures: { texture, item },
        components: {
          'msm:breakable': {
            hardness: 3.5,
            resistance: 3.5,
            tool: 'pickaxe',
            requires_tool: false,
          },
        },
      },
      `The ${name.lower} lantern: it stands on a block or, placed under one, hangs from it, and gives light 15. It holds water as vanilla's lantern does.`,
    );
  }
  if (has('chain')) {
    const texture = picture(`block/${path('chain')}`, () => chainPng(metal));
    const item = picture(`item/${path('chain')}`, () => chainItemPng(metal), false);
    block(
      'chain',
      {
        type: 'chain',
        sound_type: 'metal',
        textures: { texture, item },
        components: { 'msm:breakable': { hardness: 5, resistance: 6, tool: 'pickaxe' } },
      },
      `The ${name.lower} chain: it runs along the axis of the face you place it against, to hang a lantern from.`,
    );
  }
  if (has('candle')) {
    const candle = picture(`block/${path('candle')}`, () =>
      candlePng([232, 214, 178], flame, false),
    );
    const lit = picture(`block/${path('candle')}_lit`, () =>
      candlePng([232, 214, 178], flame, true),
    );
    const item = picture(
      `item/${path('candle')}`,
      () => candleItemPng([232, 214, 178], flame),
      false,
    );
    block(
      'candle',
      {
        type: 'candle',
        sound_type: 'wool',
        textures: { candle, lit, item },
        components: { 'msm:breakable': { hardness: 0.1, resistance: 0.1 } },
      },
      `The ${name.lower} candle: up to four share a block, flint and steel lights them and each lit candle gives light 3. It holds water, which puts it out.`,
    );
  }
  if (ingredient !== 'none') elements.push(...lightRecipes(namespace, path, has, ingredient));

  return {
    elements: [
      packElement(namespace, `${projectName}: ${name.lower} lights`, PACK_NOTES),
      modElement(namespace, projectName, `Adds ${name.lower} lights.`),
      ...elements,
    ],
    assets,
  };
}

/** The recipes, vanilla's shapes with the light ingredient. */
function lightRecipes(
  namespace: string,
  path: (member: Member) => string,
  has: (member: Member) => boolean,
  ingredient: string,
): ContentBundleElement[] {
  const id = (p: string): ResourceLocation => rl(namespace, p);
  const words = ingredient.slice('minecraft:'.length).replaceAll('_', ' ');
  const shaped = (
    member: Member,
    pattern: string[],
    key: JsonObject,
    count: number,
    notes: string,
  ): ContentBundleElement =>
    element(
      id(`${path(member)}_from_${ingredient.slice('minecraft:'.length)}`),
      KINDS.recipe,
      {
        type: 'minecraft:crafting_shaped',
        category: 'misc',
        key,
        pattern,
        result: count === 1 ? { id: id(path(member)) } : { count, id: id(path(member)) },
      },
      notes,
    );
  const out: ContentBundleElement[] = [];
  if (has('torch')) {
    out.push(
      shaped(
        'torch',
        ['X', '#'],
        { '#': 'minecraft:stick', X: ingredient },
        4,
        `${words} over a stick makes four torches, as coal makes vanilla's.`,
      ),
    );
  }
  if (has('lantern')) {
    const centre = has('torch') ? id(path('torch')) : ingredient;
    out.push(
      shaped(
        'lantern',
        ['NNN', 'N#N', 'NNN'],
        { '#': centre, N: 'minecraft:iron_nugget' },
        1,
        `Eight iron nuggets round ${has('torch') ? 'the torch' : words} make a lantern.`,
      ),
    );
  }
  if (has('chain')) {
    out.push(
      shaped(
        'chain',
        ['N', '#', 'N'],
        { '#': ingredient, N: 'minecraft:iron_nugget' },
        1,
        `${words} between two iron nuggets makes a chain.`,
      ),
    );
  }
  if (has('candle')) {
    out.push(
      shaped(
        'candle',
        ['S', '#', 'H'],
        { '#': ingredient, H: 'minecraft:honeycomb', S: 'minecraft:string' },
        1,
        `String over ${words} over a honeycomb makes a candle.`,
      ),
    );
  }
  return out;
}
