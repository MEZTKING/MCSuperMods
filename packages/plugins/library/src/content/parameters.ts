/**
 * Helpers for the parameterised starters (wizards, ADR 0040): reading `context.values` with
 * defaults, deriving ids and English words from a name, and colours from `#rrggbb`.
 *
 * Builders read values through {@link readValues}, so a context without values (the probe
 * that works out `requiresKinds`, the starter-project examples, the Scripted ore starter)
 * builds exactly the default bundle.
 *
 * @packageDocumentation
 */
import type { BundleContext, Json, StarterParameter } from '@msm/plugin-api';
import type { Rgb } from '../assets/png';

/**
 * The pattern of a name parameter: words of letters and digits separated by single spaces,
 * starting with a letter. Every such name derives a valid id ({@link idFromName}).
 */
export const NAME_PATTERN = '^[A-Za-z][A-Za-z0-9]*( [A-Za-z0-9]+)*$';

/** The longest name a wizard accepts. */
export const NAME_MAX_LENGTH = 32;

/** The value of one parameter as {@link readValues} gives it. */
export type ParameterValue = string | number | boolean | readonly string[] | null;

/**
 * The value of every declared parameter: the context's value when valid, else the default. A
 * `set` parameter's value is a `string[]` of chosen values in the order of its choices; an
 * `image` parameter's value is a PNG `data:` URL or `null`.
 */
export type ParameterValues = Readonly<Record<string, ParameterValue>>;

/** The prefix of every image parameter value (ADR 0044 D7). */
export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

/**
 * Every declared parameter's value from `context.values`, falling back to the default when a
 * value is missing or has the wrong type.
 *
 * @param parameters - The starter's parameters.
 * @param context - The bundle context.
 * @returns A value for every parameter id.
 */
export function readValues(
  parameters: readonly StarterParameter[],
  context: Pick<BundleContext, 'values'>,
): ParameterValues {
  const out: Record<string, ParameterValue> = {};
  for (const parameter of parameters) {
    const value: Json | undefined = context.values?.[parameter.id];
    if (parameter.type === 'image') {
      out[parameter.id] =
        typeof value === 'string' && decodePngDataUrl(value) !== null ? value : null;
      continue;
    }
    if (parameter.type === 'set') {
      out[parameter.id] = Array.isArray(value)
        ? parameter.choices.map((choice) => choice.value).filter((choice) => value.includes(choice))
        : [...parameter.default];
      continue;
    }
    const wanted =
      parameter.type === 'number' ? 'number' : parameter.type === 'boolean' ? 'boolean' : 'string';
    out[parameter.id] =
      typeof value === wanted ? (value as string | number | boolean) : parameter.default;
  }
  return out;
}

/** The value of a string, colour or choice parameter. */
export function stringValue(values: ParameterValues, id: string): string {
  return String(values[id]);
}

/** The value of a number parameter. */
export function numberValue(values: ParameterValues, id: string): number {
  return Number(values[id]);
}

/** The value of a `set` parameter: the chosen values in the order of the parameter's choices. */
export function setValue(values: ParameterValues, id: string): readonly string[] {
  const value = values[id];
  return Array.isArray(value) ? value : [];
}

/** The value of a boolean parameter. */
export function booleanValue(values: ParameterValues, id: string): boolean {
  return values[id] === true;
}

/** The value of an image parameter: a PNG `data:` URL, or `null` when none was picked. */
export function imageValue(values: ParameterValues, id: string): string | null {
  const value = values[id];
  return typeof value === 'string' ? value : null;
}

/** A PNG decoded from an image parameter's value: its bytes and its size in pixels. */
export interface DecodedPng {
  bytes: Uint8Array;
  width: number;
  height: number;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 (padding optional) as bytes, or `null` for anything else. */
export function base64Bytes(text: string): Uint8Array | null {
  const clean = text.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let buffer = 0;
  let at = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | BASE64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at] = (buffer >> bits) & 0xff;
      at += 1;
    }
  }
  return out;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * An image parameter's value decoded: a `data:image/png;base64,` URL whose bytes start with the
 * PNG signature and an `IHDR` chunk with a non-zero size. Anything else gives `null`, so a
 * bundle draws its placeholder. The pixels are not decoded; the bytes are used as they are.
 *
 * @param value - The parameter's value.
 */
export function decodePngDataUrl(value: string): DecodedPng | null {
  if (!value.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const bytes = base64Bytes(value.slice(PNG_DATA_URL_PREFIX.length));
  if (bytes === null || bytes.length < 33) return null;
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (type !== 'IHDR') return null;
  const read = (at: number): number =>
    (((bytes[at] as number) << 24) |
      ((bytes[at + 1] as number) << 16) |
      ((bytes[at + 2] as number) << 8) |
      (bytes[at + 3] as number)) >>>
    0;
  const width = read(16);
  const height = read(20);
  if (width === 0 || height === 0) return null;
  return { bytes, width, height };
}

/**
 * The id a name derives (ADR 0040 D2): lower case, runs of spaces to one `_`, characters
 * outside `[a-z0-9_]` dropped; `Ruby` gives `ruby`, `Ruby Golem` gives `ruby_golem`. A
 * result that does not start with a letter gets the prefix `x_`, so ids stay valid even for
 * names the wizard's pattern would refuse.
 *
 * @param name - The name the user typed.
 * @returns A path segment of `[a-z0-9_]` starting with a letter.
 */
export function idFromName(name: string): string {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return /^[a-z]/.test(id) ? id : `x_${id}`;
}

/** `word` in the plural: `ruby` gives `rubies`, `topaz` gives `topazes`, `jade` gives `jades`. */
export function pluralOf(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** `a` or `an` before `word`. */
export function articleFor(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];

/** `count` as an English word for 0 to 9, else as digits. */
export function numberWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

/** The forms of a name the builders use. */
export interface NameForms {
  /** As typed, for display names: `Ruby`, `Blue Topaz`. */
  display: string;
  /** Lower case, for prose: `ruby`, `blue topaz`. */
  lower: string;
  /** Lower-case plural, for prose: `rubies`, `blue topazes`. */
  plural: string;
  /** The derived id: `ruby`, `blue_topaz`. */
  id: string;
  /** The derived id in the plural: `rubies`, `blue_topazes`. */
  idPlural: string;
}

/** The {@link NameForms} of `name`. */
export function nameForms(name: string): NameForms {
  const display = name.trim().replace(/\s+/g, ' ');
  const lower = display.toLowerCase();
  const id = idFromName(display);
  return { display, lower, plural: pluralOf(lower), id, idPlural: pluralOf(id) };
}

/**
 * `#rrggbb` (either case) as an RGB triple; anything else gives `fallback`.
 *
 * @param hex - The colour parameter's value.
 * @param fallback - The colour to use for a malformed value.
 */
export function rgbFromHex(hex: string, fallback: Rgb): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) return fallback;
  return [
    Number.parseInt(match[1] as string, 16),
    Number.parseInt(match[2] as string, 16),
    Number.parseInt(match[3] as string, 16),
  ];
}

/** An RGB triple as lower-case `#rrggbb`. */
export function hexFromRgb(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
