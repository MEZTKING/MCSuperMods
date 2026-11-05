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

/** The value of every declared parameter: the context's value when valid, else the default. */
export type ParameterValues = Readonly<Record<string, string | number | boolean>>;

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
  const out: Record<string, string | number | boolean> = {};
  for (const parameter of parameters) {
    const value: Json | undefined = context.values?.[parameter.id];
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

/** The value of a boolean parameter. */
export function booleanValue(values: ParameterValues, id: string): boolean {
  return values[id] === true;
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
