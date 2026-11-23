/**
 * The launcher's asset store (ADR 0121 D3; the B619 spike, 3S1): the files Minecraft downloads
 * beside the client jar rather than inside it, such as `sounds.json`, every sound and the unifont
 * archives. A version's JSON names its asset index (`assetIndex.id`); the index
 * `<store>/indexes/<id>.json` maps a key such as `minecraft/sounds/mob/wolf/bark1.ogg` to
 * `{ hash, size }`; the file is `<store>/objects/<hash[0..2]>/<hash>`.
 *
 * Objects are read on demand, one at a time, size-capped and only for the keys of
 * {@link ASSET_OBJECT_KEY_PATTERNS}. Nothing here copies, caches or writes an object: the bytes
 * go to the caller and are never put into MSM's asset cache, a project or an export.
 */

import { isPathInside } from '../launchers/paths';
import type { LauncherKind } from '../launchers/types';
import { type InstallFileSystem, joinInstallPath } from './fs';

/** The largest object read (the longest vanilla track is about 11.3 MB; B619 3S1). */
export const ASSET_OBJECT_MAX_BYTES = 16 * 1024 * 1024;

/** The largest asset index or version JSON read (vanilla's indexes are about 0.5 MB). */
export const ASSET_INDEX_MAX_BYTES = 16 * 1024 * 1024;

/** How many `inheritsFrom` steps a version JSON is followed to find its asset index. */
const MAX_INHERITS = 4;

/**
 * The index keys that may be read (B619's list for B621): vanilla's `sounds.json`, its sound
 * files, and the unifont archives and their include files. Any other key is refused.
 */
export const ASSET_OBJECT_KEY_PATTERNS: readonly RegExp[] = Object.freeze([
  /^minecraft\/sounds\.json$/,
  /^minecraft\/sounds\/(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.ogg$/,
  /^minecraft\/font\/unifont[a-z0-9_.-]*\.zip$/,
  /^minecraft\/font\/include\/unifont[a-z0-9_.-]*\.json$/,
]);

/** Whether `key` is an index key that may be read: one of {@link ASSET_OBJECT_KEY_PATTERNS}. */
export function isAllowedAssetKey(key: string): boolean {
  if (key.length > 512 || key.split('/').some((part) => part === '' || /^\.+$/.test(part))) {
    return false;
  }
  return ASSET_OBJECT_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/** One index entry: the object's SHA-1 (lower-case hex) and its size in bytes. */
export interface AssetIndexEntry {
  hash: string;
  size: number;
}

/** A parsed asset index. */
export interface AssetIndex {
  /** The index id (`assetIndex.id` of the version JSON). */
  id: string;
  /** Index key to entry; entries with a malformed hash or size are left out. */
  objects: ReadonlyMap<string, AssetIndexEntry>;
}

/** Why an object could not be read. */
export type AssetObjectFailure =
  /** No launcher store holds the version, or the store has no `assets/` folder. */
  | 'not_set_up'
  /** The version JSON or its asset index is missing or unreadable. */
  | 'no_index'
  /** The index does not list the key. */
  | 'not_listed'
  /** The key is not one MSM reads, or the object resolves outside the store. */
  | 'not_allowed'
  /** The object is larger than the cap. */
  | 'too_large'
  /** The index lists the key but the file is not there (or not the listed size). */
  | 'missing';

/** What {@link readAssetObject} answers. */
export type AssetObjectResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: AssetObjectFailure };

/** A located asset store of one installed version. */
export interface AssetStore {
  /** Absolute path of the store (the folder holding `indexes/` and `objects/`). */
  dir: string;
  /** The version's asset index id. */
  indexId: string;
  /** Absolute path of `<dir>/indexes/<indexId>.json`. */
  indexPath: string;
}

/**
 * The asset store of a launcher root: official and Prism/MultiMC `<root>/assets/`, CurseForge
 * `<root>/Install/assets/` (the last two: verify at implementation).
 */
export function assetStoreDir(launcher: LauncherKind, root: string): string {
  switch (launcher) {
    case 'official':
    case 'prism':
    case 'multimc':
      return joinInstallPath(root, 'assets');
    case 'curseforge':
      return joinInstallPath(root, 'Install', 'assets');
  }
}

/**
 * The version JSON that names the asset index of `versionId` in a launcher root: official
 * `<root>/versions/<v>/<v>.json`, Prism/MultiMC the meta cache `<root>/meta/net.minecraft/<v>.json`
 * (verify at implementation), CurseForge `<root>/Install/versions/<v>/<v>.json`.
 *
 * @throws Error When `versionId` is not one plain path segment.
 */
export function versionJsonPath(launcher: LauncherKind, root: string, versionId: string): string {
  if (!isVersionSegment(versionId)) {
    throw new Error(`Version id ${JSON.stringify(versionId)} is not a single path segment.`);
  }
  switch (launcher) {
    case 'official':
      return joinInstallPath(root, 'versions', versionId, `${versionId}.json`);
    case 'prism':
    case 'multimc':
      return joinInstallPath(root, 'meta', 'net.minecraft', `${versionId}.json`);
    case 'curseforge':
      return joinInstallPath(root, 'Install', 'versions', versionId, `${versionId}.json`);
  }
}

/**
 * Reads the asset index id a version JSON names (`assetIndex.id`, else the legacy `assets`
 * string), following `inheritsFrom` within the same `versions/` folder for the official and
 * CurseForge layouts. Returns `null` when the file or the field is missing or unreadable.
 */
export async function readAssetIndexId(
  fs: InstallFileSystem,
  launcher: LauncherKind,
  root: string,
  versionId: string,
): Promise<string | null> {
  let current = versionId;
  for (let step = 0; step <= MAX_INHERITS; step += 1) {
    let path: string;
    try {
      path = versionJsonPath(launcher, root, current);
    } catch {
      return null;
    }
    const json = await readJsonObject(fs, path);
    if (json === null) return null;
    const index = json.assetIndex;
    if (typeof index === 'object' && index !== null && !Array.isArray(index)) {
      const id = (index as Record<string, unknown>).id;
      if (typeof id === 'string' && isVersionSegment(id)) return id;
    }
    if (typeof json.assets === 'string' && isVersionSegment(json.assets)) return json.assets;
    const parent = json.inheritsFrom;
    if (launcher === 'prism' || launcher === 'multimc' || typeof parent !== 'string') return null;
    current = parent;
  }
  return null;
}

/**
 * Finds the asset store of an installed version in a launcher root: the store folder, the
 * version's index id and the index path, or why it cannot be read.
 */
export async function findAssetStore(
  fs: InstallFileSystem,
  launcher: LauncherKind,
  root: string,
  versionId: string,
): Promise<{ ok: true; store: AssetStore } | { ok: false; reason: 'not_set_up' | 'no_index' }> {
  const dir = assetStoreDir(launcher, root);
  if (!(await fs.exists(dir))) return { ok: false, reason: 'not_set_up' };
  const indexId = await readAssetIndexId(fs, launcher, root, versionId);
  if (indexId === null) return { ok: false, reason: 'no_index' };
  const indexPath = joinInstallPath(dir, 'indexes', `${indexId}.json`);
  if (!(await fs.exists(indexPath))) return { ok: false, reason: 'no_index' };
  return { ok: true, store: { dir, indexId, indexPath } };
}

/**
 * Parses an asset index. Entries whose hash is not 40 lower-case hex digits or whose size is
 * not a non-negative integer are left out.
 *
 * @throws Error When the bytes are not a JSON object with an `objects` object.
 */
export function parseAssetIndex(bytes: Uint8Array, id: string): AssetIndex {
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The asset index is not a JSON object.');
  }
  const raw = (parsed as Record<string, unknown>).objects;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('The asset index has no objects.');
  }
  const objects = new Map<string, AssetIndexEntry>();
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const { hash, size } = value as Record<string, unknown>;
    if (typeof hash !== 'string' || !/^[0-9a-f]{40}$/.test(hash)) continue;
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) continue;
    objects.set(key, { hash, size });
  }
  return { id, objects };
}

/**
 * Reads and parses a store's asset index, or `null` when it is missing, too large, resolves
 * outside the store's `indexes/` folder or is not an index.
 */
export async function readAssetIndex(
  fs: InstallFileSystem,
  store: AssetStore,
): Promise<AssetIndex | null> {
  if (!(await isContained(fs, joinInstallPath(store.dir, 'indexes'), store.indexPath))) {
    return null;
  }
  try {
    const bytes = await fs.readFile(store.indexPath);
    if (bytes.byteLength > ASSET_INDEX_MAX_BYTES) return null;
    return parseAssetIndex(bytes, store.indexId);
  } catch {
    return null;
  }
}

/** The path of an object in a store: `<dir>/objects/<hash[0..2]>/<hash>`. */
export function assetObjectPath(dir: string, hash: string): string {
  if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error(`${JSON.stringify(hash)} is not a SHA-1.`);
  return joinInstallPath(dir, 'objects', hash.slice(0, 2), hash);
}

/** Options for {@link readAssetObject}. */
export interface ReadAssetObjectOptions {
  /** The size cap in bytes. Defaults to {@link ASSET_OBJECT_MAX_BYTES}. */
  maxBytes?: number;
}

/**
 * Reads one object by its index key: refused unless the key is allowed
 * ({@link isAllowedAssetKey}), listed, at most the cap in size and, when the file system can
 * resolve links, really inside the store's `objects/` folder. The bytes are returned and never
 * kept.
 */
export async function readAssetObject(
  fs: InstallFileSystem,
  store: AssetStore,
  index: AssetIndex,
  key: string,
  options: ReadAssetObjectOptions = {},
): Promise<AssetObjectResult> {
  const maxBytes = options.maxBytes ?? ASSET_OBJECT_MAX_BYTES;
  if (!isAllowedAssetKey(key)) return { ok: false, reason: 'not_allowed' };
  const entry = index.objects.get(key);
  if (entry === undefined) return { ok: false, reason: 'not_listed' };
  if (entry.size > maxBytes) return { ok: false, reason: 'too_large' };
  const path = assetObjectPath(store.dir, entry.hash);
  if (!(await fs.exists(path))) return { ok: false, reason: 'missing' };
  if (!(await isContained(fs, joinInstallPath(store.dir, 'objects'), path))) {
    return { ok: false, reason: 'not_allowed' };
  }
  let bytes: Uint8Array;
  try {
    bytes = await fs.readFile(path);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (bytes.byteLength > maxBytes) return { ok: false, reason: 'too_large' };
  if (bytes.byteLength !== entry.size) return { ok: false, reason: 'missing' };
  return { ok: true, bytes };
}

/**
 * Whether `path` really lies inside `parent`: both resolved through `fs.realpath` when the file
 * system has it (a link out of the store is refused); else by their names alone.
 */
async function isContained(fs: InstallFileSystem, parent: string, path: string): Promise<boolean> {
  if (fs.realpath === undefined) return isPathInside(parent, path);
  try {
    const [realParent, realPath] = await Promise.all([fs.realpath(parent), fs.realpath(path)]);
    return isPathInside(realParent, realPath);
  } catch {
    return false;
  }
}

async function readJsonObject(
  fs: InstallFileSystem,
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    if (!(await fs.exists(path))) return null;
    const bytes = await fs.readFile(path);
    if (bytes.byteLength > ASSET_INDEX_MAX_BYTES) return null;
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isVersionSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._+-]+$/.test(value) &&
    value !== '.' &&
    value !== '..'
  );
}
