/**
 * Structure-block saves in the managed instance's worlds, for "Bring builds from my test
 * worlds" (ADR 0116 D3). A structure block's Save button (`StructureBlockEntity.saveStructure`)
 * writes `<world>/generated/<namespace>/structure/<path>.nbt` (B547, on both targets; a
 * redstone pulse in SAVE mode does not save). The app imports them through
 * the existing `.nbt` importer.
 *
 * Read-only over {@link InstallFileSystem}; real-path containment of the world folder is the
 * host's (the app's main process checks each file before reading it).
 *
 * @packageDocumentation
 */

import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';

/** The world folder's folder of generated files. */
export const STRUCTURE_SAVES_FOLDER = 'generated';
/** The registry folder below each namespace (verify at implementation; B547 measured it). */
export const STRUCTURE_SAVES_REGISTRY = 'structure';
/** The most saves listed per world. */
export const STRUCTURE_SAVES_MAX = 500;
/** The deepest structure path listed (folders below `structure/`). */
export const STRUCTURE_SAVE_MAX_DEPTH = 8;
/** The largest structure save read, in bytes (a 48 x 48 x 48 save is far below it). */
export const STRUCTURE_SAVE_MAX_BYTES = 16 * 1024 * 1024;

const NAMESPACE = /^[a-z0-9_.-]{1,64}$/;
const PATH_SEGMENT = /^[a-z0-9_.-]{1,128}$/;

/** One structure-block save of a world. */
export interface StructureSave {
  /** `<namespace>:<path>`, the name typed into the structure block. */
  id: string;
  /** Relative to the world folder: `generated/<namespace>/structure/<path>.nbt`. */
  relative: string;
}

/** Whether `id` is `<namespace>:<path>` as a structure block names a save. */
export function isStructureSaveId(id: string): boolean {
  const colon = id.indexOf(':');
  if (colon <= 0) return false;
  const namespace = id.slice(0, colon);
  const segments = id.slice(colon + 1).split('/');
  return (
    NAMESPACE.test(namespace) &&
    segments.length <= STRUCTURE_SAVE_MAX_DEPTH + 1 &&
    segments.every((segment) => PATH_SEGMENT.test(segment) && !/^\.+$/.test(segment))
  );
}

/**
 * The save file of `id`, relative to the world folder.
 *
 * @throws Error When `id` is not a structure save id.
 */
export function structureSavePath(id: string): string {
  if (!isStructureSaveId(id)) throw new Error(`${JSON.stringify(id)} is not a structure name.`);
  const colon = id.indexOf(':');
  return `${STRUCTURE_SAVES_FOLDER}/${id.slice(0, colon)}/${STRUCTURE_SAVES_REGISTRY}/${id.slice(colon + 1)}.nbt`;
}

/** The save id of a world-relative path, or `null` when it is not a structure save. */
export function structureSaveIdOf(relative: string): string | null {
  const parts = relative.split('/');
  if (
    parts.length < 4 ||
    parts[0] !== STRUCTURE_SAVES_FOLDER ||
    parts[2] !== STRUCTURE_SAVES_REGISTRY
  ) {
    return null;
  }
  const last = parts[parts.length - 1] ?? '';
  if (!last.endsWith('.nbt')) return null;
  const path = [...parts.slice(3, -1), last.slice(0, -'.nbt'.length)].join('/');
  const id = `${parts[1]}:${path}`;
  return isStructureSaveId(id) ? id : null;
}

/**
 * The import file name of a save: its path with `/` as `_`, plus `.nbt`, so the `.nbt`
 * importer names the element after the whole path (`houses/hut` becomes `houses_hut`).
 */
export function structureSaveFileName(id: string): string {
  if (!isStructureSaveId(id)) throw new Error(`${JSON.stringify(id)} is not a structure name.`);
  return `${id.slice(id.indexOf(':') + 1).replaceAll('/', '_')}.nbt`;
}

/**
 * Every structure save of the world folder `worldDir`, sorted by id; at most
 * {@link STRUCTURE_SAVES_MAX}. Entries that are not valid names are skipped; a world without
 * `generated/` has none.
 */
export async function listStructureSaves(
  fs: Pick<InstallFileSystem, 'exists' | 'readDir'>,
  worldDir: string,
): Promise<StructureSave[]> {
  const generated = joinInstallPath(worldDir, STRUCTURE_SAVES_FOLDER);
  if (!(await fs.exists(generated))) return [];
  const out: StructureSave[] = [];
  const walk = async (dir: string, relative: string, depth: number): Promise<void> => {
    let entries: Awaited<ReturnType<InstallFileSystem['readDir']>>;
    try {
      entries = await fs.readDir(dir);
    } catch {
      return;
    }
    for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (out.length >= STRUCTURE_SAVES_MAX) return;
      const childRel = `${relative}/${entry.name}`;
      if (entry.kind === 'directory') {
        if (depth < STRUCTURE_SAVE_MAX_DEPTH && PATH_SEGMENT.test(entry.name)) {
          await walk(joinInstallPath(dir, entry.name), childRel, depth + 1);
        }
        continue;
      }
      const id = structureSaveIdOf(childRel);
      if (id !== null) out.push({ id, relative: childRel });
    }
  };
  let namespaces: Awaited<ReturnType<InstallFileSystem['readDir']>>;
  try {
    namespaces = await fs.readDir(generated);
  } catch {
    return [];
  }
  for (const entry of namespaces) {
    if (entry.kind !== 'directory' || !NAMESPACE.test(entry.name)) continue;
    const folder = joinInstallPath(generated, entry.name, STRUCTURE_SAVES_REGISTRY);
    if (!(await fs.exists(folder))) continue;
    await walk(folder, `${STRUCTURE_SAVES_FOLDER}/${entry.name}/${STRUCTURE_SAVES_REGISTRY}`, 0);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, STRUCTURE_SAVES_MAX);
}
