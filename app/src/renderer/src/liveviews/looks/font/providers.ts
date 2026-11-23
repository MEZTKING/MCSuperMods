/**
 * A font's providers, read and made ready to draw (ADR 0121 D6; B624). References are followed
 * (later providers fill the gaps, as in the game), `filter`s are applied with the game's default
 * options (neither `uniform` nor `jp`), and each provider is listed with how close it is:
 *
 * - `bitmap`, `space`, `reference`: as in the game, checked (B619 3S7 measured MSM's own fonts in
 *   the game; `font-checked.test.ts` holds the view to those numbers);
 * - `ttf`: about right, drawn by the browser's own font loading (within about 1 pixel a word);
 * - `unihex`: about right, read in the font worker only when a font names one;
 * - anything else (`legacy_unicode`, which the game stopped reading at 1.20, an unknown type, a
 *   file not found or not readable, a reference that loops): named, not drawn.
 *
 * Where files come from: the project's own font files and pictures from the project; vanilla's
 * font JSON and `textures/font` pictures from the jar cache (`readAsset`); the unifont zips and
 * `font/include/unifont*.json` from the launcher's asset store, on demand and never cached.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import type { Fidelity } from '../../frame/fidelity';
import { type BitmapProvider, bitmapAdvance } from './layout';
import { decodePng, type RgbaPixels } from './png';
import type { SizeOverride, UnihexGlyph } from './unihex';

/** The deepest chain of references followed. */
export const MAX_REFERENCE_DEPTH = 8;

/** A bitmap provider ready to draw. */
export interface BitmapReady extends BitmapProvider {
  readonly type: 'bitmap';
  readonly sheet: RgbaPixels;
  readonly cellWidth: number;
  /** Code point to its cell. */
  readonly cells: ReadonlyMap<number, { readonly column: number; readonly row: number }>;
}

/** A space provider. */
export interface SpaceReady {
  readonly type: 'space';
  readonly advances: ReadonlyMap<number, number>;
}

/** A TrueType provider, loaded by the browser. */
export interface TtfReady {
  readonly type: 'ttf';
  /** The family name the browser knows the file by. */
  readonly family: string;
  readonly size: number;
  readonly oversample: number;
  readonly shift: readonly [number, number];
  readonly skip: ReadonlySet<number>;
}

/** A unihex provider; its glyphs come from the font worker for the typed line. */
export interface UnihexReady {
  readonly type: 'unihex';
  /** Which zip (its source and path), for the worker. */
  readonly file: string;
  readonly overrides: readonly SizeOverride[];
  /** Reads the zip (the project's, else the asset store's). */
  read(): Promise<Uint8Array | null>;
}

/** A provider ready to draw. */
export type ReadyProvider = BitmapReady | SpaceReady | TtfReady | UnihexReady;

/** One provider of the font as the view lists it. */
export interface ProviderEntry {
  /** The provider's `type` as written (`bitmap`, `reference`, ...). */
  readonly type: string;
  /** What it names (its file, its font, its characters), in plain words. */
  readonly what: string;
  /** The font it came through (`null` for the font itself). */
  readonly through: string | null;
  readonly fidelity: Fidelity;
  /** Ready to draw, or `null` for a reference (its providers follow it) or one not drawn. */
  readonly ready: ReadyProvider | null;
  /** Why it is not drawn, in plain words; `null` when it is. */
  readonly problem: string | null;
}

/** A font read and made ready. */
export interface ResolvedFont {
  readonly entries: readonly ProviderEntry[];
  /** A vanilla file was needed and the Minecraft folder is not set up. */
  readonly needsSetUp: boolean;
}

/** Where a font's files are read from. */
export interface FontSources {
  /** A font of the project by id (`ns:path`), or `null`. */
  projectFont(id: string): Json | null;
  /** A project file by its path (`assets/<ns>/...`), or `null`. */
  readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  /** A file of vanilla's jar by its path, or `null`; absent when the folder is not set up. */
  readJar?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  /** An object of the launcher's asset store by its key; absent when not set up. */
  readStore?: ((key: string) => Promise<Uint8Array | null>) | undefined;
  /** Loads a TrueType file and answers its family name, or `null` where it cannot. */
  loadTtf(bytes: Uint8Array): Promise<string | null>;
}

/** The game's default font options: neither `uniform` nor `jp`. */
const FONT_OPTIONS: Readonly<Record<string, boolean>> = { uniform: false, jp: false };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `ns:path` split, `minecraft` when no namespace is written. */
export function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon === -1
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/** Whether a provider's `filter` lets it in with the game's default options. */
export function passesFilter(filter: unknown): boolean {
  if (!isObject(filter)) return true;
  for (const [option, wanted] of Object.entries(filter)) {
    if (typeof wanted === 'boolean' && (FONT_OPTIONS[option] ?? false) !== wanted) return false;
  }
  return true;
}

/** A bitmap provider's cells and widths, from its picture and `chars` rows. */
export function bitmapFromSheet(
  sheet: RgbaPixels,
  chars: readonly string[],
  height: number,
  ascent: number,
): BitmapReady {
  const rows = chars.map((row) => Array.from(row));
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const cellWidth = Math.floor(sheet.width / columns);
  const cellHeight = Math.floor(sheet.height / Math.max(1, rows.length));
  const cells = new Map<number, { column: number; row: number }>();
  const widths = new Map<number, number>();
  rows.forEach((row, rowIndex) => {
    row.forEach((char, column) => {
      const codePoint = char.codePointAt(0) ?? 0;
      if (codePoint === 0 || cells.has(codePoint)) return;
      cells.set(codePoint, { column, row: rowIndex });
      let width = 0;
      for (let x = cellWidth - 1; x >= 0 && width === 0; x -= 1) {
        for (let y = 0; y < cellHeight; y += 1) {
          const at = ((rowIndex * cellHeight + y) * sheet.width + column * cellWidth + x) * 4;
          if ((sheet.data[at + 3] ?? 0) !== 0) {
            width = x + 1;
            break;
          }
        }
      }
      widths.set(codePoint, width);
    });
  });
  return { type: 'bitmap', sheet, cellWidth, cellHeight, cells, widths, height, ascent, chars };
}

/** The advance of a code point a provider has, or `null`. */
export function providerAdvance(
  ready: ReadyProvider,
  codePoint: number,
  measure: (ready: TtfReady, text: string) => number | null,
  unihex: ReadonlyMap<number, UnihexGlyph> | undefined,
): number | null {
  switch (ready.type) {
    case 'bitmap': {
      const width = ready.widths.get(codePoint);
      return width === undefined ? null : bitmapAdvance(width, ready.height, ready.cellHeight);
    }
    case 'space':
      return ready.advances.get(codePoint) ?? null;
    case 'ttf': {
      if (ready.skip.has(codePoint)) return null;
      const width = measure(ready, String.fromCodePoint(codePoint));
      if (width === null) return null;
      // The game lays TrueType glyphs out at `oversample` times the size, in whole pixels there.
      return Math.round(width * ready.oversample) / ready.oversample;
    }
    case 'unihex':
      return unihex?.get(codePoint)?.advance ?? null;
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function codePointOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const chars = Array.from(value);
  return chars.length === 1 ? (chars[0]?.codePointAt(0) ?? null) : null;
}

function decodeJson(bytes: Uint8Array | null): Json | null {
  if (bytes === null) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Json;
  } catch {
    return null;
  }
}

/** Reads and makes ready every provider of a font; see the module comment. */
export async function resolveFont(
  data: Json,
  ownId: string,
  sources: FontSources,
): Promise<ResolvedFont> {
  const entries: ProviderEntry[] = [];
  let needsSetUp = false;

  /** A file under `assets/`: the project's first, then (for `minecraft`) the jar's. */
  const readAsset = async (
    namespace: string,
    path: string,
  ): Promise<{ bytes: Uint8Array } | { missing: string }> => {
    const full = `assets/${namespace}/${path}`;
    const own = (await sources.readProject?.(full).catch(() => null)) ?? null;
    if (own !== null) return { bytes: own };
    if (namespace !== 'minecraft') return { missing: `${full} is not in the project` };
    if (sources.readJar === undefined) {
      needsSetUp = true;
      return { missing: `${full} needs your Minecraft folder set up` };
    }
    const jar = (await sources.readJar(full).catch(() => null)) ?? null;
    return jar === null ? { missing: `${full} is not in Minecraft's files` } : { bytes: jar };
  };

  /** A vanilla font file that lives in the asset store, not the jar (`include/unifont*`). */
  const readStoreFile = async (key: string): Promise<Uint8Array | null> => {
    if (sources.readStore === undefined) {
      needsSetUp = true;
      return null;
    }
    return (await sources.readStore(key).catch(() => null)) ?? null;
  };

  const fontJson = async (id: string): Promise<{ json: Json } | { missing: string }> => {
    const own = sources.projectFont(id);
    if (own !== null) return { json: own };
    const { namespace, path } = splitId(id);
    const file = await readAsset(namespace, `font/${path}.json`);
    if ('bytes' in file) {
      const json = decodeJson(file.bytes);
      return json === null ? { missing: `the font ${id} is not valid JSON` } : { json };
    }
    if (namespace === 'minecraft' && /^include\/unifont[^/]*$/.test(path)) {
      const json = decodeJson(await readStoreFile(`minecraft/font/${path}.json`));
      if (json !== null) return { json };
    }
    return { missing: `the font ${id} was not found (${file.missing})` };
  };

  const add = (entry: Omit<ProviderEntry, 'fidelity'> & { fidelity?: Fidelity }) => {
    entries.push({
      ...entry,
      fidelity: entry.fidelity ?? (entry.problem === null ? 'checked' : 'only_in_game'),
    });
  };

  const expand = async (font: Json, through: string | null, chain: readonly string[]) => {
    const providers = isObject(font) ? font.providers : undefined;
    if (!Array.isArray(providers)) return;
    for (const provider of providers) {
      if (!isObject(provider)) continue;
      if (!passesFilter(provider.filter)) continue;
      const type = typeof provider.type === 'string' ? provider.type : '(no type)';
      const base = { type, through };
      switch (type.replace(/^minecraft:/, '')) {
        case 'reference': {
          const id = typeof provider.id === 'string' ? provider.id : '';
          const normal = id.includes(':') ? id : `minecraft:${id}`;
          if (id === '') {
            add({ ...base, what: 'no font named', ready: null, problem: 'it names no font' });
          } else if (chain.includes(normal)) {
            add({ ...base, what: normal, ready: null, problem: 'it loops back to a font above' });
          } else if (chain.length > MAX_REFERENCE_DEPTH) {
            add({ ...base, what: normal, ready: null, problem: 'too many references deep' });
          } else {
            const font = await fontJson(normal);
            if ('missing' in font) {
              add({ ...base, what: normal, ready: null, problem: font.missing });
            } else {
              add({ ...base, what: normal, ready: null, problem: null });
              await expand(font.json, normal, [...chain, normal]);
            }
          }
          break;
        }
        case 'space': {
          const advances = new Map<number, number>();
          if (isObject(provider.advances)) {
            for (const [char, value] of Object.entries(provider.advances)) {
              const codePoint = codePointOf(char);
              if (codePoint !== null && typeof value === 'number') advances.set(codePoint, value);
            }
          }
          add({
            ...base,
            what: `${advances.size} character${advances.size === 1 ? '' : 's'}`,
            ready: { type: 'space', advances },
            problem: null,
          });
          break;
        }
        case 'bitmap': {
          const fileId = typeof provider.file === 'string' ? provider.file : '';
          const height = numberOr(provider.height, 8);
          const ascent = numberOr(provider.ascent, Number.NaN);
          const chars = Array.isArray(provider.chars)
            ? provider.chars.filter((row): row is string => typeof row === 'string')
            : [];
          const fail = (problem: string) =>
            add({ ...base, what: fileId || 'no picture', ready: null, problem });
          if (fileId === '') {
            fail('it names no picture');
            break;
          }
          if (!Number.isFinite(ascent)) {
            fail('it has no ascent');
            break;
          }
          if (ascent > height) {
            fail('its ascent is above its height, so the game refuses it');
            break;
          }
          const { namespace, path } = splitId(fileId);
          const file = await readAsset(namespace, `textures/${path}`);
          if (!('bytes' in file)) {
            fail(file.missing);
            break;
          }
          let sheet: RgbaPixels;
          try {
            sheet = decodePng(file.bytes);
          } catch (error) {
            fail(`the picture is ${(error as Error).message}`);
            break;
          }
          add({
            ...base,
            what: fileId,
            ready: bitmapFromSheet(sheet, chars, height, ascent),
            problem: null,
          });
          break;
        }
        case 'ttf': {
          const fileId = typeof provider.file === 'string' ? provider.file : '';
          const fail = (problem: string) =>
            add({ ...base, what: fileId || 'no file', ready: null, problem });
          if (fileId === '') {
            fail('it names no TrueType file');
            break;
          }
          const { namespace, path } = splitId(fileId);
          const file = await readAsset(namespace, `font/${path}`);
          if (!('bytes' in file)) {
            fail(file.missing);
            break;
          }
          const family = await sources.loadTtf(file.bytes).catch(() => null);
          if (family === null) {
            fail('the app could not load this TrueType file here');
            break;
          }
          const shift = Array.isArray(provider.shift) ? provider.shift : [];
          const skipText =
            typeof provider.skip === 'string'
              ? provider.skip
              : Array.isArray(provider.skip)
                ? provider.skip.filter((part): part is string => typeof part === 'string').join('')
                : '';
          add({
            ...base,
            what: fileId,
            fidelity: 'about_right',
            ready: {
              type: 'ttf',
              family,
              size: numberOr(provider.size, 11),
              oversample: Math.max(0.01, numberOr(provider.oversample, 1)),
              shift: [numberOr(shift[0], 0), numberOr(shift[1], 0)],
              skip: new Set(Array.from(skipText, (char) => char.codePointAt(0) ?? 0)),
            },
            problem: null,
          });
          break;
        }
        case 'unihex': {
          const fileId = typeof provider.hex_file === 'string' ? provider.hex_file : '';
          if (fileId === '') {
            add({ ...base, what: 'no file', ready: null, problem: 'it names no hex file' });
            break;
          }
          const { namespace, path } = splitId(fileId);
          const overrides: SizeOverride[] = [];
          if (Array.isArray(provider.size_overrides)) {
            for (const entry of provider.size_overrides) {
              if (!isObject(entry)) continue;
              const from = codePointOf(entry.from);
              const to = codePointOf(entry.to);
              if (from === null || to === null) continue;
              overrides.push({
                from,
                to,
                left: numberOr(entry.left, 0),
                right: numberOr(entry.right, 0),
              });
            }
          }
          const full = `assets/${namespace}/${path}`;
          const inStore = namespace === 'minecraft' && /^font\/unifont[^/]*\.zip$/.test(path);
          if (namespace === 'minecraft' && inStore && sources.readStore === undefined) {
            // The project may still hold its own copy; only the store needs the set-up.
            const own = (await sources.readProject?.(full).catch(() => null)) ?? null;
            if (own === null) {
              needsSetUp = true;
              add({
                ...base,
                what: fileId,
                ready: null,
                problem:
                  'Minecraft’s unifont is read from your Minecraft folder, which is not set up',
              });
              break;
            }
          }
          add({
            ...base,
            what: fileId,
            fidelity: 'about_right',
            ready: {
              type: 'unihex',
              file: `${namespace}:${path}`,
              overrides,
              async read() {
                const own = (await sources.readProject?.(full).catch(() => null)) ?? null;
                if (own !== null) return own;
                if (!inStore || sources.readStore === undefined) return null;
                return (await sources.readStore(`${namespace}/${path}`).catch(() => null)) ?? null;
              },
            },
            problem: null,
          });
          break;
        }
        case 'legacy_unicode':
          add({
            ...base,
            what: 'legacy_unicode',
            ready: null,
            problem: 'the game stopped reading this provider type at 1.20; use unihex',
          });
          break;
        default:
          add({
            ...base,
            what: type,
            ready: null,
            problem: `MSM cannot draw a provider of type “${type}”`,
          });
      }
    }
  };

  const own = ownId.includes(':') ? ownId : `minecraft:${ownId}`;
  await expand(data, null, [own]);
  return { entries, needsSetUp };
}
