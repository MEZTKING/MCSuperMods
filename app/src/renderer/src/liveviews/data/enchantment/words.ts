/**
 * The words of an enchantment and an item for the B610 views: text components made plain, an
 * enchantment's tooltip line as the game words it (B600 2S11: the description, then for every
 * level but a one-level enchantment's level 1 a space and `enchantment.level.<n>`, I to X from
 * the language file; levels 11 and up show the raw key, as the game does) and the tooltip lines
 * of an item stack (name, enchantments with curses red, lore, the rest named). The drawing is
 * MSM's own (about right); nothing here reads a file.
 */

import type { Json, JsonObject, Project, TargetFacts } from '@msm/plugin-api';
import { itemName, type LangTable, romanNumeral, wordsOfPath } from '../../frame/item-picture';
import type { TooltipLine } from '../../frame/Tooltip';

/** What a view knows of one enchantment (from its file, the project's or vanilla's). */
export interface EnchantmentInfo {
  /** Its `description` made plain, or `undefined` when it has none. */
  readonly name?: string;
  /** Its `max_level`. */
  readonly maxLevel: number;
}

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `stone` to `minecraft:stone`; a leading `#` is kept. */
export function fullId(id: string): string {
  const tag = id.startsWith('#');
  const bare = tag ? id.slice(1) : id;
  const full = bare.includes(':') ? bare : `minecraft:${bare}`;
  return tag ? `#${full}` : full;
}

/** Fills `%s` and `%1$s` in a language line. */
function fillIn(pattern: string, args: readonly string[]): string {
  let next = 0;
  return pattern.replace(/%(?:(\d+)\$)?([sd%])/g, (_match, index: string | undefined, kind) => {
    if (kind === '%') return '%';
    const at = index === undefined ? next++ : Number(index) - 1;
    return args[at] ?? '';
  });
}

/**
 * A text component as plain text: a string, `text`, `translate` (through `lang`, then its
 * `fallback`, then the key itself, as the game shows an unknown key), `keybind`, `score` and
 * `selector` named, `extra` and lists joined.
 */
export function plainText(component: Json | undefined, lang: LangTable | null, depth = 0): string {
  if (component === undefined || component === null || depth > 16) return '';
  if (typeof component === 'string') return component;
  if (typeof component === 'number' || typeof component === 'boolean') return String(component);
  if (Array.isArray(component)) return component.map((c) => plainText(c, lang, depth + 1)).join('');
  let own = '';
  if (typeof component.text === 'string') own = component.text;
  else if (typeof component.translate === 'string') {
    const pattern =
      lang?.[component.translate] ??
      (typeof component.fallback === 'string' ? component.fallback : component.translate);
    const args = Array.isArray(component.with)
      ? component.with.map((c) => plainText(c, lang, depth + 1))
      : [];
    own = fillIn(pattern, args);
  } else if (typeof component.keybind === 'string') own = `[${component.keybind}]`;
  else if (isObject(component.score)) own = '[score]';
  else if (typeof component.selector === 'string') own = component.selector;
  const extra = Array.isArray(component.extra)
    ? component.extra.map((c) => plainText(c, lang, depth + 1)).join('')
    : '';
  return own + extra;
}

/**
 * A level's words: `enchantment.level.<n>` from the language file for I to X (roman numerals
 * when the file is not read), the raw key from 11 up (the game's file stops at 10).
 */
export function levelWords(level: number, lang: LangTable | null): string {
  const key = `enchantment.level.${level}`;
  if (level < 1 || level > 10) return key;
  return lang?.[key] ?? romanNumeral(level);
}

/**
 * An enchantment's tooltip line at a level: its description (or the language file's name of its
 * id, or words of its id), then the level, left out for a one-level enchantment's level 1.
 */
export function enchantmentWords(
  id: string,
  level: number,
  info: EnchantmentInfo | undefined,
  lang: LangTable | null,
): string {
  const full = fullId(id);
  const colon = full.indexOf(':');
  const key = `enchantment.${full.slice(0, colon)}.${full.slice(colon + 1).replaceAll('/', '.')}`;
  const name = info?.name ?? lang?.[key] ?? wordsOfPath(full);
  if (level === 1 && info?.maxLevel === 1) return name;
  return `${name} ${levelWords(level, lang)}`;
}

/** The enchantment file's fields a view uses. */
export function enchantmentInfoOf(file: Json | undefined, lang: LangTable | null): EnchantmentInfo {
  const object = isObject(file) ? file : {};
  const max = typeof object.max_level === 'number' ? Math.max(1, Math.floor(object.max_level)) : 1;
  const name = object.description === undefined ? '' : plainText(object.description, lang);
  return name === '' ? { maxLevel: max } : { name, maxLevel: max };
}

/** The project's own enchantment files by id. */
export function projectEnchantments(project: Pick<Project, 'namespaces'>): Map<string, Json> {
  const out = new Map<string, Json>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === 'minecraft:enchantment')
        out.set(fullId(element.id), element.data as Json);
    }
  }
  return out;
}

/** An item's most durability, from the target's vanilla tool numbers, or `undefined`. */
export function maxDamageOf(id: string, facts: TargetFacts | null): number | undefined {
  const tools = facts?.items?.vanillaTools;
  if (tools === undefined) return undefined;
  for (const [tier, byType] of Object.entries(tools)) {
    for (const [tool, stats] of Object.entries(byType)) {
      if (`minecraft:${tier}_${tool}` === fullId(id)) return stats.durability;
    }
  }
  return undefined;
}

/** An item's enchantability (a book's is 1), from the target's vanilla tool numbers. */
export function enchantabilityOf(id: string, facts: TargetFacts | null): number | undefined {
  const full = fullId(id);
  if (full === 'minecraft:book') return 1;
  const tools = facts?.items?.vanillaTools;
  for (const [tier, byType] of Object.entries(tools ?? {})) {
    for (const [tool, stats] of Object.entries(byType)) {
      if (`minecraft:${tier}_${tool}` === full) return stats.enchantability;
    }
  }
  return undefined;
}

/** A stack as the B610 views show it (`@msm/sim`'s `LootStack` fits). */
export interface ShownStack {
  readonly id: string;
  readonly count: number;
  readonly enchantments?: Readonly<Record<string, number>>;
  readonly components?: JsonObject;
  /** Durability left (0 to 1). */
  readonly damage?: number;
}

/** The components the tooltip draws itself; the rest are named in one line. */
const DRAWN = new Set([
  'minecraft:custom_name',
  'minecraft:item_name',
  'minecraft:lore',
  'minecraft:damage',
  'minecraft:unbreakable',
]);

/** What the tooltip of a stack needs besides the stack. */
export interface StackWordsOptions {
  readonly lang: LangTable | null;
  readonly enchantments: (id: string) => EnchantmentInfo | undefined;
  readonly curses: ReadonlySet<string>;
  readonly facts: TargetFacts | null;
}

/**
 * The tooltip lines of a stack: its name (the custom name, else the item name component, else
 * the language file's), each enchantment (curses red), the lore, durability (B605: the damage
 * component is floor((1 - left) x max damage)), unbreakable, then the other components by id.
 */
export function stackLines(stack: ShownStack, options: StackWordsOptions): TooltipLine[] {
  const { lang } = options;
  const components = stack.components ?? {};
  const custom = components['minecraft:custom_name'];
  const itemNameComponent = components['minecraft:item_name'];
  const name =
    custom !== undefined
      ? plainText(custom, lang)
      : itemNameComponent !== undefined
        ? plainText(itemNameComponent, lang)
        : itemName(stack.id, lang);
  const lines: TooltipLine[] = [{ text: name, tone: 'name' }];
  for (const [id, level] of Object.entries(stack.enchantments ?? {})) {
    lines.push({
      text: enchantmentWords(id, level, options.enchantments(fullId(id)), lang),
      tone: options.curses.has(fullId(id)) ? 'curse' : 'enchantment',
    });
  }
  const lore = components['minecraft:lore'];
  if (Array.isArray(lore)) {
    for (const line of lore) lines.push({ text: plainText(line, lang), tone: 'lore' });
  }
  const max = maxDamageOf(stack.id, options.facts);
  const damageComponent = components['minecraft:damage'];
  if (stack.damage !== undefined && max !== undefined) {
    const damage = Math.floor((1 - stack.damage) * max);
    lines.push({ text: `Durability: ${max - damage} / ${max}`, tone: 'note' });
  } else if (stack.damage !== undefined) {
    lines.push({ text: `Durability left: ${Math.round(stack.damage * 100)}%`, tone: 'note' });
  } else if (typeof damageComponent === 'number' && max !== undefined) {
    lines.push({ text: `Durability: ${max - damageComponent} / ${max}`, tone: 'note' });
  }
  if (components['minecraft:unbreakable'] !== undefined) {
    lines.push({ text: 'Unbreakable', tone: 'note' });
  }
  const others = Object.keys(components)
    .filter((key) => !DRAWN.has(key))
    .sort();
  if (others.length > 0) lines.push({ text: `Also has: ${others.join(', ')}`, tone: 'note' });
  return lines;
}
