/**
 * Modpacks in the main process (ADR 0046): the remembered list, reading and writing
 * `msm.modpack.json`, adding member projects, read-only member snapshots for builds, and
 * Modrinth lookups. The file format lives in `@msm/core`; Modrinth parsing in `@msm/interop`.
 *
 * Only modpacks in the remembered list are read or written, and only members a remembered
 * modpack lists are snapshotted, so the renderer cannot read arbitrary folders through it.
 *
 * @packageDocumentation
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import {
  createModpack,
  isModpackProjectPath,
  MODPACK_FILE,
  type Modpack,
  parseModpack,
  serialiseModpack,
} from '@msm/core';
import {
  type Downloader,
  fetchDownloader,
  ModrinthLookupError,
  resolveModrinthMod,
} from '@msm/interop';
import type {
  ModpackListEntry,
  ModpackMemberView,
  ModpackView,
  ModrinthModLookup,
  ProjectSnapshotFile,
} from '../../shared/platform';
import type { SettingsStore } from './settings';

/** The project file a member folder must hold. */
const PROJECT_FILE = 'msm.project.json';
/** What a member snapshot includes, besides the project file. */
const SNAPSHOT_FOLDERS = ['content', 'assets'] as const;
/** Snapshot limits: a project bigger than this is refused rather than half read. */
export const SNAPSHOT_MAX_FILES = 20_000;
export const SNAPSHOT_MAX_BYTES = 512 * 1024 * 1024;

/** The service; mirrors `PlatformAdapter['modpacks']`. */
export interface ModpackService {
  list(): Promise<ModpackListEntry[]>;
  create(name: string, targetId: string): Promise<ModpackView | null>;
  addExisting(): Promise<ModpackView | null>;
  forget(root: string): Promise<void>;
  read(root: string): Promise<ModpackView>;
  write(root: string, modpack: Modpack): Promise<ModpackView>;
  addProject(root: string, projectRoot: string | null): Promise<ModpackView | null>;
  readProject(root: string, path: string): Promise<ProjectSnapshotFile[]>;
  lookupMod(input: string, gameVersion: string): Promise<ModrinthModLookup>;
}

/** What the service needs from its host. */
export interface ModpackDeps {
  settings: Pick<SettingsStore, 'modpackRoots' | 'addModpackRoot' | 'removeModpackRoot'>;
  /** A folder picker; returns an absolute folder or `null`. */
  pickDirectory(opts: { title: string; mustBeEmpty?: boolean }): Promise<string | null>;
  /** Atomic file write (temporary file and rename). */
  writeFileAtomic(path: string, data: Uint8Array): Promise<void>;
  /** Whether paths compare case-insensitively (Windows, macOS). */
  caseInsensitive: boolean;
  /** Defaults to `fetch` over HTTPS. */
  download?: Downloader;
}

/** `path` with `/` separators, for member paths written to the modpack file. */
function posix(path: string): string {
  return path.split(sep).join('/');
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Reads `msm.project.json`'s name and target id; `null`s when unreadable. */
async function projectFacts(
  root: string,
): Promise<{ name: string | null; targetId: string | null }> {
  try {
    const parsed = JSON.parse(await readFile(join(root, PROJECT_FILE), 'utf8')) as Record<
      string,
      unknown
    >;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : null,
      targetId:
        Array.isArray(parsed.targets) && typeof parsed.targets[0] === 'string'
          ? parsed.targets[0]
          : null,
    };
  } catch {
    return { name: null, targetId: null };
  }
}

/** Creates the service. */
export function createModpackService(deps: ModpackDeps): ModpackService {
  const download = deps.download ?? fetchDownloader;
  const key = (path: string) => {
    const folder = normalize(path).replace(/[\\/]+$/, '');
    return deps.caseInsensitive ? folder.toLowerCase() : folder;
  };

  /** The remembered root matching `root`, or a thrown error. */
  const known = async (root: string): Promise<string> => {
    if (!isAbsolute(root)) throw new Error('A modpack folder must be an absolute path.');
    const match = (await deps.settings.modpackRoots()).find((entry) => key(entry) === key(root));
    if (match === undefined) throw new Error('That modpack is not in the Modpacks list.');
    return match;
  };

  const readFileOf = async (root: string): Promise<Modpack> => {
    let text: string;
    try {
      text = await readFile(join(root, MODPACK_FILE), 'utf8');
    } catch {
      throw new Error(`${root} has no ${MODPACK_FILE}.`);
    }
    return parseModpack(text);
  };

  /** The absolute folder of member `path`. */
  const memberRoot = (root: string, path: string): string =>
    path.startsWith('/') || /^[A-Za-z]:\//.test(path)
      ? normalize(path)
      : resolve(root, ...path.split('/'));

  const view = async (root: string, modpack: Modpack): Promise<ModpackView> => {
    const members: ModpackMemberView[] = [];
    for (const { path } of modpack.projects) {
      const folder = memberRoot(root, path);
      const found = await isFile(join(folder, PROJECT_FILE));
      members.push({
        path,
        root: folder,
        found,
        ...(found ? await projectFacts(folder) : { name: null, targetId: null }),
      });
    }
    return { root, modpack, members };
  };

  const writeModpack = async (root: string, modpack: Modpack): Promise<void> => {
    // Round-trip through the parser so only a valid file is ever written.
    const text = serialiseModpack(parseModpack(serialiseModpack(modpack)));
    await deps.writeFileAtomic(join(root, MODPACK_FILE), new TextEncoder().encode(text));
  };

  return {
    async list() {
      const out: ModpackListEntry[] = [];
      for (const root of await deps.settings.modpackRoots()) {
        try {
          out.push({ root, name: (await readFileOf(root)).name, found: true });
        } catch {
          out.push({ root, name: null, found: false });
        }
      }
      return out;
    },

    async create(name, targetId) {
      const picked = await deps.pickDirectory({
        title: 'Choose an empty folder for the modpack',
        mustBeEmpty: true,
      });
      if (picked === null) return null;
      if (!isAbsolute(picked)) throw new Error('The modpack folder must be an absolute path.');
      const root = normalize(picked);
      if (await isFile(join(root, MODPACK_FILE))) {
        throw new Error('That folder already holds a modpack: use Add existing modpack instead.');
      }
      const modpack = createModpack(name.trim() === '' ? 'My modpack' : name.trim(), targetId);
      await writeModpack(root, modpack);
      await deps.settings.addModpackRoot(root);
      return view(root, modpack);
    },

    async addExisting() {
      const picked = await deps.pickDirectory({ title: 'Choose a modpack folder' });
      if (picked === null) return null;
      const root = normalize(picked);
      const modpack = await readFileOf(root);
      await deps.settings.addModpackRoot(root);
      return view(root, modpack);
    },

    async forget(root) {
      await deps.settings.removeModpackRoot(root);
    },

    async read(root) {
      const match = await known(root);
      return view(match, await readFileOf(match));
    },

    async write(root, modpack) {
      const match = await known(root);
      await writeModpack(match, modpack);
      return view(match, await readFileOf(match));
    },

    async addProject(root, projectRoot) {
      const match = await known(root);
      const chosen =
        projectRoot ?? (await deps.pickDirectory({ title: 'Choose a project folder to add' }));
      if (chosen === null) return null;
      if (!isAbsolute(chosen)) throw new Error('The project folder must be an absolute path.');
      const folder = normalize(chosen);
      if (!(await isFile(join(folder, PROJECT_FILE)))) {
        throw new Error(`${folder} is not an MCSuperMods project (it has no ${PROJECT_FILE}).`);
      }
      const rel = relative(match, folder);
      // Relative when on the same drive (`relative` gives an absolute path otherwise).
      const path = rel === '' ? '.' : isAbsolute(rel) ? posix(folder) : posix(rel);
      if (!isModpackProjectPath(path)) {
        throw new Error('A modpack cannot list its own folder as a project.');
      }
      const modpack = await readFileOf(match);
      if (modpack.projects.some((entry) => key(memberRoot(match, entry.path)) === key(folder))) {
        throw new Error('That project is already in the modpack.');
      }
      const next = { ...modpack, projects: [...modpack.projects, { path }] };
      await writeModpack(match, next);
      return view(match, next);
    },

    async readProject(root, path) {
      const match = await known(root);
      const modpack = await readFileOf(match);
      if (!modpack.projects.some((entry) => entry.path === path)) {
        throw new Error(`${path} is not a project of this modpack.`);
      }
      const folder = memberRoot(match, path);
      if (!(await isFile(join(folder, PROJECT_FILE)))) {
        throw new Error(`The project ${path} was not found.`);
      }
      const files: ProjectSnapshotFile[] = [
        { path: PROJECT_FILE, data: new Uint8Array(await readFile(join(folder, PROJECT_FILE))) },
      ];
      let bytes = files[0]?.data.byteLength ?? 0;
      const walk = async (absolute: string, rel: string): Promise<void> => {
        for (const entry of await readdir(absolute, { withFileTypes: true })) {
          // Symbolic links are skipped: a snapshot never leaves the project folder.
          if (entry.isSymbolicLink()) continue;
          const childRel = `${rel}/${entry.name}`;
          const childAbs = join(absolute, entry.name);
          if (entry.isDirectory()) {
            await walk(childAbs, childRel);
          } else if (entry.isFile()) {
            const data = new Uint8Array(await readFile(childAbs));
            bytes += data.byteLength;
            files.push({ path: childRel, data });
            if (files.length > SNAPSHOT_MAX_FILES || bytes > SNAPSHOT_MAX_BYTES) {
              throw new Error(`The project ${path} is too large to build in a modpack.`);
            }
          }
        }
      };
      for (const name of SNAPSHOT_FOLDERS) {
        if (await isDirectory(join(folder, name))) await walk(join(folder, name), name);
      }
      return files;
    },

    async lookupMod(input, gameVersion) {
      try {
        return await resolveModrinthMod(download, input, gameVersion);
      } catch (error) {
        if (error instanceof ModrinthLookupError) throw new Error(error.message);
        throw error;
      }
    },
  };
}
