/**
 * The model of the Draw dialog (ADR 0092 D9, D10 (b)): which pictures fit a field (the drawn
 * recipes of `ART_RECIPE_INFO` of the field's picture kind and size, and a humanoid box skin
 * for skin fields), the best guess from the field's name, six variations per page, the look
 * the user is choosing and the drawing itself. Pure: no DOM, no Node APIs. Only the library's
 * public art exports are used, and only the Draw dialog imports this module, so the drawing
 * code stays in the dialog's lazy chunk.
 *
 * @packageDocumentation
 */

import {
  ART_COATS,
  ART_RECIPE_INFO,
  type ArtCoat,
  type ArtDetail,
  type ArtPictureKind,
  type ArtRecipeId,
  type ArtRecipeInfo,
  artFramePngs,
  artPixels,
  boxSkinArtPixels,
  boxSkinArtPng,
  type Rgb,
  type SkinBox,
} from '@msm/plugin-library';
import { SURPRISE_THEMES } from '../../surprise/themes';

/** What a picture field tells the dialog about the picture it wants. */
export interface DrawField {
  /** The picture kinds that suit the field, best first (`block` for a block's texture). */
  readonly kinds: readonly ArtPictureKind[];
  /** The picture's width in pixels (one frame). */
  readonly width: number;
  /** The picture's height in pixels (one frame). */
  readonly height: number;
  /** The field's name, slot or texture path, for the guess (`ruby_ore`, `planks`). */
  readonly name?: string;
  /** The thing's colour, when the field knows it ("The thing's colour"). */
  readonly colour?: Rgb;
  /** A skin field: draws a humanoid box skin instead of a recipe. */
  readonly skin?: boolean;
  /**
   * A skin field's own boxes (a model's box-UV cubes, from `boxesOfGeoModel`): the skin is
   * drawn on them at the field's size and takes a second colour (belly and spots). Without
   * them a skin field draws the humanoid skin.
   */
  readonly boxes?: readonly SkinBox[];
}

/** A drawn picture: every frame as a PNG and as RGBA pixels, each `width` by `height`. */
export interface DrawnPicture {
  readonly width: number;
  readonly height: number;
  readonly pngs: readonly Uint8Array[];
  readonly rgba: readonly Uint8Array[];
}

/** How many variations a page shows; **New looks** moves on by this many seeds (D11). */
export const VARIATIONS_PER_PAGE = 6;

/** The id of the humanoid box skin, offered on skin fields instead of recipes. */
export const SKIN_OPTION = 'humanoid_skin';

/** The size of a humanoid skin (the player skin layout). */
export const HUMANOID_SKIN_SIZE = Object.freeze({ width: 64, height: 64 });

/**
 * The box-UV cubes of the player skin layout (64 by 64): head, body, both arms and both legs,
 * the head carrying the face. The outer layers stay transparent.
 */
export const HUMANOID_SKIN_BOXES: readonly SkinBox[] = Object.freeze([
  { u: 0, v: 0, w: 8, h: 8, d: 8, role: 'face' },
  { u: 16, v: 16, w: 8, h: 12, d: 4 },
  { u: 40, v: 16, w: 4, h: 12, d: 4 },
  { u: 32, v: 48, w: 4, h: 12, d: 4 },
  { u: 0, v: 16, w: 4, h: 12, d: 4 },
  { u: 16, v: 48, w: 4, h: 12, d: 4 },
]);

/** One thing the dialog can draw: a recipe, or the humanoid box skin. */
export interface DrawOption {
  /** A recipe id, or {@link SKIN_OPTION}. */
  readonly id: string;
  /** In words, for the tile. */
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  /** 2 when it takes a second colour. */
  readonly colours: 1 | 2;
  /** Its finishes (a skin's coats); the first is the default. */
  readonly finishes: readonly string[];
  /** A skin's boxes, when not the humanoid's ({@link DrawField.boxes}). */
  readonly boxes?: readonly SkinBox[];
}

/** The humanoid box skin as an option: one colour, the five coats as finishes. */
export const SKIN_DRAW_OPTION: DrawOption = Object.freeze({
  id: SKIN_OPTION,
  label: 'Skin',
  width: HUMANOID_SKIN_SIZE.width,
  height: HUMANOID_SKIN_SIZE.height,
  frames: 1,
  colours: 1,
  finishes: Object.freeze([...ART_COATS]),
});

function optionOf(info: ArtRecipeInfo): DrawOption {
  return {
    id: info.id,
    label: info.label,
    width: info.width,
    height: info.height,
    frames: info.frames,
    colours: info.colours,
    finishes: info.finishes,
  };
}

/**
 * What a field may draw, best first: the drawn recipes (never a stub) of the field's picture
 * kinds at its size, by kind in the field's order and then in table order, with the guess
 * from its name first; when no recipe of those kinds has that size, every drawn recipe of that
 * size. A skin field draws only the humanoid skin.
 */
export function drawOptions(
  field: DrawField,
  recipes: readonly ArtRecipeInfo[] = ART_RECIPE_INFO,
): DrawOption[] {
  if (field.skin === true) {
    if (field.boxes === undefined) return [SKIN_DRAW_OPTION];
    return [
      {
        ...SKIN_DRAW_OPTION,
        width: field.width,
        height: field.height,
        colours: 2,
        boxes: field.boxes,
      },
    ];
  }
  const sized = recipes.filter(
    (info) => info.drawn && info.width === field.width && info.height === field.height,
  );
  const kinds: readonly ArtPictureKind[] = field.kinds;
  const ofKind = kinds.flatMap((kind) => sized.filter((info) => info.kind === kind));
  const fitting = (ofKind.length > 0 ? ofKind : sized).map(optionOf);
  const guess = guessRecipe(field.name ?? '', fitting);
  if (guess === undefined) return fitting;
  return [
    ...fitting.filter((option) => option.id === guess),
    ...fitting.filter((option) => option.id !== guess),
  ];
}

/** Words in a field's name that name a recipe without its id (`log` is the bark). */
const ALIASES: Readonly<Record<string, ArtRecipeId>> = Object.freeze({
  log: 'bark',
  wood: 'bark',
  stem: 'bark',
  plank: 'planks',
  brick: 'bricks',
  leaf: 'leaves',
  seed: 'seeds',
  door: 'door_bottom',
  apple: 'fruit',
  berry: 'fruit',
  berries: 'fruit',
  ruby: 'gem',
  diamond: 'gem',
  emerald: 'gem',
  sapphire: 'gem',
  crystal: 'gem',
  shard: 'gem',
  chest: 'chestplate',
  pants: 'leggings',
  hat: 'helmet',
  cap: 'helmet',
  egg: 'spawn_egg',
  record: 'disc',
  potion: 'bottle',
  icon: 'effect_icon',
  front: 'block_front',
});

/** A name as `_`-separated lower-case words: `Ruby Sword`, `ruby-sword` and `rubySword` agree. */
function wordsOfName(name: string): string {
  // A texture id or path names its picture by its last part: `demo:textures/block/ruby_ore.png`.
  const last = name.split(/[/:]/).pop() ?? name;
  return last
    .replace(/\.png$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * The recipe a field's name or slot points at, among `options`: the longest recipe id found
 * as whole words in the name (`ruby_pickaxe` is a pickaxe, not an axe; `oak_log_top` a log
 * end), else the last word with an alias (`oak_log` is bark), else `undefined`.
 */
export function guessRecipe(name: string, options: readonly DrawOption[]): string | undefined {
  const words = wordsOfName(name);
  if (words === '') return undefined;
  const padded = `_${words}_`;
  const ids = new Set(options.map((option) => option.id));
  let best: string | undefined;
  for (const id of ids) {
    if (padded.includes(`_${id}_`) && (best === undefined || id.length > best.length)) best = id;
  }
  if (best === 'ore' && padded.includes('_deepslate_') && ids.has('deepslate_ore')) {
    return 'deepslate_ore';
  }
  if (best !== undefined) return best;
  // No id as whole words: an alias, the last word first (`oak_log` is bark, `ruby` a gem).
  const parts = words.split('_').reverse();
  for (const part of parts) {
    const alias = ALIASES[part];
    if (alias !== undefined && ids.has(alias)) return alias;
  }
  return undefined;
}

/** The look the dialog is choosing (ADR 0092 D9); nothing of it is stored in the project. */
export interface DrawState {
  /** The option's id ({@link DrawOption.id}). */
  readonly option: string;
  readonly colour: Rgb;
  /** The second colour; undefined: the recipe's own. */
  readonly accent: Rgb | undefined;
  /** One of the option's finishes; undefined: its first. */
  readonly finish: string | undefined;
  readonly detail: ArtDetail;
  /** The page of variations: seeds `page * 6` to `page * 6 + 5`. */
  readonly page: number;
  /** The chosen variation on the page (0 to 5). */
  readonly selected: number;
}

/** The ten Surprise me theme colours (ADR 0086 D2): each theme's main colour, with its word. */
export const THEME_SWATCHES: readonly { readonly word: string; readonly hex: string }[] =
  Object.freeze(SURPRISE_THEMES.map((theme) => ({ word: theme.word, hex: theme.colours[0] })));

/** The first look of a field: its best option, the thing's colour or the first theme's. */
export function initialDrawState(options: readonly DrawOption[], colour?: Rgb): DrawState {
  return {
    option: options[0]?.id ?? '',
    colour: colour ?? hexToRgb(THEME_SWATCHES[0]?.hex ?? '#c41c34') ?? [196, 28, 52],
    accent: undefined,
    finish: undefined,
    detail: 'normal',
    page: 0,
    selected: 0,
  };
}

/** A change to the look; any change but a pick keeps the page and the chosen variation. */
export type DrawAction =
  | { type: 'option'; option: string }
  | { type: 'colour'; colour: Rgb }
  | { type: 'accent'; accent: Rgb | undefined }
  | { type: 'finish'; finish: string }
  | { type: 'detail'; detail: ArtDetail }
  | { type: 'new-looks' }
  | { type: 'select'; index: number };

/** The look after `action`. **New looks** shows the next six seeds and chooses the first. */
export function drawReducer(state: DrawState, action: DrawAction): DrawState {
  switch (action.type) {
    case 'option':
      return { ...state, option: action.option, finish: undefined, accent: undefined };
    case 'colour':
      return { ...state, colour: action.colour };
    case 'accent':
      return { ...state, accent: action.accent };
    case 'finish':
      return { ...state, finish: action.finish };
    case 'detail':
      return { ...state, detail: action.detail };
    case 'new-looks':
      return { ...state, page: state.page + 1, selected: 0 };
    case 'select':
      return {
        ...state,
        selected: Math.max(0, Math.min(VARIATIONS_PER_PAGE - 1, Math.trunc(action.index))),
      };
  }
}

/** The six seeds of a page: `page * 6` to `page * 6 + 5` (ADR 0092 D11). */
export function pageSeeds(page: number): number[] {
  return Array.from({ length: VARIATIONS_PER_PAGE }, (_, index) => page * 6 + index);
}

/** The seed of the chosen variation. */
export function selectedSeed(state: DrawState): number {
  return state.page * VARIATIONS_PER_PAGE + state.selected;
}

/**
 * Draws `option` in the look with `seed`: every frame's PNG and RGBA pixels. A recipe draws
 * through `artFramePngs` and `artPixels`, the skin through `boxSkinArtPng` over the option's
 * boxes or {@link HUMANOID_SKIN_BOXES}; the same look and seed always give the same bytes.
 */
export function drawPicture(option: DrawOption, state: DrawState, seed: number): DrawnPicture {
  const base = {
    colour: state.colour,
    ...(state.accent === undefined ? {} : { accent: state.accent }),
    detail: state.detail,
    seed,
  };
  if (option.id === SKIN_OPTION) {
    const coat = (
      ART_COATS.includes(state.finish as ArtCoat) ? state.finish : ART_COATS[0]
    ) as ArtCoat;
    const look = { ...base, coat };
    const boxes = option.boxes ?? HUMANOID_SKIN_BOXES;
    const { width, height } = option.boxes === undefined ? HUMANOID_SKIN_SIZE : option;
    return {
      width,
      height,
      pngs: [boxSkinArtPng(boxes, width, height, look)],
      rgba: [boxSkinArtPixels(boxes, width, height, look)],
    };
  }
  const look = {
    ...base,
    recipe: option.id as ArtRecipeId,
    ...(state.finish === undefined ? {} : { finish: state.finish }),
  };
  const pixels = artPixels(look);
  const size = pixels.width * pixels.height * 4;
  return {
    width: pixels.width,
    height: pixels.height,
    pngs: artFramePngs(look),
    rgba: Array.from({ length: pixels.frames }, (_, frame) =>
      pixels.data.slice(frame * size, (frame + 1) * size),
    ),
  };
}

/** A finish id in words: `metal` is "Metal", `deep_slate` "Deep slate". */
export function finishLabel(finish: string): string {
  const words = finish.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The detail levels in words (ADR 0092 D9). */
export const DETAIL_LABELS: Readonly<Record<ArtDetail, string>> = Object.freeze({
  smooth: 'Smooth',
  normal: 'Normal',
  rough: 'Rough',
});

/** `#rrggbb` as a colour, or `null`. */
export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  const value = Number.parseInt(match[1] as string, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** A colour as `#rrggbb`. */
export function rgbToHex(colour: Rgb): string {
  return `#${colour.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** A PNG as a `data:` URL for a thumbnail. */
export function pngUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}
