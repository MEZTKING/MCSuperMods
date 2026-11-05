/**
 * The Painting starter and Creator flow (ADR 0044 D6, D7): one `minecraft:painting_variant`
 * with an English title and author, a size in blocks from the vanilla sizes and its picture at
 * `textures/painting/<id>.png`: the PNG the user picked (an `image` parameter, written
 * unchanged; the game stretches it over the painting, so any resolution with the painting's
 * proportions works) or a tinted landscape placeholder at 16 pixels per block. The variant
 * joins the vanilla `#minecraft:placeable` tag, so placed painting items can pick it. No
 * runtime: it works in a resource pack and a data pack. Ids derive from `painting_name`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  StarterParameter,
} from '@msm/plugin-api';
import { paintingPng } from '../assets/png';
import { COLOURS, element, KINDS, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  decodePngDataUrl,
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The vanilla painting sizes in blocks, width by height. */
const SIZES: readonly { value: string; label: string; width: number; height: number }[] = [
  { value: '1x1', label: '1 by 1 block', width: 1, height: 1 },
  { value: '2x1', label: '2 wide, 1 tall', width: 2, height: 1 },
  { value: '1x2', label: '1 wide, 2 tall', width: 1, height: 2 },
  { value: '2x2', label: '2 by 2 blocks', width: 2, height: 2 },
  { value: '3x3', label: '3 by 3 blocks', width: 3, height: 3 },
  { value: '4x2', label: '4 wide, 2 tall', width: 4, height: 2 },
  { value: '4x3', label: '4 wide, 3 tall', width: 4, height: 3 },
  { value: '4x4', label: '4 by 4 blocks', width: 4, height: 4 },
];

/** The largest picture the flow accepts, in bytes (1 MB). */
export const PAINTING_MAX_BYTES = 1_048_576;

/** The largest picture width and height the flow accepts, in pixels (64 per block at 4 by 4). */
export const PAINTING_MAX_SIZE = 256;

/** The Painting flow's questions (ADR 0044 D6), groups "Painting" and "Picture". */
export const PAINTING_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'painting_name',
    label: 'Title',
    description: 'The English title. Ids derive from it: Ruby Sunset gives ruby_sunset.',
    group: 'Painting',
    type: 'string',
    default: 'Ruby Sunset',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'author',
    label: 'Author',
    description: 'Shown under the title on the painting item.',
    group: 'Painting',
    type: 'string',
    default: 'You',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'size',
    label: 'Size',
    group: 'Painting',
    type: 'choice',
    default: '2x1',
    choices: SIZES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'image',
    label: 'Picture',
    description:
      'A PNG with the proportions of the size above, 16 pixels per block or more (up to 256 by 256 and 1 MB). Leave it empty for a placeholder landscape.',
    group: 'Picture',
    type: 'image',
    default: null,
    maxBytes: PAINTING_MAX_BYTES,
    maxSize: PAINTING_MAX_SIZE,
  },
  {
    id: 'colour',
    label: 'Placeholder colour',
    description: 'The colour of the placeholder landscape. Used when no picture is chosen.',
    group: 'Picture',
    type: 'colour',
    default: hexFromRgb(COLOURS.amber),
  },
]);

export function paintingBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(PAINTING_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'painting_name'));
  const author = nameForms(stringValue(values, 'author')).display;
  const size =
    SIZES.find((entry) => entry.value === stringValue(values, 'size')) ??
    (SIZES[1] as (typeof SIZES)[number]);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.amber);
  const picked = decodePngDataUrl(imageValue(values, 'image') ?? '');

  const id = rl(namespace, name.id);
  const titleKey = `painting.${namespace}.${name.id}.title`;
  const authorKey = `painting.${namespace}.${name.id}.author`;
  const texturePath = `textures/painting/${name.id}.png`;
  const picture: ContentBundleAsset = {
    namespace,
    path: texturePath,
    bytes: picked?.bytes ?? paintingPng(size.width, size.height, colour),
  };
  const pictureText =
    picked === null
      ? `a placeholder landscape of ${size.width * 16} by ${size.height * 16} pixels (16 per block): paint over it or replace the file`
      : `the picture you chose (${picked.width} by ${picked.height} pixels), stretched over the painting`;
  return {
    elements: [
      packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
      element(
        id,
        KINDS.paintingVariant,
        {
          asset_id: id,
          width: size.width,
          height: size.height,
          title: { translate: titleKey, color: 'yellow' },
          author: { translate: authorKey, color: 'gray' },
        },
        `A painting ${size.width} by ${size.height} blocks. asset_id names its picture, ${texturePath} in this namespace: ${pictureText}. It is in the vanilla tag #minecraft:placeable, so a placed painting item can pick it.`,
      ),
      element(
        'minecraft:placeable',
        KINDS.tagPaintingVariant,
        { values: [id] },
        `Adds ${name.display} to the vanilla painting variant tag #minecraft:placeable: a painting item placed on a wall picks a random variant from it that fits the space. Vanilla paintings stay in the tag.`,
      ),
      element(
        rl(namespace, 'en_us'),
        KINDS.lang,
        { [authorKey]: author, [titleKey]: name.display },
        'The English title and author shown on the painting item.',
      ),
    ],
    assets: [picture],
  };
}
