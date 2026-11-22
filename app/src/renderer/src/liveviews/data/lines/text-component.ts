/**
 * Text components as B611's views draw them (ADR 0120 D6): a component (a string, a list, or an
 * object with `text`, `translate`, `extra` and a style) turned into styled runs, the words of a
 * `translate` key from the language table. The advancement tree, the dialog screen and the
 * sample lines share it. MSM's own reading of the data (about right); the game's own
 * components that need a world (`score`, `selector`, `nbt`) are named, not worked out.
 */

import type { Json } from '@msm/plugin-api';
import type { LangTable } from '../../frame/item-picture';

/** The style of a run, as the data names it. */
export interface TextStyle {
  /** A colour as CSS (`#rrggbb`), from a named chat colour or a `#` colour. */
  readonly color?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underlined?: boolean;
  readonly strikethrough?: boolean;
  readonly obfuscated?: boolean;
}

/** A piece of text with one style. */
export interface TextRun {
  readonly text: string;
  readonly style: TextStyle;
}

/** The sixteen named chat colours (the game's well-known values). */
export const CHAT_COLOURS: Readonly<Record<string, string>> = {
  black: '#000000',
  dark_blue: '#0000aa',
  dark_green: '#00aa00',
  dark_aqua: '#00aaaa',
  dark_red: '#aa0000',
  dark_purple: '#aa00aa',
  gold: '#ffaa00',
  gray: '#aaaaaa',
  dark_gray: '#555555',
  blue: '#5555ff',
  green: '#55ff55',
  aqua: '#55ffff',
  red: '#ff5555',
  light_purple: '#ff55ff',
  yellow: '#ffff55',
  white: '#ffffff',
};

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A colour of the data as CSS, or `undefined` for none or one MSM does not know. */
export function colourOf(value: Json | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return CHAT_COLOURS[value];
}

/** The style of a component object laid over the style it inherits. */
export function styleOf(component: Json | undefined, inherited: TextStyle = {}): TextStyle {
  if (!isRecord(component)) return inherited;
  const out: Record<string, string | boolean> = { ...inherited };
  const colour = colourOf(component.color);
  if (colour !== undefined) out.color = colour;
  for (const key of ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'] as const) {
    if (typeof component[key] === 'boolean') out[key] = component[key];
  }
  return out as TextStyle;
}

/** Looks a key up in the language tables, the first that has it. */
export type LangLookup = (key: string) => string | undefined;

/** A lookup over one table (or none). */
export function langLookup(lang: LangTable | null): LangLookup {
  return (key) => (lang !== null && Object.hasOwn(lang, key) ? lang[key] : undefined);
}

const FORMAT = /%(?:(\d+)\$)?([sd%])/g;

/**
 * Fills a translation's format with its arguments: `%s` in order, `%1$s` by number, `%%` a
 * percent sign. When the format asks for an argument it was not given, the format is shown as
 * it is, unfilled (as the game showed a death line naming a killer with none, B600 2S10).
 */
export function fillFormat(
  format: string,
  args: readonly (readonly TextRun[])[],
  style: TextStyle,
): TextRun[] {
  let next = 0;
  const out: TextRun[] = [];
  let last = 0;
  let missing = false;
  for (const match of format.matchAll(FORMAT)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ text: format.slice(last, index), style });
    last = index + match[0].length;
    if (match[2] === '%') {
      out.push({ text: '%', style });
      continue;
    }
    const wanted = match[1] === undefined ? next++ : Number(match[1]) - 1;
    const arg = args[wanted];
    if (arg === undefined) {
      missing = true;
      break;
    }
    out.push(...arg);
  }
  if (missing) return [{ text: format, style }];
  if (last < format.length) out.push({ text: format.slice(last), style });
  return out;
}

/** What {@link textRuns} needs besides the component. */
export interface TextRunsOptions {
  readonly lang: LangLookup;
  readonly style?: TextStyle;
}

/**
 * The styled runs of a component. A list is its first element with the rest as that element's
 * siblings; `extra` inherits the parent's style; a `translate` key reads the language table, then
 * its `fallback`, then shows the key itself (as the game does with a key no language file names).
 */
export function textRuns(
  component: Json | undefined,
  options: TextRunsOptions,
  depth = 0,
): TextRun[] {
  const inherited = options.style ?? {};
  if (component === undefined || component === null || depth > 16) return [];
  if (typeof component === 'string')
    return component === '' ? [] : [{ text: component, style: inherited }];
  if (typeof component === 'number' || typeof component === 'boolean') {
    return [{ text: String(component), style: inherited }];
  }
  if (Array.isArray(component)) {
    if (component.length === 0) return [];
    const [first, ...rest] = component;
    const style = styleOf(first, inherited);
    return [
      ...textRuns(first, { ...options, style: inherited }, depth + 1),
      ...rest.flatMap((part) => textRuns(part, { ...options, style }, depth + 1)),
    ];
  }
  const style = styleOf(component, inherited);
  const inner: TextRunsOptions = { ...options, style };
  let own: TextRun[] = [];
  if (typeof component.text === 'string') {
    own = component.text === '' ? [] : [{ text: component.text, style }];
  } else if (typeof component.translate === 'string') {
    const key = component.translate;
    const format =
      options.lang(key) ?? (typeof component.fallback === 'string' ? component.fallback : key);
    const args = Array.isArray(component.with)
      ? component.with.map((arg) => textRuns(arg, inner, depth + 1))
      : [];
    own = fillFormat(format, args, style);
  } else if (typeof component.keybind === 'string') {
    own = [{ text: `[${component.keybind}]`, style }];
  } else if (isRecord(component.score)) {
    own = [{ text: '(a score)', style }];
  } else if (typeof component.selector === 'string') {
    own = [{ text: component.selector, style }];
  } else if (typeof component.nbt === 'string') {
    own = [{ text: '(stored data)', style }];
  }
  const extra = Array.isArray(component.extra)
    ? component.extra.flatMap((part) => textRuns(part, inner, depth + 1))
    : [];
  return [...own, ...extra];
}

/** The plain words of some runs. */
export function plainText(runs: readonly TextRun[]): string {
  return runs.map((run) => run.text).join('');
}

/** The plain words of a component. */
export function plainTextOf(component: Json | undefined, lang: LangLookup): string {
  return plainText(textRuns(component, { lang }));
}

/** A run's style as inline CSS. */
export function cssOfStyle(style: TextStyle): Record<string, string> {
  const css: Record<string, string> = {};
  if (style.color !== undefined) css.color = style.color;
  if (style.bold === true) css.fontWeight = '700';
  if (style.italic === true) css.fontStyle = 'italic';
  const lines = [
    style.underlined === true ? 'underline' : '',
    style.strikethrough === true ? 'line-through' : '',
  ].filter(Boolean);
  if (lines.length > 0) css.textDecoration = lines.join(' ');
  return css;
}
