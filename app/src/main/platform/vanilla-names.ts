/**
 * The English names of vanilla things from a cached `en_us.json` (ADR 0124 D3, B656): the keys
 * the search wants (spike B650, SQ8) picked out of the lang file of the user's own client jar,
 * which the asset cache already holds (`PREVIEW_ASSET_PATTERNS`). Nothing here is bundled: the
 * file is read from `<msmHome>/cache/assets/<version>/` by `minecraft.ts` and only parsed here.
 *
 * Every key is matched against a strict pattern and every value checked (a string of at most
 * {@link VANILLA_NAME_MAX_LENGTH} characters with no control character); anything else is left
 * out.
 *
 * @packageDocumentation
 */

import { targetById } from '@msm/targets';
import type { VanillaNameSort, VanillaNames } from '../../shared/platform';

/** The cached lang file, relative to the cache folder. */
export const LANG_FILE_PATH = 'assets/minecraft/lang/en_us.json';
/** The largest lang file read (about 550 kB on both targets). */
export const LANG_FILE_MAX_BYTES = 4 * 1024 * 1024;
/** The longest name kept. */
export const VANILLA_NAME_MAX_LENGTH = 200;
/** The most names kept per sort (about 1,300 blocks and 1,500 items today). */
export const VANILLA_NAMES_PER_SORT_MAX = 10_000;

/** An id path of one segment (`stone`, `diamond_sword`). */
const PATH = '[a-z0-9_]+';
const RULES: readonly { sort: VanillaNameSort; pattern: RegExp; id: (tail: string) => string }[] = [
  // Potions first: `item.minecraft.potion.effect.<id>` would not match the items' pattern anyway.
  {
    sort: 'potions',
    pattern: new RegExp(`^item\\.minecraft\\.potion\\.effect\\.(${PATH})$`),
    id: (tail) => `minecraft:${tail}`,
  },
  {
    sort: 'blocks',
    pattern: new RegExp(`^block\\.minecraft\\.(${PATH})$`),
    id: (t) => `minecraft:${t}`,
  },
  {
    sort: 'items',
    pattern: new RegExp(`^item\\.minecraft\\.(${PATH})$`),
    id: (t) => `minecraft:${t}`,
  },
  {
    sort: 'entityTypes',
    pattern: new RegExp(`^entity\\.minecraft\\.(${PATH})$`),
    id: (t) => `minecraft:${t}`,
  },
  {
    sort: 'biomes',
    pattern: new RegExp(`^biome\\.minecraft\\.(${PATH})$`),
    id: (t) => `minecraft:${t}`,
  },
  {
    sort: 'effects',
    pattern: new RegExp(`^effect\\.minecraft\\.(${PATH})$`),
    id: (t) => `minecraft:${t}`,
  },
  {
    sort: 'enchantments',
    pattern: new RegExp(`^enchantment\\.minecraft\\.(${PATH})$`),
    id: (t) => `minecraft:${t}`,
  },
  {
    sort: 'subtitles',
    pattern: new RegExp(`^subtitles\\.(${PATH}(?:\\.${PATH}){0,7})$`),
    id: (t) => t,
  },
];

/** Whether `value` is a name worth keeping. */
function isName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value.length <= VANILLA_NAME_MAX_LENGTH &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are refused.
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/** An empty answer of every sort. */
function emptyNames(version: string): VanillaNames {
  return {
    version,
    blocks: {},
    items: {},
    entityTypes: {},
    biomes: {},
    effects: {},
    enchantments: {},
    potions: {},
    subtitles: {},
  };
}

/**
 * The names in a parsed lang file, by sort and id. Keys outside the patterns, values that are not
 * names and anything past {@link VANILLA_NAMES_PER_SORT_MAX} per sort are left out.
 *
 * @throws Error When `lang` is not a JSON object.
 */
export function namesFromLang(lang: unknown, version: string): VanillaNames {
  if (typeof lang !== 'object' || lang === null || Array.isArray(lang)) {
    throw new Error('The cached en_us.json is not a JSON object.');
  }
  const names = emptyNames(version);
  const counts = new Map<VanillaNameSort, number>();
  for (const [key, value] of Object.entries(lang)) {
    if (!isName(value)) continue;
    for (const rule of RULES) {
      const match = rule.pattern.exec(key);
      if (match === null) continue;
      const count = counts.get(rule.sort) ?? 0;
      if (count < VANILLA_NAMES_PER_SORT_MAX) {
        (names[rule.sort] as Record<string, string>)[rule.id(match[1] ?? '')] = value;
        counts.set(rule.sort, count + 1);
      }
      break;
    }
  }
  return names;
}

/**
 * Parses the bytes of a cached lang file into {@link VanillaNames}.
 *
 * @throws Error When the file is larger than {@link LANG_FILE_MAX_BYTES} or is not a JSON object.
 */
export function parseLangNames(bytes: Uint8Array, version: string): VanillaNames {
  if (bytes.byteLength > LANG_FILE_MAX_BYTES) {
    throw new Error('The cached en_us.json is too large.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('The cached en_us.json is not valid JSON.');
  }
  return namesFromLang(parsed, version);
}

/**
 * `minecraft:names` for a built-in target: its version's names through `readLangNames`
 * (`MinecraftService.readLangNames`).
 *
 * @throws Error When `targetId` is not a built-in target.
 */
export async function readTargetNames(
  readLangNames: (mcVersion: string) => Promise<VanillaNames | null>,
  targetId: string,
  mcVersionOf: (targetId: string) => string | undefined = (id) => targetById(id)?.target.mcVersion,
): Promise<VanillaNames | null> {
  const mcVersion = mcVersionOf(targetId);
  if (mcVersion === undefined) throw new Error(`Unknown target ${JSON.stringify(targetId)}.`);
  return readLangNames(mcVersion);
}
