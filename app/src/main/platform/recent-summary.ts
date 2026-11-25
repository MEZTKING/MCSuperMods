/**
 * What a Your mods card shows of a recent mod (ADR 0128 D4): its picture and how many things it
 * has, read from the folder without opening it. Read lazily per card by the renderer and cached
 * there; small and bounded here (at most {@link MAX_FILES} element files are read, a picture of
 * at most {@link MAX_PICTURE_BYTES}).
 *
 * - The picture is the mod's `pack.png` (at the folder's root, else `assets/<ns>/pack.png`),
 *   else its first item texture, else its first block texture (by name), else none.
 * - The things are counted as Home's My things counts them (`components/home/things.ts`): one
 *   per Creator set (`meta.creator.setId`) and one per loose block, item, mob, effect, potion,
 *   vehicle, village job, liquid, rule book, command, key, on-screen element or creative tab.
 * - The target is the first of `targets` in `msm.project.json` (ADR 0136 D5).
 *
 * @packageDocumentation
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { RecentProjectSummary } from '../../shared/platform';

/** The element folders whose files are things (the kinds of `THING_KINDS`). */
export const THING_FOLDERS = [
  'vehicle',
  'villager_profession',
  'fluid',
  'block',
  'item',
  'entity',
  'effect',
  'potion',
  'rules',
  'command',
  'key_bind',
  'hud',
  'creative_tab',
] as const;

/** At most this many element files are read per mod. */
export const MAX_FILES = 2000;
/** A picture larger than this is left out. */
export const MAX_PICTURE_BYTES = 512 * 1024;

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** The JSON files under `dir`, depth first, in name order, at most `left.count`. */
async function jsonFiles(dir: string, left: { count: number }, out: string[]): Promise<void> {
  if (left.count <= 0) return;
  let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (left.count <= 0) return;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await jsonFiles(path, left, out);
    else if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(path);
      left.count -= 1;
    }
  }
}

/** The first PNG under `dir` (depth first, by name), or `null`. */
async function firstPng(dir: string): Promise<string | null> {
  let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.png')) return join(dir, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await firstPng(join(dir, entry.name));
    if (found !== null) return found;
  }
  return null;
}

async function readPicture(path: string): Promise<Uint8Array | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_PICTURE_BYTES) return null;
    const bytes = await readFile(path);
    // A PNG starts with its signature; anything else is left out.
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

/** The parsed `msm.project.json` of `root`, or an empty record when unreadable. */
async function manifestOf(root: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, 'msm.project.json'), 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The mod's own namespaces from its manifest (never `minecraft`). */
function namespacesOf(manifest: Record<string, unknown>): string[] {
  const list = manifest.namespaces;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry !== 'minecraft' && /^[a-z0-9_.-]+$/.test(entry),
  );
}

/** The target the mod is made for: the first of its manifest's `targets` (ADR 0136 D5). */
function targetOf(manifest: Record<string, unknown>): string | undefined {
  const list = manifest.targets;
  if (!Array.isArray(list)) return undefined;
  const first: unknown = list[0];
  return typeof first === 'string' && /^[a-z0-9_.-]+$/.test(first) ? first : undefined;
}

/** The set id of an element file's Creator set, or `null` for a loose element. */
function setIdOf(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { meta?: { creator?: { setId?: unknown } } };
    const setId = parsed.meta?.creator?.setId;
    return typeof setId === 'string' && setId !== '' ? setId : null;
  } catch {
    return null;
  }
}

/** Reads the summary of the mod in `root` (an absolute folder the caller has checked). */
export async function readRecentSummary(root: string): Promise<RecentProjectSummary> {
  const manifest = await manifestOf(root);
  const namespaces = namespacesOf(manifest);
  const target = targetOf(manifest);
  const made = target === undefined ? {} : { target };
  const left = { count: MAX_FILES };
  const files: string[] = [];
  for (const namespace of namespaces) {
    for (const folder of THING_FOLDERS) {
      const dir = join(root, 'content', namespace, folder);
      if (await isDir(dir)) await jsonFiles(dir, left, files);
    }
  }
  const sets = new Set<string>();
  let loose = 0;
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const setId = setIdOf(text);
    if (setId === null) loose += 1;
    else sets.add(setId);
  }

  const packs = [
    join(root, 'pack.png'),
    ...namespaces.map((namespace) => join(root, 'assets', namespace, 'pack.png')),
  ];
  for (const path of packs) {
    const picture = await readPicture(path);
    if (picture !== null)
      return { things: sets.size + loose, picture, pictureFrom: 'pack', ...made };
  }
  for (const sort of ['item', 'block']) {
    for (const namespace of namespaces) {
      const path = await firstPng(join(root, 'assets', namespace, 'textures', sort));
      const picture = path === null ? null : await readPicture(path);
      if (picture !== null) {
        return { things: sets.size + loose, picture, pictureFrom: 'texture', ...made };
      }
    }
  }
  return { things: sets.size + loose, picture: null, pictureFrom: null, ...made };
}
